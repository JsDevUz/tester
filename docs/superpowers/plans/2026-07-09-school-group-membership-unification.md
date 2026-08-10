# school_members + group_members Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the independent `group_members` table with a new `group_enrollments` table that hangs off `school_members`, so a student always joins the school first (`/school-invite/:token`) and group membership becomes an admin-driven "enrollment" action on top of an existing school membership. Remove `/join/:token` entirely.

**Architecture:** `school_members` remains the single source of truth for "is this person in my school and what's their role" (student/curator/teacher_staff). A new `group_enrollments` table (schoolMemberId, groupId, selectedPlanId, forcedClosed, joinedAt, removedAt) replaces `group_members` — no `role` column, no `studentId` column. `monthlyPayments.groupMemberId` is renamed to `enrollmentId` and repointed at `group_enrollments.id`. Curator assignment now writes to `school_members.role` (school-wide) instead of a per-group role.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, React 19 + TypeScript + zustand.

## Global Constraints

- Payment history (`monthlyPayments` rows) must never be lost or orphaned by any admin action (remove student from group, change plan, remove student from school) — this is a hard, explicit requirement from the project owner. Soft-delete (`removedAt`) on `group_enrollments` is the mechanism; `onDelete: 'cascade'` on `monthlyPayments.enrollmentId` must never fire in normal operation because rows are never hard-deleted.
- `role` (`'student' | 'curator' | 'teacher_staff'`) lives only on `school_members`. There is no per-group role. A group's "curators" are computed as: enrolled in this group (active) AND `school_members.role === 'curator'`.
- Assigning someone as a group curator auto-promotes them to `school_members.role = 'curator'` if they aren't already (no separate "make them staff first" step required) — this was confirmed by the project owner.
- `/join/:token` is removed completely: backend endpoints, service methods, frontend page, frontend route, frontend API wrapper functions. Group enrollment happens only via an admin-driven endpoint.
- Ownership checks always go through the parent-chain pattern (`assert*Ownership` helpers) — never trust a bare foreign key without verifying the admin owns the parent chain.
- Files are never written to local disk; this plan does not touch file storage, so this constraint is inherited but not directly exercised.
- No optimistic updates in the frontend store — every action awaits the API response, then updates local state from the response (or a follow-up fetch), matching every existing action in `courseStore.ts`.
- After generating a Drizzle migration, manually inspect the generated SQL file before applying — this codebase has a history of `drizzle-kit generate` bundling unrelated already-applied statements.
- `npm run db:migrate` / `drizzle-kit migrate` may fail due to `__drizzle_migrations` tracking drift. Apply migrations manually via `psql "$DATABASE_URL" -f <file>.sql` (DATABASE_URL is `postgresql://macbookpro@localhost:5432/testplatform` in this dev environment), then verify with `psql "$DATABASE_URL" -c "\d <table>"`.
- This codebase has no existing unit or integration tests for `GroupsService`/`SchoolsService` (verified: `find apps/backend/src -iname "*.spec.ts"` shows none referencing these modules). Existing spec files test pure functions only (e.g. `delivery.service.spec.ts`). This plan does not invent new test infrastructure out of scope — verification is via `npm run build`, `npm test` (existing suite must stay green), and manual `psql` inspection of migrated data.
- A concurrent, independent piece of work is adding video-block HLS support (touches `content_blocks`, adds a `videos/` module, migration `0021_video_content_blocks.sql`). This plan's migrations must be numbered after `0021` and must not touch `content_blocks` or any video-related table.

---

## File Structure

**Backend — modified:**
- `apps/backend/src/db/schema.ts` — remove `groupMembers` table/relations; add `groupEnrollments` table/relations; rename `monthlyPayments.groupMemberId` → `enrollmentId` and repoint its FK/relations.
- `apps/backend/src/groups/groups.service.ts` — rewrite all methods to use `groupEnrollments` + `schoolMembers` instead of `groupMembers`; remove `getJoinPreview`/`joinByToken`; add `enrollStudent`.
- `apps/backend/src/groups/groups.controller.ts` — remove `GET/POST join/:token`; add `POST groups/:id/enroll`.
- `apps/backend/src/schools/schools.service.ts` — add `findStudentsWithoutGroup`.
- `apps/backend/src/schools/schools.controller.ts` — add `GET school/students/without-group`.
- `apps/backend/src/payments/student-access.service.ts` — rewrite `assertStudentLessonAccess` to query through `schoolMembers` + `groupEnrollments`.

**Backend — new:**
- `apps/backend/drizzle/migrations/0022_group_enrollments.sql` — schema migration + one-time data migration (backfill `school_members` from orphan `group_members` rows, copy `group_members` → `group_enrollments`, repoint `monthly_payments`, drop `group_members`).

**Frontend — modified:**
- `apps/frontend/src/api/groups.ts` — remove `apiGetJoinPreview`, `apiJoinGroup`; add `apiEnrollStudent`.
- `apps/frontend/src/App.tsx` — remove `/join/:token` route and its import.
- `apps/frontend/src/components/course/CourseGroupsPage.tsx` — replace "copy invite link" button with a "qo'shish" (enroll) flow using a student picker; curator toggle already works via `assignCurator`/`handleToggleCurator`, no structural change needed there beyond confirming it still compiles against the unchanged `GroupMember` frontend interface.
- `apps/frontend/src/stores/courseStore.ts` — add `enrollStudent` action.

**Frontend — deleted:**
- `apps/frontend/src/pages/JoinGroupPage.tsx`

No changes needed to `apps/frontend/src/stores/schoolStore.ts` or `apps/frontend/src/api/school.ts`'s existing exports (school membership itself is untouched) except the one new "students without group" API function.

---

### Task 1: Schema — add `group_enrollments`, repoint `monthly_payments`, remove `group_members`

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0022_group_enrollments.sql`

**Interfaces:**
- Produces: `groupEnrollments` table (Drizzle export name `groupEnrollments`, SQL table name `group_enrollments`) with columns `id`, `schoolMemberId` (FK → `school_members.id`, cascade), `groupId` (FK → `groups.id`, cascade), `selectedPlanId` (FK → `pricing_plans.id`, set null), `forcedClosed` (boolean, default false), `joinedAt` (timestamp, default now), `removedAt` (nullable timestamp). Produces `groupEnrollmentsRelations` exposing `schoolMember`, `group`, `selectedPlan`, `payments`.
- Produces: `monthlyPayments.enrollmentId` (renamed from `groupMemberId`, FK → `group_enrollments.id`, cascade), unique index `monthly_payments_enrollment_id_period_month_key` on `(enrollmentId, periodMonth)`.
- Consumes: nothing new (uses existing `schoolMembers`, `groups`, `pricingPlans` tables from `apps/backend/src/db/schema.ts`).

- [ ] **Step 1: Edit `apps/backend/src/db/schema.ts` — remove `groupMembers`, add `groupEnrollments`**

Remove this block entirely:

```typescript
export const groupMembers = pgTable('group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});
```

Replace it with (note: this must be placed AFTER `schoolMembers` in the file, since it references `schoolMembers.id` — move it below the `schoolMembers` table definition, or keep schema.ts's existing ordering by placing this table definition physically after the `schoolMembers` export further down in the file; Drizzle does not require declaration order in JS since these are just `const` exports referencing each other via arrow functions, so either position compiles — for readability, place it immediately after the `schoolMembers` table and before `schoolsRelations`):

```typescript
export const groupEnrollments = pgTable('group_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolMemberId: uuid('school_member_id').notNull().references(() => schoolMembers.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});
```

- [ ] **Step 2: Update `monthlyPayments` table definition**

Change:

```typescript
export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupMemberId: uuid('group_member_id').notNull().references(() => groupMembers.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(),
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  paymentMethod: text('payment_method'),
  note: text('note'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_group_member_id_period_month_key').on(table.groupMemberId, table.periodMonth),
}));
```

to:

```typescript
export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => groupEnrollments.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(),
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'),
  paymentMethod: text('payment_method'),
  note: text('note'),
  receiptUrl: text('receipt_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_enrollment_id_period_month_key').on(table.enrollmentId, table.periodMonth),
}));
```

- [ ] **Step 3: Replace `groupsRelations`, remove `groupMembersRelations`, add `groupEnrollmentsRelations`, update `monthlyPaymentsRelations`**

Change:

```typescript
export const groupsRelations = relations(groups, ({ one, many }) => ({
  course: one(courses, { fields: [groups.courseId], references: [courses.id] }),
  members: many(groupMembers),
  plans: many(pricingPlans),
}));
```

to:

```typescript
export const groupsRelations = relations(groups, ({ one, many }) => ({
  course: one(courses, { fields: [groups.courseId], references: [courses.id] }),
  enrollments: many(groupEnrollments),
  plans: many(pricingPlans),
}));
```

Remove entirely:

```typescript
export const groupMembersRelations = relations(groupMembers, ({ one, many }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  student: one(users, { fields: [groupMembers.studentId], references: [users.id] }),
  selectedPlan: one(pricingPlans, { fields: [groupMembers.selectedPlanId], references: [pricingPlans.id] }),
  payments: many(monthlyPayments),
}));
```

Add in its place:

```typescript
export const groupEnrollmentsRelations = relations(groupEnrollments, ({ one, many }) => ({
  group: one(groups, { fields: [groupEnrollments.groupId], references: [groups.id] }),
  schoolMember: one(schoolMembers, { fields: [groupEnrollments.schoolMemberId], references: [schoolMembers.id] }),
  selectedPlan: one(pricingPlans, { fields: [groupEnrollments.selectedPlanId], references: [pricingPlans.id] }),
  payments: many(monthlyPayments),
}));
```

Change:

```typescript
export const monthlyPaymentsRelations = relations(monthlyPayments, ({ one }) => ({
  groupMember: one(groupMembers, { fields: [monthlyPayments.groupMemberId], references: [groupMembers.id] }),
}));
```

to:

```typescript
export const monthlyPaymentsRelations = relations(monthlyPayments, ({ one }) => ({
  enrollment: one(groupEnrollments, { fields: [monthlyPayments.enrollmentId], references: [groupEnrollments.id] }),
}));
```

- [ ] **Step 4: Update `schoolMembersRelations` to expose `enrollments`**

Change:

```typescript
export const schoolMembersRelations = relations(schoolMembers, ({ one }) => ({
  school: one(schools, { fields: [schoolMembers.schoolId], references: [schools.id] }),
  student: one(users, { fields: [schoolMembers.studentId], references: [users.id] }),
}));
```

to:

```typescript
export const schoolMembersRelations = relations(schoolMembers, ({ one, many }) => ({
  school: one(schools, { fields: [schoolMembers.schoolId], references: [schools.id] }),
  student: one(users, { fields: [schoolMembers.studentId], references: [users.id] }),
  enrollments: many(groupEnrollments),
}));
```

- [ ] **Step 5: Verify backend builds**

Run: `npm run build --workspace=apps/backend`

Expected: this will FAIL at this point, because `groups.service.ts`, `groups.controller.ts`, `schools.service.ts`, and `student-access.service.ts` still reference `groupMembers`/`groupMemberId`. This is expected — schema-only changes are not meant to compile in isolation here since the rest of the codebase references the old table. Confirm the failure output specifically names `groupMembers`/`groupMemberId` (not an unrelated error) before proceeding — this is you sanity-checking that Step 1-4 correctly removed the old exports.

- [ ] **Step 6: Write the migration SQL by hand (do not use `drizzle-kit generate` for the data-migration portion — write it directly, since it needs a one-time data backfill that `drizzle-kit generate` cannot produce)**

Create `apps/backend/drizzle/migrations/0022_group_enrollments.sql`:

```sql
-- 1. Create group_enrollments table
CREATE TABLE IF NOT EXISTS "group_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_member_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "selected_plan_id" uuid,
  "forced_closed" boolean NOT NULL DEFAULT false,
  "joined_at" timestamp with time zone DEFAULT now(),
  "removed_at" timestamp with time zone
);

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_school_member_id_fkey"
  FOREIGN KEY ("school_member_id") REFERENCES "school_members"("id") ON DELETE CASCADE;

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE;

ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_selected_plan_id_fkey"
  FOREIGN KEY ("selected_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL;

-- 2. Backfill: for every group_members row whose student has no school_members row
--    in the school that owns that group's course, create one (role='student').
INSERT INTO "school_members" ("id", "school_id", "student_id", "role", "joined_at")
SELECT gen_random_uuid(), s.id, gm.student_id, 'student', gm.joined_at
FROM "group_members" gm
JOIN "groups" g ON g.id = gm.group_id
JOIN "courses" c ON c.id = g.course_id
JOIN "schools" s ON s.admin_id = c.admin_id
WHERE NOT EXISTS (
  SELECT 1 FROM "school_members" sm
  WHERE sm.school_id = s.id AND sm.student_id = gm.student_id
);

-- 3. Copy group_members rows into group_enrollments, resolving school_member_id
--    via the (school, student) pair established/confirmed in step 2.
INSERT INTO "group_enrollments" ("id", "school_member_id", "group_id", "selected_plan_id", "forced_closed", "joined_at", "removed_at")
SELECT gm.id, sm.id, gm.group_id, gm.selected_plan_id, gm.forced_closed, gm.joined_at, gm.removed_at
FROM "group_members" gm
JOIN "groups" g ON g.id = gm.group_id
JOIN "courses" c ON c.id = g.course_id
JOIN "schools" s ON s.admin_id = c.admin_id
JOIN "school_members" sm ON sm.school_id = s.id AND sm.student_id = gm.student_id;

-- 4. Repoint monthly_payments: add enrollment_id, backfill from group_member_id
--    (group_enrollments.id was seeded identical to group_members.id in step 3,
--    so the FK value itself does not change, only the column name/target).
ALTER TABLE "monthly_payments" ADD COLUMN IF NOT EXISTS "enrollment_id" uuid;
UPDATE "monthly_payments" SET "enrollment_id" = "group_member_id";
ALTER TABLE "monthly_payments" ALTER COLUMN "enrollment_id" SET NOT NULL;

ALTER TABLE "monthly_payments"
  ADD CONSTRAINT "monthly_payments_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "group_enrollments"("id") ON DELETE CASCADE;

DROP INDEX IF EXISTS "monthly_payments_group_member_id_period_month_key";
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_payments_enrollment_id_period_month_key"
  ON "monthly_payments" ("enrollment_id", "period_month");

ALTER TABLE "monthly_payments" DROP CONSTRAINT IF EXISTS "monthly_payments_group_member_id_fkey";
ALTER TABLE "monthly_payments" DROP COLUMN IF EXISTS "group_member_id";

-- 5. Drop the old group_members table now that all data has been migrated.
DROP TABLE IF EXISTS "group_members";
```

- [ ] **Step 7: Apply the migration manually**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -f apps/backend/drizzle/migrations/0022_group_enrollments.sql`

Expected: no errors. If `monthly_payments_group_member_id_fkey` or similar constraint names differ from what's guessed above, first run `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d monthly_payments"` to see the actual constraint name before running Step 6's DROP CONSTRAINT line, and adjust the migration file to match the real name.

- [ ] **Step 8: Verify migration applied correctly**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d group_enrollments"`
Expected: table exists with columns `id, school_member_id, group_id, selected_plan_id, forced_closed, joined_at, removed_at` and the three FK constraints.

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "\d monthly_payments"`
Expected: `enrollment_id` column present (NOT NULL), `group_member_id` column absent, unique index on `(enrollment_id, period_month)`.

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "SELECT COUNT(*) FROM group_enrollments"` and compare to `SELECT COUNT(*) FROM monthly_payments` row counts loosely matching what existed before (no payment rows should have been dropped — if the dev DB had 0 rows in `group_members` before this migration, both counts will be 0, which is fine).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/0022_group_enrollments.sql
git commit -m "feat(db): add group_enrollments table linked to school_members, repoint monthly_payments"
```

---

### Task 2: `GroupsService` + `GroupsController` — rewrite around `group_enrollments`

**Files:**
- Modify: `apps/backend/src/groups/groups.service.ts`
- Modify: `apps/backend/src/groups/groups.controller.ts`

**Interfaces:**
- Consumes: `groupEnrollments`, `schoolMembers`, `schools` from `apps/backend/src/db/schema.ts` (Task 1).
- Produces: `GroupsService.enrollStudent(groupId: string, adminId: string, studentId: string): Promise<GroupEnrollmentRow>` — new method, backing `POST groups/:id/enroll`.
- Produces: `GroupsService.assignCuratorFromStaff(groupId: string, adminId: string, studentId: string)` — same signature as before, new implementation (auto-promotes to `school_members.role = 'curator'`).
- Removes: `GroupsService.getJoinPreview`, `GroupsService.joinByToken` and their controller routes.
- The response shape returned by `findMembers` must keep the exact same JSON field names the frontend already expects (`id`, `groupId`, `studentId`, `role`, `selectedPlanId`, `forcedClosed`, `joinedAt`, `student: {id, name, phone, email}`, `selectedPlan: {id, name, price} | null`, `latestPayment: {...} | null`) — see `apps/frontend/src/api/groups.ts`'s `ApiGroupMember` interface, which is NOT changed by this plan. `id` in the response is the `group_enrollments.id` (what the frontend calls `memberId`); `role` is sourced from the joined `school_members.role`.

- [ ] **Step 1: Rewrite `apps/backend/src/groups/groups.service.ts` in full**

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupEnrollments, schoolMembers, schools, pricingPlans, monthlyPayments } from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { StudentAccessService } from '../payments/student-access.service';

@Injectable()
export class GroupsService {
  constructor(private studentAccessService: StudentAccessService) {}

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

  private async getOrCreateSchool(adminId: string) {
    let school = await db.query.schools.findFirst({ where: eq(schools.adminId, adminId) });
    if (!school) {
      [school] = await db.insert(schools).values({ adminId, inviteToken: randomUUID() }).returning();
    }
    return school;
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
    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.groupId, groupId), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: { with: { student: true } }, selectedPlan: true },
    });
    const withLatestPayment = await Promise.all(
      enrollments.map(async (e) => {
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.enrollmentId, e.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return {
          id: e.id,
          groupId: e.groupId,
          studentId: e.schoolMember.studentId,
          role: e.schoolMember.role,
          selectedPlanId: e.selectedPlanId,
          forcedClosed: e.forcedClosed,
          joinedAt: e.joinedAt,
          student: e.schoolMember.student,
          selectedPlan: e.selectedPlan,
          latestPayment: latestPayment ?? null,
        };
      }),
    );
    return withLatestPayment;
  }

  async updateMember(
    groupId: string,
    memberId: string,
    adminId: string,
    data: { selectedPlanId?: string | null },
  ) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    if (data.selectedPlanId) {
      const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, data.selectedPlanId) });
      if (!plan) throw new BadRequestException('Pricing plan not found');
    }
    const [updated] = await db
      .update(groupEnrollments)
      .set({ selectedPlanId: data.selectedPlanId })
      .where(eq(groupEnrollments.id, memberId))
      .returning();
    return updated;
  }

  async setForcedClosed(groupId: string, memberId: string, adminId: string, forcedClosed: boolean) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    const [updated] = await db
      .update(groupEnrollments)
      .set({ forcedClosed })
      .where(eq(groupEnrollments.id, memberId))
      .returning();
    return updated;
  }

  async removeMember(groupId: string, memberId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    await db
      .update(groupEnrollments)
      .set({ removedAt: new Date() })
      .where(and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)));
  }

  private async findOrCreateSchoolMember(adminId: string, studentId: string) {
    const school = await this.getOrCreateSchool(adminId);
    let member = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (!member) throw new NotFoundException('Student is not a member of this school');
    return member;
  }

  private async findOrCreateEnrollment(groupId: string, schoolMemberId: string) {
    const existing = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.groupId, groupId), eq(groupEnrollments.schoolMemberId, schoolMemberId)),
    });
    if (existing && !existing.removedAt) return existing;
    if (existing) {
      const [reactivated] = await db
        .update(groupEnrollments)
        .set({ removedAt: null, joinedAt: new Date() })
        .where(eq(groupEnrollments.id, existing.id))
        .returning();
      return reactivated;
    }
    const [created] = await db
      .insert(groupEnrollments)
      .values({ groupId, schoolMemberId, selectedPlanId: null })
      .returning();
    return created;
  }

  async enrollStudent(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    return this.findOrCreateEnrollment(groupId, schoolMember.id);
  }

  async assignCuratorFromStaff(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    if (schoolMember.role !== 'curator') {
      await db.update(schoolMembers).set({ role: 'curator' }).where(eq(schoolMembers.id, schoolMember.id));
    }
    return this.findOrCreateEnrollment(groupId, schoolMember.id);
  }

  async findPendingPlanAssignment(adminId: string) {
    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];

    const adminGroups = await db.query.groups.findMany({
      where: (g, { inArray }) => inArray(g.courseId, courseIds),
    });
    const groupIds = adminGroups.map((g) => g.id);
    if (groupIds.length === 0) return [];

    const pending = await db.query.groupEnrollments.findMany({
      where: (e, { inArray }) => and(inArray(e.groupId, groupIds), isNull(e.removedAt), isNull(e.selectedPlanId)),
      with: { schoolMember: { with: { student: true } } },
    });

    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    return pending
      .filter((e) => e.schoolMember.role === 'student')
      .map((e) => {
        const group = groupById.get(e.groupId);
        const course = group ? courseById.get(group.courseId) : undefined;
        return {
          id: e.id,
          studentName: e.schoolMember.student.name,
          studentPhone: e.schoolMember.student.phone,
          groupName: group?.name ?? '',
          courseTitle: course?.title ?? '',
          joinedAt: e.joinedAt,
        };
      });
  }

  async getMyCourses(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = memberships.map((m) => m.id);
    if (schoolMemberIds.length === 0) return [];

    const enrollments = await db.query.groupEnrollments.findMany({
      where: (e, { inArray }) => and(inArray(e.schoolMemberId, schoolMemberIds), isNull(e.removedAt)),
      with: { group: { with: { course: true } }, selectedPlan: true },
    });

    return Promise.all(
      enrollments.map(async (e) => {
        const hasAccess = await this.studentAccessService.assertStudentLessonAccess(
          e.group.courseId,
          studentId,
        );
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.enrollmentId, e.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return {
          courseId: e.group.courseId,
          courseTitle: e.group.course.title,
          groupName: e.group.name,
          selectedPlanName: e.selectedPlan?.name ?? null,
          latestPaymentStatus: latestPayment?.status ?? null,
          hasAccess,
        };
      }),
    );
  }
}
```

Notes on the rewrite vs. the old service:
- `updateMember`'s `data` parameter dropped `role?: string` — role is no longer settable per-group. The controller's `UpdateMemberDto` changes accordingly in Step 2 below.
- `getJoinPreview` and `joinByToken` are gone (moved conceptually to `enrollStudent`, which is admin-only, not student-initiated).
- `findPendingPlanAssignment` filters `schoolMember.role === 'student'` in application code (not the query) because Drizzle's nested `with` filter cannot easily filter on a joined table's column in one `where` — this is a deliberate, acceptable simplification since the pending-list size per admin is small (their own students only).

- [ ] **Step 2: Rewrite `apps/backend/src/groups/groups.controller.ts` in full**

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

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
  @IsOptional() @IsUUID() selectedPlanId?: string | null;
}

class ForceCloseDto {
  @IsBoolean() forcedClosed: boolean;
}

class AssignCuratorDto {
  @IsUUID() studentId: string;
}

class EnrollStudentDto {
  @IsUUID() studentId: string;
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('groups/:id/curators')
  assignCurator(@Param('id') id: string, @Req() req: any, @Body() dto: AssignCuratorDto) {
    return this.groupsService.assignCuratorFromStaff(id, req.admin.id, dto.studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('groups/:id/enroll')
  enrollStudent(@Param('id') id: string, @Req() req: any, @Body() dto: EnrollStudentDto) {
    return this.groupsService.enrollStudent(id, req.admin.id, dto.studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('groups/pending-plan-assignment')
  findPendingPlanAssignment(@Req() req: any) {
    return this.groupsService.findPendingPlanAssignment(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses')
  getMyCourses(@Req() req: any) {
    return this.groupsService.getMyCourses(req.user.id);
  }
}
```

Note: `GET/POST join/:token` are gone entirely (no replacement route — enrollment is now `POST groups/:id/enroll`, admin-only).

- [ ] **Step 3: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: still FAILS at this point — `schools.service.ts` and `student-access.service.ts` still reference `groupMembers`. Confirm the error output only names those two files (not `groups.service.ts`/`groups.controller.ts` anymore) before proceeding.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/groups/groups.service.ts apps/backend/src/groups/groups.controller.ts
git commit -m "feat(groups): rewrite GroupsService/Controller around group_enrollments + school_members, remove /join/:token"
```

---

### Task 3: `StudentAccessService` — query through `school_members` + `group_enrollments`

**Files:**
- Modify: `apps/backend/src/payments/student-access.service.ts`

**Interfaces:**
- Consumes: `groupEnrollments`, `schoolMembers`, `groups`, `monthlyPayments` from `apps/backend/src/db/schema.ts` (Task 1).
- Produces: `StudentAccessService.assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean>` — same signature as before, callers (`GroupsService.getMyCourses`, already updated in Task 2) are unaffected.

- [ ] **Step 1: Rewrite `apps/backend/src/payments/student-access.service.ts` in full**

```typescript
import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupEnrollments, groups, monthlyPayments, schoolMembers } from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class StudentAccessService {
  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return false;
    const groupIds = courseGroups.map((g) => g.id);

    const schoolMemberRows = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = schoolMemberRows.map((m) => m.id);
    if (schoolMemberIds.length === 0) return false;

    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        inArray(groupEnrollments.schoolMemberId, schoolMemberIds),
        inArray(groupEnrollments.groupId, groupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!enrollment || !enrollment.selectedPlanId) return false;
    if (enrollment.forcedClosed) return false;

    const latestPayment = await db.query.monthlyPayments.findFirst({
      where: eq(monthlyPayments.enrollmentId, enrollment.id),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    if (!latestPayment) return false;
    return latestPayment.status !== 'debt';
  }
}
```

- [ ] **Step 2: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: still FAILS — only `schools.service.ts` should remain (it references `groupMembers` for the "total paid" aggregation in `listAllStudents`). Confirm the error output only names `schools.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/payments/student-access.service.ts
git commit -m "feat(payments): rewrite StudentAccessService to query group_enrollments via school_members"
```

---

### Task 4: `SchoolsService` — fix `listAllStudents` aggregation, add `findStudentsWithoutGroup`

**Files:**
- Modify: `apps/backend/src/schools/schools.service.ts`
- Modify: `apps/backend/src/schools/schools.controller.ts`

**Interfaces:**
- Consumes: `groupEnrollments` from `apps/backend/src/db/schema.ts` (Task 1).
- Produces: `SchoolsService.findStudentsWithoutGroup(adminId: string): Promise<{id, name, phone, joinedAt}[]>` — new method, backing `GET school/students/without-group`.
- `SchoolsService.listAllStudents` keeps its exact existing return shape (`{id, name, phone, productsCount, totalPaid}[]`) — only its internal query changes from `groupMembers` to `groupEnrollments`.

- [ ] **Step 1: Edit `apps/backend/src/schools/schools.service.ts`**

Change the import line:

```typescript
import { schools, schoolMembers, users, courses, groups, groupMembers, monthlyPayments } from '../db/schema';
```

to:

```typescript
import { schools, schoolMembers, users, courses, groups, groupEnrollments, monthlyPayments } from '../db/schema';
```

Change `listAllStudents`'s body — replace:

```typescript
        const memberships = await db.query.groupMembers.findMany({
          where: (gm, { inArray }) =>
            and(eq(gm.studentId, m.studentId), inArray(gm.groupId, groupIds), isNull(gm.removedAt)),
        });
        const memberIds = memberships.map((gm) => gm.id);
        let totalPaid = 0;
        if (memberIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.groupMemberId, memberIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
```

with:

```typescript
        const memberships = await db.query.groupEnrollments.findMany({
          where: (e, { inArray }) =>
            and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        });
        const enrollmentIds = memberships.map((e) => e.id);
        let totalPaid = 0;
        if (enrollmentIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.enrollmentId, enrollmentIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
```

Note the query now filters by `e.schoolMemberId, m.id` (the current `school_members` row's own id) instead of `gm.studentId, m.studentId` — this is correct because `group_enrollments` links to `school_members.id`, not directly to the student.

Add a new method after `listAllStudents`:

```typescript
  async findStudentsWithoutGroup(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    const adminGroups = courseIds.length
      ? await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) })
      : [];
    const groupIds = adminGroups.map((g) => g.id);

    const result: { id: string; name: string; phone: string | null; joinedAt: Date | null }[] = [];
    for (const m of members) {
      if (groupIds.length === 0) {
        result.push({ id: m.studentId, name: m.student.name, phone: m.student.phone, joinedAt: m.joinedAt });
        continue;
      }
      const activeEnrollment = await db.query.groupEnrollments.findFirst({
        where: (e, { inArray }) => and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
      });
      if (!activeEnrollment) {
        result.push({ id: m.studentId, name: m.student.name, phone: m.student.phone, joinedAt: m.joinedAt });
      }
    }
    return result;
  }
```

- [ ] **Step 2: Add the controller route in `apps/backend/src/schools/schools.controller.ts`**

Add after the existing `listAllStudents` route:

```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/without-group')
  findStudentsWithoutGroup(@Req() req: any) {
    return this.schoolsService.findStudentsWithoutGroup(req.admin.id);
  }
```

(Place it directly below the existing `@Get('school/students')` handler for readability — order does not affect routing since the path is distinct.)

- [ ] **Step 3: Verify backend builds cleanly**

Run: `npm run build --workspace=apps/backend`
Expected: PASS with no errors. This is the first point where the full backend compiles — if it fails, grep the error output for any remaining `groupMembers`/`groupMemberId`/`ApiGroupMember` reference in backend `.ts` files (`grep -rn "groupMembers\|groupMemberId" apps/backend/src`) and fix it before proceeding.

- [ ] **Step 4: Run the existing backend test suite**

Run: `npm test --workspace=apps/backend`
Expected: all existing suites still pass (this plan does not add new `.spec.ts` files, per the Global Constraints note — there is no existing test coverage for `GroupsService`/`SchoolsService` to update). The pass count should match the pre-change baseline (96 tests as of the last confirmed run in this project).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/schools/schools.service.ts apps/backend/src/schools/schools.controller.ts
git commit -m "feat(schools): fix listAllStudents to use group_enrollments, add findStudentsWithoutGroup"
```

---

### Task 5: Frontend — remove `/join/:token`, add enrollment API + store action

**Files:**
- Modify: `apps/frontend/src/api/groups.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/stores/courseStore.ts`
- Delete: `apps/frontend/src/pages/JoinGroupPage.tsx`

**Interfaces:**
- Consumes: `POST groups/:id/enroll` (Task 2).
- Produces: `apiEnrollStudent(groupId: string, studentId: string): Promise<ApiGroupMember>` in `apps/frontend/src/api/groups.ts`.
- Produces: `enrollStudent(courseId: string, groupId: string, studentId: string): Promise<void>` action on `useCourseStore`, added to the `CourseState` interface alongside `assignCurator`.

- [ ] **Step 1: Edit `apps/frontend/src/api/groups.ts` — remove join functions, add enroll function**

Remove:

```typescript
export async function apiGetJoinPreview(token: string): Promise<{ groupName: string; courseTitle: string }> {
  const res = await client.get(`/join/${token}`);
  return res.data;
}

export async function apiJoinGroup(token: string): Promise<ApiGroupMember> {
  const res = await client.post(`/join/${token}`);
  return res.data;
}
```

Add in its place (same location in the file):

```typescript
export async function apiEnrollStudent(groupId: string, studentId: string): Promise<ApiGroupMember> {
  const res = await client.post(`/groups/${groupId}/enroll`, { studentId });
  return res.data;
}
```

- [ ] **Step 2: Delete `apps/frontend/src/pages/JoinGroupPage.tsx`**

```bash
rm apps/frontend/src/pages/JoinGroupPage.tsx
```

- [ ] **Step 3: Edit `apps/frontend/src/App.tsx` — remove the import and route**

Remove the import line:

```typescript
import { JoinGroupPage } from './pages/JoinGroupPage';
```

Remove the route entry:

```typescript
  { path: '/join/:token', element: <JoinGroupPage /> },
```

- [ ] **Step 4: Edit `apps/frontend/src/stores/courseStore.ts` — add `enrollStudent` action**

Add to the import from `'../api/groups'` (find the existing multi-line import block that starts `apiListGroups, apiCreateGroup, ...` and add `apiEnrollStudent` to it):

```typescript
import {
  apiListGroups, apiCreateGroup, apiUpdateGroup, apiDeleteGroup,
  apiListGroupMembers, apiUpdateGroupMember, apiSetMemberForcedClosed, apiRemoveGroupMember,
  apiAssignCurator, apiEnrollStudent,
} from '../api/groups';
```

Add to the `CourseState` interface, directly below the existing `assignCurator` line:

```typescript
  assignCurator: (courseId: string, groupId: string, studentId: string) => Promise<void>;
  enrollStudent: (courseId: string, groupId: string, studentId: string) => Promise<void>;
```

Add the implementation directly below the existing `assignCurator` action body (same file, in the `create<CourseState>` object — follow the exact pattern `assignCurator` already uses, since enrolling and assigning-curator both need to reload the full member list from the server rather than trying to merge a partial response, because the enrolled/promoted person may not have been in the local `members` array before):

```typescript
  enrollStudent: async (courseId, groupId, studentId) => {
    await apiEnrollStudent(groupId, studentId);
    const memberRows = await apiListGroupMembers(groupId);
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
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id !== groupId ? g : { ...g, members })) },
      ),
    });
  },
```

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: FAILS at this point — `CourseGroupsPage.tsx` still calls `handleCopyInviteLink` which references `group.inviteToken` for a `/join/${group.inviteToken}` URL; this is not a compile error (the field still exists on `Group`), so the build should actually PASS here. Run it anyway to confirm no stray reference to the deleted `apiGetJoinPreview`/`apiJoinGroup` remains (`grep -rn "apiGetJoinPreview\|apiJoinGroup" apps/frontend/src` should return nothing).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/groups.ts apps/frontend/src/App.tsx apps/frontend/src/stores/courseStore.ts
git rm apps/frontend/src/pages/JoinGroupPage.tsx
git commit -m "feat(groups): remove /join/:token from frontend, add apiEnrollStudent + enrollStudent action"
```

---

### Task 6: Frontend — `CourseGroupsPage.tsx` enroll-student UI (replaces "copy invite link")

**Files:**
- Modify: `apps/frontend/src/components/course/CourseGroupsPage.tsx`

**Interfaces:**
- Consumes: `enrollStudent` action from `useCourseStore` (Task 5), `staff`/`loadStaff` pattern already used for the curator select (this task reuses the same `useSchoolStore` staff-loading approach but needs the school's STUDENTS, not staff — via a new store piece described below).
- Produces: no new exported interfaces; this is a leaf UI change.

Since `useSchoolStore` currently only exposes `staff` (role != student), and this page needs a students list to pick from, the plan reuses the already-existing `GET /school/students` endpoint (`SchoolsService.listAllStudents`, already wired to `apps/frontend/src/api/school.ts`'s `apiListAllStudents` and consumed by `StudentsPage.tsx`) directly in this component via local state — no store change needed, since this is a one-off local fetch triggered when the enroll UI opens (matches the existing pattern in `AddStaffModal.tsx` search-on-demand, but simpler since there's no search query needed for a full list).

- [ ] **Step 1: Add the import and local state to `apps/frontend/src/components/course/CourseGroupsPage.tsx`**

Add to the top-level imports (alongside the existing `useSchoolStore` import):

```typescript
import { apiListAllStudents, type ApiSchoolStudent } from '../../api/school';
```

Add to the component's state declarations (alongside `linkCopied`):

```typescript
  const [schoolStudents, setSchoolStudents] = useState<ApiSchoolStudent[]>([]);
```

- [ ] **Step 2: Load the students list when entering the group's "O'quvchilar" tab**

Replace the existing `useEffect` (which currently only handles `innerTab === 'settings'`):

```typescript
  useEffect(() => {
    if (group && innerTab === 'settings') {
      void loadGroupPayments(group.id).then(setPayments);
      if (!staffLoaded) void loadStaff();
    }
  }, [group?.id, innerTab, loadGroupPayments, staffLoaded, loadStaff]);
```

with:

```typescript
  useEffect(() => {
    if (group && innerTab === 'settings') {
      void loadGroupPayments(group.id).then(setPayments);
      if (!staffLoaded) void loadStaff();
    }
    if (group && innerTab === 'students') {
      void apiListAllStudents().then(setSchoolStudents);
    }
  }, [group?.id, innerTab, loadGroupPayments, staffLoaded, loadStaff]);
```

- [ ] **Step 3: Replace `handleCopyInviteLink` and the "Havolani nusxalash" button with an enroll-student select**

Remove `handleCopyInviteLink` and the `linkCopied` state (both now unused):

```typescript
  const [linkCopied, setLinkCopied] = useState(false);
```

```typescript
  function handleCopyInviteLink() {
    if (!group) return;
    const url = `${window.location.origin}/join/${group.inviteToken}`;
    void navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }
```

Remove the unused `Copy`/`Check` icon imports from the top of the file — change:

```typescript
import { Inbox, Plus, Users, X, Trash2, Copy, Check } from 'lucide-react';
```

to:

```typescript
import { Inbox, Plus, Users, X, Trash2, UserPlus } from 'lucide-react';
```

Replace the header block that currently renders the copy-link button:

```typescript
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
                >
                  {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                  {linkCopied ? 'Nusxalandi' : 'Havolani nusxalash'}
                </button>
```

with a `<select>` that enrolls the chosen school student directly (mirrors the exact pattern already used for the curator-assignment select further down in this same file):

```typescript
                <select
                  value=""
                  onChange={(e) => e.target.value && void enrollStudent(courseId, group.id, e.target.value)}
                  className="shrink-0 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                >
                  <option value="">
                    <UserPlus size={16} /> O'quvchi qo'shish...
                  </option>
                  {schoolStudents
                    .filter((s) => !students.some((m) => m.studentId === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
```

(Note: `<option>` elements cannot render a Lucide icon component as JSX — `<option>` content must be plain text. Fix the placeholder option to plain text: `<option value="">O'quvchi qo'shish...</option>` and drop `UserPlus` from the import since it is not actually needed. Re-check the import line from this same step: use `import { Inbox, Plus, Users, X, Trash2 } from 'lucide-react';` — no new icon needed.)

- [ ] **Step 4: Destructure `enrollStudent` from the store at the top of the component**

Change:

```typescript
  const {
    courses, addGroup, renameGroup,
    setMemberRole, removeStudentFromGroup, deleteGroup,
    setMemberPlan, setMemberForcedClosed, loadGroupPayments, assignCurator,
  } = useCourseStore();
```

to:

```typescript
  const {
    courses, addGroup, renameGroup,
    setMemberRole, removeStudentFromGroup, deleteGroup,
    setMemberPlan, setMemberForcedClosed, loadGroupPayments, assignCurator, enrollStudent,
  } = useCourseStore();
```

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS with no TypeScript errors. If `linkCopied`/`handleCopyInviteLink`/`Copy`/`Check` are still referenced anywhere (grep the file to confirm none remain), remove the stragglers.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/CourseGroupsPage.tsx
git commit -m "feat(groups): replace invite-link copy button with direct student enrollment select"
```

---

### Task 7: Frontend — surface `findStudentsWithoutGroup` on the "Ruxsat kutayotganlar" page

**Files:**
- Modify: `apps/frontend/src/api/school.ts`
- Modify: `apps/frontend/src/pages/StudentsPage.tsx`

**Interfaces:**
- Consumes: `GET school/students/without-group` (Task 4).
- Produces: `apiGetStudentsWithoutGroup(): Promise<ApiSchoolStudentWithoutGroup[]>` in `apps/frontend/src/api/school.ts`.

Per spec §7, the "pending" page must show both existing categories: students enrolled in a group but awaiting a plan (`apiGetPendingPlanAssignment`, already wired), AND students who joined the school but have no group enrollment at all (new, from Task 4). This task adds the second list as its own labeled section above the existing table, rather than merging the two into one table (they have different columns: one has group/course/joined-date, the other has only joined-date).

- [ ] **Step 1: Add the API wrapper in `apps/frontend/src/api/school.ts`**

Add after the existing `apiListAllStudents` function:

```typescript
export interface ApiSchoolStudentWithoutGroup {
  id: string;
  name: string;
  phone: string | null;
  joinedAt: string;
}

export async function apiGetStudentsWithoutGroup(): Promise<ApiSchoolStudentWithoutGroup[]> {
  const res = await client.get('/school/students/without-group');
  return res.data;
}
```

- [ ] **Step 2: Wire it into `apps/frontend/src/pages/StudentsPage.tsx`**

Add to the imports (extend the existing `from "../api/school"` import):

```typescript
import { apiListAllStudents, apiGetStudentsWithoutGroup, type ApiSchoolStudent, type ApiSchoolStudentWithoutGroup } from "../api/school";
```

Add a new state declaration next to `pendingRows`:

```typescript
  const [pendingRows, setPendingRows] = useState<ApiPendingPlanAssignment[]>([]);
  const [withoutGroupRows, setWithoutGroupRows] = useState<ApiSchoolStudentWithoutGroup[]>([]);
```

Add a fetch effect next to the existing `apiGetPendingPlanAssignment` effect:

```typescript
  useEffect(() => {
    void apiGetPendingPlanAssignment().then(setPendingRows);
  }, []);

  useEffect(() => {
    void apiGetStudentsWithoutGroup().then(setWithoutGroupRows);
  }, []);
```

Update `tabCounts` so the pending tab count reflects both categories combined:

```typescript
  const tabCounts = {
    "/students": allUsers.length,
    "/students/list": allUsers.length,
    "/students/pending": pendingRows.length + withoutGroupRows.length,
  };
```

Insert a new section immediately above the existing pending table, inside the `status === "pending"` branch — change:

```typescript
          {status === "pending" ? (
            pendingRows.length === 0 ? (
```

to:

```typescript
          {status === "pending" ? (
            <>
            {withoutGroupRows.length > 0 && (
              <div className="rounded-2xl bg-white p-4">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  Guruhga kutilmoqda ({withoutGroupRows.length})
                </p>
                <div className="flex flex-col gap-2">
                  {withoutGroupRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.phone ?? ""}</p>
                      </div>
                      <p className="shrink-0 text-xs text-gray-400">{formatDate(r.joinedAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pendingRows.length === 0 ? (
```

Then find the closing of that same conditional block — change:

```typescript
                </div>
              </div>
            )
          ) : status === "list" ? (
```

to:

```typescript
                </div>
              </div>
            )}
            </>
          ) : status === "list" ? (
```

(This wraps the existing pending-plan table in a `<>...</>` fragment alongside the new "Guruhga kutilmoqda" section, so both render together under the same `status === "pending"` branch.)

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/school.ts apps/frontend/src/pages/StudentsPage.tsx
git commit -m "feat(students): surface students-without-group alongside pending-plan-assignment on /students/pending"
```

---

### Task 8: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full backend build**

Run: `npm run build --workspace=apps/backend`
Expected: PASS, zero errors.

- [ ] **Step 2: Full backend test suite**

Run: `npm test --workspace=apps/backend`
Expected: PASS, same test count as the pre-change baseline (no regressions; this plan adds no new `.spec.ts` files).

- [ ] **Step 3: Full frontend build**

Run: `npm run build --workspace=apps/frontend`
Expected: PASS, zero TypeScript errors.

- [ ] **Step 4: Grep for stray references to removed identifiers**

Run: `grep -rn "groupMembers\|groupMemberId\|joinByToken\|getJoinPreview\|apiGetJoinPreview\|apiJoinGroup\|JoinGroupPage" apps/backend/src apps/frontend/src`
Expected: no matches (empty output). If any match appears, it is a missed reference from an earlier task — fix it and re-run Steps 1-3.

- [ ] **Step 5: Manual data sanity check**

Run: `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "SELECT COUNT(*) FROM group_enrollments;"` and `psql "postgresql://macbookpro@localhost:5432/testplatform" -c "SELECT COUNT(*) FROM monthly_payments WHERE enrollment_id IS NULL;"` — the second query must return `0` (no orphaned payment rows), confirming the payment-history-integrity constraint held through the migration.

- [ ] **Step 6: Update the spec's open question status (documentation only, no code)**

No code change — this step exists only to note in the final commit message that the spec's open question (auto-promote to curator) was resolved as "yes, automatic" per direct user confirmation before this plan was written.

- [ ] **Step 7: Final commit (only if any uncommitted verification fixes were made in Steps 1-5; otherwise skip)**

```bash
git add -A
git commit -m "chore: final verification pass for school/group membership unification"
```
