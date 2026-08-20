import { ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules } from '../db/schema';
import { StudentAccessService } from '../payments/student-access.service';
import { StorageService } from '../storage/storage.service';
import type { PlaybackTokenPayload } from './video.types';

@Injectable()
export class VideoPlaybackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly studentAccessService: StudentAccessService,
  ) {}

  private secret() {
    return (
      this.configService.get<string>('VIDEO_PLAYBACK_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'change_me'
    );
  }

  private ttlSeconds() {
    return Number(this.configService.get<string>('VIDEO_PLAYBACK_TOKEN_TTL_SECONDS') || 7200);
  }

  private base64url(value: Buffer | string) {
    return Buffer.from(value).toString('base64url');
  }

  private signPayload(payload: PlaybackTokenPayload): string {
    const body = this.base64url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  verifyToken(token: string, blockId: string): PlaybackTokenPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw new ForbiddenException('Invalid video token');
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid video token');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PlaybackTokenPayload;
    if (payload.blockId !== blockId || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Video token expired');
    }
    return payload;
  }

  private async getVideoContext(blockId: string) {
    const block = await this.getVideoBlock(blockId);
    // One join rather than walking lesson -> module -> course in three sequential round
    // trips. Every video opening paid for all three before the token could be minted.
    const [row] = await db
      .select({ lesson: lessons, module: modules, course: courses })
      .from(lessons)
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(eq(lessons.id, block.lessonId))
      .limit(1);
    if (!row) throw new NotFoundException('Video not found');
    return { block, lesson: row.lesson, module: row.module, course: row.course };
  }

  // Segment/key requests happen once per HLS chunk (every few seconds of playback)
  // and are already authorized by the signed playback token, so unlike
  // getVideoContext() they don't need the lesson/module/course chain.
  private async getVideoBlock(blockId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video not found');
    return block;
  }

  async startPlayback(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const { block, course } = await this.getVideoContext(blockId);
    if (block.processingStatus !== 'ready' || !block.hlsMasterKey) {
      throw new NotFoundException('Video is not ready');
    }
    if (viewer.role === 'student') {
      const hasAccess = await this.studentAccessService.assertStudentLessonAccess(course.id, viewer.id);
      if (!hasAccess) throw new ForbiddenException('Video access denied');
    } else if (viewer.role === 'teacher') {
      const ownedCourse = await db.query.courses.findFirst({
        where: and(eq(courses.id, course.id), eq(courses.adminId, viewer.id)),
      });
      if (!ownedCourse) throw new ForbiddenException('Video access denied');
    }
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds();
    const token = this.signPayload({
      sub: viewer.id,
      role: viewer.role,
      blockId,
      courseId: course.id,
      exp,
      // Carried so segment/key requests verify the HMAC and go straight to storage.
      hlsBaseKey: block.hlsBaseKey ?? undefined,
      aesKeyRef: block.aesKeyRef ?? undefined,
    });
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      manifestUrl: `/videos/${blockId}/manifest.m3u8?token=${encodeURIComponent(token)}`,
      subtitleUrl: block.subtitleKey ? this.storageService.getPublicUrl(block.subtitleKey) : null,
    };
  }

  /**
   * Manifests keyed by storage key, a few KB each. Caching them takes both the context
   * queries and a storage round trip off every playback.
   *
   * The key is derived from the block id, so re-transcoding OVERWRITES the same object rather
   * than writing a new one -- the cache would otherwise keep serving the old manifest. The
   * transcode service calls invalidateManifest to drop it.
   */
  private readonly manifestCache = new Map<string, string>();
  private static readonly MANIFEST_CACHE_LIMIT = 500;

  private async loadManifest(storageKey: string): Promise<string> {
    const cached = this.manifestCache.get(storageKey);
    if (cached !== undefined) return cached;

    const manifest = await this.storageService.getObjectText(storageKey);
    // Cheap bound: drop the oldest entry once the map is full. Map preserves insertion order,
    // so the first key is the oldest.
    if (this.manifestCache.size >= VideoPlaybackService.MANIFEST_CACHE_LIMIT) {
      const oldest = this.manifestCache.keys().next().value;
      if (oldest !== undefined) this.manifestCache.delete(oldest);
    }
    this.manifestCache.set(storageKey, manifest);
    return manifest;
  }

  /** Called after a re-transcode so the next request re-reads the rewritten manifest. */
  invalidateManifest(hlsBaseKey: string): void {
    this.manifestCache.delete(`${hlsBaseKey}/master.m3u8`);
  }

  async getManifest(blockId: string, token: string) {
    const payload = this.verifyToken(token, blockId);
    // hlsBaseKey in the token tells us where the manifest lives without touching the database.
    const masterKey = payload.hlsBaseKey
      ? `${payload.hlsBaseKey}/master.m3u8`
      : (await this.getVideoContext(blockId)).block.hlsMasterKey;
    if (!masterKey) throw new NotFoundException('Manifest not found');
    const manifest = await this.loadManifest(masterKey);
    return this.rewriteManifestUrls(manifest, token);
  }

  /**
   * Points every reference in a playlist at this server, carrying the playback token.
   *
   * Handles both shapes, because both exist in storage:
   *   - single-rendition MPEG-TS (everything transcoded before the ABR change)
   *   - multi-rendition fMP4, where the master lists variant playlists, each variant lists
   *     .m4s segments, and an EXT-X-MAP names the init segment
   *
   * All of them are served through the same /segments/:fileName route, so the rewrite is the
   * same regardless of extension.
   */
  private rewriteManifestUrls(manifest: string, token: string) {
    const encodedToken = encodeURIComponent(token);
    const segmentExtensions = ['.ts', '.m4s', '.mp4', '.m3u8'];

    return manifest
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('#EXT-X-KEY')) {
          return line.replace(/URI="[^"]+"/, `URI="key?token=${encodedToken}"`);
        }

        // fMP4 variants name their init segment here; it is fetched like any other segment.
        if (trimmed.startsWith('#EXT-X-MAP')) {
          return line.replace(
            /URI="([^"]+)"/,
            (_full, uri: string) => `URI="segments/${uri}?token=${encodedToken}"`,
          );
        }

        // Anything else that is not a tag and looks like a file is a segment or a variant
        // playlist -- both are proxied through the same route.
        if (trimmed && !trimmed.startsWith('#') && segmentExtensions.some((ext) => trimmed.endsWith(ext))) {
          return `segments/${trimmed}?token=${encodedToken}`;
        }

        return line;
      })
      .join('\n');
  }

  async getKey(blockId: string, token: string): Promise<Buffer> {
    const payload = this.verifyToken(token, blockId);
    // Tokens issued before the keys were embedded still work; they just pay for the lookup.
    const aesKeyRef = payload.aesKeyRef ?? (await this.getVideoBlock(blockId)).aesKeyRef;
    if (!aesKeyRef) throw new NotFoundException('Video key not found');
    return this.storageService.getObjectBuffer(aesKeyRef);
  }

  async getSegment(blockId: string, fileName: string, token: string): Promise<StreamableFile> {
    const payload = this.verifyToken(token, blockId);
    // The hot path: hundreds of these per lesson. With the key in the token this is HMAC
    // verification plus one storage read -- no database at all.
    const hlsBaseKey = payload.hlsBaseKey ?? (await this.getVideoBlock(blockId)).hlsBaseKey;
    if (!hlsBaseKey) throw new NotFoundException('Video segment not found');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '');
    const stream = await this.storageService.getObjectStream(`${hlsBaseKey}/${safeFileName}`);
    return new StreamableFile(stream);
  }
}
