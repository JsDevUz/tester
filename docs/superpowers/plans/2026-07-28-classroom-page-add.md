# Classroom Page Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher add a new page (PDF, from any library asset, or notebook, with a chosen style) mid-lesson, inserted right after any existing page — the architectural mirror of the already-shipped page-removal feature, reindexing later pages (and their strokes) upward instead of downward.

**Architecture:** Mirror the exact `removePage`/`page:remove` pattern (session field → clamp/validate → splice/reindex → history event → broadcast → socket listener → reducer → state → prop) in reverse: PDF insertion goes through a new REST method (`insertPdfPagesFromLibrary`, sibling to the existing `attachPdfFromLibrary`, since it needs the same async library lookup); notebook insertion goes through a new socket pair (`host:insertNotebookPage` → `page:insert`). Notebook page style moves from a single session-wide `notebookStyle` field to a per-page `notebookPageStyles` map, and the global "⋮" menu style picker is deleted since it no longer makes sense once styles are chosen per-page at add-time.

**Tech Stack:** NestJS, Socket.IO, React, TypeScript, Jest.

## Global Constraints

- `afterPageIndex` is 0-indexed insertion position (0 = insert before page 1, `N` = insert after page `N`), matching `Array.splice`'s semantics — this is a different convention from `removePage`'s 1-indexed `pageIndex`, so do not confuse the two when reading the sibling removal code for reference.
- A page's notebook style resolves as `notebookPageStyles[page] ?? notebookStyle ?? 'grid'` everywhere it's read — existing pages (added before this feature) fall back to the old session-wide value, new pages get their own entry.
- `host:setNotebookStyle`, `ClassroomService.setNotebookStyle`, and the "⋮" overflow menu's three "Daftar: Katakli/Yo'l-yo'l/Naqshsiz" rows are all deleted — there is no more "change every page's style at once" action.
- No confirmation dialog for adding a page (unlike removal) — this is non-destructive.
- No drag-to-reorder, no per-page style editing after creation, no undo — matching the removal feature's out-of-scope list.
- `session.pdfName` remains advisory-only display text once pages can come from multiple library assets — no code may assume every page in `pdfPages` came from the asset named by `pdfName`.
- All new user-facing strings are in Uzbek, matching this codebase's existing tone.
- **Critical architectural note (same as the removal plan):** the backend pools strokes by **mode** (`pdf`/`notebook`, shared across left/right panes — see `classroom.logic.ts`'s `strokeMapFor`/`activeStrokeMap`), but the frontend's `ClassroomState` pools strokes by **pane** (`strokesByPage` for left, `rightStrokesByPage` for right). Task 4's reindex logic must reindex the frontend's pane-keyed object, matching exactly how `applyPageRemove` already does this (do not re-architect this asymmetry, it's intentional and pre-existing).

---

## File Structure

- Modify `apps/backend/src/classroom/classroom.types.ts`: add `notebookPageStyles` to `ClassroomSession`, `ClassroomSnapshot`, `ClassroomBoardSnapshot`; remove nothing yet (old `notebookStyle` field stays as the fallback source).
- Modify `apps/backend/src/classroom/classroom.logic.ts`: add `insertPageStrokes` reindex helper (shared shape for both pdf/notebook insert paths), add `resolveNotebookPageStyle` helper, populate `notebookPageStyles` in `buildSnapshot`.
- Modify `apps/backend/src/classroom/classroom.service.ts`: add `insertPdfPagesFromLibrary` (REST-driven), add `insertNotebookPage` (socket-driven), delete `setNotebookStyle`.
- Modify `apps/backend/src/classroom/classroom.controller.ts`: add `POST /classroom/sessions/:id/pdf/insert` route.
- Modify `apps/backend/src/classroom/classroom.gateway.ts`: add `host:insertNotebookPage` handler, delete `host:setNotebookStyle` handler.
- Modify `apps/backend/src/classroom/classroom.logic.spec.ts` / `classroom.service.spec.ts`: tests for the above.
- Modify `apps/frontend/src/api/classroom.ts`: add `apiInsertClassPdfPages`, add `notebookPageStyles` to `CsSnapshot`/`ClassBoardSnapshotData`.
- Modify `apps/frontend/src/hooks/classroomReducers.ts`: add `applyPdfInsert` and `applyNotebookPageInsert` reducers; remove nothing (existing `applyPageRemove`/`applyPageClear` untouched).
- Modify `apps/frontend/src/hooks/useClassroomSession.ts`: add `notebookPageStyles` state, two new socket listeners, `insertNotebookPage` host action; delete `setNotebookStyle` host action and its socket listener/off.
- Modify `apps/frontend/src/hooks/useClassroomReplay.ts`: add `notebookPageStyles` to `baseState`, add `pdf:insert`/`page:insert` reducer entries.
- Modify `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`: per-page notebook style computed from `notebookPageStyles`, add "+" button (PDF opens library flow via new prop, notebook opens style popup) next to the trash button.
- Modify `apps/frontend/src/pages/ClassroomHostPage.tsx`: wire the new "+" props, wire the library-insert flow (new state alongside existing `pdfLibraryOpen`/`pageSelectAsset`), delete the three "Daftar: ..." menu items and their now-dead imports (`Grid3x3`, `AlignJustify`, `Square`, `Check` if unused elsewhere — verify before removing).
- Modify `apps/frontend/src/pages/ClassroomStudentPage.tsx`: pass `notebookPageStyles` prop through (read-only, no insert actions).

---

## Task 1: Backend Data Model — Per-Page Notebook Style

**Files:**
- Modify: `apps/backend/src/classroom/classroom.types.ts`
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Test: `apps/backend/src/classroom/classroom.logic.spec.ts`

**Interfaces:**
- Consumes: none
- Produces: `ClassroomSession.notebookPageStyles?: Record<number, ClassroomNotebookStyle>`, `ClassroomSnapshot.notebookPageStyles: Record<number, ClassroomNotebookStyle>`, `ClassroomBoardSnapshot.notebookPageStyles: Record<number, ClassroomNotebookStyle>`, pure function `resolveNotebookPageStyle(session: ClassroomSession, page: number): ClassroomNotebookStyle` in `classroom.logic.ts` — consumed by Task 2 (`insertNotebookPage`) and Task 3 (frontend snapshot consumption).

- [ ] **Step 1: Write failing tests for the snapshot field and the resolver**

Read `apps/backend/src/classroom/classroom.logic.spec.ts`'s existing session-fixture helper (search for how a minimal `ClassroomSession` is constructed and passed to `buildSnapshot` — the same helper Task 1 of the page-removal plan used) and add tests near the existing `notebookPageCount` snapshot tests:

```ts
it('snapshot defaults notebookPageStyles to an empty object when not set', () => {
  const session = makeSession();
  const snap = buildSnapshot(session);
  expect(snap.notebookPageStyles).toEqual({});
});

it('snapshot reflects custom notebookPageStyles set on the session', () => {
  const session = makeSession();
  session.notebookPageStyles = { 2: 'lined' };
  const snap = buildSnapshot(session);
  expect(snap.notebookPageStyles).toEqual({ 2: 'lined' });
});

it('resolveNotebookPageStyle falls back to session.notebookStyle when the page has no entry', () => {
  const session = makeSession();
  session.notebookStyle = 'plain';
  expect(resolveNotebookPageStyle(session, 3)).toBe('plain');
});

it('resolveNotebookPageStyle falls back to grid when neither is set', () => {
  const session = makeSession();
  expect(resolveNotebookPageStyle(session, 1)).toBe('grid');
});

it('resolveNotebookPageStyle prefers the per-page entry over the session-wide fallback', () => {
  const session = makeSession();
  session.notebookStyle = 'plain';
  session.notebookPageStyles = { 1: 'lined' };
  expect(resolveNotebookPageStyle(session, 1)).toBe('lined');
  expect(resolveNotebookPageStyle(session, 2)).toBe('plain');
});
```

(Replace `makeSession()` with whatever this spec file's actual fixture-construction helper is named — read the file to confirm before writing this step for real. Import `resolveNotebookPageStyle` alongside `buildSnapshot` at the top of the spec file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `snap.notebookPageStyles` is `undefined`, and `resolveNotebookPageStyle` does not exist yet.

- [ ] **Step 3: Add `notebookPageStyles` to the types**

In `apps/backend/src/classroom/classroom.types.ts`, add to the `ClassroomSession` interface, right after the existing `notebookStyle?: ClassroomNotebookStyle;` line:

```ts
  // Har bir daftar sahifasining o'z naqshi — sahifa raqami -> naqsh.
  // Kalit yo'q sahifalar eski umumiy notebookStyle'ni meros qiladi
  // (page-add funksiyasidan oldin yaratilgan barcha sahifalar uchun).
  notebookPageStyles?: Record<number, ClassroomNotebookStyle>;
```

Add to the `ClassroomSnapshot` interface, right after the existing `notebookStyle: ClassroomNotebookStyle;` line:

```ts
  notebookPageStyles: Record<number, ClassroomNotebookStyle>;
```

Add the same field to the `ClassroomBoardSnapshot` interface, right after its own `notebookStyle: ClassroomNotebookStyle;` line:

```ts
  notebookPageStyles: Record<number, ClassroomNotebookStyle>;
```

- [ ] **Step 4: Add `resolveNotebookPageStyle`**

In `apps/backend/src/classroom/classroom.logic.ts`, add this function right after `isValidPage`:

```ts
// Bitta daftar sahifasining amaldagi naqshini aniqlaydi: avval shu
// sahifaga tegishli alohida qiymat, bo'lmasa eski umumiy notebookStyle,
// u ham bo'lmasa 'grid'.
export function resolveNotebookPageStyle(session: ClassroomSession, page: number): ClassroomNotebookStyle {
  return session.notebookPageStyles?.[page] ?? session.notebookStyle ?? 'grid';
}
```

Add `ClassroomNotebookStyle` to this file's existing import from `./classroom.types` (find the import line at the top of the file that imports `ClassroomBoardMode`, `ClassroomSession`, etc. and add `ClassroomNotebookStyle` to that list if not already present — check first, since `classroom.service.ts` already imports it and `classroom.logic.ts` may or may not).

- [ ] **Step 5: Populate `notebookPageStyles` in `buildSnapshot`**

Find the `buildSnapshot` function's return object (it currently has `notebookPageCount: session.notebookPageCount ?? 4,`). Add, right after that line:

```ts
    notebookPageStyles: session.notebookPageStyles ?? {},
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 5 new ones)

- [ ] **Step 7: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/classroom/classroom.types.ts apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.logic.spec.ts
git commit -m "feat(classroom): add per-page notebookPageStyles alongside session-wide notebookStyle fallback"
```

---

## Task 2: Backend Notebook Page Insertion

**Files:**
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `ClassroomSession.notebookPageCount`/`notebookPageStyles` (Task 1), `strokeMapFor` (existing)
- Produces: pure function `insertNotebookPageIntoSession(session: ClassroomSession, afterPageIndex: number, style: ClassroomNotebookStyle): boolean` in `classroom.logic.ts`, and `ClassroomService.insertNotebookPage(sessionId: string, userId: string, afterPageIndex: number, style: ClassroomNotebookStyle, pane?: 'left' | 'right'): void` — consumed by Task 3 (gateway handler) and Task 4 (frontend socket listener needs the exact `page:insert` broadcast payload shape: `{ mode: 'notebook', afterPageIndex, style, pane }`).

- [ ] **Step 1: Write failing tests for the pure logic function**

Read `apps/backend/src/classroom/classroom.logic.spec.ts`'s existing `removePageFromSession` tests to match conventions (same file, same `strokeMapFor` import), then add:

```ts
it('insertNotebookPageIntoSession increments notebookPageCount and sets the new page style', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;

  const ok = insertNotebookPageIntoSession(session, 1, 'lined');

  expect(ok).toBe(true);
  expect(session.notebookPageCount).toBe(4);
  expect(session.notebookPageStyles?.[2]).toBe('lined');
});

it('insertNotebookPageIntoSession shifts later page styles up by one', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;
  session.notebookPageStyles = { 2: 'plain', 3: 'lined' };

  insertNotebookPageIntoSession(session, 1, 'grid');

  expect(session.notebookPageStyles).toEqual({ 2: 'grid', 3: 'plain', 4: 'lined' });
});

it('insertNotebookPageIntoSession shifts strokes at and after the insertion point up by one', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;
  const map = strokeMapFor(session, 'notebook');
  map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
  map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

  insertNotebookPageIntoSession(session, 1, 'grid');

  const reindexed = strokeMapFor(session, 'notebook');
  expect(reindexed.get(1)?.[0]?.id).toBe('s1'); // unaffected, before insertion point
  expect(reindexed.has(2)).toBe(false); // new page's slot starts empty
  expect(reindexed.get(3)?.[0]?.id).toBe('s2'); // was page 2, now page 3
});

it('insertNotebookPageIntoSession increments currentPage when inserting before or at it', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;
  session.currentPage = 2;

  insertNotebookPageIntoSession(session, 1, 'grid');

  expect(session.currentPage).toBe(3);
});

it('insertNotebookPageIntoSession leaves currentPage unchanged when inserting after it', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;
  session.currentPage = 1;

  insertNotebookPageIntoSession(session, 2, 'grid');

  expect(session.currentPage).toBe(1);
});

it('insertNotebookPageIntoSession refuses an out-of-range afterPageIndex', () => {
  const session = makeSession();
  session.boardMode = 'notebook';
  session.notebookPageCount = 3;

  expect(insertNotebookPageIntoSession(session, -1, 'grid')).toBe(false);
  expect(insertNotebookPageIntoSession(session, 4, 'grid')).toBe(false);
});

it('insertNotebookPageIntoSession refuses an invalid style', () => {
  const session = makeSession();
  session.notebookPageCount = 3;

  expect(insertNotebookPageIntoSession(session, 1, 'bogus' as any)).toBe(false);
});
```

Import `insertNotebookPageIntoSession` alongside this file's other imports from `./classroom.logic`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `insertNotebookPageIntoSession` is not exported / does not exist yet.

- [ ] **Step 3: Implement `insertNotebookPageIntoSession`**

In `apps/backend/src/classroom/classroom.logic.ts`, add this function after `removePageFromSession`:

```ts
// Daftarga yangi (bo'sh) sahifa qo'shadi — afterPageIndex'dan keyingi
// barcha sahifalar (naqsh + chizmalar) bittaga yuqoriga siljiydi.
// afterPageIndex 0-indexed qo'yish nuqtasi: 0 = birinchi sahifadan oldin,
// N = N-sahifadan keyin (removePageFromSession'ning 1-indexed pageIndex'idan farqli).
export function insertNotebookPageIntoSession(
  session: ClassroomSession,
  afterPageIndex: number,
  style: ClassroomNotebookStyle,
): boolean {
  if (!['grid', 'lined', 'plain'].includes(style)) return false;
  const previousMode = session.boardMode;
  session.boardMode = 'notebook';
  const currentCount = session.notebookPageCount ?? 4;
  if (!Number.isInteger(afterPageIndex) || afterPageIndex < 0 || afterPageIndex > currentCount) {
    session.boardMode = previousMode;
    return false;
  }

  session.notebookPageCount = currentCount + 1;

  const previousStyles = session.notebookPageStyles ?? {};
  const rebuiltStyles: Record<number, ClassroomNotebookStyle> = {};
  for (const [key, value] of Object.entries(previousStyles)) {
    const pageNum = Number(key);
    if (pageNum <= afterPageIndex) rebuiltStyles[pageNum] = value;
    else rebuiltStyles[pageNum + 1] = value;
  }
  rebuiltStyles[afterPageIndex + 1] = style;
  session.notebookPageStyles = rebuiltStyles;

  const map = strokeMapFor(session, 'notebook');
  const rebuiltStrokes = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key <= afterPageIndex) rebuiltStrokes.set(key, strokes);
    else rebuiltStrokes.set(key + 1, strokes);
  }
  session.strokesByMode?.set('notebook', rebuiltStrokes);
  if (previousMode === 'notebook') session.strokesByPage = rebuiltStrokes;

  if (session.currentPage > afterPageIndex) session.currentPage += 1;

  session.boardMode = previousMode;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 7 new ones)

- [ ] **Step 5: Write failing tests for the service method**

Read `apps/backend/src/classroom/classroom.service.spec.ts`'s existing `removePage` tests (search for `describe` block containing `service.removePage`) to match style, then add tests near them:

```ts
it('host daftarga yangi sahifa qoshsa page:insert broadcast va tarixga yoziladi', async () => {
  const { service, events, sessionId } = await setup();
  service.setBoardMode(sessionId, 'teacher-1', 'notebook');
  service.insertNotebookPage(sessionId, 'teacher-1', 1, 'lined');
  expect(events.at(-1)).toMatchObject({
    event: 'page:insert',
    payload: { mode: 'notebook', afterPageIndex: 1, style: 'lined', pane: 'left' },
  });
  expect(service.getHistoryEventsForTests(sessionId).map((event) => event.type)).toContain('page:insert');
});

it('host bolmagan foydalanuvchi sahifa qosha olmaydi', async () => {
  const { service, sessionId } = await setup();
  expect(() => service.insertNotebookPage(sessionId, 'stu-1', 0, 'grid')).toThrow();
});

it('notogri afterPageIndex bilan sahifa qoshish rad etiladi', async () => {
  const { service, sessionId } = await setup();
  service.setBoardMode(sessionId, 'teacher-1', 'notebook');
  expect(() => service.insertNotebookPage(sessionId, 'teacher-1', 99, 'grid')).toThrow();
});

it('kech kirgan ustoz snapshot orqali kopaygan sahifalar sonini oladi', async () => {
  const { service, sessionId } = await setup();
  service.setBoardMode(sessionId, 'teacher-1', 'notebook');
  service.insertNotebookPage(sessionId, 'teacher-1', 4, 'plain');
  const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
  expect(snapshot.notebookPageCount).toBe(5); // default 4, one inserted
  expect(snapshot.notebookPageStyles).toEqual({ 5: 'plain' });
});
```

Read `setup()`'s and `hostJoin`'s implementations first (search for `async function setup` and `hostJoin(`) to confirm the exact return shape and rejoin method name — reuse the same pattern the `removePage` tests already use for the "late join reflects state" test.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.insertNotebookPage` is not a function.

- [ ] **Step 7: Implement `insertNotebookPage` on the service**

In `apps/backend/src/classroom/classroom.service.ts`, update the import line pulling from `./classroom.logic` to include `insertNotebookPageIntoSession` (add it to the same multi-line import block that already lists `removePageFromSession`).

Find the `removePage` method (search for `removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number,`) and add a new method right after it:

```ts
  // Daftarga yangi (bo'sh) sahifa qo'shadi — afterPageIndex'dan keyingi
  // sahifalar va ularning chizmalari/naqshlari bittaga yuqoriga siljiydi.
  insertNotebookPage(sessionId: string, userId: string, afterPageIndex: number, style: ClassroomNotebookStyle, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const ok = insertNotebookPageIntoSession(s, afterPageIndex, style);
    if (!ok) throw new Error('INVALID_PAGE_INSERT');
    const payload = { mode: 'notebook' as const, afterPageIndex, style, pane };
    this.recordHistoryEvent(s, 'page:insert', payload);
    this.broadcaster.toRoom(s.id, 'page:insert', payload);
  }
```

- [ ] **Step 8: Delete `setNotebookStyle`**

Find and delete the entire `setNotebookStyle` method (search for `setNotebookStyle(sessionId: string, userId: string, style: ClassroomNotebookStyle): void {` through its closing `}`). This method is being replaced by per-page style selection at add-time — nothing in the codebase should call it after this task (Task 5 removes the frontend caller).

Run `grep -rn "setNotebookStyle" apps/backend/src` to confirm no other backend reference remains besides the gateway handler (deleted in Task 3).

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL initially if any existing test called `service.setNotebookStyle` — find and delete that test too (search `classroom.service.spec.ts` for `setNotebookStyle`; if a test exists exercising it, remove that whole `it(...)` block, since the method no longer exists). Then re-run.
Expected after cleanup: PASS (all tests including the 4 new ones, with the old `setNotebookStyle` test removed)

- [ ] **Step 10: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.logic.spec.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add insertNotebookPage, remove setNotebookStyle"
```

---

## Task 3: Backend Gateway Handler — Notebook Insert, Remove setNotebookStyle Handler

**Files:**
- Modify: `apps/backend/src/classroom/classroom.gateway.ts`

**Interfaces:**
- Consumes: `ClassroomService.insertNotebookPage` (Task 2)
- Produces: socket event `host:insertNotebookPage` — consumed by Task 5 (frontend `hostActions.insertNotebookPage`).

- [ ] **Step 1: Add the gateway handler for notebook insertion**

Find the existing `host:removePage` handler (search for `@SubscribeMessage('host:removePage')`) and add a new handler right after it:

```ts
  @SubscribeMessage('host:insertNotebookPage')
  insertNotebookPage(@MessageBody() body: BaseBody & { afterPageIndex: number; style: 'grid' | 'lined' | 'plain'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.insertNotebookPage(body.sessionId, user.sub, body.afterPageIndex, body.style, body.pane ?? 'left');
    });
  }
```

- [ ] **Step 2: Delete the `host:setNotebookStyle` handler**

Find and delete the entire `@SubscribeMessage('host:setNotebookStyle')` handler (search for it — it calls `this.classroomService.setNotebookStyle(...)`, which no longer exists after Task 2).

- [ ] **Step 3: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass (no new tests needed — the gateway handler is a thin pass-through already covered by Task 2's service-level tests, matching how `host:removePage` had no dedicated gateway-level test either).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/classroom/classroom.gateway.ts
git commit -m "feat(classroom): add host:insertNotebookPage handler, remove host:setNotebookStyle"
```

---

## Task 4: Backend PDF Page Insertion (REST)

**Files:**
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Modify: `apps/backend/src/classroom/classroom.controller.ts`
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `ClassroomSession.pdfPages` (existing), `strokeMapFor` (existing), `this.mediaLibrary.getPdfPages` (existing, used identically to `attachPdfFromLibrary`)
- Produces: pure function `insertPdfPagesIntoSession(session: ClassroomSession, newPages: string[], afterPageIndex: number): boolean` in `classroom.logic.ts`, `ClassroomService.insertPdfPagesFromLibrary(sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number): Promise<{ pages: string[] }>`, and REST route `POST /classroom/sessions/:id/pdf/insert` — consumed by Task 6 (frontend `apiInsertClassPdfPages`).

- [ ] **Step 1: Write failing tests for the pure logic function**

Add to `apps/backend/src/classroom/classroom.logic.spec.ts`, near the `removePageFromSession` tests:

```ts
it('insertPdfPagesIntoSession splices new pages after the given index', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png', 'c.png'];

  const ok = insertPdfPagesIntoSession(session, ['x.png', 'y.png'], 1);

  expect(ok).toBe(true);
  expect(session.pdfPages).toEqual(['a.png', 'x.png', 'y.png', 'b.png', 'c.png']);
});

it('insertPdfPagesIntoSession shifts strokes at and after the insertion point up by the inserted count', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png'];
  session.boardMode = 'pdf';
  const map = strokeMapFor(session, 'pdf');
  map.set(1, [{ id: 's1', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);
  map.set(2, [{ id: 's2', tool: 'pen', color: '#000', width: 2, points: [0, 0, 1, 1] }]);

  insertPdfPagesIntoSession(session, ['new.png'], 1);

  const reindexed = strokeMapFor(session, 'pdf');
  expect(reindexed.get(1)?.[0]?.id).toBe('s1');
  expect(reindexed.has(2)).toBe(false);
  expect(reindexed.get(3)?.[0]?.id).toBe('s2');
});

it('insertPdfPagesIntoSession increments currentPage when inserting before or at it', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png'];
  session.currentPage = 2;

  insertPdfPagesIntoSession(session, ['x.png'], 1);

  expect(session.currentPage).toBe(3);
});

it('insertPdfPagesIntoSession leaves currentPage unchanged when inserting after it', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png'];
  session.currentPage = 1;

  insertPdfPagesIntoSession(session, ['x.png'], 2);

  expect(session.currentPage).toBe(1);
});

it('insertPdfPagesIntoSession refuses an out-of-range afterPageIndex', () => {
  const session = makeSession();
  session.pdfPages = ['a.png', 'b.png'];

  expect(insertPdfPagesIntoSession(session, ['x.png'], -1)).toBe(false);
  expect(insertPdfPagesIntoSession(session, ['x.png'], 3)).toBe(false);
});

it('insertPdfPagesIntoSession refuses an empty newPages array', () => {
  const session = makeSession();
  session.pdfPages = ['a.png'];

  expect(insertPdfPagesIntoSession(session, [], 0)).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `insertPdfPagesIntoSession` is not exported / does not exist yet.

- [ ] **Step 3: Implement `insertPdfPagesIntoSession`**

In `apps/backend/src/classroom/classroom.logic.ts`, add this function after `insertNotebookPageIntoSession`:

```ts
// PDF'ga bir yoki bir nechta yangi sahifa qo'shadi (kutubxonaning istalgan
// faylidan bo'lishi mumkin) — afterPageIndex'dan keyingi barcha sahifalar
// (va ularning chizmalari) qo'shilgan sahifalar soniga qarab yuqoriga
// siljiydi. afterPageIndex 0-indexed (Array.splice semantikasi bilan bir xil).
export function insertPdfPagesIntoSession(
  session: ClassroomSession,
  newPages: string[],
  afterPageIndex: number,
): boolean {
  if (newPages.length === 0) return false;
  if (!Number.isInteger(afterPageIndex) || afterPageIndex < 0 || afterPageIndex > session.pdfPages.length) return false;

  session.pdfPages.splice(afterPageIndex, 0, ...newPages);

  const shiftBy = newPages.length;
  const map = strokeMapFor(session, 'pdf');
  const rebuilt = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key <= afterPageIndex) rebuilt.set(key, strokes);
    else rebuilt.set(key + shiftBy, strokes);
  }
  session.strokesByMode?.set('pdf', rebuilt);
  if ((session.boardMode ?? 'pdf') === 'pdf') session.strokesByPage = rebuilt;

  if (session.currentPage > afterPageIndex) session.currentPage += shiftBy;

  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the 6 new ones)

- [ ] **Step 5: Write failing tests for the service method**

Add to `apps/backend/src/classroom/classroom.service.spec.ts`, inside (or near) the existing `describe('attachPdfFromLibrary', ...)` block, reusing `makeFakeMediaLibrary`:

```ts
it('kutubxonadan tanlangan sahifalarni mavjud PDFga qoshadi va pdf:insert broadcast qiladi', async () => {
  const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1', 'p2', 'p3'], status: 'ready' });
  const { service, events, sessionId } = await setup(mediaLibrary);
  service.setPdfForTests(sessionId, 'dars.pdf', ['a.png', 'b.png']);

  const result = await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [2], 1);

  expect(result).toEqual({ pages: ['p2'] });
  expect(events.at(-1)).toMatchObject({
    event: 'pdf:insert',
    payload: { pages: ['p2'], afterPageIndex: 1 },
  });
});

it('boshqa kitobdan olingan sahifalar mavjud PDFga aralashtiriladi', async () => {
  const mediaLibrary = makeFakeMediaLibrary({ pages: ['other-1', 'other-2'], status: 'ready' });
  const { service, sessionId } = await setup(mediaLibrary);
  service.setPdfForTests(sessionId, 'dars.pdf', ['a.png', 'b.png']);

  const result = await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'boshqa-asset', [1], 2);

  expect(result.pages).toEqual(['other-1']);
  const snapshot = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
  expect(snapshot.pages).toEqual(['a.png', 'b.png', 'other-1']);
});

it('begona ustoz uchun taqiqlanadi', async () => {
  const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1'], status: 'ready' });
  const { service, sessionId } = await setup(mediaLibrary);
  service.setPdfForTests(sessionId, 'dars.pdf', ['a.png']);
  await expect(
    service.insertPdfPagesFromLibrary(sessionId, 'boshqa-teacher', 'teacher', 'asset-1', [1], 0),
  ).rejects.toThrow();
});

it('notogri afterPageIndex bilan qoshish rad etiladi', async () => {
  const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1'], status: 'ready' });
  const { service, sessionId } = await setup(mediaLibrary);
  service.setPdfForTests(sessionId, 'dars.pdf', ['a.png']);
  await expect(
    service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1], 99),
  ).rejects.toThrow();
});
```

Read `attachPdfFromLibrary`'s existing tests (search `describe('attachPdfFromLibrary'`) for the exact `mockedDb.query.mediaAssets.findFirst` mocking pattern if your new method also needs asset metadata — check Step 6 below first: `insertPdfPagesFromLibrary` does NOT need the asset's `originalName` (unlike `attachPdfFromLibrary`, it doesn't overwrite `pdfName`), so no `mockedDb.query.mediaAssets.findFirst` mock is needed for these tests.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.insertPdfPagesFromLibrary` is not a function.

- [ ] **Step 7: Implement `insertPdfPagesFromLibrary` on the service**

In `apps/backend/src/classroom/classroom.service.ts`, update the import line pulling from `./classroom.logic` to include `insertPdfPagesIntoSession` (add it alongside `insertNotebookPageIntoSession` from Task 2).

Find the `attachPdfFromLibrary` method (search for `async attachPdfFromLibrary(`) and add a new method right after its closing `}` (before `private applyPdf`):

```ts
  // Kutubxonadagi (istalgan, hozirgi darsga biriktirilganidan farqli
  // bo'lishi ham mumkin) PDF'dan tanlangan sahifalarni mavjud darsga
  // QO'SHADI (attachPdfFromLibrary'dan farqli — u butun sessiyani
  // almashtiradi, bu faqat append/insert qiladi, eski sahifa/chizmalarga
  // tegmaydi). pdfName o'zgarmaydi — endi faqat ko'rgazmali (advisory)
  // yorliq, chunki sahifalar turli fayllardan aralash bo'lishi mumkin.
  async insertPdfPagesFromLibrary(
    sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
  ): Promise<{ pages: string[] }> {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== teacherId) throw new ForbiddenException('Faqat dars ustozi sahifa qo\'sha oladi');

    const { pages: allPages, status } = await this.mediaLibrary.getPdfPages(mediaAssetId, teacherId, teacherRole);
    if (status !== 'ready') {
      throw new ConflictException("PDF hali tayyor emas — konvertatsiya tugashini kuting");
    }
    if (allPages.length === 0) {
      throw new ConflictException('PDF sahifalari topilmadi');
    }

    const uniqueSorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (uniqueSorted.some((n) => !Number.isInteger(n) || n < 1 || n > allPages.length)) {
      throw new ConflictException("Noto'g'ri sahifa raqami tanlangan");
    }
    const newPages = uniqueSorted.map((n) => allPages[n - 1]);

    const ok = insertPdfPagesIntoSession(s, newPages, afterPageIndex);
    if (!ok) throw new ConflictException("Noto'g'ri qo'yish joyi");

    await db.update(classSessions)
      .set({ pdfPages: s.pdfPages })
      .where(eq(classSessions.id, sessionId));

    const payload = { pages: newPages, afterPageIndex };
    this.recordHistoryEvent(s, 'pdf:insert', payload);
    this.broadcaster.toRoom(sessionId, 'pdf:insert', payload);
    return { pages: newPages };
  }
```

- [ ] **Step 8: Add the REST route**

In `apps/backend/src/classroom/classroom.controller.ts`, add a new DTO class right after `AttachPdfDto`:

```ts
class InsertPdfPagesDto {
  @IsString() mediaAssetId!: string;
  @IsInt({ each: true }) @Min(1, { each: true }) @ArrayMinSize(1) pageNumbers!: number[];
  @IsInt() @Min(0) afterPageIndex!: number;
}
```

Find the `attachPdf` route handler (search for `@Post('sessions/:id/pdf')`) and add a new route right after it:

```ts
  @Post('sessions/:id/pdf/insert')
  @Roles('teacher', 'super')
  async insertPdfPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InsertPdfPagesDto,
    @Req() req: any,
  ) {
    return this.classroomService.insertPdfPagesFromLibrary(id, req.admin.id, req.admin.role, dto.mediaAssetId, dto.pageNumbers, dto.afterPageIndex);
  }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS (all tests including the 4 new ones)

- [ ] **Step 10: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.controller.ts apps/backend/src/classroom/classroom.logic.spec.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add insertPdfPagesFromLibrary REST endpoint for mid-lesson page append"
```

---

## Task 5: Frontend Session Hook and Reducers

**Files:**
- Modify: `apps/frontend/src/api/classroom.ts`
- Modify: `apps/frontend/src/hooks/classroomReducers.ts`
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts`
- Modify: `apps/frontend/src/hooks/useClassroomReplay.ts`

**Interfaces:**
- Consumes: `pdf:insert` socket event `{ pages: string[]; afterPageIndex: number }` (Task 4), `page:insert` socket event `{ mode: 'notebook'; afterPageIndex: number; style: CsNotebookStyle; pane: 'left' | 'right' }` (Task 2/3), `CsSnapshot.notebookPageStyles` (Task 1's backend snapshot)
- Produces: `ClassroomState.notebookPageStyles: Record<number, CsNotebookStyle>`, `apiInsertClassPdfPages(sessionId, assetId, pageNumbers, afterPageIndex)`, `hostActions.insertNotebookPage(afterPageIndex, style, pane?): void`, `applyPdfInsert`/`applyNotebookPageInsert` reducers — consumed by Task 6 (`ClassroomPdfViewer.tsx`) and Task 7 (host/student page wiring).

**IMPORTANT:** Re-read the Global Constraints section's note on the mode-vs-pane architectural split before starting this task. `applyNotebookPageInsert` must follow the exact same pane-selection and mode-guard pattern as the existing `applyPageRemove` (read it in full first).

- [ ] **Step 1: Add `notebookPageStyles` to `CsSnapshot` and `ClassBoardSnapshotData`, add `apiInsertClassPdfPages`**

In `apps/frontend/src/api/classroom.ts`, find the `CsSnapshot` interface and add, right after the existing `notebookStyle: CsNotebookStyle;` line:

```ts
  notebookPageStyles: Record<number, CsNotebookStyle>;
```

Find the `ClassBoardSnapshotData` interface and add the same field, right after its own `notebookStyle: CsNotebookStyle;` line:

```ts
  notebookPageStyles: Record<number, CsNotebookStyle>;
```

Find `apiAttachClassPdf` (search for `export async function apiAttachClassPdf`) and add a new function right after it:

```ts
// Kutubxonadan tanlangan (istalgan fayldan) sahifalarni mavjud darsga
// QO'SHADI — apiAttachClassPdf'dan farqli, eski sahifalarni almashtirmaydi.
export async function apiInsertClassPdfPages(
  sessionId: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
): Promise<{ pages: string[] }> {
  const res = await client.post(`/classroom/sessions/${sessionId}/pdf/insert`, { mediaAssetId, pageNumbers, afterPageIndex });
  return res.data;
}
```

- [ ] **Step 2: Add the `applyPdfInsert` and `applyNotebookPageInsert` reducers**

In `apps/frontend/src/hooks/classroomReducers.ts`, read `applyPageRemove` in full first (to match its exact style). Add these two new functions right after it:

```ts
// PDF'ga qo'shilgan yangi sahifa(lar) — afterPageIndex'dan keyingi barcha
// sahifalarning chizmalari (chap panel, chunki PDF qo'shish hozircha
// faqat asosiy/chap panelga tegishli) qo'shilgan son bo'yicha yuqoriga
// siljiydi.
export function applyPdfInsert(
  s: ClassroomState,
  p: { pages: string[]; afterPageIndex: number },
): ClassroomState {
  const shiftBy = p.pages.length;
  const pages = [...s.pages];
  pages.splice(p.afterPageIndex, 0, ...p.pages);

  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(s.strokesByPage)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuilt[pageNum] = strokes;
    else rebuilt[pageNum + shiftBy] = strokes;
  }

  const currentPage = s.currentPage > p.afterPageIndex ? s.currentPage + shiftBy : s.currentPage;

  return { ...s, pages, strokesByPage: rebuilt, currentPage };
}

// Daftarga qo'shilgan yangi sahifa — afterPageIndex'dan keyingi barcha
// sahifalarning naqshi/chizmalari (shu pane uchun) bittaga yuqoriga
// siljiydi, yangi sahifaning o'zi tanlangan naqshni oladi.
export function applyNotebookPageInsert(
  s: ClassroomState,
  p: { mode: CsBoardMode; afterPageIndex: number; style: CsNotebookStyle; pane?: "left" | "right" },
): ClassroomState {
  const right = p.pane === "right";
  if (p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;

  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(source)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuilt[pageNum] = strokes;
    else rebuilt[pageNum + 1] = strokes;
  }

  const rebuiltStyles: Record<number, CsNotebookStyle> = {};
  for (const [pageStr, style] of Object.entries(s.notebookPageStyles)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuiltStyles[pageNum] = style;
    else rebuiltStyles[pageNum + 1] = style;
  }
  rebuiltStyles[p.afterPageIndex + 1] = p.style;

  const notebookPageCount = s.notebookPageCount + 1;
  const currentPage = s.currentPage > p.afterPageIndex ? s.currentPage + 1 : s.currentPage;

  return { ...s, [key]: rebuilt, notebookPageStyles: rebuiltStyles, notebookPageCount, currentPage };
}
```

Add `CsNotebookStyle` to this file's existing import from `../api/classroom` if not already present (check the top import line — it currently imports `CsBoardLayout, CsBoardMode, CsStroke`).

- [ ] **Step 3: Add `notebookPageStyles` to `ClassroomState` and its default, remove `notebookStyle`/`setNotebookStyle`**

In `apps/frontend/src/hooks/useClassroomSession.ts`, find the `ClassroomState` interface and change the existing line:

```ts
  notebookStyle: CsNotebookStyle;
```

to:

```ts
  // Har bir daftar sahifasining o'z naqshi (sahifa raqami -> naqsh).
  // Eski umumiy notebookStyle sozlamasi endi yo'q — har bir yangi sahifa
  // "+" bilan qo'shilganda o'z naqshini oladi.
  notebookPageStyles: Record<number, CsNotebookStyle>;
```

In the `INITIAL` constant, change `notebookStyle: "grid",` to `notebookPageStyles: {},`.

- [ ] **Step 4: Populate `notebookPageStyles` when joining, remove `notebookStyle` mapping**

Find the `setState({...})` call inside the `join()` function's success callback and change the existing line:

```ts
            notebookStyle: snap.notebookStyle ?? "grid",
```

to:

```ts
            notebookPageStyles: snap.notebookPageStyles ?? {},
```

- [ ] **Step 5: Add the two new socket listeners, remove the `notebookStyle:set` listener**

Find the existing `socket.on("page:remove", ...)` listener registration and add, right after it:

```ts
    socket.on("pdf:insert", (p: { pages: string[]; afterPageIndex: number }) => setState((s) => applyPdfInsert(s, p)));
    socket.on("page:insert", (p: { mode: CsBoardMode; afterPageIndex: number; style: CsNotebookStyle; pane?: "left" | "right" }) => setState((s) => applyNotebookPageInsert(s, p)));
```

Find and delete this existing line entirely:

```ts
    socket.on("notebookStyle:set", (p: { style: CsNotebookStyle }) => setState((s) => ({ ...s, notebookStyle: p.style })));
```

Add `applyPdfInsert, applyNotebookPageInsert` to this file's existing import from `./classroomReducers`.

Find the matching cleanup block (`socket.off("page:remove");`) and add, right after it:

```ts
      socket.off("pdf:insert");
      socket.off("page:insert");
```

Find and delete this existing line entirely:

```ts
      socket.off("notebookStyle:set");
```

- [ ] **Step 6: Add the `insertNotebookPage` host action, remove `setNotebookStyle`**

Find the `hostActions` object's `removePage` entry (search for `removePage: (mode: CsBoardMode, pageIndex: number, pane:`) and add, right after it:

```ts
    insertNotebookPage: (afterPageIndex: number, style: CsNotebookStyle, pane: "left" | "right" = "left") =>
      emitHost("host:insertNotebookPage", { afterPageIndex, style, pane }),
```

Find and delete the entire `setNotebookStyle` entry from `hostActions`:

```ts
    setNotebookStyle: (style: CsNotebookStyle) => {
      setState((s) => ({ ...s, notebookStyle: style }));
      emitHost("host:setNotebookStyle", { style });
    },
```

- [ ] **Step 7: Wire replay support**

In `apps/frontend/src/hooks/useClassroomReplay.ts`, add `applyPdfInsert, applyNotebookPageInsert` to the existing import from `./classroomReducers`.

Add two new entries to the `REDUCERS` map, right after the existing `"page:remove": applyPageRemove,` entry:

```ts
  "pdf:insert": applyPdfInsert,
  "page:insert": applyNotebookPageInsert,
```

Find and delete this existing line entirely (its target state field no longer exists after Step 3):

```ts
  "notebookStyle:set": (s, p: { style: "grid" | "lined" | "plain" }) => ({ ...s, notebookStyle: p.style }),
```

In `baseState`, find the line:

```ts
    zoom: 1, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 4, scroll: null, rightScroll: null,
```

and the line right after it:

```ts
    isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf",
    classroomTheme: globalTheme, notebookStyle: "grid",
```

Change the second line's `notebookStyle: "grid",` to `notebookPageStyles: {},`.

- [ ] **Step 8: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0` — this will surface any remaining reference to the now-deleted `notebookStyle`/`setNotebookStyle` fields as a type error; fix any such reference by following the pattern above (they should only remain in `ClassroomPdfViewer.tsx`/`ClassroomHostPage.tsx`/`ClassroomStudentPage.tsx`, which Tasks 6-7 handle).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/api/classroom.ts apps/frontend/src/hooks/classroomReducers.ts apps/frontend/src/hooks/useClassroomSession.ts apps/frontend/src/hooks/useClassroomReplay.ts
git commit -m "feat(classroom): thread notebookPageStyles and page-insert sync through frontend hooks, remove notebookStyle"
```

---

## Task 6: ClassroomPdfViewer "+" Button and Per-Page Style

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `notebookPageStyles` prop, `hostActions.insertNotebookPage` (Task 5), `onInsertPdfPage`/`onInsertNotebookPage` props (passed down via Task 7's page wiring)
- Produces: a "+" icon on each rendered page (host-only, next to the trash icon), opening the library-select flow for PDF or a style popup for notebook.

**Note:** This task does NOT touch `ClassroomPdfLibraryModal.tsx` or `PdfPageSelectModal.tsx` — both are reused unmodified, since they already just produce `(asset)` / `(pageNumbers: number[])` callbacks with no assumption about replace-vs-insert. The insert-vs-replace decision lives entirely in the parent page (Task 7), which decides which API function to call.

- [ ] **Step 1: Replace the top-level `notebookStyle` prop with `notebookPageStyles`**

Find the `Props` interface's existing line:

```ts
  // Daftar foni: katakli, yo'l-yo'l yoki naqshsiz (bo'sh oq varaq).
  notebookStyle?: CsNotebookStyle;
```

and replace it with:

```ts
  // Har bir daftar sahifasining o'z naqshi (sahifa raqami -> naqsh).
  notebookPageStyles?: Record<number, CsNotebookStyle>;
```

Find the main component's destructured parameter list (search for `notebookStyle = "grid",` inside the `ClassroomPdfViewer` function signature — NOT the `ClassroomPdfPage` one, which keeps its own per-page `notebookStyle` prop unchanged) and replace `notebookStyle = "grid",` with `notebookPageStyles = {},`.

- [ ] **Step 2: Add insert-related props to the top-level `Props` interface**

Add, right next to the `onRemovePage` field:

```ts
  // Faqat ustoz uchun: "+" bosilganda PDF rejimida chaqiriladi (kutubxona
  // tanlash oqimini ochish uchun) — afterPageIndex shu sahifadan keyin
  // qo'yish nuqtasi (0-indexed).
  onInsertPdfPage?: (afterPageIndex: number, pane: "left" | "right") => void;
  onInsertNotebookPage?: (afterPageIndex: number, style: CsNotebookStyle, pane: "left" | "right") => void;
```

Add `onInsertPdfPage, onInsertNotebookPage,` right next to where `onRemovePage,` is destructured in the main component's parameter list.

- [ ] **Step 3: Add insert props to `ClassroomPdfPage`'s `PageProps`**

Find the `PageProps` interface's existing `onRemovePage?: (pageNumber: number) => void;` line and add, right after it:

```ts
  // style bo'lsa (daftar rejimida naqsh tanlanganda) — style bilan birga
  // yuboriladi. PDF rejimida style yo'q (undefined) — bosilganda darhol
  // kutubxona tanlash oqimi ochiladi, popup ko'rsatilmaydi.
  onInsertPage?: (pageNumber: number, style?: CsNotebookStyle) => void;
```

(Single callback: `ClassroomPdfPage` doesn't need to know whether it's PDF or notebook mode for this — the parent invocation site already knows `paneMode` and picks the right handler, exactly like it already does for `onRemovePage`.)

Add `onInsertPage,` to the `ClassroomPdfPage` function's destructured parameter list, right next to `onRemovePage,`.

- [ ] **Step 4: Add local style-popup state**

Find the `confirmRemove` state declaration (`const [confirmRemove, setConfirmRemove] = useState(false);`) and add, right after it:

```ts
  const [showStylePopup, setShowStylePopup] = useState(false);
```

- [ ] **Step 5: Add the "+" button and style popup to the page's JSX**

Find the trash button block (search for `{isHost && (` followed by `<div className="absolute bottom-1 right-1 z-20">`). Add a new sibling block immediately before it (so "+" sits to the left of the trash icon, both host-only):

```tsx
      {isHost && (
        <div className="absolute bottom-1 right-9 z-20">
          <button
            type="button"
            onClick={() => notebook ? setShowStylePopup((v) => !v) : onInsertPage?.(pageNumber)}
            title="Sahifa qo'shish"
            className="flex items-center justify-center rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm transition-colors hover:bg-indigo-50 hover:text-indigo-500"
          >
            <Plus size={12} />
          </button>
          {showStylePopup && notebook && (
            <div className="absolute bottom-8 right-0 flex flex-col gap-1 rounded-xl bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "grid"); }}
                title="Katakli"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Grid3x3 size={14} /> Katakli
              </button>
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "lined"); }}
                title="Yo'l-yo'l"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <AlignJustify size={14} /> Yo'l-yo'l
              </button>
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "plain"); }}
                title="Naqshsiz"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Square size={14} /> Naqshsiz
              </button>
            </div>
          )}
        </div>
      )}
```

`notebook` is already an existing destructured prop on this component (`notebook = false` — see the function signature) — clicking "+" on a PDF page (`notebook === false`) calls `onInsertPage?.(pageNumber)` directly with no style and no popup; clicking it on a notebook page toggles the 3-option style popup, and each option calls `onInsertPage?.(pageNumber, style)` with its own style.

Add `Grid3x3, AlignJustify, Square` to this file's top `lucide-react` import (find the existing import line starting with `import { AlignCenter, AlignLeft, ...} from "lucide-react";` and add these three names to the list — `Plus` is already imported).

- [ ] **Step 6: Pass `onInsertPage` from the parent's `ClassroomPdfPage` invocation**

Find where `ClassroomPdfPage` is invoked (search for the existing `onRemovePage={(pageNumber) => onRemovePage?.(paneMode, pageNumber, paneIndex === 1 ? "right" : "left")}` line) and add, right after it:

```tsx
                    onInsertPage={(pageNumber, style) => {
                      const pane = paneIndex === 1 ? "right" : "left";
                      if (style) onInsertNotebookPage?.(pageNumber, style, pane);
                      else onInsertPdfPage?.(pageNumber, pane);
                    }}
```

- [ ] **Step 7: Compute each page's style from `notebookPageStyles` instead of the removed global prop**

Find the `notebookStyle={notebookStyle}` line passed to `ClassroomPdfPage` (same invocation block as Step 6) and change it to:

```tsx
                    notebookStyle={notebookPageStyles[pageNumber] ?? "grid"}
```

- [ ] **Step 8: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): add per-page add button (PDF library insert, notebook style popup)"
```

---

## Task 7: Wire Props Through Host and Student Pages, Remove Global Style Picker

**Files:**
- Modify: `apps/frontend/src/pages/ClassroomHostPage.tsx`
- Modify: `apps/frontend/src/pages/ClassroomStudentPage.tsx`

**Interfaces:**
- Consumes: `state.notebookPageStyles`, `hostActions.insertNotebookPage` (Task 5), `notebookPageStyles`/`onInsertPdfPage`/`onInsertNotebookPage` props (Task 6)

- [ ] **Step 1: Add insert-flow state to the host page**

In `apps/frontend/src/pages/ClassroomHostPage.tsx`, find the existing `pageSelectAsset`/`attaching` state declarations (search for `const [attaching, setAttaching] = useState(false);`) and add, right after it:

```ts
  const [insertAfterPageIndex, setInsertAfterPageIndex] = useState<number | null>(null);
```

This tracks whether the currently-open library-select flow is a "+"-triggered insert (non-null) or the original attach flow (`null`) — both flows reuse the same `pdfLibraryOpen`/`pageSelectAsset` modal state, distinguished by this flag.

- [ ] **Step 2: Add a `handleInsertPdfPage` entry point and update `handleAttachPages` to branch on it**

Find `handleAttachPages` (search for `const handleAttachPages = async (pageNumbers: number[]) => {`) and replace its body to branch between the two REST calls:

```ts
  const handleAttachPages = async (pageNumbers: number[]) => {
    if (!id || !pageSelectAsset) return;
    setAttaching(true);
    try {
      if (insertAfterPageIndex !== null) {
        await apiInsertClassPdfPages(id, pageSelectAsset.id, pageNumbers, insertAfterPageIndex);
        toast.success("Sahifa qo'shildi");
      } else {
        await apiAttachClassPdf(id, pageSelectAsset.id, pageNumbers);
        toast.success("PDF qo'shildi");
      }
      setPageSelectAsset(null);
      setInsertAfterPageIndex(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "PDF qo'shishda xatolik");
    } finally {
      setAttaching(false);
    }
  };

  // "+" tugmasi bosilganda: kutubxona tanlash oqimini INSERT rejimida ochadi
  // (attachPdfFromLibrary'dagi "butun sessiyani almashtirish" rejimidan farqli).
  const handleInsertPdfPage = (afterPageIndex: number) => {
    setInsertAfterPageIndex(afterPageIndex);
    setPdfLibraryOpen(true);
  };
```

Add `apiInsertClassPdfPages` to this file's existing import from `../api/classroom`.

- [ ] **Step 3: Reset `insertAfterPageIndex` when the library flow is closed without confirming**

Find the `ClassroomPdfLibraryModal`'s `onClose` prop (search for `{pdfLibraryOpen && (` then `onClose={() => setPdfLibraryOpen(false)}`) and change it to also clear the insert flag:

```tsx
          onClose={() => { setPdfLibraryOpen(false); setInsertAfterPageIndex(null); }}
```

Find the `PdfPageSelectModal`'s `onClose` prop (search for `{pageSelectAsset && (` then `onClose={() => setPageSelectAsset(null)}`) and change it the same way:

```tsx
          onClose={() => { setPageSelectAsset(null); setInsertAfterPageIndex(null); }}
```

(The `onBack` prop, which returns to the library list rather than closing entirely, does NOT need this reset — the user is still mid-flow and `insertAfterPageIndex` should persist across "pick a different file.")

- [ ] **Step 4: Pass the new props on the host page's `ClassroomPdfViewer`**

Find the `<ClassroomPdfViewer` usage (search for the existing `notebookPageCount={state.notebookPageCount}` line, right after `hostSplitRatio={state.splitRatio}`) and add, right after it:

```tsx
          notebookPageStyles={state.notebookPageStyles}
          onInsertPdfPage={(afterPageIndex) => handleInsertPdfPage(afterPageIndex)}
          onInsertNotebookPage={(afterPageIndex, style, pane) => hostActions.insertNotebookPage(afterPageIndex, style, pane)}
```

Find and delete the existing `notebookStyle={state.notebookStyle}` line from the same `<ClassroomPdfViewer` invocation (it no longer exists on `ClassroomState` after Task 5).

- [ ] **Step 5: Delete the global "Daftar: ..." menu items**

Find the `ClassroomCallBarMenu`'s `items` array (search for `key: "notebook-grid",`) and delete all three entries (`notebook-grid`, `notebook-lined`, `notebook-plain`) — from `{ key: "notebook-grid",` through the closing `},` of the `notebook-plain` entry.

Run `grep -n "Grid3x3\|AlignJustify\|Square\|Check" apps/frontend/src/pages/ClassroomHostPage.tsx` afterward — if `Grid3x3`, `AlignJustify`, or `Square` are no longer referenced anywhere else in this file, remove them from the top `lucide-react` import line. Leave `Check` if it's still used elsewhere in the file (check before removing — this codebase uses `Check` in multiple icon contexts).

- [ ] **Step 6: Pass `notebookPageStyles` on the student page**

In `apps/frontend/src/pages/ClassroomStudentPage.tsx`, find the existing `notebookPageCount={state.notebookPageCount}` line and add, right after it:

```tsx
          notebookPageStyles={state.notebookPageStyles}
```

Find and delete the existing `notebookStyle={state.notebookStyle}` line from the same `<ClassroomPdfViewer` invocation.

(No `onInsertPdfPage`/`onInsertNotebookPage` here — students never see the "+" button at all, since `ClassroomPdfViewer`'s `isHost` prop is `false` on the student page, which already gates its rendering in Task 6.)

- [ ] **Step 7: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 8: Manual verification in the browser**

Run `npm run dev:backend` and `npm run dev:frontend`. As the teacher, open a classroom session with a multi-page PDF attached. Confirm a small "+" icon appears next to the trash icon at the bottom of each page. Click it on a PDF page — confirm the library picker opens, pick a different file (or the same one), select pages, confirm — the new page(s) should appear immediately after the page you clicked "+" under, with later pages and their strokes renumbered up, and the change should sync live to a student tab. Switch to notebook mode, click "+" — confirm a small popup with 3 style options appears, pick one — a new blank notebook page should appear right after the clicked page, in the chosen style, with `notebookPageCount` incrementing for both teacher and student. Confirm the "⋮" overflow menu no longer has the "Daftar: Katakli/Yo'l-yo'l/Naqshsiz" rows. Confirm existing notebook pages keep displaying whatever style they had before this feature shipped (fallback to the old session-wide value).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/ClassroomHostPage.tsx apps/frontend/src/pages/ClassroomStudentPage.tsx
git commit -m "feat(classroom): wire page-insert props into host and student pages, remove global notebook style picker"
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

Manual end-to-end check (already covered in Task 7 Step 8, repeat here as a final pass):
- Teacher adds a PDF page from a different library asset mid-lesson → students see it appear live at the correct position, later pages and their strokes correctly renumber up.
- Teacher adds a notebook page with a chosen style → `notebookPageCount` increments, the new page shows the chosen style, later pages' styles/strokes correctly renumber up.
- The global "⋮" notebook-style menu items are gone; existing pages retain their pre-feature style via the `notebookPageStyles[page] ?? notebookStyle ?? 'grid'` fallback.
- Replaying a lesson that included a page insertion shows the page appearing at the correct point in the timeline, in the correct style.
- Existing zoom/scroll/stroke/splitRatio/page-removal sync is unaffected by this diff.
