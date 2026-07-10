# Video Watch Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track, per student per video content-block, which time ranges have actually been watched (merged, non-overlapping coverage — not just last position), and surface a real "percent watched" plus a segment-highlighted progress strip in `HlsVideoPlayer.tsx`.

**Architecture:** New `video_watch_segments` table stores merged watched ranges per `(contentBlockId, studentId)`. A new `VideoProgressService` (in the existing `videos` module) owns the merge logic and exposes it as a pure, exported function for unit testing. Two new routes on the existing `VideosController` (`POST`/`GET .../watch-progress`) reuse the video module's existing student/teacher access-control pattern (`VideoPlaybackService.getVideoContext` + `StudentAccessService.assertStudentLessonAccess`). `HlsVideoPlayer.tsx` tracks `timeupdate`, periodically posts the growing watched range, and renders a new progress-strip element below the video.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, Jest (backend unit tests), React 19 + TypeScript (frontend, no automated tests — build-clean only).

## Global Constraints

- Percent watched is purely informational — it must not gate lesson completion, "Keyingi dars"/"Amaliyot" advancement, or `maxUnlockedIndex`/unlock logic anywhere in `MyCoursesPage.tsx`.
- No changes to practice/test-taking systems.
- No changes to existing HLS streaming, watermark, or DRM logic in `HlsVideoPlayer.tsx` — additive only.
- No teacher-facing analytics dashboard in this pass.
- Segment merge must be gap-tolerant: existing segments within 2 seconds of the incoming range are merged into one, not left as separate adjacent segments.
- If `contentBlocks.durationSec` is null, `watchedPercent` must be `null` (not computed, not zero).
- Frontend verification for this plan is `cd apps/frontend && npm run build` (0 errors) — no automated frontend tests exist for player/UI components in this codebase.
- Backend verification is `cd apps/backend && npm run build` (0 errors) plus `npm test` (all suites passing, including new ones).

---

## File Structure

- **Modify:** `apps/backend/src/db/schema.ts` — add `videoWatchSegments` table + relations.
- **Create:** `apps/backend/drizzle/migrations/0024_video_watch_segments.sql` — hand-written migration (matches this codebase's established pattern of writing migrations by hand rather than via `drizzle-kit generate`, per the prior lesson-practice plan's precedent).
- **Create:** `apps/backend/src/videos/video-progress.service.ts` — new service: exported pure `mergeWatchSegments` function + `VideoProgressService` class (save/get progress, reusing `VideoPlaybackService`'s access-control pattern).
- **Test:** `apps/backend/src/videos/video-progress.service.spec.ts` — unit tests for `mergeWatchSegments`.
- **Modify:** `apps/backend/src/videos/videos.controller.ts` — add `POST videos/:blockId/watch-progress` and `GET videos/:blockId/watch-progress` routes.
- **Modify:** `apps/backend/src/videos/videos.module.ts` — register `VideoProgressService` as a provider.
- **Modify:** `apps/frontend/src/api/contentBlocks.ts` — add `apiSaveWatchProgress`/`apiGetWatchProgress` API client functions.
- **Modify:** `apps/frontend/src/components/course/HlsVideoPlayer.tsx` — add `timeupdate` tracking, periodic save, and the progress-strip UI.

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0024_video_watch_segments.sql`

**Interfaces:**
- Produces: `videoWatchSegments` Drizzle table export — columns `id, contentBlockId, studentId, startSec, endSec, updatedAt` — consumed by Task 2's service code via `db.query.videoWatchSegments` / `db.insert(videoWatchSegments)` / `db.delete(videoWatchSegments)`.

- [ ] **Step 1: Add the table definition to schema.ts**

Find the end of the `contentBlocksRelations` block in `apps/backend/src/db/schema.ts` (currently ends around line 121, right before `export const practiceBlocks = pgTable(...)`). Insert this new block immediately after `contentBlocksRelations` and before `practiceBlocks`:

```typescript
export const videoWatchSegments = pgTable('video_watch_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentBlockId: uuid('content_block_id').notNull().references(() => contentBlocks.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startSec: integer('start_sec').notNull(),
  endSec: integer('end_sec').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const videoWatchSegmentsRelations = relations(videoWatchSegments, ({ one }) => ({
  contentBlock: one(contentBlocks, { fields: [videoWatchSegments.contentBlockId], references: [contentBlocks.id] }),
}));
```

- [ ] **Step 2: Write the migration file**

Create `apps/backend/drizzle/migrations/0024_video_watch_segments.sql` with this exact content:

```sql
CREATE TABLE IF NOT EXISTS "video_watch_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content_block_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "start_sec" integer NOT NULL,
  "end_sec" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "video_watch_segments"
  ADD CONSTRAINT "video_watch_segments_content_block_id_fkey"
  FOREIGN KEY ("content_block_id") REFERENCES "content_blocks"("id") ON DELETE CASCADE;

ALTER TABLE "video_watch_segments"
  ADD CONSTRAINT "video_watch_segments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "video_watch_segments_content_block_id_student_id_idx"
  ON "video_watch_segments" ("content_block_id", "student_id");
```

- [ ] **Step 3: Apply the migration**

Run: `cd apps/backend && npx drizzle-kit migrate` (or, if the project's existing pattern is to run `psql` directly against the dev database, use whatever this codebase's `package.json` scripts define — check `apps/backend/package.json` for a `db:migrate` script and use it if present; otherwise `npx drizzle-kit migrate` from `apps/backend`).
Expected: migration applies with no errors; a subsequent `psql` check (`\d video_watch_segments`) shows the table with the columns above.

- [ ] **Step 4: Build to verify schema compiles**

Run: `cd apps/backend && npm run build`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/0024_video_watch_segments.sql
git commit -m "feat(db): add video_watch_segments table for per-student watch tracking"
```

---

### Task 2: `mergeWatchSegments` pure function + unit tests

**Files:**
- Create: `apps/backend/src/videos/video-progress.service.ts` (this task only adds the exported pure function and its supporting types — the `VideoProgressService` class with DB/access-control logic is added in Task 3)
- Test: `apps/backend/src/videos/video-progress.service.spec.ts`

**Interfaces:**
- Produces: `export interface WatchSegment { startSec: number; endSec: number }` and `export function mergeWatchSegments(existing: WatchSegment[], incoming: WatchSegment, gapToleranceSec: number): WatchSegment[]` — consumed by Task 3's `VideoProgressService.saveProgress`.
- Produces: `export function computeWatchedPercent(segments: WatchSegment[], durationSec: number | null): number | null` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/videos/video-progress.service.spec.ts`:

```typescript
import { mergeWatchSegments, computeWatchedPercent, type WatchSegment } from './video-progress.service';

describe('mergeWatchSegments', () => {
  it('keeps a new segment separate when it does not overlap or touch any existing one', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 50, endSec: 60 }, 2);
    expect(result).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 60 },
    ]);
  });

  it('merges an incoming segment that exactly overlaps an existing one into a no-op (same range)', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 0, endSec: 10 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 10 }]);
  });

  it('merges an incoming segment that partially overlaps an existing one, extending its range', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 8, endSec: 20 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 20 }]);
  });

  it('merges an incoming segment that is within the gap tolerance of an existing one (adjacent)', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    // gap between 10 and 11 is 1 second, tolerance is 2 -> should merge
    const result = mergeWatchSegments(existing, { startSec: 11, endSec: 15 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 15 }]);
  });

  it('does not merge an incoming segment whose gap exceeds the tolerance', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    // gap between 10 and 13 is 3 seconds, tolerance is 2 -> stays separate
    const result = mergeWatchSegments(existing, { startSec: 13, endSec: 15 }, 2);
    expect(result).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 13, endSec: 15 },
    ]);
  });

  it('is a no-op when the incoming segment is fully inside an existing one', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 100 }];
    const result = mergeWatchSegments(existing, { startSec: 20, endSec: 30 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 100 }]);
  });

  it('merges a segment that bridges two existing separate segments into one', () => {
    const existing: WatchSegment[] = [
      { startSec: 0, endSec: 10 },
      { startSec: 30, endSec: 40 },
    ];
    const result = mergeWatchSegments(existing, { startSec: 9, endSec: 31 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 40 }]);
  });

  it('starts from an empty existing list', () => {
    const result = mergeWatchSegments([], { startSec: 5, endSec: 15 }, 2);
    expect(result).toEqual([{ startSec: 5, endSec: 15 }]);
  });
});

describe('computeWatchedPercent', () => {
  it('returns null when durationSec is null', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 10 }], null)).toBeNull();
  });

  it('returns 0 for no watched segments', () => {
    expect(computeWatchedPercent([], 100)).toBe(0);
  });

  it('computes the percentage from total covered seconds', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 25 }], 100)).toBe(25);
  });

  it('sums multiple non-overlapping segments', () => {
    const segments: WatchSegment[] = [
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 70 },
    ];
    expect(computeWatchedPercent(segments, 100)).toBe(30);
  });

  it('caps the result at 100', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 150 }], 100)).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 33 }], 100)).toBe(33);
    expect(computeWatchedPercent([{ startSec: 0, endSec: 1 }], 3)).toBe(33); // 0.333 -> 33
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest video-progress.service.spec.ts`
Expected: FAIL — `Cannot find module './video-progress.service'` or similar (the file doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `apps/backend/src/videos/video-progress.service.ts` with exactly this content for now (Task 3 will append the `VideoProgressService` class below these exports — do not add anything else in this task):

```typescript
export interface WatchSegment {
  startSec: number;
  endSec: number;
}

export function mergeWatchSegments(
  existing: WatchSegment[],
  incoming: WatchSegment,
  gapToleranceSec: number,
): WatchSegment[] {
  const all = [...existing, incoming].sort((a, b) => a.startSec - b.startSec);
  const merged: WatchSegment[] = [];

  for (const segment of all) {
    const last = merged[merged.length - 1];
    if (last && segment.startSec <= last.endSec + gapToleranceSec) {
      last.endSec = Math.max(last.endSec, segment.endSec);
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

export function computeWatchedPercent(segments: WatchSegment[], durationSec: number | null): number | null {
  if (durationSec === null) return null;
  const totalCovered = segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const percent = (totalCovered / durationSec) * 100;
  return Math.min(100, Math.round(percent));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest video-progress.service.spec.ts`
Expected: PASS, 14/14 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/videos/video-progress.service.ts apps/backend/src/videos/video-progress.service.spec.ts
git commit -m "feat(videos): add mergeWatchSegments/computeWatchedPercent pure functions"
```

---

### Task 3: `VideoProgressService` — DB-integration methods with access control

**Files:**
- Modify: `apps/backend/src/videos/video-progress.service.ts` (append the service class below Task 2's pure functions — do not touch the pure functions themselves)

**Interfaces:**
- Consumes: `mergeWatchSegments`, `computeWatchedPercent`, `WatchSegment` from Task 2 (same file).
- Consumes: `VideoPlaybackService`'s existing (private) access-control logic — since it's private, this task re-derives the same lesson/course context and calls `StudentAccessService.assertStudentLessonAccess` / a teacher-ownership check directly here (duplicating the ~10-line `getVideoContext` pattern is acceptable — extracting it to a shared helper is out of scope for this plan and would touch `VideoPlaybackService`, which this plan does not modify).
- Produces: `export class VideoProgressService { saveProgress(blockId: string, viewer: {id: string; role: 'student'|'teacher'|'super'}, range: WatchSegment): Promise<{watchedPercent: number | null}>; getProgress(blockId: string, viewer: {id: string; role: 'student'|'teacher'|'super'}): Promise<{segments: WatchSegment[]; watchedPercent: number | null}> }` — consumed by Task 4's controller routes.

- [ ] **Step 1: Append the service class**

Add to the end of `apps/backend/src/videos/video-progress.service.ts` (after the `computeWatchedPercent` function from Task 2):

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules, videoWatchSegments } from '../db/schema';
import { StudentAccessService } from '../payments/student-access.service';

const GAP_TOLERANCE_SEC = 2;

@Injectable()
export class VideoProgressService {
  constructor(private readonly studentAccessService: StudentAccessService) {}

  private async assertAccess(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video not found');
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Video not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Video not found');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Video not found');

    if (viewer.role === 'student') {
      const hasAccess = await this.studentAccessService.assertStudentLessonAccess(course.id, viewer.id);
      if (!hasAccess) throw new ForbiddenException('Video access denied');
    } else if (viewer.role === 'teacher') {
      const ownedCourse = await db.query.courses.findFirst({
        where: and(eq(courses.id, course.id), eq(courses.adminId, viewer.id)),
      });
      if (!ownedCourse) throw new ForbiddenException('Video access denied');
    }

    return { block };
  }

  async saveProgress(
    blockId: string,
    viewer: { id: string; role: 'student' | 'teacher' | 'super' },
    range: WatchSegment,
  ) {
    const { block } = await this.assertAccess(blockId, viewer);

    const existingRows = await db.query.videoWatchSegments.findMany({
      where: and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    });
    const existing: WatchSegment[] = existingRows.map((r) => ({ startSec: r.startSec, endSec: r.endSec }));
    const merged = mergeWatchSegments(existing, range, GAP_TOLERANCE_SEC);

    await db.delete(videoWatchSegments).where(
      and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    );
    if (merged.length > 0) {
      await db.insert(videoWatchSegments).values(
        merged.map((s) => ({ contentBlockId: blockId, studentId: viewer.id, startSec: s.startSec, endSec: s.endSec })),
      );
    }

    return { watchedPercent: computeWatchedPercent(merged, block.durationSec) };
  }

  async getProgress(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const { block } = await this.assertAccess(blockId, viewer);

    const rows = await db.query.videoWatchSegments.findMany({
      where: and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    });
    const segments: WatchSegment[] = rows.map((r) => ({ startSec: r.startSec, endSec: r.endSec }));

    return { segments, watchedPercent: computeWatchedPercent(segments, block.durationSec) };
  }
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd apps/backend && npm run build`
Expected: 0 errors.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `cd apps/backend && npm test`
Expected: all suites pass (114 pre-existing + 14 new from Task 2 = 128 total; this task adds no new tests of its own since `VideoProgressService`'s DB-integration methods follow this codebase's established convention of not unit-testing DB-integration services directly — see `PracticeBlocksService`'s CRUD methods for precedent).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/videos/video-progress.service.ts
git commit -m "feat(videos): add VideoProgressService with student/teacher access control"
```

---

### Task 4: Wire routes + module registration

**Files:**
- Modify: `apps/backend/src/videos/videos.controller.ts`
- Modify: `apps/backend/src/videos/videos.module.ts`

**Interfaces:**
- Consumes: `VideoProgressService` from Task 3.
- Produces: `POST videos/:blockId/watch-progress` (body `{startSec: number, endSec: number}`, returns `{watchedPercent: number | null}`), `GET videos/:blockId/watch-progress` (returns `{segments: {startSec, endSec}[], watchedPercent: number | null}`) — consumed by Task 5's frontend API client.

- [ ] **Step 1: Add a validated DTO and the two routes to `videos.controller.ts`**

Add this import near the top of `apps/backend/src/videos/videos.controller.ts` (alongside the existing imports):

```typescript
import { IsInt, Min } from 'class-validator';
import { VideoProgressService } from './video-progress.service';
```

Add this class definition right after the existing imports, before `@UseGuards(JwtAuthGuard, RolesGuard)` / `@Controller()`:

```typescript
class SaveWatchProgressDto {
  @IsInt() @Min(0) startSec: number;
  @IsInt() @Min(0) endSec: number;
}
```

Update the constructor to inject the new service:

```typescript
  constructor(
    private readonly videoUploadService: VideoUploadService,
    private readonly videoPlaybackService: VideoPlaybackService,
    private readonly videoProgressService: VideoProgressService,
  ) {}
```

Add these two methods at the end of the class, right before the final closing `}` of `VideosController` (after the existing `getSegment` method):

```typescript
  @Post('videos/:blockId/watch-progress')
  @Roles('student', 'teacher', 'super')
  saveWatchProgress(@Param('blockId') blockId: string, @Body() dto: SaveWatchProgressDto, @Req() req: any) {
    if (dto.endSec <= dto.startSec) throw new BadRequestException('endSec must be greater than startSec');
    return this.videoProgressService.saveProgress(
      blockId,
      { id: req.user.id, role: req.user.role },
      { startSec: dto.startSec, endSec: dto.endSec },
    );
  }

  @Get('videos/:blockId/watch-progress')
  @Roles('student', 'teacher', 'super')
  getWatchProgress(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoProgressService.getProgress(blockId, { id: req.user.id, role: req.user.role });
  }
```

- [ ] **Step 2: Register `VideoProgressService` in `videos.module.ts`**

Change:
```typescript
import { VideoUploadService } from './video-upload.service';
import { VideosController } from './videos.controller';

@Module({
  imports: [StorageModule, PaymentsModule],
  controllers: [VideosController],
  providers: [VideoUploadService, VideoJobService, VideoTranscodeService, VideoPlaybackService],
})
export class VideosModule {}
```
to:
```typescript
import { VideoUploadService } from './video-upload.service';
import { VideoProgressService } from './video-progress.service';
import { VideosController } from './videos.controller';

@Module({
  imports: [StorageModule, PaymentsModule],
  controllers: [VideosController],
  providers: [VideoUploadService, VideoJobService, VideoTranscodeService, VideoPlaybackService, VideoProgressService],
})
export class VideosModule {}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd apps/backend && npm run build`
Expected: 0 errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd apps/backend && npm test`
Expected: all suites still passing (no new tests added in this task — routes are thin wiring, covered by the pure-function tests in Task 2 and manual QA later).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/videos/videos.controller.ts apps/backend/src/videos/videos.module.ts
git commit -m "feat(videos): wire watch-progress save/get routes"
```

---

### Task 5: Frontend API client

**Files:**
- Modify: `apps/frontend/src/api/contentBlocks.ts`

**Interfaces:**
- Produces: `export interface WatchSegment { startSec: number; endSec: number }`, `export async function apiSaveWatchProgress(blockId: string, startSec: number, endSec: number): Promise<{watchedPercent: number | null}>`, `export async function apiGetWatchProgress(blockId: string): Promise<{segments: WatchSegment[]; watchedPercent: number | null}>` — consumed by Task 6's `HlsVideoPlayer.tsx`.

- [ ] **Step 1: Add the API functions**

Find `apiStartVideoPlayback` in `apps/frontend/src/api/contentBlocks.ts` (around line 87). Add this immediately after it:

```typescript
export interface WatchSegment {
  startSec: number;
  endSec: number;
}

export async function apiSaveWatchProgress(
  blockId: string,
  startSec: number,
  endSec: number,
): Promise<{ watchedPercent: number | null }> {
  const res = await client.post(`/videos/${blockId}/watch-progress`, { startSec, endSec });
  return res.data;
}

export async function apiGetWatchProgress(
  blockId: string,
): Promise<{ segments: WatchSegment[]; watchedPercent: number | null }> {
  const res = await client.get(`/videos/${blockId}/watch-progress`);
  return res.data;
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors. (These functions aren't called anywhere yet, so this only validates the file compiles.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/contentBlocks.ts
git commit -m "feat(api): add watch-progress save/get client functions"
```

---

### Task 6: `HlsVideoPlayer.tsx` — tracking + progress strip UI

**Files:**
- Modify: `apps/frontend/src/components/course/HlsVideoPlayer.tsx` (full current content is 196 lines — read it before editing, since this task inserts new hooks/JSX at specific points rather than rewriting the whole file)

**Interfaces:**
- Consumes: `apiSaveWatchProgress`, `apiGetWatchProgress`, `WatchSegment` from Task 5.
- Consumes: `blockId` prop (already exists on `HlsVideoPlayerProps`).

- [ ] **Step 1: Add new imports**

At the top of `apps/frontend/src/components/course/HlsVideoPlayer.tsx`, change:
```typescript
import { apiStartVideoPlayback } from '../../api/contentBlocks';
```
to:
```typescript
import { apiStartVideoPlayback, apiSaveWatchProgress, apiGetWatchProgress, type WatchSegment } from '../../api/contentBlocks';
```

- [ ] **Step 2: Add watch-progress state and refs**

Find this block near the top of the `HlsVideoPlayer` function body:
```typescript
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
```
Add immediately after it:
```typescript
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
```

- [ ] **Step 3: Fetch existing progress on mount**

Find the existing HLS-boot `useEffect` (starts with `useEffect(() => { let hls: Hls | null = null; ...`, the one containing `apiStartVideoPlayback`). Add a new, separate `useEffect` immediately after that whole effect block (after its closing `}, [blockId]);`):

```typescript
  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId).then((data) => {
      if (cancelled) return;
      setWatchedSegments(data.segments);
      setWatchedPercent(data.watchedPercent);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blockId]);
```

- [ ] **Step 4: Define the save-progress function and wire `timeupdate`/`pause`/`ended`/periodic save**

Add this new `useEffect` immediately after the one from Step 3:

```typescript
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    function closeCurrentRange() {
      const range = currentRangeRef.current;
      if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
        void apiSaveWatchProgress(blockId, Math.floor(range.start), Math.floor(range.end)).then((data) => {
          setWatchedPercent(data.watchedPercent);
        });
        lastSavedEndRef.current = range.end;
      }
    }

    function handleTimeUpdate() {
      if (!video) return;
      const current = video.currentTime;
      const jumped = Math.abs(current - lastTimeRef.current) > 2;
      lastTimeRef.current = current;

      if (jumped || !currentRangeRef.current) {
        closeCurrentRange();
        currentRangeRef.current = { start: current, end: current };
        lastSavedEndRef.current = 0;
      } else {
        currentRangeRef.current.end = current;
      }
    }

    function handleLoadedMetadata() {
      if (video && !isNaN(video.duration) && isFinite(video.duration)) {
        setVideoDuration(video.duration);
      }
    }

    const saveInterval = setInterval(() => {
      if (!video.paused) closeCurrentRange();
    }, 7000);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('pause', closeCurrentRange);
    video.addEventListener('ended', closeCurrentRange);

    return () => {
      clearInterval(saveInterval);
      closeCurrentRange();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('pause', closeCurrentRange);
      video.removeEventListener('ended', closeCurrentRange);
    };
  }, [blockId]);
```

- [ ] **Step 5: Render the progress strip below the video**

The strip must render as a sibling after the `wrapperRef` div closes (not inside it), since it should not participate in the fullscreen container. This requires wrapping the component's whole return in a fragment.

Change the component's `return (` statement from:
```tsx
  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden bg-black ${
```
to:
```tsx
  return (
    <>
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden bg-black ${
```

Then change the closing of the return (the error-display line and the `</div>` that closes `wrapperRef`, near the end of the JSX) from:
```tsx
      {error && <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}
    </div>
  );
}
```
to:
```tsx
      {error && <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}
    </div>
    {videoDuration !== null && videoDuration > 0 && !isFullscreen && (
      <div className="mt-2">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          {watchedSegments.map((seg, i) => (
            <div
              key={i}
              className="absolute h-full rounded-full bg-indigo-400"
              style={{
                left: `${(seg.startSec / videoDuration) * 100}%`,
                width: `${((seg.endSec - seg.startSec) / videoDuration) * 100}%`,
              }}
            />
          ))}
        </div>
        {watchedPercent !== null && (
          <p className="mt-1 text-xs text-gray-400">{watchedPercent}% ko'rilgan</p>
        )}
      </div>
    )}
    </>
  );
}
```

- [ ] **Step 6: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/course/HlsVideoPlayer.tsx
git commit -m "feat(video-player): track watched segments, show progress strip

Tracks timeupdate to build watched time-ranges (seeks close the current
range so skipped-over content isn't counted), periodically saves via
apiSaveWatchProgress, and renders a progress strip below the video
showing merged watched segments plus percent-watched text. Purely
informational -- does not affect lesson completion or unlock logic."
```

---

### Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full backend build + test suite**

Run: `cd apps/backend && npm run build && npm test`
Expected: build 0 errors; test suite all passing (114 pre-existing + 14 new `video-progress.service.spec.ts` tests = 128 total).

- [ ] **Step 2: Full frontend build**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors.

- [ ] **Step 3: Grep-confirm no unlock/completion logic references watch-progress**

Run: `grep -rn "watchedPercent\|watch-progress\|WatchSegment" apps/frontend/src/pages/MyCoursesPage.tsx`
Expected: no matches (confirms `maxUnlockedIndex`/`markSelectedLessonComplete`/lesson-completion logic in `MyCoursesPage.tsx` was never touched by this plan, per the Global Constraint that this feature is purely informational).

- [ ] **Step 4: Confirm migration applied correctly**

Run: `psql "$DATABASE_URL" -c "\d video_watch_segments"` (or the project's equivalent DB-inspection command)
Expected: table exists with columns `id, content_block_id, student_id, start_sec, end_sec, updated_at`, both foreign keys present.

- [ ] **Step 5: Report to the user**

Summarize: schema/migration applied, `mergeWatchSegments`/`computeWatchedPercent` unit-tested (14/14), routes wired with student/teacher/super access control matching the existing video-playback pattern, `HlsVideoPlayer.tsx` now tracks and displays real watched-segment coverage. Remind the user that manual browser QA is required per the spec's Testing section: play a video partway, seek forward, confirm the skipped range isn't marked watched; replay the same range twice and confirm segments don't duplicate; refresh mid-lesson and confirm the strip restores from saved state.
