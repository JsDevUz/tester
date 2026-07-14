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

@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
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

      const segmentPattern = join(workDir, 'segment_%03d.ts');
      const manifestPath = join(workDir, 'master.m3u8');

      await this.runFfmpeg([
        '-y',
        '-i',
        sourcePath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-c:a',
        'aac',
        '-hls_time',
        String(this.segmentSeconds()),
        '-hls_playlist_type',
        'vod',
        '-hls_key_info_file',
        keyInfoPath,
        '-hls_segment_filename',
        segmentPattern,
        manifestPath,
      ]);

      const baseKey = `videos/${block.lessonId}/${block.id}/hls`;
      const keyRef = `videos/${block.lessonId}/${block.id}/keys/aes.key`;
      const masterKey = `${baseKey}/master.m3u8`;
      const manifest = await fs.readFile(manifestPath, 'utf8');
      const durationSec = Math.ceil(
        [...manifest.matchAll(/#EXTINF:([0-9.]+)/g)].reduce((total, match) => total + Number(match[1]), 0),
      );

      await this.storageService.uploadBuffer(keyRef, key, 'application/octet-stream', 'private, max-age=0, no-store');
      await this.storageService.uploadBuffer(
        masterKey,
        Buffer.from(manifest),
        'application/vnd.apple.mpegurl',
        'private, max-age=0, no-store',
      );

      const files = await fs.readdir(workDir);
      for (const file of files.filter((name) => name.endsWith('.ts'))) {
        await this.storageService.uploadBuffer(
          `${baseKey}/${basename(file)}`,
          await fs.readFile(join(workDir, file)),
          'video/mp2t',
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
          errorMessage: null,
          processedAt: new Date(),
        })
        .where(eq(contentBlocks.id, blockId));
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
