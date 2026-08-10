# So'z yodlash (word memorization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "So'z yodlash" as a second Challenges type alongside the existing kitobxonlik (reading) type — teachers enter word/translation pairs, students practice via a swipe-based Flashcard mode or a 4-choice Test mode, with one shared known/unknown state per word per student feeding a leaderboard. Also rebuild the mobile Challenges feature from scratch (kitobxonlik + the new word-memorization type), since the mobile implementation from an earlier plan never survived (the `apps/mobile/` directory is repo-wide `.gitignore`d and the prior work was lost when its worktree was cleaned up).

**Architecture:** New Drizzle tables `challengeWords`/`challengeWordProgress`, alongside the existing `challengeBooks`/`challengeBookProgress`. New backend services (`challenge-words.service.ts`, `student-challenge-words.service.ts`) mirroring the existing `challenges.service.ts`/`student-challenges.service.ts` split, registered in the existing `ChallengesModule`. Web frontend: `CourseChallengesPage.tsx` branches its detail view on `challenge.type` (books panel vs. new words panel); a new `ChallengeWordPracticePage.tsx` handles the Flashcard/Test practice flow, reusing the swipe mechanics validated in the brainstorming demo. Mobile: rebuild `ChallengesScreen.tsx` (hub with 3 cards: Challenge-lar / Jonli Musobaqalar / Ovozli suhbat) and `ChallengeDetailScreen.tsx` (kitobxonlik books/leaderboard, restored from the plan that built it originally), plus new `ChallengeWordsScreen.tsx`/practice screens for word memorization.

**Tech Stack:** NestJS + Drizzle ORM + PostgreSQL (backend), React + Zustand + react-router (frontend web), React Native + React Navigation + NativeWind (mobile). Existing patterns: `class-validator` DTOs, `JwtAuthGuard`+`RolesGuard`+`@Roles(...)`, `req.admin.id` / `req.user.id`, Jest with `jest.mock('../db', ...)`.

## Global Constraints

- `challenges.type` is a free-text column (already exists, default `'kitobxonlik'`) — this plan adds `'soz_yodlash'` as a second value. The frontend renders `type` as a select with exactly these two options; never hardcode a single-option select.
- A challenge's `type` determines which child entity it owns: `'kitobxonlik'` → `challengeBooks`; `'soz_yodlash'` → `challengeWords`. A single challenge never has both.
- Every word has exactly one shared `known: boolean` state per participant (`challengeWordProgress`), written immediately (no batching) by either Flashcard swipes or Test answers — never two separate states.
- Right-swipe (Flashcard) or a correct Test answer → `known = true`. Left-swipe (Flashcard) or a wrong Test answer → `known = false`, even overwriting a prior `known = true`.
- Bulk word import parses `"word - translation"` lines (` - ` separator); malformed lines are skipped, not rejected — the import reports `{ added, skipped }` counts.
- Test-mode wrong-answer choices are drawn only from words within the same challenge, never from other challenges.
- The leaderboard metric for `soz_yodlash` challenges is a single fixed metric (count of `known = true` rows) — no metric selector, unlike kitobxonlik's four metrics.
- No new mandatory-test gating logic for `soz_yodlash` — that concept is kitobxonlik-specific (`challengeBookTests`) and does not apply here.
- Mobile navigation: the "Jamm" tab is a hub screen with 3 cards — **Challenge-lar** (active, switches the same screen to an inline list), **Jonli Musobaqalar** (active, `navigation.navigate('Live')`), **Ovozli suhbat** (inactive, "Tez orada" badge, not pressable). `HistoryScreen.tsx` is never touched.
- Out of scope (YAGNI, per the design spec): example sentences on words, CSV file upload import, persisting the mode/direction choice across sessions, separate flashcard-vs-test statistics, spaced-repetition difficulty scoring.

---

## Task 1: Drizzle schema — challengeWords and challengeWordProgress tables

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Test: none (schema-only; validated via Task 2's migration and Task 3/4's service tests)

**Interfaces:**
- Consumes: `challenges`, `challengeParticipants` tables (already exist in `schema.ts`).
- Produces: Drizzle tables `challengeWords`, `challengeWordProgress`, plus their `relations()` exports — later tasks import these from `../db/schema`.

- [ ] **Step 1: Add the two tables to schema.ts**

Append after the `challengeEventsRelations` block at the end of `apps/backend/src/db/schema.ts` (the file currently ends around line 808 with `challengeEventsRelations` — append immediately after it, following the same style as the existing `challengeBooks`/`challengeBookProgress` tables just above):

```typescript
export const challengeWords = pgTable('challenge_words', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeId: uuid('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  word: text('word').notNull(),
  translation: text('translation').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const challengeWordProgress = pgTable('challenge_word_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeParticipantId: uuid('challenge_participant_id').notNull().references(() => challengeParticipants.id, { onDelete: 'cascade' }),
  challengeWordId: uuid('challenge_word_id').notNull().references(() => challengeWords.id, { onDelete: 'cascade' }),
  known: boolean('known').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueParticipantWord: uniqueIndex('challenge_word_progress_participant_id_word_id_key').on(table.challengeParticipantId, table.challengeWordId),
}));

export const challengeWordsRelations = relations(challengeWords, ({ one, many }) => ({
  challenge: one(challenges, { fields: [challengeWords.challengeId], references: [challenges.id] }),
  progress: many(challengeWordProgress),
}));

export const challengeWordProgressRelations = relations(challengeWordProgress, ({ one }) => ({
  participant: one(challengeParticipants, { fields: [challengeWordProgress.challengeParticipantId], references: [challengeParticipants.id] }),
  word: one(challengeWords, { fields: [challengeWordProgress.challengeWordId], references: [challengeWords.id] }),
}));
```

Also add a `words: many(challengeWords)` entry to the existing `challengesRelations` block (find `export const challengesRelations = relations(challenges, ({ one, many }) => ({` — it currently has `course`, `books`, `participants`; add `words: many(challengeWords),` alongside `books: many(challengeBooks),`).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors referencing `schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db/schema.ts
git commit -m "feat(backend): add challengeWords and challengeWordProgress schema tables"
```

---

## Task 2: Generate and apply the Drizzle migration

**Files:**
- Create: `apps/backend/drizzle/migrations/<timestamp>_*.sql` (auto-generated)
- Modify: `apps/backend/drizzle/migrations/meta/_journal.json` (auto-generated)

**Interfaces:**
- Consumes: schema from Task 1.
- Produces: applied DB tables that Task 3/4's services can query against. Tests in those tasks mock `db`, so this task only needs to succeed against whatever DB is configured for local dev — if no DB is reachable, still generate the SQL file (this does not require a live connection) and skip the apply step, noting it must run before deploy.

- [ ] **Step 1: Generate the migration**

Run: `cd apps/backend && npm run db:generate`
Expected: a new `.sql` file appears under `apps/backend/drizzle/migrations/` containing `CREATE TABLE "challenge_words"` and `CREATE TABLE "challenge_word_progress"`.

- [ ] **Step 2: Review the generated SQL**

Read the new migration file and confirm both tables, their foreign keys (`ON DELETE CASCADE` on `challenge_id`, `challenge_participant_id`, `challenge_word_id`), and the unique index (`challenge_word_progress(challenge_participant_id, challenge_word_id)`) are present.

- [ ] **Step 3: Apply the migration (if a local dev DB is configured)**

Run: `cd apps/backend && npm run db:migrate`
Expected: migration applies without error. If no DB is reachable, skip execution but leave the generated file in place.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/drizzle/migrations
git commit -m "chore(backend): generate migration for challengeWords tables"
```

---

## Task 3: Backend — teacher-facing word CRUD and bulk import

**Files:**
- Create: `apps/backend/src/challenges/challenge-words.service.ts`
- Create: `apps/backend/src/challenges/challenge-words.controller.ts`
- Create: `apps/backend/src/challenges/challenge-words.service.spec.ts`
- Modify: `apps/backend/src/challenges/challenges.module.ts` (register new service/controller)

**Interfaces:**
- Consumes: `db` from `../db`, `challenges`, `challengeWords` tables from Task 1.
- Produces (used by Task 4 and frontend):
  - `ChallengeWordsService.list(challengeId: string, adminId: string): Promise<ChallengeWord[]>`
  - `ChallengeWordsService.addWord(challengeId: string, adminId: string, data: { word: string; translation: string }): Promise<ChallengeWord>`
  - `ChallengeWordsService.bulkImport(challengeId: string, adminId: string, text: string): Promise<{ added: number; skipped: number }>`
  - `ChallengeWordsService.updateWord(wordId: string, adminId: string, data: Partial<{ word: string; translation: string }>): Promise<ChallengeWord>`
  - `ChallengeWordsService.removeWord(wordId: string, adminId: string): Promise<void>`

- [ ] **Step 1: Write the failing service tests**

```typescript
// apps/backend/src/challenges/challenge-words.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { ChallengeWordsService } from './challenge-words.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      challenges: { findFirst: jest.fn() },
      challengeWords: { findFirst: jest.fn(), findMany: jest.fn() },
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

describe('ChallengeWordsService', () => {
  const service = new ChallengeWordsService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addWord', () => {
    it('adds a word to a challenge the admin owns', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', adminId: 'admin-1' });
      (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([]);
      mockInsertReturning({ id: 'word-1', challengeId: 'challenge-1', word: 'apple', translation: 'olma' });

      const result = await service.addWord('challenge-1', 'admin-1', { word: 'apple', translation: 'olma' });

      expect(result).toEqual(expect.objectContaining({ id: 'word-1', word: 'apple' }));
    });

    it('throws NotFoundException when the admin does not own the challenge', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.addWord('challenge-1', 'admin-1', { word: 'apple', translation: 'olma' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('bulkImport', () => {
    it('parses "word - translation" lines, skipping malformed ones, and reports counts', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', adminId: 'admin-1' });
      (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([]);
      const returning = jest.fn().mockResolvedValue([{ id: 'word-x' }]);
      const values = jest.fn(() => ({ returning }));
      (db.insert as jest.Mock).mockReturnValue({ values });

      const text = 'apple - olma\nbook - kitob\nthis line is broken\nchair - stul';
      const result = await service.bulkImport('challenge-1', 'admin-1', text);

      expect(result).toEqual({ added: 3, skipped: 1 });
    });

    it('throws NotFoundException when the admin does not own the challenge', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(service.bulkImport('challenge-1', 'admin-1', 'apple - olma')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeWord', () => {
    it('throws NotFoundException when the word does not belong to the admin', async () => {
      (db.query.challengeWords.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(service.removeWord('word-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest challenge-words.service.spec.ts`
Expected: FAIL — `Cannot find module './challenge-words.service'`.

- [ ] **Step 3: Implement `challenge-words.service.ts`**

```typescript
// apps/backend/src/challenges/challenge-words.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { challengeWords, challenges } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class ChallengeWordsService {
  private async assertChallengeOwnership(challengeId: string, adminId: string) {
    const challenge = await db.query.challenges.findFirst({ where: and(eq(challenges.id, challengeId), eq(challenges.adminId, adminId)) });
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  private async assertWordOwnership(wordId: string, adminId: string) {
    const word = await db.query.challengeWords.findFirst({
      where: eq(challengeWords.id, wordId),
      with: { challenge: true },
    });
    if (!word || word.challenge.adminId !== adminId) throw new NotFoundException('Word not found');
    return word;
  }

  async list(challengeId: string, adminId: string) {
    await this.assertChallengeOwnership(challengeId, adminId);
    return db.query.challengeWords.findMany({
      where: eq(challengeWords.challengeId, challengeId),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
  }

  async addWord(challengeId: string, adminId: string, data: { word: string; translation: string }) {
    await this.assertChallengeOwnership(challengeId, adminId);
    const existing = await db.query.challengeWords.findMany({ where: eq(challengeWords.challengeId, challengeId) });
    const [word] = await db.insert(challengeWords).values({
      challengeId,
      word: data.word,
      translation: data.translation,
      orderIndex: existing.length,
    }).returning();
    return word;
  }

  async bulkImport(challengeId: string, adminId: string, text: string) {
    await this.assertChallengeOwnership(challengeId, adminId);
    const existing = await db.query.challengeWords.findMany({ where: eq(challengeWords.challengeId, challengeId) });
    let orderIndex = existing.length;

    const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    let added = 0;
    let skipped = 0;

    for (const line of lines) {
      const separatorIndex = line.indexOf(' - ');
      if (separatorIndex === -1) {
        skipped++;
        continue;
      }
      const word = line.slice(0, separatorIndex).trim();
      const translation = line.slice(separatorIndex + 3).trim();
      if (!word || !translation) {
        skipped++;
        continue;
      }
      await db.insert(challengeWords).values({ challengeId, word, translation, orderIndex });
      orderIndex++;
      added++;
    }

    return { added, skipped };
  }

  async updateWord(wordId: string, adminId: string, data: Partial<{ word: string; translation: string }>) {
    await this.assertWordOwnership(wordId, adminId);
    const [word] = await db.update(challengeWords).set(data).where(eq(challengeWords.id, wordId)).returning();
    return word;
  }

  async removeWord(wordId: string, adminId: string) {
    await this.assertWordOwnership(wordId, adminId);
    await db.delete(challengeWords).where(eq(challengeWords.id, wordId));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest challenge-words.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `challenge-words.controller.ts`**

```typescript
// apps/backend/src/challenges/challenge-words.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ChallengeWordsService } from './challenge-words.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class AddWordDto {
  @IsString() @MinLength(1) word: string;
  @IsString() @MinLength(1) translation: string;
}

class UpdateWordDto {
  @IsOptional() @IsString() @MinLength(1) word?: string;
  @IsOptional() @IsString() @MinLength(1) translation?: string;
}

class BulkImportDto {
  @IsString() text: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('challenges/:id/words')
export class ChallengeWordsController {
  constructor(private challengeWordsService: ChallengeWordsService) {}

  @Get()
  list(@Param('id') id: string, @Req() req: any) {
    return this.challengeWordsService.list(id, req.admin.id);
  }

  @Post()
  addWord(@Param('id') id: string, @Req() req: any, @Body() dto: AddWordDto) {
    return this.challengeWordsService.addWord(id, req.admin.id, dto);
  }

  @Post('bulk')
  bulkImport(@Param('id') id: string, @Req() req: any, @Body() dto: BulkImportDto) {
    return this.challengeWordsService.bulkImport(id, req.admin.id, dto.text);
  }

  @Patch(':wordId')
  updateWord(@Param('wordId') wordId: string, @Req() req: any, @Body() dto: UpdateWordDto) {
    return this.challengeWordsService.updateWord(wordId, req.admin.id, dto);
  }

  @Delete(':wordId')
  @HttpCode(204)
  removeWord(@Param('wordId') wordId: string, @Req() req: any) {
    return this.challengeWordsService.removeWord(wordId, req.admin.id);
  }
}
```

- [ ] **Step 6: Register in `challenges.module.ts`**

```typescript
// apps/backend/src/challenges/challenges.module.ts
import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { StudentChallengesController } from './student-challenges.controller';
import { ChallengesService } from './challenges.service';
import { StudentChallengesService } from './student-challenges.service';
import { ChallengeWordsController } from './challenge-words.controller';
import { ChallengeWordsService } from './challenge-words.service';
import { StudentChallengeWordsController } from './student-challenge-words.controller';
import { StudentChallengeWordsService } from './student-challenge-words.service';

@Module({
  controllers: [ChallengesController, StudentChallengesController, ChallengeWordsController, StudentChallengeWordsController],
  providers: [ChallengesService, StudentChallengesService, ChallengeWordsService, StudentChallengeWordsService],
})
export class ChallengesModule {}
```

Note: `StudentChallengeWordsController`/`StudentChallengeWordsService` are created in Task 4 — this file references them now so Task 4 only needs to add the two files without touching the module again. The module (and backend app) will not compile until Task 4 lands; that's expected since these two tasks are sequential.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/challenges/challenge-words.service.ts apps/backend/src/challenges/challenge-words.controller.ts apps/backend/src/challenges/challenge-words.service.spec.ts apps/backend/src/challenges/challenges.module.ts
git commit -m "feat(backend): add teacher-facing challenge word CRUD and bulk import"
```

---

## Task 4: Backend — student-facing word progress and leaderboard

**Files:**
- Create: `apps/backend/src/challenges/student-challenge-words.service.ts`
- Create: `apps/backend/src/challenges/student-challenge-words.controller.ts`
- Create: `apps/backend/src/challenges/student-challenge-words.service.spec.ts`

**Interfaces:**
- Consumes: `db`, `challengeWords`, `challengeWordProgress` tables from Task 1; `groups`/`groupEnrollments`/`challengeParticipants` from `../db/schema` (existing) — mirrors the enrollment-gating pattern already in `student-challenges.service.ts`.
- Produces (used by Task 6 frontend):
  - `StudentChallengeWordsService.listWords(challengeId: string, studentId: string): Promise<{ id: string; word: string; translation: string; known: boolean }[]>`
  - `StudentChallengeWordsService.setProgress(challengeId: string, wordId: string, studentId: string, known: boolean): Promise<{ wordId: string; known: boolean }>`
  - `StudentChallengeWordsService.leaderboard(challengeId: string, studentId: string): Promise<{ entries: { studentId: string; studentName: string; studentAvatarUrl: string | null; value: number; rank: number; isCurrentStudent: boolean }[] }>`

- [ ] **Step 1: Write the failing service tests**

```typescript
// apps/backend/src/challenges/student-challenge-words.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { StudentChallengeWordsService } from './student-challenge-words.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      challenges: { findFirst: jest.fn() },
      groups: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      challengeParticipants: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeWords: { findMany: jest.fn() },
      challengeWordProgress: { findMany: jest.fn() },
    },
    insert: jest.fn(),
  };
  return { db: mockDb };
});

function mockInsertReturning(value: unknown) {
  const returning = jest.fn().mockResolvedValue([value]);
  const onConflictDoUpdate = jest.fn(() => ({ returning }));
  const values = jest.fn(() => ({ returning, onConflictDoUpdate }));
  (db.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

describe('StudentChallengeWordsService', () => {
  const service = new StudentChallengeWordsService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listWords', () => {
    it('throws NotFoundException when the student is not enrolled in the challenge course', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.listWords('challenge-1', 'student-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns words with the participant\'s known state', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      ]);
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' });
      (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([
        { id: 'word-1', word: 'apple', translation: 'olma' },
        { id: 'word-2', word: 'book', translation: 'kitob' },
      ]);
      (db.query.challengeWordProgress.findMany as jest.Mock).mockResolvedValue([
        { challengeWordId: 'word-1', known: true },
      ]);

      const result = await service.listWords('challenge-1', 'student-1');

      expect(result).toEqual([
        { id: 'word-1', word: 'apple', translation: 'olma', known: true },
        { id: 'word-2', word: 'book', translation: 'kitob', known: false },
      ]);
    });
  });

  describe('setProgress', () => {
    it('writes known state immediately for an enrolled, joined student', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      ]);
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' });
      mockInsertReturning({ challengeWordId: 'word-1', known: true });

      const result = await service.setProgress('challenge-1', 'word-1', 'student-1', true);

      expect(result).toEqual(expect.objectContaining({ wordId: 'word-1', known: true }));
    });

    it('throws NotFoundException when the student has not joined the challenge', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      ]);
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(service.setProgress('challenge-1', 'word-1', 'student-1', true)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('leaderboard', () => {
    it('ranks participants by count of known words', async () => {
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
      (db.query.challengeWordProgress.findMany as jest.Mock).mockResolvedValue([
        { challengeParticipantId: 'participant-1', known: true },
        { challengeParticipantId: 'participant-1', known: true },
        { challengeParticipantId: 'participant-2', known: true },
        { challengeParticipantId: 'participant-2', known: false },
      ]);

      const result = await service.leaderboard('challenge-1', 'student-1');

      expect(result.entries[0]).toEqual(expect.objectContaining({ studentId: 'student-1', value: 2, rank: 1, isCurrentStudent: true }));
      expect(result.entries[1]).toEqual(expect.objectContaining({ studentId: 'student-2', value: 1, rank: 2, isCurrentStudent: false }));
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest student-challenge-words.service.spec.ts`
Expected: FAIL — `Cannot find module './student-challenge-words.service'`.

- [ ] **Step 3: Implement `student-challenge-words.service.ts`**

```typescript
// apps/backend/src/challenges/student-challenge-words.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import {
  challengeParticipants, challengeWordProgress, challengeWords, challenges, groupEnrollments, groups,
} from '../db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class StudentChallengeWordsService {
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

  private async requireParticipant(challengeId: string, studentId: string) {
    const participant = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (!participant) throw new NotFoundException('Siz bu challenge-ga qo\'shilmagansiz');
    return participant;
  }

  async listWords(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.requireParticipant(challengeId, studentId);

    const words = await db.query.challengeWords.findMany({
      where: eq(challengeWords.challengeId, challengeId),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
    const progressRows = await db.query.challengeWordProgress.findMany({
      where: eq(challengeWordProgress.challengeParticipantId, participant.id),
    });
    const knownByWordId = new Map(progressRows.map((p) => [p.challengeWordId, p.known]));

    return words.map((w) => ({
      id: w.id,
      word: w.word,
      translation: w.translation,
      known: knownByWordId.get(w.id) ?? false,
    }));
  }

  async setProgress(challengeId: string, wordId: string, studentId: string, known: boolean) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.requireParticipant(challengeId, studentId);

    const [row] = await db.insert(challengeWordProgress).values({
      challengeParticipantId: participant.id,
      challengeWordId: wordId,
      known,
    }).onConflictDoUpdate({
      target: [challengeWordProgress.challengeParticipantId, challengeWordProgress.challengeWordId],
      set: { known, updatedAt: new Date() },
    }).returning();

    return { wordId: row.challengeWordId, known: row.known };
  }

  async leaderboard(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);

    const participants = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.challengeId, challengeId),
      with: { student: true },
    });
    if (participants.length === 0) return { entries: [] };

    const participantIds = participants.map((p) => p.id);
    const progressRows = await db.query.challengeWordProgress.findMany({
      where: inArray(challengeWordProgress.challengeParticipantId, participantIds),
    });

    const knownCountByParticipant = new Map<string, number>();
    for (const row of progressRows) {
      if (!row.known) continue;
      knownCountByParticipant.set(row.challengeParticipantId, (knownCountByParticipant.get(row.challengeParticipantId) ?? 0) + 1);
    }

    const scored = participants.map((participant) => ({
      studentId: participant.studentId,
      studentName: participant.student.displayName,
      studentAvatarUrl: participant.student.displayAvatarUrl,
      value: knownCountByParticipant.get(participant.id) ?? 0,
      isCurrentStudent: participant.studentId === studentId,
    }));

    return {
      entries: scored
        .sort((a, b) => b.value - a.value || a.studentName.localeCompare(b.studentName, 'uz'))
        .map((entry, index) => ({ ...entry, rank: index + 1 })),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest student-challenge-words.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement `student-challenge-words.controller.ts`**

```typescript
// apps/backend/src/challenges/student-challenge-words.controller.ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { StudentChallengeWordsService } from './student-challenge-words.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class SetProgressDto {
  @IsBoolean() known: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/challenges/:id/words')
export class StudentChallengeWordsController {
  constructor(private studentChallengeWordsService: StudentChallengeWordsService) {}

  @Get()
  listWords(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengeWordsService.listWords(id, req.user.id);
  }

  @Post(':wordId/progress')
  setProgress(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any, @Body() dto: SetProgressDto) {
    return this.studentChallengeWordsService.setProgress(id, wordId, req.user.id, dto.known);
  }

  @Get('leaderboard')
  leaderboard(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengeWordsService.leaderboard(id, req.user.id);
  }
}
```

Note the route order: `@Get('leaderboard')` must be registered — NestJS matches routes in declaration order within a controller, and `leaderboard` here is a static segment on a *different* controller path (`me/challenges/:id/words/leaderboard`) than `:wordId/progress` (`me/challenges/:id/words/:wordId/progress`), so there's no ambiguity between them; both can be declared in either order safely.

- [ ] **Step 6: Run the full challenges test suite**

Run: `cd apps/backend && npx jest challenges`
Expected: PASS (all tests across every spec file in `apps/backend/src/challenges/`).

- [ ] **Step 7: Verify TypeScript compiles for the whole backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors — this confirms `challenges.module.ts`'s forward references from Task 3 now resolve.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/challenges/student-challenge-words.service.ts apps/backend/src/challenges/student-challenge-words.controller.ts apps/backend/src/challenges/student-challenge-words.service.spec.ts
git commit -m "feat(backend): add student-facing word progress and leaderboard endpoints"
```

---

## Task 5: Frontend web — word memorization API client and teacher management UI

**Files:**
- Create: `apps/frontend/src/api/challenge-words.ts`
- Create: `apps/frontend/src/components/course/CourseChallengeWordsPanel.tsx`
- Modify: `apps/frontend/src/components/course/CourseChallengesPage.tsx` (branch on `type`, add type select to create modal)

**Interfaces:**
- Consumes: `client` from `./client` (existing axios instance).
- Produces: `ApiChallengeWord`, `ApiStudentChallengeWord`, `ApiChallengeWordLeaderboardEntry` types and `apiListChallengeWords`, `apiAddChallengeWord`, `apiBulkImportChallengeWords`, `apiUpdateChallengeWord`, `apiDeleteChallengeWord` (teacher) functions in `api/challenge-words.ts`, consumed by this task's UI and Task 6's student UI.

- [ ] **Step 1: Implement `api/challenge-words.ts`**

```typescript
// apps/frontend/src/api/challenge-words.ts
import client from './client';

export interface ApiChallengeWord {
  id: string;
  challengeId: string;
  word: string;
  translation: string;
  orderIndex: number;
}

export async function apiListChallengeWords(challengeId: string): Promise<ApiChallengeWord[]> {
  const res = await client.get(`/challenges/${challengeId}/words`);
  return res.data;
}

export async function apiAddChallengeWord(
  challengeId: string,
  data: { word: string; translation: string },
): Promise<ApiChallengeWord> {
  const res = await client.post(`/challenges/${challengeId}/words`, data);
  return res.data;
}

export async function apiBulkImportChallengeWords(
  challengeId: string,
  text: string,
): Promise<{ added: number; skipped: number }> {
  const res = await client.post(`/challenges/${challengeId}/words/bulk`, { text });
  return res.data;
}

export async function apiUpdateChallengeWord(
  wordId: string,
  data: Partial<{ word: string; translation: string }>,
): Promise<ApiChallengeWord> {
  const res = await client.patch(`/challenges/words/${wordId}`, data);
  return res.data;
}

export async function apiDeleteChallengeWord(wordId: string): Promise<void> {
  await client.delete(`/challenges/words/${wordId}`);
}

export interface ApiStudentChallengeWord {
  id: string;
  word: string;
  translation: string;
  known: boolean;
}

export async function apiListMyChallengeWords(challengeId: string): Promise<ApiStudentChallengeWord[]> {
  const res = await client.get(`/me/challenges/${challengeId}/words`);
  return res.data;
}

export async function apiSetChallengeWordProgress(
  challengeId: string,
  wordId: string,
  known: boolean,
): Promise<{ wordId: string; known: boolean }> {
  const res = await client.post(`/me/challenges/${challengeId}/words/${wordId}/progress`, { known });
  return res.data;
}

export interface ApiChallengeWordLeaderboardEntry {
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
  value: number;
  rank: number;
  isCurrentStudent: boolean;
}

export async function apiGetMyChallengeWordLeaderboard(
  challengeId: string,
): Promise<{ entries: ApiChallengeWordLeaderboardEntry[] }> {
  const res = await client.get(`/me/challenges/${challengeId}/words/leaderboard`);
  return res.data;
}
```

**Note:** `apps/frontend/src/api/challenges.ts` already has route paths under `/challenges/:id` and `/challenges/books/:bookId` — this file's `/challenges/words/:wordId` mirrors that convention exactly (word ID as the sole path segment after the resource type, matching `challenges.controller.ts` from Task 3 which registers `challenges/:id/words` and `challenges/words/:wordId`... **actually check**: Task 3's controller is `@Controller('challenges/:id/words')` with `@Patch(':wordId')`/`@Delete(':wordId')`, which resolves to `PATCH/DELETE challenges/:id/words/:wordId`, NOT `challenges/words/:wordId`. Fix the two functions above to match:

```typescript
export async function apiUpdateChallengeWord(
  challengeId: string,
  wordId: string,
  data: Partial<{ word: string; translation: string }>,
): Promise<ApiChallengeWord> {
  const res = await client.patch(`/challenges/${challengeId}/words/${wordId}`, data);
  return res.data;
}

export async function apiDeleteChallengeWord(challengeId: string, wordId: string): Promise<void> {
  await client.delete(`/challenges/${challengeId}/words/${wordId}`);
}
```

Use these corrected signatures (with `challengeId` as the first parameter) instead of the ones in the code block above — update the call sites in Step 3 accordingly.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors (this file has no consumers yet, so it compiles in isolation).

- [ ] **Step 3: Implement `CourseChallengeWordsPanel.tsx`**

First read `apps/frontend/src/components/course/CourseChallengesPage.tsx`'s existing `BooksPanel` function (in the same file) to match its visual conventions (rounded-2xl white cards, gray-50 inner rows) exactly.

```tsx
// apps/frontend/src/components/course/CourseChallengeWordsPanel.tsx
import { useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiListChallengeWords, apiAddChallengeWord, apiBulkImportChallengeWords,
  apiDeleteChallengeWord, type ApiChallengeWord,
} from '../../api/challenge-words';

export function CourseChallengeWordsPanel({ challengeId }: { challengeId: string }) {
  const [words, setWords] = useState<ApiChallengeWord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    const list = await apiListChallengeWords(challengeId);
    setWords(list);
    setLoaded(true);
  }

  if (!loaded) {
    void load();
    return <div className="rounded-2xl bg-white p-5 text-sm text-gray-400">Yuklanmoqda...</div>;
  }

  async function handleAdd() {
    if (!newWord.trim() || !newTranslation.trim()) return;
    try {
      const word = await apiAddChallengeWord(challengeId, { word: newWord.trim(), translation: newTranslation.trim() });
      setWords((prev) => [...prev, word]);
      setNewWord('');
      setNewTranslation('');
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "So'z qo'shib bo'lmadi");
    }
  }

  async function handleDelete(wordId: string) {
    try {
      await apiDeleteChallengeWord(challengeId, wordId);
      setWords((prev) => prev.filter((w) => w.id !== wordId));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "So'zni o'chirib bo'lmadi");
    }
  }

  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-800">So'zlar</h3>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200"
        >
          <Upload size={14} /> Ommaviy import
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="So'z" className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder="Tarjima" className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
        <button
          type="button"
          disabled={!newWord.trim() || !newTranslation.trim()}
          onClick={() => void handleAdd()}
          className="shrink-0 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
        >
          Qo'shish
        </button>
      </div>

      {words.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-300">Hali so'z yo'q</p>
      ) : (
        <div className="flex flex-col gap-2">
          {words.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5">
              <span className="text-sm font-semibold text-gray-800">{w.word}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-500">{w.translation}</span>
              <button type="button" onClick={() => void handleDelete(w.id)} className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {importOpen && (
        <BulkImportModal
          challengeId={challengeId}
          onImported={(added) => {
            void load();
            toast.success(`${added} ta so'z qo'shildi`);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function BulkImportModal({
  challengeId, onImported, onClose,
}: {
  challengeId: string;
  onImported: (added: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    if (!text.trim()) return;
    setImporting(true);
    try {
      const { added, skipped } = await apiBulkImportChallengeWords(challengeId, text);
      onImported(added);
      if (skipped > 0) toast.error(`${skipped} qator noto'g'ri formatda, o'tkazib yuborildi`);
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Import qilib bo'lmadi");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-base font-bold text-gray-800">Ommaviy import</h3>
        <p className="mb-4 text-xs text-gray-400">Har qatorda: <code>so'z - tarjima</code></p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'apple - olma\nbook - kitob'}
          className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!text.trim() || importing}
            onClick={() => void handleImport()}
            className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
          >
            Import qilish
          </button>
          <button type="button" onClick={onClose} className="rounded-2xl bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-600">
            Bekor
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `type` branching into `CourseChallengesPage.tsx`**

In `apps/frontend/src/components/course/CourseChallengesPage.tsx`:

1. Add the import: `import { CourseChallengeWordsPanel } from './CourseChallengeWordsPanel';`
2. In the detail view (the block starting `if (selectedId && detail && detail.id === selectedId) {`), replace the single `<BooksPanel ... />` call with a conditional:

```tsx
{detail.type === 'soz_yodlash' ? (
  <CourseChallengeWordsPanel challengeId={detail.id} />
) : (
  <BooksPanel
    books={detail.books}
    allTests={allTests}
    onAddBook={(title, totalPages) => void addBook(detail.id, { title, totalPages })}
    onUpdateBook={(bookId, data) => void updateBook(detail.id, bookId, data)}
    onDeleteBook={(bookId) => void deleteBook(detail.id, bookId)}
    onSetTest={(bookId, data) => void setBookTest(detail.id, bookId, data)}
    onRemoveTest={(bookId) => void removeBookTest(detail.id, bookId)}
  />
)}
```

3. In the `CreateChallengeModal` function, replace the disabled single-option `<select>` with a real, controlled select offering both types:

```tsx
// Replace the existing disabled select block:
<label className="mb-1.5 block text-sm text-gray-500">Turi</label>
<select value={type} onChange={(e) => setType(e.target.value)} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none">
  <option value="kitobxonlik">Kitobxonlik</option>
  <option value="soz_yodlash">So'z yodlash</option>
</select>
```

Add `const [type, setType] = useState('kitobxonlik');` near the modal's other `useState` calls, and update the `onCreate` prop signature/call at the bottom of the modal (`onClick={() => onCreate(name.trim(), description.trim(), imageUrl)}`) to also pass `type`: `onClick={() => onCreate(name.trim(), description.trim(), imageUrl, type)}`. Update `CreateChallengeModalProps`'s `onCreate` signature to `(name: string, description: string, imageUrl: string, type: string) => void`, and update `handleCreate` in the parent component to pass `type` through to `createChallenge(courseId, { name, description, imageUrl, type })`.

4. `ApiChallengeDetail` (from `api/challenges.ts`) already has a `type: string` field (inherited from `ApiChallenge`) — no type changes needed there.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev`
As a teacher: create a challenge with type "So'z yodlash", confirm the words panel (not books panel) renders. Add a word manually, confirm it appears. Use bulk import with a mix of valid and malformed lines, confirm the correct added/skipped counts and toast messages. Delete a word, confirm it's removed.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/api/challenge-words.ts apps/frontend/src/components/course/CourseChallengeWordsPanel.tsx apps/frontend/src/components/course/CourseChallengesPage.tsx
git commit -m "feat(frontend): add teacher word management UI for soz_yodlash challenges"
```

---

## Task 6: Frontend web — student word practice (Flashcard and Test modes)

**Files:**
- Create: `apps/frontend/src/pages/ChallengeWordPracticePage.tsx`
- Modify: `apps/frontend/src/pages/ChallengeDetailPage.tsx` (branch on `type`, add "Mashq qilish" entry point)
- Modify: `apps/frontend/src/App.tsx` (add `/challenges/:id/practice` route)

**Interfaces:**
- Consumes: `apiListMyChallengeWords`, `apiSetChallengeWordProgress`, `apiGetMyChallengeWordLeaderboard`, `ApiStudentChallengeWord` from Task 5's `api/challenge-words.ts`.
- Produces: fully working student flashcard/test practice flow.

- [ ] **Step 1: Add `type` branching to `ChallengeDetailPage.tsx`**

`ApiMyChallengeDetail` (in `api/challenges.ts`) currently has no `type` field. First add it:

```typescript
// In apps/frontend/src/api/challenges.ts, add `type: string;` to ApiMyChallengeDetail:
export interface ApiMyChallengeDetail {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  type: string;
  books: ApiMyChallengeBook[];
}
```

This requires the backend `StudentChallengesService.findOneForStudent` (in `apps/backend/src/challenges/student-challenges.service.ts`) to include `type` in its return object — check the method's final `return { id: challenge.id, name: challenge.name, description: challenge.description, imageUrl: challenge.imageUrl, books: results };` line and add `type: challenge.type,` to it. This is a one-line backend change bundled into this frontend task since it only affects a field already flowing through an existing, tested endpoint (no new test needed — the existing `findOneForStudent`/`GET /me/challenges/:id` tests in `student-challenges.service.spec.ts` don't assert on the full shape, so this addition is covered by TypeScript compilation, not a new unit test).

In `apps/frontend/src/pages/ChallengeDetailPage.tsx`, wrap the `tab === 'books'` branch so it only renders for `detail.type !== 'soz_yodlash'`, and add a `soz_yodlash` branch:

```tsx
// Replace `{tab === "books" ? (` ... down to its closing `) : (` (the leaderboard branch) with:
{tab === "books" ? (
  detail.type === 'soz_yodlash' ? (
    <div className="student-course-card challenge-detail-card rounded-3xl p-5 text-center">
      <p className="mb-4 text-sm text-gray-500">So'zlarni mashq qilish</p>
      <button
        type="button"
        onClick={() => navigate(`/challenges/${id}/practice`)}
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white"
      >
        Mashq qilish
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {/* ...existing book-mapping JSX unchanged... */}
    </div>
  )
) : (
  /* ...existing leaderboard branch unchanged... */
)}
```

Also change the tab label from `"Kitoblar"` to be conditional: find the `<button type="button" onClick={() => setTab("books")} ...>Kitoblar</button>` and change its text to `{detail.type === 'soz_yodlash' ? "So'zlar" : "Kitoblar"}`.

- [ ] **Step 2: Add the leaderboard branch for `soz_yodlash`**

The existing leaderboard branch (metric tabs + entries list) assumes `apiGetMyChallengeLeaderboard(id, metric)` with 4 metrics. For `soz_yodlash`, swap in the single-metric endpoint. Find the `useEffect` that loads leaderboard entries:

```tsx
// Replace this existing effect:
useEffect(() => {
  if (id && tab === "leaderboard")
    void apiGetMyChallengeLeaderboard(id, metric).then((r) =>
      setEntries(r.entries),
    );
}, [id, tab, metric]);

// With a type-aware version:
useEffect(() => {
  if (!id || tab !== "leaderboard") return;
  if (detail?.type === 'soz_yodlash') {
    void apiGetMyChallengeWordLeaderboard(id).then((r) => setEntries(r.entries));
  } else {
    void apiGetMyChallengeLeaderboard(id, metric).then((r) => setEntries(r.entries));
  }
}, [id, tab, metric, detail?.type]);
```

Add the import: `import { apiGetMyChallengeWordLeaderboard } from '../api/challenge-words';`

Also hide the metric-tab row for `soz_yodlash` (single metric, no selector per the design spec): wrap the `<div className="mb-4 flex gap-2 overflow-x-auto">{METRICS.map(...)}</div>` block in `{detail.type !== 'soz_yodlash' && ( ... )}`.

- [ ] **Step 3: Implement `ChallengeWordPracticePage.tsx`**

This page has three states: mode/direction selection, Flashcard practice, Test practice.

```tsx
// apps/frontend/src/pages/ChallengeWordPracticePage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StudentShell } from '../components/student/StudentShell';
import {
  apiListMyChallengeWords, apiSetChallengeWordProgress, type ApiStudentChallengeWord,
} from '../api/challenge-words';

type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';

export function ChallengeWordPracticePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [words, setWords] = useState<ApiStudentChallengeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);

  useEffect(() => {
    if (id) void apiListMyChallengeWords(id).then(setWords);
  }, [id]);

  if (!id) return null;

  function backToDetail() {
    navigate(`/challenges/${id}`);
  }

  if (!words) {
    return <StudentShell><p className="p-6 text-sm text-gray-400">Yuklanmoqda...</p></StudentShell>;
  }

  if (!mode || !direction) {
    return (
      <StudentShell>
        <div className="bg-white px-4 py-5 lg:rounded-2xl lg:p-5">
          <button type="button" onClick={backToDetail} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-gray-500">
            <ArrowLeft size={16} /> Orqaga
          </button>
          <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Mashq turi</h1>
          <p className="mb-6 text-sm text-gray-400">Rejim va yo'nalishni tanlang</p>

          <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Rejim</p>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setMode('flashcard')} className={`rounded-2xl p-4 text-left ${mode === 'flashcard' ? 'bg-gray-900 text-white' : 'student-course-card'}`}>
              <p className="text-sm font-bold">Flashcard</p>
              <p className="mt-1 text-xs opacity-70">Kartani suring</p>
            </button>
            <button type="button" onClick={() => setMode('test')} className={`rounded-2xl p-4 text-left ${mode === 'test' ? 'bg-gray-900 text-white' : 'student-course-card'}`}>
              <p className="text-sm font-bold">Test</p>
              <p className="mt-1 text-xs opacity-70">4 variantli savol</p>
            </button>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Yo'nalish</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setDirection('wordToTranslation')} className={`rounded-2xl p-4 text-left ${direction === 'wordToTranslation' ? 'bg-gray-900 text-white' : 'student-course-card'}`}>
              <p className="text-sm font-bold">So'z → Tarjima</p>
            </button>
            <button type="button" onClick={() => setDirection('translationToWord')} className={`rounded-2xl p-4 text-left ${direction === 'translationToWord' ? 'bg-gray-900 text-white' : 'student-course-card'}`}>
              <p className="text-sm font-bold">Tarjima → So'z</p>
            </button>
          </div>

          <button
            type="button"
            disabled={!mode || !direction}
            onClick={() => { /* both are already set via state above; this button is unreachable while either is null per the render guard, kept for clarity */ }}
            className="mt-6 hidden"
          />
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell>
      <div className="bg-white px-4 py-5 lg:rounded-2xl lg:p-5">
        <button type="button" onClick={() => { setMode(null); setDirection(null); }} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500">
          <ArrowLeft size={16} /> Orqaga
        </button>
        {mode === 'flashcard' ? (
          <FlashcardPractice challengeId={id} words={words} direction={direction} onWordsChange={setWords} />
        ) : (
          <TestPractice challengeId={id} words={words} direction={direction} onWordsChange={setWords} />
        )}
      </div>
    </StudentShell>
  );
}
```

Note: the mode/direction picker's "hidden" dummy button above is dead — replace it by making the two selection grids automatically advance once both `mode` and `direction` are set (the component already re-renders into the practice view once both are non-null, since the top-level `if (!mode || !direction)` guard controls which branch renders). Remove that unreachable `<button>` block entirely — it serves no purpose since setting `direction` (the last of the two choices, in either order) already flips the render branch. Delete lines from `<button` through the closing `/>` before `</div>\n      </StudentShell>\n    );\n  }`.

- [ ] **Step 4: Implement the Flashcard practice component**

Append to the same file (`ChallengeWordPracticePage.tsx`):

```tsx
function FlashcardPractice({
  challengeId, words, direction, onWordsChange,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  onWordsChange: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [deck, setDeck] = useState(() => words.map((w) => ({ ...w, uid: w.id })));
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useMemo(() => ({ current: 0 }), []);

  const knownCount = words.filter((w) => w.known).length;
  const current = deck[0];

  async function commitSwipe(known: boolean) {
    if (!current) return;
    setRevealed(false);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
    } catch {
      // best-effort: local state still advances even if the write fails, matching
      // the spec's "no batching, immediate write" intent without blocking the UI
    }
    onWordsChange(words.map((w) => (w.id === current.id ? { ...w, known } : w)));
    setDeck((prev) => {
      const [head, ...rest] = prev;
      return known ? rest : [...rest, head];
    });
    setDragX(0);
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    setDragging(true);
    startXRef.current = 'touches' in e ? e.touches[0].clientX : e.clientX;
  }
  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!dragging) return;
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragX(x - startXRef.current);
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > 35) {
      void commitSwipe(dragX > 0);
    } else {
      setDragX(0);
    }
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-lg font-bold text-gray-900">🎉 Tugadi!</p>
        <p className="mt-1 text-sm text-gray-400">Barcha so'zlar "bilaman" holatida</p>
      </div>
    );
  }

  const front = direction === 'wordToTranslation' ? current.word : current.translation;
  const back = direction === 'wordToTranslation' ? current.translation : current.word;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex w-full max-w-[320px] justify-between text-xs text-gray-400">
        <span>Umumiy: {words.length}</span>
        <span>Qolgan: {deck.length}</span>
        <span>Bilaman: {knownCount}</span>
      </div>

      <div className="relative mb-6 h-[260px] w-full max-w-[320px]">
        {deck.slice(1, 4).map((w, i) => (
          <div
            key={w.uid}
            className="student-course-card absolute inset-0 rounded-3xl"
            style={{ transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 8}px)`, zIndex: 10 - i }}
          />
        ))}
        <div
          className="student-course-card challenge-detail-card absolute inset-0 flex cursor-grab flex-col items-center justify-center rounded-3xl p-6"
          style={{ transform: `translateX(${dragX}px) rotate(${dragX / 14}deg)`, transition: dragging ? 'none' : 'transform 0.3s ease', zIndex: 20 }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={() => dragging && onPointerUp()}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
          onClick={() => Math.abs(dragX) < 5 && setRevealed((r) => !r)}
        >
          <p className="text-2xl font-extrabold text-gray-900">{front}</p>
          {revealed ? (
            <p className="mt-4 text-lg text-gray-500">{back}</p>
          ) : (
            <p className="mt-4 text-[10px] tracking-wide text-gray-300">JAVOBNI KO'RSATISH</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the Test practice component**

Append to the same file:

```tsx
function pickWrongOptions(words: ApiStudentChallengeWord[], correctId: string, direction: Direction, count: number): string[] {
  const pool = words.filter((w) => w.id !== correctId).map((w) => (direction === 'wordToTranslation' ? w.translation : w.word));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function TestPractice({
  challengeId, words, direction, onWordsChange,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  onWordsChange: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [queue] = useState(() => [...words].sort(() => Math.random() - 0.5));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const current = queue[index];
  const options = useMemo(() => {
    if (!current) return [];
    const correctAnswer = direction === 'wordToTranslation' ? current.translation : current.word;
    const wrongCount = Math.min(3, words.length - 1);
    const wrongs = pickWrongOptions(words, current.id, direction, wrongCount);
    return [correctAnswer, ...wrongs].sort(() => Math.random() - 0.5);
  }, [current, words, direction]);

  if (!current) {
    return (
      <div className="flex flex-col items-center py-16">
        <p className="text-lg font-bold text-gray-900">Natija: {correctCount}/{queue.length} to'g'ri</p>
      </div>
    );
  }

  const question = direction === 'wordToTranslation' ? current.word : current.translation;
  const correctAnswer = direction === 'wordToTranslation' ? current.translation : current.word;

  async function handleSelect(option: string) {
    if (selected) return;
    setSelected(option);
    const known = option === correctAnswer;
    if (known) setCorrectCount((c) => c + 1);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
    } catch {
      // best-effort — same rationale as FlashcardPractice's commitSwipe
    }
    onWordsChange(words.map((w) => (w.id === current.id ? { ...w, known } : w)));
    setTimeout(() => {
      setSelected(null);
      setIndex((i) => i + 1);
    }, 700);
  }

  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-xs text-gray-400">{index + 1} / {queue.length}</p>
      <p className="mb-6 text-2xl font-extrabold text-gray-900">{question}</p>
      <div className="grid w-full max-w-[400px] grid-cols-1 gap-2.5">
        {options.map((option) => {
          const isCorrect = option === correctAnswer;
          const isSelected = option === selected;
          let colorClass = 'student-course-card';
          if (selected) {
            if (isCorrect) colorClass = 'bg-green-100 text-green-700';
            else if (isSelected) colorClass = 'bg-red-100 text-red-700';
          }
          return (
            <button
              key={option}
              type="button"
              disabled={!!selected}
              onClick={() => void handleSelect(option)}
              className={`rounded-2xl p-4 text-left text-sm font-semibold ${colorClass}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Register the route in `App.tsx`**

Add `{ path: '/challenges/:id/practice', element: <ChallengeWordPracticePage /> },` next to the existing `/challenges/:id` route, and import `ChallengeWordPracticePage`.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manually verify in the browser**

Run: `cd apps/frontend && npm run dev`
As a student in a `soz_yodlash` challenge: open the challenge, confirm "So'zlar" tab shows a "Mashq qilish" button instead of a book list. Click it, pick Flashcard + So'z→Tarjima, confirm swiping right marks a word known (card flies off, disappears from the remaining count) and swiping left keeps it in rotation (card returns to the back of the stack). Click the card to reveal the translation. Go back, pick Test mode, confirm 4 options appear, selecting the correct one highlights green and auto-advances, selecting wrong highlights both red (selected) and green (correct) then advances. Confirm the leaderboard tab (single metric, no metric selector) shows students ranked by known-word count.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/ChallengeWordPracticePage.tsx apps/frontend/src/pages/ChallengeDetailPage.tsx apps/frontend/src/App.tsx apps/backend/src/challenges/student-challenges.service.ts apps/frontend/src/api/challenges.ts
git commit -m "feat(frontend): add student Flashcard/Test practice flow for soz_yodlash challenges"
```

---

## Task 7: Mobile — challenges API client and types (both challenge kinds)

**Files:**
- Create: `apps/mobile/src/api/challenges.ts`
- Create: `apps/mobile/src/api/challenge-words.ts`
- Modify: `apps/mobile/src/types/api.ts` (add challenge + word types)

**Interfaces:**
- Consumes: `api` axios instance from `../lib/api` (confirmed export: `export const api = axios.create(...)`).
- Produces: `ApiStudentChallenge`, `ApiMyChallengeDetail`, `ApiMyChallengeBook`, `ApiChallengeEvent`, `ApiChallengeLeaderboardEntry`, `ApiStudentChallengeWord`, `ApiChallengeWordLeaderboardEntry` types in `types/api.ts`; API functions in `api/challenges.ts` and `api/challenge-words.ts`, consumed by Task 9/10/11's screens.

- [ ] **Step 1: Add types to `types/api.ts`**

Append near the existing `ApiMyCourseLeaderboard` block:

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
  type: string;
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

export type ApiStudentChallengeWord = {
  id: string;
  word: string;
  translation: string;
  known: boolean;
};

export type ApiChallengeWordLeaderboardEntry = ApiChallengeLeaderboardEntry;
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

- [ ] **Step 3: Implement `api/challenge-words.ts`**

```typescript
// apps/mobile/src/api/challenge-words.ts
import {api} from '../lib/api';
import type {ApiChallengeWordLeaderboardEntry, ApiStudentChallengeWord} from '../types/api';

export async function apiListMyChallengeWords(challengeId: string): Promise<ApiStudentChallengeWord[]> {
  const res = await api.get(`/me/challenges/${challengeId}/words`);
  return res.data;
}

export async function apiSetChallengeWordProgress(
  challengeId: string,
  wordId: string,
  known: boolean,
): Promise<{wordId: string; known: boolean}> {
  const res = await api.post(`/me/challenges/${challengeId}/words/${wordId}/progress`, {known});
  return res.data;
}

export async function apiGetMyChallengeWordLeaderboard(
  challengeId: string,
): Promise<{entries: ApiChallengeWordLeaderboardEntry[]}> {
  const res = await api.get(`/me/challenges/${challengeId}/words/leaderboard`);
  return res.data;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors in the three new/modified files (other pre-existing errors, if any, are out of scope for this task).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/api/challenges.ts apps/mobile/src/api/challenge-words.ts apps/mobile/src/types/api.ts
git commit -m "feat(mobile): add challenges and challenge-words API clients and types"
```

**Note:** `apps/mobile/` is repo-wide `.gitignore`d ("kept local and must not be pushed") — `git add`/`git commit` on these paths will silently no-op (nothing to commit). This is expected; the files exist on disk for later tasks in this plan to build on, but won't appear in `git log`. Still run the commit step for consistency with the rest of the plan and to catch the case where the ignore rule changes in the future.

---

## Task 8: Mobile — navigation restructure (Jamm hub tab, Live moved to stack)

**Files:**
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`
- Create: `apps/mobile/src/screens/ChallengesScreen.tsx` (hub screen; Task 9 fills in the "Challenge-lar" list view this hub switches to)

**Design note:** "Jonli musobaqalar" is reachable only from inside the "Jamm" tab's hub — do NOT add a header button to `HistoryScreen.tsx`; that screen is untouched by this plan.

**Interfaces:**
- Consumes: existing `LiveScreen`, `HistoryScreen` components.
- Produces: `TabParamList` with `Jamm` replacing `Live`; `RootStackParamList` with `Live: undefined` and `ChallengeDetail`/`ChallengeWordPractice` added (the latter two consumed by Task 9/10).

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
  ChallengeDetail: {challengeId: string; title: string};
  ChallengeWordPractice: {challengeId: string; title: string};
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

- [ ] **Step 2: Create the hub `ChallengesScreen.tsx`**

This is the final hub implementation (not a placeholder) — 3 cards matching the web `ChallengesHubPage` design. The "Challenge-lar" card switches this same screen to an inline list (Task 9 fills in `ChallengesListView`'s body — for now this task defines the hub shell and a temporary inline stub for the list so the file compiles standalone).

```tsx
// apps/mobile/src/screens/ChallengesScreen.tsx
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {BookOpen, Mic, Radio} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../navigation/types';
import {Screen} from '../components/Ui';
import {ChallengesListView} from './ChallengesListView';

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
      <View className="flex-1 gap-3 p-4">
        <Pressable
          onPress={() => setView('challenges')}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <BookOpen size={22} color="#334155" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Challenge-lar</Text>
            <Text className="text-xs text-gray-400">Kitobxonlik va so'z yodlash</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Live')}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-4 dark:bg-dark-surface">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
            <Radio size={22} color="#334155" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-ink dark:text-dark-ink">Jonli Musobaqalar</Text>
            <Text className="text-xs text-gray-400">Real vaqtda musobaqa</Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-3 rounded-2xl bg-white p-4 opacity-50 dark:bg-dark-surface">
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
```

- [ ] **Step 3: Create a minimal placeholder `ChallengesListView.tsx`**

Task 9 replaces this file's body with the real challenge list. This task only needs it to exist so `ChallengesScreen.tsx` compiles.

```tsx
// apps/mobile/src/screens/ChallengesListView.tsx
import React from 'react';
import {Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import {Screen} from '../components/Ui';

export function ChallengesListView({
  onBack,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  onBack: () => void;
}) {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center p-6">
        <Text onPress={onBack} className="text-ink dark:text-dark-ink">Challenge-lar (placeholder)</Text>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Update `RootNavigator.tsx`**

Read the current file first (`apps/mobile/src/navigation/RootNavigator.tsx`) to confirm the exact shape of the `icons` map and the `Tab.Screen`/`Stack.Screen` blocks before editing, since this task's earlier exploration only confirmed `Live: Radio,` and `<Tab.Screen name="Live" component={LiveScreen} options={{title: 'Jonli'}} />` exist — match the surrounding code style exactly.

- Add import: `import {ChallengesScreen} from '../screens/ChallengesScreen';`
- In the `icons` map, replace `Live: Radio,` with `Jamm: BookOpen,` — add `BookOpen` to the `lucide-react-native` import list. Check with `grep -n "Radio" apps/mobile/src/navigation/RootNavigator.tsx` after this edit whether `Radio` is still referenced elsewhere in the file (it shouldn't be, since it now only appears inside `ChallengesScreen.tsx`); remove it from this file's import list if unused.
- Replace `<Tab.Screen name="Live" component={LiveScreen} options={{title: 'Jonli'}} />` with `<Tab.Screen name="Jamm" component={ChallengesScreen} options={{title: 'Jamm'}} />`.
- Add a new `Stack.Screen` inside the same authenticated block that already registers `Classroom`, `Chat`, etc.:

```tsx
<Stack.Screen
  name="Live"
  component={LiveScreen}
  options={{title: 'Jonli musobaqalar'}}
/>
```

The `import {LiveScreen} from '../screens/LiveScreen';` line stays in place — it's still imported, only its usage site (Tab vs. Stack) changes.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (aside from the two new stack screens `ChallengeDetail`/`ChallengeWordPractice` in `RootStackParamList` not yet having registered `Stack.Screen` components — that's fine at this point since nothing calls `navigation.navigate('ChallengeDetail', ...)` yet; Task 9/10 add both the screens and their navigation calls together).

- [ ] **Step 6: Manually verify on simulator/device**

Run: `cd apps/mobile && npm run ios` (or `npm run android`)
Confirm the bottom tab bar shows "Jamm" instead of "Jonli". Tapping it shows the 3-card hub. Tapping "Challenge-lar" shows the placeholder list view with a working back button. Tapping "Jonli Musobaqalar" opens the live-competitions screen. Confirm `HistoryScreen`/Amaliyotlar is unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/navigation apps/mobile/src/screens/ChallengesScreen.tsx apps/mobile/src/screens/ChallengesListView.tsx
git commit -m "feat(mobile): replace Jonli tab with Jamm hub, move Live to stack"
```

(As noted in Task 7, this commit will no-op due to `apps/mobile/` being gitignored — run it anyway for consistency.)

---

## Task 9: Mobile — ChallengesListView (real list) and ChallengeDetailScreen (kitobxonlik)

**Files:**
- Modify: `apps/mobile/src/screens/ChallengesListView.tsx` (replace placeholder with the real list)
- Create: `apps/mobile/src/screens/ChallengeDetailScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx` (register `ChallengeDetail` stack screen)

**Interfaces:**
- Consumes: API functions from Task 7 (`api/challenges.ts`), `Screen`/`Loading`/`Empty` from `../components/Ui`, `getApiErrorMessage` from `../lib/errors`.
- Produces: fully working mobile student flow for kitobxonlik challenges, mirroring the web `ChallengesListPage.tsx`/`ChallengeDetailPage.tsx`.

- [ ] **Step 1: Implement `ChallengesListView.tsx`**

```tsx
// apps/mobile/src/screens/ChallengesListView.tsx
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, Image, Pressable, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {BookOpen} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../navigation/types';
import type {ApiStudentChallenge} from '../types/api';
import {apiListMyChallenges, apiJoinChallenge} from '../api/challenges';
import {Empty, Loading, Screen} from '../components/Ui';
import {getApiErrorMessage} from '../lib/errors';

export function ChallengesListView({
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
        console.warn(getApiErrorMessage(err, "Qo'shilib bo'lmadi"));
        return;
      } finally {
        setJoiningId(null);
      }
    }
    if (item.type === 'soz_yodlash') {
      navigation.navigate('ChallengeWordPractice', {challengeId: item.id, title: item.name});
    } else {
      navigation.navigate('ChallengeDetail', {challengeId: item.id, title: item.name});
    }
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
              className="flex-row items-center gap-3 rounded-2xl bg-white p-3 dark:bg-dark-surface">
              {item.imageUrl ? (
                <Image source={{uri: item.imageUrl}} className="h-12 w-12 rounded-xl" />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-canvas">
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

Check `Empty` from `../components/Ui` accepts a `message` prop (confirmed earlier: `export function Empty({text}: {text: string})` — it's `text`, not `message`). Fix the usage above: `<Empty text="Hozircha challenge yo'q" />` instead of `<Empty message="Hozircha challenge yo'q" />`.

- [ ] **Step 2: Implement `ChallengeDetailScreen.tsx`**

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
    const parsedEndPage = parseInt(endPage, 10);
    if (Number.isNaN(parsedEndPage)) {
      setError('Tugagan betni kiriting');
      return;
    }
    try {
      await apiAddChallengeEvent(challengeId, bookId, {
        endPage: parsedEndPage,
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
                <View className="h-full rounded-full bg-indigo-500" style={{width: `${Math.min(100, (book.lastPageRead / (book.totalPages || 1)) * 100)}%`}} />
              </View>

              {book.pendingTest && (
                <Pressable
                  onPress={() => navigation.navigate('TestTaker', {slug: book.pendingTest!.slug, title: book.pendingTest!.name, practiceMode: false})}
                  className="mb-2 rounded-xl bg-amber-50 px-3 py-2">
                  <Text className="text-xs font-semibold text-amber-700">Test ishlash</Text>
                  <Text className="mt-0.5 text-[11px] text-amber-600">Davom etish uchun avval "{book.pendingTest.name}" testini yakunlang</Text>
                </Pressable>
              )}

              {!book.pendingTest && (addingBookId === book.id ? (
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
                  onPress={() => setAddingBookId(book.id)}
                  className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
                  <Text className="text-xs font-semibold text-gray-700 dark:text-dark-ink">+ Yangi yozuv</Text>
                </Pressable>
              ))}
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
                <View key={entry.studentId} className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${entry.isCurrentStudent ? 'bg-indigo-50' : 'bg-gray-50 dark:bg-dark-canvas'}`}>
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

- [ ] **Step 3: Register `ChallengeDetail` in `RootNavigator.tsx`**

Add the import (`import {ChallengeDetailScreen} from '../screens/ChallengeDetailScreen';`) and a `Stack.Screen` in the authenticated block, using `route.params.title` for the header:

```tsx
<Stack.Screen
  name="ChallengeDetail"
  component={ChallengeDetailScreen}
  options={({route}) => ({title: route.params.title})}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors (the `ChallengeWordPractice` stack screen referenced in `RootStackParamList` since Task 8 still has no registered component — that's fine, Task 10 adds it; nothing calls `navigation.navigate('ChallengeWordPractice', ...)` except `ChallengesListView.tsx` from Step 1 of this task, which will cause a type error since the screen isn't registered yet... **actually this does NOT cause a type error**: `RootStackParamList` having the key is sufficient for `navigation.navigate` to type-check; the runtime `Stack.Screen` registration is a separate concern that only matters when the app actually navigates there. tsc will be clean; only a runtime navigation to `ChallengeWordPractice` before Task 10 lands would fail, which won't happen during this task's manual verification since it only touches kitobxonlik challenges).

- [ ] **Step 5: Manually verify on simulator/device**

Run: `cd apps/mobile && npm run ios` (or `npm run android`)
As a student: Jamm tab → Challenge-lar card → confirm the real list loads (not the placeholder), join a kitobxonlik challenge, tap into it, confirm book list/progress/event-adding/leaderboard all work as in the Task 6 web verification.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ChallengesListView.tsx apps/mobile/src/screens/ChallengeDetailScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): add real challenges list and kitobxonlik detail screen"
```

---

## Task 10: Mobile — word memorization practice screens (Flashcard and Test)

**Files:**
- Create: `apps/mobile/src/screens/ChallengeWordPracticeScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx` (register `ChallengeWordPractice` stack screen)

**Interfaces:**
- Consumes: API functions from Task 7's `api/challenge-words.ts`, `ApiStudentChallengeWord`/`ApiChallengeWordLeaderboardEntry` types.
- Produces: fully working mobile student flow for `soz_yodlash` challenges, mirroring the web `ChallengeWordPracticePage.tsx`'s Flashcard/Test mechanics using React Native `Animated`/gesture handling instead of DOM mouse/touch events.

- [ ] **Step 1: Check what gesture/animation library is already available**

Run: `cd apps/mobile && cat package.json | grep -i "gesture\|reanimated"`
This app may already depend on `react-native-gesture-handler` and/or `react-native-reanimated` (common React Navigation peer deps) — if so, use `Animated` from `react-native` (built-in, no new dependency) for the swipe, matching the simplicity of the web `ChallengeWordPracticePage`'s plain mouse/touch handlers rather than introducing gesture-handler-based pan responders, which is unnecessary complexity for a single-card horizontal swipe. Use React Native's built-in `PanResponder` (from `react-native`, no extra dependency) for drag tracking, combined with `Animated.Value` for the transform — this mirrors the web version's raw event-handler approach without requiring new native dependencies.

- [ ] **Step 2: Implement `ChallengeWordPracticeScreen.tsx`**

```tsx
// apps/mobile/src/screens/ChallengeWordPracticeScreen.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, Pressable, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/types';
import type {ApiStudentChallengeWord} from '../types/api';
import {apiListMyChallengeWords, apiSetChallengeWordProgress} from '../api/challenge-words';
import {Loading, Screen} from '../components/Ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ChallengeWordPractice'>;
type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';

export function ChallengeWordPracticeScreen({route}: Props) {
  const {challengeId} = route.params;
  const [words, setWords] = useState<ApiStudentChallengeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);

  useEffect(() => {
    void apiListMyChallengeWords(challengeId).then(setWords);
  }, [challengeId]);

  if (!words) return <Loading />;

  if (!mode || !direction) {
    return (
      <Screen>
        <View className="flex-1 gap-6 p-5">
          <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">Mashq turi</Text>

          <View>
            <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Rejim</Text>
            <View className="flex-row gap-3">
              <Pressable onPress={() => setMode('flashcard')} className={`flex-1 rounded-2xl p-4 ${mode === 'flashcard' ? 'bg-gray-900' : 'bg-white dark:bg-dark-surface'}`}>
                <Text className={`text-sm font-bold ${mode === 'flashcard' ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>Flashcard</Text>
              </Pressable>
              <Pressable onPress={() => setMode('test')} className={`flex-1 rounded-2xl p-4 ${mode === 'test' ? 'bg-gray-900' : 'bg-white dark:bg-dark-surface'}`}>
                <Text className={`text-sm font-bold ${mode === 'test' ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>Test</Text>
              </Pressable>
            </View>
          </View>

          <View>
            <Text className="mb-2 text-xs font-semibold uppercase text-gray-400">Yo'nalish</Text>
            <View className="gap-3">
              <Pressable onPress={() => setDirection('wordToTranslation')} className={`rounded-2xl p-4 ${direction === 'wordToTranslation' ? 'bg-gray-900' : 'bg-white dark:bg-dark-surface'}`}>
                <Text className={`text-sm font-bold ${direction === 'wordToTranslation' ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>So'z → Tarjima</Text>
              </Pressable>
              <Pressable onPress={() => setDirection('translationToWord')} className={`rounded-2xl p-4 ${direction === 'translationToWord' ? 'bg-gray-900' : 'bg-white dark:bg-dark-surface'}`}>
                <Text className={`text-sm font-bold ${direction === 'translationToWord' ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>Tarjima → So'z</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Screen>
    );
  }

  return mode === 'flashcard' ? (
    <FlashcardPractice challengeId={challengeId} words={words} direction={direction} onWordsChange={setWords} />
  ) : (
    <TestPractice challengeId={challengeId} words={words} direction={direction} onWordsChange={setWords} />
  );
}

function FlashcardPractice({
  challengeId, words, direction, onWordsChange,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  onWordsChange: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [deck, setDeck] = useState(words);
  const [revealed, setRevealed] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;

  const knownCount = words.filter(w => w.known).length;
  const current = deck[0];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 5,
      onPanResponderMove: Animated.event([null, {dx: pan.x}], {useNativeDriver: false}),
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > 35) {
          void commitSwipe(gesture.dx > 0);
        } else {
          Animated.spring(pan, {toValue: {x: 0, y: 0}, useNativeDriver: false}).start();
        }
      },
    }),
  ).current;

  async function commitSwipe(known: boolean) {
    if (!current) return;
    setRevealed(false);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
    } catch {
      // best-effort — see web ChallengeWordPracticePage's commitSwipe for rationale
    }
    onWordsChange(words.map(w => (w.id === current.id ? {...w, known} : w)));
    setDeck(prev => {
      const [head, ...rest] = prev;
      return known ? rest : [...rest, head];
    });
    pan.setValue({x: 0, y: 0});
  }

  if (!current) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-1">
          <Text className="text-lg font-bold text-ink dark:text-dark-ink">🎉 Tugadi!</Text>
          <Text className="text-sm text-gray-400">Barcha so'zlar "bilaman" holatida</Text>
        </View>
      </Screen>
    );
  }

  const front = direction === 'wordToTranslation' ? current.word : current.translation;
  const back = direction === 'wordToTranslation' ? current.translation : current.word;
  const rotate = pan.x.interpolate({inputRange: [-200, 0, 200], outputRange: ['-15deg', '0deg', '15deg']});

  return (
    <Screen>
      <View className="flex-1 items-center p-5">
        <View className="mb-4 w-full max-w-[320px] flex-row justify-between">
          <Text className="text-xs text-gray-400">Umumiy: {words.length}</Text>
          <Text className="text-xs text-gray-400">Qolgan: {deck.length}</Text>
          <Text className="text-xs text-gray-400">Bilaman: {knownCount}</Text>
        </View>

        <View className="relative h-[280px] w-full max-w-[320px]">
          {deck.slice(1, 4).map((w, i) => (
            <View
              key={w.id}
              className="absolute inset-0 rounded-3xl bg-white dark:bg-dark-surface"
              style={{transform: [{scale: 1 - (i + 1) * 0.05}, {translateY: (i + 1) * 8}], zIndex: 10 - i}}
            />
          ))}
          <Animated.View
            {...panResponder.panHandlers}
            style={{transform: [{translateX: pan.x}, {rotate}], zIndex: 20}}
            className="absolute inset-0 items-center justify-center rounded-3xl bg-white p-6 dark:bg-dark-surface">
            <Pressable onPress={() => setRevealed(r => !r)} className="items-center">
              <Text className="text-2xl font-extrabold text-ink dark:text-dark-ink">{front}</Text>
              {revealed ? (
                <Text className="mt-4 text-lg text-gray-500">{back}</Text>
              ) : (
                <Text className="mt-4 text-[10px] tracking-wide text-gray-300">JAVOBNI KO'RSATISH</Text>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}

function pickWrongOptions(words: ApiStudentChallengeWord[], correctId: string, direction: Direction, count: number): string[] {
  const pool = words.filter(w => w.id !== correctId).map(w => (direction === 'wordToTranslation' ? w.translation : w.word));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function TestPractice({
  challengeId, words, direction, onWordsChange,
}: {
  challengeId: string;
  words: ApiStudentChallengeWord[];
  direction: Direction;
  onWordsChange: (words: ApiStudentChallengeWord[]) => void;
}) {
  const [queue] = useState(() => [...words].sort(() => Math.random() - 0.5));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const current = queue[index];
  const options = useMemo(() => {
    if (!current) return [];
    const correctAnswer = direction === 'wordToTranslation' ? current.translation : current.word;
    const wrongCount = Math.min(3, words.length - 1);
    const wrongs = pickWrongOptions(words, current.id, direction, wrongCount);
    return [correctAnswer, ...wrongs].sort(() => Math.random() - 0.5);
  }, [current, words, direction]);

  if (!current) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg font-bold text-ink dark:text-dark-ink">Natija: {correctCount}/{queue.length} to'g'ri</Text>
        </View>
      </Screen>
    );
  }

  const question = direction === 'wordToTranslation' ? current.word : current.translation;
  const correctAnswer = direction === 'wordToTranslation' ? current.translation : current.word;

  async function handleSelect(option: string) {
    if (selected) return;
    setSelected(option);
    const known = option === correctAnswer;
    if (known) setCorrectCount(c => c + 1);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
    } catch {
      // best-effort — see web TestPractice's handleSelect for rationale
    }
    onWordsChange(words.map(w => (w.id === current.id ? {...w, known} : w)));
    setTimeout(() => {
      setSelected(null);
      setIndex(i => i + 1);
    }, 700);
  }

  return (
    <Screen>
      <View className="flex-1 items-center p-5">
        <Text className="mb-1 text-xs text-gray-400">{index + 1} / {queue.length}</Text>
        <Text className="mb-6 text-2xl font-extrabold text-ink dark:text-dark-ink">{question}</Text>
        <View className="w-full max-w-[400px] gap-2.5">
          {options.map(option => {
            const isCorrect = option === correctAnswer;
            const isSelected = option === selected;
            let bgClass = 'bg-white dark:bg-dark-surface';
            if (selected) {
              if (isCorrect) bgClass = 'bg-green-100';
              else if (isSelected) bgClass = 'bg-red-100';
            }
            return (
              <Pressable
                key={option}
                disabled={!!selected}
                onPress={() => void handleSelect(option)}
                className={`rounded-2xl p-4 ${bgClass}`}>
                <Text className="text-sm font-semibold text-ink dark:text-dark-ink">{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Register `ChallengeWordPractice` in `RootNavigator.tsx`**

Add the import (`import {ChallengeWordPracticeScreen} from '../screens/ChallengeWordPracticeScreen';`) and a `Stack.Screen`:

```tsx
<Stack.Screen
  name="ChallengeWordPractice"
  component={ChallengeWordPracticeScreen}
  options={({route}) => ({title: route.params.title})}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify on simulator/device**

Run: `cd apps/mobile && npm run ios` (or `npm run android`)
As a student: Jamm tab → Challenge-lar → join/open a `soz_yodlash` challenge, confirm it navigates straight to the practice mode/direction picker (not the kitobxonlik book-detail screen). Pick Flashcard, confirm dragging left/right works (card follows finger, snaps back below threshold, commits above threshold), tapping reveals the translation. Go back, pick Test, confirm 4 options render and selecting one shows correct/wrong feedback then auto-advances.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/ChallengeWordPracticeScreen.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "feat(mobile): add word memorization Flashcard/Test practice screens"
```

---

## Task 11: End-to-end verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: all tests pass, including the new `challenge-words` and `student-challenge-words` specs.

- [ ] **Step 2: Run type checks across all three projects**

Run: `cd apps/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit && cd ../mobile && npx tsc --noEmit`
Expected: no errors in any of the three projects.

- [ ] **Step 3: Manual end-to-end walkthrough (web)**

With backend running locally and a migrated DB (Task 2):
1. As a teacher: create a course, create a challenge with type "So'z yodlash", add 5 words manually, then bulk-import a mix of valid/malformed lines and confirm the added/skipped counts match.
2. As a student enrolled in that course: open "Jamm" → "Challenge-lar", join the word challenge, open it, tap "Mashq qilish", pick Flashcard + So'z→Tarjima.
3. Swipe right on 2 words (known), swipe left on 1 word (confirm it returns to the back of the deck, not lost).
4. Switch to Test mode, answer a few questions, confirm correct/wrong feedback and auto-advance.
5. Check the Reyting tab shows this student's known-word count matching what was marked known across both modes (should be additive/overwritten correctly per the shared-state rule).
6. Repeat steps 1-2 for a second student account (or reuse the teacher's own admin-linked student login if the codebase supports that) to confirm the leaderboard ranks two students correctly.

- [ ] **Step 4: Manual end-to-end walkthrough (mobile)**

With the backend reachable from the device/simulator:
1. Jamm tab → Challenge-lar → open the same `soz_yodlash` challenge created in Step 3.
2. Repeat the Flashcard swipe and Test mode checks from Step 3.
3. Separately, open a `kitobxonlik` challenge and confirm the book/event/leaderboard flow still works (this validates the mobile kitobxonlik rebuild from Tasks 8-9 alongside the new word-memorization screens).

- [ ] **Step 5: Final commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix: address issues found during word-memorization end-to-end verification"
```
