# Lesson Practice (Amaliyot) Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the mock-only "Amaliy qism" (practice) UI to a real backend — teachers attach existing tests to lessons as practice blocks with independent per-block star scores plus a separate lesson-completion score, and students take those tests (via the existing test-delivery pipeline) and see their score/attempt history.

**Architecture:** A new `practice_blocks` table (one row per test attached to a lesson) and a new `lesson_completions` table (records that a student finished a lesson) sit alongside the existing `tests`/`submissions`/`answers` tables, which are reused unchanged. A new `practice-blocks` NestJS module handles teacher CRUD; `LessonsService`/`LessonsController` gain the pass-threshold and completion-score fields; `GroupsService.getMyCourseDetail` gains a student-facing practice summary; `DeliveryService` gains an optional practice-context override (`?practice=1`) that forces `showResults=immediately`, `oneByOne=false`, `requireAuth=true`, and ignores `deadline` for lesson-practice test-taking without touching the test's own DB row. The frontend's `courseStore.ts` practice actions move from synchronous/local-only to async/backend-backed, and `MyCoursesPage.tsx` gains a practice screen matching the reference UI (score summary split into "Amaliyot" + "Darsni tamomlash", per-block attempt list with Ochish/Qayta o'tish).

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, React 19 + TypeScript + zustand.

## Global Constraints

- Only the `test` practice-block type is wired to the backend this pass — `image`/`file`/`audio` stay mock-only in the frontend UI (per spec §6). The backend's create endpoint only accepts `type: 'test'`.
- No manual/curator grading — all scoring is automatic, from the test's existing `score`/`total` on submission (per spec §1, brainstorm decision).
- Unlimited retries — no attempt-count cap anywhere (per spec §1, brainstorm decision).
- A practice block's earned score is `Math.round((latestSubmission.score / latestSubmission.total) * practiceBlock.maxScore)`, based on the student's most recent submission for that block's `testId` (latest by `submittedAt`), not the best submission (per spec §2, brainstorm decision). If `maxScore` is `null`, no score is shown, only status/percentage.
- The lesson-completion score (`lessons.completionScore`) is all-or-nothing: full score if a `lesson_completions` row exists for the student, nothing otherwise — never proportional (per spec §2).
- `passThresholdPercent` is checked against the **combined** percentage across all of a lesson's practice blocks: `sum(earnedScore) / sum(maxScore) * 100 >= passThresholdPercent` (resolved open question, per the writing-plans dispatch instruction).
- Test-taking in lesson-practice context must force `showResults='immediately'`, `oneByOne=false`, `requireAuth=true`, and ignore `deadline`, regardless of the test's own DB settings — but this must NOT mutate the test's own row, since the same test can also be taken via its standalone `/t/:slug` link with its own settings intact (per spec §4, confirmed).
- Ownership checks always go through the parent-chain pattern (`assertLessonOwnership`: `lessonId → module → course → course.adminId`), matching `ContentBlocksService`'s existing helper — do not duplicate the query differently.
- No optimistic updates in the frontend store — every action awaits the API response, then updates local state from the response, matching every existing action in `courseStore.ts` (e.g. `renameLesson`, `addBlock`).
- After generating a Drizzle migration, manually inspect the generated SQL file before applying — this codebase has a history of `drizzle-kit generate` bundling unrelated already-applied statements.
- `npm run db:migrate` / `drizzle-kit migrate` may fail due to `__drizzle_migrations` tracking drift. Apply migrations manually via `psql "$DATABASE_URL" -f <file>.sql` (dev `DATABASE_URL` is `postgresql://macbookpro@localhost:5432/testplatform`), then verify with `psql "$DATABASE_URL" -c "\d <table>"`.
- The most recent migration file is `0022_group_enrollments.sql` — this plan's migration must be `0023_practice_blocks.sql` and must not touch any table from that migration or from `0021_video_content_blocks.sql`.
- This codebase currently has no unit/integration tests for `GroupsService`/`ContentBlocksService`/`LessonsService`-style DB-integration services (confirmed: no `.spec.ts` files reference them). This plan follows that established pattern — verification is via `npm run build`, `npm test` (existing suite must stay green), and manual `psql`/manual UI check, not new test files, **except** for the one pure-function piece of new logic (the combined pass-threshold percentage calculation and the per-block earned-score calculation), which are pure functions and get real unit tests, matching how `delivery.service.spec.ts`-style pure-function tests already exist in this codebase (e.g. `apps/backend/src/delivery/delivery.service.spec.ts` tests `evaluateObjectiveAnswer`, `normalizeSubmissionMode` as standalone exported functions).

---

## File Structure

**Backend — new:**
- `apps/backend/drizzle/migrations/0023_practice_blocks.sql` — schema migration.
- `apps/backend/src/practice-blocks/practice-blocks.service.ts` — teacher CRUD + student-facing summary-with-scores logic (pure scoring functions exported for unit testing).
- `apps/backend/src/practice-blocks/practice-blocks.controller.ts` — routes for both roles.
- `apps/backend/src/practice-blocks/practice-blocks.module.ts` — module registration.
- `apps/backend/src/practice-blocks/practice-blocks.service.spec.ts` — unit tests for the pure scoring functions.

**Backend — modified:**
- `apps/backend/src/db/schema.ts` — add `practiceBlocks`, `lessonCompletions` tables + relations; add `passThresholdEnabled`, `passThresholdPercent`, `completionScore` columns to `lessons`.
- `apps/backend/src/lessons/lessons.service.ts` — extend `update()`'s `data` param to accept the 3 new lesson fields.
- `apps/backend/src/lessons/lessons.controller.ts` — extend `UpdateLessonDto`.
- `apps/backend/src/delivery/delivery.service.ts` — add practice-context override to `getTestBySlug`, `startSubmission` (no forced-auth check change needed since `requireAuth` is force-true, so the existing check already covers it), `getSubmission`, `getSubmissionResult`, `submitAnswers`.
- `apps/backend/src/delivery/delivery.controller.ts` — thread an optional `practice` query param through to the service.
- `apps/backend/src/groups/groups.service.ts` — extend `getMyCourseDetail` to include each lesson's practice blocks (with the student's submission history and computed scores) and completion status.
- `apps/backend/src/app.module.ts` — register `PracticeBlocksModule`.

**Frontend — new:**
- `apps/frontend/src/api/practiceBlocks.ts` — API wrappers for teacher CRUD + student summary.
- `apps/frontend/src/components/student/PracticeScreen.tsx` — the student-facing practice screen (score summary + per-block attempt list).

**Frontend — modified:**
- `apps/frontend/src/api/lessons.ts` — extend `apiUpdateLesson`'s `data` type.
- `apps/frontend/src/api/delivery.ts` — thread an optional `practice` boolean through `apiGetPublicTest`, `apiStartSubmission`, `apiGetSubmission`, `apiGetSubmissionResult`, `apiSubmitAnswers`, `apiCheckAnswer`.
- `apps/frontend/src/stores/courseStore.ts` — convert `addPracticeBlock`, `removePracticeBlock`, `movePracticeBlock`, `setPracticeBlockTest`, `setPracticeBlockDescription`, `setPassThreshold` to async/backend-backed; add `completionScore` to `Lesson`; fetch real practice blocks in `loadCourses`.
- `apps/frontend/src/pages/TakeTestEntryPage.tsx` — read `?practice=1` from the URL and pass it through to `apiGetPublicTest`/`apiStartSubmission`, and preserve it in the navigate call to `/t/:slug/take`.
- `apps/frontend/src/pages/TakeTestPage.tsx` — read `?practice=1`, pass it through to `apiGetPublicTest`/`apiGetSubmission`/`apiSubmitAnswers`/`apiCheckAnswer`, and preserve it when navigating to the result page.
- `apps/frontend/src/pages/MyCoursesPage.tsx` — add "Amaliy qism" button, wire `hasPractice`, add practice-screen routing state, call the lesson-completion endpoint on "Keyingi dars"/"Amaliyot" click.

No changes needed to `PracticeBlockView.tsx`, `PracticeSection.tsx`, or `PracticeBlockPicker.tsx` — their props/callbacks already match what `courseStore.ts`'s actions need to become (just async now).

---

### Task 1: Schema — `practice_blocks`, `lesson_completions`, `lessons` new columns

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0023_practice_blocks.sql`

**Interfaces:**
- Produces: `practiceBlocks` table (Drizzle export `practiceBlocks`, SQL table `practice_blocks`) with columns `id`, `lessonId` (FK→lessons.id, cascade), `testId` (FK→tests.id, set null), `orderIndex`, `description`, `maxScore` (nullable), `createdAt`. Produces `practiceBlocksRelations` exposing `lesson`, `test`.
- Produces: `lessonCompletions` table (SQL table `lesson_completions`) with columns `id`, `lessonId` (FK→lessons.id, cascade), `studentId` (FK→users.id, cascade), `completedAt`, unique index on `(lessonId, studentId)`. Produces `lessonCompletionsRelations` exposing `lesson`, `student`.
- Produces: `lessons.passThresholdEnabled` (boolean, default false), `lessons.passThresholdPercent` (integer, nullable), `lessons.completionScore` (integer, nullable).
- Consumes: existing `lessons`, `tests`, `users` tables.

- [ ] **Step 1: Edit `apps/backend/src/db/schema.ts` — add columns to `lessons`**

Find:

```typescript
export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

Replace with:

```typescript
export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('draft'),
  passThresholdEnabled: boolean('pass_threshold_enabled').notNull().default(false),
  passThresholdPercent: integer('pass_threshold_percent'),
  completionScore: integer('completion_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Add `practiceBlocks` and `lessonCompletions` tables**

Add this block immediately after the existing `contentBlocksRelations` export (i.e. right before `export const lessonsRelations = ...`):

```typescript
export const practiceBlocks = pgTable('practice_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  testId: uuid('test_id').references(() => tests.id, { onDelete: 'set null' }),
  orderIndex: integer('order_index').notNull().default(0),
  description: text('description').notNull().default(''),
  maxScore: integer('max_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const practiceBlocksRelations = relations(practiceBlocks, ({ one }) => ({
  lesson: one(lessons, { fields: [practiceBlocks.lessonId], references: [lessons.id] }),
  test: one(tests, { fields: [practiceBlocks.testId], references: [tests.id] }),
}));

export const lessonCompletions = pgTable('lesson_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueLessonStudent: uniqueIndex('lesson_completions_lesson_id_student_id_key').on(table.lessonId, table.studentId),
}));

export const lessonCompletionsRelations = relations(lessonCompletions, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonCompletions.lessonId], references: [lessons.id] }),
  student: one(users, { fields: [lessonCompletions.studentId], references: [users.id] }),
}));
```

**Important ordering note:** this block references `tests` (declared later in the file, around line 240) and `users` (declared at the very top, line 13) — since these are `const` arrow-function closures evaluated lazily by Drizzle's `relations()` helper, forward-references to `tests` inside `practiceBlocksRelations`'s `relations(practiceBlocks, ...)` callback are fine at the JS level, but the earlier `group_enrollments` bug (see project history) was about a `pgTable(...)` call itself — not a `relations()` callback — referencing another `pgTable` before its declaration. Here, `practiceBlocks` (a `pgTable` call) references `tests.id` via `.references(() => tests.id, ...)` — this is a **lazy arrow function**, not evaluated at module-load time, so forward-referencing `tests` (declared below) is safe. Do NOT move this block below the `tests` declaration; placing it right after `contentBlocksRelations` (before `lessonsRelations`) keeps lesson-adjacent tables grouped together, matching the file's existing organization by feature area.

- [ ] **Step 3: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with zero errors (this is a pure schema addition — no other file references these new exports yet, so nothing should break).

- [ ] **Step 4: Generate and inspect the migration**

Run: `cd apps/backend && npx drizzle-kit generate --name=practice_blocks` (or, if this project's `drizzle-kit generate` produces a different auto-name, rename the resulting file to `0023_practice_blocks.sql` — check `apps/backend/drizzle/migrations/` for the newest file after running).

**Manually inspect the generated SQL file before applying it.** It must contain ONLY:
- `CREATE TABLE "practice_blocks" (...)` with the 6 columns and 2 FK constraints (to `lessons` cascade, to `tests` set null).
- `CREATE TABLE "lesson_completions" (...)` with the 4 columns, 2 FK constraints (to `lessons` cascade, to `users` cascade), and the unique index.
- `ALTER TABLE "lessons" ADD COLUMN "pass_threshold_enabled" boolean DEFAULT false NOT NULL;`
- `ALTER TABLE "lessons" ADD COLUMN "pass_threshold_percent" integer;`
- `ALTER TABLE "lessons" ADD COLUMN "completion_score" integer;`

If the generated file contains ANY other statement (e.g. touching `group_members`, `content_blocks`, or anything from a prior migration), do not apply it — this is the known `drizzle-kit generate` bundling issue. In that case, hand-write the migration file with exactly the 5 statement groups above instead.

- [ ] **Step 5: Apply the migration manually**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -f apps/backend/drizzle/migrations/0023_practice_blocks.sql`
Expected: no errors.

- [ ] **Step 6: Verify migration applied correctly**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d practice_blocks"`
Expected: table exists with columns `id, lesson_id, test_id, order_index, description, max_score, created_at` and 2 FK constraints.

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d lesson_completions"`
Expected: table exists with columns `id, lesson_id, student_id, completed_at`, 2 FK constraints, and a unique index on `(lesson_id, student_id)`.

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d lessons"`
Expected: the three new columns (`pass_threshold_enabled`, `pass_threshold_percent`, `completion_score`) are present.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/0023_practice_blocks.sql
git commit -m "feat(db): add practice_blocks and lesson_completions tables, lesson score columns"
```

---

### Task 2: `PracticeBlocksService` + `PracticeBlocksController` — teacher CRUD

**Files:**
- Create: `apps/backend/src/practice-blocks/practice-blocks.service.ts`
- Create: `apps/backend/src/practice-blocks/practice-blocks.controller.ts`
- Create: `apps/backend/src/practice-blocks/practice-blocks.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `practiceBlocks`, `lessons`, `modules`, `courses`, `tests` from `apps/backend/src/db/schema.ts` (Task 1).
- Produces: `PracticeBlocksService.findAll(lessonId, adminId)`, `.create(lessonId, adminId)`, `.update(id, adminId, data: { testId?: string | null; description?: string; maxScore?: number | null })`, `.remove(id, adminId)`, `.reorder(lessonId, adminId, blockIds: string[])` — mirrors `ContentBlocksService`'s method shapes exactly (see `apps/backend/src/content-blocks/content-blocks.service.ts` for the pattern being followed).
- Produces routes: `GET lessons/:lessonId/practice-blocks`, `POST lessons/:lessonId/practice-blocks`, `PATCH practice-blocks/:id`, `DELETE practice-blocks/:id`, `POST lessons/:lessonId/practice-blocks/reorder` — all `@Roles('teacher', 'super')`.

- [ ] **Step 1: Create `apps/backend/src/practice-blocks/practice-blocks.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

const PRACTICE_BLOCK_LIMIT = 4;

@Injectable()
export class PracticeBlocksService {
  private async assertLessonOwnership(lessonId: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
  }

  async findAll(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    return db.query.practiceBlocks.findMany({
      where: eq(practiceBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });
  }

  async create(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.practiceBlocks.findMany({ where: eq(practiceBlocks.lessonId, lessonId) });
    if (existing.length >= PRACTICE_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${PRACTICE_BLOCK_LIMIT} practice blocks`);
    }
    const [block] = await db
      .insert(practiceBlocks)
      .values({ lessonId, testId: null, orderIndex: existing.length, description: '' })
      .returning();
    return block;
  }

  async update(id: string, adminId: string, data: { testId?: string | null; description?: string; maxScore?: number | null }) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, id) });
    if (!block) throw new NotFoundException('Practice block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    if (data.testId) {
      const duplicate = await db.query.practiceBlocks.findFirst({
        where: and(eq(practiceBlocks.lessonId, block.lessonId), eq(practiceBlocks.testId, data.testId)),
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException('This test is already attached to another practice block in this lesson');
      }
    }

    const [updated] = await db.update(practiceBlocks).set(data).where(eq(practiceBlocks.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, id) });
    if (!block) throw new NotFoundException('Practice block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    await db.delete(practiceBlocks).where(eq(practiceBlocks.id, id));
  }

  async reorder(lessonId: string, adminId: string, blockIds: string[]) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.practiceBlocks.findMany({
      where: and(eq(practiceBlocks.lessonId, lessonId), inArray(practiceBlocks.id, blockIds)),
    });
    if (existing.length !== blockIds.length) {
      throw new BadRequestException('blockIds must match the lesson\'s existing practice blocks');
    }
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(practiceBlocks).set({ orderIndex: i }).where(eq(practiceBlocks.id, blockIds[i]));
    }
  }
}
```

- [ ] **Step 2: Create `apps/backend/src/practice-blocks/practice-blocks.controller.ts`**

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { PracticeBlocksService } from './practice-blocks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

class UpdatePracticeBlockDto {
  @IsOptional() @IsUUID() testId?: string | null;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) maxScore?: number | null;
}

class ReorderPracticeBlocksDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blockIds: string[];
}

class CreatePracticeBlockDto {
  @IsIn(['test']) type: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PracticeBlocksController {
  constructor(private practiceBlocksService: PracticeBlocksService) {}

  @Get('lessons/:lessonId/practice-blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.findAll(lessonId, req.admin.id);
  }

  @Post('lessons/:lessonId/practice-blocks')
  create(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: CreatePracticeBlockDto) {
    return this.practiceBlocksService.create(lessonId, req.admin.id);
  }

  @Patch('practice-blocks/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdatePracticeBlockDto) {
    return this.practiceBlocksService.update(id, req.admin.id, dto);
  }

  @Delete('practice-blocks/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.practiceBlocksService.remove(id, req.admin.id);
  }

  @Post('lessons/:lessonId/practice-blocks/reorder')
  @HttpCode(204)
  reorder(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: ReorderPracticeBlocksDto) {
    return this.practiceBlocksService.reorder(lessonId, req.admin.id, dto.blockIds);
  }
}
```

Note: `CreatePracticeBlockDto`'s `type` field is validated (`@IsIn(['test'])`) but not passed to the service — this matches `ContentBlocksController.create`'s pattern where the DTO enforces "only this type is creatable via this endpoint" at the validation layer, even though the service itself only ever creates one kind of row. This keeps the door open for `image`/`file`/`audio` types to be added later without a breaking API change (the frontend already sends `{ type }` in its create call regardless).

- [ ] **Step 3: Create `apps/backend/src/practice-blocks/practice-blocks.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PracticeBlocksController } from './practice-blocks.controller';
import { PracticeBlocksService } from './practice-blocks.service';

@Module({
  controllers: [PracticeBlocksController],
  providers: [PracticeBlocksService],
})
export class PracticeBlocksModule {}
```

- [ ] **Step 4: Register the module in `apps/backend/src/app.module.ts`**

Add the import near the other feature-module imports:

```typescript
import { PracticeBlocksModule } from './practice-blocks/practice-blocks.module';
```

Add `PracticeBlocksModule,` to the `imports` array, right after `ContentBlocksModule,`.

- [ ] **Step 5: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with zero errors.

- [ ] **Step 6: Manual verification via psql + curl (no automated tests for this DB-integration service, per Global Constraints)**

This step is a smoke check, not a full test suite — confirm the server starts and the route is registered:

Run: `npm run start:dev --workspace=apps/backend &` then wait a few seconds, then `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/lessons/00000000-0000-0000-0000-000000000000/practice-blocks` (no auth header).
Expected: `401` (guard rejects unauthenticated request) — confirms the route exists and guards are wired, not a 404. Stop the dev server afterward (`kill %1` or find and kill the node process).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/practice-blocks apps/backend/src/app.module.ts
git commit -m "feat(practice-blocks): add teacher CRUD for lesson practice blocks"
```

---

### Task 3: `LessonsService`/`LessonsController` — pass-threshold and completion-score fields

**Files:**
- Modify: `apps/backend/src/lessons/lessons.service.ts`
- Modify: `apps/backend/src/lessons/lessons.controller.ts`

**Interfaces:**
- Consumes: `lessons.passThresholdEnabled`, `lessons.passThresholdPercent`, `lessons.completionScore` from `apps/backend/src/db/schema.ts` (Task 1).
- Produces: `LessonsService.update(id, adminId, data: { title?: string; status?: string; passThresholdEnabled?: boolean; passThresholdPercent?: number | null; completionScore?: number | null })` — extends the existing method's `data` param, same method name/shape otherwise.

- [ ] **Step 1: Edit `apps/backend/src/lessons/lessons.service.ts`**

Find:

```typescript
  async update(id: string, adminId: string, data: { title?: string; status?: string }) {
```

Replace with:

```typescript
  async update(
    id: string,
    adminId: string,
    data: {
      title?: string;
      status?: string;
      passThresholdEnabled?: boolean;
      passThresholdPercent?: number | null;
      completionScore?: number | null;
    },
  ) {
```

(No other change needed in this method — the existing `db.update(lessons).set(data)...` call already forwards whatever `data` contains.)

- [ ] **Step 2: Edit `apps/backend/src/lessons/lessons.controller.ts`**

Find:

```typescript
class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsIn(['draft', 'published']) status?: string;
}
```

Replace with:

```typescript
class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsIn(['draft', 'published']) status?: string;
  @IsOptional() @IsBoolean() passThresholdEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) passThresholdPercent?: number | null;
  @IsOptional() @IsInt() @Min(0) completionScore?: number | null;
}
```

Update the import line at the top of the file — find:

```typescript
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
```

Replace with:

```typescript
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
```

- [ ] **Step 3: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lessons/lessons.service.ts apps/backend/src/lessons/lessons.controller.ts
git commit -m "feat(lessons): add passThreshold and completionScore fields to lesson update"
```

---

### Task 4: `DeliveryService`/`DeliveryController` — practice-context override

**Files:**
- Modify: `apps/backend/src/delivery/delivery.service.ts`
- Modify: `apps/backend/src/delivery/delivery.controller.ts`

**Interfaces:**
- Consumes: nothing new from schema — this task only changes how existing `tests` row fields are read/returned.
- Produces: `DeliveryService.getTestBySlug(slug: string, practiceMode: boolean)`, `.startSubmission(slug: string, studentName: string, userId: string | undefined, practiceMode: boolean)`, `.getSubmission(submissionId: string, practiceMode: boolean)`, `.getSubmissionResult(submissionId: string, practiceMode: boolean)`, `.submitAnswers(submissionId, answerItems, mode, violationReason, practiceMode: boolean)` — each gains a new final `practiceMode` parameter (default not needed since the controller always passes it explicitly).
- Produces exported pure function `applyPracticeOverride<T extends { showResults: string; oneByOne: boolean; requireAuth: boolean; deadline: Date | null }>(config: T, practiceMode: boolean): T` — used internally by all the above, and unit-tested directly.

- [ ] **Step 1: Add the pure override function to `apps/backend/src/delivery/delivery.service.ts`**

Find the existing exported functions near the top of the file (after the imports, before `sleep`):

```typescript
export function normalizeViolationReason(reason?: string | null) {
  const text = reason?.trim();
  return text ? text.slice(0, 300) : null;
}
```

Add immediately after it:

```typescript
export function applyPracticeOverride<T extends { showResults: string; oneByOne: boolean; requireAuth: boolean; deadline: Date | string | null }>(
  config: T,
  practiceMode: boolean,
): T {
  if (!practiceMode) return config;
  return { ...config, showResults: 'immediately', oneByOne: false, requireAuth: true, deadline: null };
}
```

- [ ] **Step 2: Thread `practiceMode` through `getTestBySlug`**

Find:

```typescript
  async getTestBySlug(slug: string) {
    const test = await db.query.tests.findFirst({
      where: eq(tests.slug, slug),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      timeLimit: test.timeLimit,
      showResults: test.showResults,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      oneByOne: test.oneByOne,
      requireAuth: test.requireAuth,
      deadline: test.deadline,
      questions: test.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        orderIndex: q.orderIndex,
        imageUrl: q.imageUrl,
        audioUrl: q.audioUrl,
        options: q.options.map((o) => ({ id: o.id, text: o.text, orderIndex: o.orderIndex })),
      })),
    };
  }
```

Replace with:

```typescript
  async getTestBySlug(slug: string, practiceMode = false) {
    const test = await db.query.tests.findFirst({
      where: eq(tests.slug, slug),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const overridden = applyPracticeOverride(
      {
        showResults: test.showResults,
        oneByOne: test.oneByOne,
        requireAuth: test.requireAuth,
        deadline: test.deadline,
      },
      practiceMode,
    );

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      timeLimit: test.timeLimit,
      showResults: overridden.showResults,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      oneByOne: overridden.oneByOne,
      requireAuth: overridden.requireAuth,
      deadline: overridden.deadline,
      questions: test.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        orderIndex: q.orderIndex,
        imageUrl: q.imageUrl,
        audioUrl: q.audioUrl,
        options: q.options.map((o) => ({ id: o.id, text: o.text, orderIndex: o.orderIndex })),
      })),
    };
  }
```

- [ ] **Step 3: Thread `practiceMode` through `startSubmission`**

Find:

```typescript
  async startSubmission(slug: string, studentName: string, userId?: string) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');
    if (test.requireAuth && !userId) throw new BadRequestException('AUTH_REQUIRED');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      userId,
      studentName,
    }).returning();

    return { submissionId: submission.id };
  }
```

Replace with:

```typescript
  async startSubmission(slug: string, studentName: string, userId?: string, practiceMode = false) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');
    const requireAuth = practiceMode ? true : test.requireAuth;
    if (requireAuth && !userId) throw new BadRequestException('AUTH_REQUIRED');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      userId,
      studentName,
    }).returning();

    return { submissionId: submission.id };
  }
```

- [ ] **Step 4: Thread `practiceMode` through `getSubmission`**

Find:

```typescript
  // Resume: return submission state if not yet submitted
  async getSubmission(submissionId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Already submitted — return result (respecting showResults)
    if (submission.submittedAt) {
      const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
      return {
        status: 'submitted' as const,
        score: submission.score,
        total: submission.total,
        showResults: test?.showResults ?? 'hidden',
        deadline: test?.deadline ?? null,
        mode: normalizeSubmissionMode(submission.mode),
        violationReason: normalizeViolationReason(submission.violationReason),
      };
    }

    // Not submitted — return in-progress state so frontend can resume
    return {
      status: 'in_progress' as const,
      testId: submission.testId,
      studentName: submission.studentName,
    };
  }
```

Replace with:

```typescript
  // Resume: return submission state if not yet submitted
  async getSubmission(submissionId: string, practiceMode = false) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Already submitted — return result (respecting showResults)
    if (submission.submittedAt) {
      const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
      const overridden = applyPracticeOverride(
        { showResults: test?.showResults ?? 'hidden', oneByOne: test?.oneByOne ?? false, requireAuth: test?.requireAuth ?? false, deadline: test?.deadline ?? null },
        practiceMode,
      );
      return {
        status: 'submitted' as const,
        score: submission.score,
        total: submission.total,
        showResults: overridden.showResults,
        deadline: overridden.deadline,
        mode: normalizeSubmissionMode(submission.mode),
        violationReason: normalizeViolationReason(submission.violationReason),
      };
    }

    // Not submitted — return in-progress state so frontend can resume
    return {
      status: 'in_progress' as const,
      testId: submission.testId,
      studentName: submission.studentName,
    };
  }
```

- [ ] **Step 5: Thread `practiceMode` through `getSubmissionResult`**

Find:

```typescript
  async getSubmissionResult(submissionId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!submission.submittedAt) throw new BadRequestException('Submission not yet submitted');

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    const showAnswers = test?.showResults === 'immediately' || test?.showResults === 'per_question';
```

Replace with:

```typescript
  async getSubmissionResult(submissionId: string, practiceMode = false) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!submission.submittedAt) throw new BadRequestException('Submission not yet submitted');

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    const effectiveShowResults = practiceMode ? 'immediately' : (test?.showResults ?? 'hidden');
    const effectiveDeadline = practiceMode ? null : (test?.deadline ?? null);
    const showAnswers = effectiveShowResults === 'immediately' || effectiveShowResults === 'per_question';
```

Then find the return statement later in the same method:

```typescript
    return {
      submissionId,
      score: submission.score,
      total: submission.total,
      mode: normalizeSubmissionMode(submission.mode),
      violationReason: normalizeViolationReason(submission.violationReason),
      showResults: test?.showResults ?? 'hidden',
      deadline: test?.deadline ?? null,
      answers: safeAnswers,
    };
  }
```

Replace with:

```typescript
    return {
      submissionId,
      score: submission.score,
      total: submission.total,
      mode: normalizeSubmissionMode(submission.mode),
      violationReason: normalizeViolationReason(submission.violationReason),
      showResults: effectiveShowResults,
      deadline: effectiveDeadline,
      answers: safeAnswers,
    };
  }
```

- [ ] **Step 6: Thread `practiceMode` through `submitAnswers`**

Find the method signature:

```typescript
  async submitAnswers(submissionId: string, answerItems: Array<{
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string | null;
  }>, mode?: string, violationReason?: string | null) {
```

Replace with:

```typescript
  async submitAnswers(submissionId: string, answerItems: Array<{
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string | null;
  }>, mode?: string, violationReason?: string | null, practiceMode = false) {
```

Find:

```typescript
    if (submission.submittedAt) {
      // Already submitted — return full persisted result (beacon may fire multiple times).
      return this.getSubmissionResult(submissionId);
    }
```

Replace with:

```typescript
    if (submission.submittedAt) {
      // Already submitted — return full persisted result (beacon may fire multiple times).
      return this.getSubmissionResult(submissionId, practiceMode);
    }
```

Find the final return block:

```typescript
    // Only return answer breakdown if showResults === 'immediately' or 'per_question'
    // For other modes, never send per-question correctness to client
    const showAnswers = test.showResults === 'immediately' || test.showResults === 'per_question';

    return {
      submissionId,
      score,
      total,
      mode: normalizeSubmissionMode(mode),
      violationReason: normalizeSubmissionMode(mode) === 'violation'
        ? normalizeViolationReason(violationReason) ?? 'Taqiqlangan harakat aniqlanganligi sababli yakunlandi.'
        : null,
      showResults: test.showResults,
      deadline: test.deadline,
      answers: showAnswers ? safeAnswers : [],
    };
  }
}
```

Replace with:

```typescript
    // Only return answer breakdown if showResults === 'immediately' or 'per_question'
    // For other modes, never send per-question correctness to client
    const effectiveShowResults = practiceMode ? 'immediately' : test.showResults;
    const effectiveDeadline = practiceMode ? null : test.deadline;
    const showAnswers = effectiveShowResults === 'immediately' || effectiveShowResults === 'per_question';

    return {
      submissionId,
      score,
      total,
      mode: normalizeSubmissionMode(mode),
      violationReason: normalizeSubmissionMode(mode) === 'violation'
        ? normalizeViolationReason(violationReason) ?? 'Taqiqlangan harakat aniqlanganligi sababli yakunlandi.'
        : null,
      showResults: effectiveShowResults,
      deadline: effectiveDeadline,
      answers: showAnswers ? safeAnswers : [],
    };
  }
}
```

- [ ] **Step 7: Thread the `practice` query param through `apps/backend/src/delivery/delivery.controller.ts`**

Replace the entire file with:

```typescript
import { Controller, Get, Post, Param, Body, Headers, HttpCode, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeliveryService } from './delivery.service';
import { StartSubmissionDto } from './dto/start-submission.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

function isPracticeMode(value?: string) {
  return value === '1' || value === 'true';
}

@Controller('public')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string, @Query('practice') practice?: string) {
    return this.deliveryService.getTestBySlug(slug, isPracticeMode(practice));
  }

  @Post('submissions')
  startSubmission(
    @Body() dto: StartSubmissionDto,
    @Query('practice') practice: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    return this.deliveryService.startSubmission(
      dto.slug,
      dto.studentName,
      this.getOptionalUserId(authorization),
      isPracticeMode(practice),
    );
  }

  @Get('submissions/:id')
  getSubmission(@Param('id') id: string, @Query('practice') practice?: string) {
    return this.deliveryService.getSubmission(id, isPracticeMode(practice));
  }

  @Get('submissions/:id/result')
  getSubmissionResult(@Param('id') id: string, @Query('practice') practice?: string) {
    return this.deliveryService.getSubmissionResult(id, isPracticeMode(practice));
  }

  @Post('submissions/:id/submit')
  @HttpCode(200)
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto, @Query('practice') practice?: string) {
    return this.deliveryService.submitAnswers(id, dto.answers, dto.mode, dto.violationReason, isPracticeMode(practice));
  }

  @Post('submissions/:id/check')
  @HttpCode(200)
  checkAnswer(@Param('id') id: string, @Body() body: { questionId: string; selectedOptionIds: string[]; textAnswer: string | null }) {
    return this.deliveryService.checkAnswer(id, body);
  }

  private getOptionalUserId(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return undefined;

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
```

(`checkAnswer` is intentionally NOT given a practice override — it's only used in `per_question` mode, which practice mode forces `showResults='immediately'` to never trigger; per_question and immediately are mutually exclusive display modes, and practice mode always picks immediately.)

- [ ] **Step 8: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with zero errors.

- [ ] **Step 9: Write and run unit tests for `applyPracticeOverride`**

Create `apps/backend/src/delivery/delivery.service.spec.ts` addition — this file already exists (per Global Constraints, it tests `evaluateObjectiveAnswer` etc.). Add to it (do not replace the whole file — append a new `describe` block):

```typescript
describe('applyPracticeOverride', () => {
  it('returns the config unchanged when not in practice mode', () => {
    const config = { showResults: 'hidden', oneByOne: true, requireAuth: false, deadline: new Date('2026-01-01') };
    expect(applyPracticeOverride(config, false)).toEqual(config);
  });

  it('forces immediate results, all-at-once, required auth, and no deadline in practice mode', () => {
    const config = { showResults: 'hidden', oneByOne: true, requireAuth: false, deadline: new Date('2026-01-01') };
    expect(applyPracticeOverride(config, true)).toEqual({
      showResults: 'immediately',
      oneByOne: false,
      requireAuth: true,
      deadline: null,
    });
  });

  it('does not mutate the original config object', () => {
    const config = { showResults: 'per_question', oneByOne: true, requireAuth: false, deadline: null };
    const original = { ...config };
    applyPracticeOverride(config, true);
    expect(config).toEqual(original);
  });
});
```

Add the import at the top of the file (check the existing import line first — this file already imports from `./delivery.service`, extend that same import):

```typescript
import { applyPracticeOverride, evaluateObjectiveAnswer, normalizeSubmissionMode, orderSubmissionAnswersForDisplay, seededShuffle } from './delivery.service';
```

(Adjust to match whatever the file's existing import line actually lists — add `applyPracticeOverride` to it rather than assuming the exact current set of names; read the file first to get the precise existing import list before editing.)

- [ ] **Step 10: Run the tests**

Run: `npm test --workspace=apps/backend -- delivery.service.spec`
Expected: PASS, including the 3 new `applyPracticeOverride` tests.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/delivery/delivery.service.ts apps/backend/src/delivery/delivery.controller.ts apps/backend/src/delivery/delivery.service.spec.ts
git commit -m "feat(delivery): add practice-context override for lesson-practice test-taking"
```

---

### Task 5: `GroupsService.getMyCourseDetail` — student-facing practice summary + completion

**Files:**
- Modify: `apps/backend/src/groups/groups.service.ts`
- Create: `apps/backend/src/practice-blocks/practice-blocks.service.ts` (extend — add student-facing method)
- Create: `apps/backend/src/practice-blocks/practice-blocks.service.spec.ts`

**Interfaces:**
- Consumes: `practiceBlocks`, `lessonCompletions`, `submissions` from `apps/backend/src/db/schema.ts` (Task 1); `PracticeBlocksService` (Task 2).
- Produces: `PracticeBlocksService.computeEarnedScore(latestSubmission: { score: number; total: number } | null, maxScore: number | null): number | null` — pure function, exported for unit testing.
- Produces: `PracticeBlocksService.computeCombinedPercent(blocks: Array<{ maxScore: number | null; earnedScore: number | null }>): number | null` — pure function, exported for unit testing. Returns `null` if the sum of `maxScore` across blocks is 0 (nothing to compute against — avoids divide-by-zero).
- Produces: `PracticeBlocksService.findForStudent(lessonId: string, studentId: string): Promise<StudentPracticeBlock[]>` where `StudentPracticeBlock = { id: string; testId: string | null; testSlug: string | null; testName: string | null; description: string; maxScore: number | null; earnedScore: number | null; submissions: { id: string; submittedAt: string; score: number; total: number }[] }`. `testSlug` is the test's public `/t/:slug` identifier (from `tests.slug`) — Task 8 needs it to link the student directly to that test's practice-mode play/result URLs, since the practice-block API only otherwise exposes the test's UUID `testId`, not its slug.
- Produces: `GroupsService.getMyCourseDetail`'s response gains, per lesson: `practiceBlocks: StudentPracticeBlock[]`, `passThresholdEnabled: boolean`, `passThresholdPercent: number | null`, `completionScore: number | null`, `completed: boolean`, `combinedPracticePercent: number | null`.
- Produces: `POST lessons/:id/complete` route (`@Roles('student')`) → `PracticeBlocksService.markLessonComplete(lessonId: string, studentId: string): Promise<{ completedAt: string }>` — idempotent (returns the existing row's `completedAt` if already marked complete, does not error and does not create a duplicate).

- [ ] **Step 1: Add the pure scoring functions and student-facing query method to `apps/backend/src/practice-blocks/practice-blocks.service.ts`**

Add these imports to the top of the file — find:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
```

Replace with:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks, submissions, lessonCompletions } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
```

Add these exported pure functions right after the imports, before `const PRACTICE_BLOCK_LIMIT = 4;`:

```typescript
export function computeEarnedScore(
  latestSubmission: { score: number; total: number } | null,
  maxScore: number | null,
): number | null {
  if (maxScore === null) return null;
  if (!latestSubmission || latestSubmission.total === 0) return 0;
  return Math.round((latestSubmission.score / latestSubmission.total) * maxScore);
}

export function computeCombinedPercent(
  blocks: Array<{ maxScore: number | null; earnedScore: number | null }>,
): number | null {
  const totalMax = blocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
  if (totalMax === 0) return null;
  const totalEarned = blocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
  return (totalEarned / totalMax) * 100;
}
```

- [ ] **Step 2: Add the student-facing methods to the `PracticeBlocksService` class**

Add these methods inside the class, after `reorder(...)`:

```typescript
  async findForStudent(lessonId: string, studentId: string) {
    const blocks = await db.query.practiceBlocks.findMany({
      where: eq(practiceBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
      with: { test: true },
    });

    return Promise.all(
      blocks.map(async (block) => {
        if (!block.testId) {
          return {
            id: block.id,
            testId: null,
            testSlug: null,
            testName: null,
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: null,
            submissions: [],
          };
        }

        const studentSubmissions = await db.query.submissions.findMany({
          where: and(eq(submissions.testId, block.testId), eq(submissions.userId, studentId)),
          orderBy: [desc(submissions.submittedAt)],
        });
        const completedSubmissions = studentSubmissions.filter((s) => s.submittedAt !== null);
        const latest = completedSubmissions[0] ?? null;
        const earnedScore = computeEarnedScore(
          latest && latest.score !== null && latest.total !== null ? { score: latest.score, total: latest.total } : null,
          block.maxScore,
        );

        return {
          id: block.id,
          testId: block.testId,
          testSlug: block.test?.slug ?? null,
          testName: block.test?.name ?? null,
          description: block.description,
          maxScore: block.maxScore,
          earnedScore,
          submissions: completedSubmissions.map((s) => ({
            id: s.id,
            submittedAt: s.submittedAt!.toISOString(),
            score: s.score ?? 0,
            total: s.total ?? 0,
          })),
        };
      }),
    );
  }

  async markLessonComplete(lessonId: string, studentId: string) {
    const existing = await db.query.lessonCompletions.findFirst({
      where: and(eq(lessonCompletions.lessonId, lessonId), eq(lessonCompletions.studentId, studentId)),
    });
    if (existing) return { completedAt: existing.completedAt!.toISOString() };

    const [created] = await db.insert(lessonCompletions).values({ lessonId, studentId }).returning();
    return { completedAt: created.completedAt!.toISOString() };
  }
```

- [ ] **Step 3: Add the `POST lessons/:id/complete` route to `apps/backend/src/practice-blocks/practice-blocks.controller.ts`**

Add this method to the `PracticeBlocksController` class — note it needs its OWN guard decorator since the class-level `@Roles('teacher', 'super')` doesn't apply to students; add it as a separate route outside the class-level role restriction by giving it its own `@UseGuards`/`@Roles`:

Find the class opening:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PracticeBlocksController {
  constructor(private practiceBlocksService: PracticeBlocksService) {}
```

Replace with:

```typescript
@Controller()
export class PracticeBlocksController {
  constructor(private practiceBlocksService: PracticeBlocksService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('lessons/:lessonId/complete')
  markComplete(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.markLessonComplete(lessonId, req.user.id);
  }
```

Then add `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('teacher', 'super')` decorators individually to EACH of the other 5 existing methods (`findAll`, `create`, `update`, `remove`, `reorder`), since removing the class-level decorator means each teacher route needs its own now. For example:

```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('lessons/:lessonId/practice-blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.findAll(lessonId, req.admin.id);
  }
```

Apply the same two-decorator addition to `create`, `update`, `remove`, and `reorder`.

- [ ] **Step 4: Extend `GroupsService.getMyCourseDetail` in `apps/backend/src/groups/groups.service.ts`**

Find the constructor:

```typescript
  constructor(private studentAccessService: StudentAccessService) {}
```

Replace with:

```typescript
  constructor(
    private studentAccessService: StudentAccessService,
    private practiceBlocksService: PracticeBlocksService,
  ) {}
```

Add the import at the top of the file — find:

```typescript
import { StudentAccessService } from '../payments/student-access.service';
```

Replace with:

```typescript
import { StudentAccessService } from '../payments/student-access.service';
import { PracticeBlocksService, computeCombinedPercent } from '../practice-blocks/practice-blocks.service';
```

Find the lesson-mapping block inside `getMyCourseDetail`:

```typescript
        const lessonRows = await Promise.all(
          moduleLessons.map(async (lesson) => {
            const blocks = await db.query.contentBlocks.findMany({
              where: eq(contentBlocks.lessonId, lesson.id),
              orderBy: [asc(contentBlocks.orderIndex), asc(contentBlocks.createdAt)],
            });
            return {
              ...lesson,
              blocks: blocks.map((block) => ({
                id: block.id,
                lessonId: block.lessonId,
                type: block.type,
                orderIndex: block.orderIndex,
                html: block.html,
                fileName: block.fileName,
                previewUrl: block.previewUrl,
                embedUrl: block.embedUrl,
                label: block.label,
                processingStatus: block.processingStatus,
                sourceKey: null,
                hlsMasterKey: null,
                hlsBaseKey: null,
                aesKeyRef: null,
                durationSec: block.durationSec,
                errorMessage: null,
                processedAt: block.processedAt,
                createdAt: block.createdAt,
              })),
            };
          }),
        );
```

Replace with:

```typescript
        const lessonRows = await Promise.all(
          moduleLessons.map(async (lesson) => {
            const blocks = await db.query.contentBlocks.findMany({
              where: eq(contentBlocks.lessonId, lesson.id),
              orderBy: [asc(contentBlocks.orderIndex), asc(contentBlocks.createdAt)],
            });
            const studentPracticeBlocks = await this.practiceBlocksService.findForStudent(lesson.id, studentId);
            const combinedPracticePercent = computeCombinedPercent(studentPracticeBlocks);
            const completion = await db.query.lessonCompletions.findFirst({
              where: and(eq(lessonCompletions.lessonId, lesson.id), eq(lessonCompletions.studentId, studentId)),
            });
            return {
              ...lesson,
              blocks: blocks.map((block) => ({
                id: block.id,
                lessonId: block.lessonId,
                type: block.type,
                orderIndex: block.orderIndex,
                html: block.html,
                fileName: block.fileName,
                previewUrl: block.previewUrl,
                embedUrl: block.embedUrl,
                label: block.label,
                processingStatus: block.processingStatus,
                sourceKey: null,
                hlsMasterKey: null,
                hlsBaseKey: null,
                aesKeyRef: null,
                durationSec: block.durationSec,
                errorMessage: null,
                processedAt: block.processedAt,
                createdAt: block.createdAt,
              })),
              practiceBlocks: studentPracticeBlocks,
              passThresholdEnabled: lesson.passThresholdEnabled,
              passThresholdPercent: lesson.passThresholdPercent,
              completionScore: lesson.completionScore,
              completed: !!completion,
              combinedPracticePercent,
            };
          }),
        );
```

Add the `lessonCompletions` import to the schema import line — find:

```typescript
import { contentBlocks, courses, groups, groupEnrollments, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools } from '../db/schema';
```

Replace with:

```typescript
import { contentBlocks, courses, groups, groupEnrollments, lessonCompletions, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools } from '../db/schema';
```

- [ ] **Step 5: Register `PracticeBlocksService` as a provider for `GroupsModule`**

Read `apps/backend/src/groups/groups.module.ts` first to see its current imports/providers list, then add `PracticeBlocksModule` to its `imports` array (NestJS modules must import the module that exports a service before injecting that service — `PracticeBlocksService` is a provider of `PracticeBlocksModule`, so `GroupsModule` needs to import `PracticeBlocksModule` to inject it). If `PracticeBlocksModule` doesn't export `PracticeBlocksService` yet, add `exports: [PracticeBlocksService]` to `apps/backend/src/practice-blocks/practice-blocks.module.ts`.

- [ ] **Step 6: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with zero errors. If there's a circular-dependency error between `GroupsModule` and `PracticeBlocksModule`, resolve it by confirming `PracticeBlocksModule` does NOT import `GroupsModule` (it shouldn't need to) — the dependency should be one-directional (`GroupsModule` → `PracticeBlocksModule`).

- [ ] **Step 7: Write `apps/backend/src/practice-blocks/practice-blocks.service.spec.ts`**

```typescript
import { computeCombinedPercent, computeEarnedScore } from './practice-blocks.service';

describe('computeEarnedScore', () => {
  it('returns null when maxScore is null (unscored block)', () => {
    expect(computeEarnedScore({ score: 8, total: 10 }, null)).toBeNull();
  });

  it('returns 0 when there is no submission yet', () => {
    expect(computeEarnedScore(null, 38)).toBe(0);
  });

  it('returns the proportional score rounded to the nearest integer', () => {
    expect(computeEarnedScore({ score: 8, total: 10 }, 38)).toBe(30); // 0.8 * 38 = 30.4 -> 30
  });

  it('returns 0 when the latest submission has total 0 (avoids divide by zero)', () => {
    expect(computeEarnedScore({ score: 0, total: 0 }, 38)).toBe(0);
  });

  it('returns full maxScore for a perfect submission', () => {
    expect(computeEarnedScore({ score: 10, total: 10 }, 38)).toBe(38);
  });
});

describe('computeCombinedPercent', () => {
  it('returns null when all blocks are unscored (total max is 0)', () => {
    expect(computeCombinedPercent([{ maxScore: null, earnedScore: null }])).toBeNull();
  });

  it('returns null for an empty block list', () => {
    expect(computeCombinedPercent([])).toBeNull();
  });

  it('computes the combined percentage across multiple scored blocks', () => {
    // 30/38 + 10/28 combined = 40/66 = ~60.6%
    const result = computeCombinedPercent([
      { maxScore: 38, earnedScore: 30 },
      { maxScore: 28, earnedScore: 10 },
    ]);
    expect(result).toBeCloseTo(60.606, 2);
  });

  it('ignores unscored blocks (null maxScore) when mixed with scored ones', () => {
    const result = computeCombinedPercent([
      { maxScore: 38, earnedScore: 19 },
      { maxScore: null, earnedScore: null },
    ]);
    expect(result).toBe(50);
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npm test --workspace=apps/backend -- practice-blocks.service.spec`
Expected: PASS, all 9 tests.

Run: `npm test --workspace=apps/backend`
Expected: full suite still passes (no regressions), count is the prior total (98) + 3 (`applyPracticeOverride` from Task 4) + 9 (this task) = 110.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/practice-blocks apps/backend/src/groups/groups.service.ts apps/backend/src/groups/groups.module.ts
git commit -m "feat(practice-blocks): add student-facing practice summary, lesson completion tracking"
```

---

### Task 6: Frontend — `courseStore.ts` async practice actions + `Lesson.completionScore`

**Files:**
- Create: `apps/frontend/src/api/practiceBlocks.ts`
- Modify: `apps/frontend/src/api/lessons.ts`
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Produces: `apiListPracticeBlocks(lessonId): Promise<ApiPracticeBlock[]>`, `apiCreatePracticeBlock(lessonId): Promise<ApiPracticeBlock>`, `apiUpdatePracticeBlock(id, data): Promise<ApiPracticeBlock>`, `apiDeletePracticeBlock(id): Promise<void>`, `apiReorderPracticeBlocks(lessonId, blockIds): Promise<void>` in `apps/frontend/src/api/practiceBlocks.ts`.
- Produces: `ApiPracticeBlock { id: string; lessonId: string; testId: string | null; orderIndex: number; description: string; maxScore: number | null }`.
- Consumes: `POST/PATCH/DELETE lessons/:id/practice-blocks`, `PATCH practice-blocks/:id`, `DELETE practice-blocks/:id`, `POST lessons/:id/practice-blocks/reorder` (Task 2).
- Produces: `Lesson.completionScore: number | null` added to the frontend `Lesson` interface in `courseStore.ts`.
- Produces: `courseStore.ts`'s `addPracticeBlock`, `removePracticeBlock`, `movePracticeBlock`, `setPracticeBlockTest`, `setPracticeBlockDescription`, `setPassThreshold` all become `Promise<void>` (same names/params otherwise, matching what `PracticeSection.tsx` already calls — no changes needed to `PracticeSection.tsx`/`PracticeBlockView.tsx`/`PracticeBlockPicker.tsx`).
- Produces: new `setLessonCompletionScore: (courseId: string, moduleId: string, lessonId: string, score: number | null) => Promise<void>` action.

- [ ] **Step 1: Create `apps/frontend/src/api/practiceBlocks.ts`**

```typescript
import client from './client';

export interface ApiPracticeBlock {
  id: string;
  lessonId: string;
  testId: string | null;
  orderIndex: number;
  description: string;
  maxScore: number | null;
}

export async function apiListPracticeBlocks(lessonId: string): Promise<ApiPracticeBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/practice-blocks`);
  return res.data;
}

export async function apiCreatePracticeBlock(lessonId: string): Promise<ApiPracticeBlock> {
  const res = await client.post(`/lessons/${lessonId}/practice-blocks`, { type: 'test' });
  return res.data;
}

export async function apiUpdatePracticeBlock(
  id: string,
  data: { testId?: string | null; description?: string; maxScore?: number | null },
): Promise<ApiPracticeBlock> {
  const res = await client.patch(`/practice-blocks/${id}`, data);
  return res.data;
}

export async function apiDeletePracticeBlock(id: string): Promise<void> {
  await client.delete(`/practice-blocks/${id}`);
}

export async function apiReorderPracticeBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/practice-blocks/reorder`, { blockIds });
}
```

- [ ] **Step 2: Extend `apps/frontend/src/api/lessons.ts`**

Find:

```typescript
export async function apiUpdateLesson(id: string, data: { title?: string; status?: string }): Promise<ApiLesson> {
  const res = await client.patch(`/lessons/${id}`, data);
  return res.data;
}
```

Replace with:

```typescript
export async function apiUpdateLesson(
  id: string,
  data: {
    title?: string;
    status?: string;
    passThresholdEnabled?: boolean;
    passThresholdPercent?: number | null;
    completionScore?: number | null;
  },
): Promise<ApiLesson> {
  const res = await client.patch(`/lessons/${id}`, data);
  return res.data;
}
```

Also add the 3 new fields to the `ApiLesson` interface — find:

```typescript
export interface ApiLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
}
```

Replace with:

```typescript
export interface ApiLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
  createdAt: string;
}
```

- [ ] **Step 3: Edit `apps/frontend/src/stores/courseStore.ts` — imports**

Find:

```typescript
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
```

Replace with:

```typescript
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
import {
  apiListPracticeBlocks, apiCreatePracticeBlock, apiUpdatePracticeBlock,
  apiDeletePracticeBlock, apiReorderPracticeBlocks, type ApiPracticeBlock,
} from '../api/practiceBlocks';
```

- [ ] **Step 4: Add `completionScore` to the `Lesson` interface**

Find:

```typescript
  practiceEnabled: boolean;
  practiceBlocks: PracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
}
```

Replace with:

```typescript
  practiceEnabled: boolean;
  practiceBlocks: PracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
}
```

- [ ] **Step 5: Update `loadCourses`'s lesson-mapping to fetch real practice blocks and lesson score fields**

Find:

```typescript
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = await Promise.all(
              lessonRows.map(async (l) => {
                const blockRows = await apiListBlocks(l.id);
                const blocks: ContentBlock[] = blockRows.map(toFrontendBlock);
                return {
                  id: l.id,
                  title: l.title,
                  orderIndex: l.orderIndex,
                  status: l.status,
                  blocks,
                  practiceEnabled: false,
                  practiceBlocks: [],
                  passThresholdEnabled: false,
                  passThresholdPercent: null,
                };
              }),
            );
```

Replace with:

```typescript
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = await Promise.all(
              lessonRows.map(async (l) => {
                const [blockRows, practiceBlockRows] = await Promise.all([
                  apiListBlocks(l.id),
                  apiListPracticeBlocks(l.id),
                ]);
                const blocks: ContentBlock[] = blockRows.map(toFrontendBlock);
                const practiceBlocks: PracticeBlock[] = practiceBlockRows.map(toFrontendPracticeBlock);
                return {
                  id: l.id,
                  title: l.title,
                  orderIndex: l.orderIndex,
                  status: l.status,
                  blocks,
                  practiceEnabled: practiceBlockRows.length > 0,
                  practiceBlocks,
                  passThresholdEnabled: l.passThresholdEnabled,
                  passThresholdPercent: l.passThresholdPercent,
                  completionScore: l.completionScore,
                };
              }),
            );
```

- [ ] **Step 6: Add the `toFrontendPracticeBlock` helper**

Find the existing `toFrontendBlock` helper function (near the top of the file, after `toFrontendCourse`), and add this new helper immediately after it:

```typescript
function toFrontendPracticeBlock(b: ApiPracticeBlock): PracticeBlock {
  return {
    id: b.id,
    type: 'test',
    testId: b.testId,
    description: b.description,
  };
}
```

- [ ] **Step 7: Update `addLesson`'s local-construction to include `completionScore`**

Find:

```typescript
    const lesson: Lesson = {
      id: row.id,
      title: row.title,
      orderIndex: row.orderIndex,
      status: row.status,
      blocks: [],
      practiceEnabled: false,
      practiceBlocks: [],
      passThresholdEnabled: false,
      passThresholdPercent: null,
    };
```

Replace with:

```typescript
    const lesson: Lesson = {
      id: row.id,
      title: row.title,
      orderIndex: row.orderIndex,
      status: row.status,
      blocks: [],
      practiceEnabled: false,
      practiceBlocks: [],
      passThresholdEnabled: false,
      passThresholdPercent: null,
      completionScore: null,
    };
```

- [ ] **Step 8: Rewrite the 6 practice-block actions as async, plus add `setLessonCompletionScore`**

Find the entire block from `setLessonPracticeEnabled:` through the end of `setPassThreshold:` (this spans from the line starting `setLessonPracticeEnabled: (courseId, moduleId, lessonId, enabled) => {` down to the closing `},` right before the blank line and `addLaunch: async (courseId, name) => {`). Replace that ENTIRE block with:

```typescript
  setLessonPracticeEnabled: (courseId, moduleId, lessonId, enabled) => {
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
                        l.id === lessonId ? { ...l, practiceEnabled: enabled } : l,
                      ),
                    },
              ),
            },
      ),
    });
  },
  addPracticeBlock: async (courseId, moduleId, lessonId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.practiceBlocks.length >= PRACTICE_BLOCK_LIMIT) return;

    const row = await apiCreatePracticeBlock(lessonId);
    const block = toFrontendPracticeBlock(row);
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
                        l.id !== lessonId ? l : { ...l, practiceBlocks: [...l.practiceBlocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removePracticeBlock: async (courseId, moduleId, lessonId, blockId) => {
    await apiDeletePracticeBlock(blockId);
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
                          : { ...l, practiceBlocks: l.practiceBlocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  movePracticeBlock: async (courseId, moduleId, lessonId, blockId, direction) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const index = lesson.practiceBlocks.findIndex((b) => b.id === blockId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= lesson.practiceBlocks.length) return;
    const reordered = [...lesson.practiceBlocks];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

    await apiReorderPracticeBlocks(lessonId, reordered.map((b) => b.id));
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
                        l.id !== lessonId ? l : { ...l, practiceBlocks: reordered },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPracticeBlockTest: async (courseId, moduleId, lessonId, blockId, testId) => {
    await apiUpdatePracticeBlock(blockId, { testId });
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
                          : {
                              ...l,
                              practiceBlocks: l.practiceBlocks.map((b) =>
                                b.id === blockId ? { ...b, testId } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPracticeBlockDescription: async (courseId, moduleId, lessonId, blockId, description) => {
    await apiUpdatePracticeBlock(blockId, { description });
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
                          : {
                              ...l,
                              practiceBlocks: l.practiceBlocks.map((b) =>
                                b.id === blockId ? { ...b, description } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPassThreshold: async (courseId, moduleId, lessonId, data) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const nextPercent = data.enabled ? (data.percent ?? lesson.passThresholdPercent) : null;

    await apiUpdateLesson(lessonId, { passThresholdEnabled: data.enabled, passThresholdPercent: nextPercent });
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
                          : {
                              ...l,
                              passThresholdEnabled: data.enabled,
                              passThresholdPercent: nextPercent,
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setLessonCompletionScore: async (courseId, moduleId, lessonId, score) => {
    await apiUpdateLesson(lessonId, { completionScore: score });
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
                        l.id !== lessonId ? l : { ...l, completionScore: score },
                      ),
                    },
              ),
            },
      ),
    });
  },

```

Note: `addPracticeBlock`'s signature drops the `type` parameter it used to take (`(courseId, moduleId, lessonId, type)` → `(courseId, moduleId, lessonId)`), since the backend only ever creates `type: 'test'` blocks now (per Global Constraints — only `test` is wired this pass). Update the `CourseState` interface accordingly in the next step, and note that `PracticeBlockPicker`'s `onPickType={(type) => addPracticeBlock(courseId, moduleId, lessonId, type)}` call in `PracticeSection.tsx` needs to change too — that's covered in Step 10 below.

- [ ] **Step 9: Update the `CourseState` interface signatures**

Find:

```typescript
  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string, type: PracticeBlockType) => void;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => void;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;
```

Replace with:

```typescript
  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string) => Promise<void>;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => Promise<void>;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => Promise<void>;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => Promise<void>;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => Promise<void>;
  setLessonCompletionScore: (courseId: string, moduleId: string, lessonId: string, score: number | null) => Promise<void>;
```

- [ ] **Step 10: Update `PracticeSection.tsx`'s call to `addPracticeBlock`**

Read `apps/frontend/src/components/course/PracticeSection.tsx` first to confirm the current exact line, then find:

```typescript
          onPickType={(type) => addPracticeBlock(courseId, moduleId, lessonId, type)}
```

Replace with:

```typescript
          onPickType={(type) => { if (type === 'test') void addPracticeBlock(courseId, moduleId, lessonId); }}
```

This preserves `PracticeBlockPicker`'s existing 4-button UI (so `image`/`file`/`audio` buttons still render and are clickable without crashing) while only wiring the `test` button to the real backend call — clicking `image`/`file`/`audio` is now a silent no-op, consistent with "not wired this pass" rather than removing those buttons outright (removing them is out of scope for this plan; a future pass wires them or removes them deliberately).

- [ ] **Step 11: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS with zero TypeScript errors. If `PracticeBlockView.tsx` or other consumers show type errors from the now-`Promise<void>`-returning actions, check whether they already wrap calls in `void ...(...)` (matching the pattern used for every other async store action in this codebase, e.g. `onSelectTest={(testId) => setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)}` in `PracticeSection.tsx` — this doesn't need a `void` prefix added since a bare expression-statement call already discards the promise without a lint error in this codebase's existing config, matching how `onRemove={() => removePracticeBlock(...)}` already worked before this task for the (already-async) `removeStudentFromGroup`-style patterns elsewhere in the file).

- [ ] **Step 12: Commit**

```bash
git add apps/frontend/src/api/practiceBlocks.ts apps/frontend/src/api/lessons.ts apps/frontend/src/stores/courseStore.ts apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "feat(practice): wire courseStore practice-block actions to real backend"
```

---

### Task 7: Frontend — practice-context test-taking (`?practice=1`)

**Files:**
- Modify: `apps/frontend/src/api/delivery.ts`
- Modify: `apps/frontend/src/pages/TakeTestEntryPage.tsx`
- Modify: `apps/frontend/src/pages/TakeTestPage.tsx`

**Interfaces:**
- Consumes: `?practice=1` query param support on `GET /public/tests/:slug`, `POST /public/submissions`, `GET /public/submissions/:id`, `GET /public/submissions/:id/result`, `POST /public/submissions/:id/submit` (Task 4).
- Produces: `apiGetPublicTest(slug, practiceMode?)`, `apiStartSubmission(slug, studentName, practiceMode?)`, `apiGetSubmission(submissionId, practiceMode?)`, `apiGetSubmissionResult(submissionId, practiceMode?)`, `apiSubmitAnswers(submissionId, answers, mode?, violationReason?, practiceMode?)` — each gains an optional trailing boolean parameter, default `false`, matching every existing call site with no changes needed elsewhere in the codebase that doesn't pass it.

- [ ] **Step 1: Edit `apps/frontend/src/api/delivery.ts`**

Find:

```typescript
export async function apiGetPublicTest(slug: string): Promise<PublicTest> {
  const res = await publicClient.get(`/public/tests/${slug}`);
  return res.data;
}
```

Replace with:

```typescript
export async function apiGetPublicTest(slug: string, practiceMode = false): Promise<PublicTest> {
  const res = await publicClient.get(`/public/tests/${slug}`, { params: practiceMode ? { practice: '1' } : undefined });
  return res.data;
}
```

Find:

```typescript
export async function apiGetSubmission(submissionId: string): Promise<
  | { status: 'in_progress'; testId: string; studentName: string }
  | {
      status: 'submitted';
      score: number;
      total: number;
      showResults: string;
      deadline: string | null;
      mode?: 'normal' | 'violation' | 'live';
      violationReason?: string | null;
    }
> {
  const res = await publicClient.get(`/public/submissions/${submissionId}`);
  return res.data;
}
```

Replace with:

```typescript
export async function apiGetSubmission(submissionId: string, practiceMode = false): Promise<
  | { status: 'in_progress'; testId: string; studentName: string }
  | {
      status: 'submitted';
      score: number;
      total: number;
      showResults: string;
      deadline: string | null;
      mode?: 'normal' | 'violation' | 'live';
      violationReason?: string | null;
    }
> {
  const res = await publicClient.get(`/public/submissions/${submissionId}`, { params: practiceMode ? { practice: '1' } : undefined });
  return res.data;
}
```

Find:

```typescript
export async function apiGetSubmissionResult(submissionId: string): Promise<SubmissionResult> {
  const res = await publicClient.get(`/public/submissions/${submissionId}/result`);
  return res.data;
}
```

Replace with:

```typescript
export async function apiGetSubmissionResult(submissionId: string, practiceMode = false): Promise<SubmissionResult> {
  const res = await publicClient.get(`/public/submissions/${submissionId}/result`, { params: practiceMode ? { practice: '1' } : undefined });
  return res.data;
}
```

Find:

```typescript
export async function apiStartSubmission(slug: string, studentName: string): Promise<{ submissionId: string }> {
  const res = await publicClient.post('/public/submissions', { slug, studentName });
  return res.data;
}
```

Replace with:

```typescript
export async function apiStartSubmission(slug: string, studentName: string, practiceMode = false): Promise<{ submissionId: string }> {
  const res = await publicClient.post('/public/submissions', { slug, studentName }, { params: practiceMode ? { practice: '1' } : undefined });
  return res.data;
}
```

Find:

```typescript
export async function apiSubmitAnswers(
  submissionId: string,
  answers: Array<{ questionId: string; selectedOptionIds: string[]; textAnswer: string | null }>,
  mode: 'normal' | 'violation' = 'normal',
  violationReason?: string | null,
): Promise<SubmissionResult> {
  const res = await publicClient.post(`/public/submissions/${submissionId}/submit`, { answers, mode, violationReason });
  return res.data;
}
```

Replace with:

```typescript
export async function apiSubmitAnswers(
  submissionId: string,
  answers: Array<{ questionId: string; selectedOptionIds: string[]; textAnswer: string | null }>,
  mode: 'normal' | 'violation' = 'normal',
  violationReason?: string | null,
  practiceMode = false,
): Promise<SubmissionResult> {
  const res = await publicClient.post(
    `/public/submissions/${submissionId}/submit`,
    { answers, mode, violationReason },
    { params: practiceMode ? { practice: '1' } : undefined },
  );
  return res.data;
}
```

- [ ] **Step 2: Edit `apps/frontend/src/pages/TakeTestEntryPage.tsx`**

Find:

```typescript
export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
```

Replace with:

```typescript
export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isPractice = searchParams.get("practice") === "1";
```

Find:

```typescript
  useEffect(() => {
    if (!slug) return;
    const sid = searchParams.get("sid");
    if (sid) {
      apiGetSubmission(sid)
        .then((sub) => {
          if (sub.status === "submitted") {
            navigate(`/t/${slug}/result?sid=${sid}`, { replace: true });
          } else {
            navigate(`/t/${slug}/take?sid=${sid}`, { replace: true });
          }
        })
        .catch(() => {
          apiGetPublicTest(slug)
            .then(setTest)
            .catch(() => setError("Test topilmadi."))
            .finally(() => setLoading(false));
        });
      return;
    }
    apiGetPublicTest(slug)
      .then(setTest)
      .catch(() => setError("Test topilmadi."))
      .finally(() => setLoading(false));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:

```typescript
  useEffect(() => {
    if (!slug) return;
    const sid = searchParams.get("sid");
    const practiceSuffix = isPractice ? "&practice=1" : "";
    if (sid) {
      apiGetSubmission(sid, isPractice)
        .then((sub) => {
          if (sub.status === "submitted") {
            navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`, { replace: true });
          } else {
            navigate(`/t/${slug}/take?sid=${sid}${practiceSuffix}`, { replace: true });
          }
        })
        .catch(() => {
          apiGetPublicTest(slug, isPractice)
            .then(setTest)
            .catch(() => setError("Test topilmadi."))
            .finally(() => setLoading(false));
        });
      return;
    }
    apiGetPublicTest(slug, isPractice)
      .then(setTest)
      .catch(() => setError("Test topilmadi."))
      .finally(() => setLoading(false));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
```

Find:

```typescript
  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(slug, name.trim());
      navigate(`/t/${slug}/take?sid=${submissionId}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg === "AUTH_REQUIRED") {
        navigate(`/login?redirect=/t/${slug}`);
      } else {
        setError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    } finally {
      setStarting(false);
    }
  }
```

Replace with:

```typescript
  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(slug, name.trim(), isPractice);
      navigate(`/t/${slug}/take?sid=${submissionId}${isPractice ? "&practice=1" : ""}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg === "AUTH_REQUIRED") {
        navigate(`/login?redirect=${encodeURIComponent(`/t/${slug}${isPractice ? "?practice=1" : ""}`)}`);
      } else {
        setError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    } finally {
      setStarting(false);
    }
  }
```

- [ ] **Step 3: Edit `apps/frontend/src/pages/TakeTestPage.tsx`**

Find:

```typescript
export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get("sid") ?? "";
```

Replace with:

```typescript
export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get("sid") ?? "";
  const isPractice = searchParams.get("practice") === "1";
  const practiceSuffix = isPractice ? "&practice=1" : "";
```

Find:

```typescript
  useEffect(() => {
    if (!slug || !submissionId) return;
    apiGetSubmission(submissionId)
      .then((sub) => {
        if (sub.status === "submitted") {
          navigate(`/t/${slug}/result?sid=${submissionId}`, { replace: true });
        }
      })
      .catch(() => {
        navigate(`/t/${slug}`, { replace: true });
      });
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:

```typescript
  useEffect(() => {
    if (!slug || !submissionId) return;
    apiGetSubmission(submissionId, isPractice)
      .then((sub) => {
        if (sub.status === "submitted") {
          navigate(`/t/${slug}/result?sid=${submissionId}${practiceSuffix}`, { replace: true });
        }
      })
      .catch(() => {
        navigate(`/t/${slug}`, { replace: true });
      });
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps
```

Find:

```typescript
  useEffect(() => {
    if (!slug) return;
    apiGetPublicTest(slug).then((t) => {
```

Replace with:

```typescript
  useEffect(() => {
    if (!slug) return;
    apiGetPublicTest(slug, isPractice).then((t) => {
```

Find (inside `handleSubmit`):

```typescript
    try {
      const result = await apiSubmitAnswers(submissionId, answers);
      sessionStorage.setItem("submissionResult", JSON.stringify(result));
      localStorage.removeItem(draftKey(submissionId));
      navigate(`/t/${slug}/result?sid=${submissionId}`, { replace: true });
    } catch {
```

Replace with:

```typescript
    try {
      const result = await apiSubmitAnswers(submissionId, answers, "normal", undefined, isPractice);
      sessionStorage.setItem("submissionResult", JSON.stringify(result));
      localStorage.removeItem(draftKey(submissionId));
      navigate(`/t/${slug}/result?sid=${submissionId}${practiceSuffix}`, { replace: true });
    } catch {
```

Find (inside the `visibilitychange` auto-submit handler's beacon fallback):

```typescript
      const base = getPublicBaseUrl() || window.location.origin;
      const url = `${base}/public/submissions/${submissionId}/submit`;
```

Replace with:

```typescript
      const base = getPublicBaseUrl() || window.location.origin;
      const url = `${base}/public/submissions/${submissionId}/submit${isPractice ? "?practice=1" : ""}`;
```

Find (further down in the same handler, the `handleVisibility` result-check after a beacon fires):

```typescript
        setTimeout(() => {
          apiGetSubmission(submissionId)
            .then((sub) => {
              if (sub.status === "submitted")
                navigate(`/t/${slug}/result?sid=${submissionId}`, {
                  replace: true,
                });
              else autoSubmitSentRef.current = false;
            })
            .catch(() => {});
        }, 800);
```

Replace with:

```typescript
        setTimeout(() => {
          apiGetSubmission(submissionId, isPractice)
            .then((sub) => {
              if (sub.status === "submitted")
                navigate(`/t/${slug}/result?sid=${submissionId}${practiceSuffix}`, {
                  replace: true,
                });
              else autoSubmitSentRef.current = false;
            })
            .catch(() => {});
        }, 800);
```

- [ ] **Step 4: Edit `apps/frontend/src/pages/TestResultPage.tsx`**

This page primarily reads its result from `sessionStorage` (already set by `TakeTestPage`'s `handleSubmit`) and only calls `apiGetSubmissionResult` as a fallback (e.g. on a hard page refresh where `sessionStorage` is empty). Only that fallback call needs the practice flag.

Find:

```typescript
export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const sid = searchParams.get("sid");
    const raw = sessionStorage.getItem("submissionResult");
    const cachedResult = getCachedSubmissionResult(raw, sid);
    if (cachedResult) {
      setResult(cachedResult);
      sessionStorage.removeItem("submissionResult");
      if (sid) localStorage.removeItem(`test-draft:${sid}`);
      return;
    }
    if (raw) sessionStorage.removeItem("submissionResult");
    if (sid) {
      apiGetSubmissionResult(sid)
        .then((res) => {
          setResult(res);
          localStorage.removeItem(`test-draft:${sid}`);
```

Replace with:

```typescript
export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const isPractice = searchParams.get("practice") === "1";

  useEffect(() => {
    const sid = searchParams.get("sid");
    const raw = sessionStorage.getItem("submissionResult");
    const cachedResult = getCachedSubmissionResult(raw, sid);
    if (cachedResult) {
      setResult(cachedResult);
      sessionStorage.removeItem("submissionResult");
      if (sid) localStorage.removeItem(`test-draft:${sid}`);
      return;
    }
    if (raw) sessionStorage.removeItem("submissionResult");
    if (sid) {
      apiGetSubmissionResult(sid, isPractice)
        .then((res) => {
          setResult(res);
          localStorage.removeItem(`test-draft:${sid}`);
```

Read the rest of the `useEffect` body (a few lines below this point, ending the `.then(...)` chain and its `.catch`/dependency array) to confirm no other `apiGetSubmissionResult` or related call exists in this file — if there is exactly one call site (the one just edited), no further changes are needed in this file.

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS with zero TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/delivery.ts apps/frontend/src/pages/TakeTestEntryPage.tsx apps/frontend/src/pages/TakeTestPage.tsx apps/frontend/src/pages/TestResultPage.tsx
git commit -m "feat(delivery): thread practice-context flag through frontend test-taking flow"
```

---

### Task 8: Frontend — student practice screen in `MyCoursesPage.tsx`

**Files:**
- Create: `apps/frontend/src/components/student/PracticeScreen.tsx`
- Modify: `apps/frontend/src/api/groups.ts`
- Modify: `apps/frontend/src/pages/MyCoursesPage.tsx`

**Interfaces:**
- Consumes: `GET my/courses/:courseId`'s extended response (Task 5) — each lesson now includes `practiceBlocks` (each with `testSlug`), `passThresholdEnabled`, `passThresholdPercent`, `completionScore`, `completed`, `combinedPracticePercent`.
- Consumes: `POST lessons/:id/complete` (Task 5).
- Produces: `apiMarkLessonComplete(lessonId: string): Promise<{ completedAt: string }>` in `apps/frontend/src/api/groups.ts`.
- Produces: `<PracticeScreen lesson={...} onBack={...} onStartPractice={...} onViewSubmission={...} />` component, self-contained.
- Both `/t/:slug`, `/t/:slug/take`, `/t/:slug/result` (test-taking) and the student dashboard routes share the same `createBrowserRouter` instance (confirmed in `apps/frontend/src/App.tsx`), so navigation between them uses React Router's `useNavigate()`, not a full page reload.

- [ ] **Step 1: Extend `apps/frontend/src/api/groups.ts`'s `ApiMyLesson` type and add `apiMarkLessonComplete`**

Read the file first to confirm the exact current `ApiMyLesson` interface. Find:

```typescript
export interface ApiMyLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
  blocks: ApiContentBlock[];
}
```

Replace with:

```typescript
export interface ApiMyPracticeSubmission {
  id: string;
  submittedAt: string;
  score: number;
  total: number;
}

export interface ApiMyPracticeBlock {
  id: string;
  testId: string | null;
  testSlug: string | null;
  testName: string | null;
  description: string;
  maxScore: number | null;
  earnedScore: number | null;
  submissions: ApiMyPracticeSubmission[];
}

export interface ApiMyLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
  blocks: ApiContentBlock[];
  practiceBlocks: ApiMyPracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
  completionScore: number | null;
  completed: boolean;
  combinedPracticePercent: number | null;
}
```

Add this function at the end of the file:

```typescript
export async function apiMarkLessonComplete(lessonId: string): Promise<{ completedAt: string }> {
  const res = await client.post(`/lessons/${lessonId}/complete`);
  return res.data;
}
```

- [ ] **Step 2: Create `apps/frontend/src/components/student/PracticeScreen.tsx`**

```typescript
import { CheckCircle2, ChevronLeft, Star } from 'lucide-react';
import type { ApiMyLesson, ApiMyPracticeBlock } from '../../api/groups';

interface PracticeScreenProps {
  lesson: ApiMyLesson;
  onBack: () => void;
  onStartPractice: (block: ApiMyPracticeBlock) => void;
  onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void;
}

function practiceMaxScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
}

function practiceEarnedScore(lesson: ApiMyLesson): number {
  return lesson.practiceBlocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
}

export function PracticeScreen({ lesson, onBack, onStartPractice, onViewSubmission }: PracticeScreenProps) {
  const hasCompletionScore = lesson.completionScore !== null;
  const hasPracticeScore = lesson.practiceBlocks.some((b) => b.maxScore !== null);
  const totalMax = practiceMaxScore(lesson) + (lesson.completionScore ?? 0);
  const totalEarned = practiceEarnedScore(lesson) + (lesson.completed ? (lesson.completionScore ?? 0) : 0);

  return (
    <article className="mx-auto w-full max-w-3xl pb-12">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500"
      >
        <ChevronLeft size={16} /> Darsga qaytish
      </button>

      <h1 className="mb-4 text-3xl font-black text-gray-950">Amaliy qism</h1>

      {totalMax > 0 && (
        <div className="mb-6 rounded-2xl bg-gray-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-500">
              <Star size={13} fill="currentColor" /> {totalEarned} / {totalMax}
            </span>
            <span className="text-xs font-semibold text-gray-500">Dars uchun yulduzlar yig'ildi</span>
          </div>
          <div className="flex flex-col gap-2">
            {hasPracticeScore && (
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-semibold">
                <span className="text-gray-600">Amaliyot</span>
                <span className="text-amber-500">{practiceEarnedScore(lesson)} / {practiceMaxScore(lesson)}</span>
              </div>
            )}
            {hasCompletionScore && (
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-semibold">
                <span className="text-gray-600">Darsni tamomlash</span>
                <span className="text-amber-500">{lesson.completed ? lesson.completionScore : 0} / {lesson.completionScore}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {lesson.practiceBlocks.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 py-16 text-center text-gray-400">
          <p className="text-sm font-semibold">Bu darsda amaliyot topshiriqlari yo'q</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {lesson.practiceBlocks.map((block) => (
            <div key={block.id} className="rounded-2xl bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-gray-900">{block.testName ?? 'Test tanlanmagan'}</p>
                {block.maxScore !== null && (
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-500">
                    {block.earnedScore ?? 0} / {block.maxScore}
                  </span>
                )}
              </div>

              {block.submissions.length > 0 && (
                <div className="mb-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-gray-500">Sizning natijalaringiz</p>
                  {block.submissions.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800">
                          Urinish {block.submissions.length - i} <span className="font-normal text-gray-400">• {s.score}/{s.total}</span>
                        </p>
                        <p className="text-[11px] text-gray-400">{new Date(s.submittedAt).toLocaleDateString('uz-UZ')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewSubmission(block, s.id)}
                        className="shrink-0 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
                      >
                        Ochish
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {block.testSlug ? (
                <button
                  type="button"
                  onClick={() => onStartPractice(block)}
                  className="w-full rounded-xl bg-[var(--color-indigo-500)] py-2.5 text-xs font-bold text-white"
                >
                  Qayta o'tish
                </button>
              ) : (
                <p className="text-xs font-semibold text-gray-400">Bu topshiriq hali tayyor emas</p>
              )}
            </div>
          ))}
        </div>
      )}

      {lesson.completed && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-600">
          <CheckCircle2 size={18} /> Dars tamomlangan
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Add the practice-screen import and `showPractice` state to `MyCoursesPage.tsx`**

Read `apps/frontend/src/pages/MyCoursesPage.tsx` in full first to confirm exact current content (Tasks 6/7 in this plan don't touch this file, but confirm no drift before editing).

Find:

```typescript
import { ImageLightbox } from '../components/student/ImageLightbox';
```

Replace with:

```typescript
import { useNavigate } from 'react-router-dom';
import { ImageLightbox } from '../components/student/ImageLightbox';
import { PracticeScreen } from '../components/student/PracticeScreen';
import { apiMarkLessonComplete, type ApiMyPracticeBlock } from '../api/groups';
```

Find:

```typescript
function StudentCourseReader({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
```

Replace with:

```typescript
function StudentCourseReader({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<ApiMyCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
  const [showPractice, setShowPractice] = useState(false);
```

- [ ] **Step 4: Replace the `main` render block to switch between `LessonReader` and `PracticeScreen`**

Find:

```typescript
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
          {selected && (
            <LessonReader
              lesson={selected.lesson}
              moduleTitle={selected.module.title}
              curatorName={course.curatorName}
              lessonNumber={selectedIndex + 1}
              totalLessons={lessons.length}
              onPrev={() => {
                const prev = lessons[selectedIndex - 1];
                if (prev) setSelectedLessonId(prev.lesson.id);
              }}
              onNext={() => {
                const nextIndex = selectedIndex + 1;
                const next = lessons[nextIndex];
                if (next) {
                  setMaxUnlockedIndex((current) => Math.max(current, nextIndex));
                  setSelectedLessonId(next.lesson.id);
                }
              }}
            />
          )}
        </main>
```

Replace with:

```typescript
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
          {selected && showPractice ? (
            <PracticeScreen
              lesson={selected.lesson}
              onBack={() => setShowPractice(false)}
              onStartPractice={(block: ApiMyPracticeBlock) => {
                if (block.testSlug) navigate(`/t/${block.testSlug}?practice=1`);
              }}
              onViewSubmission={(block: ApiMyPracticeBlock, submissionId: string) => {
                if (block.testSlug) navigate(`/t/${block.testSlug}/result?sid=${submissionId}&practice=1`);
              }}
            />
          ) : selected ? (
            <LessonReader
              lesson={selected.lesson}
              moduleTitle={selected.module.title}
              curatorName={course.curatorName}
              lessonNumber={selectedIndex + 1}
              totalLessons={lessons.length}
              hasPractice={selected.lesson.practiceBlocks.length > 0}
              onOpenPractice={() => setShowPractice(true)}
              onPrev={() => {
                const prev = lessons[selectedIndex - 1];
                if (prev) setSelectedLessonId(prev.lesson.id);
              }}
              onNext={() => {
                const nextIndex = selectedIndex + 1;
                const next = lessons[nextIndex];
                if (next) {
                  setMaxUnlockedIndex((current) => Math.max(current, nextIndex));
                  setSelectedLessonId(next.lesson.id);
                }
              }}
            />
          ) : null}
        </main>
```

- [ ] **Step 5: Update `LessonReader`'s props and its bottom-right button**

Find:

```typescript
function LessonReader({
  lesson,
  moduleTitle,
  curatorName,
  lessonNumber,
  totalLessons,
  onPrev,
  onNext,
}: {
  lesson: ApiMyLesson;
  moduleTitle: string;
  curatorName: string | null;
  lessonNumber: number;
  totalLessons: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const readyBlocks = lesson.blocks.filter((block) => block.type !== 'video' || block.embedUrl || block.processingStatus === 'ready');
  const hasPractice = false;
```

Replace with:

```typescript
function LessonReader({
  lesson,
  moduleTitle,
  curatorName,
  lessonNumber,
  totalLessons,
  hasPractice,
  onOpenPractice,
  onPrev,
  onNext,
}: {
  lesson: ApiMyLesson;
  moduleTitle: string;
  curatorName: string | null;
  lessonNumber: number;
  totalLessons: number;
  hasPractice: boolean;
  onOpenPractice: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const readyBlocks = lesson.blocks.filter((block) => block.type !== 'video' || block.embedUrl || block.processingStatus === 'ready');
```

Find the bottom button pair:

```typescript
      <div className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-bold text-[var(--color-indigo-500)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Orqaga
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={lessonNumber >= totalLessons}
          className="rounded-xl bg-[var(--color-indigo-500)] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          {hasPractice ? 'Amaliyot' : 'Keyingi dars'}
        </button>
      </div>
```

Replace with:

```typescript
      <div className="mt-10 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={lessonNumber <= 1}
          className="rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-bold text-[var(--color-indigo-500)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Orqaga
        </button>
        <button
          type="button"
          onClick={async () => {
            await apiMarkLessonComplete(lesson.id);
            if (hasPractice) onOpenPractice();
            else onNext();
          }}
          disabled={!hasPractice && lessonNumber >= totalLessons}
          className="rounded-xl bg-[var(--color-indigo-500)] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          {hasPractice ? 'Amaliyot' : 'Keyingi dars'}
        </button>
      </div>
```

This calls `apiMarkLessonComplete` exactly once per button click, in both the "Amaliyot" and "Keyingi dars" branches, matching spec §5 ("Keyingi dars yoki Amaliyot tugmasi bosilganda ... chaqiriladi").

- [ ] **Step 6: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS with zero TypeScript errors.

- [ ] **Step 7: Manual UI verification (no automated tests for this page, per Global Constraints)**

Start both dev servers (check `package.json` for this project's exact dev-server script names before running — e.g. `npm run start:dev --workspace=apps/backend` and the frontend's `dev` script). As a teacher: create a lesson, add a practice block via the "Amaliyot" tab, attach an existing test, set a `maxScore`. As a student (a different logged-in account enrolled in that course): open the lesson, click "Amaliyot", confirm the practice screen shows the block with "Qayta o'tish", take the test, confirm the flow returns to a state showing the new submission in "Sizning natijalaringiz" with the computed score, and confirm "Ochish" navigates to that submission's result page.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/student/PracticeScreen.tsx apps/frontend/src/api/groups.ts apps/frontend/src/pages/MyCoursesPage.tsx
git commit -m "feat(practice): add student practice screen with score summary and attempt history"
```

---

### Task 9: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full backend build**

Run: `npm run build --workspace=apps/backend`
Expected: PASS, zero errors.

- [ ] **Step 2: Full backend test suite**

Run: `npm test --workspace=apps/backend`
Expected: PASS. Count should be the pre-plan baseline (98, per the most recent confirmed run in this project) + 3 (`applyPracticeOverride`, Task 4) + 9 (`computeEarnedScore`/`computeCombinedPercent`, Task 5) = 110.

- [ ] **Step 3: Full frontend build**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS, zero TypeScript errors.

- [ ] **Step 4: Grep for leftover sync-call sites of the now-async practice actions**

Run: `grep -rn "addPracticeBlock\|removePracticeBlock\|movePracticeBlock\|setPracticeBlockTest\|setPracticeBlockDescription\|setPassThreshold" apps/frontend/src --include="*.tsx"`
Expected: only `PracticeSection.tsx` (and possibly `PracticeBlockView.tsx`/`PracticeBlockPicker.tsx` as prop names, not call sites) reference these — confirm no other file calls them in a way that assumes the old synchronous signature.

- [ ] **Step 5: DB sanity check**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "SELECT COUNT(*) FROM practice_blocks;"` and `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "SELECT COUNT(*) FROM lesson_completions;"` — both should succeed without error (0 rows is fine on a fresh dev DB; this just confirms the tables are queryable end-to-end after all the code changes).

- [ ] **Step 6: Final commit (only if any uncommitted verification fixes were made in Steps 1-5; otherwise skip)**

```bash
git add -A
git commit -m "chore: final verification pass for lesson practice backend integration"
```
