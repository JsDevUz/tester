# Test Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build test creation (wizard + bulk import) inside folders with full question/option CRUD.

**Architecture:** Three new NestJS modules (tests, questions, options) with admin-scoped isolation. Frontend adds a FolderView page, TestSettingsModal wizard step, and QuestionEditor page with manual + bulk import tabs. All operations verified by JWT admin_id.

**Tech Stack:** NestJS 10, Drizzle ORM, PostgreSQL, React 18, Vite, Tailwind CSS v4, Zustand, react-router-dom.

## Global Constraints

- Node.js >= 20
- All API routes prefixed with `/api/v1`
- All test/question/option operations scoped by `admin_id` from JWT — never from request body
- `show_results` values: `'immediately'` | `'after_deadline'` | `'hidden'`
- `type` values: `'single'` | `'multi'` | `'open'`
- JWT stored in localStorage key `token`
- Frontend env var: `VITE_API_URL` (no trailing slash)
- Classic flat folder structure: components in `src/components/`, pages in `src/pages/`
- Use `import request from 'supertest'` (not `import * as request`) in e2e tests
- Backend DB: `postgresql://macbookpro@localhost:5432/testplatform`

---

## File Structure

```
apps/backend/src/
  tests/
    tests.module.ts
    tests.controller.ts
    tests.service.ts
  questions/
    questions.module.ts
    questions.controller.ts
    questions.service.ts
    bulk-parser.ts          # pure function: text → parsed questions array
  db/
    schema.ts               # MODIFY: add tests, questions, options tables
  app.module.ts             # MODIFY: add TestsModule, QuestionsModule

apps/backend/test/
  tests.e2e-spec.ts
  questions.e2e-spec.ts

apps/frontend/src/
  api/
    tests.ts                # CRUD API calls
    questions.ts            # question + bulk import API calls
  stores/
    testStore.ts            # Zustand: tests per folder
    questionStore.ts        # Zustand: questions per test
  pages/
    FolderViewPage.tsx      # shows tests inside a folder
    QuestionEditorPage.tsx  # /tests/:id/edit — manual + bulk tabs
  components/
    TestCard.tsx            # test card in folder view (right-click menu)
    TestSettingsModal.tsx   # wizard step 1: name, description, settings
    QuestionForm.tsx        # add/edit single question with options
    BulkImportTab.tsx       # textarea + preview + import
  App.tsx                   # MODIFY: add /folders/:id and /tests/:id/edit routes
```

---

### Task 1: DB Schema — tests, questions, options tables

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/` (generated)

**Interfaces:**
- Produces: `tests`, `questions`, `options` Drizzle table objects exported from `schema.ts`

- [ ] **Step 1: Add tables to schema**

Open `apps/backend/src/db/schema.ts` and append:

```typescript
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
```

Also add `integer` and `boolean` to the existing import line at the top of `schema.ts`:
```typescript
import { pgTable, text, uuid, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Generate migration**

```bash
cd apps/backend && npm run db:generate
```

Expected: new file in `drizzle/migrations/` with CREATE TABLE for tests, questions, options.

- [ ] **Step 3: Run migration**

```bash
cd apps/backend && npm run db:migrate
```

Expected: migration applied, no errors.

- [ ] **Step 4: Verify tables in DB**

```bash
psql postgresql://macbookpro@localhost:5432/testplatform -c "\dt"
```

Expected: `tests`, `questions`, `options` listed.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/
git commit -m "feat: add tests, questions, options tables to schema"
```

---

### Task 2: Tests Module (Backend)

**Files:**
- Create: `apps/backend/src/tests/tests.module.ts`
- Create: `apps/backend/src/tests/tests.controller.ts`
- Create: `apps/backend/src/tests/tests.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/tests.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard` from `../auth/jwt-auth.guard`, `req.admin.id` (string UUID)
- Consumes: `tests` table from `../db/schema`, `db` from `../db`
- Produces: `GET /api/v1/tests?folder_id=:id` → `Array<Test>`
- Produces: `POST /api/v1/tests` body `{ folderId, name, description?, timeLimit?, showResults?, shuffleQuestions?, shuffleOptions?, oneByOne?, deadline? }` → `Test`
- Produces: `GET /api/v1/tests/:id` → `Test & { questions: Array<Question & { options: Option[] }> }`
- Produces: `PATCH /api/v1/tests/:id` body (any subset of POST body except folderId) → `Test`
- Produces: `DELETE /api/v1/tests/:id` → 204

```typescript
// Test type (returned by all endpoints):
interface Test {
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
  deadline: string | null;
  createdAt: string;
}
```

- [ ] **Step 1: Write failing e2e test**

`apps/backend/test/tests.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders } from '../src/db/schema';

describe('Tests (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let folderId: string;
  let testId: string;

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

    const folderRes = await db.insert(folders).values({
      adminId: loginRes.body.admin.id,
      name: 'Test Folder for Tests',
    }).returning();
    folderId = folderRes[0].id;
  });

  afterAll(() => app.close());

  it('POST /api/v1/tests - create test', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId, name: 'Math Quiz', showResults: 'immediately' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Math Quiz');
    expect(res.body.folderId).toBe(folderId);
    testId = res.body.id;
  });

  it('GET /api/v1/tests?folder_id= - list tests', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests?folder_id=${folderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((t: any) => t.id === testId)).toBe(true);
  });

  it('GET /api/v1/tests/:id - get test detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testId);
    expect(Array.isArray(res.body.questions)).toBe(true);
  });

  it('PATCH /api/v1/tests/:id - update test', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Quiz', timeLimit: 30 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Quiz');
    expect(res.body.timeLimit).toBe(30);
  });

  it('DELETE /api/v1/tests/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/tests/${testId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/tests - 401 without token', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/tests?folder_id=${folderId}`);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=tests
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create tests service**

`apps/backend/src/tests/tests.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, questions, options } from '../db/schema';
import { and, eq } from 'drizzle-orm';

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
          with: {
            options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async create(adminId: string, data: {
    folderId: string;
    name: string;
    description?: string;
    timeLimit?: number;
    showResults?: string;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    oneByOne?: boolean;
    deadline?: string;
  }) {
    const [test] = await db.insert(tests).values({
      adminId,
      folderId: data.folderId,
      name: data.name,
      description: data.description,
      timeLimit: data.timeLimit,
      showResults: data.showResults ?? 'immediately',
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      oneByOne: data.oneByOne ?? false,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
    }).returning();
    return test;
  }

  async update(id: string, adminId: string, data: {
    name?: string;
    description?: string;
    timeLimit?: number | null;
    showResults?: string;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    oneByOne?: boolean;
    deadline?: string | null;
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

- [ ] **Step 4: Create tests controller**

`apps/backend/src/tests/tests.controller.ts`:
```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, HttpCode } from '@nestjs/common';
import { TestsService } from './tests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsOptional, IsInt, IsBoolean, IsIn, Min, IsDateString, MinLength } from 'class-validator';

class CreateTestDto {
  @IsString() folderId: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsDateString() deadline?: string;
}

class UpdateTestDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) timeLimit?: number;
  @IsOptional() @IsIn(['immediately', 'after_deadline', 'hidden']) showResults?: string;
  @IsOptional() @IsBoolean() shuffleQuestions?: boolean;
  @IsOptional() @IsBoolean() shuffleOptions?: boolean;
  @IsOptional() @IsBoolean() oneByOne?: boolean;
  @IsOptional() @IsDateString() deadline?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(private testsService: TestsService) {}

  @Get()
  findAll(@Query('folder_id') folderId: string, @Req() req: any) {
    return this.testsService.findAll(folderId, req.admin.id);
  }

  @Post()
  create(@Body() dto: CreateTestDto, @Req() req: any) {
    return this.testsService.create(req.admin.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.testsService.findOne(id, req.admin.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestDto, @Req() req: any) {
    return this.testsService.update(id, req.admin.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.testsService.remove(id, req.admin.id);
  }
}
```

- [ ] **Step 5: Create tests module**

`apps/backend/src/tests/tests.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
```

- [ ] **Step 6: Add Drizzle relations to schema.ts**

Append to `apps/backend/src/db/schema.ts`:
```typescript
import { relations } from 'drizzle-orm';

export const testsRelations = relations(tests, ({ many }) => ({
  questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  test: one(tests, { fields: [questions.testId], references: [tests.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  question: one(questions, { fields: [options.questionId], references: [questions.id] }),
}));
```

- [ ] **Step 7: Register TestsModule in AppModule**

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule, TestsModule],
})
export class AppModule {}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=tests
```

Expected: 6/6 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/tests/ apps/backend/src/app.module.ts apps/backend/src/db/schema.ts apps/backend/test/tests.e2e-spec.ts
git commit -m "feat: add tests module with CRUD"
```

---

### Task 3: Questions Module (Backend)

**Files:**
- Create: `apps/backend/src/questions/questions.module.ts`
- Create: `apps/backend/src/questions/questions.controller.ts`
- Create: `apps/backend/src/questions/questions.service.ts`
- Create: `apps/backend/src/questions/bulk-parser.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/questions.e2e-spec.ts`

**Interfaces:**
- Consumes: `tests`, `questions`, `options` from `../db/schema`, `db` from `../db`
- Consumes: `JwtAuthGuard`, `req.admin.id`
- Produces: `POST /api/v1/tests/:testId/questions` body `{ text, type, options: [{text, isCorrect}] }` → Question with options
- Produces: `POST /api/v1/tests/:testId/questions/bulk` body `{ text: string }` → `{ imported: number }`
- Produces: `PATCH /api/v1/questions/:id` body `{ text?, type?, orderIndex?, options? }` → Question
- Produces: `DELETE /api/v1/questions/:id` → 204
- Produces: `PATCH /api/v1/options/:id` body `{ text?, isCorrect?, orderIndex? }` → Option
- Produces: `DELETE /api/v1/options/:id` → 204
- Produces: `parseBulk(text: string): Array<{ text: string, type: 'single'|'multi'|'open', options: Array<{ text: string, isCorrect: boolean }> }>`

- [ ] **Step 1: Write failing e2e test**

`apps/backend/test/questions.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests } from '../src/db/schema';

describe('Questions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let testId: string;
  let questionId: string;
  let optionId: string;

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

    const [folder] = await db.insert(folders).values({ adminId, name: 'Q Test Folder' }).returning();
    const [test] = await db.insert(tests).values({ adminId, folderId: folder.id, name: 'Q Test' }).returning();
    testId = test.id;
  });

  afterAll(() => app.close());

  it('POST /api/v1/tests/:id/questions - add single-choice question', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tests/${testId}/questions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'What is 2+2?',
        type: 'single',
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('What is 2+2?');
    expect(res.body.options).toHaveLength(3);
    questionId = res.body.id;
    optionId = res.body.options[0].id;
  });

  it('PATCH /api/v1/questions/:id - update question', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'What is 3+3?' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('What is 3+3?');
  });

  it('PATCH /api/v1/options/:id - update option', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/options/${optionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated option', isCorrect: false });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Updated option');
  });

  it('POST /api/v1/tests/:id/questions/bulk - bulk import', async () => {
    const bulkText = `# Capital of France?
+ Paris
- London
- Berlin

# Open question here

# Multi correct
+ First correct
+ Second correct
- Wrong one`;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tests/${testId}/questions/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: bulkText });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(3);
  });

  it('DELETE /api/v1/questions/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('DELETE /api/v1/options/:id - 404 after question deleted', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/options/${optionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=questions
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create bulk parser**

`apps/backend/src/questions/bulk-parser.ts`:
```typescript
interface ParsedOption {
  text: string;
  isCorrect: boolean;
}

interface ParsedQuestion {
  text: string;
  type: 'single' | 'multi' | 'open';
  options: ParsedOption[];
}

export function parseBulk(input: string): ParsedQuestion[] {
  const lines = input.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const result: ParsedQuestion[] = [];
  let current: ParsedQuestion | null = null;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (current) result.push(finalize(current));
      current = { text: line.slice(2).trim(), type: 'open', options: [] };
    } else if (line.startsWith('+ ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: true });
    } else if (line.startsWith('- ') && current) {
      current.options.push({ text: line.slice(2).trim(), isCorrect: false });
    }
  }

  if (current) result.push(finalize(current));
  return result;
}

function finalize(q: ParsedQuestion): ParsedQuestion {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.options.length === 0) q.type = 'open';
  else if (correctCount >= 2) q.type = 'multi';
  else q.type = 'single';
  return q;
}
```

- [ ] **Step 4: Create questions service**

`apps/backend/src/questions/questions.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { questions, options, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { parseBulk } from './bulk-parser';

@Injectable()
export class QuestionsService {
  private async verifyTestOwnership(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  private async verifyQuestionOwnership(questionId: string, adminId: string) {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, questionId),
      with: { test: true },
    });
    if (!question || question.test.adminId !== adminId) throw new NotFoundException('Question not found');
    return question;
  }

  private async verifyOptionOwnership(optionId: string, adminId: string) {
    const option = await db.query.options.findFirst({
      where: eq(options.id, optionId),
      with: { question: { with: { test: true } } },
    });
    if (!option || option.question.test.adminId !== adminId) throw new NotFoundException('Option not found');
    return option;
  }

  async addQuestion(testId: string, adminId: string, data: {
    text: string;
    type: string;
    options: Array<{ text: string; isCorrect: boolean; orderIndex?: number }>;
  }) {
    await this.verifyTestOwnership(testId, adminId);
    const existing = await db.query.questions.findMany({ where: eq(questions.testId, testId) });
    const [question] = await db.insert(questions).values({
      testId,
      text: data.text,
      type: data.type,
      orderIndex: existing.length,
    }).returning();

    const insertedOptions = data.options.length > 0
      ? await db.insert(options).values(
          data.options.map((o, i) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex ?? i,
          }))
        ).returning()
      : [];

    return { ...question, options: insertedOptions };
  }

  async bulkImport(testId: string, adminId: string, text: string) {
    await this.verifyTestOwnership(testId, adminId);
    const parsed = parseBulk(text);
    const existing = await db.query.questions.findMany({ where: eq(questions.testId, testId) });
    let orderOffset = existing.length;

    for (const q of parsed) {
      const [question] = await db.insert(questions).values({
        testId,
        text: q.text,
        type: q.type,
        orderIndex: orderOffset++,
      }).returning();

      if (q.options.length > 0) {
        await db.insert(options).values(
          q.options.map((o, i) => ({
            questionId: question.id,
            text: o.text,
            isCorrect: o.isCorrect,
            orderIndex: i,
          }))
        );
      }
    }

    return { imported: parsed.length };
  }

  async updateQuestion(id: string, adminId: string, data: { text?: string; type?: string; orderIndex?: number }) {
    await this.verifyQuestionOwnership(id, adminId);
    const [question] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return question;
  }

  async removeQuestion(id: string, adminId: string) {
    await this.verifyQuestionOwnership(id, adminId);
    await db.delete(questions).where(eq(questions.id, id));
  }

  async updateOption(id: string, adminId: string, data: { text?: string; isCorrect?: boolean; orderIndex?: number }) {
    await this.verifyOptionOwnership(id, adminId);
    const [option] = await db.update(options).set(data).where(eq(options.id, id)).returning();
    return option;
  }

  async removeOption(id: string, adminId: string) {
    await this.verifyOptionOwnership(id, adminId);
    await db.delete(options).where(eq(options.id, id));
  }
}
```

- [ ] **Step 5: Create questions controller**

`apps/backend/src/questions/questions.controller.ts`:
```typescript
import { Controller, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsIn, MinLength, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OptionDto {
  @IsString() @MinLength(1) text: string;
  @IsBoolean() isCorrect: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

class CreateQuestionDto {
  @IsString() @MinLength(1) text: string;
  @IsIn(['single', 'multi', 'open']) type: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options: OptionDto[];
}

class UpdateQuestionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsIn(['single', 'multi', 'open']) type?: string;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

class BulkImportDto {
  @IsString() @MinLength(1) text: string;
}

class UpdateOptionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsBoolean() isCorrect?: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  @Post('tests/:testId/questions')
  addQuestion(@Param('testId') testId: string, @Body() dto: CreateQuestionDto, @Req() req: any) {
    return this.questionsService.addQuestion(testId, req.admin.id, dto);
  }

  @Post('tests/:testId/questions/bulk')
  bulkImport(@Param('testId') testId: string, @Body() dto: BulkImportDto, @Req() req: any) {
    return this.questionsService.bulkImport(testId, req.admin.id, dto.text);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto, @Req() req: any) {
    return this.questionsService.updateQuestion(id, req.admin.id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  removeQuestion(@Param('id') id: string, @Req() req: any) {
    return this.questionsService.removeQuestion(id, req.admin.id);
  }

  @Patch('options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto, @Req() req: any) {
    return this.questionsService.updateOption(id, req.admin.id, dto);
  }

  @Delete('options/:id')
  @HttpCode(204)
  removeOption(@Param('id') id: string, @Req() req: any) {
    return this.questionsService.removeOption(id, req.admin.id);
  }
}
```

- [ ] **Step 6: Create questions module**

`apps/backend/src/questions/questions.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
```

- [ ] **Step 7: Register QuestionsModule in AppModule**

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import { TestsModule } from './tests/tests.module';
import { QuestionsModule } from './questions/questions.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule, TestsModule, QuestionsModule],
})
export class AppModule {}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=questions
```

Expected: 6/6 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/questions/ apps/backend/src/app.module.ts apps/backend/test/questions.e2e-spec.ts
git commit -m "feat: add questions module with bulk import parser"
```

---

### Task 4: Frontend API + Stores for Tests & Questions

**Files:**
- Create: `apps/frontend/src/api/tests.ts`
- Create: `apps/frontend/src/api/questions.ts`
- Create: `apps/frontend/src/stores/testStore.ts`
- Create: `apps/frontend/src/stores/questionStore.ts`

**Interfaces:**
- Consumes: `client` from `./client`
- Produces: `useTestStore()` → `{ tests, fetchTests(folderId), createTest(data), updateTest(id,data), deleteTest(id) }`
- Produces: `useQuestionStore()` → `{ questions, fetchQuestions(testId), addQuestion(data), bulkImport(testId,text), updateQuestion(id,data), deleteQuestion(id) }`

```typescript
// Test type
interface Test {
  id: string; folderId: string; adminId: string; name: string;
  description: string | null; timeLimit: number | null;
  showResults: string; shuffleQuestions: boolean; shuffleOptions: boolean;
  oneByOne: boolean; deadline: string | null; createdAt: string;
}

// Question type
interface Question {
  id: string; testId: string; text: string;
  type: 'single' | 'multi' | 'open'; orderIndex: number; createdAt: string;
  options: Option[];
}

// Option type
interface Option {
  id: string; questionId: string; text: string;
  isCorrect: boolean; orderIndex: number;
}
```

- [ ] **Step 1: Create tests API**

`apps/frontend/src/api/tests.ts`:
```typescript
import client from './client';

export interface Test {
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
  deadline: string | null;
  createdAt: string;
}

export interface TestDetail extends Test {
  questions: import('./questions').Question[];
}

export type CreateTestData = {
  folderId: string;
  name: string;
  description?: string;
  timeLimit?: number;
  showResults?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  oneByOne?: boolean;
  deadline?: string;
};

export async function apiFetchTests(folderId: string): Promise<Test[]> {
  const res = await client.get('/tests', { params: { folder_id: folderId } });
  return res.data;
}

export async function apiGetTest(id: string): Promise<TestDetail> {
  const res = await client.get(`/tests/${id}`);
  return res.data;
}

export async function apiCreateTest(data: CreateTestData): Promise<Test> {
  const res = await client.post('/tests', data);
  return res.data;
}

export async function apiUpdateTest(id: string, data: Partial<Omit<CreateTestData, 'folderId'>>): Promise<Test> {
  const res = await client.patch(`/tests/${id}`, data);
  return res.data;
}

export async function apiDeleteTest(id: string): Promise<void> {
  await client.delete(`/tests/${id}`);
}
```

- [ ] **Step 2: Create questions API**

`apps/frontend/src/api/questions.ts`:
```typescript
import client from './client';

export interface Option {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface Question {
  id: string;
  testId: string;
  text: string;
  type: 'single' | 'multi' | 'open';
  orderIndex: number;
  createdAt: string;
  options: Option[];
}

export async function apiAddQuestion(testId: string, data: {
  text: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
}): Promise<Question> {
  const res = await client.post(`/tests/${testId}/questions`, data);
  return res.data;
}

export async function apiBulkImport(testId: string, text: string): Promise<{ imported: number }> {
  const res = await client.post(`/tests/${testId}/questions/bulk`, { text });
  return res.data;
}

export async function apiUpdateQuestion(id: string, data: { text?: string; type?: string; orderIndex?: number }): Promise<Question> {
  const res = await client.patch(`/questions/${id}`, data);
  return res.data;
}

export async function apiDeleteQuestion(id: string): Promise<void> {
  await client.delete(`/questions/${id}`);
}

export async function apiUpdateOption(id: string, data: { text?: string; isCorrect?: boolean; orderIndex?: number }): Promise<Option> {
  const res = await client.patch(`/options/${id}`, data);
  return res.data;
}

export async function apiDeleteOption(id: string): Promise<void> {
  await client.delete(`/options/${id}`);
}
```

- [ ] **Step 3: Create test store**

`apps/frontend/src/stores/testStore.ts`:
```typescript
import { create } from 'zustand';
import { apiFetchTests, apiCreateTest, apiUpdateTest, apiDeleteTest, type Test, type CreateTestData } from '../api/tests';

interface TestState {
  tests: Test[];
  fetchTests: (folderId: string) => Promise<void>;
  createTest: (data: CreateTestData) => Promise<Test>;
  updateTest: (id: string, data: Partial<Omit<CreateTestData, 'folderId'>>) => Promise<void>;
  deleteTest: (id: string) => Promise<void>;
}

export const useTestStore = create<TestState>((set, get) => ({
  tests: [],
  fetchTests: async (folderId) => {
    const tests = await apiFetchTests(folderId);
    set({ tests });
  },
  createTest: async (data) => {
    const test = await apiCreateTest(data);
    set({ tests: [...get().tests, test] });
    return test;
  },
  updateTest: async (id, data) => {
    const updated = await apiUpdateTest(id, data);
    set({ tests: get().tests.map((t) => (t.id === id ? updated : t)) });
  },
  deleteTest: async (id) => {
    await apiDeleteTest(id);
    set({ tests: get().tests.filter((t) => t.id !== id) });
  },
}));
```

- [ ] **Step 4: Create question store**

`apps/frontend/src/stores/questionStore.ts`:
```typescript
import { create } from 'zustand';
import { apiAddQuestion, apiBulkImport, apiUpdateQuestion, apiDeleteQuestion, type Question } from '../api/questions';

interface QuestionState {
  questions: Question[];
  setQuestions: (questions: Question[]) => void;
  addQuestion: (testId: string, data: { text: string; type: string; options: Array<{ text: string; isCorrect: boolean }> }) => Promise<void>;
  bulkImport: (testId: string, text: string) => Promise<number>;
  updateQuestion: (id: string, data: { text?: string; type?: string; orderIndex?: number }) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
}

export const useQuestionStore = create<QuestionState>((set, get) => ({
  questions: [],
  setQuestions: (questions) => set({ questions }),
  addQuestion: async (testId, data) => {
    const question = await apiAddQuestion(testId, data);
    set({ questions: [...get().questions, question] });
  },
  bulkImport: async (testId, text) => {
    const { imported } = await apiBulkImport(testId, text);
    return imported;
  },
  updateQuestion: async (id, data) => {
    const updated = await apiUpdateQuestion(id, data);
    set({ questions: get().questions.map((q) => (q.id === id ? updated : q)) });
  },
  deleteQuestion: async (id) => {
    await apiDeleteQuestion(id);
    set({ questions: get().questions.filter((q) => q.id !== id) });
  },
}));
```

- [ ] **Step 5: Verify build passes**

```bash
cd apps/frontend && npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/tests.ts apps/frontend/src/api/questions.ts apps/frontend/src/stores/testStore.ts apps/frontend/src/stores/questionStore.ts
git commit -m "feat: add frontend API and stores for tests and questions"
```

---

### Task 5: Frontend Pages & Components

**Files:**
- Create: `apps/frontend/src/components/TestCard.tsx`
- Create: `apps/frontend/src/components/TestSettingsModal.tsx`
- Create: `apps/frontend/src/components/QuestionForm.tsx`
- Create: `apps/frontend/src/components/BulkImportTab.tsx`
- Create: `apps/frontend/src/pages/FolderViewPage.tsx`
- Create: `apps/frontend/src/pages/QuestionEditorPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useTestStore()`, `useQuestionStore()`, `apiGetTest`, `useAuthStore()`
- Produces: routes `/folders/:id` and `/tests/:id/edit`

- [ ] **Step 1: Create TestCard**

`apps/frontend/src/components/TestCard.tsx`:
```tsx
import type { Test } from '../api/tests';

interface Props {
  test: Test;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function TestCard({ test, onDoubleClick, onContextMenu }: Props) {
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
    </div>
  );
}
```

- [ ] **Step 2: Create TestSettingsModal**

`apps/frontend/src/components/TestSettingsModal.tsx`:
```tsx
import { useState } from 'react';
import type { CreateTestData } from '../api/tests';

interface Props {
  folderId: string;
  onSubmit: (data: CreateTestData) => void;
  onClose: () => void;
  initial?: Partial<CreateTestData>;
  title?: string;
}

export function TestSettingsModal({ folderId, onSubmit, onClose, initial, title = 'New Test' }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [hasTimeLimit, setHasTimeLimit] = useState(!!initial?.timeLimit);
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimit ?? 30);
  const [showResults, setShowResults] = useState(initial?.showResults ?? 'immediately');
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? false);
  const [oneByOne, setOneByOne] = useState(initial?.oneByOne ?? false);
  const [hasDeadline, setHasDeadline] = useState(!!initial?.deadline);
  const [deadline, setDeadline] = useState(initial?.deadline?.slice(0, 16) ?? '');

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
      deadline: hasDeadline && deadline ? new Date(deadline).toISOString() : undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="font-semibold text-gray-800 mb-4 text-lg">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Test name *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Math Quiz" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2} placeholder="Optional description"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="hasTimeLimit" checked={hasTimeLimit} onChange={(e) => setHasTimeLimit(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="hasTimeLimit" className="text-sm text-gray-700">Time limit</label>
            {hasTimeLimit && (
              <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            )}
            {hasTimeLimit && <span className="text-sm text-gray-500">minutes</span>}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Show results</label>
            <select value={showResults} onChange={(e) => setShowResults(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="immediately">Immediately after submit</option>
              <option value="after_deadline">After deadline</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={oneByOne} onChange={(e) => setOneByOne(e.target.checked)} className="w-4 h-4" />
              Show questions one by one
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4" />
              Shuffle question order
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4" />
              Shuffle answer options
            </label>
          </div>
          <div>
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer mb-2">
              <input type="checkbox" checked={hasDeadline} onChange={(e) => setHasDeadline(e.target.checked)} className="w-4 h-4" />
              Set deadline
            </label>
            {hasDeadline && (
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              {title === 'New Test' ? 'Create & Add Questions' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create QuestionForm**

`apps/frontend/src/components/QuestionForm.tsx`:
```tsx
import { useState } from 'react';

interface OptionInput {
  text: string;
  isCorrect: boolean;
}

interface Props {
  onSubmit: (data: { text: string; type: string; options: OptionInput[] }) => void;
}

export function QuestionForm({ onSubmit }: Props) {
  const [text, setText] = useState('');
  const [type, setType] = useState<'single' | 'multi' | 'open'>('single');
  const [opts, setOpts] = useState<OptionInput[]>([
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ]);

  function addOption() {
    setOpts([...opts, { text: '', isCorrect: false }]);
  }

  function removeOption(i: number) {
    setOpts(opts.filter((_, idx) => idx !== i));
  }

  function toggleCorrect(i: number) {
    if (type === 'single') {
      setOpts(opts.map((o, idx) => ({ ...o, isCorrect: idx === i })));
    } else {
      setOpts(opts.map((o, idx) => idx === i ? { ...o, isCorrect: !o.isCorrect } : o));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const validOpts = opts.filter((o) => o.text.trim());
    onSubmit({ text: text.trim(), type, options: validOpts });
    setText('');
    setType('single');
    setOpts([{ text: '', isCorrect: false }, { text: '', isCorrect: false }]);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="Question text..." required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
      <div className="flex gap-2">
        {(['single', 'multi', 'open'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${type === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-500 hover:border-indigo-300'}`}>
            {t === 'single' ? 'Single choice' : t === 'multi' ? 'Multi choice' : 'Open answer'}
          </button>
        ))}
      </div>
      {type !== 'open' && (
        <div className="flex flex-col gap-2">
          {opts.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={type === 'single' ? 'radio' : 'checkbox'}
                checked={opt.isCorrect} onChange={() => toggleCorrect(i)}
                name="correct" className="w-4 h-4 accent-indigo-500" />
              <input value={opt.text} onChange={(e) => setOpts(opts.map((o, idx) => idx === i ? { ...o, text: e.target.value } : o))}
                placeholder={`Option ${i + 1}`}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
              <button type="button" onClick={() => removeOption(i)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={addOption} className="text-xs text-indigo-500 hover:text-indigo-700 self-start">+ Add option</button>
        </div>
      )}
      <button type="submit" className="self-end text-sm bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600">
        Add Question
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create BulkImportTab**

`apps/frontend/src/components/BulkImportTab.tsx`:
```tsx
import { useState } from 'react';

interface Props {
  onImport: (text: string) => Promise<number>;
}

const HINT = `# Question text
+ Correct answer
- Wrong answer 1
- Wrong answer 2

# Multi-correct question
+ First correct
+ Second correct
- Wrong one

# Open question (no options needed)`;

export function BulkImportTab({ onImport }: Props) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function handlePreview() {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const count = lines.filter((l) => l.startsWith('# ')).length;
    setPreview(`Found ${count} question(s) to import.`);
    setResult(null);
  }

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const imported = await onImport(text);
      setResult(`✓ ${imported} questions imported successfully.`);
      setText('');
      setPreview(null);
    } catch {
      setResult('✗ Import failed. Check format and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 font-mono whitespace-pre">{HINT}</div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setResult(null); }}
        rows={10} placeholder="Paste your questions here..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 font-mono resize-y" />
      {preview && <p className="text-sm text-gray-600">{preview}</p>}
      {result && <p className={`text-sm ${result.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{result}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={handlePreview} disabled={!text.trim()}
          className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Preview
        </button>
        <button type="button" onClick={handleImport} disabled={!text.trim() || loading}
          className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-40">
          {loading ? 'Importing...' : 'Import'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create FolderViewPage**

`apps/frontend/src/pages/FolderViewPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { TestCard } from '../components/TestCard';
import { TestSettingsModal } from '../components/TestSettingsModal';
import { FolderContextMenu } from '../components/FolderContextMenu';
import { useTestStore } from '../stores/testStore';
import { useFolderStore } from '../stores/folderStore';
import type { Test } from '../api/tests';

export function FolderViewPage() {
  const { id: folderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tests, fetchTests, createTest, deleteTest } = useTestStore();
  const { folders } = useFolderStore();
  const [showModal, setShowModal] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; test: Test } | null>(null);

  const folder = folders.find((f) => f.id === folderId);

  useEffect(() => {
    if (folderId) fetchTests(folderId);
  }, [folderId]);

  async function handleCreate(data: any) {
    const test = await createTest(data);
    setShowModal(false);
    navigate(`/tests/${test.id}/edit`);
  }

  async function handleDelete() {
    if (!menu) return;
    if (!confirm(`Delete "${menu.test.name}"?`)) return;
    await deleteTest(menu.test.id);
    setMenu(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← Folders</button>
            <span className="text-gray-400">/</span>
            <h2 className="text-sm font-medium text-gray-700">{folder?.name ?? 'Folder'}</h2>
          </div>
          <button onClick={() => setShowModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600">
            + New Test
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              onDoubleClick={() => navigate(`/tests/${test.id}/edit`)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, test }); }}
            />
          ))}
          {tests.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 w-full text-center">No tests yet. Create one!</p>
          )}
        </div>
      </div>

      {showModal && folderId && (
        <TestSettingsModal folderId={folderId} onSubmit={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {menu && (
        <FolderContextMenu
          x={menu.x} y={menu.y}
          onRename={() => setMenu(null)}
          onChangeColor={() => setMenu(null)}
          onDelete={handleDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create QuestionEditorPage**

`apps/frontend/src/pages/QuestionEditorPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { QuestionForm } from '../components/QuestionForm';
import { BulkImportTab } from '../components/BulkImportTab';
import { useQuestionStore } from '../stores/questionStore';
import { apiGetTest } from '../api/tests';
import type { TestDetail } from '../api/tests';

export function QuestionEditorPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { questions, setQuestions, addQuestion, bulkImport, deleteQuestion } = useQuestionStore();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [tab, setTab] = useState<'manual' | 'bulk'>('manual');

  useEffect(() => {
    if (!testId) return;
    apiGetTest(testId).then((t) => {
      setTest(t);
      setQuestions(t.questions);
    });
  }, [testId]);

  async function handleAddQuestion(data: { text: string; type: string; options: Array<{ text: string; isCorrect: boolean }> }) {
    if (!testId) return;
    await addQuestion(testId, data);
  }

  async function handleBulkImport(text: string) {
    if (!testId) return 0;
    const count = await bulkImport(testId, text);
    const updated = await apiGetTest(testId);
    setQuestions(updated.questions);
    return count;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(`/folders/${test?.folderId}`)} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Back
          </button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{test?.name ?? 'Test'}</h2>
          <span className="text-xs text-gray-400 ml-auto">{questions.length} question(s)</span>
        </div>

        <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 border border-gray-100 w-fit">
          {(['manual', 'bulk'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-indigo-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'manual' ? 'Manual' : 'Bulk Import'}
            </button>
          ))}
        </div>

        {tab === 'manual' ? (
          <QuestionForm onSubmit={handleAddQuestion} />
        ) : (
          <BulkImportTab onImport={handleBulkImport} />
        )}

        {questions.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-gray-500">Questions ({questions.length})</h3>
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-gray-400 mr-2">{i + 1}.</span>
                    <span className="text-sm text-gray-800">{q.text}</span>
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full ${
                      q.type === 'single' ? 'bg-blue-100 text-blue-600' :
                      q.type === 'multi' ? 'bg-purple-100 text-purple-600' :
                      'bg-gray-100 text-gray-500'}`}>
                      {q.type}
                    </span>
                  </div>
                  <button onClick={() => deleteQuestion(q.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                </div>
                {q.options.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {q.options.map((o) => (
                      <li key={o.id} className={`text-xs px-2 py-1 rounded-lg ${o.isCorrect ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>
                        {o.isCorrect ? '✓ ' : '○ '}{o.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update App.tsx with new routes**

`apps/frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminsPage } from './pages/AdminsPage';
import { FolderViewPage } from './pages/FolderViewPage';
import { QuestionEditorPage } from './pages/QuestionEditorPage';
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
        <Route path="/admins" element={<SuperAdminRoute><AdminsPage /></SuperAdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Update DashboardPage to navigate into folders**

Open `apps/frontend/src/pages/DashboardPage.tsx` and find the `onDoubleClick` prop on `FolderCard`. Change it from `() => {}` to:

```tsx
onDoubleClick={() => navigate(`/folders/${folder.id}`)}
```

Also ensure `useNavigate` is imported at the top:
```tsx
import { useNavigate } from 'react-router-dom';
// inside component:
const navigate = useNavigate();
```

- [ ] **Step 9: Verify build passes**

```bash
cd apps/frontend && npm run build
```

Expected: no TypeScript errors, all modules resolved.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/
git commit -m "feat: add folder view, question editor, test settings wizard"
```
