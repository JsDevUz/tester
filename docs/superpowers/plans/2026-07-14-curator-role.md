# Curator Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing "curator" label (`schoolMembers.role = 'curator'`) a real, enforced access-control role: a curator can log in, sees only students in the group(s) they're assigned to at `/students/list`, can grade image and oral practice submissions for those students, and every grade records who graded it and when (already stored, just needs to be reachable by curators).

**Architecture:** Two sequential phases in one plan. Phase A retires the dead `admins` table (a schema leftover — every FK into it actually stores `users.id` values, confirmed via `seed.ts` inserting matching UUIDs into both tables) and repoints its 4 foreign keys at `users.id` directly, so Phase B doesn't add more code depending on a table we know is dead weight. Phase B adds `'curator'` as a real `users.role` value: `assignCuratorFromStaff`/`demoteCuratorFromStaff` sync `users.role` whenever `schoolMembers.role` changes, `RolesGuard`-protected endpoints admit `'curator'` where appropriate, backend list/grading queries scope curators to their assigned groups only, and the frontend gates navigation/routes so a curator only ever sees `/students/list`.

**Tech Stack:** NestJS + Drizzle ORM (PostgreSQL) backend, React + TypeScript + Zustand frontend, Jest for backend tests (no frontend test runner exists — this plan does not add one; frontend changes are verified by manual walkthrough + `tsc --noEmit`).

## Global Constraints

- Every backend behavior change needs a Jest test in the matching `*.spec.ts` file (existing convention: `apps/backend/src/**/*.spec.ts`, run via `npm test --workspace=apps/backend`).
- Every backend/frontend task ends with `npx tsc --noEmit` passing in the touched workspace (`apps/backend` or `apps/frontend`).
- Migrations go through `drizzle-kit generate` (do not hand-write SQL files — let the tool diff `schema.ts` against `drizzle/migrations`), then are committed alongside the schema change in the same task.
- No destructive `DROP TABLE`/data-loss migration runs against a real database without the user confirming first — this plan generates the migration SQL but the user runs `db:migrate` themselves (call this out explicitly in the final task).
- Uzbek-language UI strings/labels follow existing tone in the codebase (short, direct, matches strings already in the touched files).
- Do not touch unrelated code — e.g. the unused `ConflictException` import in `groups.service.ts` stays as-is, this plan doesn't do drive-by cleanup outside its own diffs.

---

## Phase A: Retire the dead `admins` table

### Task A1: Repoint schema FKs from `admins.id` to `users.id`, drop `admins` table

**Files:**
- Modify: `apps/backend/src/db/schema.ts:4-11` (delete `admins` table definition), `:159`, `:173`, `:254`, `:261`, `:282`, `:300` (repoint FKs/relations to `users`)
- Modify: `apps/backend/src/db/seed.ts` (remove `admins` insert)
- Create: new Drizzle migration (generated, not hand-written)

**Interfaces:**
- Consumes: nothing from other tasks (this is the first task).
- Produces: `imageSubmissions.gradedByAdminId`, `oralPracticeGrades.gradedByAdminId`, `paymentCancellations.cancelledByAdminId`, `schools.adminId` now reference `users.id` — every later task in this plan (and all existing code) that writes/reads these columns is unaffected in shape (still `uuid`), only the FK target changes, and callers already pass `users.id` values (e.g. `req.admin.id` from JWT is a `users.id`).

- [ ] **Step 1: Confirm current FK/relation usages of `admins` one more time (safety check before editing)**

Run:
```bash
cd apps/backend && grep -n "admins\b" src/db/schema.ts src/db/seed.ts
```
Expected output: the 4 FK lines (`:159`, `:173`, `:254`, `:282`), 2 relation lines (`:261`, `:300`), the table definition (`:4-11`), and 2 lines in `seed.ts` (`import { admins, ... }` and `await db.insert(admins)...`). If anything else references `admins`, stop and report it before continuing — this plan assumes exactly these locations.

- [ ] **Step 2: Edit `schema.ts` — delete the `admins` table definition**

In `apps/backend/src/db/schema.ts`, delete lines 4-11 (the `export const admins = pgTable(...)` block) and the blank line immediately after it, so the file starts directly with `export const users = pgTable('users', {`.

- [ ] **Step 3: Edit `schema.ts` — repoint `imageSubmissions.gradedByAdminId` and `oralPracticeGrades.gradedByAdminId`**

Change (line ~159, originally):
```ts
  gradedByAdminId: uuid('graded_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
```
to:
```ts
  gradedByAdminId: uuid('graded_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
```
Apply the identical change at the other occurrence (originally line ~173, inside `oralPracticeGrades`).

- [ ] **Step 4: Edit `schema.ts` — repoint `paymentCancellations.cancelledByAdminId` column and its relation**

Change (originally line ~254):
```ts
  cancelledByAdminId: uuid('cancelled_by_admin_id').references(() => admins.id, { onDelete: 'set null' }),
```
to:
```ts
  cancelledByAdminId: uuid('cancelled_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
```
Change the relation (originally line ~261):
```ts
  cancelledByAdmin: one(admins, { fields: [paymentCancellations.cancelledByAdminId], references: [admins.id] }),
```
to:
```ts
  cancelledByAdmin: one(users, { fields: [paymentCancellations.cancelledByAdminId], references: [users.id] }),
```

- [ ] **Step 5: Edit `schema.ts` — repoint `schools.adminId` column and its relation**

Change (originally line ~282):
```ts
  adminId: uuid('admin_id').notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
```
to:
```ts
  adminId: uuid('admin_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
```
Change the relation (originally line ~300):
```ts
  admin: one(admins, { fields: [schools.adminId], references: [admins.id] }),
```
to:
```ts
  admin: one(users, { fields: [schools.adminId], references: [users.id] }),
```

- [ ] **Step 6: Edit `seed.ts` — remove the `admins` insert**

Open `apps/backend/src/db/seed.ts`. Change:
```ts
import { admins, users } from './schema';
```
to:
```ts
import { users } from './schema';
```
Delete the line:
```ts
  await db.insert(admins).values({ id: user.id, email, passwordHash, name, role: 'super' }).onConflictDoNothing();
```
(Keep the `db.insert(users).values(...)` line above it untouched.)

- [ ] **Step 7: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors. If `admins` is referenced anywhere else the grep in Step 1 missed, this will surface it as a compile error — fix by applying the same `admins` → `users` substitution pattern.

- [ ] **Step 8: Generate the migration**

Run: `cd apps/backend && npx drizzle-kit generate`
Expected: a new file appears under `drizzle/migrations/` (e.g. `0027_<name>.sql`) containing `DROP TABLE "admins"` and 4 `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... REFERENCES "users"("id")`-style statements (exact wording depends on drizzle-kit's diffing, but it must include a `DROP TABLE` for `admins` and constraint changes for the 4 columns touched in Steps 3-5). Read the generated SQL file and confirm it does not contain any `DROP COLUMN` or data-deleting statement beyond dropping the now-empty `admins` table itself.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/src/db/seed.ts apps/backend/drizzle/migrations
git commit -m "$(cat <<'EOF'
refactor(db): drop dead admins table, repoint FKs to users

admins was a shadow table only ever written with the same UUID as the
matching users row (see old seed.ts) — every FK into it already stored
a users.id in practice. Repoints gradedByAdminId, cancelledByAdminId,
and schools.adminId directly at users.id and removes the table.
EOF
)"
```

**Note for the user:** this task generates the migration SQL but does not run it. Before deploying, run `cd apps/backend && npx drizzle-kit migrate` against the target database yourself (per this plan's Global Constraints — no destructive migration runs unattended).

---

## Phase B: Curator role

### Task B1: Add `curator` to the role type system (backend + frontend types)

**Files:**
- Modify: `apps/backend/src/admins/admins.controller.ts` (the `UpdateRoleDto` class)
- Modify: `apps/frontend/src/api/auth.ts` (the `Admin` interface)

**Interfaces:**
- Consumes: nothing new (JWT/`RolesGuard`/`roles.decorator.ts` already accept arbitrary string role values — no code change needed there, per Task B0 research: `RolesGuard` does `roles.includes(user?.role)` with no hardcoded role list).
- Produces: `'curator'` is now a type-level valid value for `users.role` on both backend DTO validation and frontend `Admin.role`. Later tasks (B2+) rely on `Admin.role` including `'curator'` for frontend conditionals, and on `@Roles('curator', ...)` being usable on any controller route.

- [ ] **Step 1: Widen the backend `UpdateRoleDto`**

In `apps/backend/src/admins/admins.controller.ts`, find:
```ts
class UpdateRoleDto {
  @IsIn(['student', 'teacher', 'super']) role: 'student' | 'teacher' | 'super';
}
```
Change to:
```ts
class UpdateRoleDto {
  @IsIn(['student', 'teacher', 'super', 'curator']) role: 'student' | 'teacher' | 'super' | 'curator';
}
```

- [ ] **Step 2: Widen the frontend `Admin` type**

In `apps/frontend/src/api/auth.ts`, find:
```ts
export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'super';
  phone?: string | null;
}
```
Change the `role` line to:
```ts
  role: 'student' | 'teacher' | 'super' | 'curator';
```

- [ ] **Step 3: Typecheck both workspaces**

Run: `cd apps/backend && npx tsc --noEmit`
Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors in either (this is a pure type-widening change, nothing consumes the new union member yet).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/admins/admins.controller.ts apps/frontend/src/api/auth.ts
git commit -m "$(cat <<'EOF'
feat(auth): add curator as a valid role value

Widens UpdateRoleDto (backend) and Admin.role (frontend) to accept
'curator' alongside student/teacher/super. No behavior change yet —
this just makes the type system accept the value that Task B2 starts
writing.
EOF
)"
```

---

### Task B2: Sync `users.role` when `schoolMembers.role` changes to/from curator

**Files:**
- Modify: `apps/backend/src/groups/groups.service.ts:212-232` (`assignCuratorFromStaff`, `demoteCuratorFromStaff`)
- Test: Create `apps/backend/src/groups/groups.service.spec.ts`

**Interfaces:**
- Consumes: `db` from `../db`, `schoolMembers`, `groupEnrollments`, `users` from `../db/schema` (all already imported in this file except `users` — add it).
- Produces: a new private method `syncUserRoleAfterCuratorChange(studentId: string): Promise<void>` on `GroupsService`. Later tasks don't call this directly (it's wired internally to the two existing public methods), but its existence/behavior — "sets `users.role` to `'curator'` if the user has at least one active curator `groupEnrollment` anywhere, otherwise resets it to `'student'` only if it was `'curator'`" — is relied on by Task B2's own tests and is the single source of truth for role sync in this plan. No other task re-implements this logic.

- [ ] **Step 1: Write the failing tests first**

Since no `groups.service.spec.ts` exists yet, and this codebase's one example spec (`practice-blocks.service.spec.ts`) tests pure functions without touching `db`, and `GroupsService` methods are DB-backed (no pure-function extraction point without a larger refactor out of scope here), this task tests `syncUserRoleAfterCuratorChange` via **dependency-injected fakes** kept minimal: we test the two public methods end-to-end would require a real Postgres connection, which this repo's test suite does not set up (confirmed: no db-mocking convention exists). Given that constraint, write the test as a **pure logic test** by extracting the role-decision as a standalone exported function first, then a thin DB-wiring wrapper. This keeps the pattern consistent with `practice-blocks.service.ts`'s `computeCombinedPercent` (pure function, exported, unit-tested) style.

In `apps/backend/src/groups/groups.service.ts`, add this exported pure function near the top of the file (after imports, before the `@Injectable()` class):

```ts
export function shouldBeCuratorRole(
  activeCuratorMemberships: Array<{ role: string; removedAt: Date | null }>,
): boolean {
  return activeCuratorMemberships.some((m) => m.role === 'curator' && m.removedAt === null);
}
```

Create `apps/backend/src/groups/groups.service.spec.ts`:
```ts
import { shouldBeCuratorRole } from './groups.service';

describe('shouldBeCuratorRole', () => {
  it('returns false when there are no memberships', () => {
    expect(shouldBeCuratorRole([])).toBe(false);
  });

  it('returns false when all memberships are student role', () => {
    expect(shouldBeCuratorRole([{ role: 'student', removedAt: null }])).toBe(false);
  });

  it('returns true when at least one active curator membership exists', () => {
    expect(shouldBeCuratorRole([
      { role: 'student', removedAt: null },
      { role: 'curator', removedAt: null },
    ])).toBe(true);
  });

  it('ignores a curator membership that has been removed', () => {
    expect(shouldBeCuratorRole([
      { role: 'curator', removedAt: new Date('2026-01-01') },
    ])).toBe(false);
  });

  it('returns true when curator membership is active in one of several groups', () => {
    expect(shouldBeCuratorRole([
      { role: 'curator', removedAt: new Date('2026-01-01') },
      { role: 'curator', removedAt: null },
    ])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest src/groups/groups.service.spec.ts`
Expected: FAIL — `shouldBeCuratorRole` is not exported yet (module has no such export), or file doesn't compile because `groups.service.ts` doesn't export it.

- [ ] **Step 3: Add the pure function and the syncing method to `groups.service.ts`**

Add `users` to the existing schema import at the top of `apps/backend/src/groups/groups.service.ts`. Change:
```ts
import { contentBlocks, courses, groups, groupEnrollments, lessonCompletions, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools } from '../db/schema';
```
to:
```ts
import { contentBlocks, courses, groups, groupEnrollments, lessonCompletions, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools, users } from '../db/schema';
```

Add the pure function (from Step 1) right after the imports, before `@Injectable()`:
```ts
export function shouldBeCuratorRole(
  activeCuratorMemberships: Array<{ role: string; removedAt: Date | null }>,
): boolean {
  return activeCuratorMemberships.some((m) => m.role === 'curator' && m.removedAt === null);
}
```

Add a new private method to the `GroupsService` class, placed right after `findOrCreateSchoolMember` (after line 165 in the pre-edit file, i.e. right before `findOrCreateEnrollment`):
```ts
  private async syncUserRoleAfterCuratorChange(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({
      where: eq(schoolMembers.studentId, studentId),
      with: { enrollments: true },
    });
    const activeCuratorMemberships = memberships.flatMap((member) =>
      member.enrollments.map((enrollment) => ({ role: member.role, removedAt: enrollment.removedAt })),
    );
    const shouldBeCurator = shouldBeCuratorRole(activeCuratorMemberships);

    const user = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!user) return;

    if (shouldBeCurator && user.role !== 'curator') {
      await db.update(users).set({ role: 'curator' }).where(eq(users.id, studentId));
    } else if (!shouldBeCurator && user.role === 'curator') {
      await db.update(users).set({ role: 'student' }).where(eq(users.id, studentId));
    }
  }
```

Update `assignCuratorFromStaff` to call it. Change:
```ts
  async assignCuratorFromStaff(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    if (schoolMember.role !== 'curator') {
      await db.update(schoolMembers).set({ role: 'curator' }).where(eq(schoolMembers.id, schoolMember.id));
    }
    return this.findOrCreateEnrollment(groupId, schoolMember.id);
  }
```
to:
```ts
  async assignCuratorFromStaff(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    if (schoolMember.role !== 'curator') {
      await db.update(schoolMembers).set({ role: 'curator' }).where(eq(schoolMembers.id, schoolMember.id));
    }
    const enrollment = await this.findOrCreateEnrollment(groupId, schoolMember.id);
    await this.syncUserRoleAfterCuratorChange(studentId);
    return enrollment;
  }
```

Update `demoteCuratorFromStaff`. Change:
```ts
  async demoteCuratorFromStaff(groupId: string, adminId: string, memberId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
      with: { schoolMember: true },
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    if (enrollment.schoolMember.role === 'curator') {
      await db.update(schoolMembers).set({ role: 'student' }).where(eq(schoolMembers.id, enrollment.schoolMemberId));
    }
    return enrollment;
  }
```
to:
```ts
  async demoteCuratorFromStaff(groupId: string, adminId: string, memberId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
      with: { schoolMember: true },
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    if (enrollment.schoolMember.role === 'curator') {
      await db.update(schoolMembers).set({ role: 'student' }).where(eq(schoolMembers.id, enrollment.schoolMemberId));
      await this.syncUserRoleAfterCuratorChange(enrollment.schoolMember.studentId);
    }
    return enrollment;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest src/groups/groups.service.spec.ts`
Expected: PASS (all 5 cases green).

- [ ] **Step 5: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors. If `schoolMembers` relation `enrollments` isn't queryable via `with: { enrollments: true }`, this will surface as a Drizzle type error — if so, check `schoolMembersRelations` in `schema.ts:304-308` (it already declares `enrollments: many(groupEnrollments)`, so this should resolve cleanly).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/groups/groups.service.ts apps/backend/src/groups/groups.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(groups): sync users.role when curator status changes

assignCuratorFromStaff/demoteCuratorFromStaff now keep users.role in
sync with schoolMembers.role: a user becomes users.role='curator' the
moment they're assigned as curator of any group, and reverts to
'student' only once they're no longer an active curator anywhere
(multi-group aware, via the new shouldBeCuratorRole pure function).
EOF
)"
```

---

### Task B3: Backend — scope `/school/students` and `/school/students/enrollments` to curator's own groups

**Files:**
- Modify: `apps/backend/src/schools/schools.service.ts` (`listAllStudents`, `listEnrollments`)
- Modify: `apps/backend/src/schools/schools.controller.ts` (the two routes calling them)
- Test: Create `apps/backend/src/schools/schools.service.spec.ts`

**Interfaces:**
- Consumes: `shouldBeCuratorRole` not needed here. Uses existing `schoolMembers`, `groupEnrollments`, `groups`, `courses` schema tables (already imported in `schools.service.ts`).
- Produces: `listAllStudents(callerId: string, callerRole: string)` and `listEnrollments(callerId: string, callerRole: string)` — both now take a second parameter. Any other caller of these two methods (grep confirms only `schools.controller.ts` calls them) must be updated in this same task.

- [ ] **Step 1: Write the failing test for the curator-scoping logic**

This task follows the same pure-function extraction pattern as Task B2, since `listAllStudents`/`listEnrollments` are DB-backed with no existing mocking convention. Extract the "which group IDs is this caller allowed to see" resolution into a standalone exported function.

Create `apps/backend/src/schools/schools.service.spec.ts`:
```ts
import { resolveVisibleGroupIds } from './schools.service';

describe('resolveVisibleGroupIds', () => {
  const adminOwnedGroups = [{ id: 'g1', courseId: 'c1' }, { id: 'g2', courseId: 'c1' }, { id: 'g3', courseId: 'c2' }];

  it('returns all groups owned by the admin when caller is teacher', () => {
    const result = resolveVisibleGroupIds('teacher', adminOwnedGroups, []);
    expect(result.sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('returns all groups owned by the admin when caller is super', () => {
    const result = resolveVisibleGroupIds('super', adminOwnedGroups, []);
    expect(result.sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('returns only curator-assigned groups when caller is curator', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, ['g2']);
    expect(result).toEqual(['g2']);
  });

  it('returns an empty list for a curator assigned to no groups', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, []);
    expect(result).toEqual([]);
  });

  it('ignores curatorGroupIds not present in adminOwnedGroups (defense in depth)', () => {
    const result = resolveVisibleGroupIds('curator', adminOwnedGroups, ['g2', 'not-a-real-group']);
    expect(result).toEqual(['g2']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest src/schools/schools.service.spec.ts`
Expected: FAIL — `resolveVisibleGroupIds` is not exported from `schools.service.ts`.

- [ ] **Step 3: Add `resolveVisibleGroupIds` and wire it into both methods**

In `apps/backend/src/schools/schools.service.ts`, add this exported pure function after the imports, before the `@Injectable()` class:
```ts
export function resolveVisibleGroupIds(
  callerRole: string,
  adminOwnedGroups: Array<{ id: string; courseId: string }>,
  curatorGroupIds: string[],
): string[] {
  if (callerRole === 'curator') {
    const ownedIds = new Set(adminOwnedGroups.map((g) => g.id));
    return curatorGroupIds.filter((id) => ownedIds.has(id));
  }
  return adminOwnedGroups.map((g) => g.id);
}
```

Now update `listAllStudents`. Original:
```ts
  async listAllStudents(adminId: string) {
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
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));

    return Promise.all(
      members.map(async (m) => {
        if (groupIds.length === 0) {
          return {
            id: m.studentId,
            name: m.student.name,
            phone: m.student.phone,
            productsCount: 0,
            totalPaid: 0,
          };
        }
        const memberships = await db.query.groupEnrollments.findMany({
          where: (e, { inArray }) =>
            and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        });
        const uniqueCourseIds = new Set(
          memberships
            .map((e) => groupById.get(e.groupId)?.courseId)
            .filter((courseId): courseId is string => Boolean(courseId)),
        );
        const enrollmentIds = memberships.map((e) => e.id);
        let totalPaid = 0;
        if (enrollmentIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.enrollmentId, enrollmentIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
        return {
          id: m.studentId,
          name: m.student.name,
          phone: m.student.phone,
          productsCount: uniqueCourseIds.size,
          totalPaid,
        };
      }),
    );
  }
```

Replace with:
```ts
  private async findCuratorGroupIds(callerId: string) {
    const memberships = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.studentId, callerId), eq(schoolMembers.role, 'curator')),
      with: { enrollments: true },
    });
    return memberships.flatMap((m) => m.enrollments.filter((e) => !e.removedAt).map((e) => e.groupId));
  }

  async listAllStudents(adminId: string, callerId: string, callerRole: string) {
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
    const curatorGroupIds = callerRole === 'curator' ? await this.findCuratorGroupIds(callerId) : [];
    const groupIds = resolveVisibleGroupIds(callerRole, adminGroups, curatorGroupIds);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));

    return Promise.all(
      members.map(async (m) => {
        if (groupIds.length === 0) {
          return callerRole === 'curator'
            ? null
            : {
                id: m.studentId,
                name: m.student.name,
                phone: m.student.phone,
                productsCount: 0,
                totalPaid: 0,
              };
        }
        const memberships = await db.query.groupEnrollments.findMany({
          where: (e, { inArray }) =>
            and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        });
        if (memberships.length === 0 && callerRole === 'curator') return null;
        const uniqueCourseIds = new Set(
          memberships
            .map((e) => groupById.get(e.groupId)?.courseId)
            .filter((courseId): courseId is string => Boolean(courseId)),
        );
        const enrollmentIds = memberships.map((e) => e.id);
        let totalPaid = 0;
        if (enrollmentIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.enrollmentId, enrollmentIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
        return {
          id: m.studentId,
          name: m.student.name,
          phone: m.student.phone,
          productsCount: uniqueCourseIds.size,
          totalPaid,
        };
      }),
    ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));
  }
```

Now update `listEnrollments`. Original:
```ts
  async listEnrollments(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    const adminGroups = await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) });
    const groupIds = adminGroups.map((g) => g.id);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    if (groupIds.length === 0) return [];
```
Replace those first lines with:
```ts
  async listEnrollments(adminId: string, callerId: string, callerRole: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    const adminGroups = await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) });
    const curatorGroupIds = callerRole === 'curator' ? await this.findCuratorGroupIds(callerId) : [];
    const groupIds = resolveVisibleGroupIds(callerRole, adminGroups, curatorGroupIds);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    if (groupIds.length === 0) return [];
```
(The rest of `listEnrollments` — the loop over `members`/`memberships` — already filters `groupEnrollments` by `inArray(e.groupId, groupIds)`, so it automatically respects the narrowed `groupIds` with no further changes needed. Leave the remainder of the method body exactly as-is.)

- [ ] **Step 4: Update the controller to pass caller identity**

In `apps/backend/src/schools/schools.controller.ts`, find:
```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students')
  listAllStudents(@Req() req: any) {
    return this.schoolsService.listAllStudents(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/enrollments')
  listEnrollments(@Req() req: any) {
    return this.schoolsService.listEnrollments(req.admin.id);
  }
```
Replace with:
```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students')
  listAllStudents(@Req() req: any) {
    return this.schoolsService.listAllStudents(req.admin.id, req.admin.id, req.admin.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students/enrollments')
  listEnrollments(@Req() req: any) {
    return this.schoolsService.listEnrollments(req.admin.id, req.admin.id, req.admin.role);
  }
```

**Important nuance:** a curator's `req.admin.id` is the curator's own `users.id`, but `adminId` (first param, used for `getOrCreateSchool(adminId)`) is meant to identify *which school's data to look at*, which for a curator is **their own school membership's school**, not "a school they own" (curators don't own schools — `schools.adminId` belongs to the teacher/super who created it). Since a curator only has one `schoolMembers` row per school and `findCuratorGroupIds` already scopes to schools via `groups`→`courses`→whichever school owns them, passing `req.admin.id` as `adminId` would incorrectly try `getOrCreateSchool(curatorId)` and likely create a spurious duplicate school. **Fix:** resolve the actual school from the curator's `schoolMembers` row instead. Update the controller once more:

```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students')
  async listAllStudents(@Req() req: any) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listAllStudents(schoolAdminId, req.admin.id, req.admin.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students/enrollments')
  async listEnrollments(@Req() req: any) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listEnrollments(schoolAdminId, req.admin.id, req.admin.role);
  }
```

Add `resolveSchoolAdminIdForCaller` to `schools.service.ts` (place it right before `listAllStudents`):
```ts
  async resolveSchoolAdminIdForCaller(callerId: string, callerRole: string): Promise<string> {
    if (callerRole !== 'curator') return callerId;
    const membership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, callerId), eq(schoolMembers.role, 'curator')),
      with: { school: true },
    });
    if (!membership) throw new NotFoundException('Curator has no school membership');
    return membership.school.adminId;
  }
```
(`NotFoundException` is already imported in `schools.service.ts` per the earlier research dump's import list — verify with `grep "NotFoundException" apps/backend/src/schools/schools.service.ts` before assuming; if missing, add it to the `@nestjs/common` import line.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest src/schools/schools.service.spec.ts`
Expected: PASS (all 5 cases green).

- [ ] **Step 6: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/schools/schools.service.ts apps/backend/src/schools/schools.controller.ts apps/backend/src/schools/schools.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(schools): scope student list/enrollments to curator's own groups

listAllStudents/listEnrollments now accept callerId+callerRole; when
the caller is a curator, results are filtered to only the groups
they're assigned to (via resolveVisibleGroupIds), instead of every
student in the school. teacher/super behavior is unchanged.
EOF
)"
```

---

### Task B4: Backend — let curators grade submissions in their own groups' lessons

**Files:**
- Modify: `apps/backend/src/practice-blocks/practice-blocks.service.ts` (`assertLessonOwnership`, `gradeImage`, `gradeOralPractice`)
- Modify: `apps/backend/src/practice-blocks/practice-blocks.controller.ts` (the two grading routes)
- Test: Modify `apps/backend/src/practice-blocks/practice-blocks.service.spec.ts` (add cases for the new pure helper)

**Interfaces:**
- Consumes: `resolveVisibleGroupIds` is NOT reused here (different shape of check — this is "is caller a curator of any group under this lesson's course", not "list all visible group ids"). This task defines its own pure helper.
- Produces: `assertLessonOwnership(lessonId: string, callerId: string, callerRole: string)` — signature changes (was `(lessonId, adminId)`). Every call site in this file (there are exactly 2: `gradeImage`, `gradeOralPractice`, per the research dump) is updated in this same task. No other file calls `assertLessonOwnership` (it's `private`).

- [ ] **Step 1: Write the failing test for the curator lesson-access pure helper**

Read the existing `apps/backend/src/practice-blocks/practice-blocks.service.spec.ts` first (it currently only tests `computeEarnedScore`/`computeCombinedPercent`) to append to it rather than overwrite. Add this new `describe` block to the end of that file:

```ts
import { isCuratorOfCourse } from './practice-blocks.service';

describe('isCuratorOfCourse', () => {
  it('returns false when curator has no group assignments for the course', () => {
    expect(isCuratorOfCourse([], ['g1', 'g2'])).toBe(false);
  });

  it('returns true when curator is assigned to at least one of the course groups', () => {
    expect(isCuratorOfCourse(['g2'], ['g1', 'g2', 'g3'])).toBe(true);
  });

  it('returns false when curator groups do not intersect course groups', () => {
    expect(isCuratorOfCourse(['g9'], ['g1', 'g2'])).toBe(false);
  });

  it('returns false when the course has no groups', () => {
    expect(isCuratorOfCourse(['g1'], [])).toBe(false);
  });
});
```
(Add the new `import` line at the top of the spec file alongside the existing `import { computeCombinedPercent, computeEarnedScore } from './practice-blocks.service';` — do not duplicate the import statement, merge into one line: `import { computeCombinedPercent, computeEarnedScore, isCuratorOfCourse } from './practice-blocks.service';`)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest src/practice-blocks/practice-blocks.service.spec.ts`
Expected: FAIL — `isCuratorOfCourse` is not exported.

- [ ] **Step 3: Add `isCuratorOfCourse` and update `assertLessonOwnership`**

In `apps/backend/src/practice-blocks/practice-blocks.service.ts`, add this exported pure function near the top, next to the existing `computeEarnedScore`/`computeCombinedPercent` exports:
```ts
export function isCuratorOfCourse(curatorGroupIds: string[], courseGroupIds: string[]): boolean {
  const courseGroupSet = new Set(courseGroupIds);
  return curatorGroupIds.some((id) => courseGroupSet.has(id));
}
```

Update `assertLessonOwnership`. Original:
```ts
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
```
Replace with:
```ts
  private async assertLessonOwnership(lessonId: string, callerId: string, callerRole: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');

    if (callerRole === 'curator') {
      const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, module.courseId) });
      const courseGroupIds = courseGroups.map((g) => g.id);
      const curatorMemberships = await db.query.schoolMembers.findMany({
        where: and(eq(schoolMembers.studentId, callerId), eq(schoolMembers.role, 'curator')),
        with: { enrollments: true },
      });
      const curatorGroupIds = curatorMemberships.flatMap((m) =>
        m.enrollments.filter((e) => !e.removedAt).map((e) => e.groupId),
      );
      if (!isCuratorOfCourse(curatorGroupIds, courseGroupIds)) throw new NotFoundException('Lesson not found');
      return;
    }

    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, callerId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
  }
```

The current schema import (confirmed) is:
```ts
import { courses, modules, lessons, practiceBlocks, submissions, lessonCompletions, imageSubmissions, oralPracticeGrades } from '../db/schema';
```
Change it to add `groups` and `schoolMembers`:
```ts
import { courses, modules, lessons, practiceBlocks, submissions, lessonCompletions, imageSubmissions, oralPracticeGrades, groups, schoolMembers } from '../db/schema';
```

Update the two call sites. In `gradeImage`, change:
```ts
  async gradeImage(imageSubmissionId: string, adminId: string, score: number) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission) throw new NotFoundException('Submission not found');
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, submission.practiceBlockId) });
    if (!block) throw new NotFoundException('Submission not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
```
to:
```ts
  async gradeImage(imageSubmissionId: string, adminId: string, score: number, callerRole: string) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission) throw new NotFoundException('Submission not found');
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, submission.practiceBlockId) });
    if (!block) throw new NotFoundException('Submission not found');
    await this.assertLessonOwnership(block.lessonId, adminId, callerRole);
```

In `gradeOralPractice`, change:
```ts
  async gradeOralPractice(practiceBlockId: string, studentId: string, adminId: string, score: number) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, practiceBlockId) });
    if (!block || block.type !== 'oral') throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    await this.assertLessonOwnership(block.lessonId, adminId);
```
to:
```ts
  async gradeOralPractice(practiceBlockId: string, studentId: string, adminId: string, score: number, callerRole: string) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, practiceBlockId) });
    if (!block || block.type !== 'oral') throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    await this.assertLessonOwnership(block.lessonId, adminId, callerRole);
```
(The `adminId` parameter name stays the same in both signatures — it's the value stored into `gradedByAdminId`, which per Task A1 is now correctly typed as `users.id`. Only the added `callerRole` param and the internal `assertLessonOwnership` call change.)

- [ ] **Step 4: Update controller routes to pass `req.admin.role`**

In `apps/backend/src/practice-blocks/practice-blocks.controller.ts`, find:
```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('image-submissions/:id/grade')
  gradeImage(@Param('id') id: string, @Req() req: any, @Body() dto: GradeImageDto) {
    return this.practiceBlocksService.gradeImage(id, req.admin.id, dto.score);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('practice-blocks/:id/oral-grades/:studentId')
  gradeOralPractice(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Body() dto: GradeOralPracticeDto,
  ) {
    return this.practiceBlocksService.gradeOralPractice(id, studentId, req.admin.id, dto.score);
  }
```
Replace with:
```ts
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Patch('image-submissions/:id/grade')
  gradeImage(@Param('id') id: string, @Req() req: any, @Body() dto: GradeImageDto) {
    return this.practiceBlocksService.gradeImage(id, req.admin.id, dto.score, req.admin.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Patch('practice-blocks/:id/oral-grades/:studentId')
  gradeOralPractice(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Body() dto: GradeOralPracticeDto,
  ) {
    return this.practiceBlocksService.gradeOralPractice(id, studentId, req.admin.id, dto.score, req.admin.role);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest src/practice-blocks/practice-blocks.service.spec.ts`
Expected: PASS (all original + 4 new cases green).

- [ ] **Step 6: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors. Pay attention to whether `db.query.groupEnrollments` fields expose `removedAt` with the exact type used in the filter (`!e.removedAt` — `removedAt` is `timestamp | null`, so `!e.removedAt` correctly treats `null` as "not removed").

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/practice-blocks/practice-blocks.service.ts apps/backend/src/practice-blocks/practice-blocks.controller.ts apps/backend/src/practice-blocks/practice-blocks.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(practice-blocks): let curators grade their own groups' lessons

assertLessonOwnership now takes callerRole; for curators it checks
group-level curator assignment (via the course's groups) instead of
course ownership. gradeImage/gradeOralPractice routes now admit the
curator role. gradedByAdminId still records the actual grader's id.
EOF
)"
```

---

### Task B5: Frontend — restrict curator navigation to `/students/list` only

**Files:**
- Modify: `apps/frontend/src/components/AppShell.tsx` (`SECTIONS` filtering)
- Modify: `apps/frontend/src/App.tsx` (`HomeRoute`, and `/students`/`/students/list`/`/students/pending` route guards)
- Modify: `apps/frontend/src/components/TeacherRoute.tsx` (confirm curator passes — likely no change needed, verify in Step 1)

**Interfaces:**
- Consumes: `Admin.role` from Task B1 (already includes `'curator'`).
- Produces: nothing new consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Verify `TeacherRoute` already admits curators (no code change expected)**

Read `apps/frontend/src/components/TeacherRoute.tsx`. Its guard is:
```tsx
  if (admin.role === "student") return <Navigate to="/" replace />;
  return <>{children}</>;
}
```
This blacklists only `'student'` — `'curator'` already passes through unaffected. **No edit needed to this file.** (Confirmed via the research dump — this step is a verification checkpoint, not a code change. If the file has since changed and now allowlists `['teacher', 'super']` explicitly, add `'curator'` to that list instead.)

- [ ] **Step 2: Restrict `AppShell` sidebar sections for curators**

Read the current `apps/frontend/src/components/AppShell.tsx` in full first (it was modified earlier in this project's history — re-read before editing, do not assume the version quoted in research is current). Find the `SECTIONS` array:
```tsx
const SECTIONS: NavSection[] = [
  { key: "lessons", label: "Darslar", icon: BookOpen, path: "/lessons" },
  { key: "payments", label: "To'lovlar", icon: CreditCard, path: "/payments" },
  { key: "practice", label: "Amaliyotlar", icon: ClipboardList, path: "/" },
  { key: "students", label: "O'quvchilar", icon: Users, path: "/students" },
  { key: "school", label: "Mening Maktabim", icon: School, path: "/school" },
];
```
Leave this constant as-is (it's the full set for teacher/super). Inside the `AppShell` component function, find where `admin` is read (e.g. `const { admin, logout } = useAuthStore();` or similar — match whatever the current file has) and add, right after that line:
```tsx
  const visibleSections = admin?.role === "curator"
    ? SECTIONS.filter((section) => section.key === "students")
    : SECTIONS;
```
Then find every place the code does `SECTIONS.map(...)` (there should be exactly one, in the desktop `<nav>` rendering — re-verify by grepping `SECTIONS\.map` in the file before editing, since there may also be a separate mobile nav block that maps over the same array) and change `SECTIONS.map(` to `visibleSections.map(`.

Also check for a `SECTIONS.find(...)` (used to compute `activeSection` for highlighting) — if present, leave it reading from `SECTIONS` (not `visibleSections`) only if it's used for something unrelated to rendering the nav list; if it's used to decide which nav item is highlighted, change it to `visibleSections.find(...)` too, for consistency, so a curator never sees an active-highlight for a section they can't click into.

- [ ] **Step 3: Redirect curators to `/students/list` after login / on `/`**

Read the current `apps/frontend/src/App.tsx` in full (re-verify against the research dump, since routing tables tend to grow). Find `HomeRoute`:
```tsx
function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  return admin?.role === 'student' ? <StudentHistoryPage /> : <DashboardPage />;
}
```
Change to:
```tsx
function HomeRoute() {
  const admin = useAuthStore((s) => s.admin);
  if (admin?.role === 'student') return <StudentHistoryPage />;
  if (admin?.role === 'curator') return <Navigate to="/students/list" replace />;
  return <DashboardPage />;
}
```
(`Navigate` is already imported in this file per the research dump's import list — `import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';`.)

- [ ] **Step 4: Manual verification (no automated frontend test runner exists)**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

Then manually walk through:
1. Log in as a `teacher`/`super` account, use `/school/staff` to assign an existing student as curator of one group (existing flow, already works per this plan's research).
2. Have that curator user log out and log back in (per the earlier design decision: role changes require re-login since JWT is issued at login time).
3. Confirm: sidebar shows only "O'quvchilar"; visiting `/` redirects to `/students/list`; the students list shows only students from the group they curate; opening a student and grading an image/oral submission succeeds and the grade persists with the curator's name/timestamp visible (existing `StudentLearningProgressModal` UI, unchanged — just confirm curator can now reach it without a 403).
4. Confirm a curator cannot see `/lessons`, `/payments`, `/school` by navigating directly to those URLs (they should still load per `TeacherRoute`'s current blacklist-only-student logic — **note this is a known gap**: `TeacherRoute` does not block curators from directly navigating to those URLs even though they're hidden from the sidebar. Decide whether this matters for this plan's scope; if the user wants hard route-level blocking, that's a follow-up task, not silently added here.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/AppShell.tsx apps/frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): scope curator navigation to O'quvchilar only

AppShell now filters sidebar sections down to just "students" for
curator accounts. HomeRoute redirects curators straight to
/students/list instead of the teacher dashboard. Direct URL access to
other teacher pages is not blocked at the route level in this change —
sidebar/redirect only (see plan Task B5 Step 4 note).
EOF
)"
```

---

## Post-plan notes for the user

- **Known gap, called out deliberately, not silently fixed:** `TeacherRoute` still allows a curator to directly navigate to `/lessons`, `/payments`, `/school/*` by URL — only the sidebar and default redirect are curator-scoped. Hardening this (e.g. a dedicated `CuratorRoute` that hard-blocks non-`/students*` paths) is a reasonable follow-up but was kept out of this plan's scope per the "Faqat O'quvchilar" navigation decision, which was about what curators *see*, not a request for airtight route-level lockdown. Flag to the user after Task B5 lands and let them decide if it's worth a follow-up task.
- **Migration must be run manually.** Task A1 generates SQL but per this plan's Global Constraints, does not execute `drizzle-kit migrate` against any database — the user runs that themselves when ready.
- **Re-login requirement.** Per the earlier design decision, a curator's access only takes effect after they log out and back in (JWT is minted once at login with the role baked in). This plan does not add a "force logout on role change" mechanism — that was explicitly declined in favor of the simpler re-login approach.
