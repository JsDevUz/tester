# Classroom Autosave, Simplified Recording, "Jonli darslar" tarixi va mobil call bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make classroom board state autosave for every lesson (free or course-bound), simplify the recording modal to an audio-only choice, persist free ("erkin") sessions to the database for the first time, add teacher/student history surfaces to view them, fix the classroom theme defaulting to light, and clean up the mobile call bar.

**Architecture:** Backend changes to `ClassroomService`/`class_sessions` schema make board-snapshot persistence unconditional and extend it to free sessions (new nullable `courseId`, new `free_session_participants` table). Two new read endpoints (`GET /classroom/my-free-sessions`, `GET /classroom/my-sessions`) expose history to teachers and students respectively.

> **AMENDED 2026-07-27:** Tasks 1-3 and part of §2/§4 of the design spec were implemented directly (outside this SDD run) before this plan's execution began. That work took a different, simpler frontend approach than originally planned: instead of a new `BoardSnapshotViewer` modal component + two independent "To'liq ko'rish"/"Chizmani ko'rish" buttons, the existing `ClassroomReplayPage.tsx` was extended to auto-detect the "no recording chosen, empty historyEvents, board snapshot present" case and render statically in-place at the same `/classroom-history/:id/replay` route (see `isSnapshotOnlyFallback`/`useStaticSnapshot` in that file). This plan is amended to follow that precedent: **no `BoardSnapshotViewer` component is built** (Task 9 is dropped); every "view this session" entry point across the app (existing Davomat modal, new teacher history page, new student history page) uses a **single button** that navigates to `/classroom-history/:id/replay` whenever `hasBoardSnapshot` is true, relying on that page's existing auto-detection to pick the right rendering (full replay, board+audio, or static snapshot). Tasks below are updated to reflect this.

**Tech Stack:** NestJS + Drizzle ORM (Postgres) backend, React + TypeScript frontend, Jest for backend tests (no frontend test runner exists in this repo — frontend work is manually verified).

## Global Constraints

- Every commit must be a working, buildable state — run `npm run build --workspace=apps/backend` and/or the frontend build after backend/frontend changes, per this repo's existing verification pattern (seen in prior plans' commit steps).
- No new abstractions beyond what's specified — reuse existing patterns (`buildBoardSnapshot`, `ClassroomPdfViewer`, existing modal styling conventions) rather than inventing new ones.
- Uzbek-language UI copy throughout, matching the existing tone (see `RecordSessionModal.tsx`, `CourseClassesPage.tsx` for reference phrasing).
- Anonymous guest participants (`userId` starting with `guest:`) are never written to any new persistence — only authenticated users are tracked in `free_session_participants`.
- All schema changes go through a new Drizzle migration generated with `npm run db:generate --workspace=apps/backend` — never hand-edit `meta/_journal.json` or existing migration files.
- Spec reference: `docs/superpowers/specs/2026-07-26-classroom-autosave-and-history-design.md` — consult it for the "why" behind any task; this plan implements it section by section (§1 Theme → Task 8; §2 Recording modal/autosave → Tasks 1-3; §3 Free session persistence → Tasks 1, 4-6; §4 BoardSnapshotViewer → Task 7; §5 Teacher history → Task 9; §6 Student history → Task 10; §7 Call bar → Task 11).

---

## File Structure

**Backend — modified:**
- `apps/backend/src/db/schema.ts` — `classSessions.courseId` becomes nullable; new `freeSessionParticipants` table + relations.
- `apps/backend/src/classroom/classroom.service.ts` — `createFreeSession` persists a row; `endSession` persists board snapshot/history unconditionally; `startSessionRecording` allows free sessions; `studentJoin` records free-session participants; `getReplay` allows free-session participants; two new methods `myFreeSessionHistory` and `myClassSessions`.
- `apps/backend/src/classroom/classroom.controller.ts` — two new GET routes; `createFreeSession` call becomes `await`ed.

**Backend — new:**
- Migration file under `apps/backend/drizzle/migrations/` (auto-generated, name TBD by drizzle-kit).

**Backend — test:**
- `apps/backend/src/classroom/classroom.service.spec.ts` — extended with new test cases (existing file, no new file).

**Frontend — modified:**
- `apps/frontend/src/api/classroom.ts` — `apiCreateFreeClassSession` return type unchanged; new types/functions `apiMyFreeSessionHistory`, `apiMyClassSessions`, `StudentClassSessionItem`, `FreeClassHistoryItem`.
- `apps/frontend/src/components/classroom/RecordSessionModal.tsx` — drop the `boardSilent` option, add intro copy.
- `apps/frontend/src/hooks/useClassroomSession.ts` — theme fallback fix (2 spots).
- `apps/frontend/src/hooks/useClassroomReplay.ts` — accept `globalTheme` param, use it as fallback.
- `apps/frontend/src/pages/ClassroomReplayPage.tsx` — pass `globalTheme` into `useClassroomReplay`.
- `apps/frontend/src/components/course/CourseClassesPage.tsx` — the existing single "Replay ko'rish" button's visibility condition widens to `hasBoardSnapshot` (previously `recordingMode === 'full' || hasBoardSnapshot`, functionally the same set now that every ended session has a snapshot, but simplified since `recordingMode === 'full'` implies `hasBoardSnapshot`) — no second button; the destination page already renders correctly for every case.
- `apps/frontend/src/components/classroom/ClassroomCallBar.tsx` — remove chevron/collapse, pin to bottom.
- `apps/frontend/src/components/AppShell.tsx` — new "Mening darslarim" nav item.
- `apps/frontend/src/components/student/StudentShell.tsx` — new "Jonli darslar" nav item.
- `apps/frontend/src/App.tsx` — two new routes.

**Frontend — new:**
- `apps/frontend/src/pages/FreeClassHistoryPage.tsx` — teacher's free-session list; each row's "Ko'rish" button navigates to `/classroom-history/:id/replay`.
- `apps/frontend/src/pages/StudentLiveClassesPage.tsx` — student's unified session list; each row navigates to `/classroom-history/:id/replay`.

---

### Task 1: Schema migration — nullable `courseId` + `free_session_participants` table

**Files:**
- Modify: `apps/backend/src/db/schema.ts:592-629` (the `classSessions` table def and its relations block at `:659-663`)
- Create: new migration (generated)
- Test: none (schema-only; verified via successful `db:generate` + backend build)

**Interfaces:**
- Produces: `freeSessionParticipants` Drizzle table export with columns `{ id, sessionId, userId, joinedAt }`, used by Task 6 (`studentJoin`) and Task 9/10 (history queries).
- Produces: `classSessions.courseId` becomes nullable (`uuid | null` in Drizzle's inferred type), consumed by Task 4 (`createFreeSession`).

- [ ] **Step 1: Make `courseId` nullable**

In `apps/backend/src/db/schema.ts`, find:
```ts
export const classSessions = pgTable('class_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
```
Change to:
```ts
export const classSessions = pgTable('class_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Erkin (guruhsiz) sessiyalarda null — kursga umuman bog'liq emas.
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
```

- [ ] **Step 2: Add the `freeSessionParticipants` table**

In `apps/backend/src/db/schema.ts`, right after the `classSessions` table definition (before `classSessionsRelations`), add:
```ts
// Erkin (guruhsiz) sessiyada LOGIN QILGAN ishtirokchilarni kuzatish uchun
// — mehmonlar (guest:*) bu jadvalga yozilmaydi, chunki ular hech qanday
// hisobga bog'lanmagan. attendanceRecords'dan farqli — kelish/kechikish
// holati emas, faqat "kim qatnashdi" kifoya.
export const freeSessionParticipants = pgTable('free_session_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sessionIdIdx: index('free_session_participants_session_id_idx').on(table.sessionId),
  userIdIdx: index('free_session_participants_user_id_idx').on(table.userId),
  uniqSessionUser: uniqueIndex('free_session_participants_session_user_uniq').on(table.sessionId, table.userId),
}));

export const freeSessionParticipantsRelations = relations(freeSessionParticipants, ({ one }) => ({
  session: one(classSessions, { fields: [freeSessionParticipants.sessionId], references: [classSessions.id] }),
  user: one(users, { fields: [freeSessionParticipants.userId], references: [users.id] }),
}));
```
Check the top of `schema.ts` for the existing import line (`import { ..., uniqueIndex, index, ... } from 'drizzle-orm/pg-core'`) — `uniqueIndex` and `index` are already used elsewhere in the file (e.g. `schoolMembers`, `classSessions`), so no new import should be needed; confirm by checking the import statement.

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate --workspace=apps/backend`
Expected: a new `NNNN_<name>.sql` file appears under `apps/backend/drizzle/migrations/` containing `ALTER TABLE "class_sessions" ALTER COLUMN "course_id" DROP NOT NULL;` and a `CREATE TABLE "free_session_participants" (...)` statement. Read the generated file to confirm both statements are present and correct — drizzle-kit sometimes needs the migration name confirmed interactively; if it prompts, accept the default table/column diff (no data-destructive rename prompts are expected here since this is a new table + a constraint relaxation).

- [ ] **Step 4: Build backend to confirm no type errors**

Run: `npm run build --workspace=apps/backend`
Expected: succeeds with no TypeScript errors (schema-only change, no consumers yet).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/
git commit -m "feat(db): make class_sessions.courseId nullable, add free_session_participants table"
```

---

### Task 2: Simplify `RecordSessionModal.tsx` to 2 options

**Files:**
- Modify: `apps/frontend/src/components/classroom/RecordSessionModal.tsx`

**Interfaces:**
- Consumes: nothing new (same `ClassRecordingMode` type from `api/classroom.ts`, unchanged in this task).
- Produces: same `onSelect(mode)`/`onClose()` prop contract — no signature change, so `ClassroomHostPage.tsx`'s usage is untouched.

- [ ] **Step 1: Remove the `boardSilent` option and add intro copy**

Replace the full contents of `apps/frontend/src/components/classroom/RecordSessionModal.tsx`:
```tsx
import { Mic, Video } from "lucide-react";
import type { ClassRecordingMode } from "../../api/classroom";

interface Option {
  mode: ClassRecordingMode;
  icon: typeof Video;
  label: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    mode: "full",
    icon: Video,
    label: "To'liq yozib olish",
    description:
      "Butun darsni ovoz bilan yozadi — keyinroq boshidan oxirigacha, chizmalar bosqichma-bosqich qayta ijro etilib, tomosha qilish mumkin.",
  },
  {
    mode: "boardAudio",
    icon: Mic,
    label: "Faqat chizma (ovozli)",
    description:
      "Dars ovozi yoziladi, lekin faqat sahifaning ENG OXIRGI holati saqlanadi — bosqichma-bosqich qayta ijro bo'lmaydi, faqat yakuniy chizma + ovoz saqlanadi.",
  },
];

interface Props {
  onSelect: (mode: ClassRecordingMode) => void;
  onClose: () => void;
}

export function RecordSessionModal({ onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-96 rounded-3xl bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-gray-800">Yozib olish</p>
        <p className="mb-5 text-sm text-gray-400">
          Chizma holati har doim avtomatik saqlanadi. Ovoz yozish uchun tanlang:
        </p>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ mode, icon: Icon, label, description }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className="flex items-start gap-2 rounded-2xl border border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              <Icon size={18} className="mt-0.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Bekor qilish
          </button>
        </div>
      </div>
    </div>
  );
}
```
(This drops the `MicOff` import and the `boardSilent` entry, and changes the description paragraph. Everything else — the modal shell, button styling, close behavior — is unchanged.)

- [ ] **Step 2: Manually verify**

Run the frontend dev server (`npm run dev --workspace=apps/frontend` or the project's existing dev command) and open a hosted classroom session, click "Yozib olish" — confirm only 2 options show, with the new intro line above them.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/classroom/RecordSessionModal.tsx
git commit -m "feat(classroom): simplify recording modal to audio-only choice (full vs board+audio)"
```

---

### Task 3: Backend — unconditional board snapshot on `endSession`, historyEvents logic update

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts:261-304` (`endSession`)
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: existing `buildBoardSnapshot(s)` (private method, unchanged signature) and `s.recordingMode` (`ClassroomRecordingMode | null`, unchanged type).
- Produces: `endSession` now always writes `boardSnapshot` (previously only for `boardAudio`/`boardSilent`), and writes `historyEvents: []` when `recordingMode` is `null` or `'boardAudio'` (previously `boardSilent` produced `[]`; `null` previously fell through to full history — this is the behavior change Task 3 introduces, consumed downstream by Tasks 7/9/10 which rely on `boardSnapshot` always existing for ended sessions).

- [ ] **Step 1: Write the failing test**

Find the existing `describe('endSession'`-style block in `apps/backend/src/classroom/classroom.service.spec.ts` (search for `endSession` to locate it) and add a new test alongside the existing ones:
```ts
it('board snapshot saqlanadi hatto recordingMode null bo\'lsa ham', async () => {
  const { service, session } = /* use this spec file's existing setup helper that creates an active, non-free session — follow the pattern of the nearest existing endSession test for constructing `service` and `session` */;
  session.recordingMode = null;
  await service.endSession(session.id, session.hostUserId);
  const updateCall = mockedDb.update.mock.calls.find((call: any[]) => call[0] === classSessions);
  const setArg = mockedDb.update.mock.results[mockedDb.update.mock.calls.indexOf(updateCall)].value.set.mock.calls[0][0];
  expect(setArg.boardSnapshot).not.toBeNull();
  expect(setArg.historyEvents).toEqual([]);
});
```
Note: read the nearest existing `endSession` test in this file first (search for `'endSession'` or `.endSession(`) to copy its exact mock-setup idiom for constructing a live session and asserting on `db.update` calls — this repo's mock for `db.update` returns `{ set: jest.fn(() => ({ where: async () => {} })) }` per the file's top-level `jest.mock('../db', ...)` block, so the assertion needs to inspect the `set` mock's call arguments using whatever helper (if any) the existing tests already use for this (e.g., a captured reference to the `set` jest.fn via `mockedDb.update.mockReturnValueOnce(...)` override, if that's the established pattern in this file) rather than the ad-hoc `mock.results` indexing sketched above, which is fragile — match the file's existing convention exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "board snapshot saqlanadi"`
Expected: FAIL — current code has `const boardSnapshot = isBoardOnly ? this.buildBoardSnapshot(s) : null;` so `boardSnapshot` is `null` when `recordingMode` is `null`.

- [ ] **Step 3: Implement — make board snapshot unconditional, update historyEvents logic**

In `apps/backend/src/classroom/classroom.service.ts`, replace the block inside `endSession`'s `if (!s.isFree) { ... }` (currently lines ~275-288):
```ts
      const isBoardOnly = s.recordingMode === 'boardAudio' || s.recordingMode === 'boardSilent';
      const boardSnapshot = isBoardOnly ? this.buildBoardSnapshot(s) : null;
      // boardAudio'da chizmalarning bosqichma-bosqich tarixi kerak emas:
      // yakuniy vektor holati boardSnapshot'da saqlanadi. Faqat o'qituvchi
      // navigatsiyasi va kursori audio timeline bilan birga qayta ijro etiladi.
      const historyEvents = s.recordingMode === 'boardAudio'
        ? (s.historyEvents ?? []).filter((event) =>
            event.type === 'pointer:move' ||
            event.type === 'scroll:set' ||
            event.type === 'zoom:set' ||
            event.type === 'page:set')
        : s.recordingMode === 'boardSilent'
          ? []
          : (s.historyEvents ?? []);
```
with:
```ts
      // Board snapshot HAR DOIM quriladi — recordingMode tanlanmagan bo'lsa
      // ham (avtomatik "ovozsiz chizma saqlash" xatti-harakati). 'full'
      // rejimida ham qo'shimcha sifatida saqlanadi, chunki bitta darsda
      // ham to'liq, ham oxirgi-chizma ko'rinishi bir vaqtda kerak bo'lishi
      // mumkin (ikkita mustaqil "ko'rish" tugmasi frontendda).
      const boardSnapshot = this.buildBoardSnapshot(s);
      // Bosqichma-bosqich tarix faqat audio bilan sinxronlashi kerak bo'lgan
      // rejimlarda saqlanadi ('full' — to'liq, 'boardAudio' — faqat
      // pointer/scroll/zoom/page). Boshqa hollarda (recordingMode === null)
      // uni saqlashning ma'nosi yo'q — statik boardSnapshot yetarli.
      const historyEvents = s.recordingMode === 'full'
        ? (s.historyEvents ?? [])
        : s.recordingMode === 'boardAudio'
          ? (s.historyEvents ?? []).filter((event) =>
              event.type === 'pointer:move' ||
              event.type === 'scroll:set' ||
              event.type === 'zoom:set' ||
              event.type === 'page:set')
          : [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "board snapshot saqlanadi"`
Expected: PASS

- [ ] **Step 5: Run the full classroom spec file to check for regressions**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: all tests pass. If any pre-existing test asserted `boardSnapshot === null` for `recordingMode: null`/no-recording scenarios, update that assertion to match the new unconditional-snapshot behavior (this is an intentional behavior change per the spec, not a regression to preserve).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): always persist board snapshot on endSession, independent of recording mode"
```

---

### Task 4: Backend — `createFreeSession` persists a DB row

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts:142-169` (`createFreeSession`)
- Modify: `apps/backend/src/classroom/classroom.controller.ts` (the `createFreeSession` route handler, to `await` the now-async call)
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `db.insert(classSessions)` (already mocked in the spec file's top-level `jest.mock('../db', ...)` block, returning `{ id: 'cs-row-1' }` via `.returning()`).
- Produces: `createFreeSession(teacherId: string): Promise<{ id: string }>` — signature changes from sync to async; the row's `id` (from the DB insert) becomes the in-memory session's `id`, consumed by every WS/HTTP call site that already treats the free-session id as an opaque string (no other code needs to change since it was already treating this as a UUID-shaped string).

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`, near other `createFreeSession`/`createSession` tests (search for `createFreeSession` to find if any test already exists — if none exists yet, add a new `describe('createFreeSession'`  block):
```ts
describe('createFreeSession', () => {
  it('class_sessions qatorini courseId: null bilan yaratadi', async () => {
    const { b } = makeFakeBroadcaster();
    const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
    service.setBroadcaster(b);
    const result = await service.createFreeSession('teacher-1');
    expect(result.id).toBe('cs-row-1');
    expect(mockedDb.insert).toHaveBeenCalledWith(classSessions);
  });
});
```
Adapt `fakeStorage`/`fakeConfig`/`fakeMediaLibrary`/`fakeRecording` to whatever helper names this spec file already uses to construct a `ClassroomService` instance for other tests (search for `new ClassroomService(` to find the exact existing construction pattern and reuse it verbatim — do not invent new fake names).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "class_sessions qatorini courseId"`
Expected: FAIL — `createFreeSession` currently returns `{ id }` synchronously from `randomUUID()`, never calls `db.insert`.

- [ ] **Step 3: Implement**

In `apps/backend/src/classroom/classroom.service.ts`, replace:
```ts
  createFreeSession(teacherId: string): { id: string } {
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      courseId: null,
```
with:
```ts
  async createFreeSession(teacherId: string): Promise<{ id: string }> {
    const [row] = await db.insert(classSessions).values({ courseId: null, teacherId }).returning();
    this.sessions.set(row.id, {
      id: row.id,
      courseId: null,
```
And change the function's final `return { id };` to `return { id: row.id };`. (The `randomUUID` import at the top of the file may now be unused if nothing else in this file calls it — check with `grep -n randomUUID classroom.service.ts`; if it's unused elsewhere, remove the import to avoid an unused-import lint/build warning.)

- [ ] **Step 4: Update the controller call site**

In `apps/backend/src/classroom/classroom.controller.ts`, find:
```ts
  @Post('sessions/free')
  @Roles('teacher', 'super')
  createFreeSession(@Req() req: any) {
    return this.classroomService.createFreeSession(req.admin.id);
  }
```
Since `this.classroomService.createFreeSession(...)` already returns a `Promise` after this change and Nest handles returned Promises natively, no `await` is strictly required here — but for consistency with `createSession` right above it (`async createSession(...)`), leave this as-is (returning the Promise directly is idiomatic Nest and matches `attachPdf`'s pattern elsewhere in the same file); no code change needed in the controller.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "class_sessions qatorini courseId"`
Expected: PASS

- [ ] **Step 6: Build backend**

Run: `npm run build --workspace=apps/backend`
Expected: succeeds (confirms no unused-import or type errors from the `randomUUID` change).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts
git commit -m "feat(classroom): persist a class_sessions row for free (erkin) sessions on creation"
```

---

### Task 5: Backend — `endSession` persists free sessions too; `startSessionRecording` allows free sessions

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts` (`endSession`, `startSessionRecording`)
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `boardSnapshot`/`historyEvents` computation from Task 3 (unchanged — this task only widens which sessions reach that code path).
- Produces: `endSession` now writes to `class_sessions` for free sessions too (previously it returned early inside `if (!s.isFree)` for the whole DB-write block); `startSessionRecording` no longer throws `ForbiddenException` for `isFree` sessions.

- [ ] **Step 1: Write the failing test for `endSession` on a free session**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`:
```ts
it('erkin sessiya tugaganda ham boardSnapshot DB\'ga yoziladi, davomat yozilmaydi', async () => {
  const { b } = makeFakeBroadcaster();
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  service.setBroadcaster(b);
  const { id } = await service.createFreeSession('teacher-1');
  await service.hostJoin(id, 'teacher-1', 'sock-1'); // or however this spec's existing tests bring a session into a "live, ready to end" state — follow the nearest existing endSession test's setup
  await service.endSession(id, 'teacher-1');
  const updateCall = mockedDb.update.mock.calls.find((call: any[]) => call[0] === classSessions);
  expect(updateCall).toBeDefined();
  // db.insert should NOT have been called for attendanceRecords for this session
  const attendanceInsertCalls = mockedDb.insert.mock.calls.filter((call: any[]) => call[0] === attendanceRecords);
  expect(attendanceInsertCalls.length).toBe(0);
});
```
As with Task 3's test, match this spec file's actual existing idiom for asserting on `db.update`/`db.insert` mock calls (search for how the nearest `endSession` test already does this) rather than following the sketch literally.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "erkin sessiya tugaganda"`
Expected: FAIL — `endSession`'s entire persistence block is currently inside `if (!s.isFree) { ... }`, so nothing is written for a free session.

- [ ] **Step 3: Implement — split `endSession`'s free-session gating**

In `apps/backend/src/classroom/classroom.service.ts`, replace the full `endSession` method body:
```ts
  async endSession(sessionId: string, byUserId: string | null): Promise<void> {
    const s = this.requireSession(sessionId);
    if (byUserId !== null && s.hostUserId !== byUserId) throw new ForbiddenException('Faqat dars ustozi yakunlay oladi');

    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    // Erkin darsda hech qanday davomat/DB yozuvi yo'q — shunchaki xotiradan o'chiriladi.
    if (!s.isFree) {
      const now = Date.now();
      for (const p of s.participants.values()) {
        if (p.joinedAtMs !== null) {
          closeInterval(p, now);
          await this.persistAttendance(s.id, p);
        }
      }
      const boardSnapshot = this.buildBoardSnapshot(s);
      const historyEvents = s.recordingMode === 'full'
        ? (s.historyEvents ?? [])
        : s.recordingMode === 'boardAudio'
          ? (s.historyEvents ?? []).filter((event) =>
              event.type === 'pointer:move' ||
              event.type === 'scroll:set' ||
              event.type === 'zoom:set' ||
              event.type === 'page:set')
          : [];
      await db.update(classSessions)
        .set({
          status: 'ended',
          endedAt: new Date(),
          historyEvents,
          recordingMode: s.recordingMode ?? null,
          boardSnapshot,
        })
        .where(eq(classSessions.id, sessionId));
      if (s.recordingMode === 'full' || s.recordingMode === 'boardAudio') {
        void this.recording.stopRecording(s.id);
      }
    }
    this.broadcaster.toRoom(sessionId, 'session:ended', {});
    this.sessions.delete(sessionId);
  }
```
with:
```ts
  async endSession(sessionId: string, byUserId: string | null): Promise<void> {
    const s = this.requireSession(sessionId);
    if (byUserId !== null && s.hostUserId !== byUserId) throw new ForbiddenException('Faqat dars ustozi yakunlay oladi');

    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }

    // Davomat (attendance) faqat guruhga bog'liq darslarda ma'noli — erkin
    // darsda enrollment tushunchasi yo'q, shu qism o'tkazib yuboriladi.
    if (!s.isFree) {
      const now = Date.now();
      for (const p of s.participants.values()) {
        if (p.joinedAtMs !== null) {
          closeInterval(p, now);
          await this.persistAttendance(s.id, p);
        }
      }
    }

    // Board snapshot va yozib olish holati endi HAR IKKALA turdagi
    // sessiya uchun ham saqlanadi (erkin sessiyalar endi createFreeSession
    // orqali class_sessions qatoriga ega).
    const boardSnapshot = this.buildBoardSnapshot(s);
    const historyEvents = s.recordingMode === 'full'
      ? (s.historyEvents ?? [])
      : s.recordingMode === 'boardAudio'
        ? (s.historyEvents ?? []).filter((event) =>
            event.type === 'pointer:move' ||
            event.type === 'scroll:set' ||
            event.type === 'zoom:set' ||
            event.type === 'page:set')
        : [];
    await db.update(classSessions)
      .set({
        status: 'ended',
        endedAt: new Date(),
        historyEvents,
        recordingMode: s.recordingMode ?? null,
        boardSnapshot,
      })
      .where(eq(classSessions.id, sessionId));
    if (s.recordingMode === 'full' || s.recordingMode === 'boardAudio') {
      void this.recording.stopRecording(s.id);
    }

    this.broadcaster.toRoom(sessionId, 'session:ended', {});
    this.sessions.delete(sessionId);
  }
```
(Note this removes Task 3's edits from inside the `if (!s.isFree)` block and re-lands the identical logic unconditionally below it — if Task 3 was completed first, this step is a structural move, not a re-derivation of the snapshot logic.)

- [ ] **Step 4: Allow recording for free sessions in `startSessionRecording`**

In `apps/backend/src/classroom/classroom.service.ts`, find:
```ts
  async startSessionRecording(sessionId: string, userId: string, mode: ClassroomRecordingMode): Promise<void> {
    const session = this.requireSessionHttp(sessionId);
    if (session.isFree || session.hostUserId !== userId) throw new ForbiddenException();
```
Change to:
```ts
  async startSessionRecording(sessionId: string, userId: string, mode: ClassroomRecordingMode): Promise<void> {
    const session = this.requireSessionHttp(sessionId);
    if (session.hostUserId !== userId) throw new ForbiddenException();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "erkin sessiya tugaganda"`
Expected: PASS

- [ ] **Step 6: Add a test for `startSessionRecording` no longer throwing on free sessions**

Add to the spec file:
```ts
it('erkin sessiyada startSessionRecording endi ForbiddenException otmaydi', async () => {
  const { b } = makeFakeBroadcaster();
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  service.setBroadcaster(b);
  const { id } = await service.createFreeSession('teacher-1');
  await expect(service.startSessionRecording(id, 'teacher-1', 'boardAudio')).resolves.not.toThrow();
});
```

- [ ] **Step 7: Run full classroom spec suite**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): persist board snapshot for free sessions on end, allow recording free sessions"
```

---

### Task 6: Backend — track authenticated joiners of free sessions

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts:320-338` (`studentJoin`, the `if (s.isFree)` branch)
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `freeSessionParticipants` table from Task 1.
- Produces: a `free_session_participants` row `{ sessionId, userId }` is written whenever a non-guest `userId` joins a free session — consumed by Task 10's `myClassSessions` query.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`:
```ts
it('erkin sessiyaga login qilgan foydalanuvchi kirsa freeSessionParticipants\'ga yoziladi', async () => {
  const { b } = makeFakeBroadcaster();
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  service.setBroadcaster(b);
  const { id } = await service.createFreeSession('teacher-1');
  await service.studentJoin(id, 'stu-1', 'sock-1', undefined, 'Ali');
  const insertCalls = mockedDb.insert.mock.calls.filter((call: any[]) => call[0] === freeSessionParticipants);
  expect(insertCalls.length).toBe(1);
});

it('erkin sessiyaga mehmon (guest:) kirsa freeSessionParticipants\'ga yozilmaydi', async () => {
  const { b } = makeFakeBroadcaster();
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  service.setBroadcaster(b);
  const { id } = await service.createFreeSession('teacher-1');
  await service.studentJoin(id, 'guest:abc-123', 'sock-1', 'Mehmon Ismi', undefined);
  const insertCalls = mockedDb.insert.mock.calls.filter((call: any[]) => call[0] === freeSessionParticipants);
  expect(insertCalls.length).toBe(0);
});
```
Add `freeSessionParticipants` to the test file's existing import from `'../db/schema'` (near the top where `classSessions, contentBlocks` are already imported).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "freeSessionParticipants"`
Expected: FAIL — `studentJoin`'s free-session branch never calls `db.insert`.

- [ ] **Step 3: Implement**

In `apps/backend/src/classroom/classroom.service.ts`, find the `studentJoin` method's `if (s.isFree) { ... }` branch:
```ts
      if (s.isFree) {
        // Erkin dars: guruh/enrollment tekshiruvi yo'q, DB'ga hech narsa
        // yozilmaydi — istalgan kishi (anonim yoki login qilgan) kira oladi.
        p = {
          userId,
          name: displayName ?? guestName ?? 'Mehmon',
          enrollmentId: null,
          socketId: null,
          joinedAtMs: null,
          totalSeconds: 0,
          status: 'absent',
        };
        s.participants.set(userId, p);
      } else {
```
Replace with:
```ts
      if (s.isFree) {
        // Erkin dars: guruh/enrollment tekshiruvi yo'q — istalgan kishi
        // (anonim yoki login qilgan) kira oladi. Faqat login qilgan
        // (guest: prefiksisiz) foydalanuvchilar free_session_participants'ga
        // yoziladi — bu orqali keyinroq o'quvchining "Jonli darslar"
        // ro'yxatida shu darsni topish mumkin bo'ladi.
        p = {
          userId,
          name: displayName ?? guestName ?? 'Mehmon',
          enrollmentId: null,
          socketId: null,
          joinedAtMs: null,
          totalSeconds: 0,
          status: 'absent',
        };
        s.participants.set(userId, p);
        if (!userId.startsWith('guest:')) {
          await db.insert(freeSessionParticipants)
            .values({ sessionId: s.id, userId })
            .onConflictDoNothing();
        }
      } else {
```
Add `freeSessionParticipants` to this file's existing import from `'../db/schema'` (the line currently reading `import { attendanceRecords, classSessions, contentBlocks, courses, groupEnrollments, groups, mediaAssets } from '../db/schema';`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "freeSessionParticipants"`
Expected: both new tests PASS.

- [ ] **Step 5: Run full classroom spec suite**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): track authenticated participants of free sessions in free_session_participants"
```

---

### Task 7: Backend — `getReplay` allows free-session participants; two new history endpoints

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts:670-726` (`getReplay`)
- Modify: `apps/backend/src/classroom/classroom.service.ts` — add `myFreeSessionHistory` and `myClassSessions` methods (place near `courseHistory`, around line 755+)
- Modify: `apps/backend/src/classroom/classroom.controller.ts` — two new GET routes
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `freeSessionParticipants` (Task 1/6), nullable `course` relation on `classSessions` (Task 1).
- Produces:
  - `myFreeSessionHistory(teacherId: string): Promise<Array<{ id: string; status: string; pdfName: string | null; startedAt: string | null; endedAt: string | null; recordingMode: ClassroomRecordingMode | null; hasBoardSnapshot: boolean }>>` — consumed by Task 9 (frontend `FreeClassHistoryPage`).
  - `myClassSessions(studentId: string): Promise<Array<{ id: string; startedAt: string | null; teacherName: string; pdfName: string | null; hasBoardSnapshot: boolean; isFree: boolean }>>` — consumed by Task 10 (frontend `StudentLiveClassesPage`).
  - `getReplay` no longer throws `ForbiddenException` for an authenticated free-session participant.

- [ ] **Step 1: Write the failing test for `getReplay` + free-session access**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`:
```ts
it('getReplay: erkin sessiya ishtirokchisi (free_session_participants\'da bor) ruxsat oladi', async () => {
  mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
    id: 'fs-1', courseId: null, course: null, teacherId: 'teacher-1',
    pdfName: null, pdfPages: [], historyEvents: [], recordingUrl: null,
    recordingStatus: 'none', recordingStartedAtMs: null, recordingMode: null,
    boardSnapshot: { pages: [] }, attendance: [],
  });
  mockedDb.query.freeSessionParticipants = { findFirst: jest.fn().mockResolvedValue({ id: 'fp-1' }) } as any;
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  await expect(service.getReplay('fs-1', 'stu-1')).resolves.toBeDefined();
});

it('getReplay: erkin sessiyaga aloqasi yo\'q foydalanuvchi rad etiladi', async () => {
  mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
    id: 'fs-1', courseId: null, course: null, teacherId: 'teacher-1',
    pdfName: null, pdfPages: [], historyEvents: [], recordingUrl: null,
    recordingStatus: 'none', recordingStartedAtMs: null, recordingMode: null,
    boardSnapshot: { pages: [] }, attendance: [],
  });
  mockedDb.query.freeSessionParticipants = { findFirst: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
  await expect(service.getReplay('fs-1', 'stranger-1')).rejects.toThrow();
});
```
Also add `freeSessionParticipants: { findFirst: jest.fn() }` to the top-level `jest.mock('../db', ...)`'s `query` object (alongside the existing `attendanceRecords: { findFirst: jest.fn() }` entry) so the mock shape matches what production code will call.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "getReplay: erkin"`
Expected: FAIL — current `getReplay` does `const course = row.course as unknown as { adminId: string; id: string };` then `course.adminId`, which throws a `TypeError` on `null` (not the expected `ForbiddenException`), and there's no `freeSessionParticipants` check at all.

- [ ] **Step 3: Implement — extend `getReplay`'s access check**

In `apps/backend/src/classroom/classroom.service.ts`, replace:
```ts
    if (!row) throw new NotFoundException('Dars topilmadi');
    const course = row.course as unknown as { adminId: string; id: string };
    const isTeacher = course.adminId === callerId;
    let isEnrolledStudent = false;
    if (!isTeacher) {
      const attendanceRows = row.attendance as unknown as Array<{ enrollment?: { schoolMember?: { studentId?: string } } }>;
      isEnrolledStudent = attendanceRows.some((a) => a.enrollment?.schoolMember?.studentId === callerId);
    }
    if (!isTeacher && !isEnrolledStudent) throw new ForbiddenException();
```
with:
```ts
    if (!row) throw new NotFoundException('Dars topilmadi');
    // Erkin sessiyada course null bo'ladi — egalik tekshiruvi teacherId
    // orqali, guruhli sessiyada esa course.adminId orqali.
    const course = row.course as unknown as { adminId: string; id: string } | null;
    const isTeacher = course ? course.adminId === callerId : row.teacherId === callerId;
    let hasAccess = isTeacher;
    if (!hasAccess && course) {
      const attendanceRows = row.attendance as unknown as Array<{ enrollment?: { schoolMember?: { studentId?: string } } }>;
      hasAccess = attendanceRows.some((a) => a.enrollment?.schoolMember?.studentId === callerId);
    }
    if (!hasAccess && !course) {
      const participation = await db.query.freeSessionParticipants.findFirst({
        where: and(eq(freeSessionParticipants.sessionId, sessionId), eq(freeSessionParticipants.userId, callerId)),
      });
      hasAccess = !!participation;
    }
    if (!hasAccess) throw new ForbiddenException();
```
Add `freeSessionParticipants` to the schema import (already added in Task 6 if done in order; if not, add it here).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts -t "getReplay: erkin"`
Expected: both PASS.

- [ ] **Step 5: Add `myFreeSessionHistory` method**

In `apps/backend/src/classroom/classroom.service.ts`, near the existing `courseHistory` method (search for `async courseHistory`), add:
```ts
  // Ustozning barcha (kursga bog'liq bo'lmagan) erkin darslari tarixi.
  async myFreeSessionHistory(teacherId: string) {
    const rows = await db.query.classSessions.findMany({
      where: and(isNull(classSessions.courseId), eq(classSessions.teacherId, teacherId)),
      orderBy: desc(classSessions.startedAt),
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status as 'active' | 'ended',
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
      hasBoardSnapshot: row.boardSnapshot !== null,
    }));
  }
```

- [ ] **Step 6: Add `myClassSessions` method**

Immediately after `myFreeSessionHistory`, add:
```ts
  // O'quvchining barcha jonli darslar tarixi — guruhli (attendanceRecords
  // orqali) va erkin (freeSessionParticipants orqali) bitta ro'yxatga
  // birlashtirilib qaytariladi, sana bo'yicha kamayish tartibida.
  async myClassSessions(studentId: string) {
    const groupRows = await db
      .select({
        id: classSessions.id,
        startedAt: classSessions.startedAt,
        pdfName: classSessions.pdfName,
        boardSnapshot: classSessions.boardSnapshot,
        teacherId: classSessions.teacherId,
      })
      .from(attendanceRecords)
      .innerJoin(groupEnrollments, eq(attendanceRecords.enrollmentId, groupEnrollments.id))
      .innerJoin(schoolMembers, eq(groupEnrollments.schoolMemberId, schoolMembers.id))
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .where(and(eq(schoolMembers.studentId, studentId), eq(classSessions.status, 'ended')));

    const freeRows = await db
      .select({
        id: classSessions.id,
        startedAt: classSessions.startedAt,
        pdfName: classSessions.pdfName,
        boardSnapshot: classSessions.boardSnapshot,
        teacherId: classSessions.teacherId,
      })
      .from(freeSessionParticipants)
      .innerJoin(classSessions, eq(freeSessionParticipants.sessionId, classSessions.id))
      .where(and(eq(freeSessionParticipants.userId, studentId), eq(classSessions.status, 'ended')));

    const combined = [
      ...groupRows.map((r) => ({ ...r, isFree: false })),
      ...freeRows.map((r) => ({ ...r, isFree: true })),
    ];
    // Dublikatni olib tashlash (nazariy jihatdan bir xil sessionId ikkala
    // yo'ldan ham kelmasligi kerak, chunki bitta sessiya yoki erkin yoki
    // guruhli bo'ladi — lekin xavfsizlik uchun id bo'yicha unique qilinadi).
    const uniqueById = new Map(combined.map((r) => [r.id, r]));
    const teacherIds = [...new Set([...uniqueById.values()].map((r) => r.teacherId).filter((id): id is string => !!id))];
    const teachers = teacherIds.length > 0
      ? await db.query.users.findMany({ where: inArray(users.id, teacherIds) })
      : [];
    const teacherNameById = new Map(teachers.map((t) => [t.id, t.displayName]));

    return [...uniqueById.values()]
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))
      .map((r) => ({
        id: r.id,
        startedAt: r.startedAt?.toISOString() ?? null,
        teacherName: (r.teacherId && teacherNameById.get(r.teacherId)) ?? "O'qituvchi",
        pdfName: r.pdfName,
        hasBoardSnapshot: r.boardSnapshot !== null,
        isFree: r.isFree,
      }));
  }
```
Add `schoolMembers, users` to the schema import if not already present (check the existing import list at the top of the file — `groupEnrollments` is already imported; `schoolMembers` and `users` likely are not, add them), and add `inArray` to the `drizzle-orm` import if not already present (check — `inArray` is already imported per the file's current import line `import { and, desc, eq, inArray, isNull } from 'drizzle-orm';`, confirmed present, no change needed there).

- [ ] **Step 7: Add controller routes**

In `apps/backend/src/classroom/classroom.controller.ts`, add near `courseHistory`:
```ts
  @Get('my-free-sessions')
  @Roles('teacher', 'super')
  myFreeSessionHistory(@Req() req: any) {
    return this.classroomService.myFreeSessionHistory(req.admin.id);
  }

  @Get('my-sessions')
  @Roles('student')
  myClassSessions(@Req() req: any) {
    return this.classroomService.myClassSessions(req.admin.id);
  }
```

- [ ] **Step 8: Write tests for both new methods**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`:
```ts
describe('myFreeSessionHistory', () => {
  it('faqat shu ustozning courseId=null qatorlarini qaytaradi', async () => {
    mockedDb.query.classSessions.findMany.mockResolvedValueOnce([
      { id: 's-1', status: 'ended', pdfName: null, startedAt: new Date(), endedAt: new Date(), recordingMode: null, boardSnapshot: { pages: [] } },
    ]);
    const service = new ClassroomService(fakeStorage, fakeConfig, fakeMediaLibrary, fakeRecording);
    const result = await service.myFreeSessionHistory('teacher-1');
    expect(result).toHaveLength(1);
    expect(result[0].hasBoardSnapshot).toBe(true);
  });
});

describe('myClassSessions', () => {
  it('guruhli va erkin natijalarni birlashtirib qaytaradi', async () => {
    // mock db.select().from().innerJoin().innerJoin().where() chains per
    // this file's existing convention for `select`-based queries (check
    // if any existing test already mocks `db.select` — if not, add a
    // `select: jest.fn(() => ({ from: jest.fn(() => ({ innerJoin: jest.fn(() => ({ innerJoin: jest.fn(() => ({ where: async () => [] })) })) })) }))`
    // shape to the top-level db mock, matching this method's actual query
    // chain shape).
  });
});
```
Note: this file's top-level `db` mock currently has no `select` method mocked at all (only `insert`/`update`/`delete`/`query`). Adding `myClassSessions` requires extending the mock — add `select: jest.fn()` to the top-level mock returning a chainable object matching the two query shapes in Step 6 (`.from().innerJoin().innerJoin().where()`), configurable per-test via `mockedDb.select.mockReturnValueOnce(...)`. Write the concrete chain-mock once here and reuse it for both the "combines correctly" test and a second test asserting `status: 'ended'` filtering (i.e. an active session id passed into the mocked rows should not appear — but since the `where` clause itself isn't executed against a real DB, this second assertion just confirms the method doesn't apply any additional client-side filtering that would incorrectly exclude/include rows; keep it simple and don't over-test the SQL itself).

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: all pass, including the two new `describe` blocks.

- [ ] **Step 10: Build backend**

Run: `npm run build --workspace=apps/backend`
Expected: succeeds.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.controller.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add my-free-sessions and my-sessions history endpoints, extend replay access to free-session participants"
```

---

### Task 8: Frontend — fix classroom theme defaulting to light

**Files:**
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts:78,117`
- Modify: `apps/frontend/src/hooks/useClassroomReplay.ts:33,40,61`
- Modify: `apps/frontend/src/pages/ClassroomReplayPage.tsx` (pass `globalTheme` into the hook call)

**Interfaces:**
- Produces: `useClassroomReplay(historyEvents, pdfName, pdfPages, mediaDurationMs, globalTheme)` — signature gains a 5th parameter, consumed by `ClassroomReplayPage.tsx`'s single call site.

- [ ] **Step 1: Fix `useClassroomSession.ts` student init fallback**

In `apps/frontend/src/hooks/useClassroomSession.ts`, find:
```ts
  const [state, setState] = useState<ClassroomState>(() => ({
    ...INITIAL,
    classroomTheme: role === "host" ? globalTheme : INITIAL.classroomTheme,
  }));
```
Change to:
```ts
  const [state, setState] = useState<ClassroomState>(() => ({
    ...INITIAL,
    classroomTheme: globalTheme,
  }));
```

- [ ] **Step 2: Fix the post-join snapshot fallback**

In the same file, find:
```ts
            classroomTheme: snap.classroomTheme ?? "light",
```
Change to:
```ts
            classroomTheme: snap.classroomTheme ?? globalTheme,
```

- [ ] **Step 3: Update `useClassroomReplay.ts` to accept and use a global-theme fallback**

In `apps/frontend/src/hooks/useClassroomReplay.ts`, change the `baseState` function signature:
```ts
function baseState(pdfName: string | null, pdfPages: string[]): ClassroomState {
  return {
    joined: true, error: null, ended: true,
    pdfName, pages: pdfPages, currentPage: 1,
    strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, pointer: null,
    zoom: 1, rightZoom: 1, scroll: null, rightScroll: null,
    isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf",
    classroomTheme: "light", notebookStyle: "grid",
  };
}
```
to:
```ts
function baseState(pdfName: string | null, pdfPages: string[], globalTheme: "light" | "dark"): ClassroomState {
  return {
    joined: true, error: null, ended: true,
    pdfName, pages: pdfPages, currentPage: 1,
    strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, pointer: null,
    zoom: 1, rightZoom: 1, scroll: null, rightScroll: null,
    isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf",
    classroomTheme: globalTheme, notebookStyle: "grid",
  };
}
```
Then update `computeStateAt` to accept and thread through `globalTheme`:
```ts
function computeStateAt(events: ReplayHistoryEvent[], timeMs: number, pdfName: string | null, pdfPages: string[], globalTheme: "light" | "dark"): ClassroomState {
  const hasPdfEvent = events.some((event) => event.type === "pdf:set");
  let state = baseState(hasPdfEvent ? null : pdfName, hasPdfEvent ? [] : pdfPages, globalTheme);
  for (const event of events) {
    if (event.atMs > timeMs) break;
    const reducer = REDUCERS[event.type];
    if (reducer) state = reducer(state, event.payload);
  }
  return state;
}
```
Then update `useClassroomReplay`'s signature and its `useMemo` call:
```ts
export function useClassroomReplay(historyEvents: ReplayHistoryEvent[], pdfName: string | null, pdfPages: string[], mediaDurationMs = 0, globalTheme: "light" | "dark" = "light") {
```
and:
```ts
  const state = useMemo(
    () => computeStateAt(sorted, currentTimeMs, pdfName, pdfPages, globalTheme),
    [sorted, currentTimeMs, pdfName, pdfPages, globalTheme],
  );
```

- [ ] **Step 4: Wire `ClassroomReplayPage.tsx` to pass the global theme**

In `apps/frontend/src/pages/ClassroomReplayPage.tsx`, add the import:
```ts
import { useThemeStore } from "../stores/themeStore";
```
Add near the top of the component body (after existing `useState`/`useParams` calls):
```ts
  const globalTheme = useThemeStore((s) => s.theme);
```
Update the `useClassroomReplay` call:
```ts
  const replay = useClassroomReplay(
    showTimeline ? (data?.historyEvents ?? []) : [], data?.pdfName ?? null, data?.pdfPages ?? [],
    hasRecording ? recordingOffsetMs + audioDurationMs : 0,
    globalTheme,
  );
```

- [ ] **Step 5: Manually verify**

Toggle the site's global theme to dark, then:
- Open a fresh classroom as host (new session with no prior theme set) — should open dark, no light flash.
- Join as a student — should also open dark.
- Open a replay of a session that never had a `theme:set` event recorded — should render in the current global theme, not light.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/hooks/useClassroomSession.ts apps/frontend/src/hooks/useClassroomReplay.ts apps/frontend/src/pages/ClassroomReplayPage.tsx
git commit -m "fix(classroom): fall back to the site's global theme instead of hardcoded light"
```

---

### Task 9: DROPPED — superseded by existing `ClassroomReplayPage.tsx` auto-detection

**Status:** This task is dropped. Before this plan's SDD execution began, `ClassroomReplayPage.tsx` was independently extended (commit `e2d17e3`, "fix(classroom): replay autosaved snapshots without recording") to auto-detect the case where `recordingMode` is `null` and `historyEvents` is empty but a `boardSnapshot` exists, and render it statically in-place (see `isSnapshotOnlyFallback`/`useStaticSnapshot` in that file) — using the *same* route (`/classroom-history/:id/replay`) that already handles `'full'` and `'boardAudio'` replays. This makes a separate `BoardSnapshotViewer` component and a second "Chizmani ko'rish" button unnecessary: every call site that previously would have needed two buttons now just needs **one** button/link to `/classroom-history/:id/replay`, gated on `hasBoardSnapshot` (a superset of the old `recordingMode === 'full'` gate, since every ended session now has a snapshot per Tasks 3/5).

No files are created or modified in this task. Proceed directly to Task 10.

---

### Task 10: Frontend — API client additions

**Files:**
- Modify: `apps/frontend/src/api/classroom.ts`

**Interfaces:**
- Produces: `apiMyFreeSessionHistory(): Promise<FreeClassHistoryItem[]>`, `apiMyClassSessions(): Promise<StudentClassSessionItem[]>`, and their types — consumed by Task 11 (`FreeClassHistoryPage`) and Task 12 (`StudentLiveClassesPage`).

- [ ] **Step 1: Add types and functions**

In `apps/frontend/src/api/classroom.ts`, add near `apiClassHistory`/`ClassHistoryItem`:
```ts
export interface FreeClassHistoryItem {
  id: string;
  status: 'active' | 'ended';
  pdfName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingMode: ClassRecordingMode | null;
  hasBoardSnapshot: boolean;
}

export async function apiMyFreeSessionHistory(): Promise<FreeClassHistoryItem[]> {
  const res = await client.get('/classroom/my-free-sessions');
  return res.data;
}

export interface StudentClassSessionItem {
  id: string;
  startedAt: string | null;
  teacherName: string;
  pdfName: string | null;
  hasBoardSnapshot: boolean;
  isFree: boolean;
}

export async function apiMyClassSessions(): Promise<StudentClassSessionItem[]> {
  const res = await client.get('/classroom/my-sessions');
  return res.data;
}
```
(`ClassRecordingMode` is already defined further down in this same file — since it's referenced before its declaration here, either move the `apiMyFreeSessionHistory`/`FreeClassHistoryItem` block to after the existing `export type ClassRecordingMode = ...` line, or rely on TypeScript's type hoisting for `type` aliases, which does work across a single module regardless of declaration order — confirm by running the build in Step 2 rather than guessing.)

- [ ] **Step 2: Build to verify types resolve**

Run: `npm run build --workspace=apps/frontend`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/classroom.ts
git commit -m "feat(classroom): add API client functions for free-session and student session history"
```

---

### Task 11: Frontend — two view buttons in `CourseClassesPage.tsx`'s Davomat modal

**Files:**
- Modify: `apps/frontend/src/components/course/CourseClassesPage.tsx`

**Interfaces:**
- No new consumes/produces — this task only widens an existing condition. (Superseded Task 9's `BoardSnapshotViewer` plan; see the Task 9 note — `ClassroomReplayPage.tsx` already renders correctly for every case at the existing route.)

- [ ] **Step 1: Widen the "Replay ko'rish" button's visibility condition**

Find:
```tsx
              {detail.status === 'ended' && (detail.recordingMode === 'full' || detail.hasBoardSnapshot) && (
                <button
                  type="button"
                  onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Radio size={14} />
                  Replay ko'rish
                </button>
              )}
```
Replace with:
```tsx
              {detail.status === 'ended' && detail.hasBoardSnapshot && (
                <button
                  type="button"
                  onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Radio size={14} />
                  Replay ko'rish
                </button>
              )}
```
This is a one-line condition change (`detail.recordingMode === 'full' || detail.hasBoardSnapshot` → `detail.hasBoardSnapshot`) — functionally a no-op today since `recordingMode === 'full'` always implies `hasBoardSnapshot` after Tasks 3/5, but it removes the now-redundant/confusing extra clause. No new imports, no new state, no new button.

- [ ] **Step 2: Manually verify**

Run the frontend, open a course's "Jonli darslar" tab, click an ended session that was never recorded (board snapshot only) — confirm "Replay ko'rish" now shows (previously hidden unless `hasBoardSnapshot` was already true — verify this session actually has one per Task 3/5's autosave) and opens `ClassroomReplayPage` in its static rendering. Then check a session recorded with "To'liq" still opens the full timeline+audio replay as before.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/CourseClassesPage.tsx
git commit -m "feat(classroom): show Replay ko'rish whenever a board snapshot exists, not just for full recordings"
```

---

### Task 12: Frontend — teacher "Mening darslarim" (free session history) page

**Files:**
- Create: `apps/frontend/src/pages/FreeClassHistoryPage.tsx`
- Modify: `apps/frontend/src/App.tsx` — new route
- Modify: `apps/frontend/src/components/AppShell.tsx` — new nav item

**Interfaces:**
- Consumes: `apiMyFreeSessionHistory` (Task 10). No local snapshot-fetching logic needed — the row's button navigates straight to the existing `/classroom-history/:id/replay` route (see Task 9's note), which already renders the right thing for every `recordingMode`/snapshot combination.

- [ ] **Step 1: Create the page**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Radio } from "lucide-react";
import { toast } from "sonner";
import { apiMyFreeSessionHistory, type FreeClassHistoryItem } from "../api/classroom";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `${mins} daqiqa`;
}

export function FreeClassHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FreeClassHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiMyFreeSessionHistory());
    } catch {
      toast.error("Darslar tarixini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="p-6">
      <div className="rounded-2xl bg-white p-5">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Mening darslarim (erkin)</p>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Hozircha erkin darslar o'tkazilmagan</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                <span className="text-sm font-medium text-gray-800">{fmtDate(item.startedAt)}</span>
                {item.status === "active" ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">jonli</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={12} />{fmtDuration(item.startedAt, item.endedAt)}</span>
                )}
                <span className="flex-1" />
                {item.status === "ended" && item.hasBoardSnapshot && (
                  <button
                    type="button"
                    onClick={() => navigate(`/classroom-history/${item.id}/replay`)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Radio size={14} />
                    Replay ko'rish
                  </button>
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

- [ ] **Step 2: Add the route**

In `apps/frontend/src/App.tsx`, add near the other classroom routes:
```ts
  { path: '/free-classes', element: <TeacherRoute><FreeClassHistoryPage /></TeacherRoute> },
```
Add the import: `import { FreeClassHistoryPage } from './pages/FreeClassHistoryPage';`

- [ ] **Step 3: Add the nav item**

In `apps/frontend/src/components/AppShell.tsx`, add `Radio` to the existing `lucide-react` import, and add to `SECTIONS`:
```ts
  { key: "free-classes", label: "Mening darslarim", icon: Radio, path: "/free-classes" },
```
Place it after the `"lessons"` entry (before `"payments"`), matching the logical grouping of course/teaching-related nav items.

- [ ] **Step 4: Manually verify**

Log in as a teacher, confirm the new "Mening darslarim" nav tile appears and navigates to `/free-classes`. Start a free session, draw something, end it without recording — confirm it appears in the list with "Replay ko'rish" available (opens the static snapshot view). Start another with "To'liq" recording — confirm it opens the full timeline+audio replay.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/FreeClassHistoryPage.tsx apps/frontend/src/App.tsx apps/frontend/src/components/AppShell.tsx
git commit -m "feat(classroom): add teacher 'Mening darslarim' page for free-session history"
```

---

### Task 13: Frontend — student "Jonli darslar" unified history page

**Files:**
- Create: `apps/frontend/src/pages/StudentLiveClassesPage.tsx`
- Modify: `apps/frontend/src/App.tsx` — new route
- Modify: `apps/frontend/src/components/student/StudentShell.tsx` — new nav item

**Interfaces:**
- Consumes: `apiMyClassSessions` (Task 10). Clicking a row navigates directly to the existing `/classroom-history/:id/replay` route (same as Task 11/12) — no local snapshot state needed.

> **Note on the original requirement:** the design spec asked for the student list to show *only* the final drawing (never full audio replay), even if the teacher recorded "To'liq". Since `ClassroomReplayPage.tsx`'s auto-detection now decides the rendering based on `recordingMode` (full → timeline+audio, board-only/no-recording → static), routing here to that same page means a student clicking through to a "To'liq"-recorded session will see the full replay, not just the drawing. This is an intentional, approved simplification (confirmed with the user) — it trades that original constraint for reusing the existing page rather than building a second "force-static" mode.

- [ ] **Step 1: Create the page**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiMyClassSessions, type StudentClassSessionItem } from "../api/classroom";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StudentLiveClassesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentClassSessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiMyClassSessions());
    } catch {
      toast.error("Jonli darslar ro'yxatini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Jonli darslar</p>
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Hozircha jonli darsda qatnashmagansiz</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.hasBoardSnapshot}
              onClick={() => navigate(`/classroom-history/${item.id}/replay`)}
              className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{item.teacherName}</p>
                <p className="text-xs text-gray-400">{fmtDate(item.startedAt)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isFree ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"}`}>
                {item.isFree ? "Erkin" : "Guruhli"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/frontend/src/App.tsx`, add:
```ts
  { path: '/live-classes', element: <PrivateRoute><StudentLiveClassesPage /></PrivateRoute> },
```
Add the import: `import { StudentLiveClassesPage } from './pages/StudentLiveClassesPage';`

- [ ] **Step 4: Add the nav item to `StudentShell.tsx`**

In `apps/frontend/src/components/student/StudentShell.tsx`, add `Radio` to imports if not already present (it already is — confirmed present in the existing import line), and add to `NAV_ITEMS`:
```ts
  { label: "Jonli darslar", shortLabel: "Darslar", path: "/live-classes", icon: Radio },
```
Note: `Radio` icon is already used by the existing `"Jonli musobaqalar"` entry — reusing the same icon for a visually distinct feature is acceptable per the design spec's note (label makes the distinction clear), but if this creates visual ambiguity in the nav bar during manual verification (Step 6), swap to a different available `lucide-react` icon (e.g. `Presentation` or `MonitorPlay`) — use judgment at that point rather than guessing now.

Update `isNavActive` to handle the new path:
```ts
function isNavActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/" || pathname.startsWith("/history/");
  if (path === "/live/join") return pathname.startsWith("/live/");
  return pathname === path;
}
```
No change needed here — `/live-classes` doesn't collide with the `/live/` prefix check (`startsWith("/live/")` requires a trailing slash, and `/live-classes` doesn't have `/live/` as a prefix), so the existing fallback `pathname === path` branch already handles it correctly. Confirm this in Step 6.

Update the mobile bottom nav grid — find:
```tsx
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gray-100 bg-white px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 lg:hidden">
```
Change `grid-cols-5` to `grid-cols-6` (5 nav items + profile button, or however this grid currently divides — check what else lives in this `<nav>` alongside `.map(NAV_ITEMS)` before assuming it's exactly `NAV_ITEMS.length + 1`; adjust the class to match whatever the actual child count becomes after adding one `NAV_ITEMS` entry).

- [ ] **Step 5: Build to verify no type errors**

Run: `npm run build --workspace=apps/frontend`
Expected: succeeds.

- [ ] **Step 6: Manually verify**

Log in as a student who has joined at least one course-bound and one free session. Confirm the new "Jonli darslar" tab appears in both desktop sidebar and mobile bottom nav without visually crowding it, and that clicking a row navigates to `/classroom-history/:id/replay` and renders (static snapshot if the teacher never recorded audio, or full timeline+audio if they recorded "To'liq" — per the approved simplification, both are acceptable here). Confirm a session with no board snapshot yet (still active) is disabled/non-clickable or excluded — check which the backend query naturally produces (only `status: 'ended'` rows are returned per Task 7, so all listed rows should always be clickable; if any edge case shows a row without a snapshot, the `disabled` guard in Step 1's JSX already handles it).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/StudentLiveClassesPage.tsx apps/frontend/src/App.tsx apps/frontend/src/components/student/StudentShell.tsx
git commit -m "feat(classroom): add student 'Jonli darslar' unified history page (group + free sessions)"
```

---

### Task 14: Frontend — mobile call bar cleanup

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomCallBar.tsx`

**Interfaces:**
- Produces: same `ClassroomCallBar` prop contract minus nothing removed from the public interface (the removed `collapsed` state was internal) — both call sites (`ClassroomHostPage.tsx`, `ClassroomStudentPage.tsx`, wherever `<ClassroomCallBar ... />` is rendered) need no changes since all props (`micEnabled`, `onToggleMic`, etc., `hidden`) are unchanged.

- [ ] **Step 1: Replace the component body**

Replace the full contents of `apps/frontend/src/components/classroom/ClassroomCallBar.tsx`:
```tsx
import { PhoneOff } from "lucide-react";
import { MicControl } from "./MicControl";

interface Props {
  micEnabled: boolean;
  onToggleMic: () => void;
  audioInputs: MediaDeviceInfo[];
  activeAudioInputId: string | null;
  onSwitchAudioInput: (deviceId: string) => void;
  micDisabled: boolean;
  onEndCall: () => void;
  endCallTitle: string;
  // Auto-hide overlay bilan pastga sirg'alib yashirinishi kerak bo'lsa
  // (o'quvchi ekrani) — ustoz uchun bermasdan har doim ko'rinadigan qoladi.
  hidden?: boolean;
}

// Mikrofon + qo'ng'iroqni tugatish (Darsni yakunlash / Darsdan chiqish)
// tugmalari — ekranning eng pastida, host va student sahifalarida bir xil
// ko'rinishda ishlatiladi.
export function ClassroomCallBar({
  micEnabled, onToggleMic, audioInputs, activeAudioInputId, onSwitchAudioInput,
  micDisabled, onEndCall, endCallTitle, hidden,
}: Props) {
  return (
    <div
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 transition-transform duration-300 ease-in-out sm:bottom-6 sm:translate-y-0!"
      style={{ transform: hidden ? "translateY(200px)" : "translateY(0)" }}
    >
      <MicControl
        micEnabled={micEnabled}
        onToggleMic={onToggleMic}
        audioInputs={audioInputs}
        activeAudioInputId={activeAudioInputId}
        onSwitchAudioInput={onSwitchAudioInput}
        disabled={micDisabled}
      />
      <button
        type="button"
        onClick={onEndCall}
        className="p-3 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
        title={endCallTitle}
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify on a mobile-sized viewport**

Run the frontend, open a classroom (host or student) with browser devtools set to a mobile emulation width. Confirm:
- Mic and end-call buttons appear at the very bottom of the screen.
- No chevron button of any kind is visible.
- The bar does not visually overlap the bottom page/zoom/split control row (check against `ClassroomPdfViewer`'s bottom toolbar, if one renders in the same area) — if overlap occurs, adjust `bottom-2` to a value that clears it (e.g. `bottom-4` or `bottom-6`) while staying visibly lower than the previous `bottom-16`, and re-verify.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomCallBar.tsx
git commit -m "fix(classroom): pin mobile call bar to the bottom, remove chevron collapse mechanism"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (theme) → Task 8. §2.1 (modal) → Task 2. §2.2 (auto snapshot) → Tasks 3, 5. §2.3 (two buttons) → Tasks 9, 11, 12, 13. §3 (free-session persistence + `free_session_participants`) → Tasks 1, 4, 5, 6. §4 (`BoardSnapshotViewer`) → Task 9. §5 (teacher "Mening darslarim") → Task 12. §6 (student "Jonli darslar") → Task 13. §7 (mobile call bar) → Task 14. All covered.
- **Task ordering:** Tasks 1→7 are backend-only and strictly ordered by dependency (schema → service logic → endpoints). Task 8 (theme) is independent and could run anytime after/before the backend tasks. Tasks 9→14 are frontend and depend on Task 7's endpoints being live; Task 9 (viewer component) has no backend dependency and could run earlier if preferred.
- **Known follow-up not in this plan** (flagged in the spec's scope-out section): `deleteSession`'s `course.adminId` access on a `null` course would throw for a free session if ever called — no delete UI is added for free sessions in this plan, so this isn't reachable via the UI built here, but it's a latent landmine if a future task adds free-session deletion. Left out per the spec's explicit scope boundary.
