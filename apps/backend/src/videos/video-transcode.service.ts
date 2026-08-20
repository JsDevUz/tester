import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { VideoPlaybackService } from './video-playback.service';

@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly playbackService: VideoPlaybackService,
  ) {}

  private segmentSeconds() {
    return Number(this.configService.get<string>('VIDEO_HLS_SEGMENT_SECONDS') || 6);
  }

  private async runFfmpeg(args: string[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-2000) || `ffmpeg exited with ${code}`));
      });
    });
  }

  /**
   * Source height, so the ladder is built from what the video actually is.
   *
   * Returns null when probing fails; the caller then treats the source as 1080p, which is the
   * safe assumption -- capping means a smaller source still will not be upscaled.
   */
  private async probeHeight(sourcePath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const child = spawn(
        'ffprobe',
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=height',
          '-of', 'csv=p=0',
          sourcePath,
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk.toString();
      });
      child.on('error', () => resolve(null));
      child.on('close', () => {
        const height = Number.parseInt(out.trim(), 10);
        resolve(Number.isFinite(height) && height > 0 ? height : null);
      });
    });
  }

  async process(blockId: string): Promise<void> {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video' || !block.sourceKey) return;

    const workDir = join('/tmp/video-jobs', blockId);
    try {
      await db
        .update(contentBlocks)
        .set({ processingStatus: 'processing', errorMessage: null })
        .where(eq(contentBlocks.id, blockId));
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });

      const sourceExt = extname(block.fileName || '') || '.mp4';
      const sourcePath = join(workDir, `source${sourceExt}`);
      await pipeline(await this.storageService.getObjectStream(block.sourceKey), createWriteStream(sourcePath));

      const key = randomBytes(16);
      const keyPath = join(workDir, 'aes.key');
      const keyInfoPath = join(workDir, 'keyinfo.txt');
      const keyUri = `/videos/${blockId}/key`;
      await fs.writeFile(keyPath, key);
      await fs.writeFile(keyInfoPath, `${keyUri}\n${keyPath}\n`);

      const manifestPath = join(workDir, 'master.m3u8');
      const segmentSeconds = this.segmentSeconds();
      const fps = 25;

      // One rendition meant a phone on a weak connection had nothing to fall back to but the
      // full-bitrate stream, which is the main reason video stalls on mobile. Three renditions
      // let the player start low and climb, and let a viewer pick a quality by hand.
      //
      // Heights are capped, never upscaled: a 480p source stays 480p rather than being blown
      // up to 1080p, which would cost bitrate for no picture.
      const sourceHeight = (await this.probeHeight(sourcePath)) ?? 1080;
      const ladder = [
        { height: 1080, videoBitrate: '3500k', maxrate: '3900k', bufsize: '7000k', audioBitrate: '128k' },
        { height: 720, videoBitrate: '2000k', maxrate: '2200k', bufsize: '4000k', audioBitrate: '128k' },
        { height: 480, videoBitrate: '900k', maxrate: '1000k', bufsize: '1800k', audioBitrate: '96k' },
      ];
      // Only rungs the source can actually fill. A 480p upload would otherwise be encoded
      // three times at the same resolution -- triple the storage and CPU for one picture.
      // The lowest rung is always kept so there is something to fall back to on a weak
      // connection, even for a small source.
      const applicable = ladder.filter((r) => r.height <= sourceHeight);
      const renditions = applicable.length > 0 ? applicable : [ladder[ladder.length - 1]];

      const scaleFilters = renditions
        .map(
          (r, index) =>
            `[0:v]scale=-2:'min(${r.height},ih)':force_original_aspect_ratio=decrease[v${index}]`,
        )
        .join(';');

      const args: string[] = ['-y', '-i', sourcePath, '-filter_complex', `${scaleFilters}`];

      renditions.forEach((r, index) => {
        args.push(
          '-map', `[v${index}]`,
          '-map', 'a:0?',
          `-c:v:${index}`, 'libx264',
          `-preset`, 'veryfast',
          // Without an explicit cap x264 chases quality and produces bitrates far above what
          // the rendition promises, which defeats the point of having a ladder.
          `-b:v:${index}`, r.videoBitrate,
          `-maxrate:v:${index}`, r.maxrate,
          `-bufsize:v:${index}`, r.bufsize,
          `-c:a:${index}`, 'aac',
          `-b:a:${index}`, r.audioBitrate,
          `-ac`, '2',
        );
      });

      args.push(
        // Keyframes exactly on segment boundaries. x264's default GOP of 250 frames made
        // actual segments longer than requested, delaying the first frame and preventing
        // clean switching between renditions.
        '-g', String(segmentSeconds * fps),
        '-keyint_min', String(segmentSeconds * fps),
        '-sc_threshold', '0',
        '-force_key_frames', `expr:gte(t,n_forced*${segmentSeconds})`,
        '-f', 'hls',
        '-hls_time', String(segmentSeconds),
        '-hls_playlist_type', 'vod',
        // fMP4 rather than MPEG-TS: smaller, and the only container iOS can open as a
        // standalone file, which is what unlocks offline playback there.
        '-hls_segment_type', 'fmp4',
        '-hls_fmp4_init_filename', 'init_%v.mp4',
        '-hls_key_info_file', keyInfoPath,
        '-hls_segment_filename', join(workDir, 'stream_%v_%03d.m4s'),
        '-master_pl_name', 'master.m3u8',
        '-var_stream_map', renditions.map((_, index) => `v:${index},a:${index}`).join(' '),
        join(workDir, 'stream_%v.m3u8'),
      );

      await this.runFfmpeg(args);

      const baseKey = `videos/${block.lessonId}/${block.id}/hls`;
      const keyRef = `videos/${block.lessonId}/${block.id}/keys/aes.key`;
      const masterKey = `${baseKey}/master.m3u8`;
      const manifest = await fs.readFile(manifestPath, 'utf8');
      // The master playlist now lists renditions, not segments, so its #EXTINF lines are gone.
      // Duration comes from any one variant -- they all cover the same source.
      const firstVariant = await fs.readFile(join(workDir, 'stream_0.m3u8'), 'utf8');
      const durationSec = Math.ceil(
        [...firstVariant.matchAll(/#EXTINF:([0-9.]+)/g)].reduce((total, match) => total + Number(match[1]), 0),
      );

      await this.storageService.uploadBuffer(keyRef, key, 'application/octet-stream', 'private, max-age=0, no-store');
      await this.storageService.uploadBuffer(
        masterKey,
        Buffer.from(manifest),
        'application/vnd.apple.mpegurl',
        'private, max-age=0, no-store',
      );

      // Poster frame: without one the player is a black rectangle until the first segment
      // decodes, which reads as the video being slow even when it is not. Grabbing it here
      // costs one extra ffmpeg pass over an already-local file. A failure is non-fatal -- the
      // video is perfectly playable without a poster.
      let posterUrl: string | null = null;
      try {
        const posterPath = join(workDir, 'poster.jpg');
        await this.runFfmpeg([
          '-y',
          '-ss',
          '1',
          '-i',
          sourcePath,
          '-frames:v',
          '1',
          '-vf',
          'scale=640:-2',
          '-q:v',
          '4',
          posterPath,
        ]);
        const posterKey = `${baseKey}/poster.jpg`;
        await this.storageService.uploadBuffer(
          posterKey,
          await fs.readFile(posterPath),
          'image/jpeg',
          'public, max-age=86400, immutable',
        );
        posterUrl = this.storageService.getPublicUrl(posterKey);
      } catch (posterError) {
        this.logger.warn(
          `Poster frame could not be produced for ${blockId}: ${posterError instanceof Error ? posterError.message : String(posterError)}`,
        );
      }

      // Everything the players need: variant playlists, the fMP4 init segments that carry the
      // codec setup, and the media segments themselves.
      const files = await fs.readdir(workDir);
      const uploadable = files.filter(
        (name) =>
          (name.startsWith('stream_') && (name.endsWith('.m4s') || name.endsWith('.m3u8'))) ||
          (name.startsWith('init_') && name.endsWith('.mp4')),
      );
      for (const file of uploadable) {
        const contentType = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp4';
        await this.storageService.uploadBuffer(
          `${baseKey}/${basename(file)}`,
          await fs.readFile(join(workDir, file)),
          contentType,
          'private, max-age=3600',
        );
      }

      await db
        .update(contentBlocks)
        .set({
          processingStatus: 'ready',
          hlsMasterKey: masterKey,
          hlsBaseKey: baseKey,
          aesKeyRef: keyRef,
          durationSec: durationSec || null,
          ...(posterUrl ? { previewUrl: posterUrl } : {}),
          errorMessage: null,
          processedAt: new Date(),
        })
        .where(eq(contentBlocks.id, blockId));

      // A re-transcode overwrites master.m3u8 at the same key, so the cached copy is now
      // stale -- drop it or playback keeps serving the previous version's segment list.
      this.playbackService.invalidateManifest(baseKey);
    } catch (error) {
      this.logger.error(`Video transcode failed: ${blockId}`, error instanceof Error ? error.stack : String(error));
      await db
        .update(contentBlocks)
        .set({
          processingStatus: 'failed',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Video processing failed',
        })
        .where(eq(contentBlocks.id, blockId));
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}
