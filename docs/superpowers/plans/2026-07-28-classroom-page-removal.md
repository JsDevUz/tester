# Classroom Page Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher delete a single board page (PDF or notebook) with a confirmation prompt, synced live to all students — later pages and their strokes reindex down by one.

**Architecture:** Replace the fixed `NOTEBOOK_PAGE_COUNT` constant with a per-session `notebookPageCount` field (backend) and a matching `notebookPageCount` state field (frontend), following the exact `zoom`/`splitRatio` sync pattern already established in this codebase (session field → clamp/validate → history event → broadcast → socket listener → state → prop). Add a new `removePage` service method and `host:removePage`/`page:remove` socket protocol. Add a small trash icon to each rendered page, visible only to the host, gated behind a confirmation modal matching this codebase's existing delete-confirmation styling.

**Tech Stack:** NestJS, Socket.IO, React, TypeScript, Jest.

## Global Constraints

- A board (PDF or notebook, per mode) must always keep at least 1 page — the backend rejects removal of the last page, and the frontend independently disables the trash button when only 1 page remains (belt-and-suspenders, matching how `splitRatio` clamps on both sides).
- No "+" add-page button — explicitly out of scope for this plan.
- No undo for page removal — once confirmed and broadcast, it's final, matching how other page/stroke operations in this codebase have no undo beyond the existing per-stroke undo stack (which does not cover page-level operations).
- No persistence of `notebookPageCount` to Postgres beyond the existing in-memory session + history-event replay log, matching `zoom`/`scroll`/`splitRatio`.
- All new user-facing strings are in Uzbek, matching this codebase's existing tone (e.g. the confirm-dialog copy in `FolderViewPage.tsx`).
- **Critical architectural note for Task 3 (frontend socket handling):** the backend pools strokes by **mode** (`pdf`/`notebook`, shared across left/right panes — see `classroom.logic.ts`'s `strokeMapFor`/`activeStrokeMap`), but the frontend's `ClassroomState` pools strokes by **pane** (`strokesByPage` for left, `rightStrokesByPage` for right — see `useClassroomSession.ts`'s `ClassroomState` interface). Task 3's reindex logic must reindex the frontend's pane-keyed object (`strokesByPage` or `rightStrokesByPage`, selected by the event's `pane` field), NOT attempt to replicate the backend's mode-keyed map structure — these are genuinely different data shapes on each side and this is expected, not a bug to reconcile.

---

## File Structure

- Modify `apps/backend/src/classroom/classroom.types.ts`: add `notebookPageCount` to `ClassroomSession` and `ClassroomSnapshot`.
- Modify `apps/backend/src/classroom/classroom.logic.ts`: remove `NOTEBOOK_PAGE_COUNT` constant, update `isValidPage` to read `session.notebookPageCount`, add a new pure `removePage` logic function, populate `notebookPageCount` in `buildSnapshot`.
- Modify `apps/backend/src/classroom/classroom.service.ts`: add `removePage` service method.
- Modify `apps/backend/src/classroom/classroom.service.spec.ts`: add tests for `removePage`.
- Modify `apps/backend/src/classroom/classroom.gateway.ts`: add `host:removePage` handler.
- Modify `apps/frontend/src/api/classroom.ts`: add `notebookPageCount` to `CsSnapshot`.
- Modify `apps/frontend/src/hooks/classroomReducers.ts`: add `applyPageRemove` reducer.
- Modify `apps/frontend/src/hooks/useClassroomSession.ts`: add `notebookPageCount` state, socket listener, `removePage` host action.
- Modify `apps/frontend/src/hooks/useClassroomReplay.ts`: add `notebookPageCount` to `baseState`, add `page:remove` reducer entry.
- Modify `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`: replace hardcoded `4` in `visiblePageCount` with the new prop, add trash icon + confirmation modal to `ClassroomPdfPage`.
- Modify `apps/frontend/src/pages/ClassroomHostPage.tsx` and `apps/frontend/src/pages/ClassroomStudentPage.tsx`: pass `notebookPageCount` prop through.

---

## Task 1: Backend Data Model — notebookPageCount

**Files:**
- Modify: `apps/backend/src/classroom/classroom.types.ts`
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Test: `apps/backend/src/classroom/classroom.logic.spec.ts`

**Interfaces:**
- Consumes: none
- Produces: `ClassroomSession.notebookPageCount: number`, `ClassroomSnapshot.notebookPageCount: number`, `isValidPage` now reads the session field instead of a constant — consumed by Task 2 (`classroom.service.ts`'s `removePage`) and Task 3 (frontend snapshot consumption).

- [ ] **Step 1: Write failing tests for the snapshot default and isValidPage**

Read `apps/backend/src/classroom/classroom.logic.spec.ts` first to find its existing session-fixture helper (the same one used for the `splitRatio` snapshot tests — search for how a minimal `ClassroomSession` is constructed and passed to `buildSnapshot`). Add tests near the existing snapshot tests:

```ts
it('snapshot defaults notebookPageCount to 4 when not set on the session', () => {
  const session = makeSession(); // use this file's existing session-fixture helper
  const snap = buildSnapshot(session);
  expect(snap.notebookPageCount).toBe(4);
});

it('snapshot reflects a custom notebookPageCount set on the session', () => {
  const session = makeSession();
  session.notebookPageCount = 6;
  const snap = buildSnapshot(session);
  expect(snap.notebookPageCount).toBe(6);
});

it('isValidPage uses session.notebookPageCount for notebook mode', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 2;
  expect(isValidPage(session, 2)).toBe(true);
  expect(isValidPage(session, 3)).toBe(false);
});
```

(Replace `makeSession()` with whatever this spec file's actual fixture-construction helper is named — read the file to find it before writing this step for real. Import `isValidPage` alongside `buildSnapshot` if not already imported in this spec file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `snap.notebookPageCount` is `undefined`, and `isValidPage` still reads the hardcoded `NOTEBOOK_PAGE_COUNT` constant, not `session.notebookPageCount`.

- [ ] **Step 3: Add `notebookPageCount` to the types**

In `apps/backend/src/classroom/classroom.types.ts`, add to the `ClassroomSession` interface, right after the existing `pdfPages: string[];` line:

```ts
  // Daftar (notebook) sahifalari soni — PDF'dan farqli, bular fayldan
  // kelmaydi (faqat bo'sh shablon), shuning uchun massiv emas, oddiy son.
  // Standart 4, sahifa o'chirilganda kamayadi (removePage orqali).
  notebookPageCount?: number;
```

Add to the `ClassroomSnapshot` interface, right after the existing `pdfPages: string[];`-equivalent line for that interface (read the interface first — it may have a differently-named pages field; place `notebookPageCount` near the other page-count-adjacent fields like `zoom`/`splitRatio` for consistency):

```ts
  notebookPageCount: number;
```

- [ ] **Step 4: Remove the constant and update `isValidPage`**

In `apps/backend/src/classroom/classroom.logic.ts`, delete this line entirely:

```ts
export const NOTEBOOK_PAGE_COUNT = 4;
```

Change `isValidPage` from:

```ts
export function isValidPage(session: ClassroomSession, page: number): boolean {
  const pageCount = (session.boardMode ?? 'pdf') === 'notebook'
    ? NOTEBOOK_PAGE_COUNT
    : session.pdfPages.length;
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}
```

to:

```ts
export function isValidPage(session: ClassroomSession, page: number): boolean {
  const pageCount = (session.boardMode ?? 'pdf') === 'notebook'
    ? (session.notebookPageCount ?? 4)
    : session.pdfPages.length;
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}
```

Search the rest of this file and `classroom.service.ts` for any other reference to `NOTEBOOK_PAGE_COUNT` (there should be none besides the deleted constant and this one `isValidPage` usage — confirm with `grep -rn "NOTEBOOK_PAGE_COUNT" apps/backend/src` before moving on; if any other usage exists, apply the same `session.notebookPageCount ?? 4` substitution there).

- [ ] **Step 5: Populate `notebookPageCount` in `buildSnapshot`**

Find the `buildSnapshot` function's return object (it currently has `splitRatio: session.splitRatio ?? 0.5,` from the prior feature). Add, right after that line:

```ts
    notebookPageCount: session.notebookPageCount ?? 4,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 3 new ones)

- [ ] **Step 7: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/classroom/classroom.types.ts apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.logic.spec.ts
git commit -m "feat(classroom): replace fixed NOTEBOOK_PAGE_COUNT with per-session notebookPageCount"
```

---

## Task 2: Backend removePage Logic and Service Method

**Files:**
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `ClassroomSession.notebookPageCount` (Task 1), `strokeMapFor`/`isValidPage` (existing, `classroom.logic.ts`)
- Produces: pure function `removePageFromSession(session: ClassroomSession, mode: 'pdf' | 'notebook', pageIndex: number): boolean` in `classroom.logic.ts`, and `ClassroomService.removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number, pane?: 'left' | 'right'): void` — consumed by Task 4 (gateway handler) and Task 5 (frontend socket listener needs to know the exact `page:remove` broadcast payload shape: `{ mode, pageIndex, pane }`).

- [ ] **Step 1: Write failing tests for the pure logic function**

Read `apps/backend/src/classroom/classroom.logic.spec.ts`'s existing test style (the `isValidPage`/`setPage` tests you just added or nearby ones) to match conventions, then add:

```ts
it('removePageFromSession removes a pdf page and reindexes strokes', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png', 'c.png'];
  session.boardMode = 'pdf';
  session.currentPage = 3;
  const map = strokeMapFor(session, 'pdf');
  map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
  map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
  map.set(3, [{ id: 's3', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

  const ok = removePageFromSession(session, 'pdf', 2);

  expect(ok).toBe(true);
  expect(session.pdfPages).toEqual(['a.png', 'c.png']);
  const reindexed = strokeMapFor(session, 'pdf');
  expect(reindexed.get(1)?.[0]?.id).toBe('s1');
  expect(reindexed.get(2)?.[0]?.id).toBe('s3'); // was page 3, now page 2
  expect(reindexed.has(3)).toBe(false);
  expect(session.currentPage).toBe(2); // was 3 (last page), clamped to new last page
});

it('removePageFromSession removes a notebook page and decrements notebookPageCount', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 4;
  session.currentPage = 1;

  const ok = removePageFromSession(session, 'notebook', 2);

  expect(ok).toBe(true);
  expect(session.notebookPageCount).toBe(3);
});

it('removePageFromSession refuses to remove the last remaining page', () => {
  const session = makeSession();
  session.pdfPages = ['only.png'];

  const ok = removePageFromSession(session, 'pdf', 1);

  expect(ok).toBe(false);
  expect(session.pdfPages).toEqual(['only.png']);
});

it('removePageFromSession refuses an out-of-range pageIndex', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png'];

  expect(removePageFromSession(session, 'pdf', 5)).toBe(false);
  expect(removePageFromSession(session, 'pdf', 0)).toBe(false);
});

it('removePageFromSession decrements currentPage when a page before it is removed', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png', 'c.png'];
  session.currentPage = 3;

  removePageFromSession(session, 'pdf', 1);

  expect(session.currentPage).toBe(2);
});

it('removePageFromSession leaves currentPage unchanged when a later page is removed', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png', 'c.png'];
  session.currentPage = 1;

  removePageFromSession(session, 'pdf', 3);

  expect(session.currentPage).toBe(1);
});
```

Import `removePageFromSession` and `strokeMapFor` alongside this file's other imports from `./classroom.logic` at the top of the spec file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `removePageFromSession` is not exported / does not exist yet.

- [ ] **Step 3: Implement `removePageFromSession`**

In `apps/backend/src/classroom/classroom.logic.ts`, add this function after `isValidPage`:

```ts
// Bitta sahifani (PDF yoki daftar) olib tashlaydi va undan keyingi barcha
// sahifalar (hamda ularning chizmalari) raqamini bittaga kamaytiradi.
// Kamida 1 ta sahifa doim qolishi shart — false qaytarilsa hech narsa
// o'zgarmagan bo'ladi.
export function removePageFromSession(
  session: ClassroomSession,
  mode: 'pdf' | 'notebook',
  pageIndex: number,
): boolean {
  const previousMode = session.boardMode;
  session.boardMode = mode;
  const currentCount = mode === 'notebook' ? (session.notebookPageCount ?? 4) : session.pdfPages.length;
  if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > currentCount) {
    session.boardMode = previousMode;
    return false;
  }
  if (currentCount <= 1) {
    session.boardMode = previousMode;
    return false;
  }

  if (mode === 'pdf') {
    session.pdfPages.splice(pageIndex - 1, 1);
  } else {
    session.notebookPageCount = currentCount - 1;
  }

  const map = strokeMapFor(session, mode);
  const rebuilt = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key < pageIndex) rebuilt.set(key, strokes);
    else if (key > pageIndex) rebuilt.set(key - 1, strokes);
    // key === pageIndex: dropped (that page's strokes are gone)
  }
  session.strokesByMode?.set(mode, rebuilt);
  if (session.boardMode === mode) session.strokesByPage = rebuilt;

  if (session.currentPage > pageIndex) {
    session.currentPage -= 1;
  } else if (session.currentPage === pageIndex) {
    const newCount = currentCount - 1;
    if (session.currentPage > newCount) session.currentPage = newCount;
  }

  session.boardMode = previousMode;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 6 new ones)

- [ ] **Step 5: Write failing tests for the service method**

Read `apps/backend/src/classroom/classroom.service.spec.ts`'s existing `setSplitRatio` tests to match style, then add tests near them (inside the same `describe` block with access to `withPdf()`):

```ts
it('host sahifani ochirsa page:remove broadcast va tarixga yoziladi', async () => {
  const { service, events, sessionId } = await withPdf();
  service.removePage(sessionId, 'teacher-1', 'pdf', 2);
  expect(events.at(-1)).toMatchObject({ event: 'page:remove', payload: { mode: 'pdf', pageIndex: 2, pane: 'left' } });
  expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('page:remove');
});

it('host bolmagan foydalanuvchi sahifani ochira olmaydi', async () => {
  const { service, sessionId } = await withPdf();
  expect(() => service.removePage(sessionId, 'stu-1', 'pdf', 1)).toThrow();
});

it('oxirgi sahifani ochirishga urinilsa xato tashlanadi', async () => {
  const ctx = await setup();
  ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['only.png']);
  expect(() => ctx.service.removePage(ctx.sessionId, 'teacher-1', 'pdf', 1)).toThrow();
});

it('kech kirgan ustoz snapshot orqali kamaygan sahifalar sonini oladi', async () => {
  const { service, sessionId } = await withPdf();
  service.removePage(sessionId, 'teacher-1', 'pdf', 1);
  const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
  expect(snapshot.pages.length).toBe(2); // withPdf() sets 3 pages, one removed
});
```

Read `withPdf()`'s implementation (search for `async function withPdf`) first to confirm exactly how many pages it sets up (`ctx.service.setPdfForTests(ctx.sessionId, 'dars.pdf', ['u1', 'u2', 'u3'])` per earlier reads of this file — 3 pages), so the last test's expected count (`2`) is correct; adjust the literal if `withPdf()`'s fixture has changed.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.removePage` is not a function.

- [ ] **Step 7: Implement `removePage` on the service**

In `apps/backend/src/classroom/classroom.service.ts`, update the import line pulling from `./classroom.logic` to include `removePageFromSession` (find the existing multi-line import block that already imports `strokeMapFor`, `switchBoardMode`, etc. from `./classroom.logic` and add `removePageFromSession` to that list).

Find the existing `setSplitRatio` method (search for `setSplitRatio(sessionId: string, userId: string, ratio: number): void {`) and add a new method right after it:

```ts
  // Bitta sahifani (PDF yoki daftar) darsdan olib tashlaydi — undan
  // keyingi sahifalar va ularning chizmalari bittaga siljiydi.
  removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const ok = removePageFromSession(s, mode, pageIndex);
    if (!ok) throw new Error('INVALID_PAGE_REMOVAL');
    const payload = { mode, pageIndex, pane };
    this.recordHistoryEvent(s, 'page:remove', payload);
    this.broadcaster.toRoom(s.id, 'page:remove', payload);
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS (all tests including the 4 new ones)

- [ ] **Step 9: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.logic.spec.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add removePage logic and service method with stroke reindexing"
```

---

## Task 3: Backend Gateway Handler

**Files:**
- Modify: `apps/backend/src/classroom/classroom.gateway.ts`

**Interfaces:**
- Consumes: `ClassroomService.removePage` (Task 2)
- Produces: socket event `host:removePage` — consumed by Task 4 (frontend `hostActions.removePage`).

- [ ] **Step 1: Add the gateway handler**

Find the existing `host:setSplitRatio` handler (search for `@SubscribeMessage('host:setSplitRatio')`) and add a new handler right after it:

```ts
  @SubscribeMessage('host:removePage')
  removePage(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook'; pageIndex: number; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.removePage(body.sessionId, user.sub, body.mode, body.pageIndex, body.pane ?? 'left');
    });
  }
```

- [ ] **Step 2: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass (no new tests needed for this task — the gateway handler is a thin pass-through already covered by Task 2's service-level tests, matching how `host:setSplitRatio` has no dedicated gateway-level test either).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/classroom/classroom.gateway.ts
git commit -m "feat(classroom): add host:removePage socket handler"
```

---

## Task 4: Frontend Session Hook and Reducers

**Files:**
- Modify: `apps/frontend/src/api/classroom.ts`
- Modify: `apps/frontend/src/hooks/classroomReducers.ts`
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts`
- Modify: `apps/frontend/src/hooks/useClassroomReplay.ts`

**Interfaces:**
- Consumes: `host:removePage` emit, `page:remove` socket event with payload `{ mode: 'pdf' | 'notebook'; pageIndex: number; pane: 'left' | 'right' }` (Task 3), `CsSnapshot.notebookPageCount` (Task 1's backend snapshot)
- Produces: `ClassroomState.notebookPageCount: number`, `hostActions.removePage(mode, pageIndex, pane?): void`, `applyPageRemove` reducer — consumed by Task 5 (`ClassroomPdfViewer.tsx` via host/student/replay pages).

**IMPORTANT:** Re-read the Global Constraints section's note on the mode-vs-pane architectural split before starting this task — the frontend's `strokesByPage`/`rightStrokesByPage` are pane-keyed plain objects (`Record<number, CsStroke[]>`), not mode-keyed maps like the backend. The reducer below reindexes whichever pane-keyed object matches the event's `pane` field.

- [ ] **Step 1: Add `notebookPageCount` to `CsSnapshot`**

In `apps/frontend/src/api/classroom.ts`, find the `CsSnapshot` interface (search for `export interface CsSnapshot`) and add, right after the existing `splitRatio: number;` line:

```ts
  notebookPageCount: number;
```

- [ ] **Step 2: Add the `applyPageRemove` reducer**

In `apps/frontend/src/hooks/classroomReducers.ts`, read the existing `applyPageClear` function in full first (to match its exact style: reading `p.pane`, selecting the right state key, returning a new state object). Add this new function right after `applyPageClear`:

```ts
// Sahifa o'chirilganda undan keyingi barcha sahifalarning chizmalari
// (shu pane uchun) bittaga siljiydi — backend'dagi removePageFromSession
// bilan bir xil mantiq, lekin frontend strokesByPage/rightStrokesByPage
// PANE bo'yicha (mode bo'yicha emas) saqlangani uchun shu obyektni
// qayta quradi.
export function applyPageRemove(
  s: ClassroomState,
  p: { mode: CsBoardMode; pageIndex: number; pane?: "left" | "right" },
): ClassroomState {
  const right = p.pane === "right";
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(source)) {
    const pageNum = Number(pageStr);
    if (pageNum < p.pageIndex) rebuilt[pageNum] = strokes;
    else if (pageNum > p.pageIndex) rebuilt[pageNum - 1] = strokes;
    // pageNum === p.pageIndex: dropped
  }

  const isPdf = p.mode === "pdf";
  const pages = isPdf ? s.pages.filter((_, idx) => idx !== p.pageIndex - 1) : s.pages;
  const notebookPageCount = isPdf ? s.notebookPageCount : Math.max(1, s.notebookPageCount - 1);

  let currentPage = s.currentPage;
  if (currentPage > p.pageIndex) currentPage -= 1;
  else if (currentPage === p.pageIndex) {
    const newCount = isPdf ? pages.length : notebookPageCount;
    if (currentPage > newCount) currentPage = newCount;
  }

  return { ...s, [key]: rebuilt, pages, notebookPageCount, currentPage };
}
```

Check this file's top imports for `CsBoardMode`/`CsStroke`/`ClassroomState` — they should already be imported (used by neighboring reducers like `applyPageClear`/`applyStrokeAdd`); add any that are missing.

- [ ] **Step 3: Add `notebookPageCount` to `ClassroomState` and its default**

In `apps/frontend/src/hooks/useClassroomSession.ts`, find the `ClassroomState` interface (search for `export interface ClassroomState`) and add, right after the existing `splitRatio: number;` line:

```ts
  notebookPageCount: number;
```

Find the `INITIAL` constant (search for `const INITIAL: ClassroomState`) and add `notebookPageCount: 4,` to it, right after `splitRatio: 0.5,`.

- [ ] **Step 4: Populate `notebookPageCount` when joining**

Find the `setState({...})` call inside the `join()` function's success callback (search for `splitRatio: snap.splitRatio ?? 0.5,`). Add, right after it:

```ts
            notebookPageCount: snap.notebookPageCount ?? 4,
```

- [ ] **Step 5: Add the socket listener**

Find the existing `socket.on("splitRatio:set", ...)` listener registration and add, right after it:

```ts
    socket.on("page:remove", (p: { mode: CsBoardMode; pageIndex: number; pane?: "left" | "right" }) => setState((s) => applyPageRemove(s, p)));
```

Add `applyPageRemove` to this file's existing import from `./classroomReducers` (find the import line pulling `applyBoardSet`, `applyPageClear`, etc. and add `applyPageRemove` to that list).

Find the matching cleanup block (`socket.off("splitRatio:set");`) and add, right after it:

```ts
      socket.off("page:remove");
```

- [ ] **Step 6: Add the host action**

Find the `hostActions` object's `setSplitRatio` entry (search for `setSplitRatio: (ratio: number) =>`) and add, right after it:

```ts
    removePage: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right" = "left") =>
      emitHost("host:removePage", { mode, pageIndex, pane }),
```

- [ ] **Step 7: Wire replay support**

In `apps/frontend/src/hooks/useClassroomReplay.ts`, add `applyPageRemove` to the existing import from `./classroomReducers`. Add a new entry to the `REDUCERS` map, right after the existing `"splitRatio:set"` entry:

```ts
  "page:remove": applyPageRemove,
```

In `baseState`, find the line `zoom: 1, rightZoom: 1, splitRatio: 0.5, scroll: null, rightScroll: null,` and change it to also include the new field:

```ts
    zoom: 1, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 4, scroll: null, rightScroll: null,
```

- [ ] **Step 8: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/api/classroom.ts apps/frontend/src/hooks/classroomReducers.ts apps/frontend/src/hooks/useClassroomSession.ts apps/frontend/src/hooks/useClassroomReplay.ts
git commit -m "feat(classroom): thread notebookPageCount and page-removal sync through frontend hooks"
```

---

## Task 5: ClassroomPdfViewer Trash Icon and Confirmation

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `notebookPageCount` prop, `hostActions.removePage` (Task 4, passed down via Task 6's page wiring)
- Produces: a trash icon on each rendered page (host-only), gated behind a confirmation modal, calling `onRemovePage` on confirm.

- [ ] **Step 1: Add the `notebookPageCount` prop and use it in `visiblePageCount`**

Find the `Props` interface (search for `interface Props {`) and add, right after the existing `noSync?: boolean;` line:

```ts
  // Daftar sahifalari soni (server-boshqaruvli, o'zgaruvchan) — endi
  // qattiq 4 emas, session.notebookPageCount'dan keladi.
  notebookPageCount?: number;
```

Find the function signature's destructuring (search for `noSync = false,`) and add `notebookPageCount = 4,` right after it.

Find `visiblePageCount` (search for `const visiblePageCount = (mode: CsBoardMode) => mode === "notebook" ? 4 : pageUrls.length;`) and change it to:

```ts
  const visiblePageCount = (mode: CsBoardMode) => mode === "notebook" ? notebookPageCount : pageUrls.length;
```

- [ ] **Step 2: Add remove-page props to `ClassroomPdfPage`'s `PageProps`**

Find the `PageProps` interface (search for `interface PageProps {`) and add, right after the existing `zoomVersion: number;` line:

```ts
  // Faqat ustoz uchun: sahifani darsdan o'chirish. canRemove false bo'lsa
  // (masalan shu mode'da faqat 1 ta sahifa qolgan bo'lsa) trash tugmasi
  // ko'rsatilmaydi.
  isHost?: boolean;
  canRemove?: boolean;
  onRemovePage?: (pageNumber: number) => void;
```

- [ ] **Step 3: Destructure the new props in `ClassroomPdfPage`**

Find the `ClassroomPdfPage` function's destructuring (search for `function ClassroomPdfPage({` then the parameter list on the next line/lines) and add `isHost = false, canRemove = true, onRemovePage,` to that destructured parameter list (append near the end, before the closing `}: PageProps) {`).

- [ ] **Step 4: Add local confirm-modal state**

Find where this component declares its other `useState` hooks (e.g. right after `const [visible, setVisible] = useState(pageNumber <= 2);`) and add:

```ts
  const [confirmRemove, setConfirmRemove] = useState(false);
```

- [ ] **Step 5: Add the trash button and confirmation modal to the page's JSX**

Find the page's outer wrapper element (search for `<div ref={wrapRef} data-page={pageNumber} className="relative shrink-0 w-full flex justify-center">`). This is the injection point. Add the trash button and modal as new sibling elements inside this div, positioned after the existing content but still inside the outer `<div>` — do NOT modify anything inside the existing `{visible ? (...) : ...}` block. Find the closing of that outer div (it will be a `</div>` at the matching indentation level — read forward from the opening tag to find exactly where this component's JSX for this wrapper ends, since other conditional overlays may already exist between the opening and closing tags).

Add immediately before that wrapper's closing `</div>`:

```tsx
      {isHost && (
        <div className="absolute bottom-1 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={!canRemove}
            title={canRemove ? "Sahifani o'chirish" : "Kamida bitta sahifa qolishi kerak"}
            className="flex items-center justify-center rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/90 disabled:hover:text-gray-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {confirmRemove && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setConfirmRemove(false)}
          />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm text-gray-700 mb-1 font-medium">
                Sahifani o'chirish
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {pageNumber}-sahifani darsdan o'chirasizmi? Bu amalni qaytarib bo'lmaydi.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => { setConfirmRemove(false); onRemovePage?.(pageNumber); }}
                  className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
```

`Trash2` is already imported at the top of this file (used elsewhere for other delete buttons) — no new import needed.

- [ ] **Step 6: Add a top-level `onRemovePage` prop to `ClassroomPdfViewer`**

`ClassroomPdfViewer` is a shared component used by both the host and student pages. `onRemovePage` must only ever be host-triggered — students never see the trash button at all, since `isHost` already gates its rendering in Step 5 — so this is a single top-level callback prop, not something that needs split/non-split branching the way some other callbacks in this file do (its signature already carries `mode` and `pane` explicitly).

In the `Props` interface, add this field right next to the `notebookPageCount` field added in Step 1:

```ts
  onRemovePage?: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right") => void;
```

In the main component's destructured parameter list, add `onRemovePage,` right next to where `notebookPageCount = 4,` was added in Step 1.

- [ ] **Step 7: Pass the new props from the parent's `ClassroomPdfPage` invocation**

Find where `ClassroomPdfPage` is invoked (search for `<ClassroomPdfPage` then `zoomVersion={paneIndex === 1 ? rightZoom : zoom}`). Add these props to that invocation, right after the existing `zoomVersion={...}` line:

```tsx
                    isHost={isHost}
                    canRemove={visiblePageCount(paneMode) > 1}
                    onRemovePage={(pageNumber) => onRemovePage?.(paneMode, pageNumber, paneIndex === 1 ? "right" : "left")}
```

- [ ] **Step 8: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): add per-page trash icon with confirmation dialog"
```

---

## Task 6: Wire Props Through Host and Student Pages

**Files:**
- Modify: `apps/frontend/src/pages/ClassroomHostPage.tsx`
- Modify: `apps/frontend/src/pages/ClassroomStudentPage.tsx`

**Interfaces:**
- Consumes: `state.notebookPageCount` and `hostActions.removePage` (Task 4), `notebookPageCount`/`onRemovePage` props (Task 5)

- [ ] **Step 1: Pass the props on the host page**

In `apps/frontend/src/pages/ClassroomHostPage.tsx`, find the `<ClassroomPdfViewer` usage (search for `hostSplitRatio={state.splitRatio}`) and add, right after that line:

```tsx
          notebookPageCount={state.notebookPageCount}
          onRemovePage={(mode, pageIndex, pane) => hostActions.removePage(mode, pageIndex, pane)}
```

- [ ] **Step 2: Pass the prop on the student page**

In `apps/frontend/src/pages/ClassroomStudentPage.tsx`, find the `<ClassroomPdfViewer` usage (search for `hostSplitRatio={state.splitRatio}`) and add, right after that line:

```tsx
          notebookPageCount={state.notebookPageCount}
```

(No `onRemovePage` here — students never see the trash button at all, since `ClassroomPdfViewer`'s `isHost` prop is `false` on the student page, which already gates the button's rendering in Task 5.)

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 4: Manual verification in the browser**

Run `npm run dev:backend` and `npm run dev:frontend`. As the teacher, open a classroom session with a multi-page PDF attached. Confirm a small trash icon appears at the bottom of each page. Click it, confirm the "N-sahifani darsdan o'chirasizmi?" dialog appears, click "Bekor qilish" and confirm nothing changes. Click the trash icon again and click "O'chirish" — confirm that page disappears, later pages renumber down by one, and any strokes on later pages are still attached to the correct (renumbered) page. Open the same session as a student in a second browser/tab and confirm the page removal is reflected live. Switch to notebook mode, confirm the trash icon also works there and `notebookPageCount` decrements. Remove pages down to 1 remaining and confirm the trash icon becomes disabled (with the "Kamida bitta sahifa qolishi kerak" tooltip) and cannot be clicked further.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ClassroomHostPage.tsx apps/frontend/src/pages/ClassroomStudentPage.tsx
git commit -m "feat(classroom): wire page-removal props into host and student pages"
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

Manual end-to-end check (already covered in Task 6 Step 4, repeat here as a final pass):
- Teacher removes a PDF page mid-lesson → students see it disappear live, later pages and their strokes correctly renumber.
- Teacher removes a notebook page → `notebookPageCount` decrements for both teacher and students.
- Attempting to remove the last remaining page is blocked (disabled button on the frontend, thrown error on the backend if bypassed).
- Replaying a lesson that included a page removal shows the page disappearing at the correct point in the timeline.
- Existing zoom/scroll/stroke/splitRatio sync is unaffected by this diff.
