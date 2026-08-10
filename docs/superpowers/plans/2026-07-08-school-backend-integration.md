# "Mening maktabim" (School) Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect "Mening maktabim" (school settings, staff management, student invite link) to the real backend — replacing `schoolStore.ts`'s frontend-only mock with a new `schools` + `school_members` backend, and wiring a working `/school-invite/:token` page for students to join.

**Architecture:** A new `schools` table (1:1 with `admins`, auto-created on first access, mirroring the existing Launch auto-creation pattern) plus a `school_members` table that covers BOTH student membership (`role: 'student'`, created via the invite-join flow) and staff designation (`role: 'curator' | 'teacher_staff'`, assigned by the teacher from among existing students) — one table, role-differentiated, rather than two parallel tables. Staff members are NOT separate login-capable accounts; `users` is untouched. A new NestJS `schools` module exposes CRUD + invite/join endpoints. The frontend gets a rewritten `schoolStore.ts`, a new `apps/frontend/src/api/school.ts` wrapper, and a new `SchoolInviteJoinPage.tsx` at `/school-invite/:token` (mirroring `JoinGroupPage.tsx`'s pattern).

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, React 19, TypeScript, zustand.

## Global Constraints

- `schools.adminId` is `unique()` — one school per admin (1:1), auto-created on first `GET /school` if missing.
- `school_members` covers both student membership and staff roles via its `role` column (`'student'` default, `'curator'`, `'teacher_staff'`) — no separate staff table.
- `users` (the existing student table) is never modified — staff designation is purely a `school_members.role` flag on an existing student, not a new login-capable account.
- Ownership: `schools.adminId` directly; `school_members` via `schoolId → schools.adminId` (parent-chain, matching the `groups`/`group_members` pattern from prior phases).
- `GET /school-invite/:token` is public (no guard) — preview only. `POST /school-invite/:token` requires `JwtAuthGuard` + `@Roles('student')` — mirrors the exact guard asymmetry already proven correct in the `groups` module's `/join/:token`.
- No optimistic updates — API calls awaited before local state updates.
- Manual browser QA is left to the human — automated verification is limited to `npm run build`/`npm test`.
- Backend build/test (currently 96 passing tests) must stay green; frontend build must pass.

---

### Task 1: Add `schools`/`school_members` tables + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0019_<generated-name>.sql`

**Interfaces:**
- Produces: `schools`, `schoolMembers` tables and their relations. Consumed by Task 2's `SchoolsService`.

- [ ] **Step 1: Add the tables and relations to schema.ts**

In `apps/backend/src/db/schema.ts`, add this block after the `monthlyPayments`/`monthlyPaymentsRelations` definitions (or any other convenient location alongside the other feature tables):

```typescript
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Mening maktabim'),
  description: text('description').notNull().default(''),
  inviteToken: text('invite_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const schoolMembers = pgTable('school_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSchoolStudent: uniqueIndex('school_members_school_id_student_id_key').on(table.schoolId, table.studentId),
}));

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  admin: one(admins, { fields: [schools.adminId], references: [admins.id] }),
  members: many(schoolMembers),
}));

export const schoolMembersRelations = relations(schoolMembers, ({ one }) => ({
  school: one(schools, { fields: [schoolMembers.schoolId], references: [schools.id] }),
  student: one(users, { fields: [schoolMembers.studentId], references: [users.id] }),
}));
```

Verify `admins`, `users`, `uniqueIndex`, `relations` are already imported/available in this file (they should be, from prior phases) — no new imports needed beyond what's already present.

- [ ] **Step 2: Generate the migration**

```bash
cd apps/backend && npx drizzle-kit generate
```

- [ ] **Step 3: Inspect the generated migration for unrelated bundled statements**

```bash
cat apps/backend/drizzle/migrations/0019_*.sql
```

Expected: only `CREATE TABLE "schools"`, `CREATE TABLE "school_members"`, their FK `ALTER TABLE` statements, and the one `CREATE UNIQUE INDEX` for `school_members`. This codebase has a known history of `drizzle-kit generate` bundling unrelated already-applied statements — remove any if present.

- [ ] **Step 4: Apply the migration**

```bash
npm run db:migrate
```

If this fails or no-ops (known `__drizzle_migrations` tracking drift from prior phases), apply manually:

```bash
psql "$DATABASE_URL" -f apps/backend/drizzle/migrations/0019_<name>.sql
```

Verify: `psql "$DATABASE_URL" -c "\d schools" -c "\d school_members"`.

- [ ] **Step 5: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/
git commit -m "feat(schools): add schools and school_members tables + migration

- schools: adminId (unique FK admins), name, description, inviteToken
  (unique) — one school per admin, auto-created on first access
- school_members: schoolId (FK), studentId (FK users), role
  ('student' default, 'curator', 'teacher_staff'), unique (schoolId, studentId)
- one table covers both student invite-join membership and staff
  role designation — no separate staff-accounts table, users
  untouched"
```

---

### Task 2: `schools` NestJS module (school CRUD, invite/join, staff management)

**Files:**
- Create: `apps/backend/src/schools/schools.service.ts`
- Create: `apps/backend/src/schools/schools.controller.ts`
- Create: `apps/backend/src/schools/schools.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `schools`, `schoolMembers`, `admins`, `users` tables from Task 1.
- Produces: `GET/PATCH /school`, `POST /school/invite/regenerate`, `GET /school-invite/:token` (public), `POST /school-invite/:token` (student-only), `GET /school/staff`, `GET /school/students/search`, `POST /school/staff`, `DELETE /school/staff/:memberId`. Consumed by Task 3's frontend wrapper.

- [ ] **Step 1: Create the service**

Create `apps/backend/src/schools/schools.service.ts`:

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { schools, schoolMembers, users } from '../db/schema';
import { and, eq, ilike, ne, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';

@Injectable()
export class SchoolsService {
  private async getOrCreateSchool(adminId: string) {
    let school = await db.query.schools.findFirst({ where: eq(schools.adminId, adminId) });
    if (!school) {
      [school] = await db.insert(schools).values({ adminId, inviteToken: randomUUID() }).returning();
    }
    return school;
  }

  async getSchool(adminId: string) {
    return this.getOrCreateSchool(adminId);
  }

  async updateSchool(adminId: string, data: { name?: string; description?: string }) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db.update(schools).set(data).where(eq(schools.id, school.id)).returning();
    return updated;
  }

  async regenerateInviteToken(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db
      .update(schools)
      .set({ inviteToken: randomUUID() })
      .where(eq(schools.id, school.id))
      .returning();
    return updated;
  }

  async getJoinPreview(token: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');
    return { schoolName: school.name };
  }

  async joinByToken(token: string, studentId: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) throw new ConflictException('Already a member of this school');

    const [member] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role: 'student' })
      .returning();
    return member;
  }

  async findStaff(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), ne(schoolMembers.role, 'student')),
      with: { student: true },
    });
    return members.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      name: m.student.name,
      email: m.student.email,
      role: m.role,
    }));
  }

  async searchStudents(adminId: string, query: string) {
    await this.getOrCreateSchool(adminId);
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const rows = await db.query.users.findMany({
      where: and(eq(users.role, 'student'), or(ilike(users.name, q), ilike(users.phone, q))),
      limit: 20,
    });
    return rows.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email }));
  }

  async addStaff(adminId: string, studentId: string, role: string) {
    const school = await this.getOrCreateSchool(adminId);
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!student) throw new BadRequestException('Student not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) {
      const [updated] = await db
        .update(schoolMembers)
        .set({ role })
        .where(eq(schoolMembers.id, existing.id))
        .returning();
      return { ...updated, name: student.name, email: student.email };
    }

    const [created] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role })
      .returning();
    return { ...created, name: student.name, email: student.email };
  }

  private async assertStaffOwnership(memberId: string, adminId: string) {
    const member = await db.query.schoolMembers.findFirst({ where: eq(schoolMembers.id, memberId) });
    if (!member) throw new NotFoundException('Staff member not found');
    const school = await db.query.schools.findFirst({
      where: and(eq(schools.id, member.schoolId), eq(schools.adminId, adminId)),
    });
    if (!school) throw new NotFoundException('Staff member not found');
  }

  async removeStaff(memberId: string, adminId: string) {
    await this.assertStaffOwnership(memberId, adminId);
    await db.delete(schoolMembers).where(eq(schoolMembers.id, memberId));
  }
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/schools/schools.controller.ts`:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

class AddStaffDto {
  @IsUUID() studentId: string;
  @IsIn(['curator', 'teacher_staff']) role: string;
}

@Controller()
export class SchoolsController {
  constructor(private schoolsService: SchoolsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school')
  getSchool(@Req() req: any) {
    return this.schoolsService.getSchool(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('school')
  updateSchool(@Req() req: any, @Body() dto: UpdateSchoolDto) {
    return this.schoolsService.updateSchool(req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('school/invite/regenerate')
  regenerateInviteToken(@Req() req: any) {
    return this.schoolsService.regenerateInviteToken(req.admin.id);
  }

  @Get('school-invite/:token')
  getJoinPreview(@Param('token') token: string) {
    return this.schoolsService.getJoinPreview(token);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('school-invite/:token')
  join(@Param('token') token: string, @Req() req: any) {
    return this.schoolsService.joinByToken(token, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/staff')
  findStaff(@Req() req: any) {
    return this.schoolsService.findStaff(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/search')
  searchStudents(@Req() req: any, @Query('q') q: string) {
    return this.schoolsService.searchStudents(req.admin.id, q || '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('school/staff')
  addStaff(@Req() req: any, @Body() dto: AddStaffDto) {
    return this.schoolsService.addStaff(req.admin.id, dto.studentId, dto.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('school/staff/:memberId')
  removeStaff(@Param('memberId') memberId: string, @Req() req: any) {
    return this.schoolsService.removeStaff(memberId, req.admin.id);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/backend/src/schools/schools.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

@Module({
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
```

- [ ] **Step 4: Register the module in app.module.ts**

In `apps/backend/src/app.module.ts`, add the import after the `PaymentsModule`/`LaunchesModule` import (wherever the last feature module is registered):

```typescript
import { SchoolsModule } from './schools/schools.module';
```

Add `SchoolsModule` to the `imports` array.

- [ ] **Step 5: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/schools/ apps/backend/src/app.module.ts
git commit -m "feat(schools): add schools NestJS module (CRUD, invite/join, staff management)

- GET/PATCH /school (auto-creates on first access), POST /school/invite/regenerate
- GET /school-invite/:token (public preview), POST /school-invite/:token
  (student-only join) — mirrors the exact guard asymmetry proven
  correct in the groups module's /join/:token
- GET /school/staff, GET /school/students/search, POST /school/staff
  (assigns curator/teacher_staff role to an existing student, or
  updates the role if already a member), DELETE /school/staff/:memberId
- ownership verified via schoolId -> schools.adminId join
- registered in AppModule as SchoolsModule"
```

---

### Task 3: Frontend API wrapper — `apps/frontend/src/api/school.ts`

**Files:**
- Create: `apps/frontend/src/api/school.ts`

**Interfaces:**
- Produces: `ApiSchool`, `ApiSchoolStaffMember`, `ApiStudentSearchResult` interfaces and their corresponding `apiGetSchool`/`apiUpdateSchool`/`apiRegenerateInviteToken`/`apiGetSchoolJoinPreview`/`apiJoinSchool`/`apiGetSchoolStaff`/`apiSearchStudents`/`apiAddSchoolStaff`/`apiRemoveSchoolStaff` functions. Consumed by Task 4's `schoolStore.ts`.

- [ ] **Step 1: Create the API wrapper file**

Create `apps/frontend/src/api/school.ts`:

```typescript
import client from './client';

export interface ApiSchool {
  id: string;
  adminId: string;
  name: string;
  description: string;
  inviteToken: string;
  createdAt: string;
}

export interface ApiSchoolStaffMember {
  id: string;
  studentId: string;
  name: string;
  email: string;
  role: 'curator' | 'teacher_staff';
}

export interface ApiStudentSearchResult {
  id: string;
  name: string;
  phone: string | null;
  email: string;
}

export async function apiGetSchool(): Promise<ApiSchool> {
  const res = await client.get('/school');
  return res.data;
}

export async function apiUpdateSchool(data: { name?: string; description?: string }): Promise<ApiSchool> {
  const res = await client.patch('/school', data);
  return res.data;
}

export async function apiRegenerateInviteToken(): Promise<ApiSchool> {
  const res = await client.post('/school/invite/regenerate');
  return res.data;
}

export async function apiGetSchoolJoinPreview(token: string): Promise<{ schoolName: string }> {
  const res = await client.get(`/school-invite/${token}`);
  return res.data;
}

export async function apiJoinSchool(token: string): Promise<{ id: string }> {
  const res = await client.post(`/school-invite/${token}`);
  return res.data;
}

export async function apiGetSchoolStaff(): Promise<ApiSchoolStaffMember[]> {
  const res = await client.get('/school/staff');
  return res.data;
}

export async function apiSearchStudents(query: string): Promise<ApiStudentSearchResult[]> {
  const res = await client.get('/school/students/search', { params: { q: query } });
  return res.data;
}

export async function apiAddSchoolStaff(studentId: string, role: 'curator' | 'teacher_staff'): Promise<ApiSchoolStaffMember> {
  const res = await client.post('/school/staff', { studentId, role });
  return res.data;
}

export async function apiRemoveSchoolStaff(memberId: string): Promise<void> {
  await client.delete(`/school/staff/${memberId}`);
}
```

- [ ] **Step 2: Build verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: passes with zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/school.ts
git commit -m "feat(schools): add frontend API wrapper for school CRUD, invite/join, staff

- mirrors the api/groups.ts wrapper pattern from a prior phase
- not yet consumed (Task 4 wires this into schoolStore)"
```

---

### Task 4: Rework `schoolStore.ts` to be async, backend-backed

**Files:**
- Modify: `apps/frontend/src/stores/schoolStore.ts`

**Interfaces:**
- Consumes: all functions from Task 3's `apps/frontend/src/api/school.ts`.
- Produces: reworked `SchoolState` — `name`/`description`/`inviteToken` populated from backend, `staff: SchoolStaff[]` from `apiGetSchoolStaff`, all actions async. New `loadSchool()`, `searchStudents(query)` actions.

- [ ] **Step 1: Read the current file in full**

Read the entire current content of `apps/frontend/src/stores/schoolStore.ts` (56 lines) before editing.

- [ ] **Step 2: Rewrite the store**

Replace the full contents of `apps/frontend/src/stores/schoolStore.ts` with:

```typescript
import { create } from 'zustand';
import {
  apiGetSchool, apiUpdateSchool, apiRegenerateInviteToken,
  apiGetSchoolStaff, apiSearchStudents, apiAddSchoolStaff, apiRemoveSchoolStaff,
  type ApiStudentSearchResult,
} from '../api/school';

export type SchoolStaffRole = 'teacher_staff' | 'curator';

export interface SchoolStaff {
  id: string;
  studentId: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  inviteToken: string;
  staff: SchoolStaff[];
  loaded: boolean;

  loadSchool: () => Promise<void>;
  renameSchool: (name: string) => Promise<void>;
  setSchoolDescription: (description: string) => Promise<void>;
  regenerateInviteToken: () => Promise<void>;
  loadStaff: () => Promise<void>;
  searchStudents: (query: string) => Promise<ApiStudentSearchResult[]>;
  addStaff: (studentId: string, role: SchoolStaffRole) => Promise<void>;
  removeStaff: (memberId: string) => Promise<void>;
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  name: '',
  description: '',
  inviteToken: '',
  staff: [],
  loaded: false,

  loadSchool: async () => {
    const school = await apiGetSchool();
    set({ name: school.name, description: school.description, inviteToken: school.inviteToken, loaded: true });
  },

  renameSchool: async (name) => {
    await apiUpdateSchool({ name });
    set({ name });
  },

  setSchoolDescription: async (description) => {
    await apiUpdateSchool({ description });
    set({ description });
  },

  regenerateInviteToken: async () => {
    const school = await apiRegenerateInviteToken();
    set({ inviteToken: school.inviteToken });
  },

  loadStaff: async () => {
    const rows = await apiGetSchoolStaff();
    set({
      staff: rows.map((r) => ({ id: r.id, studentId: r.studentId, name: r.name, email: r.email, role: r.role })),
    });
  },

  searchStudents: async (query) => {
    return apiSearchStudents(query);
  },

  addStaff: async (studentId, role) => {
    const row = await apiAddSchoolStaff(studentId, role);
    const staffMember: SchoolStaff = {
      id: row.id, studentId: row.studentId, name: row.name, email: row.email, role: row.role,
    };
    set({
      staff: [...get().staff.filter((s) => s.studentId !== studentId), staffMember],
    });
  },

  removeStaff: async (memberId) => {
    await apiRemoveSchoolStaff(memberId);
    set({ staff: get().staff.filter((s) => s.id !== memberId) });
  },
}));
```

Note: `renameSchool`/`setSchoolDescription`'s no-optimistic-update ordering is preserved (API call awaited, then local `set()`), matching this codebase's established convention.

- [ ] **Step 3: Build verification (expect errors confined to the consuming pages, fixed in Task 5)**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: errors in `SchoolSettingsPage.tsx`, `SchoolStaffPage.tsx`, `SchoolInvitePage.tsx`, `AddStaffModal.tsx` — these reference the old sync API shape and are fixed in Task 5. Confirm no errors originate from `schoolStore.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/stores/schoolStore.ts
git commit -m "feat(schools): rework schoolStore.ts to be async, backend-backed

- name/description/inviteToken/staff all populated from the real
  backend via loadSchool()/loadStaff(), no longer hardcoded mock data
- addStaff now takes (studentId, role) instead of {name, email, role}
  — staff are existing students given a role, not freestanding records
- new searchStudents(query) action for the AddStaffModal rework (Task 5)
- build intentionally shows residual errors in the 4 consuming pages
  until Task 5 updates their call sites"
```

---

### Task 5: Update consuming pages + AddStaffModal + new join page

**Files:**
- Modify: `apps/frontend/src/pages/SchoolSettingsPage.tsx`
- Modify: `apps/frontend/src/pages/SchoolStaffPage.tsx`
- Modify: `apps/frontend/src/pages/SchoolInvitePage.tsx`
- Modify: `apps/frontend/src/components/school/AddStaffModal.tsx`
- Create: `apps/frontend/src/pages/SchoolInviteJoinPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: the reworked `schoolStore.ts` from Task 4, `apiGetSchoolJoinPreview`/`apiJoinSchool` from Task 3.

- [ ] **Step 1: Read all files in full before editing**

Read the CURRENT content of `SchoolSettingsPage.tsx`, `SchoolStaffPage.tsx`, `SchoolInvitePage.tsx`, `AddStaffModal.tsx`, and `App.tsx` in full — several of these were touched in earlier, unrelated phases (e.g. `SchoolInvitePage.tsx`'s invite link URL was changed to `/school-invite/:token` in a prior commit), so this task's find/replace blocks must match actual current content, not the versions shown earlier in this plan's design discussion.

- [ ] **Step 2: Update `SchoolSettingsPage.tsx`**

Add a `useEffect` to call `loadSchool()` on mount, and make the input handlers use `void renameSchool(...)`/`void setSchoolDescription(...)` instead of the old synchronous calls. The exact find/replace depends on the file's current structure — apply this transformation:

```typescript
import { useEffect } from 'react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { useSchoolStore } from '../stores/schoolStore';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;

export function SchoolSettingsPage() {
  const { name, description, loaded, loadSchool, renameSchool, setSchoolDescription } = useSchoolStore();

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  if (!loaded) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-800">Maktab sozlamalari</h1>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Maktab nomi va tavsifi</h2>
            <p className="mb-4 text-sm text-gray-400">Bu yerda maktab nomi va tavsifini tahrirlashingiz mumkin</p>

            <p className="mb-1.5 text-sm text-gray-500">Maktab nomi</p>
            <input
              value={name}
              onChange={(e) => void renameSchool(e.target.value.slice(0, NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mb-4 mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>

            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => void setSchoolDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Maktabingiz haqida qisqacha ma'lumot"
              rows={3}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{description.length} / {DESCRIPTION_MAX}</p>
          </div>
        </div>

        <SchoolSidePanel />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Update `SchoolStaffPage.tsx`**

Apply this transformation (replacing `MOCK_STUDENTS` usage and the sync `addStaff(data)` call with the new async, `studentId`-based flow):

```typescript
import { useEffect, useState } from 'react';
import { Inbox, Plus, X } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { AddStaffModal } from '../components/school/AddStaffModal';
import { useSchoolStore, type SchoolStaffRole } from '../stores/schoolStore';

const AVATAR_PALETTES = [
  'bg-indigo-100 text-indigo-600',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const ROLE_BADGE: Record<SchoolStaffRole, { label: string; className: string }> = {
  teacher_staff: { label: "O'qituvchi", className: 'bg-teal-100 text-teal-600' },
  curator: { label: 'Kurator', className: 'bg-amber-100 text-amber-600' },
};

export function SchoolStaffPage() {
  const { staff, loadStaff, searchStudents, addStaff, removeStaff } = useSchoolStore();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  function handleAddStaff(studentId: string, role: SchoolStaffRole) {
    void addStaff(studentId, role).then(() => setModalOpen(false));
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-gray-800">Mening xodimlarim</h1>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Xodim qo'shish
            </button>
          </div>

          {staff.length === 0 ? (
            <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
              <Inbox size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Hali xodim yo'q</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {staff.map((s) => {
                const badge = ROLE_BADGE[s.role];
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${paletteFor(s.id)}`}>
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{s.name}</p>
                      <p className="truncate text-xs text-gray-400">{s.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeStaff(s.id)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Xodimni olib tashlash"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SchoolSidePanel />
      </div>

      {modalOpen && (
        <AddStaffModal
          onSearch={searchStudents}
          onConfirm={handleAddStaff}
          onClose={() => setModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
```

Note: `ROLE_BADGE` no longer has an `admin` entry — the design intentionally excludes the school owner from `school_members` (the owning admin is tracked via `schools.adminId`, not as a `school_members` row), so `SchoolStaffRole` only ever contains `'curator' | 'teacher_staff'`.

- [ ] **Step 4: Rewrite `AddStaffModal.tsx`**

Read the current file in full, then replace its data source: instead of taking a static `students: {id, name, phone}[]` prop and filtering client-side, it now takes an `onSearch: (query: string) => Promise<ApiStudentSearchResult[]>` prop and debounces a live backend search. Apply this transformation:

```typescript
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ApiStudentSearchResult } from '../../api/school';
import type { SchoolStaffRole } from '../../stores/schoolStore';

interface AddStaffModalProps {
  onSearch: (query: string) => Promise<ApiStudentSearchResult[]>;
  onConfirm: (studentId: string, role: SchoolStaffRole) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: SchoolStaffRole; label: string }[] = [
  { value: 'teacher_staff', label: "O'qituvchi" },
  { value: 'curator', label: 'Kurator' },
];

export function AddStaffModal({ onSearch, onConfirm, onClose }: AddStaffModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiStudentSearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<SchoolStaffRole>('teacher_staff');

  useEffect(() => {
    const handle = setTimeout(() => {
      void onSearch(query).then(setResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, onSearch]);

  function handleSubmit() {
    if (!selectedId) return;
    onConfirm(selectedId, role);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">Xodim qo'shish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              className="w-full rounded-2xl bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              {query.trim() ? 'Hech narsa topilmadi.' : "Qidirish uchun ism yoki telefon kiriting."}
            </p>
          ) : (
            <div className="flex flex-col gap-1 pb-2">
              {results.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="student"
                    checked={selectedId === s.id}
                    onChange={() => setSelectedId(s.id)}
                    className="h-4 w-4 shrink-0 accent-indigo-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.phone ?? s.email}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-3">
          <p className="mb-1.5 text-sm text-gray-500">Rol</p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as SchoolStaffRole)}
            className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="px-6 pb-6 pt-1">
          <button
            onClick={handleSubmit}
            disabled={!selectedId}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `SchoolInvitePage.tsx`**

Apply this transformation (replacing the mock `inviteToken`/`regenerateInviteToken` with the async, backend-backed versions, adding a `loadSchool()` call on mount):

```typescript
import { useEffect, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { ConfirmDeleteModal } from '../components/course/ConfirmDeleteModal';
import { useSchoolStore } from '../stores/schoolStore';

export function SchoolInvitePage() {
  const { inviteToken, loaded, loadSchool, regenerateInviteToken } = useSchoolStore();
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    void loadSchool();
  }, [loadSchool]);

  const inviteLink = `${window.location.origin}/school-invite/${inviteToken}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirmRegenerate() {
    void regenerateInviteToken();
    setConfirmRegenerate(false);
  }

  if (!loaded) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-lg font-bold text-gray-800">Ro'yxatdan o'tish</h1>
          <p className="mb-4 text-sm text-gray-400">
            Ushbu havola orqali o'quvchilar maktabingizga ro'yxatdan o'tishlari mumkin
          </p>

          <div className="mb-4 rounded-2xl bg-white p-5">
            <p className="mb-1.5 text-sm text-gray-500">Taklif havolasi</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="w-full min-w-0 flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Nusxalandi!' : 'Nusxalash'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-gray-800">Amallar</h2>
            <button
              type="button"
              onClick={() => setConfirmRegenerate(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <RotateCcw size={16} /> Havolani yangilash
            </button>
          </div>
        </div>

        <SchoolSidePanel />
      </div>

      {confirmRegenerate && (
        <ConfirmDeleteModal
          title="Havolani yangilash"
          description="Eski havola ishlamay qoladi. O'quvchilar faqat yangi havola orqali ro'yxatdan o'tishlari mumkin bo'ladi."
          confirmLabel="Yangilash"
          onConfirm={handleConfirmRegenerate}
          onClose={() => setConfirmRegenerate(false)}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 6: Create `SchoolInviteJoinPage.tsx`**

Create `apps/frontend/src/pages/SchoolInviteJoinPage.tsx`, mirroring `JoinGroupPage.tsx`'s exact pattern (public preview, login-gate with session restore via `/auth/me`, then join):

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetSchoolJoinPreview, apiJoinSchool } from '../api/school';
import { apiGetMe } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export function SchoolInviteJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const student = useAuthStore((s) => s.admin);

  const [preview, setPreview] = useState<{ schoolName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(authToken && !student));

  useEffect(() => {
    if (!token) return;
    apiGetSchoolJoinPreview(token)
      .then(setPreview)
      .catch(() => setError('Havola topilmadi yoki muddati tugagan.'));
  }, [token]);

  useEffect(() => {
    if (!authToken || student) return;
    apiGetMe()
      .then((me) => useAuthStore.setState({ admin: me }))
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setCheckingSession(false));
  }, [authToken, student]);

  async function handleJoin() {
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      await apiJoinSchool(token);
      setJoined(true);
    } catch (e: any) {
      const message = e?.response?.data?.message;
      setError(typeof message === 'string' ? message : "Maktabga qo'shilishda xatolik yuz berdi.");
    } finally {
      setJoining(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-sm text-gray-400">Yuklanmoqda...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
          <p className="mb-4 text-sm text-gray-600">
            Maktabga qo'shilish uchun avval tizimga kiring.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            Kirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {!error && !preview && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {preview && !joined && (
          <>
            <p className="mb-1 text-lg font-bold text-gray-800">{preview.schoolName}</p>
            <p className="mb-4 text-sm text-gray-500">Ushbu maktabga qo'shilasiz</p>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {joining ? "Qo'shilmoqda..." : "Maktabga qo'shilish"}
            </button>
          </>
        )}

        {joined && (
          <p className="text-sm font-semibold text-green-600">
            Muvaffaqiyatli qo'shildingiz!
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add the route in App.tsx**

Read the CURRENT content of `apps/frontend/src/App.tsx` first (it has accumulated routes/imports across many prior phases). Add the import:

```typescript
import { SchoolInviteJoinPage } from './pages/SchoolInviteJoinPage';
```

Add the route, placed alongside the other bare (non-`PrivateRoute`-wrapped) top-level routes like `/join/:token`:

```typescript
  { path: '/school-invite/:token', element: <SchoolInviteJoinPage /> },
```

- [ ] **Step 8: Build verification**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/SchoolSettingsPage.tsx apps/frontend/src/pages/SchoolStaffPage.tsx apps/frontend/src/pages/SchoolInvitePage.tsx apps/frontend/src/components/school/AddStaffModal.tsx apps/frontend/src/pages/SchoolInviteJoinPage.tsx apps/frontend/src/App.tsx
git commit -m "feat(schools): wire consuming pages to real backend + add /school-invite/:token join page

- SchoolSettingsPage/SchoolInvitePage call loadSchool() on mount,
  show a loading state until the school record is fetched/auto-created
- SchoolStaffPage/AddStaffModal reworked: staff are now assigned by
  searching real users (GET /school/students/search) rather than
  picking from a static mock list, and addStaff takes (studentId, role)
- new SchoolInviteJoinPage.tsx at /school-invite/:token, mirroring
  JoinGroupPage.tsx's exact pattern (public preview, session restore
  via /auth/me, then join) — this is the actual working destination
  for the invite link shown on SchoolInvitePage.tsx, resolving the
  earlier route collision with /join/:token
- build fully green"
```

---

### Task 6: Final verification

**Files:**
- Verify only.

- [ ] **Step 1: Backend verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 tests pass.

- [ ] **Step 2: Frontend verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: fully clean, zero errors.

- [ ] **Step 3: Do NOT attempt manual browser QA**

Reserved for the human — creating/renaming a school, copying the invite link, joining as a student via `/school-invite/:token`, searching for and assigning a staff member, removing a staff member.

- [ ] **Step 4: Optional fix commit**

```bash
git add -A
git commit -m "fix(schools): address final verification findings"
```

Skip if no issues found.
