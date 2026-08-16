# Video Subtitles (Teacher Upload + Student Toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers upload a `.srt` subtitle file to a lesson video block (web only), and let students toggle captions on/off while watching that video (web + mobile).

**Architecture:** Two new nullable columns on `content_blocks` (`subtitleKey`, `subtitleFileName`). A new backend upload/delete endpoint pair converts uploaded `.srt` text to WebVTT (pure string transform, no ffmpeg) and stores it in S3 next to the video's HLS assets, served as a plain public URL. The existing `startPlayback` response (already called by both players before video load) gains a `subtitleUrl` field so no new network round-trip is needed on the playback side. The web player adds a native `<track>` element; the mobile player adds `react-native-video`'s `textTracks` prop. Both add a small CC toggle button next to their existing fullscreen button.

**Tech Stack:** NestJS + Drizzle ORM + S3-compatible storage (backend), React + Zustand + axios + hls.js (frontend web), React Native + react-native-video (mobile).

**Spec:** `docs/superpowers/specs/2026-08-16-video-subtitles-design.md`

## Global Constraints

- One subtitle file per video block — no multi-language support.
- Manual `.srt` upload only — no auto-generated (ASR) subtitles.
- Storage format is WebVTT; the backend converts uploaded `.srt` to `.vtt` server-side using plain text transformation (no ffmpeg, no AI).
- Subtitle files are served as plain public S3 URLs — no signed-token gating (unlike the video manifest/segments/key).
- Subtitle upload is teacher-only and web-only — the mobile app has no lesson-content-authoring surface at all, so no mobile upload UI is built.
- Max upload size for `.srt` files: 2MB.
- All new user-facing error/status strings are in Uzbek, matching the existing codebase convention.

---

## File Structure

**Backend:**
- Modify: `apps/backend/src/db/schema.ts` — add `subtitleKey`, `subtitleFileName` columns to `contentBlocks`.
- Create: `apps/backend/src/videos/srt-to-vtt.ts` — pure `srtToVtt(srtText: string): string` conversion function.
- Create: `apps/backend/src/videos/srt-to-vtt.spec.ts` — unit tests for the conversion function.
- Modify: `apps/backend/src/videos/video-upload.service.ts` — add `uploadSubtitle()` and `removeSubtitle()` methods.
- Modify: `apps/backend/src/videos/video-upload.service.spec.ts` — add test cases for the two new methods.
- Modify: `apps/backend/src/videos/videos.controller.ts` — add `POST /blocks/:blockId/subtitles` and `DELETE /blocks/:blockId/subtitles` routes.
- Modify: `apps/backend/src/videos/video-playback.service.ts` — add `subtitleUrl` to `startPlayback()`'s response.

**Frontend (web):**
- Modify: `apps/frontend/src/api/contentBlocks.ts` — add `subtitleKey`/`subtitleFileName` to `ApiContentBlock`, add `subtitleUrl` to the playback response type, add `apiUploadSubtitle()`/`apiDeleteSubtitle()`.
- Modify: `apps/frontend/src/stores/courseTypes.ts` — add `subtitleKey`/`subtitleFileName` to `ContentBlock`, add `uploadSubtitleBlock`/`removeSubtitleBlock` to the `CourseStore` interface.
- Modify: `apps/frontend/src/stores/slices/courseHelpers.ts` — map the two new fields in `toFrontendBlock`.
- Modify: `apps/frontend/src/stores/courseStore.ts` — implement `uploadSubtitleBlock`/`removeSubtitleBlock`.
- Modify: `apps/frontend/src/components/course/ContentBlockView.tsx` — add subtitle upload/remove UI + two new props.
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx` — wire the two new props to the store actions.
- Modify: `apps/frontend/src/components/course/HlsVideoPlayer.tsx` — add `<track>` + CC toggle button.

**Mobile:**
- Modify: `apps/mobile/src/api/videos.ts` — add `subtitleUrl` to the playback response type.
- Modify: `apps/mobile/src/components/HlsVideoPlayer.tsx` — add `textTracks`/`selectedTextTrack` + CC toggle button.

---

### Task 1: Backend — schema columns + SRT→VTT conversion function

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/src/videos/srt-to-vtt.ts`
- Test: `apps/backend/src/videos/srt-to-vtt.spec.ts`

**Interfaces:**
- Produces: `export function srtToVtt(srtText: string): string` — throws `Error('Malformed SRT: no cues found')` if the input contains no `-->` timing arrow after normalization. Consumed by Task 2.
- Produces: `contentBlocks.subtitleKey: text('subtitle_key') | null` and `contentBlocks.subtitleFileName: text('subtitle_file_name') | null` on the Drizzle schema. Consumed by Tasks 2 and 3.

- [ ] **Step 1: Add the two new columns to the schema**

Open `apps/backend/src/db/schema.ts` and find the `contentBlocks` table definition (existing columns include `hlsMasterKey`, `hlsBaseKey`, `aesKeyRef`, `durationSec`). Add two new lines immediately after `aesKeyRef`:

```ts
  aesKeyRef: text('aes_key_ref'),
  subtitleKey: text('subtitle_key'),
  subtitleFileName: text('subtitle_file_name'),
  durationSec: integer('duration_sec'),
```

- [ ] **Step 2: Generate and review the migration**

Run: `cd apps/backend && npm run db:generate`

This creates a new file under `apps/backend/drizzle/migrations/` (auto-numbered, e.g. `0031_<random-name>.sql`). Open the generated file and confirm it contains exactly two `ALTER TABLE "content_blocks" ADD COLUMN` statements for `subtitle_key` and `subtitle_file_name`, both nullable `text`, nothing else. Do not hand-edit the file.

- [ ] **Step 3: Apply the migration to the local dev database**

Run: `cd apps/backend && npm run db:migrate`

Expected: command exits 0, no errors.

- [ ] **Step 4: Write the failing tests for `srtToVtt`**

Create `apps/backend/src/videos/srt-to-vtt.spec.ts`:

```ts
import { srtToVtt } from './srt-to-vtt';

describe('srtToVtt', () => {
  it('converts a valid multi-cue SRT to WebVTT', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,500',
      'Salom, bugun darsni boshlaymiz.',
      '',
      '2',
      '00:00:05,200 --> 00:00:08,000',
      'Birinchi mavzu.',
      '',
    ].join('\n');

    const vtt = srtToVtt(srt);

    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500');
    expect(vtt).toContain('Salom, bugun darsni boshlaymiz.');
    expect(vtt).toContain('00:00:05.200 --> 00:00:08.000');
    expect(vtt).toContain('Birinchi mavzu.');
    expect(vtt).not.toContain(',000 -->');
  });

  it('strips a UTF-8 BOM if present', () => {
    const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nSalom\n';
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).not.toContain('﻿');
  });

  it('normalizes CRLF line endings to LF', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nSalom\r\n';
    const vtt = srtToVtt(srt);
    expect(vtt).not.toContain('\r');
  });

  it('throws on malformed input with no timing arrows', () => {
    expect(() => srtToVtt('this is not a subtitle file')).toThrow(
      'Malformed SRT: no cues found',
    );
  });

  it('throws on empty input', () => {
    expect(() => srtToVtt('')).toThrow('Malformed SRT: no cues found');
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest src/videos/srt-to-vtt.spec.ts`
Expected: FAIL — `Cannot find module './srt-to-vtt'`.

- [ ] **Step 6: Implement `srtToVtt`**

Create `apps/backend/src/videos/srt-to-vtt.ts`:

```ts
// SRT and WebVTT share the same cue structure (index, timing line, text
// lines, blank-line-separated). The only real differences: WebVTT needs a
// "WEBVTT" header and uses "." instead of "," as the millisecond separator
// in timing lines. No ffmpeg or AI involved — this is a pure text transform.
export function srtToVtt(srtText: string): string {
  const normalized = srtText
    .replace(/^﻿/, '') // strip UTF-8 BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalized.includes('-->')) {
    throw new Error('Malformed SRT: no cues found');
  }

  const withVttTimings = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );

  return `WEBVTT\n\n${withVttTimings.trim()}\n`;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest src/videos/srt-to-vtt.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations apps/backend/src/videos/srt-to-vtt.ts apps/backend/src/videos/srt-to-vtt.spec.ts
git commit -m "feat(backend): add subtitle columns and SRT-to-VTT conversion"
```

---

### Task 2: Backend — upload/remove subtitle service methods

**Files:**
- Modify: `apps/backend/src/videos/video-upload.service.ts`
- Modify: `apps/backend/src/videos/video-upload.service.spec.ts`

**Interfaces:**
- Consumes: `srtToVtt(srtText: string): string` from Task 1. `storageService.uploadBuffer(key, buffer, contentType, cacheControl?)`, `storageService.deleteFile(key): Promise<boolean>` (both already exist on `StorageService`, already injected into `VideoUploadService`'s constructor per the existing `uploadVideo` method).
- Produces: `videoUploadService.uploadSubtitle(blockId: string, adminId: string, file: Express.Multer.File): Promise<ContentBlockRow>` and `videoUploadService.removeSubtitle(blockId: string, adminId: string): Promise<ContentBlockRow>`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Open `apps/backend/src/videos/video-upload.service.spec.ts`. Add `srtToVtt` is NOT mocked (it's a pure function, safe to run for real in tests). Append these two `describe` blocks at the end of the file, before the final closing (there is no trailing content after the last `});`, so add at file end):

```ts
describe('VideoUploadService.uploadSubtitle', () => {
  beforeEach(() => jest.clearAllMocks());

  const validSrt = Buffer.from(
    '1\n00:00:01,000 --> 00:00:02,000\nSalom\n',
    'utf-8',
  );

  it('SRTni VTTga aylantirib S3ga yuklaydi va blokni yangilaydi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1',
    });
    setupOwnership();
    mockedDb.update.mockReturnValue({
      set: (data: any) => ({
        where: () => ({
          returning: async () => [{ id: 'block-1', ...data }],
        }),
      }),
    });
    const storage = makeStorage();
    const service = new VideoUploadService(storage as any, makeJobService() as any);

    const file = { originalname: 'subs.srt', buffer: validSrt } as Express.Multer.File;
    const result = await service.uploadSubtitle('block-1', 'teacher-1', file);

    expect(storage.uploadBuffer).toHaveBeenCalledWith(
      'videos/lesson-1/block-1/subtitles/subtitle.vtt',
      expect.any(Buffer),
      'text/vtt',
    );
    expect(result.subtitleKey).toBe('videos/lesson-1/block-1/subtitles/subtitle.vtt');
    expect(result.subtitleFileName).toBe('subs.srt');
  });

  it('video bolmagan blok uchun topilmadi xatosi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({ id: 'block-1', type: 'editor' });
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    const file = { originalname: 'subs.srt', buffer: validSrt } as Express.Multer.File;
    await expect(service.uploadSubtitle('block-1', 'teacher-1', file)).rejects.toThrow(NotFoundException);
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1',
    });
    mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'mod-1' });
    mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'mod-1', courseId: 'course-1' });
    mockedDb.query.courses.findFirst.mockResolvedValue(undefined);
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    const file = { originalname: 'subs.srt', buffer: validSrt } as Express.Multer.File;
    await expect(service.uploadSubtitle('block-1', 'begona-teacher', file)).rejects.toThrow(NotFoundException);
  });

  it("noto'g'ri formatdagi SRTni rad etadi", async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1',
    });
    setupOwnership();
    const storage = makeStorage();
    const service = new VideoUploadService(storage as any, makeJobService() as any);
    const badFile = { originalname: 'subs.srt', buffer: Buffer.from('not a subtitle', 'utf-8') } as Express.Multer.File;

    await expect(service.uploadSubtitle('block-1', 'teacher-1', badFile)).rejects.toThrow(BadRequestException);
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
  });
});

describe('VideoUploadService.removeSubtitle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mavjud subtitleni S3dan ochiradi va blokni tozalaydi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1',
      subtitleKey: 'videos/lesson-1/block-1/subtitles/subtitle.vtt',
    });
    setupOwnership();
    mockedDb.update.mockReturnValue({
      set: (data: any) => ({
        where: () => ({
          returning: async () => [{ id: 'block-1', ...data }],
        }),
      }),
    });
    const storage = makeStorage();
    storage.deleteFile = jest.fn().mockResolvedValue(true);
    const service = new VideoUploadService(storage as any, makeJobService() as any);

    const result = await service.removeSubtitle('block-1', 'teacher-1');

    expect(storage.deleteFile).toHaveBeenCalledWith('videos/lesson-1/block-1/subtitles/subtitle.vtt');
    expect(result.subtitleKey).toBeNull();
    expect(result.subtitleFileName).toBeNull();
  });

  it('subtitle mavjud bolmasa S3ni chaqirmaydi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1', subtitleKey: null,
    });
    setupOwnership();
    mockedDb.update.mockReturnValue({
      set: (data: any) => ({
        where: () => ({
          returning: async () => [{ id: 'block-1', ...data }],
        }),
      }),
    });
    const storage = makeStorage();
    storage.deleteFile = jest.fn().mockResolvedValue(true);
    const service = new VideoUploadService(storage as any, makeJobService() as any);

    await service.removeSubtitle('block-1', 'teacher-1');

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', lessonId: 'lesson-1', subtitleKey: null,
    });
    mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'mod-1' });
    mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'mod-1', courseId: 'course-1' });
    mockedDb.query.courses.findFirst.mockResolvedValue(undefined);
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    await expect(service.removeSubtitle('block-1', 'begona-teacher')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest src/videos/video-upload.service.spec.ts`
Expected: FAIL — `service.uploadSubtitle is not a function` / `service.removeSubtitle is not a function`.

- [ ] **Step 3: Implement `uploadSubtitle` and `removeSubtitle`**

Open `apps/backend/src/videos/video-upload.service.ts`. Add the import at the top:

```ts
import { srtToVtt } from './srt-to-vtt';
```

Add these two methods inside the `VideoUploadService` class, after the existing `retry()` method:

```ts
  async uploadSubtitle(blockId: string, adminId: string, file: Express.Multer.File) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    let vttText: string;
    try {
      vttText = srtToVtt(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException("SRT fayl noto'g'ri formatda");
    }

    const subtitleKey = `videos/${block.lessonId}/${block.id}/subtitles/subtitle.vtt`;
    await this.storageService.uploadBuffer(subtitleKey, Buffer.from(vttText, 'utf-8'), 'text/vtt');

    const [updated] = await db
      .update(contentBlocks)
      .set({ subtitleKey, subtitleFileName: file.originalname })
      .where(eq(contentBlocks.id, blockId))
      .returning();
    return updated;
  }

  async removeSubtitle(blockId: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    if (block.subtitleKey) {
      await this.storageService.deleteFile(block.subtitleKey);
    }

    const [updated] = await db
      .update(contentBlocks)
      .set({ subtitleKey: null, subtitleFileName: null })
      .where(eq(contentBlocks.id, blockId))
      .returning();
    return updated;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest src/videos/video-upload.service.spec.ts`
Expected: PASS, all tests including the new ones (11 total: 4 existing `initiateUpload` + 5 existing `completeUpload` + 4 new `uploadSubtitle` + 3 new `removeSubtitle`).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/videos/video-upload.service.ts apps/backend/src/videos/video-upload.service.spec.ts
git commit -m "feat(backend): add subtitle upload/remove to VideoUploadService"
```

---

### Task 3: Backend — controller routes + playback response field

**Files:**
- Modify: `apps/backend/src/videos/videos.controller.ts`
- Modify: `apps/backend/src/videos/video-playback.service.ts`

**Interfaces:**
- Consumes: `videoUploadService.uploadSubtitle`/`removeSubtitle` from Task 2.
- Produces: `POST /blocks/:blockId/subtitles` (multipart, field name `file`), `DELETE /blocks/:blockId/subtitles`. `POST /videos/:blockId/play` response now includes `subtitleUrl: string | null`. Consumed by Task 4 (frontend) and Task 6 (mobile).

- [ ] **Step 1: Add the two routes to `VideosController`**

Open `apps/backend/src/videos/videos.controller.ts`. Add this import alongside the existing ones:

```ts
import { Delete } from '@nestjs/common';
```

(Add `Delete` to the existing `@nestjs/common` import list at the top of the file rather than a separate import line — merge it into the existing `import { ... } from '@nestjs/common';` block.)

Add these two routes inside the `VideosController` class, immediately after the existing `retry()` method (after line ~89):

```ts
  @Post('blocks/:blockId/subtitles')
  @Roles('teacher', 'super')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/\.srt$/i.test(file.originalname)) cb(null, true);
        else cb(new BadRequestException('Faqat .srt fayllar qabul qilinadi'), false);
      },
    }),
  )
  uploadSubtitle(
    @Param('blockId') blockId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.videoUploadService.uploadSubtitle(blockId, req.admin.id, file);
  }

  @Delete('blocks/:blockId/subtitles')
  @Roles('teacher', 'super')
  removeSubtitle(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoUploadService.removeSubtitle(blockId, req.admin.id);
  }
```

- [ ] **Step 2: Add `subtitleUrl` to the playback response**

Open `apps/backend/src/videos/video-playback.service.ts`. Find `startPlayback()` (around line 72-93). Change the `return` statement from:

```ts
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      manifestUrl: `/videos/${blockId}/manifest.m3u8?token=${encodeURIComponent(token)}`,
    };
```

to:

```ts
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      manifestUrl: `/videos/${blockId}/manifest.m3u8?token=${encodeURIComponent(token)}`,
      subtitleUrl: block.subtitleKey ? this.storageService.getPublicUrl(block.subtitleKey) : null,
    };
```

Confirm `this.storageService` is already a constructor-injected property on `VideoPlaybackService` (it is — used elsewhere in the same file for `getObjectText`/`getObjectBuffer`/`getObjectStream`).

- [ ] **Step 3: Typecheck the backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full backend video test suite**

Run: `cd apps/backend && npx jest src/videos`
Expected: PASS, all suites (video-upload, video-playback, video-progress).

- [ ] **Step 5: Manual smoke test with a running server**

Run: `cd apps/backend && npm run start:dev` (leave running), then in another terminal, using a real teacher JWT and an existing video `blockId` that is `processingStatus: 'ready'`:

```bash
curl -X POST http://localhost:3000/api/v1/blocks/<blockId>/subtitles \
  -H "Authorization: Bearer <teacher-jwt>" \
  -F "file=@/path/to/sample.srt"
```

Expected: JSON response with `subtitleKey` set to `videos/<lessonId>/<blockId>/subtitles/subtitle.vtt` and `subtitleFileName` set to `sample.srt`.

Then:

```bash
curl -X POST http://localhost:3000/api/v1/videos/<blockId>/play \
  -H "Authorization: Bearer <student-or-teacher-jwt>"
```

Expected: JSON response includes `subtitleUrl` pointing to a working public URL — fetch that URL directly and confirm it returns valid WebVTT text starting with `WEBVTT`.

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/videos/videos.controller.ts apps/backend/src/videos/video-playback.service.ts
git commit -m "feat(backend): add subtitle upload/delete routes and playback subtitleUrl"
```

---

### Task 4: Frontend (web) — types, API client, store actions

**Files:**
- Modify: `apps/frontend/src/api/contentBlocks.ts`
- Modify: `apps/frontend/src/stores/courseTypes.ts`
- Modify: `apps/frontend/src/stores/slices/courseHelpers.ts`
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Consumes: backend routes from Task 3.
- Produces: `apiUploadSubtitle(blockId: string, file: File): Promise<ApiContentBlock>`, `apiDeleteSubtitle(blockId: string): Promise<ApiContentBlock>`, store actions `uploadSubtitleBlock(courseId, moduleId, lessonId, blockId, file): Promise<void>` and `removeSubtitleBlock(courseId, moduleId, lessonId, blockId): Promise<void>`. Consumed by Task 5.

- [ ] **Step 1: Add fields to `ApiContentBlock` and the playback response type**

Open `apps/frontend/src/api/contentBlocks.ts`. In the `ApiContentBlock` interface, add two lines after `aesKeyRef`:

```ts
  aesKeyRef: string | null;
  subtitleKey: string | null;
  subtitleFileName: string | null;
  durationSec: number | null;
```

Change `apiStartVideoPlayback`'s return type from:

```ts
export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{ token: string; manifestUrl: string; expiresAt: string }> {
```

to:

```ts
export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{ token: string; manifestUrl: string; expiresAt: string; subtitleUrl: string | null }> {
```

- [ ] **Step 2: Add `apiUploadSubtitle` and `apiDeleteSubtitle`**

Add these two functions after `apiRetryVideoBlock` in the same file:

```ts
export async function apiUploadSubtitle(blockId: string, file: File): Promise<ApiContentBlock> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post(`/blocks/${blockId}/subtitles`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function apiDeleteSubtitle(blockId: string): Promise<ApiContentBlock> {
  const res = await client.delete(`/blocks/${blockId}/subtitles`);
  return res.data;
}
```

- [ ] **Step 3: Add fields to the frontend `ContentBlock` type and store interface**

Open `apps/frontend/src/stores/courseTypes.ts`. In the `ContentBlock` interface, add two lines after `aesKeyRef`:

```ts
  aesKeyRef?: string;
  subtitleKey?: string;
  subtitleFileName?: string;
  durationSec?: number;
```

In the `CourseStore` interface, add two lines immediately after `retryVideoBlock`:

```ts
  retryVideoBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  uploadSubtitleBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, file: File) => Promise<void>;
  removeSubtitleBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
```

- [ ] **Step 4: Map the new fields in `toFrontendBlock`**

Open `apps/frontend/src/stores/slices/courseHelpers.ts`. In `toFrontendBlock`, add two lines after `aesKeyRef`:

```ts
    aesKeyRef: b.aesKeyRef ?? undefined,
    subtitleKey: b.subtitleKey ?? undefined,
    subtitleFileName: b.subtitleFileName ?? undefined,
    durationSec: b.durationSec ?? undefined,
```

- [ ] **Step 5: Implement the two store actions**

Open `apps/frontend/src/stores/courseStore.ts`. Add `apiUploadSubtitle` and `apiDeleteSubtitle` to the existing import block from `../api/contentBlocks` (alongside `apiRetryVideoBlock`). Add these two actions immediately after the existing `retryVideoBlock` action (which ends around line 1020 — find the closing of its `set({...})` call):

```ts
  uploadSubtitleBlock: async (courseId, moduleId, lessonId, blockId, file) => {
    const row = await apiUploadSubtitle(blockId, file);
    const updated = toFrontendBlock(row);
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
                          : { ...l, blocks: l.blocks.map((b) => (b.id === blockId ? updated : b)) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeSubtitleBlock: async (courseId, moduleId, lessonId, blockId) => {
    const row = await apiDeleteSubtitle(blockId);
    const updated = toFrontendBlock(row);
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
                          : { ...l, blocks: l.blocks.map((b) => (b.id === blockId ? updated : b)) },
                      ),
                    },
              ),
            },
      ),
    });
  },
```

(This duplicates the exact nested-update shape of `retryVideoBlock` — that's the established pattern in this file, not something to abstract away here.)

- [ ] **Step 6: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/api/contentBlocks.ts apps/frontend/src/stores/courseTypes.ts apps/frontend/src/stores/slices/courseHelpers.ts apps/frontend/src/stores/courseStore.ts
git commit -m "feat(frontend): add subtitle upload/remove API client and store actions"
```

---

### Task 5: Frontend (web) — teacher upload UI + student CC toggle

**Files:**
- Modify: `apps/frontend/src/components/course/ContentBlockView.tsx`
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx`
- Modify: `apps/frontend/src/components/course/HlsVideoPlayer.tsx`

**Interfaces:**
- Consumes: `uploadSubtitleBlock`/`removeSubtitleBlock` store actions from Task 4, `apiStartVideoPlayback`'s `subtitleUrl` field from Task 4.

- [ ] **Step 1: Add subtitle upload/remove UI to `ContentBlockView.tsx`**

Open `apps/frontend/src/components/course/ContentBlockView.tsx`. Add `Captions` and `X` (if not already imported — `X` already is) to the lucide-react import list at the top:

```ts
import {
  Film, Image as ImageIcon, Paperclip, LayoutGrid, Radio, ChevronUp, ChevronDown,
  X, Link2, Plus, ArrowUp, ArrowDown, Loader2, ExternalLink, MousePointer2,
  MessageSquareText, Trash2, Captions,
} from 'lucide-react';
```

Add two new props to `ContentBlockViewProps`, immediately after `onRetryVideo?: () => void;`:

```ts
  onRetryVideo?: () => void;
  onUploadSubtitle?: (file: File) => void;
  onRemoveSubtitle?: () => void;
```

Add the same two names to the destructured function parameters:

```ts
export function ContentBlockView({
  index, isFirst, isLast, block, collapsed, onToggleCollapse, onChangeHtml, onChangeEmbedUrl, onChangeLabel,
  onChangeButtonProps, onAddMessageLine, onChangeMessageLine, onRemoveMessageLine, onMoveMessageLine,
  onPickFile, onRemove, onMoveUp, onMoveDown, onRetryVideo, onUploadSubtitle, onRemoveSubtitle,
}: ContentBlockViewProps) {
```

Insert the subtitle control block immediately after the existing player render (after the line `{!block.embedUrl && block.type === 'video' && block.processingStatus === 'ready' && (<HlsVideoPlayer blockId={block.id} />)}`, i.e. right after its closing `)}`):

```tsx
              {!block.embedUrl && block.type === 'video' && block.processingStatus === 'ready' && (
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                  <Captions size={15} className="shrink-0 text-gray-500" />
                  {block.subtitleFileName ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                        {block.subtitleFileName}
                      </span>
                      {onRemoveSubtitle && (
                        <button
                          type="button"
                          onClick={onRemoveSubtitle}
                          className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </>
                  ) : (
                    <label className="flex-1 cursor-pointer text-xs font-semibold text-gray-700 hover:text-gray-900">
                      Subtitle yuklash (.srt)
                      <input
                        type="file"
                        accept=".srt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && onUploadSubtitle) onUploadSubtitle(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
```

- [ ] **Step 2: Wire the two new props in `LessonEditorView.tsx`**

Open `apps/frontend/src/components/course/LessonEditorView.tsx`. Add `uploadSubtitleBlock` and `removeSubtitleBlock` to the destructured `useCourseStore()` call, immediately after `retryVideoBlock,`:

```ts
    retryVideoBlock,
    uploadSubtitleBlock,
    removeSubtitleBlock,
```

Add the two new callback props to the `<ContentBlockView>` instance, immediately after `onRetryVideo={...}`:

```tsx
                      onRetryVideo={() => void retryVideoBlock(courseId, moduleId, lessonId, block.id)}
                      onUploadSubtitle={(file) => void uploadSubtitleBlock(courseId, moduleId, lessonId, block.id, file)}
                      onRemoveSubtitle={() => void removeSubtitleBlock(courseId, moduleId, lessonId, block.id)}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Add subtitle track + CC toggle to `HlsVideoPlayer.tsx`**

Open `apps/frontend/src/components/course/HlsVideoPlayer.tsx`. Add `Captions` to the lucide-react import (check the existing icon import line at the top and add it to that list).

Add two new state variables near the other `useState` declarations (after `const [error, setError] = useState<string | null>(null);`):

```ts
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(false);
```

In the boot `useEffect` (the one calling `apiStartVideoPlayback`), capture the new field. Change:

```ts
        const playback = await apiStartVideoPlayback(blockId);
        if (cancelled || !videoRef.current) return;

        const manifestUrl = `${getApiBaseUrl()}${playback.manifestUrl}`;
```

to:

```ts
        const playback = await apiStartVideoPlayback(blockId);
        if (cancelled || !videoRef.current) return;

        setSubtitleUrl(playback.subtitleUrl);
        const manifestUrl = `${getApiBaseUrl()}${playback.manifestUrl}`;
```

Add a new `useEffect` (anywhere after the other effects, e.g. right after the boot effect) that imperatively toggles the native track's mode, since `<track>` has no on/off prop:

```ts
  useEffect(() => {
    const track = videoRef.current?.textTracks?.[0];
    if (track) track.mode = captionsOn ? 'showing' : 'hidden';
  }, [captionsOn, subtitleUrl]);
```

In the JSX, find the `<video ...>` element (around line 378-385 per prior research) and add a `<track>` child immediately inside it, before the closing `</video>`:

```tsx
          {subtitleUrl && (
            <track kind="subtitles" src={subtitleUrl} srcLang="uz" label="Subtitle" default={false} />
          )}
```

Find the existing fullscreen toggle button in the player controls (search for the button that toggles `isFullscreen`). Add a CC toggle button as a sibling, immediately before it:

```tsx
          {subtitleUrl && (
            <button
              type="button"
              onClick={() => setCaptionsOn((v) => !v)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                captionsOn ? 'bg-white text-black' : 'bg-black/45 text-white'
              }`}
              aria-label="Subtitle"
            >
              <Captions size={16} />
            </button>
          )}
```

(Match this button's exact positioning classes to whatever wrapper the existing fullscreen button uses, so the two sit side by side in the same control row — read the surrounding JSX before inserting to match spacing/`className` conventions exactly.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/frontend && npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `cd apps/frontend && npm run dev`. As a teacher, open a lesson with a `ready` video block, upload a `.srt` file via the new "Subtitle yuklash (.srt)" control, confirm the filename chip appears with a remove (X) button. As a student (or the same teacher preview), reload the lesson, confirm the CC button appears on the video player, click it, confirm captions appear synced to the video; click again, confirm they disappear.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/course/ContentBlockView.tsx apps/frontend/src/components/course/LessonEditorView.tsx apps/frontend/src/components/course/HlsVideoPlayer.tsx
git commit -m "feat(frontend): add teacher subtitle upload UI and student CC toggle"
```

---

### Task 6: Mobile — student CC toggle

**Files:**
- Modify: `apps/mobile/src/api/videos.ts`
- Modify: `apps/mobile/src/components/HlsVideoPlayer.tsx`

**Interfaces:**
- Consumes: `subtitleUrl` field from `POST /videos/:blockId/play`, added in Task 3.

- [ ] **Step 1: Add `subtitleUrl` to the mobile playback response type**

Open `apps/mobile/src/api/videos.ts`. Change:

```ts
export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{token: string; manifestUrl: string; expiresAt: string}> {
```

to:

```ts
export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{token: string; manifestUrl: string; expiresAt: string; subtitleUrl: string | null}> {
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors (this alone won't surface new errors yet since nothing consumes the new field until Step 3).

- [ ] **Step 3: Wire subtitle state and `<Video>` props in `HlsVideoPlayer.tsx`**

Open `apps/mobile/src/components/HlsVideoPlayer.tsx`. Add `Captions` to the `lucide-react-native` import list at the top (alongside `Maximize2`, `Minimize2`, etc.). Add these two imports from `react-native-video`, merging into the existing import line:

```ts
import Video, {
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
  TextTrackType,
  SelectedTrackType,
} from 'react-native-video';
```

Add two new state variables immediately after `const [manifestUrl, setManifestUrl] = useState<string | null>(null);`:

```ts
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(false);
```

In the playback-fetch `useEffect` (the one calling `apiStartVideoPlayback`), capture the new field. Change:

```ts
    apiStartVideoPlayback(blockId)
      .then(playback => {
        if (!cancelled) setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
      })
```

to:

```ts
    apiStartVideoPlayback(blockId)
      .then(playback => {
        if (!cancelled) {
          setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
          setSubtitleUrl(playback.subtitleUrl);
        }
      })
```

Find the `<Video ... />` element (the one with `source={{uri: manifestUrl, ...}}`). Add two new props to it:

```tsx
          <Video
            ref={videoRef}
            source={{uri: manifestUrl, headers: token ? {Authorization: `Bearer ${token}`} : undefined}}
            style={StyleSheet.absoluteFill}
            paused={paused}
            resizeMode="contain"
            textTracks={
              subtitleUrl
                ? [{title: 'Subtitle', language: 'uz', type: TextTrackType.VTT, uri: subtitleUrl}]
                : undefined
            }
            selectedTextTrack={
              captionsOn
                ? {type: SelectedTrackType.TITLE, value: 'Subtitle'}
                : {type: SelectedTrackType.DISABLED}
            }
            onLoad={handleLoad}
            onProgress={handleProgress}
            onEnd={() => {
              closeCurrentRange();
              setPaused(true);
            }}
          />
```

- [ ] **Step 4: Add the CC toggle button**

Find the existing fullscreen toggle `Pressable` (the one with `onPress={() => { resumeTimeRef.current = ...; setIsFullscreen(v => !v); }}`, styled `absolute right-3 top-3 z-20 h-9 w-9 ... rounded-full bg-black/45`). Add a sibling `Pressable` for the CC toggle immediately before it, so it sits to the left of the fullscreen button:

```tsx
              {subtitleUrl && (
                <Pressable
                  onPress={() => setCaptionsOn(v => !v)}
                  className={`absolute right-14 top-3 z-20 h-9 w-9 items-center justify-center rounded-full ${
                    captionsOn ? 'bg-white' : 'bg-black/45'
                  }`}>
                  <Captions size={17} color={captionsOn ? '#000' : '#fff'} />
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  resumeTimeRef.current = currentTimeRef.current;
                  setIsFullscreen(v => !v);
                }}
                className="absolute right-3 top-3 z-20 h-9 w-9 items-center justify-center rounded-full bg-black/45">
                {isFullscreen ? <Minimize2 size={17} color="white" /> : <Maximize2 size={17} color="white" />}
              </Pressable>
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `cd apps/mobile && npx eslint src/components/HlsVideoPlayer.tsx src/api/videos.ts`
Expected: 0 errors (pre-existing warnings, if any, are fine — do not introduce new ones).

- [ ] **Step 7: Manual verification**

Rebuild and run the mobile app on a simulator/device (`npx react-native run-ios` or `run-android`, or reload via the running Metro dev server if already active). Open a lesson video that has a subtitle uploaded (from Task 5's manual test). Confirm the CC button appears next to the fullscreen button. Tap it, confirm captions appear synced to the video; tap again, confirm they disappear.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/api/videos.ts apps/mobile/src/components/HlsVideoPlayer.tsx
git commit -m "feat(mobile): add student subtitle CC toggle to video player"
```

---

## Post-Plan Verification

After all six tasks are complete, run the full check across all three apps to confirm nothing regressed:

```bash
cd apps/backend && npx tsc --noEmit && npx jest
cd apps/frontend && npx tsc -b && npx vitest run
cd apps/mobile && npx tsc --noEmit -p . && npx jest
```

Expected: all three pass with 0 errors and 0 unexpected test failures (any pre-existing unrelated failures, e.g. the known `classroomReducers.test.ts` mobile failure noted earlier in this project's history, are out of scope for this plan and should not be "fixed" as part of it).
