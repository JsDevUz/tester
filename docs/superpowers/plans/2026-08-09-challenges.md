# Challenges (kitobxonlik) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Challenges" feature to courses — teachers create reading ("kitobxonlik") challenges with books, students in the course join and log reading progress, optional tests gate progress at chosen pages, and a leaderboard ranks students by multiple metrics. Also restructure student navigation on web and mobile: replace "Jonli musobaqalar" with a "Jamm" hub tab/nav-item that presents 3 entries — Challenge-lar (active), Jonli Musobaqalar (active, opens the existing live-competitions flow), and Ovozli suhbat (inactive, "Tez orada"). The Amaliyotlar/History screen is not touched.

**Architecture:** New backend NestJS module `challenges` with 6 new Drizzle tables, two controllers (teacher-facing under `/courses/:courseId/challenges` and `/challenges/...`, student-facing under `/me/challenges/...`). New frontend web page (`CourseChallengesPage`) wired into the existing `CourseSidePanel`/`CoursesPage` view-state pattern, plus a new top-level `/challenges` student page (`ChallengesHubPage`, a 3-card hub whose "Challenge-lar" card swaps in `ChallengesListPage` in place) aggregating challenges across all the student's courses. New mobile `ChallengesScreen` replacing the `Live` tab — itself a 3-card hub mirroring the web version — with `LiveScreen` moved to the stack navigator, reachable via the hub's "Jonli Musobaqalar" card.

**Tech Stack:** NestJS + Drizzle ORM + PostgreSQL (backend), React + Zustand + react-router (frontend web), React Native + React Navigation (mobile). Existing patterns: `class-validator` DTOs, `JwtAuthGuard`+`RolesGuard`+`@Roles(...)`, `req.admin.id` / `req.user.id`, Jest with `jest.mock('../db', ...)`.

## Global Constraints

- Challenge `type` is a free-text column defaulting to `'kitobxonlik'`; the frontend renders it as a select with a single option today — never hardcode the string as a UI-only constant disconnected from the field.
- No invite links/tokens for challenges — visibility is derived purely from course membership (`groupEnrollments` via `groups.courseId`), matching `groups.service.ts` `getMyCourses`/`getMyCourseLeaderboard` patterns.
- Events are append-only: no update/delete endpoints for `challengeEvents`.
- Deleting a `challengeBooks` row cascades to its test link, progress rows, and events (DB-level `onDelete: 'cascade'`).
- "Boshlagan bet" (start page) is never client-supplied — the server always derives it from `challengeBookProgress.lastPageRead`.
- Vocabulary is a plain integer count per event — never a text list.
- Reuse the existing generic `/upload` endpoint with `folder: 'avatars'` for challenge cover images (same as school logos) — do not add a new upload folder.
- Reuse existing `tests` (not new tests) for the optional per-book test binding.

---

## Task 1: Drizzle schema — challenges tables

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Test: none (schema-only; validated via Task 2's service tests and Task 3's migration)

**Interfaces:**
- Produces: Drizzle tables `challenges`, `challengeBooks`, `challengeBookTests`, `challengeParticipants`, `challengeBookProgress`, `challengeEvents`, plus their `relations()` exports — all later tasks import these from `../db/schema`.

- [ ] **Step 1: Add the six tables to schema.ts**

Append after the `attendanceRecordsRelations` block at the end of `apps/backend/src/db/schema.ts` (follow the existing style: `pgTable`, `uuid('id').primaryKey().defaultRandom()`, `timestamp(..., { withTimezone: true })`):

```typescript
export const challenges = pgTable('challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  type: text('type').notNull().default('kitobxonlik'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const challengeBooks = pgTable('challenge_books', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  totalPages: integer('total_pages').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const challengeBookTests = pgTable('challenge_book_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeBookId: uuid('challenge_book_id').notNull().unique().references(() => challengeBooks.id, { onDelete: 'cascade' }),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  triggerPage: integer('trigger_page'),
  forceNow: boolean('force_now').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const challengeParticipants = pgTable('challenge_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueChallengeStudent: uniqueIndex('challenge_participants_challenge_id_student_id_key').on(table.challengeId, table.studentId),
}));

export const challengeBookProgress = pgTable('challenge_book_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeParticipantId: uuid('challenge_participant_id').notNull().references(() => challengeParticipants.id, { onDelete: 'cascade' }),
  challengeBookId: uuid('challenge_book_id').notNull().references(() => challengeBooks.id, { onDelete: 'cascade' }),
  lastPageRead: integer('last_page_read').notNull().default(0),
}, (table) => ({
  uniqueParticipantBook: uniqueIndex('challenge_book_progress_participant_id_book_id_key').on(table.challengeParticipantId, table.challengeBookId),
}));

export const challengeEvents = pgTable('challenge_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeParticipantId: uuid('challenge_participant_id').notNull().references(() => challengeParticipants.id, { onDelete: 'cascade' }),
  challengeBookId: uuid('challenge_book_id').notNull().references(() => challengeBooks.id, { onDelete: 'cascade' }),
  startPage: integer('start_page').notNull(),
  endPage: integer('end_page').notNull(),
  newWordsCount: integer('new_words_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  participantIdIdx: index('challenge_events_participant_id_idx').on(table.challengeParticipantId),
  bookIdIdx: index('challenge_events_book_id_idx').on(table.challengeBookId),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  course: one(courses, { fields: [challenges.courseId], references: [courses.id] }),
  books: many(challengeBooks),
  participants: many(challengeParticipants),
}));

export const challengeBooksRelations = relations(challengeBooks, ({ one, many }) => ({
  challenge: one(challenges, { fields: [challengeBooks.challengeId], references: [challenges.id] }),
  test: one(challengeBookTests, { fields: [challengeBooks.id], references: [challengeBookTests.challengeBookId] }),
  progress: many(challengeBookProgress),
  events: many(challengeEvents),
}));

export const challengeBookTestsRelations = relations(challengeBookTests, ({ one }) => ({
  book: one(challengeBooks, { fields: [challengeBookTests.challengeBookId], references: [challengeBooks.id] }),
  test: one(tests, { fields: [challengeBookTests.testId], references: [tests.id] }),
}));

export const challengeParticipantsRelations = relations(challengeParticipants, ({ one, many }) => ({
  challenge: one(challenges, { fields: [challengeParticipants.challengeId], references: [challenges.id] }),
  student: one(users, { fields: [challengeParticipants.studentId], references: [users.id] }),
  progress: many(challengeBookProgress),
  events: many(challengeEvents),
}));

export const challengeBookProgressRelations = relations(challengeBookProgress, ({ one }) => ({
  participant: one(challengeParticipants, { fields: [challengeBookProgress.challengeParticipantId], references: [challengeParticipants.id] }),
  book: one(challengeBooks, { fields: [challengeBookProgress.challengeBookId], references: [challengeBooks.id] }),
}));

export const challengeEventsRelations = relations(challengeEvents, ({ one }) => ({
  participant: one(challengeParticipants, { fields: [challengeEvents.challengeParticipantId], references: [challengeParticipants.id] }),
  book: one(challengeBooks, { fields: [challengeEvents.challengeBookId], references: [challengeBooks.id] }),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors referencing `schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db/schema.ts
git commit -m "feat(backend): add challenges schema tables"
```

---

## Task 2: Generate and apply the Drizzle migration

**Files:**
- Create: `apps/backend/drizzle/migrations/<timestamp>_*.sql` (auto-generated)
- Modify: `apps/backend/drizzle/migrations/meta/_journal.json` (auto-generated)

**Interfaces:**
- Consumes: schema from Task 1.
- Produces: applied DB tables that Task 4's service can query against in a real dev DB (tests in Task 4 mock `db`, so this task only needs to succeed against whatever DB is configured for local dev — do not block the plan on DB availability; if no DB is reachable, still generate the SQL file and note it needs to run before deploy).

- [ ] **Step 1: Generate the migration**

Run: `cd apps/backend && npm run db:generate`
Expected: a new `.sql` file appears under `apps/backend/drizzle/migrations/` containing `CREATE TABLE "challenges"`, `"challenge_books"`, `"challenge_book_tests"`, `"challenge_participants"`, `"challenge_book_progress"`, `"challenge_events"`.

- [ ] **Step 2: Review the generated SQL**

Read the new migration file and confirm all 6 tables, their foreign keys (with `ON DELETE CASCADE` on every FK per the schema above), and the 3 unique indexes (`challenge_book_tests.challenge_book_id`, `challenge_participants(challenge_id, student_id)`, `challenge_book_progress(challenge_participant_id, challenge_book_id)`) are present.

- [ ] **Step 3: Apply the migration (if a local dev DB is configured)**

Run: `cd apps/backend && npm run db:migrate`
Expected: migration applies without error. If no DB is reachable in this environment, skip execution but leave the generated file in place — it must be applied before this feature can run.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/drizzle/migrations
git commit -m "chore(backend): generate migration for challenges tables"
```

---

## Task 3: Backend — teacher-facing challenges service and controller (CRUD)

**Files:**
- Create: `apps/backend/src/challenges/challenges.service.ts`
- Create: `apps/backend/src/challenges/challenges.controller.ts`
- Create: `apps/backend/src/challenges/challenges.module.ts`
- Create: `apps/backend/src/challenges/challenges.service.spec.ts`
- Modify: `apps/backend/src/app.module.ts` (register `ChallengesModule`)

**Interfaces:**
- Consumes: `db` from `../db`, tables from Task 1 (`challenges`, `challengeBooks`, `challengeBookTests`, `courses`, `tests`).
- Produces (used by Task 4 and frontend):
  - `ChallengesService.findAllForCourse(courseId: string, adminId: string): Promise<Challenge[]>`
  - `ChallengesService.create(courseId: string, adminId: string, data: { name: string; description?: string; imageUrl?: string; type?: string }): Promise<Challenge>`
  - `ChallengesService.update(id: string, adminId: string, data: Partial<{ name; description; imageUrl; type }>): Promise<Challenge>`
  - `ChallengesService.remove(id: string, adminId: string): Promise<void>`
  - `ChallengesService.addBook(challengeId: string, adminId: string, data: { title: string; totalPages: number }): Promise<ChallengeBook>`
  - `ChallengesService.updateBook(bookId: string, adminId: string, data: Partial<{ title; totalPages }>): Promise<ChallengeBook>`
  - `ChallengesService.removeBook(bookId: string, adminId: string): Promise<void>`
  - `ChallengesService.setBookTest(bookId: string, adminId: string, data: { testId: string; triggerPage?: number | null; forceNow?: boolean }): Promise<ChallengeBookTest>`
  - `ChallengesService.removeBookTest(bookId: string, adminId: string): Promise<void>`
  - `ChallengesService.findOneOwned(id: string, adminId: string): Promise<Challenge & { books: (ChallengeBook & { test: ChallengeBookTest | null })[] }>` — used internally and by Task 5's stats/leaderboard endpoints.

- [ ] **Step 1: Write the failing service test for `create` and ownership checks**

```typescript
// apps/backend/src/challenges/challenges.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      courses: { findFirst: jest.fn() },
      challenges: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeBooks: { findFirst: jest.fn() },
      tests: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

function mockInsertReturning(value: unknown) {
  const returning = jest.fn().mockResolvedValue([value]);
  const values = jest.fn(() => ({ returning }));
  (db.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

function mockUpdateReturning(value: unknown[]) {
  const returning = jest.fn().mockResolvedValue(value);
  const where = jest.fn(() => ({ returning }));
  const set = jest.fn(() => ({ where }));
  (db.update as jest.Mock).mockReturnValue({ set });
  return { set, where, returning };
}

describe('ChallengesService', () => {
  const service = new ChallengesService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a challenge for a course the admin owns', async () => {
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue({ id: 'course-1', adminId: 'admin-1' });
    mockInsertReturning({ id: 'challenge-1', courseId: 'course-1', adminId: 'admin-1', name: 'Yoz mutolaasi' });

    const result = await service.create('course-1', 'admin-1', { name: 'Yoz mutolaasi' });

    expect(result).toEqual(expect.objectContaining({ id: 'challenge-1', name: 'Yoz mutolaasi' }));
  });

  it('throws NotFoundException when creating a challenge for a course the admin does not own', async () => {
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.create('course-1', 'admin-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when updating a challenge the admin does not own', async () => {
    mockUpdateReturning([]);

    await expect(service.update('challenge-1', 'admin-1', { name: 'Y' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest challenges.service.spec.ts`
Expected: FAIL — `Cannot find module './challenges.service'`.

- [ ] **Step 3: Implement `challenges.service.ts`**

```typescript
// apps/backend/src/challenges/challenges.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { challengeBooks, challengeBookTests, challenges, courses, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class ChallengesService {
  async findAllForCourse(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)) });
    if (!course) throw new NotFoundException('Course not found');
    return db.query.challenges.findMany({
      where: eq(challenges.courseId, courseId),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    });
  }

  async create(courseId: string, adminId: string, data: { name: string; description?: string; imageUrl?: string; type?: string }) {
    const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)) });
    if (!course) throw new NotFoundException('Course not found');

    const [challenge] = await db.insert(challenges).values({
      courseId,
      adminId,
      name: data.name,
      description: data.description ?? '',
      imageUrl: data.imageUrl,
      type: data.type ?? 'kitobxonlik',
    }).returning();
    return challenge;
  }

  async update(id: string, adminId: string, data: Partial<{ name: string; description: string; imageUrl: string; type: string }>) {
    const [challenge] = await db.update(challenges)
      .set(data)
      .where(and(eq(challenges.id, id), eq(challenges.adminId, adminId)))
      .returning();
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  async remove(id: string, adminId: string) {
    const result = await db.delete(challenges)
      .where(and(eq(challenges.id, id), eq(challenges.adminId, adminId)))
      .returning({ id: challenges.id });
    if (!result.length) throw new NotFoundException('Challenge not found');
  }

  async findOneOwned(id: string, adminId: string) {
    const challenge = await db.query.challenges.findFirst({
      where: and(eq(challenges.id, id), eq(challenges.adminId, adminId)),
      with: { books: { with: { test: true }, orderBy: (b, { asc }) => [asc(b.orderIndex)] } },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  private async assertBookOwnership(bookId: string, adminId: string) {
    const book = await db.query.challengeBooks.findFirst({
      where: eq(challengeBooks.id, bookId),
      with: { challenge: true },
    });
    if (!book || book.challenge.adminId !== adminId) throw new NotFoundException('Book not found');
    return book;
  }

  async addBook(challengeId: string, adminId: string, data: { title: string; totalPages: number }) {
    const challenge = await db.query.challenges.findFirst({ where: and(eq(challenges.id, challengeId), eq(challenges.adminId, adminId)) });
    if (!challenge) throw new NotFoundException('Challenge not found');

    const existing = await db.query.challengeBooks.findMany({ where: eq(challengeBooks.challengeId, challengeId) });
    const [book] = await db.insert(challengeBooks).values({
      challengeId,
      title: data.title,
      totalPages: data.totalPages,
      orderIndex: existing.length,
    }).returning();
    return book;
  }

  async updateBook(bookId: string, adminId: string, data: Partial<{ title: string; totalPages: number }>) {
    await this.assertBookOwnership(bookId, adminId);
    const [book] = await db.update(challengeBooks).set(data).where(eq(challengeBooks.id, bookId)).returning();
    return book;
  }

  async removeBook(bookId: string, adminId: string) {
    await this.assertBookOwnership(bookId, adminId);
    await db.delete(challengeBooks).where(eq(challengeBooks.id, bookId));
  }

  async setBookTest(bookId: string, adminId: string, data: { testId: string; triggerPage?: number | null; forceNow?: boolean }) {
    await this.assertBookOwnership(bookId, adminId);
    const test = await db.query.tests.findFirst({ where: and(eq(tests.id, data.testId), eq(tests.adminId, adminId)) });
    if (!test) throw new NotFoundException('Test not found');

    const [bookTest] = await db.insert(challengeBookTests).values({
      challengeBookId: bookId,
      testId: data.testId,
      triggerPage: data.triggerPage ?? null,
      forceNow: data.forceNow ?? false,
    }).onConflictDoUpdate({
      target: challengeBookTests.challengeBookId,
      set: { testId: data.testId, triggerPage: data.triggerPage ?? null, forceNow: data.forceNow ?? false },
    }).returning();
    return bookTest;
  }

  async removeBookTest(bookId: string, adminId: string) {
    await this.assertBookOwnership(bookId, adminId);
    await db.delete(challengeBookTests).where(eq(challengeBookTests.challengeBookId, bookId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest challenges.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `challenges.controller.ts`**

```typescript
// apps/backend/src/challenges/challenges.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class CreateChallengeDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() type?: string;
}

class UpdateChallengeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() type?: string;
}

class AddBookDto {
  @IsString() @MinLength(1) title: string;
  @IsInt() @Min(1) totalPages: number;
}

class UpdateBookDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsInt() @Min(1) totalPages?: number;
}

class SetBookTestDto {
  @IsUUID() testId: string;
  @IsOptional() @IsInt() @Min(1) triggerPage?: number;
  @IsOptional() @IsBoolean() forceNow?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class ChallengesController {
  constructor(private challengesService: ChallengesService) {}

  @Get('courses/:courseId/challenges')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.challengesService.findAllForCourse(courseId, req.admin.id);
  }

  @Post('courses/:courseId/challenges')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateChallengeDto) {
    return this.challengesService.create(courseId, req.admin.id, dto);
  }

  @Get('challenges/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.challengesService.findOneOwned(id, req.admin.id);
  }

  @Patch('challenges/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateChallengeDto) {
    return this.challengesService.update(id, req.admin.id, dto);
  }

  @Delete('challenges/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.challengesService.remove(id, req.admin.id);
  }

  @Post('challenges/:id/books')
  addBook(@Param('id') id: string, @Req() req: any, @Body() dto: AddBookDto) {
    return this.challengesService.addBook(id, req.admin.id, dto);
  }

  @Patch('challenges/books/:bookId')
  updateBook(@Param('bookId') bookId: string, @Req() req: any, @Body() dto: UpdateBookDto) {
    return this.challengesService.updateBook(bookId, req.admin.id, dto);
  }

  @Delete('challenges/books/:bookId')
  @HttpCode(204)
  removeBook(@Param('bookId') bookId: string, @Req() req: any) {
    return this.challengesService.removeBook(bookId, req.admin.id);
  }

  @Put('challenges/books/:bookId/test')
  setBookTest(@Param('bookId') bookId: string, @Req() req: any, @Body() dto: SetBookTestDto) {
    return this.challengesService.setBookTest(bookId, req.admin.id, dto);
  }

  @Delete('challenges/books/:bookId/test')
  @HttpCode(204)
  removeBookTest(@Param('bookId') bookId: string, @Req() req: any) {
    return this.challengesService.removeBookTest(bookId, req.admin.id);
  }
}
```

- [ ] **Step 6: Create the module**

```typescript
// apps/backend/src/challenges/challenges.module.ts
import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { StudentChallengesController } from './student-challenges.controller';
import { ChallengesService } from './challenges.service';
import { StudentChallengesService } from './student-challenges.service';

@Module({
  controllers: [ChallengesController, StudentChallengesController],
  providers: [ChallengesService, StudentChallengesService],
})
export class ChallengesModule {}
```

Note: `StudentChallengesController`/`StudentChallengesService` are created in Task 4 — this file references them now so Task 4 only needs to add the two files without touching the module again. If Task 4 has not run yet, this file will fail to compile until Task 4 lands; that's expected since these two tasks are sequential.

- [ ] **Step 7: Register the module in `app.module.ts`**

```typescript
// apps/backend/src/app.module.ts — add import
import { ChallengesModule } from './challenges/challenges.module';
```

Add `ChallengesModule` to the `imports` array (after `ClassroomModule`).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/challenges apps/backend/src/app.module.ts
git commit -m "feat(backend): add teacher-facing challenges CRUD API"
```

---

## Task 4: Backend — student-facing challenges service and controller (join, events, gating)

**Files:**
- Create: `apps/backend/src/challenges/student-challenges.service.ts`
- Create: `apps/backend/src/challenges/student-challenges.controller.ts`
- Create: `apps/backend/src/challenges/student-challenges.service.spec.ts`

**Interfaces:**
- Consumes: `db`, tables from Task 1, `groups`/`groupEnrollments`/`schoolMembers`/`submissions` from `../db/schema` (existing).
- Produces:
  - `StudentChallengesService.findAllForStudent(studentId: string): Promise<StudentChallengeSummary[]>` — every challenge in every course the student is enrolled in, each with `joined: boolean`.
  - `StudentChallengesService.join(challengeId: string, studentId: string): Promise<{ id: string }>`
  - `StudentChallengesService.findOneForStudent(challengeId: string, studentId: string): Promise<StudentChallengeDetail>` — books with `lastPageRead`, `totalPages`, and `pendingTest: { testId, slug, name } | null` per book.
  - `StudentChallengesService.addEvent(challengeId: string, bookId: string, studentId: string, data: { endPage: number; newWordsCount: number }): Promise<ChallengeEvent>` — throws `BadRequestException` with `{ requiredTestSlug, requiredTestName }` payload when a mandatory test is unmet.
  - `StudentChallengesService.history(challengeId: string, studentId: string): Promise<ChallengeEventWithBook[]>`

- [ ] **Step 1: Write the failing tests for membership gating, join, and the mandatory-test block**

```typescript
// apps/backend/src/challenges/student-challenges.service.spec.ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentChallengesService } from './student-challenges.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      challenges: { findFirst: jest.fn() },
      groups: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      challengeParticipants: { findFirst: jest.fn() },
      challengeBooks: { findFirst: jest.fn() },
      challengeBookTests: { findFirst: jest.fn() },
      challengeBookProgress: { findFirst: jest.fn() },
      submissions: { findFirst: jest.fn() },
      tests: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  };
  return { db: mockDb };
});

function mockInsertReturning(value: unknown) {
  const returning = jest.fn().mockResolvedValue([value]);
  const onConflictDoNothing = jest.fn(() => ({ returning }));
  const values = jest.fn(() => ({ returning, onConflictDoNothing }));
  (db.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

describe('StudentChallengesService', () => {
  const service = new StudentChallengesService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('join', () => {
    it('throws NotFoundException when the student is not enrolled in the challenge course', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.join('challenge-1', 'student-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a participant when the student is enrolled', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      ]);
      mockInsertReturning({ id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' });

      const result = await service.join('challenge-1', 'student-1');

      expect(result).toEqual(expect.objectContaining({ id: 'participant-1' }));
    });
  });

  describe('addEvent', () => {
    const participant = { id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' };
    const book = { id: 'book-1', challengeId: 'challenge-1', totalPages: 200 };

    it('blocks a new event when a triggered mandatory test is not yet submitted', async () => {
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(participant);
      (db.query.challengeBooks.findFirst as jest.Mock).mockResolvedValue(book);
      (db.query.challengeBookProgress.findFirst as jest.Mock).mockResolvedValue({ lastPageRead: 50 });
      (db.query.challengeBookTests.findFirst as jest.Mock).mockResolvedValue({
        testId: 'test-1', triggerPage: 50, forceNow: false,
      });
      (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', slug: 'ABC123', name: 'Bob 1-bob testi' });
      (db.query.submissions.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.addEvent('challenge-1', 'book-1', 'student-1', { endPage: 60, newWordsCount: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a new event when the mandatory test has been submitted', async () => {
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(participant);
      (db.query.challengeBooks.findFirst as jest.Mock).mockResolvedValue(book);
      (db.query.challengeBookProgress.findFirst as jest.Mock).mockResolvedValue({ lastPageRead: 50 });
      (db.query.challengeBookTests.findFirst as jest.Mock).mockResolvedValue({
        testId: 'test-1', triggerPage: 50, forceNow: false,
      });
      (db.query.submissions.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-1', submittedAt: new Date() });
      mockInsertReturning({ id: 'event-1', startPage: 50, endPage: 60, newWordsCount: 3 });
      const returning = jest.fn().mockResolvedValue([{ lastPageRead: 60 }]);
      const where = jest.fn(() => ({ returning }));
      const set = jest.fn(() => ({ where }));
      (db.update as jest.Mock).mockReturnValue({ set });

      const result = await service.addEvent('challenge-1', 'book-1', 'student-1', { endPage: 60, newWordsCount: 3 });

      expect(result).toEqual(expect.objectContaining({ id: 'event-1', startPage: 50, endPage: 60 }));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest student-challenges.service.spec.ts`
Expected: FAIL — `Cannot find module './student-challenges.service'`.

- [ ] **Step 3: Implement `student-challenges.service.ts`**

```typescript
// apps/backend/src/challenges/student-challenges.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import {
  challengeBookProgress, challengeBooks, challengeBookTests, challengeEvents,
  challengeParticipants, challenges, groupEnrollments, groups, submissions, tests,
} from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class StudentChallengesService {
  private async findEnrolledStudentIds(courseId: string): Promise<Set<string>> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    const groupIds = courseGroups.map((g) => g.id);
    if (groupIds.length === 0) return new Set();
    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(inArray(groupEnrollments.groupId, groupIds), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: true },
    });
    return new Set(enrollments.map((e) => e.schoolMember.studentId));
  }

  private async assertEnrolled(challengeId: string, studentId: string) {
    const challenge = await db.query.challenges.findFirst({ where: eq(challenges.id, challengeId) });
    if (!challenge) throw new NotFoundException('Challenge not found');
    const enrolledIds = await this.findEnrolledStudentIds(challenge.courseId);
    if (!enrolledIds.has(studentId)) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  private async findOrCreateParticipant(challengeId: string, studentId: string) {
    let participant = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (!participant) throw new NotFoundException('Siz bu challenge-ga qo\'shilmagansiz');
    return participant;
  }

  async findAllForStudent(studentId: string) {
    const enrollments = await db.query.groupEnrollments.findMany({
      where: isNull(groupEnrollments.removedAt),
      with: { schoolMember: true, group: true },
    });
    const myCourseIds = [...new Set(
      enrollments.filter((e) => e.schoolMember.studentId === studentId).map((e) => e.group.courseId),
    )];
    if (myCourseIds.length === 0) return [];

    const allChallenges = await db.query.challenges.findMany({
      where: inArray(challenges.courseId, myCourseIds),
      with: { course: true },
      orderBy: (c, { desc: descOrder }) => [descOrder(c.createdAt)],
    });
    const myParticipations = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.studentId, studentId),
    });
    const joinedChallengeIds = new Set(myParticipations.map((p) => p.challengeId));

    return allChallenges.map((challenge) => ({
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      imageUrl: challenge.imageUrl,
      type: challenge.type,
      courseId: challenge.courseId,
      courseTitle: challenge.course.title,
      joined: joinedChallengeIds.has(challenge.id),
    }));
  }

  async join(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const existing = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (existing) return existing;

    const [participant] = await db.insert(challengeParticipants).values({ challengeId, studentId }).returning();
    return participant;
  }

  async findOneForStudent(challengeId: string, studentId: string) {
    const challenge = await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);

    const books = await db.query.challengeBooks.findMany({
      where: eq(challengeBooks.challengeId, challengeId),
      with: { test: { with: { test: true } } },
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });

    const results = await Promise.all(books.map(async (book) => {
      const progress = await db.query.challengeBookProgress.findFirst({
        where: and(eq(challengeBookProgress.challengeParticipantId, participant.id), eq(challengeBookProgress.challengeBookId, book.id)),
      });
      const lastPageRead = progress?.lastPageRead ?? 0;

      let pendingTest: { testId: string; slug: string; name: string } | null = null;
      if (book.test && (book.test.forceNow || (book.test.triggerPage !== null && lastPageRead >= book.test.triggerPage))) {
        const submission = await db.query.submissions.findFirst({
          where: and(eq(submissions.testId, book.test.testId), eq(submissions.userId, studentId)),
        });
        if (!submission?.submittedAt) {
          pendingTest = { testId: book.test.testId, slug: book.test.test.slug, name: book.test.test.name };
        }
      }

      return {
        id: book.id,
        title: book.title,
        totalPages: book.totalPages,
        lastPageRead,
        completed: lastPageRead >= book.totalPages,
        pendingTest,
      };
    }));

    return { id: challenge.id, name: challenge.name, description: challenge.description, imageUrl: challenge.imageUrl, books: results };
  }

  async addEvent(challengeId: string, bookId: string, studentId: string, data: { endPage: number; newWordsCount: number }) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);

    const book = await db.query.challengeBooks.findFirst({ where: and(eq(challengeBooks.id, bookId), eq(challengeBooks.challengeId, challengeId)) });
    if (!book) throw new NotFoundException('Book not found');

    const progress = await db.query.challengeBookProgress.findFirst({
      where: and(eq(challengeBookProgress.challengeParticipantId, participant.id), eq(challengeBookProgress.challengeBookId, bookId)),
    });
    const startPage = progress?.lastPageRead ?? 0;

    if (data.endPage <= startPage) {
      throw new BadRequestException('Tugagan bet boshlagan betdan katta bo\'lishi kerak');
    }

    const bookTest = await db.query.challengeBookTests.findFirst({ where: eq(challengeBookTests.challengeBookId, bookId) });
    if (bookTest && (bookTest.forceNow || (bookTest.triggerPage !== null && startPage >= bookTest.triggerPage))) {
      const submission = await db.query.submissions.findFirst({
        where: and(eq(submissions.testId, bookTest.testId), eq(submissions.userId, studentId)),
      });
      if (!submission?.submittedAt) {
        const test = await db.query.tests.findFirst({ where: eq(tests.id, bookTest.testId) });
        throw new BadRequestException({
          message: 'Avval majburiy testni yakunlang',
          requiredTestSlug: test?.slug,
          requiredTestName: test?.name,
        });
      }
    }

    const [event] = await db.insert(challengeEvents).values({
      challengeParticipantId: participant.id,
      challengeBookId: bookId,
      startPage,
      endPage: data.endPage,
      newWordsCount: data.newWordsCount ?? 0,
    }).returning();

    await db.insert(challengeBookProgress).values({
      challengeParticipantId: participant.id,
      challengeBookId: bookId,
      lastPageRead: data.endPage,
    }).onConflictDoUpdate({
      target: [challengeBookProgress.challengeParticipantId, challengeBookProgress.challengeBookId],
      set: { lastPageRead: data.endPage },
    });

    return event;
  }

  async history(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);
    return db.query.challengeEvents.findMany({
      where: eq(challengeEvents.challengeParticipantId, participant.id),
      with: { book: true },
      orderBy: [desc(challengeEvents.createdAt)],
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest student-challenges.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `student-challenges.controller.ts`**

```typescript
// apps/backend/src/challenges/student-challenges.controller.ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { StudentChallengesService } from './student-challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class AddEventDto {
  @IsInt() @Min(1) endPage: number;
  @IsInt() @Min(0) newWordsCount: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/challenges')
export class StudentChallengesController {
  constructor(private studentChallengesService: StudentChallengesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.studentChallengesService.findAllForStudent(req.user.id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.join(id, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.findOneForStudent(id, req.user.id);
  }

  @Post(':id/books/:bookId/events')
  addEvent(@Param('id') id: string, @Param('bookId') bookId: string, @Req() req: any, @Body() dto: AddEventDto) {
    return this.studentChallengesService.addEvent(id, bookId, req.user.id, dto);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.history(id, req.user.id);
  }
}
```

- [ ] **Step 6: Run the full challenges test suite**

Run: `cd apps/backend && npx jest challenges`
Expected: PASS (all 7 tests across both spec files).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/challenges/student-challenges.service.ts apps/backend/src/challenges/student-challenges.controller.ts apps/backend/src/challenges/student-challenges.service.spec.ts
git commit -m "feat(backend): add student-facing challenge join/event API with mandatory-test gating"
```

---

## Task 5: Backend — leaderboard and stats endpoints

**Files:**
- Modify: `apps/backend/src/challenges/challenges.service.ts` (add `stats`)
- Modify: `apps/backend/src/challenges/student-challenges.service.ts` (add `leaderboard`)
- Modify: `apps/backend/src/challenges/challenges.controller.ts` (add `GET /challenges/:id/stats`, `GET /challenges/:id/leaderboard`)
- Modify: `apps/backend/src/challenges/student-challenges.controller.ts` (add `GET /me/challenges/:id/leaderboard`)
- Test: `apps/backend/src/challenges/student-challenges.service.spec.ts` (add leaderboard tests)

**Interfaces:**
- Consumes: `challengeEvents`, `challengeParticipants`, `challengeBookProgress`, `challengeBooks` from Task 1; `findEnrolledStudentIds` private helper from Task 4 (duplicated into a shared computation — see Step 3).
- Produces:
  - `StudentChallengesService.leaderboard(challengeId: string, studentId: string, metric: 'overall' | 'books' | 'words' | 'speed', bookId?: string): Promise<{ entries: LeaderboardEntry[] }>` where `LeaderboardEntry = { studentId, studentName, studentAvatarUrl, value: number, rank: number, isCurrentStudent: boolean }`.
  - `ChallengesService.stats(challengeId: string, adminId: string): Promise<{ participantCount: number; bookStats: { bookId, title, testName: string | null, completedCount: number, testSubmittedCount: number | null }[] }>`

- [ ] **Step 1: Write the failing leaderboard test**

Append to `apps/backend/src/challenges/student-challenges.service.spec.ts`, inside the existing `describe('StudentChallengesService', ...)` block (add a `challengeParticipants.findMany` and `users.findMany` mock to the `jest.mock('../db', ...)` factory at the top of the file first):

```typescript
// Add to the mockDb.query object in the jest.mock factory at the top of the file:
//   challengeParticipants: { findFirst: jest.fn(), findMany: jest.fn() },
//   challengeEvents: { findMany: jest.fn() },
//   users: { findMany: jest.fn() },

describe('leaderboard', () => {
  it('ranks students by total pages read for the "overall" metric', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-2' } },
    ]);
    (db.query.challengeParticipants.findMany as jest.Mock).mockResolvedValue([
      { id: 'participant-1', studentId: 'student-1', student: { id: 'student-1', displayName: 'Aziz', displayAvatarUrl: null } },
      { id: 'participant-2', studentId: 'student-2', student: { id: 'student-2', displayName: 'Vali', displayAvatarUrl: null } },
    ]);
    (db.query.challengeEvents.findMany as jest.Mock).mockResolvedValue([
      { challengeParticipantId: 'participant-1', startPage: 0, endPage: 30, newWordsCount: 2, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
      { challengeParticipantId: 'participant-2', startPage: 0, endPage: 10, newWordsCount: 5, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
    ]);

    const result = await service.leaderboard('challenge-1', 'student-1', 'overall');

    expect(result.entries[0]).toEqual(expect.objectContaining({ studentId: 'student-1', value: 30, rank: 1 }));
    expect(result.entries[1]).toEqual(expect.objectContaining({ studentId: 'student-2', value: 10, rank: 2 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest student-challenges.service.spec.ts -t leaderboard`
Expected: FAIL — `service.leaderboard is not a function`.

- [ ] **Step 3: Implement `leaderboard` in `student-challenges.service.ts`**

Add this method to the `StudentChallengesService` class, and extend `findEnrolledStudentIds` usage by adding a new private helper that also returns the `challengeParticipants` rows joined with `users`:

```typescript
// Add these imports to student-challenges.service.ts:
// import { users } from '../db/schema';

async leaderboard(challengeId: string, studentId: string, metric: 'overall' | 'books' | 'words' | 'speed', bookId?: string) {
  await this.assertEnrolled(challengeId, studentId);

  const participants = await db.query.challengeParticipants.findMany({
    where: eq(challengeParticipants.challengeId, challengeId),
    with: { student: true },
  });
  if (participants.length === 0) return { entries: [] };

  const participantIds = participants.map((p) => p.id);
  const events = await db.query.challengeEvents.findMany({
    where: inArray(challengeEvents.challengeParticipantId, participantIds),
  });

  const books = bookId ? [] : await db.query.challengeBooks.findMany({ where: eq(challengeBooks.challengeId, challengeId) });
  const bookTotalPages = new Map(books.map((b) => [b.id, b.totalPages]));

  const byParticipant = new Map(participants.map((p) => [p.id, events.filter((e) => e.challengeParticipantId === p.id)]));

  const scored = participants.map((participant) => {
    const participantEvents = bookId
      ? (byParticipant.get(participant.id) ?? []).filter((e) => e.challengeBookId === bookId)
      : (byParticipant.get(participant.id) ?? []);

    let value = 0;
    if (metric === 'words') {
      value = participantEvents.reduce((sum, e) => sum + e.newWordsCount, 0);
    } else if (metric === 'books') {
      const byBook = new Map<string, number>();
      for (const e of participantEvents) byBook.set(e.challengeBookId, Math.max(byBook.get(e.challengeBookId) ?? 0, e.endPage));
      value = [...byBook.entries()].filter(([bId, lastPage]) => lastPage >= (bookTotalPages.get(bId) ?? Infinity)).length;
    } else if (metric === 'speed') {
      const totalPages = participantEvents.reduce((sum, e) => sum + (e.endPage - e.startPage), 0);
      if (participantEvents.length === 0) {
        value = 0;
      } else {
        const dates = participantEvents.map((e) => new Date(e.createdAt!).setHours(0, 0, 0, 0));
        const dayMs = 24 * 60 * 60 * 1000;
        const dayCount = Math.round((Math.max(...dates) - Math.min(...dates)) / dayMs) + 1;
        value = Math.round((totalPages / dayCount) * 100) / 100;
      }
    } else {
      value = participantEvents.reduce((sum, e) => sum + (e.endPage - e.startPage), 0);
    }

    return {
      studentId: participant.studentId,
      studentName: participant.student.displayName,
      studentAvatarUrl: participant.student.displayAvatarUrl,
      value,
      isCurrentStudent: participant.studentId === studentId,
    };
  });

  return {
    entries: scored
      .sort((a, b) => b.value - a.value || a.studentName.localeCompare(b.studentName, 'uz'))
      .map((entry, index) => ({ ...entry, rank: index + 1 })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest student-challenges.service.spec.ts -t leaderboard`
Expected: PASS.

- [ ] **Step 5: Add `stats` to `challenges.service.ts`**

```typescript
// Add to challenges.service.ts — new imports: challengeParticipants, challengeBookProgress, submissions, and, eq already present
async stats(challengeId: string, adminId: string) {
  const challenge = await this.findOneOwned(challengeId, adminId);

  const participants = await db.query.challengeParticipants.findMany({ where: eq(challengeParticipants.challengeId, challengeId) });

  const bookStats = await Promise.all(challenge.books.map(async (book) => {
    const progressRows = await db.query.challengeBookProgress.findMany({ where: eq(challengeBookProgress.challengeBookId, book.id) });
    const completedCount = progressRows.filter((p) => p.lastPageRead >= book.totalPages).length;

    let testSubmittedCount: number | null = null;
    if (book.test) {
      const submissionRows = await db.query.submissions.findMany({ where: eq(submissions.testId, book.test.testId) });
      testSubmittedCount = submissionRows.filter((s) => s.submittedAt !== null).length;
    }

    return {
      bookId: book.id,
      title: book.title,
      testName: book.test ? book.test.testId : null,
      completedCount,
      testSubmittedCount,
    };
  }));

  return { participantCount: participants.length, bookStats };
}
```

Add the corresponding imports at the top of `challenges.service.ts`: `challengeParticipants, challengeBookProgress, submissions`.

- [ ] **Step 6: Wire the new controller routes**

Add to `challenges.controller.ts` (teacher):

```typescript
@Get('challenges/:id/stats')
stats(@Param('id') id: string, @Req() req: any) {
  return this.challengesService.stats(id, req.admin.id);
}
```

Add to `student-challenges.controller.ts` (student), importing `Query` from `@nestjs/common`:

```typescript
@Get(':id/leaderboard')
leaderboard(
  @Param('id') id: string,
  @Req() req: any,
  @Query('metric') metric: 'overall' | 'books' | 'words' | 'speed' = 'overall',
  @Query('bookId') bookId?: string,
) {
  return this.studentChallengesService.leaderboard(id, req.user.id, metric, bookId);
}
```

- [ ] **Step 7: Run the full challenges test suite**

Run: `cd apps/backend && npx jest challenges`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/challenges
git commit -m "feat(backend): add challenge leaderboard and teacher stats endpoints"
```

---

## Task 6: JWT expiry change verification

This was already applied ad hoc before this plan was written (`apps/backend/src/auth/auth.module.ts:16` changed from `'7d'` to `'365d'`). This task only verifies it's in place and committed.

**Files:**
- Verify: `apps/backend/src/auth/auth.module.ts`

- [ ] **Step 1: Confirm the change is present**

Run: `grep -n "expiresIn" apps/backend/src/auth/auth.module.ts`
Expected output: `JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '365d' } }),`

- [ ] **Step 2: Confirm it's committed**

Run: `git log --oneline -- apps/backend/src/auth/auth.module.ts | head -3`
Expected: a commit mentioning the JWT expiry change appears (from before this plan). If not committed, commit it:

```bash
git add apps/backend/src/auth/auth.module.ts
git commit -m "feat(backend): extend JWT expiry to 365 days"
```

---

## Task 7: Frontend web — challenges API client and Zustand store

**Files:**
- Create: `apps/frontend/src/api/challenges.ts`
- Create: `apps/frontend/src/stores/challengeStore.ts`

**Interfaces:**
- Consumes: `client` from `./client` (existing axios instance), `apiUploadMedia` from `./questions` (existing, for cover images).
- Produces (used by Task 8 and Task 10):
  - Types: `ApiChallenge`, `ApiChallengeBook`, `ApiChallengeBookTest`, `ApiChallengeDetail`, `ApiChallengeStats`, `ApiChallengeLeaderboard`.
  - API functions: `apiListChallenges`, `apiCreateChallenge`, `apiUpdateChallenge`, `apiDeleteChallenge`, `apiAddChallengeBook`, `apiUpdateChallengeBook`, `apiDeleteChallengeBook`, `apiSetChallengeBookTest`, `apiRemoveChallengeBookTest`, `apiGetChallengeStats`, `apiGetChallengeLeaderboard`.
  - Store: `useChallengeStore` with state `{ challenges: Record<courseId, ApiChallenge[]>, loading: boolean }` and actions mirroring the API functions (following `courseStore.ts`'s pattern of one action per API call that updates local state after the call resolves).

- [ ] **Step 1: Implement `api/challenges.ts`**

```typescript
// apps/frontend/src/api/challenges.ts
import client from './client';

export interface ApiChallenge {
  id: string;
  courseId: string;
  adminId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  createdAt: string;
}

export interface ApiChallengeBookTest {
  id: string;
  challengeBookId: string;
  testId: string;
  triggerPage: number | null;
  forceNow: boolean;
}

export interface ApiChallengeBook {
  id: string;
  challengeId: string;
  title: string;
  totalPages: number;
  orderIndex: number;
  test: ApiChallengeBookTest | null;
}

export interface ApiChallengeDetail extends ApiChallenge {
  books: ApiChallengeBook[];
}

export interface ApiChallengeStats {
  participantCount: number;
  bookStats: {
    bookId: string;
    title: string;
    testName: string | null;
    completedCount: number;
    testSubmittedCount: number | null;
  }[];
}

export interface ApiChallengeLeaderboardEntry {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
}

export type ChallengeLeaderboardMetric = 'overall' | 'books' | 'words' | 'speed';

export async function apiListChallenges(courseId: string): Promise<ApiChallenge[]> {
  const res = await client.get(`/courses/${courseId}/challenges`);
  return res.data;
}

export async function apiCreateChallenge(
  courseId: string,
  data: { name: string; description?: string; imageUrl?: string; type?: string },
): Promise<ApiChallenge> {
  const res = await client.post(`/courses/${courseId}/challenges`, data);
  return res.data;
}

export async function apiGetChallenge(id: string): Promise<ApiChallengeDetail> {
  const res = await client.get(`/challenges/${id}`);
  return res.data;
}

export async function apiUpdateChallenge(
  id: string,
  data: Partial<{ name: string; description: string; imageUrl: string; type: string }>,
): Promise<ApiChallenge> {
  const res = await client.patch(`/challenges/${id}`, data);
  return res.data;
}

export async function apiDeleteChallenge(id: string): Promise<void> {
  await client.delete(`/challenges/${id}`);
}

export async function apiAddChallengeBook(
  challengeId: string,
  data: { title: string; totalPages: number },
): Promise<ApiChallengeBook> {
  const res = await client.post(`/challenges/${challengeId}/books`, data);
  return res.data;
}

export async function apiUpdateChallengeBook(
  bookId: string,
  data: Partial<{ title: string; totalPages: number }>,
): Promise<ApiChallengeBook> {
  const res = await client.patch(`/challenges/books/${bookId}`, data);
  return res.data;
}

export async function apiDeleteChallengeBook(bookId: string): Promise<void> {
  await client.delete(`/challenges/books/${bookId}`);
}

export async function apiSetChallengeBookTest(
  bookId: string,
  data: { testId: string; triggerPage?: number; forceNow?: boolean },
): Promise<ApiChallengeBookTest> {
  const res = await client.put(`/challenges/books/${bookId}/test`, data);
  return res.data;
}

export async function apiRemoveChallengeBookTest(bookId: string): Promise<void> {
  await client.delete(`/challenges/books/${bookId}/test`);
}

export async function apiGetChallengeStats(challengeId: string): Promise<ApiChallengeStats> {
  const res = await client.get(`/challenges/${challengeId}/stats`);
  return res.data;
}

export async function apiGetChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  bookId?: string,
): Promise<{ entries: ApiChallengeLeaderboardEntry[] }> {
  const res = await client.get(`/challenges/${challengeId}/leaderboard`, { params: { metric, bookId } });
  return res.data;
}
```

- [ ] **Step 2: Implement `stores/challengeStore.ts`**

```typescript
// apps/frontend/src/stores/challengeStore.ts
import { create } from 'zustand';
import {
  apiListChallenges, apiCreateChallenge, apiUpdateChallenge, apiDeleteChallenge,
  apiGetChallenge, apiAddChallengeBook, apiUpdateChallengeBook, apiDeleteChallengeBook,
  apiSetChallengeBookTest, apiRemoveChallengeBookTest,
  type ApiChallenge, type ApiChallengeDetail,
} from '../api/challenges';

interface ChallengeStoreState {
  challengesByCourse: Record<string, ApiChallenge[]>;
  detail: ApiChallengeDetail | null;
  loadChallenges: (courseId: string) => Promise<void>;
  createChallenge: (courseId: string, data: { name: string; description?: string; imageUrl?: string; type?: string }) => Promise<ApiChallenge>;
  loadChallengeDetail: (challengeId: string) => Promise<void>;
  updateChallenge: (courseId: string, challengeId: string, data: Partial<{ name: string; description: string; imageUrl: string; type: string }>) => Promise<void>;
  deleteChallenge: (courseId: string, challengeId: string) => Promise<void>;
  addBook: (challengeId: string, data: { title: string; totalPages: number }) => Promise<void>;
  updateBook: (challengeId: string, bookId: string, data: Partial<{ title: string; totalPages: number }>) => Promise<void>;
  deleteBook: (challengeId: string, bookId: string) => Promise<void>;
  setBookTest: (challengeId: string, bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => Promise<void>;
  removeBookTest: (challengeId: string, bookId: string) => Promise<void>;
}

export const useChallengeStore = create<ChallengeStoreState>((set, get) => ({
  challengesByCourse: {},
  detail: null,

  async loadChallenges(courseId) {
    const list = await apiListChallenges(courseId);
    set((state) => ({ challengesByCourse: { ...state.challengesByCourse, [courseId]: list } }));
  },

  async createChallenge(courseId, data) {
    const challenge = await apiCreateChallenge(courseId, data);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: [...(state.challengesByCourse[courseId] ?? []), challenge],
      },
    }));
    return challenge;
  },

  async loadChallengeDetail(challengeId) {
    const detail = await apiGetChallenge(challengeId);
    set({ detail });
  },

  async updateChallenge(courseId, challengeId, data) {
    const updated = await apiUpdateChallenge(challengeId, data);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: (state.challengesByCourse[courseId] ?? []).map((c) => (c.id === challengeId ? updated : c)),
      },
      detail: state.detail?.id === challengeId ? { ...state.detail, ...updated } : state.detail,
    }));
  },

  async deleteChallenge(courseId, challengeId) {
    await apiDeleteChallenge(challengeId);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: (state.challengesByCourse[courseId] ?? []).filter((c) => c.id !== challengeId),
      },
    }));
  },

  async addBook(challengeId, data) {
    await apiAddChallengeBook(challengeId, data);
    await get().loadChallengeDetail(challengeId);
  },

  async updateBook(challengeId, bookId, data) {
    await apiUpdateChallengeBook(bookId, data);
    await get().loadChallengeDetail(challengeId);
  },

  async deleteBook(challengeId, bookId) {
    await apiDeleteChallengeBook(bookId);
    await get().loadChallengeDetail(challengeId);
  },

  async setBookTest(challengeId, bookId, data) {
    await apiSetChallengeBookTest(bookId, data);
    await get().loadChallengeDetail(challengeId);
  },

  async removeBookTest(challengeId, bookId) {
    await apiRemoveChallengeBookTest(bookId);
    await get().loadChallengeDetail(challengeId);
  },
}));
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/challenges.ts apps/frontend/src/stores/challengeStore.ts
git commit -m "feat(frontend): add challenges API client and store"
```

---

## Task 8: Frontend web — teacher CourseChallengesPage + CourseSidePanel tab

**Files:**
- Create: `apps/frontend/src/components/course/CourseChallengesPage.tsx`
- Modify: `apps/frontend/src/components/course/CourseSidePanel.tsx` (add "Challenges" tab)
- Modify: `apps/frontend/src/pages/CoursesPage.tsx` (add `challenges` view state and wiring)

**Interfaces:**
- Consumes: `useChallengeStore` from Task 7, `useCourseStore` (existing, for `courses` list to resolve `course.title`), a new `apiListMyTests` function added to `apps/frontend/src/api/tests.ts` in Step 1 below, `apiUploadMedia` from `./questions`, `CourseSidePanel`, `Breadcrumb`, `ConfirmDeleteModal` (all existing).
- Produces: `CourseChallengesPage` component with props `{ courseId: string; onBackToList: () => void; onSelectContent: () => void; onSelectSettings: () => void; onSelectLaunch: () => void; onSelectGroups: () => void; onSelectClasses: () => void; onSelectChallenges: () => void }` — the `onSelectChallenges` prop is added to every sibling page's props in this task too, matching the existing fan-out pattern in `CoursesPage.tsx`.

- [ ] **Step 1: Add a folder-less "my tests" endpoint for the test picker**

`apps/frontend/src/api/tests.ts` already exports `apiListAllTests()` (line 116), but it calls `GET /live/tests` — a live-competition-specific endpoint (`apps/backend/src/live/live.controller.ts:20`) that returns `{ id, name, questionCount }` without a `slug`. It cannot be reused: the book-test picker needs `slug` (to redirect students to `/t/<slug>` when a mandatory test is pending) and must list every test the teacher owns, not just ones eligible for live competitions. Add a new, separate endpoint and frontend function — do not modify `apiListAllTests` or `/live/tests`.

`apps/backend/src/tests/tests.controller.ts` is `@Controller('tests')` with existing routes `GET` (root, folder-scoped via query), `GET :id`, `GET :id/pin` (confirmed via `grep -n "@Get" apps/backend/src/tests/tests.controller.ts`). Add the new route as `GET tests/mine`, declared before the `GET :id` route so Nest doesn't try to match `mine` as the `:id` param.

Add to `apps/backend/src/tests/tests.service.ts`:

```typescript
async findAllForAdmin(adminId: string) {
  return db.query.tests.findMany({
    where: eq(tests.adminId, adminId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}
```

Add to `apps/backend/src/tests/tests.controller.ts`, placed immediately after the existing `@Get()` (root) handler and before `@Get(':id')`:

```typescript
@Get('mine')
findAllForAdmin(@Req() req: any) {
  return this.testsService.findAllForAdmin(req.admin.id);
}
```

Add to `apps/frontend/src/api/tests.ts`:

```typescript
export interface MyTestSummary {
  id: string;
  name: string;
  slug: string | null;
}

export async function apiListMyTests(): Promise<MyTestSummary[]> {
  const res = await client.get('/tests/mine');
  return res.data;
}
```

- [ ] **Step 2: Implement `CourseChallengesPage.tsx`**

```typescript
// apps/frontend/src/components/course/CourseChallengesPage.tsx
import { useEffect, useState } from 'react';
import { BookOpen, ImagePlus, Inbox, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCourseStore } from '../../stores/courseStore';
import { useChallengeStore } from '../../stores/challengeStore';
import { apiUploadMedia } from '../../api/questions';
import { apiListMyTests, type MyTestSummary } from '../../api/tests';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import type { ApiChallengeBook } from '../../api/challenges';

interface CourseChallengesPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectSettings: () => void;
  onSelectLaunch: () => void;
  onSelectGroups: () => void;
  onSelectClasses: () => void;
}

export function CourseChallengesPage({
  courseId, onBackToList, onSelectContent, onSelectSettings, onSelectLaunch, onSelectGroups, onSelectClasses,
}: CourseChallengesPageProps) {
  const { courses } = useCourseStore();
  const {
    challengesByCourse, detail, loadChallenges, createChallenge, loadChallengeDetail,
    deleteChallenge, addBook, updateBook, deleteBook, setBookTest, removeBookTest,
  } = useChallengeStore();
  const course = courses.find((c) => c.id === courseId);
  const challenges = challengesByCourse[courseId] ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allTests, setAllTests] = useState<MyTestSummary[]>([]);

  useEffect(() => { void loadChallenges(courseId); }, [courseId, loadChallenges]);
  useEffect(() => { if (selectedId) void loadChallengeDetail(selectedId); }, [selectedId, loadChallengeDetail]);
  useEffect(() => { void apiListMyTests().then(setAllTests).catch(() => undefined); }, []);

  if (!course) return null;

  async function handleCreate(name: string, description: string, imageUrl: string) {
    try {
      const challenge = await createChallenge(courseId, { name, description, imageUrl });
      setCreating(false);
      setSelectedId(challenge.id);
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Challenge yaratib bo'lmadi");
    }
  }

  if (selectedId && detail && detail.id === selectedId) {
    return (
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Challenges', onClick: () => setSelectedId(null) },
              { label: detail.name },
            ]}
          />

          <div className="mb-4 rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">{detail.name}</h2>
            <p className="text-sm text-gray-400">{detail.description || 'Tavsif kiritilmagan'}</p>
          </div>

          <BooksPanel
            books={detail.books}
            allTests={allTests}
            onAddBook={(title, totalPages) => void addBook(detail.id, { title, totalPages })}
            onUpdateBook={(bookId, data) => void updateBook(detail.id, bookId, data)}
            onDeleteBook={(bookId) => void deleteBook(detail.id, bookId)}
            onSetTest={(bookId, data) => void setBookTest(detail.id, bookId, data)}
            onRemoveTest={(bookId) => void removeBookTest(detail.id, bookId)}
          />

          <div className="mt-4 rounded-2xl bg-white p-5">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <Trash2 size={16} /> Challenge-ni o'chirish
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
          >
            Challenges-ga qaytish
          </button>
        </div>

        <CourseSidePanel
          onBackToList={onBackToList}
          activeFullTab="content"
          onSelectContent={onSelectContent}
          onSelectSettings={onSelectSettings}
          onSelectLaunch={onSelectLaunch}
          onSelectGroups={onSelectGroups}
          onSelectClasses={onSelectClasses}
        />

        {confirmDelete && (
          <ConfirmDeleteModal
            title="Challenge-ni o'chirish"
            description={`"${detail.name}" o'chiriladi. Barcha kitoblar va o'quvchi tarixi ham yo'qoladi.`}
            onConfirm={() => {
              void deleteChallenge(courseId, detail.id);
              setSelectedId(null);
              setConfirmDelete(false);
            }}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb items={[{ label: 'Kurslar', onClick: onBackToList }, { label: course.title, onClick: onSelectContent }, { label: 'Challenges' }]} />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Challenges</h2>
          <p className="mb-4 text-sm text-gray-400">Kitobxonlik challenge yarating, o'quvchilar avtomatik ko'radi</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
          >
            <Plus size={16} /> Yangi challenge
          </button>
        </div>

        {challenges.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali challenge yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {challenges.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-left transition-colors hover:bg-gray-50"
              >
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="h-11 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                    <BookOpen size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-gray-800">{c.name}</p>
                  <p className="truncate text-xs text-gray-400">{c.type}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <CourseSidePanel
        onBackToList={onBackToList}
        activeFullTab="content"
        onSelectContent={onSelectContent}
        onSelectSettings={onSelectSettings}
        onSelectLaunch={onSelectLaunch}
        onSelectGroups={onSelectGroups}
        onSelectClasses={onSelectClasses}
      />

      {creating && <CreateChallengeModal onCreate={handleCreate} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateChallengeModal({ onCreate, onClose }: { onCreate: (name: string, description: string, imageUrl: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUploadMedia(file, 'avatars');
      setImageUrl(url);
    } catch {
      toast.error("Rasmni yuklab bo'lmadi");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">Yangi challenge</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1.5 block text-sm text-gray-500">Turi</label>
        <select disabled value="kitobxonlik" className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm text-gray-500 outline-none">
          <option value="kitobxonlik">Kitobxonlik</option>
        </select>

        <label className="mb-1.5 block text-sm text-gray-500">Nomi</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" placeholder="Yoz mutolaasi 2026" />

        <label className="mb-1.5 block text-sm text-gray-500">Tavsif</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" rows={3} />

        <label className="mb-1.5 block text-sm text-gray-500">Rasm</label>
        <label className="mb-4 flex h-24 w-full cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <ImagePlus size={22} />}
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" disabled={uploading} />
        </label>

        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), description.trim(), imageUrl)}
          className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          Yaratish
        </button>
      </div>
    </div>
  );
}

function BooksPanel({
  books, allTests, onAddBook, onUpdateBook, onDeleteBook, onSetTest, onRemoveTest,
}: {
  books: ApiChallengeBook[];
  allTests: MyTestSummary[];
  onAddBook: (title: string, totalPages: number) => void;
  onUpdateBook: (bookId: string, data: Partial<{ title: string; totalPages: number }>) => void;
  onDeleteBook: (bookId: string) => void;
  onSetTest: (bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => void;
  onRemoveTest: (bookId: string) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newPages, setNewPages] = useState('');

  return (
    <div className="rounded-2xl bg-white p-5">
      <h3 className="mb-4 text-base font-bold text-gray-800">Kitoblar</h3>

      <div className="mb-4 flex gap-2">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Kitob nomi" className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <input value={newPages} onChange={(e) => setNewPages(e.target.value)} placeholder="Jami bet" type="number" min={1} className="w-28 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <button
          type="button"
          disabled={!newTitle.trim() || !newPages}
          onClick={() => { onAddBook(newTitle.trim(), parseInt(newPages, 10)); setNewTitle(''); setNewPages(''); }}
          className="shrink-0 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          Qo'shish
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {books.map((book) => (
          <div key={book.id} className="rounded-xl bg-gray-50 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800">{book.title}</p>
                <p className="text-xs text-gray-400">{book.totalPages} bet</p>
              </div>
              <button type="button" onClick={() => onDeleteBook(book.id)} className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </div>

            <BookTestRow book={book} allTests={allTests} onSetTest={onSetTest} onRemoveTest={onRemoveTest} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BookTestRow({
  book, allTests, onSetTest, onRemoveTest,
}: {
  book: ApiChallengeBook;
  allTests: MyTestSummary[];
  onSetTest: (bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => void;
  onRemoveTest: (bookId: string) => void;
}) {
  const [testId, setTestId] = useState(book.test?.testId ?? '');
  const [triggerPage, setTriggerPage] = useState(book.test?.triggerPage?.toString() ?? '');
  const [forceNow, setForceNow] = useState(book.test?.forceNow ?? false);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
      <select value={testId} onChange={(e) => setTestId(e.target.value)} className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-xs outline-none">
        <option value="">Test tanlang...</option>
        {allTests.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input
        value={triggerPage}
        onChange={(e) => setTriggerPage(e.target.value)}
        disabled={forceNow}
        placeholder="Bet"
        type="number"
        min={1}
        className="w-20 rounded-xl bg-white px-3 py-2 text-xs outline-none disabled:opacity-40"
      />
      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        <input type="checkbox" checked={forceNow} onChange={(e) => setForceNow(e.target.checked)} />
        Hozir majburiy
      </label>
      <button
        type="button"
        disabled={!testId}
        onClick={() => onSetTest(book.id, { testId, triggerPage: forceNow ? undefined : (parseInt(triggerPage, 10) || undefined), forceNow })}
        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
      >
        Saqlash
      </button>
      {book.test && (
        <button type="button" onClick={() => onRemoveTest(book.id)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          Olib tashlash
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the "Challenges" tab to `CourseSidePanel.tsx`**

In `apps/frontend/src/components/course/CourseSidePanel.tsx`:
- Add `BookOpen` to the lucide import list (line 1-9 area).
- Add `"challenges"` to the `activeFullTab` union type in `CourseSidePanelProps` (line 18): `activeFullTab?: "content" | "settings" | "launch" | "groups" | "classes" | "challenges";`
- Add an `onSelectChallenges?: () => void;` prop.
- Add a new entry to `FULL_TABS`:

```typescript
{
  key: "challenges",
  label: "Challenges",
  description: "Kitobxonlik musobaqalari",
  icon: BookOpen,
},
```

- In `isTabClickable`, add `key === "challenges"` to the `variant !== "lesson"` return list.
- In `handleTabClick`, add `if (key === "challenges") onSelectChallenges?.();`
- Add `onSelectChallenges` to the destructured props in the function signature.

- [ ] **Step 4: Wire `CourseChallengesPage` into `CoursesPage.tsx`**

In `apps/frontend/src/pages/CoursesPage.tsx`:
- Import `CourseChallengesPage`.
- Add `| { view: 'challenges'; courseId: string }` to `ViewState`.
- Add `onSelectChallenges={() => setState({ view: 'challenges', courseId: state.courseId })}` to every existing page render (`content`, `settings`, `launch`, `groups`, `classes`) — this mirrors how `onSelectClasses` was added to every page when classes shipped.
- Add the `challenges` view block:

```tsx
{state.view === 'challenges' && (
  <CourseChallengesPage
    courseId={state.courseId}
    onBackToList={backToList}
    onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
    onSelectSettings={() => setState({ view: 'settings', courseId: state.courseId })}
    onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
    onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
    onSelectClasses={() => setState({ view: 'classes', courseId: state.courseId })}
  />
)}
```

Also add `onSelectChallenges={() => {}}` (no-op, matching the `onSelectGroups={() => {}}` self-referencing pattern seen in `CourseGroupsPage`) is NOT needed here since `CourseChallengesPage` doesn't render `CourseSidePanel` with `activeFullTab="challenges"` pointing at itself in a way that needs a no-op — instead pass `onSelectChallenges={() => setSelectedId(null)}` is unnecessary complexity; simply omit `onSelectChallenges` from `CourseChallengesPage`'s own `<CourseSidePanel>` call sites since it already renders with `activeFullTab="content"` there (per Step 2 above, matching how a page never needs to navigate to itself).

- [ ] **Step 5: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev`
Navigate to a course as a teacher, click the new "Challenges" tab, create a challenge, add a book, attach a test. Confirm no console errors and the UI matches other course tabs visually.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/CourseChallengesPage.tsx apps/frontend/src/components/course/CourseSidePanel.tsx apps/frontend/src/pages/CoursesPage.tsx apps/backend/src/tests/tests.service.ts apps/backend/src/tests/tests.controller.ts apps/frontend/src/api/tests.ts
git commit -m "feat(frontend): add teacher Challenges tab with book and test management"
```

---

## Task 9: Frontend web — student navigation restructure ("Jamm" hub: Challenges / Jonli Musobaqalar / Ovozli suhbat)

**Files:**
- Modify: `apps/frontend/src/components/student/StudentShell.tsx`
- Create: `apps/frontend/src/pages/ChallengesHubPage.tsx` (hub screen with 3 cards)
- Create: `apps/frontend/src/pages/ChallengesListPage.tsx` (the actual challenge list, rendered when the hub's "Challenge-lar" card is active)
- Modify: `apps/frontend/src/App.tsx` (add `/challenges` route → `ChallengesHubPage`)

**Interfaces:**
- Consumes: `useChallengeStore` is teacher-oriented (courseId-scoped); the student list needs a new store slice. Add `students: ApiStudentChallenge[]` state directly inside `ChallengesListPage` via local `useState` + a new API function (no store needed — this is a single simple list view, consistent with how `SchoolsListPage.tsx` likely works; check it briefly for the pattern before writing).
- Produces: `ApiStudentChallenge` type and `apiListMyChallenges`/`apiJoinChallenge` functions added to `apps/frontend/src/api/challenges.ts`.

**Design note:** "Jonli musobaqalar" stays reachable only from inside the "Jamm" hub — it is NOT moved to the Amaliyotlar/`/history` page. Do not touch the Amaliyotlar page in this task.

- [ ] **Step 1: Add student-facing API functions to `api/challenges.ts`**

Append to `apps/frontend/src/api/challenges.ts`:

```typescript
export interface ApiStudentChallenge {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  courseId: string;
  courseTitle: string;
  joined: boolean;
}

export async function apiListMyChallenges(): Promise<ApiStudentChallenge[]> {
  const res = await client.get('/me/challenges');
  return res.data;
}

export async function apiJoinChallenge(challengeId: string): Promise<{ id: string }> {
  const res = await client.post(`/me/challenges/${challengeId}/join`);
  return res.data;
}
```

- [ ] **Step 3: Update `StudentShell.tsx` navigation**

In `apps/frontend/src/components/student/StudentShell.tsx`:
- Replace the `Radio` import with `BookOpen` (Radio is no longer used in this file — it moves into `ChallengesHubPage.tsx`).
- In `NAV_ITEMS`, replace:

```typescript
{
  label: "Jonli musobaqalar",
  shortLabel: "Jonli",
  path: "/live/join",
  icon: Radio,
},
```

with:

```typescript
{
  label: "Jamm",
  shortLabel: "Jamm",
  path: "/challenges",
  icon: BookOpen,
},
```

- Remove the `isNavActive` special case for `/live/join` (line 59: `if (path === "/live/join") return pathname.startsWith("/live/");`) since it's no longer in `NAV_ITEMS`; the default `pathname === path` branch already handles `/challenges` correctly (no `startsWith` needed since there's no `/challenges/:id` sub-route planned in this task — if `ChallengesListPage` later needs nested routes, this can be revisited, but YAGNI for now).

- [ ] **Step 4: Create `ChallengesHubPage.tsx`**

This is the screen `/challenges` renders. It shows 3 cards and switches between a "hub" view and the "Challenges" list view in place (no route change — clicking the "Challenge-lar" card swaps the page body to the list from Step 5; clicking "Jonli Musobaqalar" navigates to `/live/join`; "Ovozli suhbat" is a disabled card).

```tsx
// apps/frontend/src/pages/ChallengesHubPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Mic, Radio } from 'lucide-react';
import { StudentShell } from '../components/student/StudentShell';
import { ChallengesListPage } from './ChallengesListPage';

type HubView = 'hub' | 'challenges';

export function ChallengesHubPage() {
  const [view, setView] = useState<HubView>('hub');
  const navigate = useNavigate();

  if (view === 'challenges') {
    return <ChallengesListPage onBack={() => setView('hub')} />;
  }

  return (
    <StudentShell>
      <div className="p-6">
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Jamm</h1>
        <p className="mb-6 text-sm text-gray-400">Kurs ichidagi faolliklar</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setView('challenges')}
            className="rounded-2xl bg-white p-5 text-left transition-colors hover:bg-gray-50"
          >
            <BookOpen size={24} className="mb-3 text-gray-700" />
            <p className="text-sm font-bold text-gray-900">Challenge-lar</p>
            <p className="mt-1 text-xs text-gray-400">Kitobxonlik challenge-lari</p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/live/join')}
            className="rounded-2xl bg-white p-5 text-left transition-colors hover:bg-gray-50"
          >
            <Radio size={24} className="mb-3 text-gray-700" />
            <p className="text-sm font-bold text-gray-900">Jonli Musobaqalar</p>
            <p className="mt-1 text-xs text-gray-400">Real vaqtda musobaqa</p>
          </button>

          <div className="cursor-not-allowed rounded-2xl bg-white p-5 text-left opacity-50">
            <div className="mb-3 flex items-center justify-between">
              <Mic size={24} className="text-gray-700" />
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Tez orada</span>
            </div>
            <p className="text-sm font-bold text-gray-900">Ovozli suhbat</p>
            <p className="mt-1 text-xs text-gray-400">Tez orada ishga tushadi</p>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
```

- [ ] **Step 5: Create `ChallengesListPage.tsx`**

First check `apps/frontend/src/pages/SchoolsListPage.tsx` for the list-page layout convention (header, grid/list of cards, join button per unjoined item) to match its visual style, then implement. This component takes an `onBack` prop (a simple back arrow/button at the top that calls it, returning to the hub view) since it now renders inside `ChallengesHubPage` rather than owning its own route:

```tsx
// apps/frontend/src/pages/ChallengesListPage.tsx
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { StudentShell } from '../components/student/StudentShell';
import { apiListMyChallenges, apiJoinChallenge, type ApiStudentChallenge } from '../api/challenges';

export function ChallengesListPage({ onBack }: { onBack: () => void }) {
  const [challenges, setChallenges] = useState<ApiStudentChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    void apiListMyChallenges().then(setChallenges).finally(() => setLoading(false));
  }, []);

  async function handleJoin(challengeId: string) {
    setJoiningId(challengeId);
    try {
      await apiJoinChallenge(challengeId);
      setChallenges((prev) => prev.map((c) => (c.id === challengeId ? { ...c, joined: true } : c)));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Qo'shilib bo'lmadi");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <StudentShell>
      <div className="p-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={14} /> Orqaga
        </button>
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Challenge-lar</h1>
        <p className="mb-6 text-sm text-gray-400">Kurslaringizdagi kitobxonlik challenge-lari</p>

        {loading ? (
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        ) : challenges.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hozircha challenge yo'q</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {challenges.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white p-4">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" />
                ) : (
                  <div className="mb-3 flex h-32 w-full items-center justify-center rounded-xl bg-gray-100">
                    <BookOpen size={28} className="text-gray-300" />
                  </div>
                )}
                <p className="mb-0.5 text-xs font-medium text-gray-400">{c.courseTitle}</p>
                <p className="mb-3 text-base font-bold text-gray-800">{c.name}</p>
                {c.joined ? (
                  <span className="inline-block rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">Qo'shilgansiz</span>
                ) : (
                  <button
                    type="button"
                    disabled={joiningId === c.id}
                    onClick={() => void handleJoin(c.id)}
                    className="w-full rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                  >
                    Qo'shilish
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
```

Adjust the wrapper (`StudentShell` usage) to match how other student pages in `App.tsx` actually wrap their content — check `SchoolsListPage.tsx`'s export to confirm whether it self-wraps in `StudentShell` or whether the router does it, and match that exactly. Since `ChallengesHubPage` already wraps its own `StudentShell`-rendered hub view, make sure `ChallengesListPage`'s `StudentShell` usage doesn't double-wrap (only one of the two components should own the outer `StudentShell` if `StudentShell` is meant to render once per page — check `StudentShell`'s implementation for whether nesting it is safe, and remove the inner one from whichever component would double-wrap).

- [ ] **Step 6: Register the route in `App.tsx`**

Add `{ path: '/challenges', element: <ChallengesHubPage /> },` next to the other student routes (near `/live/join`), and import `ChallengesHubPage`. `ChallengesListPage` does NOT get its own route — it only renders inside `ChallengesHubPage`.

- [ ] **Step 7: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev`
Log in as a student, confirm the drawer/nav shows "Jamm" instead of "Jonli musobaqalar". Clicking "Jamm" shows 3 cards: "Challenge-lar" (clicking it swaps to the challenge list with a working "Orqaga" button and "Qo'shilish" buttons), "Jonli Musobaqalar" (clicking it navigates to `/live/join`), and "Ovozli suhbat" (greyed out, "Tez orada" badge, not clickable). Confirm the Amaliyotlar (`/history`) page is unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/student/StudentShell.tsx apps/frontend/src/pages/ChallengesHubPage.tsx apps/frontend/src/pages/ChallengesListPage.tsx apps/frontend/src/App.tsx apps/frontend/src/api/challenges.ts
git commit -m "feat(frontend): replace Jonli musobaqalar nav with Jamm hub (challenges/live/voice)"
```

---

## Task 10: Frontend web — student challenge detail (events, history) and leaderboard

**Files:**
- Create: `apps/frontend/src/pages/ChallengeDetailPage.tsx`
- Modify: `apps/frontend/src/App.tsx` (add `/challenges/:id` route)
- Modify: `apps/frontend/src/pages/ChallengesListPage.tsx` (link cards to detail page)

**Interfaces:**
- Consumes: `apiGetChallenge`-equivalent for students (need a new `apiGetMyChallengeDetail`, `apiAddChallengeEvent`, `apiGetMyChallengeHistory`, `apiGetChallengeLeaderboard` added to `api/challenges.ts`), `useNavigate`/`useParams` from `react-router-dom`.
- Produces: fully working student flow to add events and view leaderboard/history.

- [ ] **Step 1: Add remaining student API functions to `api/challenges.ts`**

```typescript
export interface ApiMyChallengeBook {
  id: string;
  title: string;
  totalPages: number;
  lastPageRead: number;
  completed: boolean;
  pendingTest: { testId: string; slug: string; name: string } | null;
}

export interface ApiMyChallengeDetail {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  books: ApiMyChallengeBook[];
}

export interface ApiChallengeEvent {
  id: string;
  challengeBookId: string;
  startPage: number;
  endPage: number;
  newWordsCount: number;
  createdAt: string;
  book: { id: string; title: string };
}

export async function apiGetMyChallengeDetail(challengeId: string): Promise<ApiMyChallengeDetail> {
  const res = await client.get(`/me/challenges/${challengeId}`);
  return res.data;
}

export async function apiAddChallengeEvent(
  challengeId: string,
  bookId: string,
  data: { endPage: number; newWordsCount: number },
): Promise<ApiChallengeEvent> {
  const res = await client.post(`/me/challenges/${challengeId}/books/${bookId}/events`, data);
  return res.data;
}

export async function apiGetMyChallengeHistory(challengeId: string): Promise<ApiChallengeEvent[]> {
  const res = await client.get(`/me/challenges/${challengeId}/history`);
  return res.data;
}

export async function apiGetMyChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  bookId?: string,
): Promise<{ entries: ApiChallengeLeaderboardEntry[] }> {
  const res = await client.get(`/me/challenges/${challengeId}/leaderboard`, { params: { metric, bookId } });
  return res.data;
}
```

- [ ] **Step 2: Implement `ChallengeDetailPage.tsx`**

```tsx
// apps/frontend/src/pages/ChallengeDetailPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { StudentShell } from '../components/student/StudentShell';
import {
  apiGetMyChallengeDetail, apiAddChallengeEvent, apiGetChallengeLeaderboard,
  type ApiMyChallengeDetail, type ApiChallengeLeaderboardEntry, type ChallengeLeaderboardMetric,
} from '../api/challenges';

const METRICS: { key: ChallengeLeaderboardMetric; label: string }[] = [
  { key: 'overall', label: 'Umumiy' },
  { key: 'books', label: 'Kitoblar' },
  { key: 'words', label: "Lug'at" },
  { key: 'speed', label: 'Tezlik' },
];

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ApiMyChallengeDetail | null>(null);
  const [tab, setTab] = useState<'books' | 'leaderboard'>('books');
  const [metric, setMetric] = useState<ChallengeLeaderboardMetric>('overall');
  const [entries, setEntries] = useState<ApiChallengeLeaderboardEntry[]>([]);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [endPage, setEndPage] = useState('');
  const [newWords, setNewWords] = useState('');

  useEffect(() => {
    if (id) void apiGetMyChallengeDetail(id).then(setDetail);
  }, [id]);

  useEffect(() => {
    if (id && tab === 'leaderboard') void apiGetChallengeLeaderboard(id, metric).then((r) => setEntries(r.entries));
  }, [id, tab, metric]);

  if (!detail || !id) return <StudentShell><p className="p-6 text-sm text-gray-400">Yuklanmoqda...</p></StudentShell>;

  async function handleSubmitEvent(bookId: string) {
    if (!id) return;
    const book = detail!.books.find((b) => b.id === bookId)!;
    if (book.pendingTest) {
      navigate(`/t/${book.pendingTest.slug}`);
      return;
    }
    try {
      await apiAddChallengeEvent(id, bookId, { endPage: parseInt(endPage, 10), newWordsCount: parseInt(newWords || '0', 10) });
      const refreshed = await apiGetMyChallengeDetail(id);
      setDetail(refreshed);
      setAddingBookId(null);
      setEndPage('');
      setNewWords('');
      toast.success('Yozuv qo\'shildi');
    } catch (error: any) {
      const requiredTestSlug = error?.response?.data?.requiredTestSlug;
      if (requiredTestSlug) {
        toast.error("Avval majburiy testni yakunlang");
        navigate(`/t/${requiredTestSlug}`);
        return;
      }
      toast.error(error?.response?.data?.message ?? "Yozuv qo'shib bo'lmadi");
    }
  }

  return (
    <StudentShell>
      <div className="p-6">
        <button type="button" onClick={() => navigate('/challenges')} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500">
          <ArrowLeft size={16} /> Jamm
        </button>

        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">{detail.name}</h1>
        <p className="mb-6 text-sm text-gray-400">{detail.description}</p>

        <div className="mb-4 flex gap-2 rounded-2xl bg-white p-2">
          <button type="button" onClick={() => setTab('books')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === 'books' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>Kitoblar</button>
          <button type="button" onClick={() => setTab('leaderboard')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === 'leaderboard' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>Reyting</button>
        </div>

        {tab === 'books' ? (
          <div className="flex flex-col gap-2">
            {detail.books.map((book) => (
              <div key={book.id} className="rounded-2xl bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-gray-800">{book.title}</p>
                  <p className="text-xs text-gray-400">{book.lastPageRead}/{book.totalPages} bet</p>
                </div>
                <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (book.lastPageRead / book.totalPages) * 100)}%` }} />
                </div>

                {book.pendingTest && (
                  <button
                    type="button"
                    onClick={() => navigate(`/t/${book.pendingTest!.slug}`)}
                    className="mb-2 w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
                  >
                    Majburiy test: {book.pendingTest.name} — bosing
                  </button>
                )}

                {addingBookId === book.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Boshlagan bet: {book.lastPageRead}</span>
                    </div>
                    <input value={endPage} onChange={(e) => setEndPage(e.target.value)} type="number" min={book.lastPageRead + 1} placeholder="Tugagan bet" className="rounded-xl bg-gray-50 px-3 py-2 text-sm outline-none" />
                    <input value={newWords} onChange={(e) => setNewWords(e.target.value)} type="number" min={0} placeholder="Yangi lug'at soni" className="rounded-xl bg-gray-50 px-3 py-2 text-sm outline-none" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void handleSubmitEvent(book.id)} className="flex-1 rounded-xl bg-gray-900 py-2 text-xs font-semibold text-white">Saqlash</button>
                      <button type="button" onClick={() => setAddingBookId(null)} className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">Bekor</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!!book.pendingTest}
                    onClick={() => setAddingBookId(book.id)}
                    className="w-full rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Yangi yozuv
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-5">
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${metric === m.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div key={entry.studentId} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                  <span className="w-6 text-center text-sm font-bold text-gray-500">{entry.rank}</span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{entry.studentName}</p>
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                    <Trophy size={12} /> {entry.value}
                  </span>
                </div>
              ))}
              {entries.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Hali reyting yo'q</p>}
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
```

- [ ] **Step 3: Register the route in `App.tsx`**

Add `{ path: '/challenges/:id', element: <ChallengeDetailPage /> },` and import it.

- [ ] **Step 4: Link challenge cards to the detail page**

In `ChallengesListPage.tsx`, wrap the joined-challenge card content in a click handler that navigates to `/challenges/${c.id}` (only when `c.joined` is true — otherwise the "Qo'shilish" button is the only action). Import `useNavigate` and add `onClick={() => c.joined && navigate(`/challenges/${c.id}`)}` to the card's outer `div`, with `cursor-pointer` conditionally applied.

- [ ] **Step 5: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev`
As a student: join a challenge, add a book event, confirm the progress bar updates and start-page auto-fills correctly on the next event. Configure a mandatory test on a book (as teacher) with a low `triggerPage`, confirm the student is blocked and redirected to the test. Check the leaderboard tab renders entries across all 4 metrics without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/ChallengeDetailPage.tsx apps/frontend/src/pages/ChallengesListPage.tsx apps/frontend/src/App.tsx apps/frontend/src/api/challenges.ts
git commit -m "feat(frontend): add student challenge detail page with events and leaderboard"
```

---

## Task 11: Mobile — challenges API client and types

**Files:**
- Create: `apps/mobile/src/api/challenges.ts`
- Modify: `apps/mobile/src/types/api.ts` (add challenge types)

**Interfaces:**
- Consumes: `api` axios instance from `../lib/api` (check its export name/path via `grep -n "export" apps/mobile/src/lib/api.ts` before use — the web app uses `client` from `./client`, mobile's equivalent was seen as `api` in `CourseLeaderboardSheet.tsx`).
- Produces: `ApiStudentChallenge`, `ApiMyChallengeDetail`, `ApiMyChallengeBook`, `ApiChallengeEvent`, `ApiChallengeLeaderboardEntry` types in `types/api.ts`; `apiListMyChallenges`, `apiJoinChallenge`, `apiGetMyChallengeDetail`, `apiAddChallengeEvent`, `apiGetMyChallengeHistory`, `apiGetChallengeLeaderboard` functions in `api/challenges.ts`.

- [ ] **Step 1: Add types to `types/api.ts`**

Append near the existing `ApiMyCourseLeaderboard` block (after line 84):

```typescript
export type ApiStudentChallenge = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  courseId: string;
  courseTitle: string;
  joined: boolean;
};

export type ApiMyChallengeBook = {
  id: string;
  title: string;
  totalPages: number;
  lastPageRead: number;
  completed: boolean;
  pendingTest: {testId: string; slug: string; name: string} | null;
};

export type ApiMyChallengeDetail = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  books: ApiMyChallengeBook[];
};

export type ApiChallengeEvent = {
  id: string;
  challengeBookId: string;
  startPage: number;
  endPage: number;
  newWordsCount: number;
  createdAt: string;
  book: {id: string; title: string};
};

export type ChallengeLeaderboardMetric = 'overall' | 'books' | 'words' | 'speed';

export type ApiChallengeLeaderboardEntry = {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
};
```

- [ ] **Step 2: Implement `api/challenges.ts`**

```typescript
// apps/mobile/src/api/challenges.ts
import {api} from '../lib/api';
import type {
  ApiChallengeEvent, ApiChallengeLeaderboardEntry, ApiMyChallengeDetail,
  ApiStudentChallenge, ChallengeLeaderboardMetric,
} from '../types/api';

export async function apiListMyChallenges(): Promise<ApiStudentChallenge[]> {
  const res = await api.get('/me/challenges');
  return res.data;
}

export async function apiJoinChallenge(challengeId: string): Promise<{id: string}> {
  const res = await api.post(`/me/challenges/${challengeId}/join`);
  return res.data;
}

export async function apiGetMyChallengeDetail(challengeId: string): Promise<ApiMyChallengeDetail> {
  const res = await api.get(`/me/challenges/${challengeId}`);
  return res.data;
}

export async function apiAddChallengeEvent(
  challengeId: string,
  bookId: string,
  data: {endPage: number; newWordsCount: number},
): Promise<ApiChallengeEvent> {
  const res = await api.post(`/me/challenges/${challengeId}/books/${bookId}/events`, data);
  return res.data;
}

export async function apiGetMyChallengeHistory(challengeId: string): Promise<ApiChallengeEvent[]> {
  const res = await api.get(`/me/challenges/${challengeId}/history`);
  return res.data;
}

export async function apiGetChallengeLeaderboard(
  challengeId: string,
  metric: ChallengeLeaderboardMetric,
  bookId?: string,
): Promise<{entries: ApiChallengeLeaderboardEntry[]}> {
  const res = await api.get(`/me/challenges/${challengeId}/leaderboard`, {params: {metric, bookId}});
  return res.data;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors in the two new/modified files.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/api/challenges.ts apps/mobile/src/types/api.ts
git commit -m "feat(mobile): add challenges API client and types"
```

---

## Task 12: Mobile — navigation restructure (Jamm hub tab, Live moved to stack)

**Files:**
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`
- Create: `apps/mobile/src/screens/ChallengesScreen.tsx` (hub screen, see Task 13 for full implementation — this task creates a minimal placeholder wired into navigation, Task 13 fills it in, to keep this task's diff focused on navigation)

**Design note:** "Jonli musobaqalar" is reachable only from inside the "Jamm" tab's hub (Task 13) — do NOT add a header button to `HistoryScreen.tsx`; that screen is untouched by this plan.

**Interfaces:**
- Consumes: existing `LiveScreen`, `HistoryScreen` components.
- Produces: `TabParamList` with `Jamm` replacing `Live`; `RootStackParamList` with `Live: undefined` added.

- [ ] **Step 1: Update `navigation/types.ts`**

```typescript
// apps/mobile/src/navigation/types.ts
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Courses: {schoolId: string; schoolName: string};
  Course: {courseId: string; title: string};
  Web: {path: string; title: string; onlineRequired?: boolean};
  Chat: {chatId: string; title: string};
  Classroom: {sessionId: string};
  Live: undefined;
  SubmissionDetail: {submissionId: string; title: string; source?: 'me' | 'practice'};
  SchoolInvite: {token: string};
  TestTaker: {slug: string; title: string; practiceMode: boolean; submissionId?: string};
  TestResult: {submissionId: string; title: string; practiceMode: boolean};
};
export type TabParamList = {
  Schools: undefined;
  History: undefined;
  Messenger: undefined;
  Jamm: undefined;
  Profile: undefined;
};
```

- [ ] **Step 2: Create the placeholder `ChallengesScreen.tsx`**

```tsx
// apps/mobile/src/screens/ChallengesScreen.tsx
import React from 'react';
import {Text, View} from 'react-native';
import {Screen} from '../components/Ui';

export function ChallengesScreen() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-ink dark:text-dark-ink">Jamm</Text>
      </View>
    </Screen>
  );
}
```

(Task 13 replaces this body with the full list implementation — this task only needs it to exist so `RootNavigator.tsx` compiles.)

- [ ] **Step 3: Update `RootNavigator.tsx`**

- Add import: `import {ChallengesScreen} from '../screens/ChallengesScreen';`
- Change the `icons` map: replace `Live: Radio,` with `Jamm: BookOpen,` and add `BookOpen` to the lucide import list. `Radio` is no longer rendered anywhere in `RootNavigator.tsx` itself once this change lands (it moves into `ChallengesScreen.tsx`'s hub view, Task 13) — remove it from this file's imports if it becomes unused; confirm with `grep -n "Radio" apps/mobile/src/navigation/RootNavigator.tsx` after the edit.
- Change the tab screen: replace `<Tab.Screen name="Live" component={LiveScreen} options={{title: 'Jonli'}} />` with `<Tab.Screen name="Jamm" component={ChallengesScreen} options={{title: 'Jamm'}} />`.
- Remove the `import {LiveScreen} from '../screens/LiveScreen';` line from the top and re-add it further down since it's now used as a Stack screen (or just leave the import in place — it's still imported, only its usage site changes).
- Add a new `Stack.Screen` inside the `<>...</>` authenticated block (alongside `Classroom`, `Chat`, etc.):

```tsx
<Stack.Screen
  name="Live"
  component={LiveScreen}
  options={{title: 'Jonli musobaqalar'}}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify on simulator/device**

Run: `cd apps/mobile && npm run ios` (or `npm run android`)
Confirm the bottom tab bar shows "Jamm" instead of "Jonli", and tapping it shows the placeholder screen. Confirm `HistoryScreen`/Amaliyotlar is unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/navigation apps/mobile/src/screens/ChallengesScreen.tsx
git commit -m "feat(mobile): replace Jonli tab with Jamm, move Live to stack"
```

---

## Task 13: Mobile — ChallengesScreen (list) and ChallengeDetailScreen (events, leaderboard)

**Files:**
- Modify: `apps/mobile/src/screens/ChallengesScreen.tsx` (replace placeholder)
- Create: `apps/mobile/src/screens/ChallengeDetailScreen.tsx`
- Modify: `apps/mobile/src/navigation/types.ts` (add `ChallengeDetail: {challengeId: string; title: string}` to `RootStackParamList`)
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx` (register `ChallengeDetail` stack screen)

**Interfaces:**
- Consumes: API functions from Task 11, `cached` from `../lib/storage` (existing offline-cache wrapper seen in `HistoryScreen.tsx`/`CourseScreen.tsx`), `Screen`/`Loading`/`Empty` from `../components/Ui`.
- Produces: fully working mobile student flow, mirroring Task 10's web page.

- [ ] **Step 1: Add `ChallengeDetail` to `RootStackParamList`**

In `apps/mobile/src/navigation/types.ts`, add: `ChallengeDetail: {challengeId: string; title: string};` to `RootStackParamList` (alongside `Course`, `Live`, etc.).

- [ ] **Step 2: Implement `ChallengesScreen.tsx`**

This is now a hub screen with 3 cards, matching the web `ChallengesHubPage` design: **Challenge-lar** (active — switches this same screen to an inline challenge list), **Jonli Musobaqalar** (active — `navigation.navigate('Live')`), **Ovozli suhbat** (inactive, "Tez orada" badge, not pressable). The `view` state toggles between `'hub'` and `'challenges'` in place, the same pattern as the web version — no new route/screen for the list.

```tsx
// apps/mobile/src/screens/ChallengesScreen.tsx
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Image, Pressable, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {BookOpen, Mic, Radio} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../navigation/types';
import type {ApiStudentChallenge} from '../types/api';
import {apiListMyChallenges, apiJoinChallenge} from '../api/challenges';
import {Empty, Loading, Screen} from '../components/Ui';
import {getApiErrorMessage} from '../lib/errors';

type HubView = 'hub' | 'challenges';

export function ChallengesScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [view, setView] = useState<HubView>('hub');
  const insets = useSafeAreaInsets();

  if (view === 'challenges') {
    return <ChallengesListView navigation={navigation} onBack={() => setView('hub')} />;
  }

  return (
    <Screen>
      <View style={{paddingTop: insets.top + 20}} className="bg-white px-5 pb-4 dark:bg-dark-canvas">
        <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">Jamm</Text>
      </View>
      <View className="flex-1 gap-2 p-4">
        <Pressable
          onPress={() => setView('challenges')}
          className="flex-row items-center gap-2 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <BookOpen size={22} color="#334155" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Challenge-lar</Text>
            <Text className="text-xs text-gray-400">Kitobxonlik challenge-lari</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Live')}
          className="flex-row items-center gap-2 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <Radio size={22} color="#334155" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Jonli Musobaqalar</Text>
            <Text className="text-xs text-gray-400">Real vaqtda musobaqa</Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2 rounded-2xl bg-white p-4 opacity-50 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <Mic size={22} color="#334155" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Ovozli suhbat</Text>
            <Text className="text-xs text-gray-400">Tez orada ishga tushadi</Text>
          </View>
          <View className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-dark-canvas">
            <Text className="text-[10px] font-semibold text-gray-500">Tez orada</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function ChallengesListView({
  navigation,
  onBack,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  onBack: () => void;
}) {
  const [challenges, setChallenges] = useState<ApiStudentChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const list = await apiListMyChallenges();
      setChallenges(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePress(item: ApiStudentChallenge) {
    if (!item.joined) {
      setJoiningId(item.id);
      try {
        await apiJoinChallenge(item.id);
        setChallenges(prev => prev.map(c => (c.id === item.id ? {...c, joined: true} : c)));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(getApiErrorMessage(err, "Qo'shilib bo'lmadi"));
        return;
      } finally {
        setJoiningId(null);
      }
    }
    navigation.navigate('ChallengeDetail', {challengeId: item.id, title: item.name});
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <View style={{paddingTop: insets.top + 20}} className="flex-row items-center gap-2 bg-white px-5 pb-4 dark:bg-dark-canvas">
        <Pressable onPress={onBack} hitSlop={8}>
          <Text className="text-sm font-semibold text-gray-500">{'< Orqaga'}</Text>
        </Pressable>
      </View>
      <View className="bg-white px-5 pb-4 dark:bg-dark-canvas">
        <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">Challenge-lar</Text>
      </View>
      {challenges.length === 0 ? (
        <Empty message="Hozircha challenge yo'q" />
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={item => item.id}
          contentContainerStyle={{padding: 16, gap: 10}}
          renderItem={({item}) => (
            <Pressable
              onPress={() => void handlePress(item)}
              disabled={joiningId === item.id}
              className="flex-row items-center gap-2 rounded-2xl bg-white p-3 dark:bg-dark-surface">
              {item.imageUrl ? (
                <Image source={{uri: item.imageUrl}} className="h-11 w-12 rounded-xl" />
              ) : (
                <View className="h-11 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
                  <BookOpen size={20} color="#94a3b8" />
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-xs text-gray-400">{item.courseTitle}</Text>
                <Text numberOfLines={1} className="text-base font-bold text-ink dark:text-dark-ink">{item.name}</Text>
              </View>
              {!item.joined && (
                <View className="rounded-full bg-gray-900 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-white">Qo'shilish</Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
```

- [ ] **Step 3: Implement `ChallengeDetailScreen.tsx`**

```tsx
// apps/mobile/src/screens/ChallengeDetailScreen.tsx
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, TextInput, View, Pressable} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Trophy} from 'lucide-react-native';
import type {RootStackParamList} from '../navigation/types';
import type {ApiChallengeLeaderboardEntry, ApiMyChallengeDetail, ChallengeLeaderboardMetric} from '../types/api';
import {apiAddChallengeEvent, apiGetChallengeLeaderboard, apiGetMyChallengeDetail} from '../api/challenges';
import {Loading, Screen} from '../components/Ui';
import {getApiErrorMessage} from '../lib/errors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeDetail'>;

const METRICS: {key: ChallengeLeaderboardMetric; label: string}[] = [
  {key: 'overall', label: 'Umumiy'},
  {key: 'books', label: 'Kitoblar'},
  {key: 'words', label: "Lug'at"},
  {key: 'speed', label: 'Tezlik'},
];

export function ChallengeDetailScreen({route, navigation}: Props) {
  const {challengeId} = route.params;
  const [detail, setDetail] = useState<ApiMyChallengeDetail | null>(null);
  const [tab, setTab] = useState<'books' | 'leaderboard'>('books');
  const [metric, setMetric] = useState<ChallengeLeaderboardMetric>('overall');
  const [entries, setEntries] = useState<ApiChallengeLeaderboardEntry[]>([]);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [endPage, setEndPage] = useState('');
  const [newWords, setNewWords] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiGetMyChallengeDetail(challengeId);
    setDetail(data);
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'leaderboard') {
      void apiGetChallengeLeaderboard(challengeId, metric).then(r => setEntries(r.entries));
    }
  }, [challengeId, tab, metric]);

  if (!detail) return <Loading />;

  async function submitEvent(bookId: string) {
    const book = detail!.books.find(b => b.id === bookId)!;
    if (book.pendingTest) {
      navigation.navigate('TestTaker', {slug: book.pendingTest.slug, title: book.pendingTest.name, practiceMode: false});
      return;
    }
    try {
      await apiAddChallengeEvent(challengeId, bookId, {
        endPage: parseInt(endPage, 10),
        newWordsCount: parseInt(newWords || '0', 10),
      });
      await load();
      setAddingBookId(null);
      setEndPage('');
      setNewWords('');
      setError(null);
    } catch (err: any) {
      const requiredTestSlug = err?.response?.data?.requiredTestSlug;
      const requiredTestName = err?.response?.data?.requiredTestName;
      if (requiredTestSlug) {
        navigation.navigate('TestTaker', {slug: requiredTestSlug, title: requiredTestName ?? 'Test', practiceMode: false});
        return;
      }
      setError(getApiErrorMessage(err, "Yozuv qo'shib bo'lmadi"));
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{padding: 16, gap: 12}}>
        <View className="flex-row gap-2 rounded-2xl bg-white p-1.5 dark:bg-dark-surface">
          <Pressable onPress={() => setTab('books')} className={`flex-1 items-center rounded-xl py-2.5 ${tab === 'books' ? 'bg-gray-900' : ''}`}>
            <Text className={`text-sm font-semibold ${tab === 'books' ? 'text-white' : 'text-gray-500'}`}>Kitoblar</Text>
          </Pressable>
          <Pressable onPress={() => setTab('leaderboard')} className={`flex-1 items-center rounded-xl py-2.5 ${tab === 'leaderboard' ? 'bg-gray-900' : ''}`}>
            <Text className={`text-sm font-semibold ${tab === 'leaderboard' ? 'text-white' : 'text-gray-500'}`}>Reyting</Text>
          </Pressable>
        </View>

        {tab === 'books' ? (
          detail.books.map(book => (
            <View key={book.id} className="rounded-2xl bg-white p-4 dark:bg-dark-surface">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="font-semibold text-ink dark:text-dark-ink">{book.title}</Text>
                <Text className="text-xs text-gray-400">{book.lastPageRead}/{book.totalPages} bet</Text>
              </View>
              <View className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-dark-canvas">
                <View className="h-full rounded-full bg-indigo-500" style={{width: `${Math.min(100, (book.lastPageRead / book.totalPages) * 100)}%`}} />
              </View>

              {book.pendingTest && (
                <Pressable
                  onPress={() => navigation.navigate('TestTaker', {slug: book.pendingTest!.slug, title: book.pendingTest!.name, practiceMode: false})}
                  className="mb-2 rounded-xl bg-amber-50 px-3 py-2">
                  <Text className="text-xs font-semibold text-amber-700">Majburiy test: {book.pendingTest.name} — bosing</Text>
                </Pressable>
              )}

              {addingBookId === book.id ? (
                <View className="gap-2">
                  <Text className="text-xs text-gray-500">Boshlagan bet: {book.lastPageRead}</Text>
                  <TextInput
                    value={endPage}
                    onChangeText={setEndPage}
                    keyboardType="number-pad"
                    placeholder="Tugagan bet"
                    className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-dark-canvas dark:text-dark-ink"
                  />
                  <TextInput
                    value={newWords}
                    onChangeText={setNewWords}
                    keyboardType="number-pad"
                    placeholder="Yangi lug'at soni"
                    className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-dark-canvas dark:text-dark-ink"
                  />
                  {error && <Text className="text-xs text-red-500">{error}</Text>}
                  <View className="flex-row gap-2">
                    <Pressable onPress={() => void submitEvent(book.id)} className="flex-1 items-center rounded-xl bg-gray-900 py-2.5">
                      <Text className="text-xs font-semibold text-white">Saqlash</Text>
                    </Pressable>
                    <Pressable onPress={() => { setAddingBookId(null); setError(null); }} className="rounded-xl bg-gray-100 px-4 py-2.5 dark:bg-dark-canvas">
                      <Text className="text-xs font-semibold text-gray-600 dark:text-dark-ink">Bekor</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  disabled={!!book.pendingTest}
                  onPress={() => setAddingBookId(book.id)}
                  className={`items-center rounded-xl py-2.5 ${book.pendingTest ? 'bg-gray-50 dark:bg-dark-canvas' : 'bg-gray-100 dark:bg-dark-canvas'}`}>
                  <Text className={`text-xs font-semibold ${book.pendingTest ? 'text-gray-300' : 'text-gray-700 dark:text-dark-ink'}`}>+ Yangi yozuv</Text>
                </Pressable>
              )}
            </View>
          ))
        ) : (
          <View className="rounded-2xl bg-white p-4 dark:bg-dark-surface">
            <View className="mb-3 flex-row gap-2">
              {METRICS.map(m => (
                <Pressable
                  key={m.key}
                  onPress={() => setMetric(m.key)}
                  className={`rounded-full px-3 py-1.5 ${metric === m.key ? 'bg-gray-900' : 'bg-gray-100 dark:bg-dark-canvas'}`}>
                  <Text className={`text-xs font-semibold ${metric === m.key ? 'text-white' : 'text-gray-500'}`}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <View className="gap-2">
              {entries.map(entry => (
                <View key={entry.studentId} className={`flex-row items-center gap-2 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent ? 'bg-indigo-50' : 'bg-gray-50 dark:bg-dark-canvas'}`}>
                  <Text className="w-6 text-center text-sm font-bold text-gray-500">{entry.rank}</Text>
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-ink dark:text-dark-ink">{entry.studentName}</Text>
                  <View className="flex-row items-center gap-1 rounded-full bg-amber-100 px-2 py-1">
                    <Trophy size={12} color="#b45309" />
                    <Text className="text-xs font-bold text-amber-700">{entry.value}</Text>
                  </View>
                </View>
              ))}
              {entries.length === 0 && <Text className="py-8 text-center text-sm text-gray-400">Hali reyting yo'q</Text>}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 4: Register `ChallengeDetail` in `RootNavigator.tsx`**

Add import: `import {ChallengeDetailScreen} from '../screens/ChallengeDetailScreen';`

Add stack screen (alongside `Live` from Task 12):

```tsx
<Stack.Screen
  name="ChallengeDetail"
  component={ChallengeDetailScreen}
  options={({route}) => ({title: route.params.title})}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify on simulator/device**

Run: `cd apps/mobile && npm run ios` (or `npm run android`)
As a student: open Jamm tab, join a challenge, tap into detail, add a reading event, confirm start page auto-fills from the previous event, confirm a mandatory test blocks the flow and navigates to `TestTaker`, and check the leaderboard tab across metrics.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/ChallengesScreen.tsx apps/mobile/src/screens/ChallengeDetailScreen.tsx apps/mobile/src/navigation
git commit -m "feat(mobile): add challenge list, detail, event logging, and leaderboard screens"
```

---

## Task 14: End-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: all tests pass, including the new `challenges` and `student-challenges` specs.

- [ ] **Step 2: Run backend and frontend type checks**

Run: `cd apps/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit && cd ../mobile && npx tsc --noEmit`
Expected: no errors in any of the three projects.

- [ ] **Step 3: Manual end-to-end walkthrough**

With backend running locally and a migrated DB (Task 2):
1. As a teacher (web): create a course, add a challenge with a book (`totalPages: 100`), attach an existing test with `triggerPage: 20`.
2. As a student (web) enrolled in that course: open "Jamm", confirm the hub shows 3 cards (Challenge-lar, Jonli Musobaqalar active; Ovozli suhbat greyed out with "Tez orada" and not clickable). Tap "Challenge-lar", see the challenge, join it, add an event to page 25 — confirm the mandatory test blocks submission and redirects to `/t/<slug>`.
3. Complete the test, return, add the same event again — confirm it now succeeds and the book's progress bar reflects page 25/100.
4. Check the leaderboard tab shows the student under all 4 metrics.
5. From the "Jamm" hub, tap "Jonli Musobaqalar" and confirm it opens the existing live-competitions flow (`/live/join`).
6. Repeat steps 2-5 on mobile (Jamm tab → hub cards → Challenge-lar → challenge detail → event → mandatory test → `TestTaker` screen → leaderboard; separately, Jamm tab → Jonli Musobaqalar card → live screen). Confirm the Amaliyotlar/History screen is unchanged on both platforms.

- [ ] **Step 4: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix: address issues found during challenges end-to-end verification"
```
