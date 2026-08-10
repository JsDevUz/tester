# My Schools (Mening maktablarim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a school-selection step for students (card list: image, name,
student count, description) right after login, scope "Mening kurslarim" to
the chosen school, and let teachers upload a school logo — web only; mobile
is a separate follow-up plan.

**Architecture:** The `schools`/`schoolMembers`/`groupEnrollments` data
model already supports a student belonging to multiple schools; this plan
adds one column (`schools.imageUrl`), one new student-facing endpoint
(`GET /my/schools`), a `schoolId` filter on the existing `GET /my/courses`,
and on the frontend a new `/schools` list page + `studentSchoolStore` that
gates the existing `MyCoursesPage` (now mounted at
`/schools/:schoolId/courses`) behind a school pick. `StudentShell` gains a
`restrictedNav` mode for the picker screen. Teacher-side logo upload
extends the existing "Maktab sozlamalari" page using the exact upload
pattern `EditProfileSection.tsx` already uses for avatars.

**Tech Stack:** NestJS + Drizzle ORM (backend), React + React Router +
Zustand + Tailwind (frontend). No new dependencies.

## Global Constraints

- All new UI copy is Uzbek, matching the existing app's tone (see
  `SchoolSettingsPage.tsx`, `MyCoursesPage.tsx` for reference phrasing).
- Follow existing patterns exactly: DTOs use `class-validator` decorators
  matching neighboring DTOs in the same controller file; API client
  functions go in the same file as their sibling endpoints
  (`api/school.ts`, `api/groups.ts`); Zustand stores follow the shape of
  `schoolStore.ts` / `authStore.ts`.
- No new npm dependencies for this plan.
- Migrations are generated via `npm run db:generate --workspace=apps/backend`
  (drizzle-kit), never hand-written.
- Backend e2e tests live in `apps/backend/test/*.e2e-spec.ts`, run against
  the real dev database through the actual `AppModule` (see
  `apps/backend/test/folders.e2e-spec.ts` for the canonical bootstrap: a
  `beforeAll` that creates a Nest app with `setGlobalPrefix('api/v1')` and
  logs in via `POST /api/v1/auth/login` using `SUPER_ADMIN_EMAIL`/
  `SUPER_ADMIN_PASSWORD` env vars). All API paths in tests are prefixed
  `/api/v1/`. There is no shared fixture factory for student accounts —
  each spec that needs one creates it inline via the real endpoints
  (`POST /api/v1/school/students` then `POST /api/v1/auth/login`), the
  same way a real teacher would.
- Frontend has no `typecheck` script; use `npm run build --workspace=apps/frontend`
  (runs `tsc -b && vite build`) to verify type correctness. Frontend dev
  server: `npm run dev --workspace=apps/frontend`.
- Backend e2e runs: `npm run test:e2e --workspace=apps/backend`. To scope
  to one file, pass Jest's own filter: `npm run test:e2e --workspace=apps/backend -- schools.e2e-spec` (Jest matches by filename substring, not a `--` package-script convention).

---

## File Structure

**Backend — modify:**
- `apps/backend/src/db/schema.ts` — add `imageUrl` column to `schools`.
- `apps/backend/src/schools/schools.controller.ts` — `UpdateSchoolDto`
  gains `imageUrl`.
- `apps/backend/src/schools/schools.service.ts` — `updateSchool()` type
  signature gains `imageUrl`.
- `apps/backend/src/groups/groups.controller.ts` — new `GET my/schools`
  route; `GET my/courses` gains optional `schoolId` query param.
- `apps/backend/src/groups/groups.service.ts` — new `getMySchools()`
  method; `getMyCourses()` gains optional `schoolId` filter parameter.

**Backend — create:**
- New migration under `apps/backend/drizzle/migrations/` (auto-generated
  filename).

**Frontend — modify:**
- `apps/frontend/src/api/school.ts` — `ApiSchool` gains `imageUrl`.
- `apps/frontend/src/api/groups.ts` — `ApiMyCourse` type unchanged;
  `apiGetMyCourses()` gains an optional `schoolId` param; new
  `ApiMySchool` type + `apiGetMySchools()`.
- `apps/frontend/src/stores/schoolStore.ts` — add `imageUrl` to state +
  new `setSchoolImage()` action.
- `apps/frontend/src/pages/SchoolSettingsPage.tsx` — add logo upload UI.
- `apps/frontend/src/pages/MyCoursesPage.tsx` — read `schoolId` from route
  params, pass through to `apiGetMyCourses`.
- `apps/frontend/src/components/student/StudentShell.tsx` — add
  `restrictedNav` prop.
- `apps/frontend/src/App.tsx` — route changes (see Task 6).

**Frontend — create:**
- `apps/frontend/src/stores/studentSchoolStore.ts` — new Zustand store.
- `apps/frontend/src/pages/SchoolsListPage.tsx` — new school-picker page.

---

### Task 1: `schools.imageUrl` column + teacher-side update/read support

**Files:**
- Modify: `apps/backend/src/db/schema.ts` (schools table, around line 378-387)
- Modify: `apps/backend/src/schools/schools.controller.ts:8-11` (`UpdateSchoolDto`)
- Modify: `apps/backend/src/schools/schools.service.ts:85` (`updateSchool` signature)
- Test: `apps/backend/test/schools.e2e-spec.ts` (create if it doesn't exist — check first with `find apps/backend/test -iname "*school*"`)

**Interfaces:**
- Produces: `schools.imageUrl: string | null` column; `SchoolsService.updateSchool(adminId: string, data: { name?: string; description?: string; imageUrl?: string }): Promise<school row with imageUrl>`. `GET /school` and `PATCH /school` responses now include `imageUrl`.

- [ ] **Step 1: Add the column to the schema**

In `apps/backend/src/db/schema.ts`, find the `schools` table definition:

```ts
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Mening maktabim'),
  description: text('description').notNull().default(''),
  inviteToken: text('invite_token').notNull().unique(),
  inviteRegenerationCount: integer('invite_regeneration_count').notNull().default(0),
  inviteRegenerationWindowStartedAt: timestamp('invite_regeneration_window_started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

Add `imageUrl` right after `description`:

```ts
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Mening maktabim'),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  inviteToken: text('invite_token').notNull().unique(),
  inviteRegenerationCount: integer('invite_regeneration_count').notNull().default(0),
  inviteRegenerationWindowStartedAt: timestamp('invite_regeneration_window_started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Generate and inspect the migration**

Run: `npm run db:generate --workspace=apps/backend`
Expected: a new file `apps/backend/drizzle/migrations/00XX_<name>.sql`
containing exactly `ALTER TABLE "schools" ADD COLUMN "image_url" text;` and
a matching entry appended to
`apps/backend/drizzle/migrations/meta/_journal.json`. Open the generated
SQL file and confirm it has no unrelated changes.

- [ ] **Step 3: Run the migration against the local dev database**

Run: `npm run db:migrate --workspace=apps/backend`
Expected: migration applies with no errors.

- [ ] **Step 4: Update `UpdateSchoolDto` to accept `imageUrl`**

In `apps/backend/src/schools/schools.controller.ts`, change:

```ts
class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}
```

to:

```ts
class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
}
```

- [ ] **Step 5: Update `updateSchool()`'s type signature**

In `apps/backend/src/schools/schools.service.ts`, change:

```ts
async updateSchool(adminId: string, data: { name?: string; description?: string }) {
```

to:

```ts
async updateSchool(adminId: string, data: { name?: string; description?: string; imageUrl?: string }) {
```

The method body (`db.update(schools).set(data)...`) needs no change —
Drizzle's `.set(data)` already passes through whatever keys are present.

- [ ] **Step 6: Create `schools.e2e-spec.ts`**

No school-focused e2e spec exists yet (confirm with `find apps/backend/test
-iname "*school*"` — it should return nothing). Create
`apps/backend/test/schools.e2e-spec.ts`, mirroring the bootstrap pattern
from `apps/backend/test/folders.e2e-spec.ts:1-24` exactly (same imports,
same `beforeAll` shape, same `/api/v1` prefix, same
`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` login):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Schools (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = res.body.access_token;
  });

  afterAll(() => app.close());

  it('PATCH /api/v1/school updates imageUrl and GET /api/v1/school returns it', async () => {
    const patchRes = await request(app.getHttpServer())
      .patch('/api/v1/school')
      .set('Authorization', `Bearer ${token}`)
      .send({ imageUrl: 'https://cdn.example.com/school-logo.png' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.imageUrl).toBe('https://cdn.example.com/school-logo.png');

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/school')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.imageUrl).toBe('https://cdn.example.com/school-logo.png');
  });

  it('GET /api/v1/school - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/school');
    expect(res.status).toBe(401);
  });
});
```

Note the login here uses `email`/`password` in the request body per
`folders.e2e-spec.ts:19-20` even though `LoginDto`
(`apps/backend/src/auth/auth.controller.ts:11-14`) is typed for
`phone`/`password` — this matches the existing working pattern in every
other e2e spec in this suite (the super admin account apparently
authenticates by email through the same endpoint); do not "fix" this
mismatch, just copy the existing working call.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:e2e --workspace=apps/backend -- schools.e2e-spec`
Expected: PASS (the endpoint already forwards arbitrary DTO fields to
`.set()`, so this should pass without further implementation changes —
if it fails, the DTO or service signature edit in Steps 4-5 was missed).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations apps/backend/src/schools/schools.controller.ts apps/backend/src/schools/schools.service.ts apps/backend/test
git commit -m "feat: add imageUrl column to schools table"
```

---

### Task 2: `GET /my/schools` endpoint

**Files:**
- Modify: `apps/backend/src/groups/groups.controller.ts:134-139` (add route after `getMyCourses`)
- Modify: `apps/backend/src/groups/groups.service.ts:311` (add `getMySchools` method after `getMyCourses`, which ends at line 387)
- Test: `apps/backend/test/groups.e2e-spec.ts` (check if it exists first: `find apps/backend/test -iname "*groups*"`; if not, follow the same bootstrap pattern used in Task 1)

**Interfaces:**
- Consumes: `db.query.schoolMembers`, `db.query.schools`, `db.query.groupEnrollments` (all already imported in `groups.service.ts:3`).
- Produces: `GroupsService.getMySchools(studentId: string): Promise<Array<{ id: string; name: string; description: string; imageUrl: string | null; studentCount: number; courseCount: number }>>`. Route: `GET /my/schools`, `@Roles('student')`.

- [ ] **Step 1: Write the service method**

In `apps/backend/src/groups/groups.service.ts`, insert this new method
directly after `getMyCourses` ends (after line 387, the closing `}` before
`async getMyCourseLeaderboard`):

```ts
  async getMySchools(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    if (memberships.length === 0) return [];

    const schoolIds = [...new Set(memberships.map((m) => m.schoolId))];
    const schoolRows = await db.query.schools.findMany({
      where: (s, { inArray }) => inArray(s.id, schoolIds),
    });

    return Promise.all(
      schoolRows.map(async (school) => {
        const allMembers = await db.query.schoolMembers.findMany({
          where: eq(schoolMembers.schoolId, school.id),
        });
        const studentCount = allMembers.filter((m) => m.role === 'student').length;

        const memberIds = allMembers.map((m) => m.id);
        const enrollments = memberIds.length
          ? await db.query.groupEnrollments.findMany({
              where: (e, { inArray }) => and(inArray(e.schoolMemberId, memberIds), isNull(e.removedAt)),
              with: { group: true },
            })
          : [];
        const courseCount = new Set(enrollments.map((e) => e.group.courseId)).size;

        return {
          id: school.id,
          name: school.name,
          description: school.description,
          imageUrl: school.imageUrl,
          studentCount,
          courseCount,
        };
      }),
    );
  }
```

This mirrors `getMyCourses`'s existing membership-walking pattern
(`groups.service.ts:311-319`) but groups by school instead of flattening.

- [ ] **Step 2: Add the controller route**

In `apps/backend/src/groups/groups.controller.ts`, insert directly after
the existing `getMyCourses` route (after line 139):

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/schools')
  getMySchools(@Req() req: any) {
    return this.groupsService.getMySchools(req.user.id);
  }
```

- [ ] **Step 3: Create `groups.e2e-spec.ts` with a real student fixture**

No groups-focused e2e spec exists yet (confirm with `find apps/backend/test
-iname "*groups*"`). Create `apps/backend/test/groups.e2e-spec.ts`, using
the same bootstrap as Task 1 Step 6, then create a real student through
the actual signup path (`POST /api/v1/school/students`, which auto-enrolls
the student into the caller's school per
`schools.service.ts:144-168`) and log that student in for the assertions:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Groups / My Schools (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let studentToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const teacherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    teacherToken = teacherRes.body.access_token;

    const phone = `+998${Math.floor(900000000 + Math.random() * 99999999)}`;
    await request(app.getHttpServer())
      .post('/api/v1/school/students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'My Schools Test Student', phone, password: 'testpass123' });

    const studentLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone, password: 'testpass123' });
    studentToken = studentLoginRes.body.access_token;
  });

  afterAll(() => app.close());

  it('GET /api/v1/my/schools returns the school the student was enrolled into, with counts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/my/schools')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      studentCount: expect.any(Number),
      courseCount: expect.any(Number),
    });
    expect(res.body[0].studentCount).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/my/schools - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/my/schools');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:e2e --workspace=apps/backend -- groups.e2e-spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/groups/groups.controller.ts apps/backend/src/groups/groups.service.ts apps/backend/test
git commit -m "feat: add GET /my/schools endpoint"
```

---

### Task 3: `schoolId` filter on `GET /my/courses`

**Files:**
- Modify: `apps/backend/src/groups/groups.controller.ts:134-139`
- Modify: `apps/backend/src/groups/groups.service.ts:311-319`
- Test: `apps/backend/test/groups.e2e-spec.ts`

**Interfaces:**
- Produces: `GroupsService.getMyCourses(studentId: string, schoolId?: string): Promise<ApiMyCourse[]>` (return shape unchanged from today, only the input set is filtered). Route: `GET /my/courses?schoolId=<uuid>` (schoolId optional, backward compatible).

- [ ] **Step 1: Add the filter parameter to the service method**

In `apps/backend/src/groups/groups.service.ts`, change the method opening:

```ts
  async getMyCourses(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = memberships.map((m) => m.id);
    if (schoolMemberIds.length === 0) return [];
```

to:

```ts
  async getMyCourses(studentId: string, schoolId?: string) {
    const memberships = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const scopedMemberships = schoolId ? memberships.filter((m) => m.schoolId === schoolId) : memberships;
    const schoolMemberIds = scopedMemberships.map((m) => m.id);
    if (schoolMemberIds.length === 0) return [];
```

Nothing else in the method body changes — `schoolMemberIds` already flows
into the rest of the function unchanged.

- [ ] **Step 2: Add the query param to the controller**

In `apps/backend/src/groups/groups.controller.ts`, change:

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses')
  getMyCourses(@Req() req: any) {
    return this.groupsService.getMyCourses(req.user.id);
  }
```

to:

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses')
  getMyCourses(@Req() req: any, @Query('schoolId') schoolId?: string) {
    return this.groupsService.getMyCourses(req.user.id, schoolId);
  }
```

Add `Query` to the existing `@nestjs/common` import at the top of the file
(`Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req` → add
`Query`).

- [ ] **Step 3: Write the e2e test**

Add to `apps/backend/test/groups.e2e-spec.ts` (created in Task 2 Step 3),
reusing that file's `studentToken` fixture. A second real school would
require a second teacher account, which needs SMS/Telegram verification
(`POST /api/v1/auth/register/request` + `register/verify`) and is not
practical to automate here — so this test proves the filter is genuinely
applied (not silently ignored) by checking it against the one school the
fixture student already belongs to, plus a nonexistent `schoolId`:

```ts
it('GET /api/v1/my/courses?schoolId filters to that school, empty for an unknown schoolId', async () => {
  const schoolsRes = await request(app.getHttpServer())
    .get('/api/v1/my/schools')
    .set('Authorization', `Bearer ${studentToken}`);
  const ownSchoolId = schoolsRes.body[0].id;

  const unfiltered = await request(app.getHttpServer())
    .get('/api/v1/my/courses')
    .set('Authorization', `Bearer ${studentToken}`);
  expect(unfiltered.status).toBe(200);

  const filteredToOwnSchool = await request(app.getHttpServer())
    .get('/api/v1/my/courses')
    .query({ schoolId: ownSchoolId })
    .set('Authorization', `Bearer ${studentToken}`);
  expect(filteredToOwnSchool.status).toBe(200);
  expect(filteredToOwnSchool.body).toEqual(unfiltered.body);

  const filteredToUnknownSchool = await request(app.getHttpServer())
    .get('/api/v1/my/courses')
    .query({ schoolId: '00000000-0000-0000-0000-000000000000' })
    .set('Authorization', `Bearer ${studentToken}`);
  expect(filteredToUnknownSchool.status).toBe(200);
  expect(filteredToUnknownSchool.body).toEqual([]);
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:e2e --workspace=apps/backend -- groups.e2e-spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/groups/groups.controller.ts apps/backend/src/groups/groups.service.ts apps/backend/test
git commit -m "feat: add schoolId filter to GET /my/courses"
```

---

### Task 4: Frontend API clients (`apiGetMySchools`, `imageUrl` types, `schoolId` param)

**Files:**
- Modify: `apps/frontend/src/api/school.ts:3-12` (`ApiSchool` interface, `apiUpdateSchool`)
- Modify: `apps/frontend/src/api/groups.ts:114-132` (`ApiMyCourse`/`apiGetMyCourses`, new `ApiMySchool`/`apiGetMySchools`)

**Interfaces:**
- Consumes: `client` (axios instance, already imported in both files).
- Produces: `ApiSchool.imageUrl: string | null`; `apiUpdateSchool(data: { name?: string; description?: string; imageUrl?: string }): Promise<ApiSchool>`; `ApiMySchool { id, name, description, imageUrl, studentCount, courseCount }`; `apiGetMySchools(): Promise<ApiMySchool[]>`; `apiGetMyCourses(schoolId?: string): Promise<ApiMyCourse[]>`.

- [ ] **Step 1: Update `ApiSchool` and `apiUpdateSchool`**

In `apps/frontend/src/api/school.ts`, change:

```ts
export interface ApiSchool {
  id: string;
  adminId: string;
  name: string;
  description: string;
  inviteToken: string;
  inviteRegenerationsRemaining: number;
  inviteRegenerationResetAt: string | null;
  createdAt: string;
}
```

to:

```ts
export interface ApiSchool {
  id: string;
  adminId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  inviteToken: string;
  inviteRegenerationsRemaining: number;
  inviteRegenerationResetAt: string | null;
  createdAt: string;
}
```

And change:

```ts
export async function apiUpdateSchool(data: { name?: string; description?: string }): Promise<ApiSchool> {
```

to:

```ts
export async function apiUpdateSchool(data: { name?: string; description?: string; imageUrl?: string }): Promise<ApiSchool> {
```

- [ ] **Step 2: Add `schoolId` param to `apiGetMyCourses`**

In `apps/frontend/src/api/groups.ts`, change:

```ts
export async function apiGetMyCourses(): Promise<ApiMyCourse[]> {
  const res = await client.get('/my/courses');
  return res.data;
}
```

to:

```ts
export async function apiGetMyCourses(schoolId?: string): Promise<ApiMyCourse[]> {
  const res = await client.get('/my/courses', { params: schoolId ? { schoolId } : undefined });
  return res.data;
}
```

- [ ] **Step 3: Add `ApiMySchool` and `apiGetMySchools`**

In `apps/frontend/src/api/groups.ts`, insert directly after the
`apiGetMyCourses` function:

```ts
export interface ApiMySchool {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  studentCount: number;
  courseCount: number;
}

export async function apiGetMySchools(): Promise<ApiMySchool[]> {
  const res = await client.get('/my/schools');
  return res.data;
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build --workspace=apps/frontend` (there is no separate
`typecheck` script; `build` runs `tsc -b && vite build` and will fail on
type errors)
Expected: no new errors. Any existing callers of `apiUpdateSchool` or
`apiGetMyCourses` still compile since both new params are optional.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/school.ts apps/frontend/src/api/groups.ts
git commit -m "feat: add school image and my-schools API client functions"
```

---

### Task 5: `studentSchoolStore`

**Files:**
- Create: `apps/frontend/src/stores/studentSchoolStore.ts`
- Test: none (thin Zustand store wrapping the API call already covered by Task 4's build/type check; behavior is exercised through the page component in Task 7's manual verification — this mirrors how `apps/frontend/src/stores/schoolStore.ts` has no dedicated unit test file either)

**Interfaces:**
- Consumes: `apiGetMySchools`, `ApiMySchool` (from `apps/frontend/src/api/groups.ts`, Task 4).
- Produces: `useStudentSchoolStore` hook with state `{ schools: ApiMySchool[]; currentSchoolId: string | null; loaded: boolean }` and actions `loadSchools(): Promise<void>`, `selectSchool(id: string): void`.

- [ ] **Step 1: Write the store**

Create `apps/frontend/src/stores/studentSchoolStore.ts`:

```ts
import { create } from 'zustand';
import { apiGetMySchools, type ApiMySchool } from '../api/groups';

interface StudentSchoolState {
  schools: ApiMySchool[];
  currentSchoolId: string | null;
  loaded: boolean;
  loadSchools: () => Promise<void>;
  selectSchool: (id: string) => void;
}

export const useStudentSchoolStore = create<StudentSchoolState>((set) => ({
  schools: [],
  currentSchoolId: null,
  loaded: false,

  loadSchools: async () => {
    const schools = await apiGetMySchools();
    set({ schools, loaded: true });
  },

  selectSchool: (id) => set({ currentSchoolId: id }),
}));
```

- [ ] **Step 2: Type-check**

Run: `npm run build --workspace=apps/frontend`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/stores/studentSchoolStore.ts
git commit -m "feat: add studentSchoolStore"
```

---

### Task 6: `StudentShell` restricted-nav mode

**Files:**
- Modify: `apps/frontend/src/components/student/StudentShell.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StudentShell({ children, restrictedNav }: { children: ReactNode; restrictedNav?: boolean })`. When `restrictedNav` is true, both the desktop sidebar nav (lines 271-299) and the mobile bottom nav (lines 371-413) render only a "Mening maktablarim" entry (active, non-navigating — this page IS `/schools`) plus the existing "Sozlamalar" entry. When false/omitted, behavior is 100% unchanged from today.

- [ ] **Step 1: Add the prop and a restricted item list**

In `apps/frontend/src/components/student/StudentShell.tsx`, change the
component signature:

```ts
export function StudentShell({ children }: { children: ReactNode }) {
```

to:

```ts
export function StudentShell({ children, restrictedNav = false }: { children: ReactNode; restrictedNav?: boolean }) {
```

Add a `Building2`-style icon import for "Mening maktablarim" — check
`lucide-react` for an appropriate icon (e.g. `School` or `Building2`) and
add it to the existing lucide import block (`BookOpen, ClipboardList,
MessageCircle, Presentation, Radio, RefreshCw, Settings, UserRound` at the
top of the file) — add `School`.

After the `NAV_ITEMS` constant (line 31-62), add:

```ts
const SCHOOLS_NAV_ITEM = {
  label: 'Mening maktablarim',
  shortLabel: 'Maktablar',
  path: '/schools',
  icon: School,
};
```

- [ ] **Step 2: Swap the rendered item list based on `restrictedNav`**

Inside the component body, before the `return (`, add:

```ts
  const navItems = restrictedNav ? [SCHOOLS_NAV_ITEM] : NAV_ITEMS;
```

Then in the desktop sidebar nav block (around line 271-299), change
`{NAV_ITEMS.map((item) => {` to `{navItems.map((item) => {`.

In the mobile bottom nav block (around line 371-413), change
`{NAV_ITEMS.map((item) => {` to `{navItems.map((item) => {`.

The `isNavActive` helper (line 64-68) already handles arbitrary paths
correctly (`pathname === path` fallback), so `/schools` will correctly
show as active with no changes needed there.

Note: the "Sozlamalar" desktop nav block (lines 301-310) and the "Profil"
mobile nav button (lines 400-412) are already unconditional — they are not
inside the `NAV_ITEMS.map()` loop, so they need no changes and will keep
appearing in both modes automatically.

- [ ] **Step 3: Verify existing callers are unaffected**

Run: `grep -rn "<StudentShell" apps/frontend/src` and confirm every
existing call site (e.g. `MyCoursesPage.tsx`, `StudentHistoryPage.tsx`,
etc.) calls `<StudentShell>` without a `restrictedNav` prop — they should
require zero changes since the prop defaults to `false`.

- [ ] **Step 4: Type-check**

Run: `npm run build --workspace=apps/frontend`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/student/StudentShell.tsx
git commit -m "feat: add restrictedNav mode to StudentShell"
```

---

### Task 7: `SchoolsListPage` + routing + `HomeRoute` change

**Files:**
- Create: `apps/frontend/src/pages/SchoolsListPage.tsx`
- Modify: `apps/frontend/src/pages/MyCoursesPage.tsx:1-159` (read `schoolId` from route params)
- Modify: `apps/frontend/src/App.tsx` (routes + `HomeRoute`)

**Interfaces:**
- Consumes: `useStudentSchoolStore` (Task 5), `StudentShell` with `restrictedNav` (Task 6), `ApiMySchool` (Task 4).
- Produces: route `/schools` → `SchoolsListPage`; route `/schools/:schoolId/courses` → `MyCoursesPage` (now schoolId-aware); `HomeRoute` sends students to `/schools` instead of `StudentHistoryPage`.

- [ ] **Step 1: Write `SchoolsListPage`**

Create `apps/frontend/src/pages/SchoolsListPage.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, UserRound } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { useStudentSchoolStore } from "../stores/studentSchoolStore";

export function SchoolsListPage() {
  const navigate = useNavigate();
  const { schools, loaded, loadSchools, selectSchool } = useStudentSchoolStore();

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  function openSchool(schoolId: string) {
    selectSchool(schoolId);
    navigate(`/schools/${schoolId}/courses`);
  }

  return (
    <StudentShell restrictedNav>
      <div className="w-full rounded-2xl bg-white p-4 sm:p-5">
        <h1 className="mb-4 text-lg font-bold text-gray-800">
          Mening maktablarim
        </h1>

        {!loaded && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {loaded && schools.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday maktabga qo'shilmagansiz</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {schools.map((school) => (
            <button
              key={school.id}
              type="button"
              onClick={() => openSchool(school.id)}
              className="student-course-card flex min-h-[150px] flex-col rounded-3xl p-4 text-left sm:min-h-[185px] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="student-course-card-icon grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl sm:h-16 sm:w-16">
                  {school.imageUrl ? (
                    <img
                      src={school.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <BookOpen size={23} className="text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-lg font-bold leading-tight text-gray-950 sm:text-xl">
                    {school.name}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    <UserRound size={16} className="text-gray-700" />
                    {school.studentCount}
                  </span>
                </div>
              </div>
              {school.description && (
                <p className="mt-3 line-clamp-3 text-sm text-gray-500">
                  {school.description}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    </StudentShell>
  );
}
```

- [ ] **Step 2: Make `MyCoursesPage` read `schoolId` from the route**

In `apps/frontend/src/pages/MyCoursesPage.tsx`, add the router hook import
and read the param. Change:

```ts
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
```

to:

```ts
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
```

Inside `MyCoursesPage`, add at the top of the function body:

```ts
  const { schoolId } = useParams<{ schoolId: string }>();
```

Change `loadCourses`:

```ts
  function loadCourses() {
    setLoading(true);
    setLoadError(null);
    return apiGetMyCourses()
      .then(setCourses)
```

to:

```ts
  function loadCourses() {
    setLoading(true);
    setLoadError(null);
    return apiGetMyCourses(schoolId)
      .then(setCourses)
```

And add `schoolId` to the `useEffect` dependency array that calls
`loadCourses` (`useEffect(() => { void loadCourses(); }, []);` →
`useEffect(() => { void loadCourses(); }, [schoolId]);`) so switching
schools via the URL reloads the course list.

- [ ] **Step 3: Update `App.tsx` routing**

In `apps/frontend/src/App.tsx`, add the import:

```ts
import { SchoolsListPage } from './pages/SchoolsListPage';
```

Change `HomeRoute`:

```ts
function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === 'student') return <StudentHistoryPage />;
  if (admin?.role === 'curator') return <Navigate to="/students/list" replace />;
  return <DashboardPage />;
}
```

to:

```ts
function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === 'student') return <Navigate to="/schools" replace />;
  if (admin?.role === 'curator') return <Navigate to="/students/list" replace />;
  return <DashboardPage />;
}
```

Add the new routes and repoint `/my-courses`. Change:

```ts
  { path: '/my-courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
```

to:

```ts
  { path: '/schools', element: <PrivateRoute><SchoolsListPage /></PrivateRoute> },
  { path: '/schools/:schoolId/courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
  { path: '/my-courses', element: <Navigate to="/schools" replace /> },
```

`/` (`StudentHistoryPage`, `apps/frontend/src/pages/StudentHistoryPage.tsx`)
stays a valid route unchanged — only the *default landing* after login
moves, per the spec. The nav's "Amaliyotlar tarixi" item
(`StudentShell.tsx` `NAV_ITEMS`, `path: '/'`) still points there and keeps
working once a school context has been chosen.

- [ ] **Step 4: Update `StudentShell`'s "Mening kurslarim" nav target**

In `apps/frontend/src/components/student/StudentShell.tsx`, `NAV_ITEMS`
currently has:

```ts
  {
    label: "Mening kurslarim",
    shortLabel: "Kurslar",
    path: "/my-courses",
    icon: BookOpen,
  },
```

Change `path: "/my-courses"` to a dynamic target that uses the current
school. Since `NAV_ITEMS` is a static array evaluated at module scope, it
cannot read the store directly — instead, resolve the navigation target at
click-time. Change the `onClick` handler in both the desktop nav block and
the mobile bottom nav block from:

```ts
onClick={() => navigate(item.path)}
```

to a function that special-cases the courses item:

```ts
onClick={() => {
  if (item.path === '/my-courses') {
    const schoolId = useStudentSchoolStore.getState().currentSchoolId;
    navigate(schoolId ? `/schools/${schoolId}/courses` : '/schools');
    return;
  }
  navigate(item.path);
}}
```

Add the import at the top of `StudentShell.tsx`:

```ts
import { useStudentSchoolStore } from '../../stores/studentSchoolStore';
```

Also update `isNavActive` (line 64-68) so the "Mening kurslarim" item
still highlights correctly when on a `/schools/:id/courses` route. Change:

```ts
function isNavActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/" || pathname.startsWith("/history/");
  if (path === "/live/join") return pathname.startsWith("/live/");
  return pathname === path;
}
```

to:

```ts
function isNavActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/" || pathname.startsWith("/history/");
  if (path === "/live/join") return pathname.startsWith("/live/");
  if (path === "/my-courses") return pathname.startsWith("/schools/") && pathname.endsWith("/courses");
  return pathname === path;
}
```

- [ ] **Step 5: Manual verification**

Run the dev server: `npm run dev --workspace=apps/frontend`.
Log in as a student account with at least one school membership (use an
existing test/dev student account, or create one via the admin UI if
needed — do not fabricate credentials, ask if none are available).

Verify:
1. After login, the browser lands on `/schools`.
2. The page shows only "Mening maktablarim" + "Sozlamalar" in the nav.
3. School cards render with image/placeholder, name, student count,
   description.
4. Clicking a card navigates to `/schools/<id>/courses` and shows the full
   nav (all `NAV_ITEMS` + Sozlamalar) with that school's courses.
5. From there, clicking "Mening kurslarim" in the nav stays on the same
   school's courses (doesn't bounce back to `/schools`).
6. Visiting `/my-courses` directly redirects to `/schools`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/SchoolsListPage.tsx apps/frontend/src/pages/MyCoursesPage.tsx apps/frontend/src/App.tsx apps/frontend/src/components/student/StudentShell.tsx
git commit -m "feat: add school selection page and scope My Courses to a school"
```

---

### Task 8: School logo upload in "Maktab sozlamalari"

**Files:**
- Modify: `apps/frontend/src/stores/schoolStore.ts` (add `imageUrl` state + `setSchoolImage` action)
- Modify: `apps/frontend/src/pages/SchoolSettingsPage.tsx`

**Interfaces:**
- Consumes: `apiUploadMedia` (`apps/frontend/src/api/questions.ts:24`), `apiUpdateSchool` (Task 4, now accepts `imageUrl`).
- Produces: `useSchoolStore` state gains `imageUrl: string | null`; action `setSchoolImage(url: string): Promise<void>`.

- [ ] **Step 1: Read the current `schoolStore.ts` fully to match its exact patterns**

Before editing, read `apps/frontend/src/stores/schoolStore.ts` in full (it
was partially shown during planning — re-read the whole file, especially
`renameSchool` and `setSchoolDescription`, to copy their exact
debounce/error-handling pattern if any).

- [ ] **Step 2: Add `imageUrl` to state and a `setSchoolImage` action**

In `apps/frontend/src/stores/schoolStore.ts`, add `imageUrl: string |
null;` to the `SchoolState` interface (next to `name`/`description`), add
`imageUrl: null` to the initial state object, and set `imageUrl:
school.imageUrl` inside `loadSchool`'s `set({...})` call (alongside the
existing `name: school.name, description: school.description`).

Add a new action to the `SchoolState` interface:

```ts
  setSchoolImage: (imageUrl: string) => Promise<void>;
```

Implement it following the same call pattern `renameSchool`/
`setSchoolDescription` already use (call `apiUpdateSchool`, then `set` the
result into state) — write it to match whatever pattern Step 1 revealed,
e.g.:

```ts
  setSchoolImage: async (imageUrl) => {
    const updated = await apiUpdateSchool({ imageUrl });
    set({ imageUrl: updated.imageUrl });
  },
```

- [ ] **Step 3: Add the upload UI to `SchoolSettingsPage.tsx`**

In `apps/frontend/src/pages/SchoolSettingsPage.tsx`, add imports:

```ts
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { apiUploadMedia } from '../api/questions';
```

Update the store destructuring:

```ts
const { name, description, loaded, loadSchool, renameSchool, setSchoolDescription } = useSchoolStore();
```

to:

```ts
const { name, description, imageUrl, loaded, loadSchool, renameSchool, setSchoolDescription, setSchoolImage } = useSchoolStore();
```

Add local state and a handler inside the component body:

```tsx
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setUploadingLogo(true);
    try {
      const { url } = await apiUploadMedia(file, 'avatars');
      await setSchoolImage(url);
    } finally {
      setUploadingLogo(false);
    }
  }
```

(Reusing the `'avatars'` upload folder since `apiUploadMedia`'s folder
union type — `apps/frontend/src/api/questions.ts:26` — doesn't currently
include a school-logo-specific folder, and adding a new server-side folder
value is out of scope for this plan; `'avatars'` is the closest existing
semantic match and requires no backend changes.)

Insert the upload UI inside the "Maktab nomi va tavsifi" card, above the
"Maktab nomi" label:

```tsx
            <div className="mb-4 flex items-center gap-2">
              <div className="relative shrink-0">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gray-100">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-400">Rasm yo'q</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  aria-label="Maktab rasmini o'zgartirish"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow ring-2 ring-white transition-colors hover:bg-indigo-600 disabled:opacity-60"
                >
                  {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
              <p className="text-sm text-gray-500">Maktab rasmi</p>
            </div>
```

Place this `<div>` immediately after the opening
`<h2>`/`<p>` description lines (`SchoolSettingsPage.tsx:33-34`) and before
the "Maktab nomi" `<p>`/`<input>` block.

- [ ] **Step 4: Manual verification**

Run the dev server, log in as a teacher/admin, navigate to
`/school/settings`. Verify: current logo (or placeholder) shows, clicking
the camera button opens a file picker, selecting an image uploads and
immediately updates the displayed logo, and reloading the page still shows
the new logo (confirms persistence via `GET /school`).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/stores/schoolStore.ts apps/frontend/src/pages/SchoolSettingsPage.tsx
git commit -m "feat: add school logo upload to Maktab sozlamalari"
```

---

## Self-Review Notes

**Spec coverage:**
- `schools.imageUrl` column → Task 1. ✓
- Teacher logo upload in `SchoolSettingsPage.tsx` inside the existing name/description card → Task 8. ✓
- `GET /my/schools` → Task 2. ✓
- `GET /my/courses` `schoolId` filter → Task 3. ✓
- `/schools` list page with card layout (image, name, student count, description) → Task 7. ✓
- `/schools/:schoolId/courses` scoped course view → Task 7. ✓
- `StudentShell` restricted-nav mode (only "Mening maktablarim" + "Sozlamalar" on `/schools`) → Task 6. ✓
- Post-login landing on `/schools` → Task 7 Step 3 (`HomeRoute`). ✓
- Global `studentSchoolStore` + URL param as source of truth for current school → Task 5 + Task 7. ✓
- Mobile → explicitly out of scope for this plan per the spec; not included here.

**Placeholder scan:** No TBD/TODO markers; every step has literal code.
One judgment call is flagged explicitly rather than hidden — Task 8 Step 3
reuses the `'avatars'` upload folder instead of inventing a new backend
folder value, with the reasoning stated inline.

**Type consistency:** `ApiMySchool` (Task 4) fields — `id, name,
description, imageUrl, studentCount, courseCount` — match `getMySchools`'s
return shape (Task 2) and `SchoolsListPage`'s usage (Task 7) exactly.
`apiGetMyCourses(schoolId?: string)` (Task 4) matches its caller in
`MyCoursesPage.tsx` (Task 7 Step 2). `useStudentSchoolStore`'s
`currentSchoolId`/`selectSchool` (Task 5) match their usage in
`SchoolsListPage` (Task 7 Step 1) and `StudentShell` (Task 7 Step 4).
