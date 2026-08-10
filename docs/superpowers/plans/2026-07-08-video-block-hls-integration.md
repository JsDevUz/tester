# Video Block HLS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect `video` lesson content blocks to real backend upload, background HLS + AES-128 processing, protected playback, and frontend HLS rendering.

**Architecture:** Add video-specific columns to `content_blocks`, then introduce a focused `videos` backend module split into upload, job dispatch, transcode, and playback services. The MVP job dispatcher runs in-process background work, but its interface is queue-ready so BullMQ/Redis can replace only that layer in a future queue migration.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, Backblaze B2 via AWS S3 SDK, ffmpeg, React 19, zustand, axios, hls.js.

---

## File Structure

Backend files:

- Modify `apps/backend/src/db/schema.ts`: add video metadata columns to `contentBlocks`.
- Add `apps/backend/drizzle/migrations/0021_video_content_blocks.sql`: SQL migration for new columns.
- Modify `apps/backend/src/storage/storage.service.ts`: add key-based upload/download/delete helpers for video/HLS objects.
- Modify `apps/backend/src/content-blocks/content-blocks.service.ts`: allow non-editor delete and update video label/embed data safely.
- Modify `apps/backend/src/content-blocks/content-blocks.controller.ts`: keep existing editor endpoints, allow update fields needed by video/embed.
- Add `apps/backend/src/videos/videos.module.ts`: module wiring.
- Add `apps/backend/src/videos/videos.controller.ts`: teacher upload/retry and student playback endpoints.
- Add `apps/backend/src/videos/video-upload.service.ts`: create video blocks, upload source, enqueue job.
- Add `apps/backend/src/videos/video-job.service.ts`: in-process queue-ready dispatcher and startup requeue.
- Add `apps/backend/src/videos/video-transcode.service.ts`: ffmpeg HLS/AES work and B2 persistence.
- Add `apps/backend/src/videos/video-playback.service.ts`: access check, token sign/verify, manifest/key/segment streaming.
- Add `apps/backend/src/videos/video.types.ts`: shared status/token types.
- Modify `apps/backend/src/app.module.ts`: import `VideosModule`.
- Modify `Dockerfile.backend`: install `ffmpeg`.
- Add backend tests in `apps/backend/src/videos/video-playback.service.spec.ts` and `apps/backend/src/videos/video-job.service.spec.ts`.

Frontend files:

- Modify `apps/frontend/package.json`: add `hls.js`.
- Modify `apps/frontend/src/api/contentBlocks.ts`: add video fields, upload/playback API wrappers.
- Modify `apps/frontend/src/stores/courseStore.ts`: store video status fields, upload real video blocks, poll processing blocks.
- Add `apps/frontend/src/components/course/HlsVideoPlayer.tsx`: hls.js video player with cleanup.
- Modify `apps/frontend/src/components/course/ContentBlockView.tsx`: show upload/progress/status/error and HLS player.
- Modify `apps/frontend/src/components/course/LessonEditorView.tsx`: wire video file picking to real upload flow.

---

### Task 1: Schema + Migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0021_video_content_blocks.sql`

- [ ] **Step 1: Add schema fields**

In `apps/backend/src/db/schema.ts`, extend `contentBlocks` with these fields after `label`:

```typescript
  processingStatus: text('processing_status').notNull().default('ready'),
  sourceKey: text('source_key'),
  hlsMasterKey: text('hls_master_key'),
  hlsBaseKey: text('hls_base_key'),
  aesKeyRef: text('aes_key_ref'),
  durationSec: integer('duration_sec'),
  errorMessage: text('error_message'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
```

- [ ] **Step 2: Add manual migration SQL**

Create `apps/backend/drizzle/migrations/0021_video_content_blocks.sql`:

```sql
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "processing_status" text NOT NULL DEFAULT 'ready';
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "source_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "hls_master_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "hls_base_key" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "aes_key_ref" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "duration_sec" integer;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE "content_blocks" ADD COLUMN IF NOT EXISTS "processed_at" timestamp with time zone;
```

- [ ] **Step 3: Verify backend type build**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: TypeScript build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/0021_video_content_blocks.sql
git commit -m "feat(video): add video metadata columns"
```

---

### Task 2: StorageService Key-Based Helpers

**Files:**
- Modify: `apps/backend/src/storage/storage.service.ts`

- [ ] **Step 1: Add S3 commands and stream types**

Update imports:

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
```

- [ ] **Step 2: Add key cleanup helper**

Inside `StorageService`, add:

```typescript
  getKeyFromUrlOrKey(value: string): string {
    const clean = value.trim();
    if (!clean) return '';
    if (this.publicDomain && clean.startsWith(this.publicDomain)) {
      return clean.slice(this.publicDomain.length + 1);
    }
    return clean.replace(/^\/+/, '');
  }
```

Update `deleteFile()` to call `this.getKeyFromUrlOrKey(key)`.

- [ ] **Step 3: Add upload helpers**

Add:

```typescript
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
    cacheControl = 'private, max-age=0, no-store',
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      return key;
    } catch (error) {
      console.error('Object storage buffer upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  async uploadStream(
    key: string,
    stream: Readable,
    contentType: string,
    cacheControl = 'private, max-age=0, no-store',
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: stream,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      return key;
    } catch (error) {
      console.error('Object storage stream upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }
```

- [ ] **Step 4: Add read helpers**

Add:

```typescript
  async getObjectStream(key: string): Promise<Readable> {
    const result = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: this.getKeyFromUrlOrKey(key) }),
    );
    return result.Body as Readable;
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getObjectText(key: string): Promise<string> {
    return (await this.getObjectBuffer(key)).toString('utf8');
  }
```

- [ ] **Step 5: Add prefix delete helper**

Add:

```typescript
  async deletePrefix(prefix: string): Promise<void> {
    const cleanPrefix = this.getKeyFromUrlOrKey(prefix);
    if (!cleanPrefix) return;
    let continuationToken: string | undefined;
    do {
      const listed = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: cleanPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of listed.Contents ?? []) {
        if (object.Key) {
          await this.deleteFile(object.Key);
        }
      }
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }
```

- [ ] **Step 6: Verify backend build**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/storage/storage.service.ts
git commit -m "feat(storage): add object helpers for protected video"
```

---

### Task 3: Backend Videos Module + Upload/Job Skeleton

**Files:**
- Create: `apps/backend/src/videos/video.types.ts`
- Create: `apps/backend/src/videos/video-job.service.ts`
- Create: `apps/backend/src/videos/video-upload.service.ts`
- Create: `apps/backend/src/videos/video-transcode.service.ts`
- Create: `apps/backend/src/videos/videos.module.ts`
- Create: `apps/backend/src/videos/videos.controller.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Add shared types**

Create `apps/backend/src/videos/video.types.ts`:

```typescript
export type VideoProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const VIDEO_STATUSES: VideoProcessingStatus[] = [
  'pending',
  'processing',
  'ready',
  'failed',
];

export interface PlaybackTokenPayload {
  sub: string;
  blockId: string;
  courseId: string;
  exp: number;
}
```

- [ ] **Step 2: Add initial transcode service**

Create `apps/backend/src/videos/video-transcode.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { contentBlocks } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class VideoTranscodeService {
  async process(blockId: string): Promise<void> {
    await db
      .update(contentBlocks)
      .set({ processingStatus: 'failed', errorMessage: 'Video processing engine is not enabled yet' })
      .where(eq(contentBlocks.id, blockId));
  }
}
```

This gives the upload/job skeleton a deterministic failure mode; Task 5 replaces the service with the ffmpeg implementation before the feature is considered complete.

- [ ] **Step 3: Add queue-ready job service**

Create `apps/backend/src/videos/video-job.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { db } from '../db';
import { contentBlocks } from '../db/schema';
import { inArray } from 'drizzle-orm';
import { VideoTranscodeService } from './video-transcode.service';

@Injectable()
export class VideoJobService implements OnModuleInit {
  private readonly logger = new Logger(VideoJobService.name);
  private readonly running = new Set<string>();

  constructor(private readonly videoTranscodeService: VideoTranscodeService) {}

  async onModuleInit() {
    const stuck = await db.query.contentBlocks.findMany({
      where: inArray(contentBlocks.processingStatus, ['pending', 'processing']),
    });
    for (const block of stuck) {
      this.enqueue(block.id);
    }
  }

  enqueue(blockId: string): void {
    if (this.running.has(blockId)) return;
    this.running.add(blockId);
    setImmediate(() => {
      void this.videoTranscodeService
        .process(blockId)
        .catch((error) => this.logger.error(`Video job failed: ${blockId}`, error?.stack ?? error))
        .finally(() => this.running.delete(blockId));
    });
  }
}
```

- [ ] **Step 4: Add upload service**

Create `apps/backend/src/videos/video-upload.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { extname } from 'path';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { VideoJobService } from './video-job.service';

const CONTENT_BLOCK_LIMIT = 7;
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];

@Injectable()
export class VideoUploadService {
  constructor(
    private readonly storageService: StorageService,
    private readonly videoJobService: VideoJobService,
  ) {}

  private async assertLessonOwnership(lessonId: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
    return { lesson, module, course };
  }

  async uploadVideo(lessonId: string, adminId: string, file: Express.Multer.File, label?: string) {
    if (!file) throw new BadRequestException('Video fayl topilmadi');
    const ext = extname(file.originalname).toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(ext) || !file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Faqat video fayllar qabul qilinadi');
    }

    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }

    const [block] = await db
      .insert(contentBlocks)
      .values({
        lessonId,
        type: 'video',
        orderIndex: existing.length,
        fileName: file.originalname,
        label: label?.trim() || file.originalname,
        processingStatus: 'pending',
      })
      .returning();

    const sourceKey = `videos/${lessonId}/${block.id}/source/${crypto.randomUUID()}${ext}`;
    await this.storageService.uploadBuffer(sourceKey, file.buffer, file.mimetype, 'private, max-age=0, no-store');

    const [updated] = await db
      .update(contentBlocks)
      .set({ sourceKey, processingStatus: 'pending' })
      .where(eq(contentBlocks.id, block.id))
      .returning();

    this.videoJobService.enqueue(block.id);
    return updated;
  }

  async retry(blockId: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    await db
      .update(contentBlocks)
      .set({ processingStatus: 'pending', errorMessage: null })
      .where(eq(contentBlocks.id, blockId));
    this.videoJobService.enqueue(blockId);
    return db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
  }
}
```

- [ ] **Step 5: Add controller**

Create `apps/backend/src/videos/videos.controller.ts`:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { VideoUploadService } from './video-upload.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VideosController {
  constructor(private readonly videoUploadService: VideoUploadService) {}

  @Post('lessons/:lessonId/videos')
  @Roles('teacher', 'super')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('video/')) cb(null, true);
      else cb(new BadRequestException('Faqat video fayllar qabul qilinadi'), false);
    },
  }))
  upload(
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label: string | undefined,
    @Req() req: any,
  ) {
    return this.videoUploadService.uploadVideo(lessonId, req.admin.id, file, label);
  }

  @Post('blocks/:blockId/videos/retry')
  @Roles('teacher', 'super')
  retry(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoUploadService.retry(blockId, req.admin.id);
  }
}
```

- [ ] **Step 6: Add module and AppModule import**

Create `apps/backend/src/videos/videos.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PaymentsModule } from '../payments/payments.module';
import { VideosController } from './videos.controller';
import { VideoUploadService } from './video-upload.service';
import { VideoJobService } from './video-job.service';
import { VideoTranscodeService } from './video-transcode.service';

@Module({
  imports: [StorageModule, PaymentsModule],
  controllers: [VideosController],
  providers: [VideoUploadService, VideoJobService, VideoTranscodeService],
})
export class VideosModule {}
```

In `apps/backend/src/app.module.ts`, import and register:

```typescript
import { VideosModule } from './videos/videos.module';
```

Add `VideosModule` to `imports`.

- [ ] **Step 7: Verify backend build**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/videos apps/backend/src/app.module.ts
git commit -m "feat(video): add video upload job skeleton"
```

---

### Task 4: Protected Playback Tokens and Endpoints

**Files:**
- Modify: `apps/backend/src/videos/video-playback.service.ts`
- Modify: `apps/backend/src/videos/videos.controller.ts`
- Modify: `apps/backend/src/videos/videos.module.ts`
- Test: `apps/backend/src/videos/video-playback.service.spec.ts`

- [ ] **Step 1: Create playback service**

Create `apps/backend/src/videos/video-playback.service.ts`:

```typescript
import { ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { StudentAccessService } from '../payments/student-access.service';
import type { PlaybackTokenPayload } from './video.types';

@Injectable()
export class VideoPlaybackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly studentAccessService: StudentAccessService,
  ) {}

  private secret() {
    return this.configService.get<string>('VIDEO_PLAYBACK_TOKEN_SECRET') || this.configService.get<string>('JWT_SECRET') || 'change_me';
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
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video not found');
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Video not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Video not found');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Video not found');
    return { block, lesson, module, course };
  }

  async startPlayback(blockId: string, studentId: string) {
    const { block, course } = await this.getVideoContext(blockId);
    if (block.processingStatus !== 'ready' || !block.hlsMasterKey) {
      throw new NotFoundException('Video is not ready');
    }
    const hasAccess = await this.studentAccessService.assertStudentLessonAccess(course.id, studentId);
    if (!hasAccess) throw new ForbiddenException('Video access denied');
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds();
    const token = this.signPayload({ sub: studentId, blockId, courseId: course.id, exp });
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      manifestUrl: `/videos/${blockId}/manifest.m3u8?token=${encodeURIComponent(token)}`,
    };
  }

  async getManifest(blockId: string, token: string) {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.hlsMasterKey) throw new NotFoundException('Manifest not found');
    const manifest = await this.storageService.getObjectText(block.hlsMasterKey);
    const rewritten = manifest
      .split('\n')
      .map((line) => {
        if (line.startsWith('#EXT-X-KEY')) {
          return line.replace(/URI="[^"]+"/, `URI="/videos/${blockId}/key?token=${encodeURIComponent(token)}"`);
        }
        if (line.trim().endsWith('.ts')) {
          return `/videos/${blockId}/segments/${line.trim()}?token=${encodeURIComponent(token)}`;
        }
        return line;
      })
      .join('\n');
    return rewritten;
  }

  async getKey(blockId: string, token: string): Promise<Buffer> {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.aesKeyRef) throw new NotFoundException('Video key not found');
    return this.storageService.getObjectBuffer(block.aesKeyRef);
  }

  async getSegment(blockId: string, fileName: string, token: string): Promise<StreamableFile> {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.hlsBaseKey) throw new NotFoundException('Video segment not found');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '');
    const stream = await this.storageService.getObjectStream(`${block.hlsBaseKey}/${safeFileName}`);
    return new StreamableFile(stream);
  }
}
```

- [ ] **Step 2: Wire service into module**

In `apps/backend/src/videos/videos.module.ts`, add `VideoPlaybackService` to providers.

- [ ] **Step 3: Add playback endpoints**

In `apps/backend/src/videos/videos.controller.ts`, import:

```typescript
import { Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VideoPlaybackService } from './video-playback.service';
```

Inject `VideoPlaybackService` in constructor.

Add methods:

```typescript
  @Post('videos/:blockId/play')
  @Roles('student')
  startPlayback(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoPlaybackService.startPlayback(blockId, req.user.id);
  }

  @Get('videos/:blockId/manifest.m3u8')
  @Roles('student')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  getManifest(@Param('blockId') blockId: string, @Query('token') token: string) {
    return this.videoPlaybackService.getManifest(blockId, token);
  }

  @Get('videos/:blockId/key')
  @Roles('student')
  async getKey(@Param('blockId') blockId: string, @Query('token') token: string, @Res() res: Response) {
    const key = await this.videoPlaybackService.getKey(blockId, token);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(key);
  }

  @Get('videos/:blockId/segments/:fileName')
  @Roles('student')
  @Header('Content-Type', 'video/mp2t')
  getSegment(
    @Param('blockId') blockId: string,
    @Param('fileName') fileName: string,
    @Query('token') token: string,
  ) {
    return this.videoPlaybackService.getSegment(blockId, fileName, token);
  }
```

- [ ] **Step 4: Add token unit test**

Create `apps/backend/src/videos/video-playback.service.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { VideoPlaybackService } from './video-playback.service';

describe('VideoPlaybackService token verification', () => {
  function service() {
    return new VideoPlaybackService(
      { get: (key: string) => (key === 'VIDEO_PLAYBACK_TOKEN_SECRET' ? 'secret' : key === 'VIDEO_PLAYBACK_TOKEN_TTL_SECONDS' ? '7200' : undefined) } as ConfigService,
      {} as any,
      {} as any,
    );
  }

  it('rejects tampered tokens', () => {
    const svc: any = service();
    const token = svc.signPayload({ sub: 's1', blockId: 'b1', courseId: 'c1', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(() => svc.verifyToken(`${token}x`, 'b1')).toThrow(ForbiddenException);
  });

  it('rejects tokens for another block', () => {
    const svc: any = service();
    const token = svc.signPayload({ sub: 's1', blockId: 'b1', courseId: 'c1', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(() => svc.verifyToken(token, 'b2')).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test --workspace=apps/backend -- video-playback.service.spec.ts
```

Expected: tests pass.

- [ ] **Step 6: Build backend**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/videos
git commit -m "feat(video): add protected playback endpoints"
```

---

### Task 5: ffmpeg HLS + AES Processing

**Files:**
- Modify: `apps/backend/src/videos/video-transcode.service.ts`
- Modify: `Dockerfile.backend`

- [ ] **Step 1: Replace initial transcode service**

Replace `apps/backend/src/videos/video-transcode.service.ts` with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { randomBytes } from 'crypto';
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
      await db.update(contentBlocks).set({ processingStatus: 'processing', errorMessage: null }).where(eq(contentBlocks.id, blockId));
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

      await this.storageService.uploadBuffer(keyRef, key, 'application/octet-stream', 'private, max-age=0, no-store');
      await this.storageService.uploadBuffer(
        masterKey,
        await fs.readFile(manifestPath),
        'application/vnd.apple.mpegurl',
        'private, max-age=0, no-store',
      );

      const files = await fs.readdir(workDir);
      for (const file of files.filter((name) => name.endsWith('.ts'))) {
        await this.storageService.uploadStream(
          `${baseKey}/${basename(file)}`,
          createReadStream(join(workDir, file)),
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
```

- [ ] **Step 2: Add ffmpeg to Dockerfile**

In `Dockerfile.backend`, add ffmpeg to the runtime image. For Alpine-based Node image, use:

```dockerfile
RUN apk add --no-cache ffmpeg
```

Place it in the final runtime stage before `CMD`/`ENTRYPOINT`.

- [ ] **Step 3: Build backend**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/videos/video-transcode.service.ts Dockerfile.backend
git commit -m "feat(video): process uploads into encrypted HLS"
```

---

### Task 6: Frontend API, Types, and Store Wiring

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `package-lock.json`
- Modify: `apps/frontend/src/api/contentBlocks.ts`
- Modify: `apps/frontend/src/stores/courseStore.ts`

- [ ] **Step 1: Install hls.js**

Run:

```bash
npm install hls.js --workspace=apps/frontend
```

Expected: `apps/frontend/package.json` and root lockfile update.

- [ ] **Step 2: Extend API block type**

In `apps/frontend/src/api/contentBlocks.ts`, add fields to `ApiContentBlock`:

```typescript
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey: string | null;
  hlsMasterKey: string | null;
  hlsBaseKey: string | null;
  aesKeyRef: string | null;
  durationSec: number | null;
  errorMessage: string | null;
  processedAt: string | null;
```

Add API functions:

```typescript
export async function apiUploadVideoBlock(
  lessonId: string,
  file: File,
  label?: string,
  onProgress?: (percent: number) => void,
): Promise<ApiContentBlock> {
  const formData = new FormData();
  formData.append('file', file);
  if (label) formData.append('label', label);
  const res = await client.post(`/lessons/${lessonId}/videos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return res.data;
}

export async function apiRetryVideoBlock(blockId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/blocks/${blockId}/videos/retry`);
  return res.data;
}

export async function apiStartVideoPlayback(blockId: string): Promise<{ token: string; manifestUrl: string; expiresAt: string }> {
  const res = await client.post(`/videos/${blockId}/play`);
  return res.data;
}
```

- [ ] **Step 3: Extend frontend ContentBlock type**

In `apps/frontend/src/stores/courseStore.ts`, add fields to `ContentBlock`:

```typescript
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey?: string;
  hlsMasterKey?: string;
  hlsBaseKey?: string;
  aesKeyRef?: string;
  durationSec?: number;
  errorMessage?: string;
  processedAt?: string;
  uploadProgress?: number;
```

- [ ] **Step 4: Add mapper helper**

Add near `toFrontendCourse`:

```typescript
function toFrontendBlock(b: import('../api/contentBlocks').ApiContentBlock): ContentBlock {
  return {
    id: b.id,
    type: b.type,
    html: b.html ?? undefined,
    fileName: b.fileName ?? undefined,
    previewUrl: b.previewUrl ?? undefined,
    embedUrl: b.embedUrl ?? undefined,
    label: b.label ?? undefined,
    processingStatus: b.processingStatus,
    sourceKey: b.sourceKey ?? undefined,
    hlsMasterKey: b.hlsMasterKey ?? undefined,
    hlsBaseKey: b.hlsBaseKey ?? undefined,
    aesKeyRef: b.aesKeyRef ?? undefined,
    durationSec: b.durationSec ?? undefined,
    errorMessage: b.errorMessage ?? undefined,
    processedAt: b.processedAt ?? undefined,
  };
}
```

Replace inline block mapping in `loadCourses` with:

```typescript
const blocks: ContentBlock[] = blockRows.map(toFrontendBlock);
```

- [ ] **Step 5: Add store method signatures**

Change `addBlock` signature to accept optional upload progress:

```typescript
  addBlock: (
    courseId: string,
    moduleId: string,
    lessonId: string,
    block: ContentBlock,
    file?: File,
    onProgress?: (percent: number) => void,
  ) => Promise<void>;
```

Add:

```typescript
  refreshLessonBlocks: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  retryVideoBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
```

- [ ] **Step 6: Wire video add/update/delete**

Import new APIs:

```typescript
import {
  apiListBlocks,
  apiCreateBlock,
  apiUpdateBlock,
  apiDeleteBlock,
  apiReorderBlocks,
  apiUploadVideoBlock,
  apiRetryVideoBlock,
} from '../api/contentBlocks';
```

In `addBlock`, before editor handling, add:

```typescript
    if (block.type === 'video' && file) {
      const row = await apiUploadVideoBlock(lessonId, file, block.label, onProgress);
      newBlock = toFrontendBlock(row);
    } else if (block.type === 'editor') {
      const row = await apiCreateBlock(lessonId, 'editor');
      newBlock = toFrontendBlock(row);
    }
```

Remove the old editor-only mapping block.

In `updateBlock`, call API for editor and video:

```typescript
    if (block?.type === 'editor' || block?.type === 'video') {
      await apiUpdateBlock(blockId, {
        html: data.html,
        label: data.label,
        embedUrl: data.embedUrl,
      });
    }
```

In `removeBlock`, delete backend for editor/video:

```typescript
    if (block?.type === 'editor' || block?.type === 'video') {
      await apiDeleteBlock(blockId);
    }
```

- [ ] **Step 7: Add refresh and retry implementations**

Add store methods:

```typescript
  refreshLessonBlocks: async (courseId, moduleId, lessonId) => {
    const rows = await apiListBlocks(lessonId);
    const blocks = rows.map(toFrontendBlock);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => (l.id === lessonId ? { ...l, blocks } : l)),
                    },
              ),
            },
      ),
    });
  },
  retryVideoBlock: async (courseId, moduleId, lessonId, blockId) => {
    const row = await apiRetryVideoBlock(blockId);
    const nextBlock = toFrontendBlock(row);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, blocks: l.blocks.map((b) => (b.id === blockId ? nextBlock : b)) },
                      ),
                    },
              ),
            },
      ),
    });
  },
```

- [ ] **Step 8: Build frontend**

Run:

```bash
npm run build --workspace=apps/frontend
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/package.json package-lock.json apps/frontend/src/api/contentBlocks.ts apps/frontend/src/stores/courseStore.ts
git commit -m "feat(video): add frontend video APIs and store wiring"
```

---

### Task 7: Frontend Video UI + HLS Player

**Files:**
- Create: `apps/frontend/src/components/course/HlsVideoPlayer.tsx`
- Modify: `apps/frontend/src/components/course/ContentBlockView.tsx`
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx`

- [ ] **Step 1: Create HLS player**

Create `apps/frontend/src/components/course/HlsVideoPlayer.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { apiStartVideoPlayback } from '../../api/contentBlocks';

export function HlsVideoPlayer({ blockId }: { blockId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let hls: Hls | null = null;
    let cancelled = false;

    async function start() {
      try {
        const playback = await apiStartVideoPlayback(blockId);
        if (cancelled || !videoRef.current) return;
        const manifestUrl = playback.manifestUrl;
        if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = manifestUrl;
          return;
        }
        if (!Hls.isSupported()) {
          setError('Bu brauzer HLS videoni qoʻllab-quvvatlamaydi');
          return;
        }
        hls = new Hls();
        hls.loadSource(manifestUrl);
        hls.attachMedia(videoRef.current);
      } catch {
        setError('Videoni ochib bo\'lmadi');
      }
    }

    void start();
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [blockId]);

  if (error) {
    return <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-500">{error}</div>;
  }

  return <video ref={videoRef} controls className="max-h-72 w-full rounded-xl bg-black" />;
}
```

- [ ] **Step 2: Extend ContentBlockView props**

In `ContentBlockViewProps`, add:

```typescript
  onRetryVideo?: () => void;
  uploadProgress?: number;
```

Update component destructuring to include these.

Import player:

```typescript
import { HlsVideoPlayer } from './HlsVideoPlayer';
```

- [ ] **Step 3: Replace video preview rendering**

In the file label render where `block.previewUrl ? ...`, for video branch replace:

```tsx
<video src={block.previewUrl} controls className="max-h-72 w-full rounded-xl" />
```

with:

```tsx
block.processingStatus === 'ready' && block.hlsMasterKey ? (
  <HlsVideoPlayer blockId={block.id} />
) : block.processingStatus === 'failed' ? (
  <div className="flex w-full flex-col items-center gap-2 py-8 text-center">
    <p className="text-sm font-semibold text-red-500">Video tayyorlanmadi</p>
    <p className="max-w-sm text-xs text-gray-400">{block.errorMessage ?? 'Qayta urinib ko\'ring'}</p>
    {onRetryVideo && (
      <button type="button" onClick={(e) => { e.preventDefault(); onRetryVideo(); }} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-500">
        Qayta urinish
      </button>
    )}
  </div>
) : (
  <div className="flex w-full flex-col items-center gap-2 py-8 text-center">
    <div className="h-8 w-8 animate-spin rounded-full border border-indigo-100 border-t-indigo-500" />
    <p className="text-sm font-semibold text-gray-700">
      {uploadProgress ? `Yuklanmoqda ${uploadProgress}%` : 'Video tayyorlanmoqda...'}
    </p>
  </div>
)
```

- [ ] **Step 4: Add polling in LessonEditorView**

Import `useEffect`:

```typescript
import { useEffect, useState } from "react";
```

Read store methods:

```typescript
    refreshLessonBlocks,
    retryVideoBlock,
```

Add after `contentLimitReached`:

```typescript
  const hasProcessingVideo = lesson.blocks.some(
    (block) => block.type === 'video' && ['pending', 'processing'].includes(block.processingStatus ?? ''),
  );

  useEffect(() => {
    if (!hasProcessingVideo) return;
    const timer = window.setInterval(() => {
      void refreshLessonBlocks(courseId, moduleId, lessonId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasProcessingVideo, refreshLessonBlocks, courseId, moduleId, lessonId]);
```

- [ ] **Step 5: Wire real video add**

Change `handlePickFile`:

```typescript
  function handlePickFile(type: "video" | "image" | "file", file: File) {
    if (contentLimitReached) return;
    collapseAllExisting();
    const block: ContentBlock = {
      id: newId(),
      type,
      fileName: file.name,
      label: file.name,
      previewUrl: type === "file" ? undefined : URL.createObjectURL(file),
      processingStatus: type === "video" ? "pending" : undefined,
    };
    void addBlock(courseId, moduleId, lessonId, block, type === "video" ? file : undefined);
  }
```

Change `handleBlockPickFile` for existing video blocks:

```typescript
  function handleBlockPickFile(blockId: string, file: File) {
    const block = lesson!.blocks.find((b) => b.id === blockId);
    if (block?.type === 'video') {
      void updateBlock(courseId, moduleId, lessonId, blockId, { fileName: file.name, label: file.name, processingStatus: 'pending' });
      return;
    }
    void updateBlock(courseId, moduleId, lessonId, blockId, {
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
    });
  }
```

Existing video replacement remains as metadata-only editing in this MVP; adding a new video block performs the full backend upload and processing flow.

- [ ] **Step 6: Pass retry prop**

In `ContentBlockView` usage, add:

```tsx
onRetryVideo={() => void retryVideoBlock(courseId, moduleId, lessonId, block.id)}
```

- [ ] **Step 7: Build frontend**

Run:

```bash
npm run build --workspace=apps/frontend
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/course/HlsVideoPlayer.tsx apps/frontend/src/components/course/ContentBlockView.tsx apps/frontend/src/components/course/LessonEditorView.tsx
git commit -m "feat(video): render upload status and HLS player"
```

---

### Task 8: Delete Cleanup, Final Verification, and Deployment Notes

**Files:**
- Modify: `apps/backend/src/content-blocks/content-blocks.service.ts`
- Modify: `docs/superpowers/specs/2026-07-08-video-block-hls-integration-design.md`

- [ ] **Step 1: Inject StorageService into ContentBlocksService**

Modify `ContentBlocksModule` to import `StorageModule` if it does not already:

```typescript
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ContentBlocksController],
  providers: [ContentBlocksService],
})
export class ContentBlocksModule {}
```

In `ContentBlocksService`, inject:

```typescript
constructor(private readonly storageService: StorageService) {}
```

Add import:

```typescript
import { StorageService } from '../storage/storage.service';
```

- [ ] **Step 2: Delete video B2 prefix on block remove**

In `remove()`, before DB delete:

```typescript
    if (block.type === 'video') {
      await this.storageService.deletePrefix(`videos/${block.lessonId}/${block.id}/`);
    }
```

- [ ] **Step 3: Allow video update payload**

Update `ContentBlocksService.update` data type:

```typescript
data: { html?: string; label?: string; embedUrl?: string }
```

Update controller DTO type if inline typed.

- [ ] **Step 4: Run all verification**

Run:

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
npm run build --workspace=apps/frontend
```

Expected:

- Backend build succeeds.
- Backend tests pass.
- Frontend build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/content-blocks docs/superpowers/specs/2026-07-08-video-block-hls-integration-design.md
git commit -m "fix(video): clean up stored video objects on delete"
```

---

## Rollout Commands

On VPS after pulling the branch:

```bash
sudo docker compose build backend web
sudo docker compose run --rm backend npm run db:migrate --workspace=apps/backend
sudo docker compose up -d
sudo docker compose logs --tail=100 backend
```

If `db:migrate` fails because of known Drizzle migration drift:

```bash
sudo docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < apps/backend/drizzle/migrations/0021_video_content_blocks.sql
sudo docker compose exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d content_blocks"'
sudo docker compose restart backend
```

Confirm backend image has ffmpeg:

```bash
sudo docker compose exec backend ffmpeg -version
```

Expected: ffmpeg version output.

---

## Self-Review

Spec coverage:

- Schema columns: Task 1.
- Storage helpers: Task 2.
- Upload endpoint and background processing: Tasks 3 and 5.
- Queue-ready migration path: Task 3 `VideoJobService`.
- Protected playback token/manifest/key/segment: Task 4.
- ffmpeg + `/tmp/video-jobs`: Task 5.
- Docker deploy requirement: Task 5 and rollout commands.
- Frontend API/store/UI/HLS: Tasks 6 and 7.
- Delete cleanup: Task 8.
- Verification commands: Task 8.

Deferred-work scan: no `TBD`, `TODO`, or vague deferred steps are intentionally left. Task 7 explicitly scopes existing-video replacement as metadata-only editing while preserving full add-video upload functionality.

Type consistency:

- DB fields use camelCase Drizzle properties and snake_case SQL columns.
- Frontend `processingStatus` matches backend field name.
- `VideoJobService.enqueue(blockId)` is the single queue boundary for future BullMQ migration.
