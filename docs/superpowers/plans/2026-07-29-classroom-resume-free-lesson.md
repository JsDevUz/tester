# Resume Free Lesson Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher start a brand-new live free lesson pre-loaded with an old free lesson's last saved board state (PDF/notebook pages, all strokes, mode/layout), via a confirm-gated "Davom ettirish" button on every row of the free-lesson history page.

**Architecture:** A new `createFreeSessionFromSnapshot` service method, sibling to the existing `createFreeSession`, reads the source session's persisted `board_snapshot` column and seeds a brand-new in-memory `ClassroomSession` from it instead of blank defaults — reusing the exact DB-insert + in-memory-session-construction shape `createFreeSession` already uses. A new REST route and frontend API client function expose it; a new confirm modal on `FreeClassHistoryPage.tsx` calls it and navigates to the new session's host page.

**Tech Stack:** NestJS, Drizzle ORM, React, TypeScript, Jest.

## Global Constraints

- Only the lesson's own teacher may resume it — `row.teacherId !== teacherId` is rejected with `ForbiddenException`, matching every other ownership check in this file (e.g. `getSessionWithAttendance`, `deleteSession`).
- A row with `boardSnapshot === null` cannot be resumed — reject with `ConflictException`.
- The new session gets a NEW id and NEW shareable link — no redirect from the old link, no linkage recorded between old and new rows in the database or UI.
- The old (source) row is never modified — stays in the history list exactly as before.
- The new session starts at `currentPage: 1`, default zoom, no recording mode selected, empty `undoStack`/`redoStack` — matching `createFreeSession`'s existing defaults for everything the snapshot doesn't cover.
- Confirmation is required before the action fires — a small modal ("Shu darsni davom ettirasizmi?" / Bekor qilish / Davom ettirish), styled like this codebase's existing confirm patterns (e.g. `ClassroomToolbar.tsx`'s `confirmClearOpen` modal) — no destructive action happens without an explicit second click.
- Applies to free (groupless) lessons only — `FreeClassHistoryPage.tsx` is already free-lesson-scoped, no group-lesson changes.
- All new user-facing strings are in Uzbek, matching this codebase's existing tone.

---

## File Structure

- Modify `apps/backend/src/classroom/classroom.service.ts`: add `createFreeSessionFromSnapshot` method.
- Modify `apps/backend/src/classroom/classroom.service.spec.ts`: tests for the new method.
- Modify `apps/backend/src/classroom/classroom.controller.ts`: add the new REST route.
- Modify `apps/frontend/src/api/classroom.ts`: add `apiCreateFreeClassSessionFromSnapshot`.
- Modify `apps/frontend/src/pages/FreeClassHistoryPage.tsx`: add the "Davom ettirish" button + confirm modal + navigation.

---

## Task 1: Backend `createFreeSessionFromSnapshot` Service Method

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `ClassroomBoardSnapshot` (existing type, `classroom.types.ts`), `classSessions` table (existing Drizzle schema)
- Produces: `ClassroomService.createFreeSessionFromSnapshot(teacherId: string, sourceSessionId: string): Promise<{ id: string }>` — consumed by Task 2 (REST route).

- [ ] **Step 1: Write failing tests**

Read `apps/backend/src/classroom/classroom.service.spec.ts`'s `describe('erkin (guruhsiz) dars', ...)` block (search for it) to find the `makeFreeService()` helper and the file's top-level `jest.mock('../db', ...)` setup (search for `mockedDb.query.classSessions.findFirst`) to match conventions, then add a new `describe` block near the existing free-session tests:

```ts
describe('createFreeSessionFromSnapshot', () => {
  const fakeSnapshot = {
    pdfName: 'eski-dars.pdf',
    pages: ['p1.webp', 'p2.webp'],
    strokesByPage: { 1: [{ id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }] },
    rightStrokesByPage: {},
    boardMode: 'pdf',
    boardLayout: 'single',
    leftBoardMode: 'pdf',
    rightBoardMode: 'pdf',
    notebookStyle: 'grid',
    notebookPageCount: 4,
    notebookPageStyles: {},
  };

  it("topilmagan manba sessiya uchun NotFoundException tashlaydi", async () => {
    const { service } = makeFreeService();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce(undefined);
    await expect(service.createFreeSessionFromSnapshot('teacher-1', 'missing-id')).rejects.toThrow();
  });

  it("boardSnapshot null bo'lgan sessiya uchun rad etadi", async () => {
    const { service } = makeFreeService();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: 'old-id', teacherId: 'teacher-1', boardSnapshot: null,
    });
    await expect(service.createFreeSessionFromSnapshot('teacher-1', 'old-id')).rejects.toThrow();
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    const { service } = makeFreeService();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: 'old-id', teacherId: 'boshqa-teacher', boardSnapshot: fakeSnapshot,
    });
    await expect(service.createFreeSessionFromSnapshot('teacher-1', 'old-id')).rejects.toThrow();
  });

  it('snapshotdan yangi erkin sessiya yaratadi va pdf/chizmalarni tiklaydi', async () => {
    const { service } = makeFreeService();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: 'old-id', teacherId: 'teacher-1', boardSnapshot: fakeSnapshot,
    });

    const { id } = await service.createFreeSessionFromSnapshot('teacher-1', 'old-id');

    expect(id).toBeTruthy();
    const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
    expect(snap.isFree).toBe(true);
    expect(snap.pdfName).toBe('eski-dars.pdf');
    expect(snap.pages).toEqual(['p1.webp', 'p2.webp']);
    expect(snap.strokesByPage[1]).toHaveLength(1);
    expect(snap.strokesByPage[1][0].id).toBe('s1');
    expect(snap.notebookPageCount).toBe(4);
    expect(snap.currentPage).toBe(1);
  });

  it('daftar rejimidagi snapshotdan tiklaganda notebook chizmalari ham saqlanadi', async () => {
    const { service } = makeFreeService();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: 'old-id', teacherId: 'teacher-1',
      boardSnapshot: {
        ...fakeSnapshot,
        boardMode: 'notebook', leftBoardMode: 'notebook', rightBoardMode: 'notebook',
        strokesByPage: { 1: [{ id: 'n1', tool: 'pen', color: '#00f', width: 2, points: [0.2, 0.2, 0.3, 0.3] }] },
      },
    });

    const { id } = await service.createFreeSessionFromSnapshot('teacher-1', 'old-id');

    const snap = service.hostJoin(id, 'teacher-1', 'sock-h');
    expect(snap.boardMode).toBe('notebook');
    expect(snap.strokesByPage[1][0].id).toBe('n1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.createFreeSessionFromSnapshot` is not a function.

- [ ] **Step 3: Implement `createFreeSessionFromSnapshot`**

In `apps/backend/src/classroom/classroom.service.ts`, find the existing `createFreeSession` method (search for `async createFreeSession(teacherId: string): Promise<{ id: string }> {`) and add a new method right after its closing `}`:

```ts
  // Eski (tugagan yoki hali jonli) erkin darsning oxirgi saqlangan
  // taxta holatidan (board_snapshot) YANGI erkin dars yaratadi — haqiqiy
  // "davom ettirish" emas (eski sessiya xotirada allaqachon yo'q bo'lishi
  // mumkin), balki createFreeSession bilan bir xil, faqat bo'sh o'rniga
  // snapshot'dagi PDF/daftar/chizmalarni boshlang'ich holat qilib beradi.
  async createFreeSessionFromSnapshot(teacherId: string, sourceSessionId: string): Promise<{ id: string }> {
    const sourceRow = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sourceSessionId) });
    if (!sourceRow) throw new NotFoundException('Dars topilmadi');
    if (sourceRow.teacherId !== teacherId) throw new ForbiddenException('Bu dars sizga tegishli emas');
    if (!sourceRow.boardSnapshot) throw new ConflictException("Bu darsda saqlangan taxta holati yo'q");

    const snapshot = sourceRow.boardSnapshot as unknown as ClassroomBoardSnapshot;

    const [row] = await db.insert(classSessions).values({ courseId: null, teacherId }).returning();

    const strokesByMode = new Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>>([
      ['pdf', new Map()],
      ['notebook', new Map()],
    ]);
    // strokesByPage snapshot olingan ondagi boardMode'ga tegishli, shu
    // sabab o'sha havuzga joylanadi; rightStrokesByPage esa rightBoardMode'ga
    // (agar u boardMode'dan farqli bo'lsa — split rejimida ikkalasi ham
    // to'ldiriladi, yakka rejimda ikkalasi bir xil moddi, shuning uchun
    // strokesByPage ustunlik qiladi).
    strokesByMode.set(snapshot.boardMode, new Map(
      Object.entries(snapshot.strokesByPage).map(([page, strokes]) => [Number(page), strokes]),
    ));
    if (snapshot.rightBoardMode !== snapshot.boardMode) {
      strokesByMode.set(snapshot.rightBoardMode, new Map(
        Object.entries(snapshot.rightStrokesByPage).map(([page, strokes]) => [Number(page), strokes]),
      ));
    }
    const primaryStrokes = strokesByMode.get(snapshot.boardMode)!;

    this.sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: snapshot.pdfName,
      pdfPages: snapshot.pages,
      currentPage: 1,
      strokesByPage: primaryStrokes,
      boardMode: snapshot.boardMode,
      boardLayout: snapshot.boardLayout,
      leftBoardMode: snapshot.leftBoardMode,
      rightBoardMode: snapshot.rightBoardMode,
      classroomTheme: 'light',
      notebookStyle: snapshot.notebookStyle,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      strokesByMode,
      participants: new Map(),
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    });
    return { id: row.id };
  }
```

Add `ClassroomBoardSnapshot`, `ClassroomBoardMode`, `ClassroomStroke` to this file's existing import from `./classroom.types` if not already present (check the existing multi-line import block first — `ClassroomBoardMode` and `ClassroomStroke` are very likely already imported since they're used throughout this file; `ClassroomBoardSnapshot` may need adding).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS (all tests including the 5 new ones)

- [ ] **Step 5: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add createFreeSessionFromSnapshot to resume a free lesson's board state"
```

---

## Task 2: REST Route and Frontend API Client

**Files:**
- Modify: `apps/backend/src/classroom/classroom.controller.ts`
- Modify: `apps/frontend/src/api/classroom.ts`

**Interfaces:**
- Consumes: `ClassroomService.createFreeSessionFromSnapshot` (Task 1)
- Produces: REST route `POST /classroom/sessions/free/from/:sourceSessionId`, frontend function `apiCreateFreeClassSessionFromSnapshot(sourceSessionId: string): Promise<{ id: string }>` — consumed by Task 3 (the button/modal).

- [ ] **Step 1: Add the REST route**

In `apps/backend/src/classroom/classroom.controller.ts`, find the existing `createFreeSession` route handler (search for `@Post('sessions/free')`) and add a new route right after its closing `}`:

```ts
  // Eski erkin darsning oxirgi saqlangan holatidan yangi jonli dars
  // boshlaydi — createFreeSessionFromSnapshot'ning REST qatlami.
  @Post('sessions/free/from/:sourceSessionId')
  @Roles('teacher', 'super')
  async createFreeSessionFromSnapshot(
    @Param('sourceSessionId', ParseUUIDPipe) sourceSessionId: string,
    @Req() req: any,
  ) {
    return this.classroomService.createFreeSessionFromSnapshot(req.admin.id, sourceSessionId);
  }
```

`ParseUUIDPipe` is already imported in this file (used by other routes) — no new import needed.

- [ ] **Step 2: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 3: Add the frontend API client function**

In `apps/frontend/src/api/classroom.ts`, find the existing `apiCreateFreeClassSession` function (search for `export async function apiCreateFreeClassSession`) and add a new function right after its closing `}`:

```ts
// Eski erkin darsning oxirgi saqlangan taxta holatidan yangi jonli dars
// boshlaydi (apiCreateFreeClassSession'dan farqli — bo'sh emas, PDF/daftar/
// chizmalar bilan boshlang'ich holatga keladi).
export async function apiCreateFreeClassSessionFromSnapshot(sourceSessionId: string): Promise<{ id: string }> {
  const res = await client.post(`/classroom/sessions/free/from/${sourceSessionId}`);
  return res.data;
}
```

- [ ] **Step 4: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/classroom/classroom.controller.ts apps/frontend/src/api/classroom.ts
git commit -m "feat(classroom): add REST route and API client for resuming a free lesson from its snapshot"
```

---

## Task 3: "Davom ettirish" Button and Confirmation Modal

**Files:**
- Modify: `apps/frontend/src/pages/FreeClassHistoryPage.tsx`

**Interfaces:**
- Consumes: `apiCreateFreeClassSessionFromSnapshot` (Task 2)

- [ ] **Step 1: Add state for the confirmation modal and navigation loading**

In `apps/frontend/src/pages/FreeClassHistoryPage.tsx`, find the existing `const [loading, setLoading] = useState(true);` line and add, right after it:

```ts
  const [resumeTarget, setResumeTarget] = useState<FreeClassHistoryItem | null>(null);
  const [resuming, setResuming] = useState(false);
```

- [ ] **Step 2: Import the new API function and `SkipForward` icon**

Find the existing import line:

```ts
import { apiMyFreeSessionHistory, type FreeClassHistoryItem } from "../api/classroom";
```

Change it to:

```ts
import { apiCreateFreeClassSessionFromSnapshot, apiMyFreeSessionHistory, type FreeClassHistoryItem } from "../api/classroom";
```

Find the existing `lucide-react` import line:

```ts
import { Clock, PenTool, Radio } from "lucide-react";
```

Change it to:

```ts
import { Clock, PenTool, Radio, SkipForward } from "lucide-react";
```

- [ ] **Step 3: Add the `handleResume` function**

Find the existing `reload` function (search for `const reload = useCallback`) and add a new function right after it, before the `useEffect` that calls `reload`:

```ts
  const handleResume = async () => {
    if (!resumeTarget) return;
    setResuming(true);
    try {
      const { id } = await apiCreateFreeClassSessionFromSnapshot(resumeTarget.id);
      navigate(`/classroom-host/${id}`);
    } catch {
      toast.error("Darsni davom ettirib bo'lmadi");
      setResuming(false);
    }
  };
```

- [ ] **Step 4: Add the "Davom ettirish" button to each row**

Find the existing row JSX — specifically the `{item.status === "ended" && item.hasBoardSnapshot && (...)}` block for the "Oxirgi chizma" button. Add a new button right BEFORE that block (so it appears first, leftmost among the action buttons), gated only on `item.hasBoardSnapshot` (not on `item.status`, per this feature's confirmed scope — it must show for both `"active"` and `"ended"` rows):

```tsx
                    {item.hasBoardSnapshot && (
                      <button
                        type="button"
                        onClick={() => setResumeTarget(item)}
                        title="Davom ettirish"
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <SkipForward size={14} />
                        <span className="hidden sm:inline">Davom ettirish</span>
                      </button>
                    )}
```

- [ ] **Step 5: Add the confirmation modal**

Find the closing `</AppShell>` tag at the end of the component's returned JSX. Add the modal as a new sibling, right before `</AppShell>` (still inside the outermost `<div className="min-h-screen flex flex-col">`):

```tsx
        {resumeTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget && !resuming) setResumeTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni davom ettirish">
              <p className="text-sm text-gray-600">Shu darsni davom ettirasizmi? Yangi jonli dars ochiladi va bu darsning oxirgi holati (sahifalar, chizmalar) unga ko'chiriladi.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResumeTarget(null)}
                  disabled={resuming}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  disabled={resuming}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resuming ? "Boshlanmoqda..." : "Davom ettirish"}
                </button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 7: Manual verification in the browser**

Run `npm run dev:backend` and `npm run dev:frontend`. As a teacher, open "Mening darslarim (erkin)" and confirm a "Davom ettirish" button appears on every row that has `hasBoardSnapshot` (both active and ended rows), and does NOT appear on rows without a saved snapshot. Click it — confirm the modal appears with the exact confirmation text, "Bekor qilish" closes the modal with no side effects, and "Davom ettirish" (inside the modal) starts a new live session and navigates to `/classroom-host/:newId`. Confirm the new session's board shows the same PDF/notebook pages and strokes the old session had at its end, at page 1. Confirm the old row is still present, unchanged, in the history list afterward (reload the page to verify).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/FreeClassHistoryPage.tsx
git commit -m "feat(classroom): add resume-lesson button and confirmation modal to free-lesson history"
```

---

## Verification

Run the full check before considering the feature done:

```bash
npm run test --workspace=apps/backend
npm run build --workspace=apps/backend
npm run build --workspace=apps/frontend
```

Expected: backend tests pass, both builds exit `0`.

Manual end-to-end check (already covered in Task 3 Step 7, repeat here as a final pass):
- A teacher can resume any of their own free lessons (active or ended) that has a saved board snapshot, landing on a new live session pre-loaded with the old board's pages and strokes.
- A teacher cannot resume another teacher's free lesson (verify via a direct API call with a mismatched token, or trust Task 1's test coverage).
- The old lesson's row, link, and replay/download options are completely unaffected by resuming it.
