# Test Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students take tests via a short shareable link; admins see per-submission scores and answer breakdowns.

**Architecture:** Backend gains a `slug` column on `tests`, plus `submissions`/`answers` tables and a public (no-auth) NestJS module. Frontend gains three student pages (`/t/:slug`, `/t/:slug/take`, `/t/:slug/result`) and two admin pages (`/tests/:id/submissions`, `/submissions/:subId`). Scoring runs server-side on submit.

**Tech Stack:** NestJS 10, Drizzle ORM, PostgreSQL 16, React 18, Vite, Tailwind CSS, Zustand, react-router-dom v6, axios

## Global Constraints

- Monorepo root: `/Users/macbookpro/Documents/JsDev/portfolio/tester`
- Backend: `apps/backend/src/`, port 3001, prefix `api/v1` (admin routes) or `public` (student routes, no JWT)
- Frontend: `apps/frontend/src/`, flat structure — `src/components/`, `src/pages/` only, no sub-folders
- Named exports only for all components and pages (no default exports except `App.tsx`)
- No TypeScript path aliases — relative imports only
- `req.admin` set by `JwtAuthGuard.handleRequest()` override — never use `req.user`
- All admin queries scoped by `adminId` from JWT — never from request body
- Slug: 8 alphanumeric characters (`A-Za-z0-9` excluding confusable chars: `0OIl1`), unique in DB
- `is_correct` field on options MUST NOT appear in `/public/tests/:slug` response
- Student result data stored in `sessionStorage` key `submissionResult` — no re-fetch on result page
- macOS classic UI: `bg-gradient-to-br from-slate-100 to-indigo-50` background, `bg-white rounded-2xl shadow-xl border border-gray-100` cards
- Token in `localStorage` key `token`
- E2e tests: `import request from 'supertest'` (not `import * as request`)
- Drizzle relations must be exported for every new table with foreign keys

---

## File Map

**Backend — new files:**
- `apps/backend/src/delivery/delivery.module.ts` — PublicModule (no auth)
- `apps/backend/src/delivery/delivery.controller.ts` — `/public/tests/:slug`, `/public/submissions`
- `apps/backend/src/delivery/delivery.service.ts` — slug lookup, submission create, submit+score
- `apps/backend/src/delivery/dto/start-submission.dto.ts`
- `apps/backend/src/delivery/dto/submit-answers.dto.ts`
- `apps/backend/src/submissions/submissions.module.ts` — admin submissions (JWT)
- `apps/backend/src/submissions/submissions.controller.ts` — `/api/v1/tests/:testId/submissions`, `/api/v1/submissions/:id`
- `apps/backend/src/submissions/submissions.service.ts`
- `apps/backend/test/delivery.e2e-spec.ts`
- `apps/backend/test/submissions.e2e-spec.ts`

**Backend — modified files:**
- `apps/backend/src/db/schema.ts` — add `slug` to `tests`, add `submissions`/`answers` tables + relations
- `apps/backend/src/tests/tests.service.ts` — generate slug on `create()`
- `apps/backend/src/app.module.ts` — import `DeliveryModule`, `SubmissionsModule`

**Frontend — new files:**
- `apps/frontend/src/api/delivery.ts` — public API calls (no auth header needed)
- `apps/frontend/src/api/submissions.ts` — admin submissions API
- `apps/frontend/src/stores/submissionStore.ts` — admin submissions Zustand store
- `apps/frontend/src/pages/TakeTestEntryPage.tsx` — `/t/:slug`
- `apps/frontend/src/pages/TakeTestPage.tsx` — `/t/:slug/take?sid=...`
- `apps/frontend/src/pages/TestResultPage.tsx` — `/t/:slug/result?sid=...`
- `apps/frontend/src/pages/SubmissionsPage.tsx` — `/tests/:id/submissions`
- `apps/frontend/src/pages/SubmissionDetailPage.tsx` — `/submissions/:subId`

**Frontend — modified files:**
- `apps/frontend/src/App.tsx` — add 5 new routes
- `apps/frontend/src/api/tests.ts` — add `slug` field to `Test` interface
- `apps/frontend/src/components/TestCard.tsx` — add slug badge + copy button
- `apps/frontend/src/pages/FolderViewPage.tsx` — add "Submissions" to context menu

---

### Task 1: DB Schema — slug, submissions, answers

**Files:**
- Modify: `apps/backend/src/db/schema.ts`

**Interfaces:**
- Produces:
  - `tests.slug: varchar(8)`
  - `submissions` table exported as `submissions`
  - `answers` table exported as `answers`
  - `submissionsRelations`, `answersRelations` exported

- [ ] **Step 1: Add `slug` column to `tests` table and new tables to schema**

Open `apps/backend/src/db/schema.ts`. Add `varchar` to the drizzle imports. Replace the existing file content with:

```ts
import { pgTable, text, uuid, timestamp, integer, boolean, varchar } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon').notNull().default('folder'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  timeLimit: integer('time_limit'),
  showResults: text('show_results').notNull().default('immediately'),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
  shuffleOptions: boolean('shuffle_options').notNull().default(false),
  oneByOne: boolean('one_by_one').notNull().default(false),
  deadline: timestamp('deadline', { withTimezone: true }),
  slug: varchar('slug', { length: 8 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  type: text('type').notNull().default('single'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const options = pgTable('options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
});

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  testId: uuid('test_id').notNull().references(() => tests.id, { onDelete: 'cascade' }),
  studentName: text('student_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  score: integer('score'),
  total: integer('total'),
});

export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  selectedOptionIds: uuid('selected_option_ids').array().notNull().default(sql`'{}'::uuid[]`),
  textAnswer: text('text_answer'),
  isCorrect: boolean('is_correct'),
});

export const testsRelations = relations(tests, ({ many }) => ({
  questions: many(questions),
  submissions: many(submissions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  test: one(tests, { fields: [questions.testId], references: [tests.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  test: one(tests, { fields: [submissions.testId], references: [tests.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  submission: one(submissions, { fields: [answers.submissionId], references: [submissions.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));
```

- [ ] **Step 2: Run migration**

```bash
cd apps/backend
npx drizzle-kit push
```

Expected: tables `submissions`, `answers` created; column `slug` added to `tests`. No errors.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/backend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/schema.ts
git commit -m "feat: add slug to tests, add submissions and answers tables"
```

---

### Task 2: Slug generation in TestsService + public delivery backend

**Files:**
- Modify: `apps/backend/src/tests/tests.service.ts`
- Create: `apps/backend/src/delivery/dto/start-submission.dto.ts`
- Create: `apps/backend/src/delivery/dto/submit-answers.dto.ts`
- Create: `apps/backend/src/delivery/delivery.service.ts`
- Create: `apps/backend/src/delivery/delivery.controller.ts`
- Create: `apps/backend/src/delivery/delivery.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Create: `apps/backend/test/delivery.e2e-spec.ts`

**Interfaces:**
- Consumes: `tests`, `questions`, `options`, `submissions`, `answers` from `../db/schema`
- Produces:
  - `GET /public/tests/:slug` → test with questions+options (no `isCorrect`)
  - `POST /public/submissions` body `{ slug, studentName }` → `{ submissionId: string }`
  - `POST /public/submissions/:id/submit` body `{ answers: [...] }` → score result

- [ ] **Step 1: Write the failing e2e test**

Create `apps/backend/test/delivery.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests, questions, options } from '../src/db/schema';

describe('Delivery (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let slug: string;
  let testId: string;
  let questionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Delivery Test Folder' }).returning();
    const [test] = await db.insert(tests).values({
      adminId, folderId: folder.id, name: 'Delivery Test', showResults: 'immediately',
    }).returning();
    testId = test.id;
    slug = test.slug!;

    const [q] = await db.insert(questions).values({ testId: test.id, text: 'What is 2+2?', type: 'single', orderIndex: 0 }).returning();
    questionId = q.id;
    const opts = await db.insert(options).values([
      { questionId: q.id, text: '4', isCorrect: true, orderIndex: 0 },
      { questionId: q.id, text: '5', isCorrect: false, orderIndex: 1 },
    ]).returning();
    correctOptionId = opts[0].id;
    wrongOptionId = opts[1].id;
  });

  afterAll(() => app.close());

  it('GET /public/tests/:slug - returns test without isCorrect', async () => {
    const res = await request(app.getHttpServer()).get(`/public/tests/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Delivery Test');
    expect(res.body.questions[0].options[0].isCorrect).toBeUndefined();
    expect(res.body.questions[0].id).toBe(questionId);
  });

  it('GET /public/tests/NOTEXIST - returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/public/tests/NOTEXIST');
    expect(res.status).toBe(404);
  });

  it('POST /public/submissions - start submission', async () => {
    const res = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Ali' });
    expect(res.status).toBe(201);
    expect(res.body.submissionId).toBeDefined();
  });

  it('POST /public/submissions/:id/submit - correct answer scores 1/1', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Vali' });
    const submissionId = startRes.body.submissionId;

    const res = await request(app.getHttpServer())
      .post(`/public/submissions/${submissionId}/submit`)
      .send({ answers: [{ questionId, selectedOptionIds: [correctOptionId], textAnswer: null }] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(res.body.total).toBe(1);
    expect(res.body.showResults).toBe('immediately');
    expect(res.body.answers[0].isCorrect).toBe(true);
  });

  it('POST /public/submissions/:id/submit - wrong answer scores 0/1', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/public/submissions')
      .send({ slug, studentName: 'Jasur' });
    const submissionId = startRes.body.submissionId;

    const res = await request(app.getHttpServer())
      .post(`/public/submissions/${submissionId}/submit`)
      .send({ answers: [{ questionId, selectedOptionIds: [wrongOptionId], textAnswer: null }] });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.answers[0].isCorrect).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend
npx jest --config test/jest-e2e.json test/delivery.e2e-spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot GET /public/tests/...` (routes not yet created).

- [ ] **Step 3: Add slug generation to TestsService**

Replace `apps/backend/src/tests/tests.service.ts`:

```ts
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
export class TestsService {
  async findAll(folderId: string, adminId: string) {
    return db.query.tests.findMany({
      where: and(eq(tests.folderId, folderId), eq(tests.adminId, adminId)),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
  }

  async findOne(id: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, id), eq(tests.adminId, adminId)),
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

  async create(adminId: string, data: {
    folderId: string; name: string; description?: string; timeLimit?: number;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; deadline?: string;
  }) {
    const slug = await uniqueSlug();
    const [test] = await db.insert(tests).values({
      adminId, folderId: data.folderId, name: data.name,
      description: data.description, timeLimit: data.timeLimit,
      showResults: data.showResults ?? 'immediately',
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      oneByOne: data.oneByOne ?? false,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      slug,
    }).returning();
    return test;
  }

  async update(id: string, adminId: string, data: {
    name?: string; description?: string; timeLimit?: number | null;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; deadline?: string | null;
  }) {
    const updateData: any = { ...data };
    if ('deadline' in data) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }
    const [test] = await db.update(tests)
      .set(updateData)
      .where(and(eq(tests.id, id), eq(tests.adminId, adminId)))
      .returning();
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async remove(id: string, adminId: string) {
    const result = await db.delete(tests)
      .where(and(eq(tests.id, id), eq(tests.adminId, adminId)))
      .returning({ id: tests.id });
    if (!result.length) throw new NotFoundException('Test not found');
  }
}
```

- [ ] **Step 4: Create DTOs**

`apps/backend/src/delivery/dto/start-submission.dto.ts`:
```ts
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class StartSubmissionDto {
  @IsString() @IsNotEmpty() @Length(8, 8) slug: string;
  @IsString() @IsNotEmpty() studentName: string;
}
```

`apps/backend/src/delivery/dto/submit-answers.dto.ts`:
```ts
import { IsArray, IsUUID, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerItemDto {
  @IsUUID() questionId: string;
  @IsArray() @IsUUID('4', { each: true }) selectedOptionIds: string[];
  @IsOptional() @IsString() textAnswer: string | null;
}

export class SubmitAnswersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerItemDto)
  answers: AnswerItemDto[];
}
```

- [ ] **Step 5: Create DeliveryService**

`apps/backend/src/delivery/delivery.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, questions, options, submissions, answers } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class DeliveryService {
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
      deadline: test.deadline,
      questions: test.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        orderIndex: q.orderIndex,
        options: q.options.map((o) => ({ id: o.id, text: o.text, orderIndex: o.orderIndex })),
      })),
    };
  }

  async startSubmission(slug: string, studentName: string) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      studentName,
    }).returning();

    return { submissionId: submission.id };
  }

  async submitAnswers(submissionId: string, answerItems: Array<{
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string | null;
  }>) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: {
        questions: {
          with: { options: {} },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const questionMap = new Map(test.questions.map((q) => [q.id, q]));

    let score = 0;
    let total = 0;
    const answerResults: Array<{ questionId: string; isCorrect: boolean | null }> = [];

    const answerRows = answerItems.map((item) => {
      const question = questionMap.get(item.questionId);
      if (!question) return null;

      let isCorrect: boolean | null = null;

      if (question.type === 'single' || question.type === 'multi') {
        total++;
        const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
        const selectedIds = new Set(item.selectedOptionIds);
        isCorrect =
          correctIds.size === selectedIds.size &&
          [...correctIds].every((id) => selectedIds.has(id));
        if (isCorrect) score++;
      }

      answerResults.push({ questionId: item.questionId, isCorrect });

      return {
        submissionId,
        questionId: item.questionId,
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
        isCorrect,
      };
    }).filter(Boolean) as any[];

    if (answerRows.length > 0) {
      await db.insert(answers).values(answerRows);
    }

    await db.update(submissions)
      .set({ submittedAt: new Date(), score, total })
      .where(eq(submissions.id, submissionId));

    return {
      submissionId,
      score,
      total,
      showResults: test.showResults,
      deadline: test.deadline,
      answers: answerResults,
    };
  }
}
```

- [ ] **Step 6: Create DeliveryController**

`apps/backend/src/delivery/delivery.controller.ts`:
```ts
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { StartSubmissionDto } from './dto/start-submission.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Controller()
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string) {
    return this.deliveryService.getTestBySlug(slug);
  }

  @Post('submissions')
  startSubmission(@Body() dto: StartSubmissionDto) {
    return this.deliveryService.startSubmission(dto.slug, dto.studentName);
  }

  @Post('submissions/:id/submit')
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto) {
    return this.deliveryService.submitAnswers(id, dto.answers);
  }
}
```

- [ ] **Step 7: Create DeliveryModule**

`apps/backend/src/delivery/delivery.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
```

- [ ] **Step 8: Register module in AppModule and set `/public` prefix**

`apps/backend/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import { DeliveryModule } from './delivery/delivery.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule, TestsModule, QuestionsModule, DeliveryModule],
})
export class AppModule {}
```

`apps/backend/src/main.ts` — add public prefix for delivery routes:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

Note: `setGlobalPrefix` with `exclude` pattern means `/public/tests/:slug` is reachable without `api/v1` prefix. The `DeliveryController` uses `@Controller()` with no prefix — routes will be `/public/tests/:slug` etc. because the controller path is set per-route.

Wait — this approach needs the controller to be prefixed with `public`. Update `delivery.controller.ts` `@Controller('public')`:

```ts
@Controller('public')
export class DeliveryController {
```

And `main.ts` exclude pattern `'public/(.*)'` ensures these routes bypass the global `api/v1` prefix.

- [ ] **Step 9: Run the e2e test**

```bash
cd apps/backend
npx jest --config test/jest-e2e.json test/delivery.e2e-spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all 4 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/src/tests/tests.service.ts \
  apps/backend/src/delivery/ apps/backend/src/app.module.ts apps/backend/src/main.ts \
  apps/backend/test/delivery.e2e-spec.ts
git commit -m "feat: add delivery module (public test+submission endpoints, slug generation)"
```

---

### Task 3: Admin Submissions Module (Backend)

**Files:**
- Create: `apps/backend/src/submissions/submissions.service.ts`
- Create: `apps/backend/src/submissions/submissions.controller.ts`
- Create: `apps/backend/src/submissions/submissions.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Create: `apps/backend/test/submissions.e2e-spec.ts`

**Interfaces:**
- Consumes: `submissions`, `answers`, `tests` from `../db/schema`, `JwtAuthGuard` from `../auth/jwt-auth.guard`
- Produces:
  - `GET /api/v1/tests/:testId/submissions` → `Submission[]`
  - `GET /api/v1/submissions/:id` → `SubmissionDetail` (with answers breakdown)

- [ ] **Step 1: Write the failing e2e test**

`apps/backend/test/submissions.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests, questions, options, submissions, answers } from '../src/db/schema';

describe('Submissions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let testId: string;
  let submissionId: string;
  let questionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['public/(.*)'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Sub Test Folder' }).returning();
    const [test] = await db.insert(tests).values({
      adminId, folderId: folder.id, name: 'Sub Test', showResults: 'immediately',
    }).returning();
    testId = test.id;

    const [q] = await db.insert(questions).values({ testId, text: 'Q1', type: 'single', orderIndex: 0 }).returning();
    questionId = q.id;
    const [opt] = await db.insert(options).values({ questionId, text: 'A', isCorrect: true, orderIndex: 0 }).returning();

    const [sub] = await db.insert(submissions).values({
      testId, studentName: 'Test Student', submittedAt: new Date(), score: 1, total: 1,
    }).returning();
    submissionId = sub.id;
    await db.insert(answers).values({
      submissionId, questionId, selectedOptionIds: [opt.id], isCorrect: true,
    });
  });

  afterAll(() => app.close());

  it('GET /api/v1/tests/:testId/submissions - requires auth', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/tests/${testId}/submissions`);
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/tests/:testId/submissions - returns list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests/${testId}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].studentName).toBe('Test Student');
    expect(res.body[0].score).toBe(1);
  });

  it('GET /api/v1/submissions/:id - returns detail with answers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.studentName).toBe('Test Student');
    expect(Array.isArray(res.body.answers)).toBe(true);
    expect(res.body.answers[0].questionId).toBe(questionId);
    expect(res.body.answers[0].isCorrect).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/backend
npx jest --config test/jest-e2e.json test/submissions.e2e-spec.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create SubmissionsService**

`apps/backend/src/submissions/submissions.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { submissions, answers, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class SubmissionsService {
  async findByTest(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');

    return db.query.submissions.findMany({
      where: eq(submissions.testId, testId),
      orderBy: (s, { desc }) => [desc(s.startedAt)],
    });
  }

  async findOne(submissionId: string, adminId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        test: true,
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.test.adminId !== adminId) throw new NotFoundException('Submission not found');

    return {
      id: submission.id,
      studentName: submission.studentName,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      score: submission.score,
      total: submission.total,
      testId: submission.testId,
      answers: submission.answers.map((a) => ({
        questionId: a.questionId,
        questionText: a.question.text,
        questionType: a.question.type,
        selectedOptionIds: a.selectedOptionIds,
        textAnswer: a.textAnswer,
        isCorrect: a.isCorrect,
        correctOptionIds: a.question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id),
        options: a.question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
      })),
    };
  }
}
```

- [ ] **Step 4: Create SubmissionsController**

`apps/backend/src/submissions/submissions.controller.ts`:
```ts
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('tests/:testId/submissions')
  findByTest(@Param('testId') testId: string, @Req() req: any) {
    return this.submissionsService.findByTest(testId, req.admin.id);
  }

  @Get('submissions/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.findOne(id, req.admin.id);
  }
}
```

- [ ] **Step 5: Create SubmissionsModule**

`apps/backend/src/submissions/submissions.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
```

- [ ] **Step 6: Register in AppModule**

`apps/backend/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import { DeliveryModule } from './delivery/delivery.module';
import { SubmissionsModule } from './submissions/submissions.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule, TestsModule, QuestionsModule, DeliveryModule, SubmissionsModule],
})
export class AppModule {}
```

- [ ] **Step 7: Run the e2e tests**

```bash
cd apps/backend
npx jest --config test/jest-e2e.json test/submissions.e2e-spec.ts --no-coverage 2>&1 | tail -10
```

Expected: all 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/submissions/ apps/backend/src/app.module.ts \
  apps/backend/test/submissions.e2e-spec.ts
git commit -m "feat: add admin submissions module (list + detail endpoints)"
```

---

### Task 4: Frontend API, Stores, and Test interface update

**Files:**
- Modify: `apps/frontend/src/api/tests.ts`
- Create: `apps/frontend/src/api/delivery.ts`
- Create: `apps/frontend/src/api/submissions.ts`
- Create: `apps/frontend/src/stores/submissionStore.ts`

**Interfaces:**
- Produces:
  - `PublicTest`, `SubmissionResult` interfaces from `delivery.ts`
  - `Submission`, `SubmissionDetail` interfaces from `submissions.ts`
  - `useSubmissionStore()` from `submissionStore.ts`

- [ ] **Step 1: Update Test interface to include slug**

`apps/frontend/src/api/tests.ts` — add `slug` to `Test` interface:

Open the file and find:
```ts
export interface Test {
  id: string;
  folderId: string;
  adminId: string;
  name: string;
  description?: string | null;
  timeLimit?: number | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  deadline?: string | null;
  createdAt: string;
}
```
Add `slug: string | null;` after `createdAt`. (Read the actual file first to get exact content, then add the field.)

- [ ] **Step 2: Create delivery API**

`apps/frontend/src/api/delivery.ts`:
```ts
import axios from 'axios';

const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export interface PublicOption {
  id: string;
  text: string;
  orderIndex: number;
}

export interface PublicQuestion {
  id: string;
  text: string;
  type: 'single' | 'multi' | 'open';
  orderIndex: number;
  options: PublicOption[];
}

export interface PublicTest {
  id: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  deadline: string | null;
  questions: PublicQuestion[];
}

export interface AnswerResultItem {
  questionId: string;
  isCorrect: boolean | null;
}

export interface SubmissionResult {
  submissionId: string;
  score: number;
  total: number;
  showResults: 'immediately' | 'after_deadline' | 'hidden';
  deadline: string | null;
  answers: AnswerResultItem[];
}

export async function apiGetPublicTest(slug: string): Promise<PublicTest> {
  const res = await publicClient.get(`/public/tests/${slug}`);
  return res.data;
}

export async function apiStartSubmission(slug: string, studentName: string): Promise<{ submissionId: string }> {
  const res = await publicClient.post('/public/submissions', { slug, studentName });
  return res.data;
}

export async function apiSubmitAnswers(
  submissionId: string,
  answers: Array<{ questionId: string; selectedOptionIds: string[]; textAnswer: string | null }>,
): Promise<SubmissionResult> {
  const res = await publicClient.post(`/public/submissions/${submissionId}/submit`, { answers });
  return res.data;
}
```

- [ ] **Step 3: Create admin submissions API**

`apps/frontend/src/api/submissions.ts`:
```ts
import client from './client';

export interface Submission {
  id: string;
  testId: string;
  studentName: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
}

export interface AnswerDetail {
  questionId: string;
  questionText: string;
  questionType: 'single' | 'multi' | 'open';
  selectedOptionIds: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  correctOptionIds: string[];
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
}

export interface SubmissionDetail extends Submission {
  answers: AnswerDetail[];
}

export async function apiGetSubmissions(testId: string): Promise<Submission[]> {
  const res = await client.get(`/tests/${testId}/submissions`);
  return res.data;
}

export async function apiGetSubmission(id: string): Promise<SubmissionDetail> {
  const res = await client.get(`/submissions/${id}`);
  return res.data;
}
```

- [ ] **Step 4: Create submissionStore**

`apps/frontend/src/stores/submissionStore.ts`:
```ts
import { create } from 'zustand';
import { apiGetSubmissions, apiGetSubmission, type Submission, type SubmissionDetail } from '../api/submissions';

interface SubmissionState {
  submissions: Submission[];
  fetchSubmissions: (testId: string) => Promise<void>;
  getSubmission: (id: string) => Promise<SubmissionDetail>;
}

export const useSubmissionStore = create<SubmissionState>()((set) => ({
  submissions: [],
  fetchSubmissions: async (testId) => {
    const submissions = await apiGetSubmissions(testId);
    set({ submissions });
  },
  getSubmission: async (id) => {
    return apiGetSubmission(id);
  },
}));
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/tests.ts apps/frontend/src/api/delivery.ts \
  apps/frontend/src/api/submissions.ts apps/frontend/src/stores/submissionStore.ts
git commit -m "feat: add delivery and submissions API + store, add slug to Test interface"
```

---

### Task 5: Frontend Pages — Student flow + Admin submissions

**Files:**
- Create: `apps/frontend/src/pages/TakeTestEntryPage.tsx`
- Create: `apps/frontend/src/pages/TakeTestPage.tsx`
- Create: `apps/frontend/src/pages/TestResultPage.tsx`
- Create: `apps/frontend/src/pages/SubmissionsPage.tsx`
- Create: `apps/frontend/src/pages/SubmissionDetailPage.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/TestCard.tsx`
- Modify: `apps/frontend/src/pages/FolderViewPage.tsx`

**Interfaces:**
- Consumes: `apiGetPublicTest`, `apiStartSubmission`, `apiSubmitAnswers` from `../api/delivery`; `useSubmissionStore` from `../stores/submissionStore`; `apiGetSubmission` from `../api/submissions`

- [ ] **Step 1: Create TakeTestEntryPage**

`apps/frontend/src/pages/TakeTestEntryPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetPublicTest, apiStartSubmission, type PublicTest } from '../api/delivery';

export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<PublicTest | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiGetPublicTest(slug)
      .then(setTest)
      .catch(() => setError('Test topilmadi.'))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(slug, name.trim());
      navigate(`/t/${slug}/take?sid=${submissionId}`);
    } catch {
      setError('Xato yuz berdi. Qayta urinib ko\'ring.');
    } finally {
      setStarting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  if (error || !test) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-red-400">{error ?? 'Test topilmadi.'}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex gap-1.5 mb-6">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-1">{test.name}</h1>
        {test.description && <p className="text-sm text-gray-500 mb-4">{test.description}</p>}
        <div className="flex gap-2 flex-wrap mb-6">
          {test.timeLimit && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">⏱ {test.timeLimit} daqiqa</span>
          )}
          {test.deadline && (
            <span className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">
              📅 {new Date(test.deadline).toLocaleString()}
            </span>
          )}
        </div>
        <form onSubmit={handleStart} className="flex flex-col gap-3">
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ismingizni kiriting"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit" disabled={!name.trim() || starting}
            className="w-full bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-600 disabled:opacity-40"
          >
            {starting ? 'Boshlanmoqda...' : 'Testni boshlash'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TakeTestPage**

`apps/frontend/src/pages/TakeTestPage.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiGetPublicTest, apiSubmitAnswers, type PublicTest, type PublicQuestion } from '../api/delivery';

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get('sid') ?? '';

  const [test, setTest] = useState<PublicTest | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [textMap, setTextMap] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiGetPublicTest(slug).then((t) => {
      setTest(t);
      const qs = t.shuffleQuestions ? seededShuffle(t.questions, submissionId) : [...t.questions];
      const qsWithOpts = qs.map((q) => ({
        ...q,
        options: t.shuffleOptions ? seededShuffle(q.options, submissionId + q.id) : q.options,
      }));
      setOrderedQuestions(qsWithOpts);
      if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
    });
  }, [slug]);

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    timerRef.current = setInterval(() => setTimeLeft((t) => (t ?? 1) - 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft === null ? null : Math.floor(timeLeft / 60)]);

  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setTimeLeft((t) => {
        if (t === null || t <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0; }
        return t - 1;
      }), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [orderedQuestions.length]);

  async function handleSubmit() {
    if (submitting || !test) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    const answers = orderedQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMap[q.id] ?? [],
      textAnswer: textMap[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(submissionId, answers);
      sessionStorage.setItem('submissionResult', JSON.stringify(result));
      navigate(`/t/${slug}/result`);
    } catch {
      setSubmitting(false);
    }
  }

  function toggleOption(questionId: string, optionId: string, type: 'single' | 'multi') {
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (type === 'single') return { ...prev, [questionId]: [optionId] };
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  if (!test) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  const isOneByOne = test.oneByOne;
  const questions = isOneByOne ? [orderedQuestions[currentIdx]] : orderedQuestions;
  const isLast = currentIdx === orderedQuestions.length - 1;

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function renderQuestion(q: PublicQuestion, idx: number) {
    const selected = selectedMap[q.id] ?? [];
    return (
      <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs text-gray-400 mb-1">{idx + 1}. savol</p>
        <p className="text-sm font-medium text-gray-800 mb-4">{q.text}</p>
        {q.type === 'open' ? (
          <textarea
            value={textMap[q.id] ?? ''} rows={3}
            onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Javobingizni yozing..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleOption(q.id, opt.id, q.type as 'single' | 'multi')}
                  className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${checked ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-700 hover:border-indigo-300'}`}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{test.name}</span>
        {timeLeft !== null && (
          <span className={`font-mono text-sm ${timeLeft < 60 ? 'text-red-500' : 'text-gray-500'}`}>
            ⏱ {formatTime(timeLeft)}
          </span>
        )}
      </div>
      {isOneByOne && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-indigo-500 transition-all"
            style={{ width: `${((currentIdx + 1) / orderedQuestions.length) * 100}%` }}
          />
        </div>
      )}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {isOneByOne && (
          <p className="text-xs text-gray-400 text-right">{currentIdx + 1} / {orderedQuestions.length}</p>
        )}
        {questions.map((q, i) => renderQuestion(q, isOneByOne ? currentIdx : i))}
        <div className="flex justify-end gap-2 mt-2">
          {isOneByOne && !isLast ? (
            <button onClick={() => setCurrentIdx((i) => i + 1)}
              className="px-5 py-2 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600">
              Keyingi
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2 bg-green-500 text-white rounded-xl text-sm hover:bg-green-600 disabled:opacity-40">
              {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TestResultPage**

`apps/frontend/src/pages/TestResultPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SubmissionResult } from '../api/delivery';

export function TestResultPage() {
  const { slug } = useParams<{ slug: string }>();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('submissionResult');
    if (raw) setResult(JSON.parse(raw));
  }, []);

  if (!result) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Natija topilmadi.</p>
    </div>
  );

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex gap-1.5 mb-6">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>

        {result.showResults === 'immediately' && (
          <>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-indigo-600">{result.score} / {result.total}</p>
              <p className="text-sm text-gray-400 mt-1">{pct}% to'g'ri</p>
            </div>
            <div className="flex flex-col gap-3">
              {result.answers.map((a, i) => (
                <div key={a.questionId} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                  a.isCorrect === true ? 'bg-green-50 text-green-700' :
                  a.isCorrect === false ? 'bg-red-50 text-red-600' :
                  'bg-gray-50 text-gray-500'
                }`}>
                  <span className="font-medium w-5">{i + 1}.</span>
                  <span>{a.isCorrect === true ? '✓ To\'g\'ri' : a.isCorrect === false ? '✗ Noto\'g\'ri' : '— Ochiq'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {result.showResults === 'after_deadline' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium mb-2">Test topshirildi ✓</p>
            <p className="text-sm text-gray-400">
              Natijalar {result.deadline ? new Date(result.deadline).toLocaleString() : 'deadline'} dan keyin ochiladi.
            </p>
          </div>
        )}

        {result.showResults === 'hidden' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium">Test muvaffaqiyatli topshirildi ✓</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create SubmissionsPage**

`apps/frontend/src/pages/SubmissionsPage.tsx`:
```tsx
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { useSubmissionStore } from '../stores/submissionStore';
import { useTestStore } from '../stores/testStore';

export function SubmissionsPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { submissions, fetchSubmissions } = useSubmissionStore();
  const { tests } = useTestStore();
  const test = tests.find((t) => t.id === testId);

  useEffect(() => {
    if (testId) fetchSubmissions(testId);
  }, [testId]);

  const shareLink = test?.slug ? `${window.location.origin}/t/${test.slug}` : '';

  async function copyLink() {
    if (shareLink) await navigator.clipboard.writeText(shareLink);
  }

  function scoreBadgeClass(score: number | null, total: number | null) {
    if (score === null || total === null || total === 0) return 'bg-gray-100 text-gray-500';
    const pct = score / total;
    if (pct >= 0.7) return 'bg-green-100 text-green-700';
    if (pct >= 0.5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-600';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← Orqaga</button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{test?.name ?? 'Test'} — Natijalar</h2>
        </div>

        {shareLink && (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-400 flex-1 truncate">{shareLink}</span>
            <button onClick={copyLink} className="text-xs text-indigo-500 hover:text-indigo-700 shrink-0">
              📋 Nusxalash
            </button>
          </div>
        )}

        {submissions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-8">Hali natijalar yo'q.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {submissions.map((sub) => (
              <div key={sub.id}
                onClick={() => navigate(`/submissions/${sub.id}`)}
                className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{sub.studentName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'Topshirilmagan'}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${scoreBadgeClass(sub.score, sub.total)}`}>
                  {sub.score !== null && sub.total !== null ? `${sub.score} / ${sub.total}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create SubmissionDetailPage**

`apps/frontend/src/pages/SubmissionDetailPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { apiGetSubmission, type SubmissionDetail } from '../api/submissions';

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);

  useEffect(() => {
    if (id) apiGetSubmission(id).then(setDetail);
  }, [id]);

  if (!detail) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← Natijalar</button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{detail.studentName}</h2>
          <span className="ml-auto text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg">
            {detail.score} / {detail.total}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {detail.answers.map((a, i) => (
            <div key={a.questionId} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-2 mb-3">
                <span className="text-xs text-gray-400 mt-0.5">{i + 1}.</span>
                <p className="text-sm font-medium text-gray-800 flex-1">{a.questionText}</p>
                <span className="text-base shrink-0">
                  {a.isCorrect === true ? '✅' : a.isCorrect === false ? '❌' : '—'}
                </span>
              </div>

              {a.questionType === 'open' ? (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  {a.textAnswer ?? '(javob berilmagan)'}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {a.options.map((opt) => {
                    const studentSelected = a.selectedOptionIds.includes(opt.id);
                    const isCorrectOpt = a.correctOptionIds.includes(opt.id);
                    return (
                      <div key={opt.id} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                        isCorrectOpt ? 'bg-green-50 text-green-700' :
                        studentSelected ? 'bg-red-50 text-red-600' :
                        'text-gray-500'
                      }`}>
                        <span>{studentSelected ? '●' : '○'}</span>
                        <span>{opt.text}</span>
                        {isCorrectOpt && <span className="ml-auto text-[10px]">✓ to'g'ri</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update TestCard to show slug badge**

`apps/frontend/src/components/TestCard.tsx` — add slug badge below metadata badges:

```tsx
import { useState } from 'react';
import type { Test } from '../api/tests';

interface Props {
  test: Test;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function TestCard({ test, onDoubleClick, onContextMenu }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!test.slug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${test.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer hover:bg-white/60 select-none w-28"
    >
      <div className="w-16 h-14 flex items-center justify-center text-4xl">📄</div>
      <span className="text-xs text-gray-700 text-center break-words w-full leading-tight">
        {test.name}
      </span>
      <div className="flex gap-1 flex-wrap justify-center">
        {test.timeLimit && (
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">⏱ {test.timeLimit}m</span>
        )}
        {test.shuffleQuestions && (
          <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">🔀</span>
        )}
        {test.oneByOne && (
          <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">1×1</span>
        )}
        {test.deadline && (
          <span className="text-[10px] bg-orange-100 text-orange-600 px-1 rounded">📅</span>
        )}
      </div>
      {test.slug && (
        <button
          onClick={copyLink}
          className="text-[10px] text-indigo-400 hover:text-indigo-600 mt-0.5"
          title="Linkni nusxalash"
        >
          {copied ? '✓ Nusxalandi' : `#${test.slug}`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Update FolderViewPage context menu to add Submissions**

In `apps/frontend/src/pages/FolderViewPage.tsx`, find the inline context menu buttons block and add "Submissions" before "Edit Settings":

```tsx
<button
  onClick={() => { navigate(`/tests/${menu.test.id}/submissions`); setMenu(null); }}
  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
>
  Submissions
</button>
```

- [ ] **Step 8: Update App.tsx with new routes**

`apps/frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminsPage } from './pages/AdminsPage';
import { FolderViewPage } from './pages/FolderViewPage';
import { QuestionEditorPage } from './pages/QuestionEditorPage';
import { TakeTestEntryPage } from './pages/TakeTestEntryPage';
import { TakeTestPage } from './pages/TakeTestPage';
import { TestResultPage } from './pages/TestResultPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { SubmissionDetailPage } from './pages/SubmissionDetailPage';
import { PrivateRoute } from './components/PrivateRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/folders/:id" element={<PrivateRoute><FolderViewPage /></PrivateRoute>} />
        <Route path="/tests/:id/edit" element={<PrivateRoute><QuestionEditorPage /></PrivateRoute>} />
        <Route path="/tests/:id/submissions" element={<PrivateRoute><SubmissionsPage /></PrivateRoute>} />
        <Route path="/submissions/:id" element={<PrivateRoute><SubmissionDetailPage /></PrivateRoute>} />
        <Route path="/t/:slug" element={<TakeTestEntryPage />} />
        <Route path="/t/:slug/take" element={<TakeTestPage />} />
        <Route path="/t/:slug/result" element={<TestResultPage />} />
        <Route path="/admins" element={<SuperAdminRoute><AdminsPage /></SuperAdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 9: Build to verify TypeScript**

```bash
cd apps/frontend
npm run build 2>&1 | tail -10
```

Expected: `✓ built in ...ms` with no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/pages/TakeTestEntryPage.tsx \
  apps/frontend/src/pages/TakeTestPage.tsx \
  apps/frontend/src/pages/TestResultPage.tsx \
  apps/frontend/src/pages/SubmissionsPage.tsx \
  apps/frontend/src/pages/SubmissionDetailPage.tsx \
  apps/frontend/src/components/TestCard.tsx \
  apps/frontend/src/pages/FolderViewPage.tsx \
  apps/frontend/src/App.tsx
git commit -m "feat: add student test-taking pages and admin submissions views"
```
