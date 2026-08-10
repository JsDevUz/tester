# Groups/Payments Teacher UI + Student "My Courses" Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap identified in the prior plan's final review — give teachers UI to assign a pricing plan to a group member, record payments, and force-close access; give students a "My Courses" page showing their group memberships and payment/access status.

**Architecture:** One new backend endpoint (`GET /my/courses`) first consumes the previously-unused `StudentAccessService`. `courseStore.ts` gets a `plans` field added to `Group` (derived from `launches` during `loadCourses`) and a new `apiGetMyCourses` wrapper. `CourseGroupsPage.tsx` gets three new UI affordances per member row plus a payments-history section. A new `MyCoursesPage.tsx` is added at `/my-courses`, linked from `Toolbar.tsx` for student sessions.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, React 19, TypeScript, zustand.

## Global Constraints

- `GET /my/courses` requires `JwtAuthGuard` + `@Roles('student')`.
- `StudentAccessService.assertStudentLessonAccess` (built in a prior phase, previously unconsumed) is used here for the first time — do not reimplement its logic, import and call it.
- No optimistic updates in the frontend — API calls awaited before local state mutation.
- Manual browser QA is left to the human — automated verification is limited to `npm run build`/`npm test`.
- Backend build/test (currently 96 passing tests) must stay green; frontend build must pass.

---

### Task 1: `GET /my/courses` backend endpoint

**Files:**
- Modify: `apps/backend/src/groups/groups.service.ts`
- Modify: `apps/backend/src/groups/groups.controller.ts`
- Modify: `apps/backend/src/groups/groups.module.ts`

**Interfaces:**
- Consumes: `StudentAccessService` from `apps/backend/src/payments/student-access.service.ts` (exported by `PaymentsModule`).
- Produces: `GET /my/courses` → `Array<{ courseId: string; courseTitle: string; groupName: string; selectedPlanName: string | null; latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null; hasAccess: boolean }>`. Consumed by Task 3's `apiGetMyCourses`.

- [ ] **Step 1: Import PaymentsModule into GroupsModule**

In `apps/backend/src/groups/groups.module.ts`, find:

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

Replace with:

```typescript
import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
```

- [ ] **Step 2: Add the service method**

In `apps/backend/src/groups/groups.service.ts`, add this import at the top:

```typescript
import { StudentAccessService } from '../payments/student-access.service';
```

Update the constructor to inject it:

```typescript
@Injectable()
export class GroupsService {
  constructor(private studentAccessService: StudentAccessService) {}
```

(If the class currently has no constructor, add one; if it already has a constructor with other params, add `private studentAccessService: StudentAccessService` as an additional parameter.)

Add this method to the class:

```typescript
  async getMyCourses(studentId: string) {
    const memberships = await db.query.groupMembers.findMany({
      where: eq(groupMembers.studentId, studentId),
      with: { group: { with: { course: true } }, selectedPlan: true },
    });

    return Promise.all(
      memberships.map(async (m) => {
        const hasAccess = await this.studentAccessService.assertStudentLessonAccess(
          m.group.courseId,
          studentId,
        );
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.groupMemberId, m.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return {
          courseId: m.group.courseId,
          courseTitle: m.group.course.title,
          groupName: m.group.name,
          selectedPlanName: m.selectedPlan?.name ?? null,
          latestPaymentStatus: latestPayment?.status ?? null,
          hasAccess,
        };
      }),
    );
  }
```

Ensure `monthlyPayments` is imported from `'../db/schema'` at the top of the file (add it to the existing schema import list if not already present).

- [ ] **Step 3: Add the controller endpoint**

In `apps/backend/src/groups/groups.controller.ts`, add this method to the class (place it near the other `join`-related endpoints since it's also student-facing):

```typescript
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses')
  getMyCourses(@Req() req: any) {
    return this.groupsService.getMyCourses(req.user.id);
  }
```

- [ ] **Step 4: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/groups/
git commit -m "feat(groups): add GET /my/courses endpoint for students

- first consumer of StudentAccessService.assertStudentLessonAccess,
  built in a prior phase but never called until now
- returns each of the student's group memberships with course title,
  group name, selected plan name, latest payment status, and a
  computed hasAccess boolean"
```

---

### Task 2: Add `plans` to `Group` in courseStore + `apiGetMyCourses` wrapper

**Files:**
- Modify: `apps/frontend/src/api/groups.ts`
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Produces: `ApiMyCourse` interface + `apiGetMyCourses()` in `groups.ts`. `Group.plans: PricingPlan[]` added to the store's `Group` interface, populated during `loadCourses`. Consumed by Task 3 (`MyCoursesPage.tsx`) and Task 4 (`CourseGroupsPage.tsx`).

- [ ] **Step 1: Add `apiGetMyCourses` to `apps/frontend/src/api/groups.ts`**

Add at the end of the file:

```typescript
export interface ApiMyCourse {
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean;
}

export async function apiGetMyCourses(): Promise<ApiMyCourse[]> {
  const res = await client.get('/my/courses');
  return res.data;
}
```

- [ ] **Step 2: Add `plans` to the `Group` interface**

In `apps/frontend/src/stores/courseStore.ts`, find:

```typescript
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

Replace with:

```typescript
export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  inviteToken: string;
  paymentDay: number;
  members: GroupMember[];
  plans: PricingPlan[];
}
```

- [ ] **Step 3: Populate `plans` in `loadCourses`**

Read the current `loadCourses` implementation in full (it cascades courses → modules/groups/launches per the two prior phases). Find the group-mapping block, which currently ends with something like:

```typescript
            return {
              id: groupRow.id,
              name: groupRow.name,
              groupChatEnabled: groupRow.groupChatEnabled,
              groupChannelEnabled: groupRow.groupChannelEnabled,
              inviteToken: groupRow.inviteToken,
              paymentDay: groupRow.paymentDay,
              members,
            };
```

This mapping happens before `launchList` is computed later in the same function (groups are mapped first, then launches). Since a group's plans come from `launchRows` (fetched in the same `Promise.all` as `groupRows`), restructure so plans can be computed inline: change the destructuring at the top of the per-course mapper from

```typescript
        const [moduleRows, groupRows, launchRows] = await Promise.all([
          apiListModules(courseRow.id),
          apiListGroups(courseRow.id),
          apiListLaunches(courseRow.id),
        ]);
```

to fetch `launchRows` first are already available at that point (no change needed there — `launchRows` is already fetched in the same `Promise.all`, just not yet mapped to `launchList` when the group mapping runs). Inside the group-mapping `groupRows.map(async (groupRow) => { ... })` callback, add a `plans` computation using the raw `launchRows` (not the not-yet-built `launchList`):

```typescript
            const plans: PricingPlan[] = launchRows
              .flatMap((l) => l.plans)
              .filter((p) => p.groupId === groupRow.id)
              .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                price: p.price,
                originalPrice: p.originalPrice,
                groupId: p.groupId,
                startDate: p.startDate,
                endDate: p.endDate,
              }));
```

Then update the returned group object to include it:

```typescript
            return {
              id: groupRow.id,
              name: groupRow.name,
              groupChatEnabled: groupRow.groupChatEnabled,
              groupChannelEnabled: groupRow.groupChannelEnabled,
              inviteToken: groupRow.inviteToken,
              paymentDay: groupRow.paymentDay,
              members,
              plans,
            };
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: no new errors (the `plans` field is additive; nothing currently destructures `Group` exhaustively in a way that would break).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/groups.ts apps/frontend/src/stores/courseStore.ts
git commit -m "feat(groups): add Group.plans (derived from launches) + apiGetMyCourses wrapper

- Group now carries the subset of PricingPlans whose groupId matches it,
  computed during loadCourses from the already-fetched launch rows
- apiGetMyCourses added to api/groups.ts, not yet consumed (Task 3)"
```

---

### Task 3: `MyCoursesPage.tsx` (student-facing course list)

**Files:**
- Create: `apps/frontend/src/pages/MyCoursesPage.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `apiGetMyCourses` from Task 2.

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/MyCoursesPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { BookOpen, Lock } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMyCourses, type ApiMyCourse } from '../api/groups';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  partial: 'Qisman to\'langan',
  paid: 'To\'landi',
  debt: 'Qarzdorlik',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-500',
  partial: 'bg-amber-100 text-amber-600',
  paid: 'bg-green-100 text-green-600',
  debt: 'bg-red-100 text-red-600',
};

export function MyCoursesPage() {
  const [courses, setCourses] = useState<ApiMyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetMyCourses()
      .then(setCourses)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Toolbar />
      <div className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-4 text-lg font-bold text-gray-800">Mening kurslarim</h1>

        {loading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

        {!loading && courses.length === 0 && (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali hech qanday kursga qo'shilmagansiz</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {courses.map((c) => (
            <div key={`${c.courseId}-${c.groupName}`} className="rounded-2xl bg-white p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-800">{c.courseTitle}</p>
                  <p className="text-xs text-gray-400">{c.groupName}</p>
                </div>
                {c.latestPaymentStatus && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[c.latestPaymentStatus]}`}>
                    {STATUS_LABEL[c.latestPaymentStatus]}
                  </span>
                )}
              </div>

              <p className="mb-3 text-xs text-gray-400">
                {c.selectedPlanName ? `Tarif: ${c.selectedPlanName}` : "Tarif hali belgilanmagan"}
              </p>

              {c.hasAccess ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <BookOpen size={15} /> Darslarga kirish ochiq
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                  <Lock size={15} /> Darslarga kirish yopiq
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

- [ ] **Step 2: Add the route**

In `apps/frontend/src/App.tsx`, add the import:

```typescript
import { MyCoursesPage } from './pages/MyCoursesPage';
```

Add the route (place it near `/lessons`):

```typescript
  { path: '/my-courses', element: <PrivateRoute><MyCoursesPage /></PrivateRoute> },
```

- [ ] **Step 3: Add a Toolbar link for students**

In `apps/frontend/src/components/Toolbar.tsx`, find:

```typescript
        <button
          onClick={() => navigate(admin?.role === 'student' ? '/live/join' : '/live')}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
        >
          Jonli musobaqa
        </button>
```

Add immediately after it (only rendered for students):

```typescript
        {admin?.role === 'student' && (
          <button
            onClick={() => navigate('/my-courses')}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
          >
            Mening kurslarim
          </button>
        )}
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/MyCoursesPage.tsx apps/frontend/src/App.tsx apps/frontend/src/components/Toolbar.tsx
git commit -m "feat(groups): add student-facing My Courses page

- shows each group membership: course title, group name, selected
  plan name (or 'not assigned yet'), latest payment status badge,
  and whether lesson access is currently open or locked
- does not render lesson content itself — that's a future phase
- linked from Toolbar for student-role sessions only"
```

---

### Task 4: Teacher UI — plan assignment, payment recording, forced-close, payment history

**Files:**
- Modify: `apps/frontend/src/components/course/CourseGroupsPage.tsx`
- Create: `apps/frontend/src/components/course/RecordPaymentModal.tsx`

**Interfaces:**
- Consumes: `setMemberPlan`, `recordPayment`, `setMemberForcedClosed`, `loadGroupPayments` from `courseStore.ts` (all already implemented, just unused until now). `group.plans` from Task 2.

- [ ] **Step 1: Create the payment-recording modal**

Create `apps/frontend/src/components/course/RecordPaymentModal.tsx`:

```typescript
import { useState } from 'react';
import { X } from 'lucide-react';

interface RecordPaymentModalProps {
  studentName: string;
  onConfirm: (amount: number, discount?: number) => void;
  onClose: () => void;
}

export function RecordPaymentModal({ studentName, onConfirm, onClose }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');

  const amountNum = Number(amount);
  const canSubmit = amount.trim() !== '' && !isNaN(amountNum) && amountNum > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const discountNum = discount.trim() === '' ? undefined : Number(discount);
    onConfirm(amountNum, discountNum);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">To'lov qabul qilish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">{studentName}</p>

        <p className="mb-1.5 text-sm text-gray-500">Summa</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
        />

        <p className="mb-1.5 text-sm text-gray-500">Chegirma (ixtiyoriy, faqat shu oy uchun)</p>
        <input
          type="number"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="0"
          className="mb-6 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
        >
          Tasdiqlash
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Read the current `CourseGroupsPage.tsx` in full**

Read the entire current content of `apps/frontend/src/components/course/CourseGroupsPage.tsx` (rewritten in the prior plan's post-fix commit) before editing — this task's find/replace blocks must match its actual current structure.

- [ ] **Step 3: Add imports and new state**

At the top of the file, add:

```typescript
import { RecordPaymentModal } from './RecordPaymentModal';
import type { ApiMonthlyPayment } from '../../api/payments';
```

In the component, add to the destructured store hooks:

```typescript
    setMemberPlan, setMemberForcedClosed, recordPayment, loadGroupPayments,
```

(append these to the existing `useCourseStore()` destructure alongside `addGroup`, `renameGroup`, `setMemberRole`, `removeStudentFromGroup`, `deleteGroup`).

Add new local state near the existing `useState` calls:

```typescript
  const [paymentModalMemberId, setPaymentModalMemberId] = useState<string | null>(null);
  const [payments, setPayments] = useState<ApiMonthlyPayment[]>([]);
```

- [ ] **Step 4: Load payments when viewing a group's settings tab**

Add this effect (place it near the top of the component, after the `group`/`course` derivations):

```typescript
  useEffect(() => {
    if (group && innerTab === 'settings') {
      void loadGroupPayments(group.id).then(setPayments);
    }
  }, [group?.id, innerTab, loadGroupPayments]);
```

Add `useEffect` to the file's React import if not already present:

```typescript
import { useEffect, useState } from 'react';
```

- [ ] **Step 5: Add plan-assignment dropdown and payment/force-close controls to each student row**

Find the student row rendering inside the `students` tab (from the prior fix — each row shows avatar, name, phone, payment-status badge, remove button). Add plan-selection and action controls to each row. Locate:

```typescript
                      {m.latestPaymentStatus && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            m.latestPaymentStatus === 'paid'
                              ? 'bg-green-100 text-green-600'
                              : m.latestPaymentStatus === 'partial'
                                ? 'bg-amber-100 text-amber-600'
                                : m.latestPaymentStatus === 'debt'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {m.latestPaymentStatus === 'paid'
                            ? "To'landi"
                            : m.latestPaymentStatus === 'partial'
                              ? 'Qisman'
                              : m.latestPaymentStatus === 'debt'
                                ? 'Qarz'
                                : 'Kutilmoqda'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeStudentFromGroup(courseId, group.id, m.id)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="Guruhdan olib tashlash"
                      >
                        <X size={16} />
                      </button>
```

Replace with:

```typescript
                      {m.latestPaymentStatus && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            m.latestPaymentStatus === 'paid'
                              ? 'bg-green-100 text-green-600'
                              : m.latestPaymentStatus === 'partial'
                                ? 'bg-amber-100 text-amber-600'
                                : m.latestPaymentStatus === 'debt'
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {m.latestPaymentStatus === 'paid'
                            ? "To'landi"
                            : m.latestPaymentStatus === 'partial'
                              ? 'Qisman'
                              : m.latestPaymentStatus === 'debt'
                                ? 'Qarz'
                                : 'Kutilmoqda'}
                        </span>
                      )}
                      <select
                        value={m.selectedPlanId ?? ''}
                        onChange={(e) => void setMemberPlan(courseId, group.id, m.id, e.target.value || null)}
                        className="shrink-0 rounded-lg bg-gray-100 px-2 py-1.5 text-xs outline-none"
                      >
                        <option value="">Tarifsiz</option>
                        {group.plans.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {m.selectedPlanId && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalMemberId(m.id)}
                          className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100"
                        >
                          To'lov
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void setMemberForcedClosed(courseId, group.id, m.id, !m.forcedClosed)}
                        title={m.forcedClosed ? 'Ochish' : 'Majburiy yopish'}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          m.forcedClosed ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {m.forcedClosed ? 'Yopiq' : 'Ochiq'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeStudentFromGroup(courseId, group.id, m.id)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="Guruhdan olib tashlash"
                      >
                        <X size={16} />
                      </button>
```

- [ ] **Step 6: Add the payment modal render + confirm handler**

Near the end of the group-detail-view JSX (alongside the existing `confirmDelete && <ConfirmDeleteModal ... />` block), add:

```typescript
        {paymentModalMemberId && (
          <RecordPaymentModal
            studentName={group.members.find((m) => m.id === paymentModalMemberId)?.studentName ?? ''}
            onConfirm={(amount, discount) => {
              const memberPayments = payments.filter((p) => p.groupMemberId === paymentModalMemberId);
              const latest = memberPayments.sort(
                (a, b) => new Date(b.periodMonth).getTime() - new Date(a.periodMonth).getTime(),
              )[0];
              if (!latest) {
                setPaymentModalMemberId(null);
                return;
              }
              void recordPayment(latest.id, amount, discount).then(() => {
                void loadGroupPayments(group.id).then(setPayments);
              });
              setPaymentModalMemberId(null);
            }}
            onClose={() => setPaymentModalMemberId(null)}
          />
        )}
```

- [ ] **Step 7: Add a payments-history section to the "Sozlamalar" tab**

Find the "Amallar" (actions/delete) card in the settings tab JSX:

```typescript
              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Amallar</h3>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={16} /> Guruhni o'chirish
                </button>
              </div>
```

Add a new card immediately before it:

```typescript
              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">To'lovlar tarixi</h3>
                {payments.length === 0 ? (
                  <p className="text-xs text-gray-400">Hozircha to'lov yozuvlari yo'q</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {payments.map((p) => {
                      const member = group.members.find((m) => m.id === p.groupMemberId);
                      return (
                        <div key={p.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-gray-700">
                            {member?.studentName ?? 'Noma\'lum'} — {new Date(p.periodMonth).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' })}
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {p.paidAmount}/{p.expectedAmount - p.discountAmount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
```

- [ ] **Step 8: Build verification**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A3 "error TS"
```

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/components/course/CourseGroupsPage.tsx apps/frontend/src/components/course/RecordPaymentModal.tsx
git commit -m "feat(groups): add plan assignment, payment recording, forced-close UI

- each student row gets a plan-assignment dropdown (setMemberPlan),
  a 'To'lov' button that opens RecordPaymentModal targeting their
  latest monthly_payments row (recordPayment), and a forced-close
  toggle (setMemberForcedClosed)
- group settings tab gains a payment-history section (loadGroupPayments)
- this closes the gap flagged in the prior plan's final review: the
  payment cycle backend was fully built but had no UI trigger anywhere"
```

---

### Task 5: Final verification

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

Reserved for the human — creating a group, assigning a plan, recording a payment, forcing a close, and confirming `/my-courses` reflects the correct access state.

- [ ] **Step 4: Optional fix commit**

```bash
git add -A
git commit -m "fix(groups): address final verification findings"
```

Skip if no issues found.
