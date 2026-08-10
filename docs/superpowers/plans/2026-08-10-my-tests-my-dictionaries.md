# "Mening testlarim" va "Mening lug'atlarim" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new student-only features to the `/jamm` hub — "Mening testlarim" (student-authored, folder-organized tests reusing the existing test-taking infrastructure) and "Mening lug'atlarim" (student-authored, folder-organized vocabulary decks with a link-shareable flashcard/test practice UI and zero persisted progress).

**Architecture:** "Mening testlarim" reuses the existing `folders`/`tests`/`questions`/`options` tables and the existing public delivery flow (`/t/:slug`) unchanged, but adds a **new, self-contained backend module** (`student-tests`) with its own controllers/services scoped to `@Roles('student')` — following the exact precedent already in this codebase where `student-challenges.controller.ts`/`.service.ts` sit alongside `challenges.controller.ts`/`.service.ts` as siblings, not through shared/exported services. "Mening lug'atlarim" is entirely new: two new tables (`wordDecks`, `deckWords`, no progress table), a new backend module, and a new frontend practice page adapted directly from `ChallengeWordPracticePage.tsx` with all progress-persistence calls removed.

**Tech Stack:** NestJS + Drizzle ORM + PostgreSQL (backend), React + TypeScript + Tailwind + react-router-dom + Zustand + sonner (frontend), Jest + ts-jest (backend tests), Vitest (frontend tests, logic-only — no component render tests exist in this repo).

## Global Constraints

- Every new student-facing route/endpoint requires an authenticated student: backend controllers use `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('student')`; frontend pages wrap in `<PrivateRoute>`.
- "Mening testlarim" test creation must force `requireAuth = true`, `onceOnly = false`, `deadline = undefined` server-side regardless of what the client sends — the DTO for student test creation must not even accept `onceOnly`/`deadline`/`requireAuth` fields.
- No pin (`test_pins`) functionality is exposed anywhere in the student test flow — no endpoint, no UI.
- No submission/results/statistics endpoint exists for student-created tests — do not add one, even read-only, per spec section 1.1.
- "Mening lug'atlarim" persists no per-user progress anywhere — the `known`/`unknown` state for practice must never leave the browser (no API call on flashcard swipe or test answer).
- Ownership checks always combine the row's owner column with the requesting user's id in the same `where` clause (`and(eq(table.id, id), eq(table.ownerColumn, userId))`) — never a separate existence check followed by a separate owner check.
- DTOs are `class-validator`-decorated plain classes declared inline at the top of the controller file, matching every existing controller in this codebase (no `dto/` subfolder).
- New Drizzle tables follow the exact column style already in `schema.ts`: `id: uuid('id').primaryKey().defaultRandom()`, snake_case column names via `text('snake_case')`, FKs as `uuid('col').notNull().references(() => table.id, { onDelete: 'cascade' })`, `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()`.
- After any `schema.ts` edit, run `pnpm db:generate` (from `apps/backend`) to create the migration file, then `pnpm db:migrate` to apply it — this project has no auto-migrate-on-boot.

---

## Part A: Mening testlarim (backend)

### Task 1: Add student-scoped test/folder/question backend module skeleton

**Files:**
- Create: `apps/backend/src/student-tests/student-tests.module.ts`
- Create: `apps/backend/src/student-tests/student-folders.controller.ts`
- Create: `apps/backend/src/student-tests/student-folders.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/student-tests/student-folders.service.spec.ts`

**Interfaces:**
- Produces: `StudentFoldersService` with methods `findAll(studentId: string)`, `create(studentId: string, name: string, color?: string, icon?: string)`, `update(id: string, studentId: string, data: { name?: string; color?: string; icon?: string })`, `remove(id: string, studentId: string)` — identical signatures to `FoldersService` in `apps/backend/src/folders/folders.service.ts`, but querying `folders` with `adminId = studentId` (the `folders` table has no role-specific column; a student's own folders are simply rows where `adminId` happens to be their user id).
- Produces: `StudentFoldersController` at route prefix `me/test-folders`, `@Roles('student')`.

This task establishes the module and the folder CRUD slice, which Task 2 (tests) and Task 3 (questions) will register into.

- [ ] **Step 1: Write the failing test for folder creation ownership scoping**

```ts
// apps/backend/src/student-tests/student-folders.service.spec.ts
import { StudentFoldersService } from './student-folders.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      folders: { findMany: jest.fn(), findFirst: jest.fn() },
      tests: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentFoldersService', () => {
  const service = new StudentFoldersService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a folder owned by the given student id', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'folder-1', adminId: 'student-1', name: 'Fizika', color: '#6366f1', icon: 'folder' }]);
    const values = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });

    const folder = await service.create('student-1', 'Fizika');

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'student-1', name: 'Fizika' }));
    expect(folder.id).toBe('folder-1');
  });

  it('does not return a folder owned by a different user on update', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });

    await expect(service.update('folder-1', 'student-1', { name: 'Yangi nom' })).rejects.toThrow('Folder not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest student-folders.service.spec.ts`
Expected: FAIL with "Cannot find module './student-folders.service'"

- [ ] **Step 3: Write `student-folders.service.ts`**

```ts
// apps/backend/src/student-tests/student-folders.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { folders, tests } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';

@Injectable()
export class StudentFoldersService {
  async findAll(studentId: string) {
    const rows = await db.query.folders.findMany({
      where: eq(folders.adminId, studentId),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
    });

    const counts = await db
      .select({ folderId: tests.folderId, count: sql<number>`count(*)::int` })
      .from(tests)
      .where(eq(tests.adminId, studentId))
      .groupBy(tests.folderId);

    const countMap = new Map(counts.map((c) => [c.folderId, c.count]));
    return rows.map((f) => ({ ...f, testCount: countMap.get(f.id) ?? 0 }));
  }

  async create(studentId: string, name: string, color?: string, icon?: string) {
    const [folder] = await db
      .insert(folders)
      .values({ adminId: studentId, name, color: color ?? '#6366f1', icon: icon ?? 'folder' })
      .returning();
    return folder;
  }

  async update(id: string, studentId: string, data: { name?: string; color?: string; icon?: string }) {
    const [folder] = await db
      .update(folders)
      .set(data)
      .where(and(eq(folders.id, id), eq(folders.adminId, studentId)))
      .returning();
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async remove(id: string, studentId: string) {
    const result = await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.adminId, studentId)))
      .returning({ id: folders.id });
    if (!result.length) throw new NotFoundException('Folder not found');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest student-folders.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `student-folders.controller.ts`**

```ts
// apps/backend/src/student-tests/student-folders.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentFoldersService } from './student-folders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateStudentFolderDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

class UpdateStudentFolderDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/test-folders')
export class StudentFoldersController {
  constructor(private studentFoldersService: StudentFoldersService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.studentFoldersService.findAll(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateStudentFolderDto) {
    return this.studentFoldersService.create(req.user.id, dto.name, dto.color, dto.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateStudentFolderDto) {
    return this.studentFoldersService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.studentFoldersService.remove(id, req.user.id);
  }
}
```

- [ ] **Step 6: Create the module and register it in `app.module.ts`**

```ts
// apps/backend/src/student-tests/student-tests.module.ts
import { Module } from '@nestjs/common';
import { StudentFoldersController } from './student-folders.controller';
import { StudentFoldersService } from './student-folders.service';

@Module({
  controllers: [StudentFoldersController],
  providers: [StudentFoldersService],
})
export class StudentTestsModule {}
```

In `apps/backend/src/app.module.ts`, add the import near `ChallengesModule`:

```ts
import { StudentTestsModule } from './student-tests/student-tests.module';
```

And add `StudentTestsModule` to the `imports` array (after `ChallengesModule`).

- [ ] **Step 7: Run the full backend test suite to check for regressions**

Run: `cd apps/backend && npx jest`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/student-tests apps/backend/src/app.module.ts
git commit -m "feat: add student-scoped folder CRUD for Mening testlarim"
```

---

### Task 2: Add student-scoped test CRUD (metadata only, forced permission flags)

**Files:**
- Create: `apps/backend/src/student-tests/student-tests.controller.ts`
- Create: `apps/backend/src/student-tests/student-tests.service.ts`
- Modify: `apps/backend/src/student-tests/student-tests.module.ts` (rename references — actually modify the existing skeleton module from Task 1)
- Test: `apps/backend/src/student-tests/student-tests.service.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (separate service), but shares the `folders`/`tests` tables.
- Produces: `StudentTestsService` with `findAllForStudent(folderId: string, studentId: string)`, `create(studentId: string, data: { folderId: string; name: string; description?: string; timeLimit?: number; showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean; oneByOne?: boolean; autoCompleteOnLeave?: boolean })`, `findOne(id: string, studentId: string)`, `update(id: string, studentId: string, data: Partial<...>)`, `remove(id: string, studentId: string)`. Note: **no `requireAuth`, `onceOnly`, or `deadline` parameters accepted at all** — `create` hardcodes `requireAuth: true`, `onceOnly: false`, `deadline: undefined`.
- Produces: `StudentTestsController` at route prefix `me/tests`, `@Roles('student')`, routes `GET /me/tests?folder_id=`, `POST /me/tests`, `GET /me/tests/:id`, `PATCH /me/tests/:id`, `DELETE /me/tests/:id`.

- [ ] **Step 1: Write the failing test for forced permission flags on create**

```ts
// apps/backend/src/student-tests/student-tests.service.spec.ts
import { StudentTestsService } from './student-tests.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      tests: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentTestsService', () => {
  const service = new StudentTestsService();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);
  });

  it('forces requireAuth=true, onceOnly=false, deadline=undefined on create regardless of caller intent', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'test-1', adminId: 'student-1', requireAuth: true, onceOnly: false, deadline: null }]);
    const values = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });

    await service.create('student-1', { folderId: 'folder-1', name: 'Mening testim' });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'student-1',
      requireAuth: true,
      onceOnly: false,
      deadline: undefined,
    }));
  });

  it('throws NotFoundException when updating a test not owned by the student', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });

    await expect(service.update('test-1', 'student-1', { name: 'X' })).rejects.toThrow('Test not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest student-tests.service.spec.ts`
Expected: FAIL with "Cannot find module './student-tests.service'"

- [ ] **Step 3: Write `student-tests.service.ts`**

```ts
// apps/backend/src/student-tests/student-tests.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateSlug(): string {
  return Array.from({ length: 8 }, () => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]).join('');
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    const existing = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!existing) return slug;
  }
  throw new Error('Could not generate unique slug');
}

@Injectable()
export class StudentTestsService {
  async findAllForFolder(folderId: string, studentId: string) {
    return db.query.tests.findMany({
      where: and(eq(tests.folderId, folderId), eq(tests.adminId, studentId)),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
  }

  async findOne(id: string, studentId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, id), eq(tests.adminId, studentId)),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async create(studentId: string, data: {
    folderId: string; name: string; description?: string; timeLimit?: number;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; autoCompleteOnLeave?: boolean;
  }) {
    const slug = await uniqueSlug();
    const [test] = await db.insert(tests).values({
      adminId: studentId,
      folderId: data.folderId,
      name: data.name,
      description: data.description,
      timeLimit: data.timeLimit,
      showResults: data.showResults ?? 'immediately',
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      oneByOne: data.oneByOne ?? false,
      // Mening testlarim: talaba yaratgan testlar har doim login talab
      // qiladi, hech qachon bir martalik yoki muddatli bo'lmaydi — bu
      // qiymatlar DTO darajasida ham qabul qilinmaydi, shu yerda ham
      // ikkinchi marta mahkamlanadi.
      requireAuth: true,
      autoCompleteOnLeave: data.autoCompleteOnLeave ?? true,
      onceOnly: false,
      deadline: undefined,
      slug,
    }).returning();
    return test;
  }

  async update(id: string, studentId: string, data: {
    name?: string; description?: string; timeLimit?: number | null;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; autoCompleteOnLeave?: boolean;
  }) {
    const [test] = await db.update(tests)
      .set(data)
      .where(and(eq(tests.id, id), eq(tests.adminId, studentId)))
      .returning();
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async remove(id: string, studentId: string) {
    const result = await db.delete(tests)
      .where(and(eq(tests.id, id), eq(tests.adminId, studentId)))
      .returning({ id: tests.id });
    if (!result.length) throw new NotFoundException('Test not found');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest student-tests.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `student-tests.controller.ts`**

```ts
// apps/backend/src/student-tests/student-tests.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentTestsService } from './student-tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, MinLength } from 'class-validator';

class CreateStudentTestDto {
  @IsString() folderId: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
}

class UpdateStudentTestDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden', 'per_question']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsBoolean() autoCompleteOnLeave?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/tests')
export class StudentTestsController {
  constructor(private studentTestsService: StudentTestsService) {}

  @Get()
  findAll(@Query('folder_id') folderId: string, @Req() req: any) {
    return this.studentTestsService.findAllForFolder(folderId, req.user.id);
  }

  @Post()
  create(@Body() dto: CreateStudentTestDto, @Req() req: any) {
    return this.studentTestsService.create(req.user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.studentTestsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentTestDto, @Req() req: any) {
    return this.studentTestsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.studentTestsService.remove(id, req.user.id);
  }
}
```

- [ ] **Step 6: Register the new controller/service in the module**

```ts
// apps/backend/src/student-tests/student-tests.module.ts
import { Module } from '@nestjs/common';
import { StudentFoldersController } from './student-folders.controller';
import { StudentFoldersService } from './student-folders.service';
import { StudentTestsController } from './student-tests.controller';
import { StudentTestsService } from './student-tests.service';

@Module({
  controllers: [StudentFoldersController, StudentTestsController],
  providers: [StudentFoldersService, StudentTestsService],
})
export class StudentTestsModule {}
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/student-tests
git commit -m "feat: add student-scoped test CRUD with forced auth/no-deadline for Mening testlarim"
```

---

### Task 3: Add student-scoped question/option CRUD (reuses bulk-import parser pattern)

**Files:**
- Create: `apps/backend/src/student-tests/student-questions.controller.ts`
- Create: `apps/backend/src/student-tests/student-questions.service.ts`
- Modify: `apps/backend/src/student-tests/student-tests.module.ts`
- Test: `apps/backend/src/student-tests/student-questions.service.spec.ts`

**Interfaces:**
- Consumes: `tests` table ownership check pattern from Task 2 (`and(eq(tests.id, testId), eq(tests.adminId, studentId))`).
- Produces: `StudentQuestionsService` with `addQuestion(testId, studentId, data)`, `updateQuestion(id, studentId, data)`, `removeQuestion(id, studentId)` — same shape as `QuestionsService` in `apps/backend/src/questions/questions.service.ts`, parameterized by `studentId` instead of `adminId`.
- Produces: `StudentQuestionsController`, routes `POST me/tests/:testId/questions`, `PATCH me/questions/:id`, `DELETE me/questions/:id`.

- [ ] **Step 1: Write the failing test for question ownership via test chain**

```ts
// apps/backend/src/student-tests/student-questions.service.spec.ts
import { StudentQuestionsService } from './student-questions.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      tests: { findFirst: jest.fn() },
      questions: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentQuestionsService', () => {
  const service = new StudentQuestionsService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects adding a question to a test not owned by the student', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(
      service.addQuestion('test-1', 'student-1', { text: 'Q?', type: 'single', options: [{ text: 'A', isCorrect: true }] }),
    ).rejects.toThrow('Test not found');
  });

  it('adds a question when the test is owned by the student', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'student-1' });
    (db.query.questions.findMany as jest.Mock).mockResolvedValue([]);
    const questionReturning = jest.fn().mockResolvedValue([{ id: 'q-1', testId: 'test-1', text: 'Q?', type: 'single', orderIndex: 0 }]);
    const optionsReturning = jest.fn().mockResolvedValue([{ id: 'o-1', questionId: 'q-1', text: 'A', isCorrect: true, orderIndex: 0 }]);
    (db.insert as jest.Mock)
      .mockReturnValueOnce({ values: jest.fn(() => ({ returning: questionReturning })) })
      .mockReturnValueOnce({ values: jest.fn(() => ({ returning: optionsReturning })) });

    const question = await service.addQuestion('test-1', 'student-1', {
      text: 'Q?', type: 'single', options: [{ text: 'A', isCorrect: true }],
    });

    expect(question.id).toBe('q-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest student-questions.service.spec.ts`
Expected: FAIL with "Cannot find module './student-questions.service'"

- [ ] **Step 3: Write `student-questions.service.ts`**

```ts
// apps/backend/src/student-tests/student-questions.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { questions, options, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class StudentQuestionsService {
  private async verifyTestOwnership(testId: string, studentId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, studentId)),
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private async verifyQuestionOwnership(questionId: string, studentId: string) {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, questionId),
      with: { test: true },
    });
    if (!question || question.test.adminId !== studentId) throw new NotFoundException('Question not found');
    return question;
  }

  async addQuestion(testId: string, studentId: string, data: {
    text: string;
    type: string;
    options: Array<{ text: string; isCorrect: boolean; orderIndex?: number }>;
    imageUrl?: string;
    audioUrl?: string;
    correctAnswer?: string | null;
  }) {
    await this.verifyTestOwnership(testId, studentId);
    if ((data.type === 'single' || data.type === 'multi') && data.options.length > 0) {
      const hasCorrect = data.options.some((o) => o.isCorrect);
      if (!hasCorrect) throw new BadRequestException('Kamida bitta to\'g\'ri javob belgilanishi shart');
    }
    const existing = await db.query.questions.findMany({ where: eq(questions.testId, testId) });
    const [question] = await db.insert(questions).values({
      testId,
      text: data.text,
      type: data.type,
      orderIndex: existing.length,
      imageUrl: data.imageUrl ?? null,
      audioUrl: data.audioUrl ?? null,
      correctAnswer: data.correctAnswer ?? null,
    }).returning();

    if (data.options.length > 0) {
      await db.insert(options).values(
        data.options.map((o, index) => ({
          questionId: question.id,
          text: o.text,
          isCorrect: o.isCorrect,
          orderIndex: o.orderIndex ?? index,
        })),
      );
    }
    return question;
  }

  async updateQuestion(id: string, studentId: string, data: {
    text?: string; type?: string; orderIndex?: number;
    imageUrl?: string; audioUrl?: string; correctAnswer?: string;
  }) {
    await this.verifyQuestionOwnership(id, studentId);
    const [question] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return question;
  }

  async removeQuestion(id: string, studentId: string) {
    await this.verifyQuestionOwnership(id, studentId);
    await db.delete(questions).where(eq(questions.id, id));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest student-questions.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `student-questions.controller.ts`**

```ts
// apps/backend/src/student-tests/student-questions.controller.ts
import { Controller, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentQuestionsService } from './student-questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsIn, MinLength, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

const QUESTION_TYPES = ['single', 'multi', 'open', 'arrange', 'truefalse', 'reorder', 'matching', 'fillblank', 'slider', 'droppin'];

class StudentOptionDto {
  @IsString() @MinLength(1) text: string;
  @IsBoolean() isCorrect: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

class CreateStudentQuestionDto {
  @IsString() @MinLength(1) text: string;
  @IsIn(QUESTION_TYPES) type!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudentOptionDto) options: StudentOptionDto[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
  @IsOptional() @IsString() correctAnswer?: string;
}

class UpdateStudentQuestionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsIn(QUESTION_TYPES) type?: string;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
  @IsOptional() @IsString() correctAnswer?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller()
export class StudentQuestionsController {
  constructor(private studentQuestionsService: StudentQuestionsService) {}

  @Post('me/tests/:testId/questions')
  addQuestion(@Param('testId') testId: string, @Body() dto: CreateStudentQuestionDto, @Req() req: any) {
    return this.studentQuestionsService.addQuestion(testId, req.user.id, dto);
  }

  @Patch('me/questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateStudentQuestionDto, @Req() req: any) {
    return this.studentQuestionsService.updateQuestion(id, req.user.id, dto);
  }

  @Delete('me/questions/:id')
  @HttpCode(204)
  removeQuestion(@Param('id') id: string, @Req() req: any) {
    return this.studentQuestionsService.removeQuestion(id, req.user.id);
  }
}
```

- [ ] **Step 6: Register in the module**

```ts
// apps/backend/src/student-tests/student-tests.module.ts
import { Module } from '@nestjs/common';
import { StudentFoldersController } from './student-folders.controller';
import { StudentFoldersService } from './student-folders.service';
import { StudentTestsController } from './student-tests.controller';
import { StudentTestsService } from './student-tests.service';
import { StudentQuestionsController } from './student-questions.controller';
import { StudentQuestionsService } from './student-questions.service';

@Module({
  controllers: [StudentFoldersController, StudentTestsController, StudentQuestionsController],
  providers: [StudentFoldersService, StudentTestsService, StudentQuestionsService],
})
export class StudentTestsModule {}
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/student-tests
git commit -m "feat: add student-scoped question CRUD for Mening testlarim"
```

---

## Part B: Mening testlarim (frontend)

### Task 4: Add frontend API clients for student folders/tests/questions

**Files:**
- Create: `apps/frontend/src/api/student-tests.ts`
- Test: none (this file is a thin axios wrapper matching the untested pattern of `apps/frontend/src/api/folders.ts` and `apps/frontend/src/api/tests.ts` — no existing API client file in this codebase has a test)

**Interfaces:**
- Produces: `StudentFolder`, `StudentTest`, `StudentTestDetail`, `CreateStudentTestData` types; `apiFetchStudentFolders()`, `apiCreateStudentFolder(name, color?, icon?)`, `apiUpdateStudentFolder(id, data)`, `apiDeleteStudentFolder(id)`, `apiFetchStudentTests(folderId)`, `apiGetStudentTest(id)`, `apiCreateStudentTest(data)`, `apiUpdateStudentTest(id, data)`, `apiDeleteStudentTest(id)` functions, all built on the shared `client` from `apps/frontend/src/api/client.ts`.

- [ ] **Step 1: Write `student-tests.ts`**

```ts
// apps/frontend/src/api/student-tests.ts
import client from './client';

export interface StudentFolder {
  id: string;
  adminId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  testCount: number;
}

export interface StudentTest {
  id: string;
  folderId: string;
  adminId: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  requireAuth: boolean;
  autoCompleteOnLeave: boolean;
  onceOnly: boolean;
  deadline: string | null;
  createdAt: string;
  slug: string | null;
}

export interface StudentTestDetail extends StudentTest {
  questions: import('./questions').Question[];
}

export type CreateStudentTestData = {
  folderId: string;
  name: string;
  description?: string;
  timeLimit?: number;
  showResults?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  oneByOne?: boolean;
  autoCompleteOnLeave?: boolean;
};

export async function apiFetchStudentFolders(): Promise<StudentFolder[]> {
  const res = await client.get('/me/test-folders');
  return res.data;
}

export async function apiCreateStudentFolder(name: string, color?: string, icon?: string): Promise<StudentFolder> {
  const res = await client.post('/me/test-folders', { name, color, icon });
  return res.data;
}

export async function apiUpdateStudentFolder(id: string, data: { name?: string; color?: string; icon?: string }): Promise<StudentFolder> {
  const res = await client.patch(`/me/test-folders/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentFolder(id: string): Promise<void> {
  await client.delete(`/me/test-folders/${id}`);
}

export async function apiFetchStudentTests(folderId: string): Promise<StudentTest[]> {
  const res = await client.get('/me/tests', { params: { folder_id: folderId } });
  return res.data;
}

export async function apiGetStudentTest(id: string): Promise<StudentTestDetail> {
  const res = await client.get(`/me/tests/${id}`);
  return res.data;
}

export async function apiCreateStudentTest(data: CreateStudentTestData): Promise<StudentTest> {
  const res = await client.post('/me/tests', data);
  return res.data;
}

export async function apiUpdateStudentTest(id: string, data: Partial<Omit<CreateStudentTestData, 'folderId'>>): Promise<StudentTest> {
  const res = await client.patch(`/me/tests/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentTest(id: string): Promise<void> {
  await client.delete(`/me/tests/${id}`);
}
```

Note: check `apps/frontend/src/api/questions.ts` exports a `Question` type before this compiles — it does, matching `TestDetail` in `apps/frontend/src/api/tests.ts` which uses the identical `import('./questions').Question[]` pattern.

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/student-tests.ts
git commit -m "feat: add frontend API client for Mening testlarim"
```

---

### Task 5: Add "Mening testlarim" folder list page + folder card reuse

**Files:**
- Create: `apps/frontend/src/pages/MyTestsPage.tsx`
- Modify: `apps/frontend/src/pages/ChallengesHubPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetchStudentFolders`, `apiCreateStudentFolder`, `apiUpdateStudentFolder`, `apiDeleteStudentFolder` from Task 4; `FolderCard` from `apps/frontend/src/components/FolderCard.tsx` (props: `folder`, `testCount?`, `onClick`, `onEdit`, `onDelete` — but note `FolderCard`'s `folder` prop is typed as the teacher `Folder` from `apps/frontend/src/api/folders.ts`; since `StudentFolder` has the identical shape, pass it directly — TypeScript structural typing accepts it); `NewFolderModal` from `apps/frontend/src/components/NewFolderModal.tsx` (unchanged, generic).
- Produces: `MyTestsPage` component, route `/my-tests`.

This mirrors the teacher `DashboardPage.tsx` folder-grid pattern but scoped to the new student API and wrapped in `StudentShell` instead of `AppShell`.

- [ ] **Step 1: Write `MyTestsPage.tsx`**

```tsx
// apps/frontend/src/pages/MyTestsPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { FolderCard } from "../components/FolderCard";
import { NewFolderModal } from "../components/NewFolderModal";
import {
  apiFetchStudentFolders,
  apiCreateStudentFolder,
  apiUpdateStudentFolder,
  apiDeleteStudentFolder,
  type StudentFolder,
} from "../api/student-tests";

export function MyTestsPage() {
  const navigate = useNavigate();
  const [folders, setFolders] = useState<StudentFolder[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editFolder, setEditFolder] = useState<StudentFolder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentFolder | null>(null);

  async function load() {
    try {
      setFolders(await apiFetchStudentFolders());
    } catch {
      toast.error("Papkalarni yuklab bo'lmadi");
      setFolders([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(name: string, color: string) {
    try {
      await apiCreateStudentFolder(name, color);
      setShowCreate(false);
      void load();
    } catch {
      toast.error("Papka yaratib bo'lmadi");
    }
  }

  async function handleUpdate(name: string, color: string) {
    if (!editFolder) return;
    try {
      await apiUpdateStudentFolder(editFolder.id, { name, color });
      setEditFolder(null);
      void load();
    } catch {
      toast.error("Papkani yangilab bo'lmadi");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await apiDeleteStudentFolder(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch {
      toast.error("Papkani o'chirib bo'lmadi");
    }
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/jamm")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Mening testlarim</h1>
            <p className="mt-1 text-sm text-gray-400">O'z testlaringizni tuzing va ulashing</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            <Plus size={16} /> Yangi papka
          </button>
        </div>

        {!folders ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : folders.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali papka yo'q. Yangisini yarating!</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                testCount={folder.testCount}
                onClick={() => navigate(`/my-tests/${folder.id}`)}
                onEdit={() => setEditFolder(folder)}
                onDelete={() => setConfirmDelete(folder)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <NewFolderModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editFolder && (
        <NewFolderModal
          title="Papkani tahrirlash"
          initial={{ name: editFolder.name, color: editFolder.color }}
          onSubmit={handleUpdate}
          onClose={() => setEditFolder(null)}
        />
      )}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl pointer-events-auto">
              <p className="mb-1 text-sm font-medium text-gray-700">Papkani o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{confirmDelete.name}" o'chirilsinmi? Ichidagi barcha testlar ham o'chadi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Bekor qilish
                </button>
                <button onClick={() => void handleDelete()} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </StudentShell>
  );
}
```

- [ ] **Step 2: Add the card to `ChallengesHubPage.tsx`**

In `apps/frontend/src/pages/ChallengesHubPage.tsx`, add `FileText` and `Languages` to the lucide-react import on line 2, and insert two new cards after the "Jonli Musobaqalar" button (after line 45, before the "Ovozli suhbat" disabled card):

```tsx
          <button
            type="button"
            onClick={() => navigate("/my-tests")}
            className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-colors"
          >
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <FileText size={22} className="text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-950">Mening testlarim</p>
              <p className="mt-1 text-xs text-gray-500">O'z testlaringizni tuzing</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/my-dictionaries")}
            className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-colors"
          >
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <Languages size={22} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-950">Mening lug'atlarim</p>
              <p className="mt-1 text-xs text-gray-500">O'z lug'atlaringizni tuzing</p>
            </div>
          </button>
```

And update the import line: `import { BookOpen, FileText, Focus, Languages, Mic, Radio } from "lucide-react";`

- [ ] **Step 3: Register the route in `App.tsx`**

Add the lazy import near `ChallengesHubPage`'s (around line 1881 in the existing file):

```tsx
const MyTestsPage = lazy(() =>
  import("./pages/MyTestsPage").then((m) => ({ default: m.MyTestsPage })),
);
```

Add the route entry near the `/jamm` route block:

```tsx
  {
    path: "/my-tests",
    element: (
      <PrivateRoute>
        <MyTestsPage />
      </PrivateRoute>
    ),
  },
```

- [ ] **Step 4: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manually verify in browser**

Start the dev servers (`cd apps/backend && pnpm start:dev` and `cd apps/frontend && pnpm dev`), log in as a student, navigate to `/jamm`, confirm both new cards render, click "Mening testlarim", confirm the empty-state page loads and "Yangi papka" opens the modal and creates a folder.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/MyTestsPage.tsx apps/frontend/src/pages/ChallengesHubPage.tsx apps/frontend/src/App.tsx
git commit -m "feat: add Mening testlarim hub cards and folder list page"
```

---

### Task 6: Add "Mening testlarim" folder-view page (test list, no pin/results actions) and simplified test-settings modal

**Files:**
- Create: `apps/frontend/src/pages/MyTestFolderViewPage.tsx`
- Create: `apps/frontend/src/components/StudentTestCard.tsx`
- Create: `apps/frontend/src/components/StudentTestSettingsModal.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiFetchStudentTests`, `apiCreateStudentTest`, `apiUpdateStudentTest`, `apiDeleteStudentTest`, `StudentTest`, `CreateStudentTestData` from Task 4; `apiFetchStudentFolders` from Task 4 (to resolve folder name for the breadcrumb).
- Produces: `StudentTestCard` (props: `test: StudentTest`, `onEdit: () => void`, `onSettings: () => void`, `onDelete: () => void`) — a trimmed `TestCard` with no `onResults`/`onLive`/`onPin`/`hasPin` props/buttons. `StudentTestSettingsModal` (props: `folderId: string`, `onSubmit: (data: CreateStudentTestData) => void`, `onClose: () => void`, `initial?: Partial<CreateStudentTestData>`, `title?: string`) — a trimmed `TestSettingsModal` with no `requireAuth`/`onceOnly`/`deadline` fields. `MyTestFolderViewPage` at route `/my-tests/:id`.

- [ ] **Step 1: Write `StudentTestCard.tsx`**

```tsx
// apps/frontend/src/components/StudentTestCard.tsx
import { useState } from "react";
import { Clock, Shuffle, Link2, Check, Settings2, Trash2, Pencil } from "lucide-react";
import type { StudentTest } from "../api/student-tests";

interface Props {
  test: StudentTest;
  onEdit: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function StudentTestCard({ test, onEdit, onSettings, onDelete }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-3xl overflow-hidden flex flex-col">
      <div className="h-[100px] px-4 pt-4 pb-4 shrink-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Test</p>
        <p className="text-sm font-bold text-gray-800 leading-snug line-clamp-1">{test.name}</p>
        <p className="min-h-[28px] text-[11px] text-gray-400 line-clamp-2 leading-snug mt-1">{test.description || " "}</p>
      </div>

      <div className="h-[52px] bg-gray-900 px-4 grid grid-cols-3 items-center gap-2 shrink-0">
        <button type="button" onClick={onEdit} aria-label="Savollar" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
          <Pencil size={17} />
        </button>
        <button type="button" onClick={onSettings} aria-label="Sozlamalar" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
          <Settings2 size={17} />
        </button>
        <button type="button" onClick={onDelete} aria-label="O'chirish" className="h-9 w-full inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-red-400 transition-colors">
          <Trash2 size={17} />
        </button>
      </div>

      <div className="px-4 py-3 flex flex-1 flex-col gap-2 min-h-0">
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Clock size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.timeLimit ? `${test.timeLimit} daqiqa` : "Vaqt cheklanmagan"}</span>
        </div>
        <div className="flex h-4 items-center gap-2 text-xs text-gray-600">
          <Shuffle size={13} className="text-gray-400 shrink-0" />
          <span className="truncate">{test.shuffleQuestions ? "Savollar aralashtiriladi" : "Savollar tartibli"}</span>
        </div>
        {test.slug ? (
          <button onClick={copyLink} className="flex h-4 items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors text-left">
            {copied ? <Check size={13} className="shrink-0" /> : <Link2 size={13} className="shrink-0" />}
            <span className="truncate">{copied ? "Nusxalandi!" : "Havola nusxalash"}</span>
          </button>
        ) : (
          <div className="flex h-4 items-center gap-2 text-xs text-gray-300">
            <Link2 size={13} className="shrink-0" />
            <span className="truncate">Havola yo'q</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `StudentTestSettingsModal.tsx`**

```tsx
// apps/frontend/src/components/StudentTestSettingsModal.tsx
import { useState } from "react";
import type { CreateStudentTestData } from "../api/student-tests";

interface Props {
  folderId: string;
  onSubmit: (data: CreateStudentTestData) => void;
  onClose: () => void;
  initial?: Partial<CreateStudentTestData>;
  title?: string;
}

export function StudentTestSettingsModal({ folderId, onSubmit, onClose, initial, title = "Yangi test" }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [hasTimeLimit, setHasTimeLimit] = useState(!!initial?.timeLimit);
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimit ?? 30);
  const [showResults, setShowResults] = useState(initial?.showResults ?? "immediately");
  const isPerQuestion = showResults === "per_question";
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? false);
  const [oneByOne, setOneByOne] = useState(initial?.oneByOne ?? false);
  const [autoCompleteOnLeave, setAutoCompleteOnLeave] = useState(initial?.autoCompleteOnLeave ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      folderId,
      name: name.trim(),
      description: description.trim() || undefined,
      timeLimit: hasTimeLimit ? timeLimit : undefined,
      showResults,
      shuffleQuestions,
      shuffleOptions,
      oneByOne,
      autoCompleteOnLeave,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="font-semibold text-gray-800 mb-4 text-lg">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Test nomi *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="masalan: Matematika"
              className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tavsif</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Ixtiyoriy tavsif"
              className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="hasTimeLimit" checked={hasTimeLimit} onChange={(e) => setHasTimeLimit(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="hasTimeLimit" className="text-sm text-gray-700">Vaqt chegarasi</label>
            {hasTimeLimit && (
              <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-gray-50 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-400" />
            )}
            {hasTimeLimit && <span className="text-sm text-gray-500">daqiqa</span>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Natijalarni ko'rsatish</label>
            <select
              value={showResults}
              onChange={(e) => {
                const v = e.target.value as "immediately" | "after_deadline" | "hidden" | "per_question";
                setShowResults(v);
                if (v === "per_question") setOneByOne(true);
              }}
              className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="immediately">Topshirilgandan keyin darhol</option>
              <option value="per_question">Har bir savolda javobni ko'rsat (birin-ketin)</option>
              <option value="hidden">Ko'rsatilmasin</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-3 text-sm cursor-pointer ${isPerQuestion ? "text-gray-400" : "text-gray-700"}`}>
              <input type="checkbox" checked={oneByOne} disabled={isPerQuestion} onChange={(e) => setOneByOne(e.target.checked)} className="w-4 h-4" />
              Savollarni birin-ketin ko'rsatish{isPerQuestion && " (avtomatik)"}
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4" />
              Savollar tartibini aralashtirish
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4" />
              Javob variantlarini aralashtirish
            </label>
            <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={autoCompleteOnLeave} onChange={(e) => setAutoCompleteOnLeave(e.target.checked)} className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Testdan chiqilganda avtomatik yakunlash
                <span className="block mt-0.5 text-xs leading-5 text-gray-400">
                  Boshqa ilova yoki brauzer oynasiga o'tilsa, test avtomatik topshiriladi.
                </span>
              </span>
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Bekor qilish</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              {title === "Yangi test" ? "Yaratish va savollar qo'shish" : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Note: `after_deadline` option is omitted from the select since deadlines don't exist for student tests.

- [ ] **Step 3: Write `MyTestFolderViewPage.tsx`**

```tsx
// apps/frontend/src/pages/MyTestFolderViewPage.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentTestCard } from "../components/StudentTestCard";
import { StudentTestSettingsModal } from "../components/StudentTestSettingsModal";
import {
  apiFetchStudentTests,
  apiCreateStudentTest,
  apiUpdateStudentTest,
  apiDeleteStudentTest,
  apiFetchStudentFolders,
  type StudentTest,
  type CreateStudentTestData,
  type StudentFolder,
} from "../api/student-tests";

export function MyTestFolderViewPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tests, setTests] = useState<StudentTest[] | null>(null);
  const [folder, setFolder] = useState<StudentFolder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTest, setEditTest] = useState<StudentTest | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentTest | null>(null);

  async function load() {
    if (!folderId) return;
    try {
      const [testList, folders] = await Promise.all([
        apiFetchStudentTests(folderId),
        apiFetchStudentFolders(),
      ]);
      setTests(testList);
      setFolder(folders.find((f) => f.id === folderId) ?? null);
    } catch {
      toast.error("Testlarni yuklab bo'lmadi");
      setTests([]);
    }
  }

  useEffect(() => { void load(); }, [folderId]);

  async function handleCreate(data: CreateStudentTestData) {
    try {
      const test = await apiCreateStudentTest(data);
      setShowCreate(false);
      navigate(`/my-tests/tests/${test.id}/edit`);
    } catch {
      toast.error("Test yaratib bo'lmadi");
    }
  }

  async function handleUpdate(data: CreateStudentTestData) {
    if (!editTest) return;
    try {
      await apiUpdateStudentTest(editTest.id, data);
      setEditTest(null);
      void load();
    } catch {
      toast.error("Testni yangilab bo'lmadi");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await apiDeleteStudentTest(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch {
      toast.error("Testni o'chirib bo'lmadi");
    }
  }

  if (!folderId) return null;

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/my-tests")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Papkalar
        </button>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-gray-900">{folder?.name ?? "Papka"}</h1>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            <Plus size={16} /> Yangi test
          </button>
        </div>

        {!tests ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : tests.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali testlar yo'q. Yangisini yarating!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5 items-start">
            {tests.map((test) => (
              <StudentTestCard
                key={test.id}
                test={test}
                onEdit={() => navigate(`/my-tests/tests/${test.id}/edit`)}
                onSettings={() => setEditTest(test)}
                onDelete={() => setConfirmDelete(test)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && folderId && (
        <StudentTestSettingsModal folderId={folderId} title="Yangi test" onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTest && folderId && (
        <StudentTestSettingsModal
          folderId={folderId}
          title="Test sozlamalari"
          initial={{
            name: editTest.name,
            description: editTest.description ?? undefined,
            timeLimit: editTest.timeLimit ?? undefined,
            showResults: editTest.showResults,
            shuffleQuestions: editTest.shuffleQuestions,
            shuffleOptions: editTest.shuffleOptions,
            oneByOne: editTest.oneByOne,
            autoCompleteOnLeave: editTest.autoCompleteOnLeave,
          }}
          onSubmit={handleUpdate}
          onClose={() => setEditTest(null)}
        />
      )}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl pointer-events-auto">
              <p className="mb-1 text-sm font-medium text-gray-700">Testni o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{confirmDelete.name}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Bekor qilish
                </button>
                <button onClick={() => void handleDelete()} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </StudentShell>
  );
}
```

Note: question-editing (`/my-tests/tests/:id/edit`) is intentionally out of scope for this task — Task 7 builds that page. Navigating there before Task 7 lands will 404 in dev; that's expected and resolved by the next task.

- [ ] **Step 4: Register the route in `App.tsx`**

```tsx
const MyTestFolderViewPage = lazy(() =>
  import("./pages/MyTestFolderViewPage").then((m) => ({ default: m.MyTestFolderViewPage })),
);
```

```tsx
  {
    path: "/my-tests/:id",
    element: (
      <PrivateRoute>
        <MyTestFolderViewPage />
      </PrivateRoute>
    ),
  },
```

- [ ] **Step 5: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/MyTestFolderViewPage.tsx apps/frontend/src/components/StudentTestCard.tsx apps/frontend/src/components/StudentTestSettingsModal.tsx apps/frontend/src/App.tsx
git commit -m "feat: add Mening testlarim folder view with simplified test card/settings"
```

---

### Task 7: Add student question editor page (reuses existing question-editing UI patterns)

**Files:**
- Read first: `apps/frontend/src/pages/QuestionEditorPage.tsx` (existing teacher question editor — inspect its structure before writing this task's file, since it is the direct template)
- Create: `apps/frontend/src/pages/MyTestQuestionEditorPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiGetStudentTest`, `StudentTestDetail` from Task 4; a new question CRUD API client (to add below) hitting `me/tests/:testId/questions`, `me/questions/:id`.
- Produces: `MyTestQuestionEditorPage` at route `/my-tests/tests/:id/edit`.

This task's exact implementation depends on reading `QuestionEditorPage.tsx` first, since it's a substantial existing file (question type editors for 10 question types) that this task adapts by swapping the API calls to the `me/`-prefixed student endpoints and removing any teacher-only affordances (if the existing page has none beyond the API calls, no UI changes are needed — only the data layer changes).

- [ ] **Step 1: Read the existing teacher question editor to confirm its API surface**

Run: `cat apps/frontend/src/pages/QuestionEditorPage.tsx | head -80` and note which functions from `apps/frontend/src/api/questions.ts` and `apps/frontend/src/api/tests.ts` it imports and calls (e.g. `apiGetTest`, `apiAddQuestion`, `apiBulkImportQuestions`, `apiUpdateQuestion`, `apiReplaceQuestion`, `apiRemoveQuestion`).

- [ ] **Step 2: Add matching student-scoped question API functions to `student-tests.ts`**

Append to `apps/frontend/src/api/student-tests.ts` (from Task 4), mirroring whatever function signatures Step 1 found in `apps/frontend/src/api/questions.ts`, but pointed at `me/tests/:testId/questions` and `me/questions/:id`:

```ts
export async function apiAddStudentQuestion(testId: string, data: import('./questions').CreateQuestionData): Promise<import('./questions').Question> {
  const res = await client.post(`/me/tests/${testId}/questions`, data);
  return res.data;
}

export async function apiUpdateStudentQuestion(id: string, data: Partial<import('./questions').CreateQuestionData>): Promise<import('./questions').Question> {
  const res = await client.patch(`/me/questions/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentQuestion(id: string): Promise<void> {
  await client.delete(`/me/questions/${id}`);
}
```

Adjust type names to match exactly what Step 1 discovered in `apps/frontend/src/api/questions.ts` — this plan cannot predict the exact exported type name without reading the file first, which Step 1 does.

- [ ] **Step 3: Copy `QuestionEditorPage.tsx` to `MyTestQuestionEditorPage.tsx` and retarget its API calls**

Copy the full file content of `apps/frontend/src/pages/QuestionEditorPage.tsx` into the new file, rename the exported component to `MyTestQuestionEditorPage`, and replace every import from `../api/tests` / `../api/questions` with the equivalent from `../api/student-tests` (using the functions added in Step 2 and `apiGetStudentTest`/`StudentTestDetail` from Task 4). Replace `AppShell` wrapper (if used) with `StudentShell` from `../components/student/StudentShell`, and replace any back-navigation target (e.g. `navigate('/')` or `navigate(`/folders/${folderId}`)`) with `navigate(`/my-tests/${test.folderId}`)`.

- [ ] **Step 4: Register the route in `App.tsx`**

```tsx
const MyTestQuestionEditorPage = lazy(() =>
  import("./pages/MyTestQuestionEditorPage").then((m) => ({ default: m.MyTestQuestionEditorPage })),
);
```

```tsx
  {
    path: "/my-tests/tests/:id/edit",
    element: (
      <PrivateRoute>
        <MyTestQuestionEditorPage />
      </PrivateRoute>
    ),
  },
```

- [ ] **Step 5: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Manually verify the full create-to-share flow in browser**

Log in as a student, go to `/my-tests`, create a folder, create a test inside it, add at least one question with a correct answer, copy the share link, open it in an incognito/private window, log in as a different user, confirm the test loads and can be submitted, confirm submitting a second time (as the same second user) is allowed (cheksiz marta — no once-only block).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/MyTestQuestionEditorPage.tsx apps/frontend/src/api/student-tests.ts apps/frontend/src/App.tsx
git commit -m "feat: add student question editor for Mening testlarim"
```

---

## Part C: Mening lug'atlarim (backend)

### Task 8: Add `wordDecks`/`deckWords` schema and migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`

**Interfaces:**
- Produces: `wordDecks` table (`id`, `ownerId` FK to `users`, `name`, `slug` unique, `createdAt`), `deckWords` table (`id`, `deckId` FK to `wordDecks` cascade, `word`, `translation`, `orderIndex`, `createdAt`), and their `relations()` exports — consumed by Tasks 9-10.

- [ ] **Step 1: Add the table definitions to `schema.ts`**

Add near the `challengeWords`/`challengeWordProgress` definitions (end of file), after the existing `challengeWordProgressRelations` export:

```ts
export const wordDecks = pgTable('word_decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 8 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  ownerIdIdx: index('word_decks_owner_id_idx').on(table.ownerId),
}));

export const deckWords = pgTable('deck_words', {
  id: uuid('id').primaryKey().defaultRandom(),
  deckId: uuid('deck_id').notNull().references(() => wordDecks.id, { onDelete: 'cascade' }),
  word: text('word').notNull(),
  translation: text('translation').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  deckIdIdx: index('deck_words_deck_id_idx').on(table.deckId),
}));

export const wordDecksRelations = relations(wordDecks, ({ one, many }) => ({
  owner: one(users, { fields: [wordDecks.ownerId], references: [users.id] }),
  words: many(deckWords),
}));

export const deckWordsRelations = relations(deckWords, ({ one }) => ({
  deck: one(wordDecks, { fields: [deckWords.deckId], references: [wordDecks.id] }),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/backend && pnpm db:generate`
Expected: a new numbered SQL file appears in `apps/backend/drizzle/migrations/` creating `word_decks` and `deck_words` tables. Inspect the generated SQL file to confirm it only adds these two tables and their indexes/FKs — no unrelated changes.

- [ ] **Step 3: Apply the migration**

Run: `cd apps/backend && pnpm db:migrate`
Expected: migration applies cleanly against the local `DATABASE_URL`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations
git commit -m "feat: add wordDecks/deckWords schema for Mening lug'atlarim"
```

---

### Task 9: Add word-deck backend module (owner CRUD + bulk import, reusing the exact bulk-parser logic)

**Files:**
- Create: `apps/backend/src/word-decks/word-decks.module.ts`
- Create: `apps/backend/src/word-decks/word-decks.controller.ts`
- Create: `apps/backend/src/word-decks/word-decks.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/word-decks/word-decks.service.spec.ts`

**Interfaces:**
- Consumes: `wordDecks`, `deckWords` tables from Task 8.
- Produces: `WordDecksService` with `findAll(ownerId)`, `create(ownerId, name)`, `update(id, ownerId, data: { name?: string })`, `remove(id, ownerId)`, `listWords(deckId, ownerId)`, `addWord(deckId, ownerId, data)`, `bulkImport(deckId, ownerId, text)` (exact same parser logic as `ChallengeWordsService.bulkImport`), `updateWord(deckId, wordId, ownerId, data)`, `removeWord(deckId, wordId, ownerId)`. Route prefix `me/word-decks`, `@Roles('student')`.

- [ ] **Step 1: Write the failing test for bulk-import parsing parity**

```ts
// apps/backend/src/word-decks/word-decks.service.spec.ts
import { WordDecksService } from './word-decks.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      wordDecks: { findFirst: jest.fn(), findMany: jest.fn() },
      deckWords: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('WordDecksService.bulkImport', () => {
  const service = new WordDecksService();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue({ id: 'deck-1', ownerId: 'student-1' });
    (db.query.deckWords.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('parses "word - translation" lines and skips malformed ones', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({ values });

    const result = await service.bulkImport('deck-1', 'student-1', 'apple - olma\nbook - kitob\nmalformed line\n\n');

    expect(result).toEqual({ added: 2, skipped: 1 });
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ deckId: 'deck-1', word: 'apple', translation: 'olma', orderIndex: 0 }),
      expect.objectContaining({ deckId: 'deck-1', word: 'book', translation: 'kitob', orderIndex: 1 }),
    ]);
  });

  it('rejects import into a deck not owned by the caller', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.bulkImport('deck-1', 'student-1', 'apple - olma')).rejects.toThrow('Deck not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest word-decks.service.spec.ts`
Expected: FAIL with "Cannot find module './word-decks.service'"

- [ ] **Step 3: Write `word-decks.service.ts`**

```ts
// apps/backend/src/word-decks/word-decks.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { wordDecks, deckWords } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateSlug(): string {
  return Array.from({ length: 8 }, () => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]).join('');
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    const existing = await db.query.wordDecks.findFirst({ where: eq(wordDecks.slug, slug) });
    if (!existing) return slug;
  }
  throw new Error('Could not generate unique slug');
}

@Injectable()
export class WordDecksService {
  private async assertDeckOwnership(deckId: string, ownerId: string) {
    const deck = await db.query.wordDecks.findFirst({
      where: and(eq(wordDecks.id, deckId), eq(wordDecks.ownerId, ownerId)),
    });
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  private async assertWordOwnership(deckId: string, wordId: string, ownerId: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    const word = await db.query.deckWords.findFirst({
      where: and(eq(deckWords.id, wordId), eq(deckWords.deckId, deckId)),
    });
    if (!word) throw new NotFoundException('Word not found');
    return word;
  }

  async findAll(ownerId: string) {
    return db.query.wordDecks.findMany({
      where: eq(wordDecks.ownerId, ownerId),
      orderBy: (d, { asc }) => [asc(d.createdAt)],
    });
  }

  async create(ownerId: string, name: string) {
    const slug = await uniqueSlug();
    const [deck] = await db.insert(wordDecks).values({ ownerId, name, slug }).returning();
    return deck;
  }

  async update(id: string, ownerId: string, data: { name?: string }) {
    const [deck] = await db.update(wordDecks)
      .set(data)
      .where(and(eq(wordDecks.id, id), eq(wordDecks.ownerId, ownerId)))
      .returning();
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  async remove(id: string, ownerId: string) {
    const result = await db.delete(wordDecks)
      .where(and(eq(wordDecks.id, id), eq(wordDecks.ownerId, ownerId)))
      .returning({ id: wordDecks.id });
    if (!result.length) throw new NotFoundException('Deck not found');
  }

  async listWords(deckId: string, ownerId: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    return db.query.deckWords.findMany({
      where: eq(deckWords.deckId, deckId),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
  }

  async addWord(deckId: string, ownerId: string, data: { word: string; translation: string }) {
    await this.assertDeckOwnership(deckId, ownerId);
    const existing = await db.query.deckWords.findMany({ where: eq(deckWords.deckId, deckId) });
    const [word] = await db.insert(deckWords).values({
      deckId,
      word: data.word.trim(),
      translation: data.translation.trim(),
      orderIndex: existing.length,
    }).returning();
    return word;
  }

  async bulkImport(deckId: string, ownerId: string, text: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    const existing = await db.query.deckWords.findMany({ where: eq(deckWords.deckId, deckId) });
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const values: Array<{ deckId: string; word: string; translation: string; orderIndex: number }> = [];
    let skipped = 0;

    for (const line of lines) {
      const separatorIndex = line.indexOf(' - ');
      const word = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : '';
      const translation = separatorIndex >= 0 ? line.slice(separatorIndex + 3).trim() : '';
      if (!word || !translation) {
        skipped += 1;
        continue;
      }
      values.push({ deckId, word, translation, orderIndex: existing.length + values.length });
    }

    if (values.length > 0) await db.insert(deckWords).values(values);
    return { added: values.length, skipped };
  }

  async updateWord(deckId: string, wordId: string, ownerId: string, data: Partial<{ word: string; translation: string }>) {
    await this.assertWordOwnership(deckId, wordId, ownerId);
    const update: Partial<{ word: string; translation: string }> = {};
    if (data.word !== undefined) update.word = data.word.trim();
    if (data.translation !== undefined) update.translation = data.translation.trim();
    if (Object.keys(update).length === 0) throw new BadRequestException('No fields to update');
    const [word] = await db.update(deckWords).set(update).where(eq(deckWords.id, wordId)).returning();
    return word;
  }

  async removeWord(deckId: string, wordId: string, ownerId: string) {
    await this.assertWordOwnership(deckId, wordId, ownerId);
    await db.delete(deckWords).where(eq(deckWords.id, wordId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest word-decks.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `word-decks.controller.ts`**

```ts
// apps/backend/src/word-decks/word-decks.controller.ts
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { WordDecksService } from './word-decks.service';

class CreateDeckDto {
  @IsString() @MinLength(1) name: string;
}

class UpdateDeckDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
}

class AddWordDto {
  @IsString() @MinLength(1) word: string;
  @IsString() @MinLength(1) translation: string;
}

class UpdateWordDto {
  @IsOptional() @IsString() @MinLength(1) word?: string;
  @IsOptional() @IsString() @MinLength(1) translation?: string;
}

class BulkImportDto {
  @IsString() @MaxLength(100_000) text: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/word-decks')
export class WordDecksController {
  constructor(private readonly wordDecksService: WordDecksService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.wordDecksService.findAll(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateDeckDto) {
    return this.wordDecksService.create(req.user.id, dto.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateDeckDto) {
    return this.wordDecksService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.wordDecksService.remove(id, req.user.id);
  }

  @Get(':id/words')
  listWords(@Param('id') id: string, @Req() req: any) {
    return this.wordDecksService.listWords(id, req.user.id);
  }

  @Post(':id/words')
  addWord(@Param('id') id: string, @Req() req: any, @Body() dto: AddWordDto) {
    return this.wordDecksService.addWord(id, req.user.id, dto);
  }

  @Post(':id/words/bulk')
  bulkImport(@Param('id') id: string, @Req() req: any, @Body() dto: BulkImportDto) {
    return this.wordDecksService.bulkImport(id, req.user.id, dto.text);
  }

  @Patch(':id/words/:wordId')
  updateWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any, @Body() dto: UpdateWordDto) {
    return this.wordDecksService.updateWord(id, wordId, req.user.id, dto);
  }

  @Delete(':id/words/:wordId')
  @HttpCode(204)
  removeWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any) {
    return this.wordDecksService.removeWord(id, wordId, req.user.id);
  }
}
```

- [ ] **Step 6: Create the module and register it in `app.module.ts`**

```ts
// apps/backend/src/word-decks/word-decks.module.ts
import { Module } from '@nestjs/common';
import { WordDecksController } from './word-decks.controller';
import { WordDecksService } from './word-decks.service';

@Module({
  controllers: [WordDecksController],
  providers: [WordDecksService],
})
export class WordDecksModule {}
```

In `apps/backend/src/app.module.ts`, add `import { WordDecksModule } from './word-decks/word-decks.module';` and add `WordDecksModule` to the `imports` array.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/word-decks apps/backend/src/app.module.ts
git commit -m "feat: add word-deck owner CRUD backend module for Mening lug'atlarim"
```

---

### Task 10: Add public deck-viewing endpoint (auth required, no ownership check, no progress writes)

**Files:**
- Create: `apps/backend/src/word-decks/deck-view.controller.ts`
- Modify: `apps/backend/src/word-decks/word-decks.service.ts`
- Modify: `apps/backend/src/word-decks/word-decks.module.ts`
- Test: `apps/backend/src/word-decks/deck-view.controller.spec.ts` — actually, per this codebase's convention, controller behavior is tested at the service level (`.service.spec.ts` files, not `.controller.spec.ts` — no controller spec files exist anywhere in the 28 backend spec files found), so this task tests the added service method directly.
- Test: `apps/backend/src/word-decks/word-decks.service.spec.ts` (extend, not new file)

**Interfaces:**
- Produces: `WordDecksService.findBySlug(slug: string)` → returns `{ id, name, words: [{ id, word, translation }] }` or throws `NotFoundException`, with **no ownership check** (any authenticated user may call it) and **no `known` field** on words (progress is never computed or stored).
- Produces: `DeckViewController` at route `decks/:slug`, guarded only by `JwtAuthGuard` (no `@Roles`, so any authenticated role — student or teacher — may view a shared deck link, matching the spec's "login qilgan userlar" requirement without a role restriction).

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/word-decks/word-decks.service.spec.ts`:

```ts
describe('WordDecksService.findBySlug', () => {
  const service = new WordDecksService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns deck words for any valid slug regardless of caller identity', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue({ id: 'deck-1', name: 'Ingliz tili', slug: 'AbCd1234' });
    (db.query.deckWords.findMany as jest.Mock).mockResolvedValue([
      { id: 'w-1', word: 'apple', translation: 'olma', orderIndex: 0 },
    ]);

    const result = await service.findBySlug('AbCd1234');

    expect(result.name).toBe('Ingliz tili');
    expect(result.words).toEqual([{ id: 'w-1', word: 'apple', translation: 'olma' }]);
  });

  it('throws NotFoundException for an unknown slug', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.findBySlug('unknown0')).rejects.toThrow('Deck not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest word-decks.service.spec.ts`
Expected: FAIL with "service.findBySlug is not a function"

- [ ] **Step 3: Add `findBySlug` to `word-decks.service.ts`**

Add this method to the `WordDecksService` class from Task 9:

```ts
  async findBySlug(slug: string) {
    const deck = await db.query.wordDecks.findFirst({ where: eq(wordDecks.slug, slug) });
    if (!deck) throw new NotFoundException('Deck not found');
    const words = await db.query.deckWords.findMany({
      where: eq(deckWords.deckId, deck.id),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
    return {
      id: deck.id,
      name: deck.name,
      words: words.map((w) => ({ id: w.id, word: w.word, translation: w.translation })),
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest word-decks.service.spec.ts`
Expected: PASS (4 tests total in this file)

- [ ] **Step 5: Write `deck-view.controller.ts`**

```ts
// apps/backend/src/word-decks/deck-view.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WordDecksService } from './word-decks.service';

@UseGuards(JwtAuthGuard)
@Controller('decks')
export class DeckViewController {
  constructor(private readonly wordDecksService: WordDecksService) {}

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.wordDecksService.findBySlug(slug);
  }
}
```

- [ ] **Step 6: Register the new controller in the module**

```ts
// apps/backend/src/word-decks/word-decks.module.ts
import { Module } from '@nestjs/common';
import { WordDecksController } from './word-decks.controller';
import { DeckViewController } from './deck-view.controller';
import { WordDecksService } from './word-decks.service';

@Module({
  controllers: [WordDecksController, DeckViewController],
  providers: [WordDecksService],
})
export class WordDecksModule {}
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/word-decks
git commit -m "feat: add public auth-only deck-view endpoint for shared dictionary links"
```

---

## Part D: Mening lug'atlarim (frontend)

### Task 11: Add frontend API client for word decks

**Files:**
- Create: `apps/frontend/src/api/word-decks.ts`

**Interfaces:**
- Produces: `WordDeck`, `DeckWord`, `DeckView` types; `apiFetchWordDecks()`, `apiCreateWordDeck(name)`, `apiUpdateWordDeck(id, name)`, `apiDeleteWordDeck(id)`, `apiListDeckWords(deckId)`, `apiAddDeckWord(deckId, data)`, `apiBulkImportDeckWords(deckId, text)`, `apiDeleteDeckWord(deckId, wordId)`, `apiGetDeckBySlug(slug)`.

- [ ] **Step 1: Write `word-decks.ts`**

```ts
// apps/frontend/src/api/word-decks.ts
import client from './client';

export interface WordDeck {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface DeckWord {
  id: string;
  deckId: string;
  word: string;
  translation: string;
  orderIndex: number;
}

export interface DeckView {
  id: string;
  name: string;
  words: Array<{ id: string; word: string; translation: string }>;
}

export async function apiFetchWordDecks(): Promise<WordDeck[]> {
  return (await client.get('/me/word-decks')).data;
}

export async function apiCreateWordDeck(name: string): Promise<WordDeck> {
  return (await client.post('/me/word-decks', { name })).data;
}

export async function apiUpdateWordDeck(id: string, name: string): Promise<WordDeck> {
  return (await client.patch(`/me/word-decks/${id}`, { name })).data;
}

export async function apiDeleteWordDeck(id: string): Promise<void> {
  await client.delete(`/me/word-decks/${id}`);
}

export async function apiListDeckWords(deckId: string): Promise<DeckWord[]> {
  return (await client.get(`/me/word-decks/${deckId}/words`)).data;
}

export async function apiAddDeckWord(deckId: string, data: { word: string; translation: string }): Promise<DeckWord> {
  return (await client.post(`/me/word-decks/${deckId}/words`, data)).data;
}

export async function apiBulkImportDeckWords(deckId: string, text: string): Promise<{ added: number; skipped: number }> {
  return (await client.post(`/me/word-decks/${deckId}/words/bulk`, { text })).data;
}

export async function apiDeleteDeckWord(deckId: string, wordId: string): Promise<void> {
  await client.delete(`/me/word-decks/${deckId}/words/${wordId}`);
}

export async function apiGetDeckBySlug(slug: string): Promise<DeckView> {
  return (await client.get(`/decks/${slug}`)).data;
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/word-decks.ts
git commit -m "feat: add frontend API client for Mening lug'atlarim"
```

---

### Task 12: Add "Mening lug'atlarim" deck list + deck detail (word management) pages

**Files:**
- Create: `apps/frontend/src/pages/MyDictionariesPage.tsx`
- Create: `apps/frontend/src/pages/WordDeckViewPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: all functions from `apps/frontend/src/api/word-decks.ts` (Task 11).
- Produces: `MyDictionariesPage` at `/my-dictionaries` (deck grid, create/rename/delete deck), `WordDeckViewPage` at `/my-dictionaries/:id` (word list + add-one-by-one form + bulk-import modal, adapted directly from `CourseChallengeWordsPanel.tsx`, plus a share-link copy button).

- [ ] **Step 1: Write `MyDictionariesPage.tsx`**

```tsx
// apps/frontend/src/pages/MyDictionariesPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Pencil, Languages } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiFetchWordDecks,
  apiCreateWordDeck,
  apiUpdateWordDeck,
  apiDeleteWordDeck,
  type WordDeck,
} from "../api/word-decks";

export function MyDictionariesPage() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<WordDeck[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editDeck, setEditDeck] = useState<WordDeck | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<WordDeck | null>(null);

  async function load() {
    try {
      setDecks(await apiFetchWordDecks());
    } catch {
      toast.error("Lug'atlarni yuklab bo'lmadi");
      setDecks([]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await apiCreateWordDeck(newName.trim());
      setNewName("");
      void load();
    } catch {
      toast.error("Lug'at yaratib bo'lmadi");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!editDeck || !editName.trim()) return;
    try {
      await apiUpdateWordDeck(editDeck.id, editName.trim());
      setEditDeck(null);
      void load();
    } catch {
      toast.error("Lug'atni yangilab bo'lmadi");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await apiDeleteWordDeck(confirmDelete.id);
      setConfirmDelete(null);
      void load();
    } catch {
      toast.error("Lug'atni o'chirib bo'lmadi");
    }
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/jamm")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Orqaga
        </button>
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Mening lug'atlarim</h1>
        <p className="mb-6 text-sm text-gray-400">So'z-tarjima lug'atlaringizni tuzing va ulashing</p>

        <div className="mb-6 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Yangi lug'at nomi"
            className="flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
          />
          <button
            type="button"
            disabled={!newName.trim() || creating}
            onClick={() => void handleCreate()}
            className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200"
          >
            <Plus size={16} /> Yaratish
          </button>
        </div>

        {!decks ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : decks.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Hali lug'at yo'q. Yangisini yarating!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                onClick={() => navigate(`/my-dictionaries/${deck.id}`)}
                className="group relative flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-4 hover:bg-gray-50"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500">
                  <Languages size={18} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{deck.name}</p>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditDeck(deck); setEditName(deck.name); }}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(deck); }}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && setEditDeck(null)}>
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 font-semibold text-gray-800">Lug'atni tahrirlash</h2>
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditDeck(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Bekor qilish</button>
              <button onClick={() => void handleRename()} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600">Saqlash</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl pointer-events-auto">
              <p className="mb-1 text-sm font-medium text-gray-700">Lug'atni o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{confirmDelete.name}" o'chirilsinmi? Ichidagi barcha so'zlar ham o'chadi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Bekor qilish</button>
                <button onClick={() => void handleDelete()} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">O'chirish</button>
              </div>
            </div>
          </div>
        </>
      )}
    </StudentShell>
  );
}
```

- [ ] **Step 2: Write `WordDeckViewPage.tsx`**

```tsx
// apps/frontend/src/pages/WordDeckViewPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Link2, Trash2, Upload, X } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiListDeckWords,
  apiAddDeckWord,
  apiBulkImportDeckWords,
  apiDeleteDeckWord,
  apiFetchWordDecks,
  type DeckWord,
  type WordDeck,
} from "../api/word-decks";

export function WordDeckViewPage() {
  const { id: deckId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<WordDeck | null>(null);
  const [words, setWords] = useState<DeckWord[] | null>(null);
  const [newWord, setNewWord] = useState("");
  const [newTranslation, setNewTranslation] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!deckId) return;
    try {
      const [wordList, decks] = await Promise.all([apiListDeckWords(deckId), apiFetchWordDecks()]);
      setWords(wordList);
      setDeck(decks.find((d) => d.id === deckId) ?? null);
    } catch {
      toast.error("So'zlarni yuklab bo'lmadi");
      setWords([]);
    }
  }, [deckId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!deckId || !newWord.trim() || !newTranslation.trim() || saving) return;
    setSaving(true);
    try {
      const added = await apiAddDeckWord(deckId, { word: newWord.trim(), translation: newTranslation.trim() });
      setWords((current) => [...(current ?? []), added]);
      setNewWord("");
      setNewTranslation("");
    } catch {
      toast.error("So'z qo'shib bo'lmadi");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wordId: string) {
    if (!deckId) return;
    try {
      await apiDeleteDeckWord(deckId, wordId);
      setWords((current) => current?.filter((w) => w.id !== wordId) ?? []);
    } catch {
      toast.error("So'zni o'chirib bo'lmadi");
    }
  }

  async function copyLink() {
    if (!deck) return;
    await navigator.clipboard.writeText(`${window.location.origin}/d/${deck.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!deckId) return null;

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          type="button"
          onClick={() => navigate("/my-dictionaries")}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Lug'atlar
        </button>
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-gray-900">{deck?.name ?? "Lug'at"}</h1>
          {deck && (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200"
            >
              {copied ? <Check size={14} /> : <Link2 size={14} />}
              {copied ? "Nusxalandi!" : "Havola nusxalash"}
            </button>
          )}
        </div>

        {!words ? (
          <p className="py-16 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : (
          <div className="rounded-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-gray-800">So'zlar</h3>
              <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200">
                <Upload size={14} /> Ommaviy import
              </button>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="So'z" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
              <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder="Tarjima" className="rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none" />
              <button type="button" disabled={!newWord.trim() || !newTranslation.trim() || saving} onClick={() => void handleAdd()} className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200">
                Qo'shish
              </button>
            </div>
            {words.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-300">Hali so'z yo'q</p>
            ) : (
              <div className="flex flex-col gap-2">
                {words.map((word) => (
                  <div key={word.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5">
                    <span className="truncate text-sm font-semibold text-gray-800">{word.word}</span>
                    <span className="truncate text-sm text-gray-500">{word.translation}</span>
                    <button type="button" onClick={() => void handleDelete(word.id)} aria-label="So'zni o'chirish" className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {importOpen && deckId && (
        <BulkImportModal deckId={deckId} onClose={() => setImportOpen(false)} onImported={() => void load()} />
      )}
    </StudentShell>
  );
}

function BulkImportModal({ deckId, onClose, onImported }: { deckId: string; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  async function submit() {
    if (!text.trim() || importing) return;
    setImporting(true);
    try {
      const result = await apiBulkImportDeckWords(deckId, text);
      toast.success(`${result.added} ta qo'shildi, ${result.skipped} ta o'tkazib yuborildi`);
      onImported();
      onClose();
    } catch {
      toast.error("Import qilib bo'lmadi");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Ommaviy import</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-gray-400">Har qatorda: <code>so'z - tarjima</code></p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={"apple - olma\nbook - kitob"} className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none" />
        <button type="button" disabled={!text.trim() || importing} onClick={() => void submit()} className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:bg-gray-200">
          Import qilish
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register both routes in `App.tsx`**

```tsx
const MyDictionariesPage = lazy(() =>
  import("./pages/MyDictionariesPage").then((m) => ({ default: m.MyDictionariesPage })),
);
const WordDeckViewPage = lazy(() =>
  import("./pages/WordDeckViewPage").then((m) => ({ default: m.WordDeckViewPage })),
);
```

```tsx
  {
    path: "/my-dictionaries",
    element: (
      <PrivateRoute>
        <MyDictionariesPage />
      </PrivateRoute>
    ),
  },
  {
    path: "/my-dictionaries/:id",
    element: (
      <PrivateRoute>
        <WordDeckViewPage />
      </PrivateRoute>
    ),
  },
```

- [ ] **Step 4: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manually verify in browser**

Log in as a student, navigate `/jamm` → "Mening lug'atlarim", create a deck, add a word via the one-by-one form, add more via bulk import (`apple - olma`), confirm the word list updates, click "Havola nusxalash" and check the clipboard contains a `/d/:slug` URL.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/MyDictionariesPage.tsx apps/frontend/src/pages/WordDeckViewPage.tsx apps/frontend/src/App.tsx
git commit -m "feat: add Mening lug'atlarim deck list and word management pages"
```

---

### Task 13: Add deck practice page (flashcard/test UX, no server-side progress)

**Files:**
- Create: `apps/frontend/src/pages/DeckPracticePage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `apiGetDeckBySlug`, `DeckView` from Task 11; `SegmentedControl` from `apps/frontend/src/components/student/SegmentedControl.tsx`; `StudentShell`.
- Produces: `DeckPracticePage` at route `/d/:slug`. Adapted directly from `ChallengeWordPracticePage.tsx` (Part of Task 13's Step 1 is diffing against that file), with these concrete changes: words are typed as `{ id: string; word: string; translation: string; known: boolean }` where `known` is **local-only state seeded to `false`** (never fetched from the server, since `DeckView.words` has no `known` field); `apiSetChallengeWordProgress` calls are deleted entirely — `commit(known)` in `Flashcards` and `checkAnswer()` in `Test` update local state synchronously with no network call and no rollback-on-failure logic (nothing can fail since nothing is sent); `resetDeck()` resets local state only, no `Promise.all` of API calls; the "So'z yodlash" header text becomes the deck's own name; back-navigation goes to `/my-dictionaries` (or just closes since this is a public link — see Step 1 note on entry point) instead of `/challanges/${id}`.

- [ ] **Step 1: Write `DeckPracticePage.tsx`**

```tsx
// apps/frontend/src/pages/DeckPracticePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Layers3,
  ListChecks,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { apiGetDeckBySlug } from "../api/word-decks";
import { StudentShell } from "../components/student/StudentShell";
import { SegmentedControl } from "../components/student/SegmentedControl";

type Mode = "flashcard" | "test";
type Direction = "wordToTranslation" | "translationToWord";
type PracticeWord = { id: string; word: string; translation: string; known: boolean };

export function DeckPracticePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [deckName, setDeckName] = useState("");
  const [words, setWords] = useState<PracticeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction>("wordToTranslation");

  useEffect(() => {
    if (!slug) return;
    void apiGetDeckBySlug(slug)
      .then((deck) => {
        setDeckName(deck.name);
        setWords(deck.words.map((w) => ({ ...w, known: false })));
      })
      .catch(() => toast.error("Lug'atni yuklab bo'lmadi"));
  }, [slug]);

  if (!slug) return null;
  if (!words) {
    return (
      <StudentShell>
        <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </StudentShell>
    );
  }

  if (!mode) {
    return (
      <StudentShell>
        <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
          <button
            type="button"
            onClick={() => navigate("/my-dictionaries")}
            className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-gray-500"
          >
            <ArrowLeft size={16} /> Orqaga
          </button>
          <h1 className="mb-1 text-2xl font-extrabold text-gray-900">{deckName}</h1>
          <p className="mb-6 text-sm text-gray-400">Rejim va yo'nalishni tanlang</p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Yo'nalish</p>
          <SegmentedControl
            value={direction}
            onChange={setDirection}
            className="mb-6"
            options={[
              { value: "wordToTranslation", label: "So'z" },
              { value: "translationToWord", label: "Tarjima" },
            ]}
          />
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Rejim</p>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Choice selected={mode === "flashcard"} onClick={() => setMode("flashcard")} icon={<Layers3 size={20} />} title="Flashcard" subtitle="Kartani suring" />
            <Choice selected={mode === "test"} onClick={() => setMode("test")} icon={<ListChecks size={20} />} title="Test" subtitle="4 variantli savol" />
          </div>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel min-h-[calc(100dvh-5rem)] px-4 py-5 text-gray-900 min-[1025px]:p-6 dark:text-white">
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={16} /> Rejim tanlash
        </button>
        {mode === "flashcard" ? (
          <Flashcards words={words} direction={direction} setWords={setWords} deckName={deckName} />
        ) : (
          <Test words={words} direction={direction} setWords={setWords} />
        )}
      </div>
    </StudentShell>
  );
}

function Choice({ selected, onClick, icon, title, subtitle }: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode; title: string; subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl p-4 text-left transition ${selected ? "bg-indigo-600 text-white shadow-sm" : "student-course-card text-gray-900 dark:text-zinc-100"}`}
    >
      <span className="mb-2 block">{icon}</span>
      <span className="block text-sm font-bold">{title}</span>
      {subtitle && <span className="mt-1 block text-xs opacity-60">{subtitle}</span>}
    </button>
  );
}

function Flashcards({ words, direction, setWords, deckName }: {
  words: PracticeWord[]; direction: Direction; setWords: (words: PracticeWord[]) => void; deckName: string;
}) {
  const [deck, setDeck] = useState(() => words.filter((word) => !word.known));
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"known" | "again" | null>(null);
  const startX = useRef(0);
  const current = deck[0];

  function commit(known: boolean) {
    if (!current || exiting) return;
    const swiped = current;
    setExiting(known ? "known" : "again");
    setWords(words.map((word) => (word.id === swiped.id ? { ...word, known } : word)));
    window.setTimeout(() => {
      setDeck((oldDeck) => {
        const rest = oldDeck.filter((word) => word.id !== swiped.id);
        return known ? rest : [...rest, { ...swiped, known: false }];
      });
      setDragX(0);
      setRevealed(false);
      setExiting(null);
    }, 320);
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    setDragging(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragging) setDragX(event.clientX - startX.current);
  }

  function pointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > 35) commit(dragX > 0);
    else setDragX(0);
  }

  function resetDeck() {
    const resetWords = words.map((word) => ({ ...word, known: false }));
    setWords(resetWords);
    setDeck(resetWords);
    setRevealed(false);
    setDragX(0);
    setExiting(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-2 text-center">
        <h1 className="text-[22px] font-extrabold tracking-[2px] text-gray-900 dark:text-zinc-200">✦ {deckName}</h1>
        <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">CHAPGA - TAKRORLASH · O'NGGA - BILAMAN</p>
      </div>
      <div className="mx-auto mb-6 mt-4 flex w-fit gap-7 text-center">
        <Stat label="TAKRORLASH" value={words.length} color="text-gray-500 dark:text-zinc-400" />
        <Stat label="QOLGAN" value={deck.length} color="text-violet-500 dark:text-violet-400" />
        <Stat label="BILAMAN" value={words.filter((word) => word.known).length} color="text-emerald-500 dark:text-emerald-400" />
      </div>
      {!current ? (
        <div className="py-20 text-center">
          <p className="text-2xl font-black">🎉 Tugadi!</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-500">Barcha so'zlar yodlandi</p>
        </div>
      ) : (
        <div className="relative mx-auto h-[340px] w-[280px] touch-none select-none">
          {deck.slice(1, 6).reverse().map((word, reverseIndex, stack) => {
            const depth = stack.length - reverseIndex;
            const uid = words.findIndex((item) => item.id === word.id);
            const seed = (uid * 137 + depth * 53) % 20;
            const opacity = depth <= 1 ? 1 : Math.max(1 - (depth - 1) * 0.16, 0.15);
            return (
              <div
                key={`stack-${word.id}-${depth}`}
                className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"
                style={{
                  transform: `translateY(${-depth * 6}px) scale(${1 - depth * 0.05}) rotate(${seed - 10}deg)`,
                  opacity,
                  zIndex: 100 - depth,
                  boxShadow: `0 ${20 - depth * 2}px ${60 - depth * 6}px rgba(15,23,42,0.16)`,
                  transition: "transform 350ms cubic-bezier(.34,1.56,.64,1), opacity 350ms",
                }}
              />
            );
          })}
          <div
            key={`top-${current.id}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onClick={() => !dragging && Math.abs(dragX) < 5 && setRevealed(true)}
            className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-gray-200 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-800 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{
              transform: exiting === "again"
                ? "translateX(0) translateY(90px) scale(0.6)"
                : exiting === "known"
                  ? "translateX(560px) rotate(20deg)"
                  : `translateX(${dragX}px) rotate(${dragX / 14}deg)`,
              opacity: exiting ? 0 : 1,
              transition: dragging ? "none" : exiting ? `transform 320ms ${exiting === "again" ? "ease-in" : "ease"}, opacity 320ms ${exiting === "again" ? "ease-in" : "ease"}` : "transform 350ms cubic-bezier(.34,1.56,.64,1)",
              zIndex: exiting === "again" ? 1 : 100,
              boxShadow: "0 20px 60px rgba(15,23,42,0.18)",
            }}
          >
            {dragX > 0 && (
              <span className="absolute right-5 top-5 rotate-[-10deg] rounded-lg border-2 border-emerald-400 px-3.5 py-1 text-sm font-extrabold tracking-[1px] text-emerald-400" style={{ opacity: Math.min(Math.abs(dragX) / 80, 1) }}>
                BILAMAN ✓
              </span>
            )}
            {dragX < 0 && (
              <span className="absolute left-5 top-5 rotate-[10deg] rounded-lg border-2 border-red-400 px-3.5 py-1 text-sm font-extrabold tracking-[1px] text-red-400" style={{ opacity: Math.min(Math.abs(dragX) / 80, 1) }}>
                YANA ✗
              </span>
            )}
            <p className="text-4xl font-extrabold leading-[1.3] text-gray-900 dark:text-zinc-100">
              {direction === "wordToTranslation" ? current.word : current.translation}
            </p>
            <div className="relative mt-4 flex min-h-6 w-full items-center justify-center">
              {revealed ? (
                <p className="text-lg text-gray-700 dark:text-zinc-200">
                  {direction === "wordToTranslation" ? current.translation : current.word}
                </p>
              ) : (
                <p className="text-[10px] tracking-[1px] text-gray-400 dark:text-zinc-500">JAVOBNI KO'RSATISH</p>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={resetDeck}
        className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-gray-600 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 hover:text-gray-900 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-white"
      >
        <RotateCcw size={16} />
        Yangilash
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] tracking-[1px] text-gray-400 dark:text-zinc-500">{label}</p>
    </div>
  );
}

function Test({ words, direction, setWords }: {
  words: PracticeWord[]; direction: Direction; setWords: (words: PracticeWord[]) => void;
}) {
  const [queue] = useState(() => [...words].sort((a, b) => a.id.localeCompare(b.id)));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const current = queue[index];
  const options = useMemo(() => {
    if (!current) return [];
    const answer = direction === "wordToTranslation" ? current.translation : current.word;
    const pool = words
      .filter((word) => word.id !== current.id)
      .map((word) => (direction === "wordToTranslation" ? word.translation : word.word))
      .filter((value, position, all) => value !== answer && all.indexOf(value) === position);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const distractors = shuffled.slice(0, 3);
    const combined = [answer, ...distractors];
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, direction]);

  function restart() {
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectCount(0);
    setResults([]);
  }

  if (!current) {
    const percentage = queue.length ? Math.round((correctCount / queue.length) * 100) : 0;
    return (
      <div className="mx-auto max-w-xl py-10 text-center text-gray-900">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          <Trophy size={38} />
        </div>
        <p className="mt-5 text-sm font-semibold text-gray-400">TEST YAKUNLANDI</p>
        <h1 className="mt-1 text-3xl font-black">Natijangiz</h1>
        <p className="mt-3 text-5xl font-black text-indigo-500">{percentage}%</p>
        <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-2xl font-black text-emerald-600">{correctCount}</p>
            <p className="text-xs font-semibold text-emerald-700">To'g'ri</p>
          </div>
          <div className="rounded-2xl bg-rose-50 p-4">
            <p className="text-2xl font-black text-rose-600">{queue.length - correctCount}</p>
            <p className="text-xs font-semibold text-rose-700">Noto'g'ri</p>
          </div>
        </div>
        <button
          type="button"
          onClick={restart}
          className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-600"
        >
          <RotateCcw size={17} /> Qayta ishlash
        </button>
      </div>
    );
  }
  const question = direction === "wordToTranslation" ? current.word : current.translation;
  const answer = direction === "wordToTranslation" ? current.translation : current.word;

  function checkAnswer() {
    if (!selected || checked) return;
    const known = selected === answer;
    if (known) setCorrectCount((count) => count + 1);
    setResults((oldResults) => [...oldResults, known]);
    setChecked(true);
    setWords(words.map((word) => (word.id === current.id ? { ...word, known } : word)));
  }

  function nextQuestion() {
    setSelected(null);
    setChecked(false);
    setIndex((value) => value + 1);
  }

  const optionLabels = ["A", "B", "C", "D"];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-100">
      <div className="px-4 pt-5 sm:px-8">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-500">Savol {index + 1}/{queue.length}</span>
          <span className="font-semibold text-indigo-500">{correctCount} to'g'ri</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex gap-2 overflow-x-auto py-4">
          {queue.map((word, questionIndex) => {
            const isCurrent = questionIndex === index;
            const result = results[questionIndex];
            return (
              <span
                key={word.id}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                  isCurrent ? "bg-gray-900 text-white shadow-md" : result === true ? "bg-emerald-100 text-emerald-700" : result === false ? "bg-rose-100 text-rose-600" : "border border-gray-200 bg-white text-gray-400"
                }`}
              >
                {questionIndex + 1}
              </span>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100 p-4 sm:px-8 sm:py-9">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{question}</h1>
        <p className="mt-2 text-sm text-gray-400">
          {direction === "wordToTranslation" ? "To'g'ri tarjimani tanlang" : "To'g'ri so'zni tanlang"}
        </p>

        <div className="mt-7 grid gap-3">
          {options.map((option, optionIndex) => {
            const correct = option === answer;
            const chosen = option === selected;
            const state = checked
              ? chosen && correct
                ? "border-emerald-500 bg-emerald-500 text-white"
                : chosen
                  ? "border-rose-500 bg-rose-500 text-white"
                  : correct
                    ? "border-2 border-emerald-500 bg-white text-emerald-700"
                    : "border-gray-200 bg-white text-gray-400"
              : chosen
                ? "border-gray-900 bg-gray-900 text-white shadow-md"
                : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50";
            return (
              <button
                key={`${option}-${optionIndex}`}
                type="button"
                disabled={checked}
                onClick={() => setSelected(option)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99] ${state}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${chosen ? "bg-white/20 text-white" : checked && correct ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {optionLabels[optionIndex]}
                </span>
                <span className="font-semibold leading-snug">{option}</span>
                {checked && chosen && correct && <Check size={18} className="ml-auto shrink-0" />}
                {checked && chosen && !correct && <X size={18} className="ml-auto shrink-0" />}
                {checked && !chosen && correct && <Check size={18} className="ml-auto shrink-0 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex border-t border-gray-200 bg-white px-4 pt-3 sm:px-8" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {checked ? (
          <button
            type="button"
            onClick={nextQuestion}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition ${index === queue.length - 1 ? "bg-emerald-500 shadow-emerald-100 hover:bg-emerald-600" : "bg-indigo-500 shadow-indigo-100 hover:bg-indigo-600"}`}
          >
            {index === queue.length - 1 ? "Yakunlash" : "Keyingi"}
            {index === queue.length - 1 ? <Check size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : (
          <button
            type="button"
            disabled={!selected}
            onClick={checkAnswer}
            className="flex-1 rounded-2xl bg-indigo-500 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-600 disabled:opacity-40"
          >
            Tekshirish
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `App.tsx`**

```tsx
const DeckPracticePage = lazy(() =>
  import("./pages/DeckPracticePage").then((m) => ({ default: m.DeckPracticePage })),
);
```

```tsx
  {
    path: "/d/:slug",
    element: (
      <PrivateRoute>
        <DeckPracticePage />
      </PrivateRoute>
    ),
  },
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Manually verify the full share-and-practice flow in browser**

From `WordDeckViewPage`, copy the deck link, open it in an incognito window logged in as a different user, confirm the mode/direction picker appears, try Flashcard mode (swipe left/right, or click-drag on desktop), try Test mode (answer a few questions, confirm score screen), then reload the page and confirm all progress resets to zero (proving nothing was persisted).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/DeckPracticePage.tsx apps/frontend/src/App.tsx
git commit -m "feat: add deck practice page (flashcard/test) with session-only progress"
```

---

## Part E: Final verification

### Task 14: Full-stack regression pass

**Files:** none created or modified — verification only.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/backend && npx jest`
Expected: PASS, all suites including the 4 new spec files from Tasks 1-3 and 9-10.

- [ ] **Step 2: Run the full frontend type-check and existing test suite**

Run: `cd apps/frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Manually re-walk both golden paths end-to-end**

"Mening testlarim": `/jamm` → "Mening testlarim" → create folder → create test → add 2+ questions → copy link → open link as a second logged-in user → submit → submit again (confirm allowed, no once-only block) → confirm neither user sees any results/statistics page for this test.

"Mening lug'atlarim": `/jamm` → "Mening lug'atlarim" → create deck → add words (one-by-one + bulk import) → copy link → open link as a second logged-in user → practice in both Flashcard and Test modes → reload → confirm progress reset to zero.

- [ ] **Step 4: Confirm teacher-facing pages are unaffected**

Log in as a teacher, visit the existing Dashboard (`/`), folders, tests, and challenges pages, confirm nothing changed in look or behavior (this plan added no modifications to any teacher-facing file).

- [ ] **Step 5: Commit (if any fixups were needed during verification)**

```bash
git add -A
git commit -m "fix: address issues found during full-stack verification of Mening testlarim/lug'atlarim"
```

(Skip this commit entirely if verification found no issues.)
