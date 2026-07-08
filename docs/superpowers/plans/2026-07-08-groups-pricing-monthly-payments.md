# Groups + Pricing Plans + Monthly Payment Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend (schema, NestJS modules, cron job) and frontend store layer for Groups, Launches/PricingPlans, and the monthly payment cycle described in the design spec. This plan covers backend + `courseStore.ts` + the `/join/:token` student-facing flow only — updating the existing teacher-facing UI components (`CourseGroupsPage.tsx`, `CourseLaunchPage.tsx`, `AddStudentToGroupModal.tsx`, `CreatePricingPlanModal.tsx`) to fully exercise the new async signatures and new fields (payment status badges, plan assignment, payment recording, forced-close toggle) is explicitly OUT OF SCOPE for this plan and will be a separate follow-up plan.

**Architecture:** Four new tables (`groups`, `launches`, `pricing_plans`, `group_members`, `monthly_payments`) extend the existing ownership-by-parent-chain pattern established for `modules`/`lessons`/`content_blocks`. A NestJS `@nestjs/schedule` cron job runs daily, generating monthly payment records for group members on their group's configured payment day, and flags the previous unpaid/partial record as `'debt'`. An `assertStudentLessonAccess` helper (consumed by a future video-protection phase, not built here) determines whether a student's access should be considered open. The frontend gets a rewritten `Group`/`Launch`/`PricingPlan` shape in `courseStore.ts`, new API wrapper files, and a new `/join/:token` page for students to join a group.

**Tech Stack:** NestJS 11, `@nestjs/schedule` (new dependency), Drizzle ORM, PostgreSQL, React 19, TypeScript, zustand.

## Global Constraints

- None of the new tables store `adminId` directly. Ownership is verified via parent-chain joins: `groups`/`launches` → `courses.adminId` directly; `pricing_plans` → `launches.courseId` → `courses.adminId`; `group_members` → `groups.courseId` → `courses.adminId`; `monthly_payments` → `group_members.groupId` → `groups.courseId` → `courses.adminId`. Each service gets its own `assert*Ownership` helper mirroring the existing `assertModuleOwnership`/`assertLessonOwnership` pattern.
- `groups.paymentDay` is constrained to the range 1-28 (validated server-side via `class-validator`'s `@Min(1) @Max(28)`).
- `group_members` has a unique constraint on `(groupId, studentId)` — a student can only join a given group once.
- `monthly_payments` has a unique constraint on `(groupMemberId, periodMonth)` — one payment record per member per month.
- `discountAmount` on a `monthly_payments` row applies only to that row; the cron job always creates the next month's row with `discountAmount: 0`.
- Status calculation rule for a `monthly_payments` row, applied whenever `paidAmount` changes: `paidAmount >= expectedAmount - discountAmount` → `'paid'`; `0 < paidAmount < expectedAmount - discountAmount` → `'partial'`; `paidAmount === 0` → stays `'pending'` (the cron job is what transitions a `'pending'`/`'partial'` row to `'debt'` when the next month's row is created — this never happens as a side effect of a payment update).
- `group_members.forcedClosed` always overrides automatic payment-status-based access — if `true`, `assertStudentLessonAccess` returns `false` regardless of payment state.
- `assertStudentLessonAccess(courseId, studentId)` returns `false` if: no membership exists in any group for that course, OR `selectedPlanId` is null, OR `forcedClosed` is true, OR no `monthly_payments` row exists yet, OR the latest row's status is `'debt'`. It returns `true` otherwise (covers `'pending'`, `'partial'`, `'paid'`).
- The daily cron job must be idempotent: if a `monthly_payments` row already exists for `(groupMemberId, periodMonth)`, it is skipped, not duplicated.
- No optimistic updates in the frontend store — every async action awaits its API call before mutating local zustand state.
- Manual browser QA is left to the human — every task's verification step is limited to `npm run build`/`npm test` commands.
- Backend build/test (currently 96 passing tests) must stay green; frontend build must pass.

---

### Task 1: Add `groups`, `launches`, `pricing_plans`, `group_members`, `monthly_payments` tables to Drizzle schema + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0016_<generated-name>.sql`

**Interfaces:**
- Produces: `groups`, `launches`, `pricingPlans`, `groupMembers`, `monthlyPayments` tables and their relations. `coursesRelations` gains `groups: many(groups)` and `launches: many(launches)`. Consumed by Tasks 2-4's services.

- [ ] **Step 1: Add the tables and relations to schema.ts**

In `apps/backend/src/db/schema.ts`, add this block after the `lessons`/`contentBlocks` definitions:

```typescript
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupChatEnabled: boolean('group_chat_enabled').notNull().default(false),
  groupChannelEnabled: boolean('group_channel_enabled').notNull().default(false),
  inviteToken: text('invite_token').notNull().unique(),
  paymentDay: integer('payment_day').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const launches = pgTable('launches', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const pricingPlans = pgTable('pricing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  launchId: uuid('launch_id').notNull().references(() => launches.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  originalPrice: integer('original_price'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const groupMembers = pgTable('group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGroupStudent: uniqueIndex('group_members_group_id_student_id_key').on(table.groupId, table.studentId),
}));

export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupMemberId: uuid('group_member_id').notNull().references(() => groupMembers.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(),
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_group_member_id_period_month_key').on(table.groupMemberId, table.periodMonth),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  course: one(courses, { fields: [groups.courseId], references: [courses.id] }),
  members: many(groupMembers),
  plans: many(pricingPlans),
}));

export const launchesRelations = relations(launches, ({ one, many }) => ({
  course: one(courses, { fields: [launches.courseId], references: [courses.id] }),
  plans: many(pricingPlans),
}));

export const pricingPlansRelations = relations(pricingPlans, ({ one }) => ({
  launch: one(launches, { fields: [pricingPlans.launchId], references: [launches.id] }),
  group: one(groups, { fields: [pricingPlans.groupId], references: [groups.id] }),
}));

export const groupMembersRelations = relations(groupMembers, ({ one, many }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  student: one(users, { fields: [groupMembers.studentId], references: [users.id] }),
  selectedPlan: one(pricingPlans, { fields: [groupMembers.selectedPlanId], references: [pricingPlans.id] }),
  payments: many(monthlyPayments),
}));

export const monthlyPaymentsRelations = relations(monthlyPayments, ({ one }) => ({
  groupMember: one(groupMembers, { fields: [monthlyPayments.groupMemberId], references: [groupMembers.id] }),
}));
```

Then find the `coursesRelations` block (from the prior Module/Lesson phase):

```typescript
export const coursesRelations = relations(courses, ({ one, many }) => ({
  owner: one(users, { fields: [courses.adminId], references: [users.id] }),
  modules: many(modules),
}));
```

Replace it with:

```typescript
export const coursesRelations = relations(courses, ({ one, many }) => ({
  owner: one(users, { fields: [courses.adminId], references: [users.id] }),
  modules: many(modules),
  groups: many(groups),
  launches: many(launches),
}));
```

- [ ] **Step 2: Add `uniqueIndex` to the pg-core import**

At the top of `apps/backend/src/db/schema.ts`, find:

```typescript
import { pgTable, text, uuid, timestamp, integer, boolean, varchar } from 'drizzle-orm/pg-core';
```

Replace with:

```typescript
import { pgTable, text, uuid, timestamp, integer, boolean, varchar, uniqueIndex } from 'drizzle-orm/pg-core';
```

- [ ] **Step 3: Generate the migration**

```bash
cd apps/backend && npx drizzle-kit generate
```

Expected: a new file at `apps/backend/drizzle/migrations/0016_<auto-generated-name>.sql`.

- [ ] **Step 4: Inspect the generated migration for unrelated bundled statements**

Read the full generated file:

```bash
cat apps/backend/drizzle/migrations/0016_*.sql
```

Expected: only `CREATE TABLE` statements for `groups`, `launches`, `pricing_plans`, `group_members`, `monthly_payments`, their FK `ALTER TABLE` statements, and the two `CREATE UNIQUE INDEX` statements. Nothing referencing other pre-existing tables. If unrelated statements appear (known past failure mode in this codebase), remove them before applying.

- [ ] **Step 5: Apply the migration**

```bash
cd apps/backend && npm run db:migrate
```

If this fails or no-ops (known `__drizzle_migrations` tracking drift from prior phases), verify and apply manually:

```bash
psql "$DATABASE_URL" -c "\d groups" -c "\d launches" -c "\d pricing_plans" -c "\d group_members" -c "\d monthly_payments"
```

If any table is missing, apply the migration SQL directly:

```bash
psql "$DATABASE_URL" -f apps/backend/drizzle/migrations/0016_<name>.sql
```

- [ ] **Step 6: Verify backend build and tests still pass**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/
git commit -m "feat(groups): add groups, launches, pricing_plans, group_members, monthly_payments tables

- groups: courseId (FK), name, chat/channel flags, inviteToken (unique), paymentDay (1-28)
- launches: courseId (FK), name, active
- pricing_plans: launchId (FK), groupId (nullable FK), name, description,
  price, originalPrice, startDate, endDate
- group_members: groupId (FK), studentId (FK users), role, selectedPlanId
  (nullable FK pricing_plans), forcedClosed; unique (groupId, studentId)
- monthly_payments: groupMemberId (FK), periodMonth, expectedAmount,
  discountAmount, paidAmount, status; unique (groupMemberId, periodMonth)
- coursesRelations gains groups: many(groups), launches: many(launches)
- no adminId on any new table — ownership checked via parent-chain join
  in the service layer (Tasks 2-4)"
```

---

### Task 2: `groups` NestJS module (CRUD, members, invite join flow)

**Files:**
- Create: `apps/backend/src/groups/groups.service.ts`
- Create: `apps/backend/src/groups/groups.controller.ts`
- Create: `apps/backend/src/groups/groups.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `groups`, `groupMembers`, `courses`, `users` tables from Task 1.
- Produces: `GET/POST /courses/:courseId/groups`, `PATCH/DELETE /groups/:id`, `GET /groups/:id/members`, `PATCH /groups/:id/members/:memberId`, `PATCH /groups/:id/members/:memberId/force-close`, `DELETE /groups/:id/members/:memberId`, `GET /join/:token` (public, no guard), `POST /join/:token` (student-only guard). Consumed by Task 6's frontend API wrapper.

- [ ] **Step 1: Create the service**

Create `apps/backend/src/groups/groups.service.ts`:

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupMembers, pricingPlans, monthlyPayments } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

@Injectable()
export class GroupsService {
  private async assertGroupOwnership(groupId: string, adminId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) throw new NotFoundException('Group not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, group.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Group not found');
    return group;
  }

  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
  }

  async create(courseId: string, adminId: string, name: string, paymentDay: number) {
    await this.assertCourseOwnership(courseId, adminId);
    const [group] = await db
      .insert(groups)
      .values({ courseId, name, paymentDay, inviteToken: randomUUID() })
      .returning();
    return group;
  }

  async update(
    id: string,
    adminId: string,
    data: { name?: string; groupChatEnabled?: boolean; groupChannelEnabled?: boolean; paymentDay?: number },
  ) {
    await this.assertGroupOwnership(id, adminId);
    const [updated] = await db.update(groups).set(data).where(eq(groups.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    await this.assertGroupOwnership(id, adminId);
    await db.delete(groups).where(eq(groups.id, id));
  }

  async findMembers(groupId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, groupId),
      with: { student: true, selectedPlan: true },
    });
    const withLatestPayment = await Promise.all(
      members.map(async (member) => {
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.groupMemberId, member.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return { ...member, latestPayment: latestPayment ?? null };
      }),
    );
    return withLatestPayment;
  }

  async updateMember(
    groupId: string,
    memberId: string,
    adminId: string,
    data: { role?: string; selectedPlanId?: string | null },
  ) {
    await this.assertGroupOwnership(groupId, adminId);
    const member = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)),
    });
    if (!member) throw new NotFoundException('Member not found');
    if (data.selectedPlanId) {
      const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, data.selectedPlanId) });
      if (!plan) throw new BadRequestException('Pricing plan not found');
    }
    const [updated] = await db.update(groupMembers).set(data).where(eq(groupMembers.id, memberId)).returning();
    return updated;
  }

  async setForcedClosed(groupId: string, memberId: string, adminId: string, forcedClosed: boolean) {
    await this.assertGroupOwnership(groupId, adminId);
    const member = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)),
    });
    if (!member) throw new NotFoundException('Member not found');
    const [updated] = await db
      .update(groupMembers)
      .set({ forcedClosed })
      .where(eq(groupMembers.id, memberId))
      .returning();
    return updated;
  }

  async removeMember(groupId: string, memberId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)));
  }

  async getJoinPreview(token: string) {
    const group = await db.query.groups.findFirst({
      where: eq(groups.inviteToken, token),
      with: { course: true },
    });
    if (!group) throw new NotFoundException('Invite link not found');
    return { groupName: group.name, courseTitle: group.course.title };
  }

  async joinByToken(token: string, studentId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.inviteToken, token) });
    if (!group) throw new NotFoundException('Invite link not found');

    const existing = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)),
    });
    if (existing) throw new ConflictException('Already a member of this group');

    const [member] = await db
      .insert(groupMembers)
      .values({ groupId: group.id, studentId, role: 'student', selectedPlanId: null })
      .returning();
    return member;
  }
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/groups/groups.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

class CreateGroupDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) paymentDay?: number;
}

class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() groupChatEnabled?: boolean;
  @IsOptional() @IsBoolean() groupChannelEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(28) paymentDay?: number;
}

class UpdateMemberDto {
  @IsOptional() @IsIn(['student', 'curator']) role?: string;
  @IsOptional() @IsUUID() selectedPlanId?: string | null;
}

class ForceCloseDto {
  @IsBoolean() forcedClosed: boolean;
}

@Controller()
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('courses/:courseId/groups')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.groupsService.findAll(courseId, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('courses/:courseId/groups')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(courseId, req.admin.id, dto.name, dto.paymentDay ?? 1);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('groups/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.remove(id, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('groups/:id/members')
  findMembers(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.findMembers(id, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id/members/:memberId')
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.groupsService.updateMember(id, memberId, req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id/members/:memberId/force-close')
  setForcedClosed(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
    @Body() dto: ForceCloseDto,
  ) {
    return this.groupsService.setForcedClosed(id, memberId, req.admin.id, dto.forcedClosed);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('groups/:id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.groupsService.removeMember(id, memberId, req.admin.id);
  }

  @Get('join/:token')
  getJoinPreview(@Param('token') token: string) {
    return this.groupsService.getJoinPreview(token);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('join/:token')
  join(@Param('token') token: string, @Req() req: any) {
    return this.groupsService.joinByToken(token, req.user.id);
  }
}
```

Note: `@Roles('student')` on the join endpoint relies on `req.user` (not `req.admin`) being populated by `JwtAuthGuard` for student-role tokens — this matches the existing `AuthService.login`/`createAuthResponse` JWT payload shape (`{ sub, email, name, role }`) and the `RolesGuard`'s existing `req.user ?? req.admin` fallback logic.

- [ ] **Step 3: Create the module**

Create `apps/backend/src/groups/groups.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
```

`GroupsService` is exported because Task 4's `PaymentsModule` needs it (or at least needs to query `groupMembers`/`groups` directly — in practice Task 4's service queries the DB directly rather than injecting `GroupsService`, but exporting keeps the module reusable).

- [ ] **Step 4: Register the module in app.module.ts**

In `apps/backend/src/app.module.ts`, add the import after the `ContentBlocksModule` import:

```typescript
import { GroupsModule } from './groups/groups.module';
```

Add `GroupsModule` to the `imports` array, immediately after `ContentBlocksModule`.

- [ ] **Step 5: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/groups/ apps/backend/src/app.module.ts
git commit -m "feat(groups): add groups NestJS module (CRUD, members, invite join flow)

- GET/POST /courses/:courseId/groups, PATCH/DELETE /groups/:id
- GET /groups/:id/members (includes each member's latest monthly payment)
- PATCH /groups/:id/members/:memberId (role, selectedPlanId)
- PATCH /groups/:id/members/:memberId/force-close
- DELETE /groups/:id/members/:memberId
- GET /join/:token (public preview), POST /join/:token (student-only join)
- ownership verified via group -> courses.adminId join
- registered in AppModule as GroupsModule"
```

---

### Task 3: `launches` NestJS module (Launch + PricingPlan CRUD)

**Files:**
- Create: `apps/backend/src/launches/launches.service.ts`
- Create: `apps/backend/src/launches/launches.controller.ts`
- Create: `apps/backend/src/launches/launches.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `launches`, `pricingPlans`, `courses` tables from Task 1.
- Produces: `GET/POST /courses/:courseId/launches`, `PATCH /launches/:id`, `DELETE /launches/:id`, `POST /launches/:launchId/plans`, `PATCH /plans/:id`, `DELETE /plans/:id`. Consumed by Task 6's frontend API wrapper.

- [ ] **Step 1: Create the service**

Create `apps/backend/src/launches/launches.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, launches, pricingPlans } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class LaunchesService {
  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  private async assertLaunchOwnership(launchId: string, adminId: string) {
    const launch = await db.query.launches.findFirst({ where: eq(launches.id, launchId) });
    if (!launch) throw new NotFoundException('Launch not found');
    await this.assertCourseOwnership(launch.courseId, adminId);
    return launch;
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.launches.findMany({
      where: eq(launches.courseId, courseId),
      with: { plans: true },
    });
  }

  async create(courseId: string, adminId: string, name: string) {
    await this.assertCourseOwnership(courseId, adminId);
    const [launch] = await db.insert(launches).values({ courseId, name }).returning();
    return { ...launch, plans: [] };
  }

  async update(id: string, adminId: string, data: { name?: string; active?: boolean }) {
    await this.assertLaunchOwnership(id, adminId);
    const [updated] = await db.update(launches).set(data).where(eq(launches.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    await this.assertLaunchOwnership(id, adminId);
    await db.delete(launches).where(eq(launches.id, id));
  }

  async createPlan(
    launchId: string,
    adminId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      originalPrice?: number | null;
      groupId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) {
    await this.assertLaunchOwnership(launchId, adminId);
    const [plan] = await db
      .insert(pricingPlans)
      .values({
        launchId,
        name: data.name,
        description: data.description ?? '',
        price: data.price,
        originalPrice: data.originalPrice ?? null,
        groupId: data.groupId ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      })
      .returning();
    return plan;
  }

  private async assertPlanOwnership(planId: string, adminId: string) {
    const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, planId) });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.assertLaunchOwnership(plan.launchId, adminId);
    return plan;
  }

  async updatePlan(
    id: string,
    adminId: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      originalPrice: number | null;
      groupId: string | null;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    await this.assertPlanOwnership(id, adminId);
    const { startDate, endDate, ...rest } = data;
    const [updated] = await db
      .update(pricingPlans)
      .set({
        ...rest,
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      })
      .where(eq(pricingPlans.id, id))
      .returning();
    return updated;
  }

  async removePlan(id: string, adminId: string) {
    await this.assertPlanOwnership(id, adminId);
    await db.delete(pricingPlans).where(eq(pricingPlans.id, id));
  }
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/launches/launches.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { LaunchesService } from './launches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

class CreateLaunchDto {
  @IsString() @MinLength(1) name: string;
}

class UpdateLaunchDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreatePlanDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) price: number;
  @IsOptional() @IsInt() @Min(0) originalPrice?: number | null;
  @IsOptional() @IsUUID() groupId?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
}

class UpdatePlanDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) originalPrice?: number | null;
  @IsOptional() @IsUUID() groupId?: string | null;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class LaunchesController {
  constructor(private launchesService: LaunchesService) {}

  @Get('courses/:courseId/launches')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.launchesService.findAll(courseId, req.admin.id);
  }

  @Post('courses/:courseId/launches')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateLaunchDto) {
    return this.launchesService.create(courseId, req.admin.id, dto.name);
  }

  @Patch('launches/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateLaunchDto) {
    return this.launchesService.update(id, req.admin.id, dto);
  }

  @Delete('launches/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.launchesService.remove(id, req.admin.id);
  }

  @Post('launches/:launchId/plans')
  createPlan(@Param('launchId') launchId: string, @Req() req: any, @Body() dto: CreatePlanDto) {
    return this.launchesService.createPlan(launchId, req.admin.id, dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Req() req: any, @Body() dto: UpdatePlanDto) {
    return this.launchesService.updatePlan(id, req.admin.id, dto);
  }

  @Delete('plans/:id')
  removePlan(@Param('id') id: string, @Req() req: any) {
    return this.launchesService.removePlan(id, req.admin.id);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/backend/src/launches/launches.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { LaunchesController } from './launches.controller';
import { LaunchesService } from './launches.service';

@Module({
  controllers: [LaunchesController],
  providers: [LaunchesService],
})
export class LaunchesModule {}
```

- [ ] **Step 4: Register the module in app.module.ts**

In `apps/backend/src/app.module.ts`, add the import after the `GroupsModule` import:

```typescript
import { LaunchesModule } from './launches/launches.module';
```

Add `LaunchesModule` to the `imports` array, immediately after `GroupsModule`.

- [ ] **Step 5: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/launches/ apps/backend/src/app.module.ts
git commit -m "feat(launches): add launches NestJS module (Launch + PricingPlan CRUD)

- GET/POST /courses/:courseId/launches, PATCH/DELETE /launches/:id
- POST /launches/:launchId/plans, PATCH/DELETE /plans/:id
- ownership verified via launch/plan -> courses.adminId join
- registered in AppModule as LaunchesModule"
```

---

### Task 4: `payments` NestJS module (payment recording + daily cron job)

**Files:**
- Create: `apps/backend/src/payments/payments.service.ts`
- Create: `apps/backend/src/payments/payments.controller.ts`
- Create: `apps/backend/src/payments/payments-cron.service.ts`
- Create: `apps/backend/src/payments/payments.module.ts`
- Create: `apps/backend/src/payments/student-access.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json` (add `@nestjs/schedule`)

**Interfaces:**
- Consumes: `groups`, `groupMembers`, `pricingPlans`, `monthlyPayments`, `courses` tables from Task 1.
- Produces: `GET /groups/:id/payments`, `POST /payments/:id/pay`. `PaymentsCronService` (runs daily via `@Cron`). `StudentAccessService.assertStudentLessonAccess(courseId, studentId): Promise<boolean>` (exported, consumed by a future video-protection phase — not called anywhere yet in this plan, but implemented and unit-testable now). Consumed by Task 6's frontend API wrapper.

- [ ] **Step 1: Add `@nestjs/schedule` dependency**

```bash
cd apps/backend && npm install @nestjs/schedule
```

- [ ] **Step 2: Create the payments service**

Create `apps/backend/src/payments/payments.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupMembers, monthlyPayments } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';

function computeStatus(expectedAmount: number, discountAmount: number, paidAmount: number): string {
  const due = expectedAmount - discountAmount;
  if (paidAmount >= due) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'pending';
}

@Injectable()
export class PaymentsService {
  private async assertGroupOwnership(groupId: string, adminId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) throw new NotFoundException('Group not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, group.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Group not found');
  }

  async findByGroup(groupId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const members = await db.query.groupMembers.findMany({ where: eq(groupMembers.groupId, groupId) });
    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) return [];
    const payments = await db.query.monthlyPayments.findMany({
      where: (table, { inArray }) => inArray(table.groupMemberId, memberIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    return payments;
  }

  private async assertPaymentOwnership(paymentId: string, adminId: string) {
    const payment = await db.query.monthlyPayments.findFirst({ where: eq(monthlyPayments.id, paymentId) });
    if (!payment) throw new NotFoundException('Payment not found');
    const member = await db.query.groupMembers.findFirst({ where: eq(groupMembers.id, payment.groupMemberId) });
    if (!member) throw new NotFoundException('Payment not found');
    await this.assertGroupOwnership(member.groupId, adminId);
    return payment;
  }

  async recordPayment(paymentId: string, adminId: string, amount: number, discount?: number) {
    const payment = await this.assertPaymentOwnership(paymentId, adminId);
    const nextPaidAmount = payment.paidAmount + amount;
    const nextDiscountAmount = discount ?? payment.discountAmount;
    const nextStatus = computeStatus(payment.expectedAmount, nextDiscountAmount, nextPaidAmount);

    const [updated] = await db
      .update(monthlyPayments)
      .set({
        paidAmount: nextPaidAmount,
        discountAmount: nextDiscountAmount,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(monthlyPayments.id, paymentId))
      .returning();
    return updated;
  }
}
```

- [ ] **Step 3: Create the cron service**

Create `apps/backend/src/payments/payments-cron.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { db } from '../db';
import { groups, groupMembers, monthlyPayments } from '../db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function previousMonthStart(periodMonth: Date): Date {
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() - 1, 1));
}

@Injectable()
export class PaymentsCronService {
  private readonly logger = new Logger(PaymentsCronService.name);

  @Cron('0 1 * * *')
  async generateMonthlyPayments() {
    const today = new Date();
    const todayDay = today.getUTCDate();
    const currentPeriod = startOfMonthUtc(today);

    const dueGroups = await db.query.groups.findMany({ where: eq(groups.paymentDay, todayDay) });

    for (const group of dueGroups) {
      const members = await db.query.groupMembers.findMany({
        where: and(eq(groupMembers.groupId, group.id), isNotNull(groupMembers.selectedPlanId)),
        with: { selectedPlan: true },
      });

      for (const member of members) {
        if (!member.selectedPlan) continue;

        const existing = await db.query.monthlyPayments.findFirst({
          where: and(
            eq(monthlyPayments.groupMemberId, member.id),
            eq(monthlyPayments.periodMonth, currentPeriod),
          ),
        });
        if (existing) continue;

        const previousPeriod = previousMonthStart(currentPeriod);
        const previousPayment = await db.query.monthlyPayments.findFirst({
          where: and(
            eq(monthlyPayments.groupMemberId, member.id),
            eq(monthlyPayments.periodMonth, previousPeriod),
          ),
        });
        if (previousPayment && (previousPayment.status === 'pending' || previousPayment.status === 'partial')) {
          await db
            .update(monthlyPayments)
            .set({ status: 'debt', updatedAt: new Date() })
            .where(eq(monthlyPayments.id, previousPayment.id));
        }

        await db.insert(monthlyPayments).values({
          groupMemberId: member.id,
          periodMonth: currentPeriod,
          expectedAmount: member.selectedPlan.price,
          discountAmount: 0,
          paidAmount: 0,
          status: 'pending',
        });
      }
    }

    this.logger.log(`Monthly payment generation run for ${dueGroups.length} due group(s) on day ${todayDay}`);
  }
}
```

- [ ] **Step 4: Create the student-access service**

Create `apps/backend/src/payments/student-access.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupMembers, groups, monthlyPayments } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';

@Injectable()
export class StudentAccessService {
  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return false;
    const groupIds = courseGroups.map((g) => g.id);

    const membership = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.studentId, studentId), (table, { inArray }) => inArray(table.groupId, groupIds)),
    });
    if (!membership || !membership.selectedPlanId) return false;
    if (membership.forcedClosed) return false;

    const latestPayment = await db.query.monthlyPayments.findFirst({
      where: eq(monthlyPayments.groupMemberId, membership.id),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    if (!latestPayment) return false;
    return latestPayment.status !== 'debt';
  }
}
```

- [ ] **Step 5: Create the controller**

Create `apps/backend/src/payments/payments.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsInt, IsOptional, Min } from 'class-validator';

class RecordPaymentDto {
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('groups/:id/payments')
  findByGroup(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.findByGroup(id, req.admin.id);
  }

  @Post('payments/:id/pay')
  recordPayment(@Param('id') id: string, @Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.recordPayment(id, req.admin.id, dto.amount, dto.discount);
  }
}
```

Note: no `Patch` import is actually used by a route here (`@Post` is used for recording a payment, not `@Patch`) — remove the unused `Patch` import if your editor/linter flags it, or leave it if the project's lint config doesn't fail the build on unused imports (check `apps/backend/eslint.config.mjs` or equivalent; if in doubt, just don't import `Patch` since no `@Patch()` decorator is used in this controller).

- [ ] **Step 6: Create the module**

Create `apps/backend/src/payments/payments.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsCronService } from './payments-cron.service';
import { StudentAccessService } from './student-access.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsCronService, StudentAccessService],
  exports: [StudentAccessService],
})
export class PaymentsModule {}
```

- [ ] **Step 7: Register the module in app.module.ts**

In `apps/backend/src/app.module.ts`, add the import after the `LaunchesModule` import:

```typescript
import { PaymentsModule } from './payments/payments.module';
```

Add `PaymentsModule` to the `imports` array, immediately after `LaunchesModule`.

- [ ] **Step 8: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass. `ScheduleModule.forRoot()` being registered twice across the app (if some other module already calls it) would throw at boot — check for this by searching first:

```bash
grep -rn "ScheduleModule" apps/backend/src/ --include="*.ts" | grep -v payments.module.ts
```

Expected: no output (no other module currently uses `@nestjs/schedule` in this codebase, confirmed absent prior to this task). If this returns a match, do NOT register `ScheduleModule.forRoot()` a second time — remove it from `payments.module.ts`'s `imports` and rely on the existing app-wide registration instead.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/payments/ apps/backend/src/app.module.ts apps/backend/package.json apps/backend/package-lock.json
git add -u package-lock.json 2>/dev/null
git commit -m "feat(payments): add payments module with daily cron for monthly payment generation

- GET /groups/:id/payments, POST /payments/:id/pay (amount + optional discount)
- PaymentsCronService runs daily (01:00), generates a pending
  monthly_payments row for each group member whose group's paymentDay
  matches today, and flags the previous month's row as 'debt' if it
  was still pending/partial
- StudentAccessService.assertStudentLessonAccess(courseId, studentId)
  implements the access rule (no membership/no plan/forcedClosed/no
  payment row/latest row is 'debt' -> false; otherwise true) — not yet
  consumed anywhere (reserved for a future video-protection phase)
- idempotent: skips generation if a row already exists for
  (groupMemberId, periodMonth)
- adds @nestjs/schedule as a new dependency"
```

---

### Task 5: Frontend API wrappers — `groups.ts`, `launches.ts`, `payments.ts`

**Files:**
- Create: `apps/frontend/src/api/groups.ts`
- Create: `apps/frontend/src/api/launches.ts`
- Create: `apps/frontend/src/api/payments.ts`

**Interfaces:**
- Consumes: `client` default export from `apps/frontend/src/api/client.ts`.
- Produces: `ApiGroup`, `ApiGroupMember`, `ApiLaunch`, `ApiPricingPlan`, `ApiMonthlyPayment` interfaces and their corresponding `apiList*`/`apiCreate*`/`apiUpdate*`/`apiDelete*` functions. Consumed by Task 6's `courseStore.ts` changes.

- [ ] **Step 1: Create the groups API wrapper**

Create `apps/frontend/src/api/groups.ts`:

```typescript
import client from './client';

export interface ApiGroup {
  id: string;
  courseId: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  inviteToken: string;
  paymentDay: number;
  createdAt: string;
}

export interface ApiGroupMember {
  id: string;
  groupId: string;
  studentId: string;
  role: 'student' | 'curator';
  selectedPlanId: string | null;
  forcedClosed: boolean;
  joinedAt: string;
  student: { id: string; name: string; phone: string | null; email: string };
  selectedPlan: { id: string; name: string; price: number } | null;
  latestPayment: {
    id: string;
    periodMonth: string;
    expectedAmount: number;
    discountAmount: number;
    paidAmount: number;
    status: 'pending' | 'partial' | 'paid' | 'debt';
  } | null;
}

export async function apiListGroups(courseId: string): Promise<ApiGroup[]> {
  const res = await client.get(`/courses/${courseId}/groups`);
  return res.data;
}

export async function apiCreateGroup(courseId: string, name: string, paymentDay?: number): Promise<ApiGroup> {
  const res = await client.post(`/courses/${courseId}/groups`, { name, paymentDay });
  return res.data;
}

export async function apiUpdateGroup(
  id: string,
  data: { name?: string; groupChatEnabled?: boolean; groupChannelEnabled?: boolean; paymentDay?: number },
): Promise<ApiGroup> {
  const res = await client.patch(`/groups/${id}`, data);
  return res.data;
}

export async function apiDeleteGroup(id: string): Promise<void> {
  await client.delete(`/groups/${id}`);
}

export async function apiListGroupMembers(groupId: string): Promise<ApiGroupMember[]> {
  const res = await client.get(`/groups/${groupId}/members`);
  return res.data;
}

export async function apiUpdateGroupMember(
  groupId: string,
  memberId: string,
  data: { role?: 'student' | 'curator'; selectedPlanId?: string | null },
): Promise<ApiGroupMember> {
  const res = await client.patch(`/groups/${groupId}/members/${memberId}`, data);
  return res.data;
}

export async function apiSetMemberForcedClosed(
  groupId: string,
  memberId: string,
  forcedClosed: boolean,
): Promise<ApiGroupMember> {
  const res = await client.patch(`/groups/${groupId}/members/${memberId}/force-close`, { forcedClosed });
  return res.data;
}

export async function apiRemoveGroupMember(groupId: string, memberId: string): Promise<void> {
  await client.delete(`/groups/${groupId}/members/${memberId}`);
}

export async function apiGetJoinPreview(token: string): Promise<{ groupName: string; courseTitle: string }> {
  const res = await client.get(`/join/${token}`);
  return res.data;
}

export async function apiJoinGroup(token: string): Promise<ApiGroupMember> {
  const res = await client.post(`/join/${token}`);
  return res.data;
}
```

- [ ] **Step 2: Create the launches API wrapper**

Create `apps/frontend/src/api/launches.ts`:

```typescript
import client from './client';

export interface ApiPricingPlan {
  id: string;
  launchId: string;
  groupId: string | null;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface ApiLaunch {
  id: string;
  courseId: string;
  name: string;
  active: boolean;
  createdAt: string;
  plans: ApiPricingPlan[];
}

export async function apiListLaunches(courseId: string): Promise<ApiLaunch[]> {
  const res = await client.get(`/courses/${courseId}/launches`);
  return res.data;
}

export async function apiCreateLaunch(courseId: string, name: string): Promise<ApiLaunch> {
  const res = await client.post(`/courses/${courseId}/launches`, { name });
  return res.data;
}

export async function apiUpdateLaunch(id: string, data: { name?: string; active?: boolean }): Promise<ApiLaunch> {
  const res = await client.patch(`/launches/${id}`, data);
  return res.data;
}

export async function apiDeleteLaunch(id: string): Promise<void> {
  await client.delete(`/launches/${id}`);
}

export async function apiCreatePricingPlan(
  launchId: string,
  data: {
    name: string;
    description?: string;
    price: number;
    originalPrice?: number | null;
    groupId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<ApiPricingPlan> {
  const res = await client.post(`/launches/${launchId}/plans`, data);
  return res.data;
}

export async function apiUpdatePricingPlan(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    originalPrice: number | null;
    groupId: string | null;
    startDate: string | null;
    endDate: string | null;
  }>,
): Promise<ApiPricingPlan> {
  const res = await client.patch(`/plans/${id}`, data);
  return res.data;
}

export async function apiDeletePricingPlan(id: string): Promise<void> {
  await client.delete(`/plans/${id}`);
}
```

- [ ] **Step 3: Create the payments API wrapper**

Create `apps/frontend/src/api/payments.ts`:

```typescript
import client from './client';

export interface ApiMonthlyPayment {
  id: string;
  groupMemberId: string;
  periodMonth: string;
  expectedAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'debt';
  createdAt: string;
  updatedAt: string;
}

export async function apiListGroupPayments(groupId: string): Promise<ApiMonthlyPayment[]> {
  const res = await client.get(`/groups/${groupId}/payments`);
  return res.data;
}

export async function apiRecordPayment(
  paymentId: string,
  amount: number,
  discount?: number,
): Promise<ApiMonthlyPayment> {
  const res = await client.post(`/payments/${paymentId}/pay`, { amount, discount });
  return res.data;
}
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: passes with zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/groups.ts apps/frontend/src/api/launches.ts apps/frontend/src/api/payments.ts
git commit -m "feat(groups): add frontend API wrappers for groups, launches, payments

- apps/frontend/src/api/groups.ts: group CRUD, members, invite join flow
- apps/frontend/src/api/launches.ts: launch + pricing plan CRUD
- apps/frontend/src/api/payments.ts: list group payments, record a payment
- not yet consumed (Task 6 wires these into courseStore)"
```

---

### Task 6: Rework `courseStore.ts`'s `Group`/`Launch`/`PricingPlan` shape and actions

**Files:**
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Consumes: all API wrappers from Task 5.
- Produces: reworked `Group` interface (adds `inviteToken`, `paymentDay`, replaces `curatorIds`/`studentIds` with `members: GroupMember[]`), new `GroupMember` interface, reworked `Launch`/`PricingPlan` interfaces (unchanged shape, now backend-backed), all group/launch/pricing-plan actions made async and API-backed, plus new actions: `setMemberPlan`, `setMemberForcedClosed`, `recordPayment`, `loadGroupPayments`. `loadCourses` extended to also fetch groups (with members) and launches (with plans) per course.

- [ ] **Step 1: Read the current file in full**

Before editing, read the entire current content of `apps/frontend/src/stores/courseStore.ts` — this plan's find/replace blocks must match the actual current file content exactly. The file is roughly 822 lines as of this plan's writing; do not assume line numbers are stable.

- [ ] **Step 2: Add the imports**

Find:

```typescript
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
```

Add immediately after it (this import already has content-blocks imports added by a prior phase — add these new ones after whatever is currently there for lessons/content-blocks):

```typescript
import {
  apiListGroups, apiCreateGroup, apiUpdateGroup, apiDeleteGroup,
  apiListGroupMembers, apiUpdateGroupMember, apiSetMemberForcedClosed, apiRemoveGroupMember,
} from '../api/groups';
import {
  apiListLaunches, apiCreateLaunch, apiUpdateLaunch, apiDeleteLaunch,
  apiCreatePricingPlan, apiUpdatePricingPlan, apiDeletePricingPlan,
} from '../api/launches';
import { apiListGroupPayments, apiRecordPayment, type ApiMonthlyPayment } from '../api/payments';
```

- [ ] **Step 3: Rework the `PricingPlan`, `Launch`, `Group` interfaces**

Find:

```typescript
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  groupId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Launch {
  id: string;
  name: string;
  active: boolean;
  plans: PricingPlan[];
}

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  curatorIds: string[];
  studentIds: string[];
}
```

Replace with:

```typescript
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  groupId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Launch {
  id: string;
  name: string;
  active: boolean;
  plans: PricingPlan[];
}

export interface GroupMember {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  role: 'student' | 'curator';
  selectedPlanId: string | null;
  forcedClosed: boolean;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
}

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  inviteToken: string;
  paymentDay: number;
  members: GroupMember[];
}
```

- [ ] **Step 4: Update the `CourseState` interface's group/launch signatures**

Find:

```typescript
  addLaunch: (courseId: string, name: string) => Launch | undefined;
  toggleLaunchActive: (courseId: string, launchId: string) => void;
  renameLaunch: (courseId: string, launchId: string, name: string) => void;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => void;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => void;

  addGroup: (courseId: string, name: string) => Group | undefined;
  renameGroup: (courseId: string, groupId: string, name: string) => void;
  toggleGroupChat: (courseId: string, groupId: string) => void;
  toggleGroupChannel: (courseId: string, groupId: string) => void;
  setGroupCurators: (courseId: string, groupId: string, curatorIds: string[]) => void;
  addStudentToGroup: (courseId: string, groupId: string, studentId: string) => void;
  removeStudentFromGroup: (courseId: string, groupId: string, studentId: string) => void;
  deleteGroup: (courseId: string, groupId: string) => void;
```

Replace with:

```typescript
  addLaunch: (courseId: string, name: string) => Promise<Launch | undefined>;
  toggleLaunchActive: (courseId: string, launchId: string) => Promise<void>;
  renameLaunch: (courseId: string, launchId: string, name: string) => Promise<void>;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => Promise<void>;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => Promise<void>;

  addGroup: (courseId: string, name: string, paymentDay?: number) => Promise<Group | undefined>;
  renameGroup: (courseId: string, groupId: string, name: string) => Promise<void>;
  toggleGroupChat: (courseId: string, groupId: string) => Promise<void>;
  toggleGroupChannel: (courseId: string, groupId: string) => Promise<void>;
  setMemberRole: (courseId: string, groupId: string, memberId: string, role: 'student' | 'curator') => Promise<void>;
  setMemberPlan: (courseId: string, groupId: string, memberId: string, planId: string | null) => Promise<void>;
  setMemberForcedClosed: (courseId: string, groupId: string, memberId: string, forcedClosed: boolean) => Promise<void>;
  removeStudentFromGroup: (courseId: string, groupId: string, memberId: string) => Promise<void>;
  deleteGroup: (courseId: string, groupId: string) => Promise<void>;

  loadGroupPayments: (groupId: string) => Promise<ApiMonthlyPayment[]>;
  recordPayment: (paymentId: string, amount: number, discount?: number) => Promise<ApiMonthlyPayment>;
```

Note: `addStudentToGroup` is removed from this interface entirely — group membership is now created exclusively via the `/join/:token` flow (Task 7's `JoinGroupPage.tsx`), not by a teacher directly adding a student by ID. `setGroupCurators` (which took a full `curatorIds: string[]` array) is replaced by `setMemberRole` (which toggles one member's role at a time), matching the new one-row-per-member `group_members` model.

- [ ] **Step 5: Rewrite `loadCourses` to also fetch groups and launches**

Find the `return { id: courseRow.id, title: courseRow.title, modules: moduleList, launches: [], groups: [] };` line inside `loadCourses` (from the prior Module/Lesson phase) and its enclosing `courses = await Promise.all(...)` block. Locate the exact current code first (read the file), then replace the course-row-to-`Course`-object construction so that instead of hardcoding `launches: [], groups: []`, it fetches both:

```typescript
        const [moduleRows, groupRows, launchRows] = await Promise.all([]); // placeholder — see below, do not use this literal line
```

Do NOT use the placeholder above. Instead, restructure the per-course mapping function so it looks like this (adjust the exact surrounding code to match what Task 5/6 of the prior Module/Lesson-Content-Blocks plans actually produced — the key change is adding two more `Promise.all` branches for groups and launches alongside the existing modules branch):

```typescript
    const courses = await Promise.all(
      courseRows.map(async (courseRow) => {
        const [moduleRows, groupRows, launchRows] = await Promise.all([
          apiListModules(courseRow.id),
          apiListGroups(courseRow.id),
          apiListLaunches(courseRow.id),
        ]);

        const moduleList: Module[] = await Promise.all(
          moduleRows.map(async (moduleRow) => {
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = await Promise.all(
              lessonRows.map(async (l) => {
                const blockRows = await apiListBlocks(l.id);
                const blocks: ContentBlock[] = blockRows.map((b) => ({
                  id: b.id,
                  type: b.type,
                  html: b.html ?? undefined,
                  fileName: b.fileName ?? undefined,
                  previewUrl: b.previewUrl ?? undefined,
                  embedUrl: b.embedUrl ?? undefined,
                  label: b.label ?? undefined,
                }));
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
            return { id: moduleRow.id, title: moduleRow.title, orderIndex: moduleRow.orderIndex, lessons: lessonList };
          }),
        );

        const groupList: Group[] = await Promise.all(
          groupRows.map(async (groupRow) => {
            const memberRows = await apiListGroupMembers(groupRow.id);
            const members: GroupMember[] = memberRows.map((m) => ({
              id: m.id,
              studentId: m.studentId,
              studentName: m.student.name,
              studentPhone: m.student.phone,
              role: m.role,
              selectedPlanId: m.selectedPlanId,
              forcedClosed: m.forcedClosed,
              latestPaymentStatus: m.latestPayment?.status ?? null,
            }));
            return {
              id: groupRow.id,
              name: groupRow.name,
              groupChatEnabled: groupRow.groupChatEnabled,
              groupChannelEnabled: groupRow.groupChannelEnabled,
              inviteToken: groupRow.inviteToken,
              paymentDay: groupRow.paymentDay,
              members,
            };
          }),
        );

        const launchList: Launch[] = launchRows.map((launchRow) => ({
          id: launchRow.id,
          name: launchRow.name,
          active: launchRow.active,
          plans: launchRow.plans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            originalPrice: p.originalPrice,
            groupId: p.groupId,
            startDate: p.startDate,
            endDate: p.endDate,
          })),
        }));

        return {
          id: courseRow.id,
          title: courseRow.title,
          modules: moduleList,
          launches: launchList,
          groups: groupList,
        };
      }),
    );
    set({ courses });
```

This whole block replaces the existing `loadCourses`'s course-construction logic (keep the `const courseRows = await apiListCourses();` line before it as-is).

- [ ] **Step 6: Rewrite the launch/pricing-plan actions**

Find the existing `addLaunch`, `toggleLaunchActive`, `renameLaunch`, `addPricingPlan`, `removePricingPlan` implementations (shown in full in this plan's context — read the current file to get their exact current text) and replace them with:

```typescript
  addLaunch: async (courseId, name) => {
    const row = await apiCreateLaunch(courseId, name);
    const launch: Launch = { id: row.id, name: row.name, active: row.active, plans: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, launches: [...c.launches, launch] } : c,
      ),
    });
    return launch;
  },
  toggleLaunchActive: async (courseId, launchId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const launch = course?.launches.find((l) => l.id === launchId);
    if (!launch) return;
    const updated = await apiUpdateLaunch(launchId, { active: !launch.active });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) => (l.id === launchId ? { ...l, active: updated.active } : l)),
            },
      ),
    });
  },
  renameLaunch: async (courseId, launchId, name) => {
    await apiUpdateLaunch(launchId, { name });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, launches: c.launches.map((l) => (l.id === launchId ? { ...l, name } : l)) },
      ),
    });
  },
  addPricingPlan: async (courseId, launchId, plan) => {
    const row = await apiCreatePricingPlan(launchId, plan);
    const newPlan: PricingPlan = {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      originalPrice: row.originalPrice,
      groupId: row.groupId,
      startDate: row.startDate,
      endDate: row.endDate,
    };
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: [...l.plans, newPlan] },
              ),
            },
      ),
    });
  },
  removePricingPlan: async (courseId, launchId, planId) => {
    await apiDeletePricingPlan(planId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: l.plans.filter((p) => p.id !== planId) },
              ),
            },
      ),
    });
  },
```

- [ ] **Step 7: Rewrite the group actions**

Find the existing `addGroup`, `renameGroup`, `toggleGroupChat`, `toggleGroupChannel`, `setGroupCurators`, `addStudentToGroup`, `removeStudentFromGroup`, `deleteGroup` implementations and replace the whole block with:

```typescript
  addGroup: async (courseId, name, paymentDay) => {
    const row = await apiCreateGroup(courseId, name, paymentDay);
    const group: Group = {
      id: row.id,
      name: row.name,
      groupChatEnabled: row.groupChatEnabled,
      groupChannelEnabled: row.groupChannelEnabled,
      inviteToken: row.inviteToken,
      paymentDay: row.paymentDay,
      members: [],
    };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, groups: [...c.groups, group] } : c,
      ),
    });
    return group;
  },
  renameGroup: async (courseId, groupId, name) => {
    await apiUpdateGroup(groupId, { name });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) },
      ),
    });
  },
  toggleGroupChat: async (courseId, groupId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const group = course?.groups.find((g) => g.id === groupId);
    if (!group) return;
    const updated = await apiUpdateGroup(groupId, { groupChatEnabled: !group.groupChatEnabled });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChatEnabled: updated.groupChatEnabled } : g,
              ),
            },
      ),
    });
  },
  toggleGroupChannel: async (courseId, groupId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const group = course?.groups.find((g) => g.id === groupId);
    if (!group) return;
    const updated = await apiUpdateGroup(groupId, { groupChannelEnabled: !group.groupChannelEnabled });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChannelEnabled: updated.groupChannelEnabled } : g,
              ),
            },
      ),
    });
  },
  setMemberRole: async (courseId, groupId, memberId, role) => {
    await apiUpdateGroupMember(groupId, memberId, { role });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, members: g.members.map((m) => (m.id === memberId ? { ...m, role } : m)) },
              ),
            },
      ),
    });
  },
  setMemberPlan: async (courseId, groupId, memberId, planId) => {
    await apiUpdateGroupMember(groupId, memberId, { selectedPlanId: planId });
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : {
                      ...g,
                      members: g.members.map((m) =>
                        m.id === memberId ? { ...m, selectedPlanId: planId } : m,
                      ),
                    },
              ),
            },
      ),
    });
  },
  setMemberForcedClosed: async (courseId, groupId, memberId, forcedClosed) => {
    await apiSetMemberForcedClosed(groupId, memberId, forcedClosed);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : {
                      ...g,
                      members: g.members.map((m) =>
                        m.id === memberId ? { ...m, forcedClosed } : m,
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeStudentFromGroup: async (courseId, groupId, memberId) => {
    await apiRemoveGroupMember(groupId, memberId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId ? g : { ...g, members: g.members.filter((m) => m.id !== memberId) },
              ),
            },
      ),
    });
  },
  deleteGroup: async (courseId, groupId) => {
    await apiDeleteGroup(groupId);
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, groups: c.groups.filter((g) => g.id !== groupId) },
      ),
    });
  },
  loadGroupPayments: async (groupId) => {
    return apiListGroupPayments(groupId);
  },
  recordPayment: async (paymentId, amount, discount) => {
    return apiRecordPayment(paymentId, amount, discount);
  },
```

- [ ] **Step 8: Build verification (expect errors confined to teacher-UI files, which are out of scope for this plan)**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: errors confined to `apps/frontend/src/components/course/CourseGroupsPage.tsx`, `apps/frontend/src/components/course/CourseLaunchPage.tsx`, and/or `apps/frontend/src/components/course/AddStudentToGroupModal.tsx` — these three files reference the old `Group` shape (`curatorIds`, `studentIds`) and the removed `setGroupCurators`/`addStudentToGroup` actions, and are explicitly OUT OF SCOPE for this plan (a follow-up plan will update them). Confirm no errors originate from `courseStore.ts` itself, and no errors appear in any file this plan is actually responsible for (`apps/frontend/src/api/*.ts`, `apps/frontend/src/pages/JoinGroupPage.tsx` from Task 7).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(groups): rework courseStore's Group/Launch/PricingPlan to be async, backend-backed

- Group gains inviteToken, paymentDay; curatorIds/studentIds replaced by
  members: GroupMember[] (one row per membership, matching the new
  group_members backend model)
- setGroupCurators/addStudentToGroup removed — group membership is now
  created exclusively via the /join/:token flow; setMemberRole/
  setMemberPlan/setMemberForcedClosed added for per-member management
- loadCourses cascades further: groups (with members) and launches
  (with plans) are now fetched per course, alongside the existing
  modules/lessons/blocks cascade
- loadGroupPayments/recordPayment added for the payments UI (consumed
  by a future follow-up plan, not wired into any component yet)
- build intentionally shows residual errors in CourseGroupsPage.tsx/
  CourseLaunchPage.tsx/AddStudentToGroupModal.tsx — updating those
  teacher-facing UI components to the new shape is explicitly out of
  scope for this plan (separate follow-up)"
```

---

### Task 7: `/join/:token` student-facing page

**Files:**
- Create: `apps/frontend/src/pages/JoinGroupPage.tsx`
- Modify: `apps/frontend/src/App.tsx` (add the route)

**Interfaces:**
- Consumes: `apiGetJoinPreview`, `apiJoinGroup` from `apps/frontend/src/api/groups.ts` (Task 5).

- [ ] **Step 1: Read `App.tsx`'s current routing structure**

Read the current content of `apps/frontend/src/App.tsx` in full to see how existing routes are declared (react-router `<Route>` elements, or a different routing approach) — this plan's route-addition step must match the actual current routing mechanism.

- [ ] **Step 2: Create the join page**

Create `apps/frontend/src/pages/JoinGroupPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGetJoinPreview, apiJoinGroup } from '../api/groups';
import { useAuthStore } from '../stores/authStore';

export function JoinGroupPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const student = useAuthStore((s) => s.admin);

  const [preview, setPreview] = useState<{ groupName: string; courseTitle: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiGetJoinPreview(token)
      .then(setPreview)
      .catch(() => setError('Havola topilmadi yoki muddati tugagan.'));
  }, [token]);

  async function handleJoin() {
    if (!token) return;
    setJoining(true);
    setError(null);
    try {
      await apiJoinGroup(token);
      setJoined(true);
    } catch (e: any) {
      const message = e?.response?.data?.message;
      setError(typeof message === 'string' ? message : 'Guruhga qo\'shilishda xatolik yuz berdi.');
    } finally {
      setJoining(false);
    }
  }

  if (!student) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
          <p className="mb-4 text-sm text-gray-600">
            Guruhga qo'shilish uchun avval tizimga kiring.
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
            <p className="mb-1 text-lg font-bold text-gray-800">{preview.courseTitle}</p>
            <p className="mb-4 text-sm text-gray-500">{preview.groupName} guruhiga qo'shilasiz</p>
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {joining ? "Qo'shilmoqda..." : "Guruhga qo'shilish"}
            </button>
          </>
        )}

        {joined && (
          <p className="text-sm font-semibold text-green-600">
            Muvaffaqiyatli qo'shildingiz! O'qituvchingiz tez orada sizga tarifni belgilaydi.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the route in App.tsx**

Based on what you read in Step 1, add a route for `/join/:token` pointing to `JoinGroupPage`. If the app uses `react-router-dom`'s `<Routes>`/`<Route>` JSX, add:

```typescript
<Route path="/join/:token" element={<JoinGroupPage />} />
```

placed alongside other top-level, non-authenticated-shell routes (e.g., near a `/login` route if one exists, not nested inside the authenticated `AppShell` layout — this page must render outside any teacher/admin-only shell). Add the corresponding import:

```typescript
import { JoinGroupPage } from './pages/JoinGroupPage';
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: no NEW errors introduced by this task (the same pre-existing residual errors from Task 6's `CourseGroupsPage.tsx`/`CourseLaunchPage.tsx`/`AddStudentToGroupModal.tsx` may still appear — that's expected and out of scope). `JoinGroupPage.tsx` and the `App.tsx` route addition themselves must compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/JoinGroupPage.tsx apps/frontend/src/App.tsx
git commit -m "feat(groups): add /join/:token student-facing page

- shows course/group name preview (public, no auth needed)
- prompts login if student isn't authenticated
- POSTs to /join/:token to create the group_members row on confirm
- does not yet handle plan selection (teacher assigns plans, per spec)"
```

---

### Task 8: Final verification

**Files:**
- Verify only (no new files).

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Full backend verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all tests pass (96 from before this plan — no new backend tests added, consistent with this codebase's convention of not writing spec files for simple CRUD modules).

- [ ] **Step 2: Full frontend verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: the SAME residual errors identified in Task 6/7 (confined to `CourseGroupsPage.tsx`, `CourseLaunchPage.tsx`, `AddStudentToGroupModal.tsx`) and nothing else. Document the exact error list in this task's report — these three files are the explicit, tracked scope of a follow-up plan, not a defect in this plan's work.

- [ ] **Step 3: Confirm the cron registration doesn't duplicate `ScheduleModule`**

```bash
grep -rn "ScheduleModule.forRoot" apps/backend/src/
```

Expected: exactly one occurrence (in `apps/backend/src/payments/payments.module.ts`).

- [ ] **Step 4: Do NOT attempt manual browser QA**

Manual QA (creating a group, generating an invite link, joining via `/join/:token`, assigning a plan, waiting for/triggering the cron, recording a payment, confirming `assertStudentLessonAccess`'s logic against real data) is reserved for the human. Limit this task to the build/test/grep commands above.

- [ ] **Step 5: Document findings, including the explicit list of out-of-scope teacher-UI files needing a follow-up plan**

Write a short note in this task's report listing: (a) confirmation of green backend build/tests, (b) the exact residual frontend build errors (file:line) that are explicitly deferred to a follow-up plan, (c) anything unexpected.

- [ ] **Step 6: Optional fix commit**

```bash
git add -A
git commit -m "fix(groups): address final verification findings"
```

Skip this step if no issues were found beyond the expected, documented residual UI errors.
