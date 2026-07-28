# Classroom Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the classroom board's current page-scoped "pop the last stroke" undo with a full command-history undo/redo system covering every annotation action (add/erase/transform/style/text-edit/reorder a stroke; remove/insert a page) in one shared, cross-mode, time-ordered history, plus a new redo capability.

**Architecture:** A single `session.undoStack`/`session.redoStack` (in-memory, per live session) holds `ClassroomUndoEntry` records, each carrying its own `mode`, `page`, and `before`/`after` inverse data. Every existing mutation method in `classroom.service.ts` pushes one entry right before it broadcasts. New `undo(sessionId, userId)`/`redo(sessionId, userId)` service methods pop the shared stack, dispatch to a pure inverse-application function per entry type (mirroring the existing `removePageFromSession`/`insertPdfPagesIntoSession` pure-function pattern in `classroom.logic.ts`), and broadcast a single `board:undo`/`board:redo` event the frontend applies via matching reducers. The frontend's `Ctrl+Z`/`Ctrl+Shift+Z` hotkeys and a new toolbar Redo button call these with no page/mode arguments — the entry itself carries where to jump.

**Tech Stack:** NestJS, Socket.IO, React, TypeScript, Jest.

## Global Constraints

- **One shared history, not one per mode.** Confirmed with the user via a concrete example: draw on a PDF page, switch to notebook, draw there, then press undo twice — the first undo removes the notebook stroke, the second removes the PDF stroke. `session.undoStack`/`session.redoStack` are single arrays holding entries from both modes, ordered by when they happened, not two separate per-mode stacks.
- `Ctrl+Z`/`Ctrl+Shift+Z` and the toolbar Undo/Redo buttons take **no page or mode argument** — the popped entry's own `mode`/`page` fields tell the backend and frontend where to apply the inverse and where to jump the view.
- A new committed action **clears the entire redo stack** (both modes' entries), matching standard editor behavior — never just the entries matching the new action's mode.
- **`stroke:undo` is an existing wire event name already used by TWO unrelated things**: the old page-scoped `undo()` method (being replaced by this plan) and the still-untouched `eraseStroke()` method (the stroke-eraser tool, unrelated to this feature). This plan does not touch `eraseStroke()`'s broadcast — it keeps emitting `'stroke:undo'` exactly as today. Only the OLD `undo()` method's use of that event name goes away, replaced by the new `board:undo` event. Do not confuse the two, and do not rename or touch anything in `eraseStroke()`.
- `splitStroke` (pixel-eraser cut) is explicitly **not** undo-tracked in this plan — it remains outside the command history entirely, matching how it was never covered by the old `undo()` either.
- Undo/redo stacks are in-memory only, never added to `ClassroomSnapshot`/`ClassroomBoardSnapshot`, never persisted to Postgres. Max 100 entries total (oldest dropped on overflow when pushing past the limit).
- All new user-facing strings (tooltips) are in Uzbek, matching this codebase's existing tone.
- No collapsing/coalescing of rapid repeated same-type actions — every committed action gets its own entry.

---

## File Structure

- Modify `apps/backend/src/classroom/classroom.types.ts`: add `ClassroomUndoActionType`, `ClassroomUndoEntry` types; add `undoStack`/`redoStack` to `ClassroomSession`.
- Modify `apps/backend/src/classroom/classroom.logic.ts`: add `pushUndoEntry` helper and one pure inverse-application function per undo-entry type.
- Modify `apps/backend/src/classroom/classroom.logic.spec.ts`: tests for the new pure functions.
- Modify `apps/backend/src/classroom/classroom.service.ts`: add one `pushUndoEntry` call to each of `stroke`, `moveStroke`, `updateTextStroke`, `updateShapeStroke`, `eraseStroke`, `reorderStroke`, `removePage`, `insertNotebookPage`, `insertPdfPagesFromLibrary`; replace `undo` method entirely with the new stack-based `undo`/`redo` pair.
- Modify `apps/backend/src/classroom/classroom.service.spec.ts`: rewrite the existing undo test, add new tests for `undo`/`redo` and recording behavior.
- Modify `apps/backend/src/classroom/classroom.gateway.ts`: replace `host:undo` handler's call shape, add `host:redo` handler.
- Modify `apps/frontend/src/hooks/classroomReducers.ts`: add `applyBoardUndo`/`applyBoardRedo` reducers.
- Modify `apps/frontend/src/hooks/useClassroomSession.ts`: add `socket.on("board:undo"/"board:redo", ...)`, replace `hostActions.undo` signature, add `hostActions.redo`.
- Modify `apps/frontend/src/pages/ClassroomHostPage.tsx`: replace the `mod+z` hotkey call, add `mod+shift+z` hotkey, update `onUndo` prop wiring, add `onRedo` prop.
- Modify `apps/frontend/src/components/classroom/ClassroomToolbar.tsx`: add a Redo button next to Undo, rename icons per Global Constraints.

---

## Task 1: Backend Data Model and Stroke-Level Inverse Logic

**Files:**
- Modify: `apps/backend/src/classroom/classroom.types.ts`
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Test: `apps/backend/src/classroom/classroom.logic.spec.ts`

**Interfaces:**
- Consumes: none
- Produces: `ClassroomUndoActionType`, `ClassroomUndoEntry` types; `session.undoStack`/`session.redoStack` fields; pure functions `pushUndoEntry(session: ClassroomSession, entry: Omit<ClassroomUndoEntry, never>): void`, `applyStrokeAddInverse`, `applyStrokeEraseInverse`, `applyStrokeTransformInverse`, `applyStrokeStyleInverse`, `applyStrokeTextInverse`, `applyStrokeReorderInverse` — each `(session: ClassroomSession, mode: ClassroomBoardMode, page: number, data: unknown, direction: 'undo' | 'redo') => void` — consumed by Task 2 (page-level entries use the same `pushUndoEntry`) and Task 3 (service methods call `pushUndoEntry`; the new `undo`/`redo` service methods call these inverse functions).

- [ ] **Step 1: Write failing tests for the type shapes and `pushUndoEntry`**

Read `apps/backend/src/classroom/classroom.logic.spec.ts`'s `makeSession`/`makeStroke` fixture helpers (top of file) to match conventions, then add:

```ts
describe('pushUndoEntry', () => {
  it('pushes an entry onto session.undoStack and clears redoStack', () => {
    const session = makeSession();
    session.redoStack = [{ type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke() } }];

    pushUndoEntry(session, { type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke() } });

    expect(session.undoStack).toHaveLength(1);
    expect(session.redoStack).toEqual([]);
  });

  it('drops the oldest entry once the stack exceeds 100 entries', () => {
    const session = makeSession();
    session.undoStack = Array.from({ length: 100 }, (_, i) => ({
      type: 'stroke:add' as const, mode: 'pdf' as const, page: 1, pane: 'left' as const,
      before: null, after: { stroke: makeStroke({ id: `s-${i}` }) },
    }));

    pushUndoEntry(session, { type: 'stroke:add', mode: 'pdf', page: 1, pane: 'left', before: null, after: { stroke: makeStroke({ id: 's-new' }) } });

    expect(session.undoStack).toHaveLength(100);
    expect(session.undoStack[0].after).toMatchObject({ stroke: { id: 's-1' } }); // s-0 dropped
    expect(session.undoStack[99].after).toMatchObject({ stroke: { id: 's-new' } });
  });
});
```

- [ ] **Step 2: Write failing tests for each stroke-level inverse function**

```ts
describe('applyStrokeAddInverse', () => {
  it('undo removes the added stroke by id', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1' });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeAddInverse(session, 'pdf', 1, { stroke }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([]);
  });

  it('redo re-adds the stroke', () => {
    const session = makeSession();
    strokeMapFor(session, 'pdf').set(1, []);
    const stroke = makeStroke({ id: 's1' });

    applyStrokeAddInverse(session, 'pdf', 1, { stroke }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([stroke]);
  });
});

describe('applyStrokeEraseInverse', () => {
  it('undo re-inserts the erased stroke at its original index', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s1]); // s2 already erased, was at index 1

    applyStrokeEraseInverse(session, 'pdf', 1, { stroke: s2, index: 1 }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([s1, s2]);
  });

  it('redo erases the stroke again by id', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s1, s2]);

    applyStrokeEraseInverse(session, 'pdf', 1, { stroke: s2, index: 1 }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([s1]);
  });
});

describe('applyStrokeTransformInverse', () => {
  it('undo restores the stroke\'s prior points/rotation', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', points: [0.5, 0.5, 0.6, 0.6], rotation: 45 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTransformInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { points: [0.1, 0.1, 0.2, 0.2], rotation: 0 },
      after: { points: [0.5, 0.5, 0.6, 0.6], rotation: 45 },
    }, 'undo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.points).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect(result.rotation).toBe(0);
  });

  it('redo re-applies the post-gesture points/rotation', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', points: [0.1, 0.1, 0.2, 0.2], rotation: 0 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTransformInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { points: [0.1, 0.1, 0.2, 0.2], rotation: 0 },
      after: { points: [0.5, 0.5, 0.6, 0.6], rotation: 45 },
    }, 'redo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.points).toEqual([0.5, 0.5, 0.6, 0.6]);
    expect(result.rotation).toBe(45);
  });
});

describe('applyStrokeStyleInverse', () => {
  it('undo restores the stroke\'s prior style fields, leaving unrelated fields untouched', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 's1', color: '#ff0000', width: 4 });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeStyleInverse(session, 'pdf', 1, {
      strokeId: 's1',
      before: { color: '#0000ff' },
      after: { color: '#ff0000' },
    }, 'undo');

    const result = strokeMapFor(session, 'pdf').get(1)!.find((x) => x.id === 's1')!;
    expect(result.color).toBe('#0000ff');
    expect(result.width).toBe(4); // untouched
  });
});

describe('applyStrokeTextInverse', () => {
  it('undo removes a newly-created text stroke when before is null', () => {
    const session = makeSession();
    const stroke = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    strokeMapFor(session, 'pdf').set(1, [stroke]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before: null, after: stroke }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)).toEqual([]);
  });

  it('undo restores the full prior stroke when editing existing text', () => {
    const session = makeSession();
    const before = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    const after = makeStroke({ id: 't1', tool: 'text', text: 'Salom dunyo' });
    strokeMapFor(session, 'pdf').set(1, [after]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before, after }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)![0].text).toBe('Salom');
  });

  it('redo re-applies the committed text stroke', () => {
    const session = makeSession();
    const before = makeStroke({ id: 't1', tool: 'text', text: 'Salom' });
    const after = makeStroke({ id: 't1', tool: 'text', text: 'Salom dunyo' });
    strokeMapFor(session, 'pdf').set(1, [before]);

    applyStrokeTextInverse(session, 'pdf', 1, { strokeId: 't1', before, after }, 'redo');

    expect(strokeMapFor(session, 'pdf').get(1)![0].text).toBe('Salom dunyo');
  });
});

describe('applyStrokeReorderInverse', () => {
  it('undo restores the prior stroke order', () => {
    const session = makeSession();
    const s1 = makeStroke({ id: 's1' });
    const s2 = makeStroke({ id: 's2' });
    strokeMapFor(session, 'pdf').set(1, [s2, s1]); // reordered state

    applyStrokeReorderInverse(session, 'pdf', 1, { before: { order: ['s1', 's2'] }, after: { order: ['s2', 's1'] } }, 'undo');

    expect(strokeMapFor(session, 'pdf').get(1)!.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — none of `pushUndoEntry`, `applyStrokeAddInverse`, `applyStrokeEraseInverse`, `applyStrokeTransformInverse`, `applyStrokeStyleInverse`, `applyStrokeTextInverse`, `applyStrokeReorderInverse` exist yet.

- [ ] **Step 4: Add the types**

In `apps/backend/src/classroom/classroom.types.ts`, add near the top (after `ClassroomStroke`):

```ts
export type ClassroomUndoActionType =
  | 'stroke:add' | 'stroke:erase'
  | 'stroke:transform'
  | 'stroke:style'
  | 'stroke:text'
  | 'stroke:reorder'
  | 'page:remove' | 'page:insert';

// Har bir tugallangan (commit qilingan) harakat — bekor qilish/qaytarish
// uchun yetarli "before"/"after" ma'lumot bilan. mode har bir yozuvda
// alohida saqlanadi, chunki tarix ikkala board mode (pdf/notebook) uchun
// UMUMIY — undo joriy ko'rinayotgan moddan mustaqil ravishda eng oxirgi
// harakatni bekor qiladi, u qaysi mode'ga tegishli bo'lishidan qat'i nazar.
export interface ClassroomUndoEntry {
  type: ClassroomUndoActionType;
  mode: ClassroomBoardMode;
  page: number;
  pane: 'left' | 'right';
  // Faqat stroke-darajasidagi turlar (stroke:add/erase/transform/style/
  // text/reorder emas — reorder butun sahifa tartibiga tegishli, alohida
  // strokeId kerak emas) uchun to'ldiriladi. page:remove/page:insert
  // uchun undefined qoladi. Bu maydon dispatch vaqtida "qaysi chizmaga
  // tegish kerak" degan savolni before/after payload shaklidan mustaqil
  // ravishda javob beradi — har bir turning before/after shakli har xil
  // (ba'zilarida to'liq stroke, ba'zilarida faqat patch), shuning uchun
  // strokeId'ni alohida, barqaror joyda saqlash ancha soddaroq.
  strokeId?: string;
  before: unknown;
  after: unknown;
}
```

Add to the `ClassroomSession` interface, right after `notebookPageStyles?: Record<number, ClassroomNotebookStyle>;`:

```ts
  // Yagona, ikkala board mode (pdf/notebook) uchun UMUMIY, vaqt bo'yicha
  // tartiblangan undo/redo tarixi — har bir yozuv o'zining mode'ini olib
  // yuradi (ClassroomUndoEntry.mode), shuning uchun undo joriy
  // ko'rinayotgan mode'dan mustaqil ravishda har doim eng oxirgi
  // harakatni (u qaysi mode'ga tegishli bo'lishidan qat'i nazar) bekor
  // qiladi. In-memory only — snapshot/DB'ga hech qachon yozilmaydi.
  undoStack?: ClassroomUndoEntry[];
  redoStack?: ClassroomUndoEntry[];
```

- [ ] **Step 5: Implement `pushUndoEntry`**

In `apps/backend/src/classroom/classroom.logic.ts`, add near the top (after the imports, before `activeStrokeMap`):

```ts
const MAX_UNDO_STACK = 100;

// Har bir tugallangan harakatni umumiy undoStack'ga qo'shadi va
// redoStack'ni to'liq tozalaydi (yangi harakat butun redo tarixini
// bekor qiladi — standart tahrirchi xatti-harakati). Stack 100 yozuvdan
// oshsa eng eskisi tashlanadi.
export function pushUndoEntry(session: ClassroomSession, entry: ClassroomUndoEntry): void {
  if (!session.undoStack) session.undoStack = [];
  session.undoStack.push(entry);
  if (session.undoStack.length > MAX_UNDO_STACK) session.undoStack.shift();
  session.redoStack = [];
}
```

Add `ClassroomUndoEntry` to this file's existing import from `./classroom.types`.

- [ ] **Step 6: Implement the stroke-level inverse functions**

Add these six functions in `apps/backend/src/classroom/classroom.logic.ts`, after `pushUndoEntry`:

```ts
// stroke:add'ning teskarisi — undo qo'shilgan chizmani ID bo'yicha
// o'chiradi, redo uni qayta qo'shadi.
export function applyStrokeAddInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { stroke: ClassroomStroke }, direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    map.set(page, list.filter((s) => s.id !== data.stroke.id));
  } else {
    map.set(page, [...list, data.stroke]);
  }
}

// stroke:erase'ning teskarisi — undo o'chirilgan chizmani ASL joyiga
// (index) qaytaradi (qatlam tartibi saqlanishi uchun), redo uni yana
// o'chiradi.
export function applyStrokeEraseInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { stroke: ClassroomStroke; index: number }, direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    const next = [...list];
    next.splice(data.index, 0, data.stroke);
    map.set(page, next);
  } else {
    map.set(page, list.filter((s) => s.id !== data.stroke.id));
  }
}

// stroke:transform'ning teskarisi — bitta sudrab-ko'chirish/resize/
// aylantirish gesture'ining oldingi/keyingi points+rotation+textBox
// o'lchamlarini ID bo'yicha qayta o'rnatadi.
export function applyStrokeTransformInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: {
    strokeId: string;
    before: { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number };
    after: { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number };
  },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const idx = list.findIndex((s) => s.id === data.strokeId);
  if (idx === -1) return;
  const target = direction === 'undo' ? data.before : data.after;
  list[idx] = { ...list[idx], points: [...target.points], rotation: target.rotation, textBoxWidth: target.textBoxWidth, textBoxHeight: target.textBoxHeight };
}

// stroke:style'ning teskarisi — faqat o'zgargan maydonlarni (rang,
// shrift, shape uslubi va h.k.) qisman qo'llaydi, qolganlariga tegmaydi.
export function applyStrokeStyleInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { strokeId: string; before: Partial<ClassroomStroke>; after: Partial<ClassroomStroke> },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const idx = list.findIndex((s) => s.id === data.strokeId);
  if (idx === -1) return;
  const patch = direction === 'undo' ? data.before : data.after;
  list[idx] = { ...list[idx], ...patch };
}

// stroke:text'ning teskarisi — bitta matn-tahrirlash seansining
// (ochilib-yopilishi) to'liq oldingi/keyingi holatini qo'llaydi. before
// null bo'lsa (yangi matn yaratilgan edi), undo shu chizmani butunlay
// o'chiradi.
export function applyStrokeTextInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { strokeId: string; before: ClassroomStroke | null; after: ClassroomStroke },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    if (data.before === null) {
      map.set(page, list.filter((s) => s.id !== data.strokeId));
    } else {
      map.set(page, list.map((s) => s.id === data.strokeId ? data.before! : s));
    }
  } else {
    const exists = list.some((s) => s.id === data.strokeId);
    map.set(page, exists ? list.map((s) => s.id === data.strokeId ? data.after : s) : [...list, data.after]);
  }
}

// stroke:reorder'ning teskarisi — sahifadagi chizmalar massivini
// belgilangan ID tartibiga qayta quradi (front/back/forward/backward
// amalining oldingi/keyingi to'liq tartibi saqlangan).
export function applyStrokeReorderInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { before: { order: string[] }; after: { order: string[] } },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const targetOrder = direction === 'undo' ? data.before.order : data.after.order;
  const byId = new Map(list.map((s) => [s.id, s]));
  const reordered = targetOrder.map((id) => byId.get(id)).filter((s): s is ClassroomStroke => s !== undefined);
  map.set(page, reordered);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the new ones)

- [ ] **Step 8: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/classroom/classroom.types.ts apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.logic.spec.ts
git commit -m "feat(classroom): add undo/redo data model and stroke-level inverse logic"
```

---

## Task 2: Page-Level Inverse Logic

**Files:**
- Modify: `apps/backend/src/classroom/classroom.logic.ts`
- Test: `apps/backend/src/classroom/classroom.logic.spec.ts`

**Interfaces:**
- Consumes: `ClassroomUndoEntry`, `pushUndoEntry` (Task 1), `removePageFromSession`/`insertPdfPagesIntoSession`/`insertNotebookPageIntoSession` (existing)
- Produces: `applyPageRemoveInverse(session: ClassroomSession, mode: ClassroomBoardMode, data: { pageIndex: number; page: ClassroomPageSnapshot }, direction: 'undo' | 'redo'): void`, `applyPageInsertInverse(session: ClassroomSession, mode: ClassroomBoardMode, data: { afterPageIndex: number; pages?: string[]; style?: ClassroomNotebookStyle }, direction: 'undo' | 'redo'): void`, and the `ClassroomPageSnapshot` type — consumed by Task 3 (`removePage`/`insertNotebookPage`/`insertPdfPagesFromLibrary` capture this snapshot before mutating; the new `undo`/`redo` service methods dispatch to these functions).

**IMPORTANT:** Read `removePageFromSession`, `insertNotebookPageIntoSession`, and `insertPdfPagesIntoSession` in full (already in `classroom.logic.ts`) before writing this task's functions — the inverse functions below must reindex strokes/styles using the EXACT same shift direction and boundary conditions those functions already use (`page:remove`'s inverse is structurally an insert; `page:insert`'s inverse is structurally a remove).

- [ ] **Step 1: Write failing tests for the page-level inverse functions**

```ts
describe('applyPageRemoveInverse', () => {
  it('undo re-inserts a removed pdf page with its strokes at the original index', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'c.png']; // b.png was removed from index 1 (0-indexed)
    const map = strokeMapFor(session, 'pdf');
    map.set(1, [makeStroke({ id: 's-on-c' })]); // was page 2 (c.png) after removal

    applyPageRemoveInverse(session, 'pdf', {
      pageIndex: 2, // 1-indexed pageIndex that was removed
      page: { url: 'b.png', strokes: [makeStroke({ id: 's-on-b' })] },
    }, 'undo');

    expect(session.pdfPages).toEqual(['a.png', 'b.png', 'c.png']);
    const reindexed = strokeMapFor(session, 'pdf');
    expect(reindexed.get(2)).toEqual([makeStroke({ id: 's-on-b' })]);
    expect(reindexed.get(3)).toEqual([makeStroke({ id: 's-on-c' })]);
  });

  it('redo removes the page again via removePageFromSession', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png', 'c.png'];

    applyPageRemoveInverse(session, 'pdf', {
      pageIndex: 2,
      page: { url: 'b.png', strokes: [] },
    }, 'redo');

    expect(session.pdfPages).toEqual(['a.png', 'c.png']);
  });

  it('undo re-inserts a removed notebook page with its style', () => {
    const session = makeSession();
    session.notebookPageCount = 3;
    session.notebookPageStyles = { 1: 'grid', 2: 'plain' }; // page 2 (lined) was removed

    applyPageRemoveInverse(session, 'notebook', {
      pageIndex: 2,
      page: { strokes: [], notebookStyle: 'lined' },
    }, 'undo');

    expect(session.notebookPageCount).toBe(4);
    expect(session.notebookPageStyles).toEqual({ 1: 'grid', 2: 'lined', 3: 'plain' });
  });
});

describe('applyPageInsertInverse', () => {
  it('undo removes an inserted pdf page via removePageFromSession', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'x.png', 'b.png']; // x.png inserted after index 1 (0-indexed)

    applyPageInsertInverse(session, 'pdf', { afterPageIndex: 1, pages: ['x.png'] }, 'undo');

    expect(session.pdfPages).toEqual(['a.png', 'b.png']);
  });

  it('redo re-inserts the same pdf page(s) at the same position', () => {
    const session = makeSession();
    session.pdfPages = ['a.png', 'b.png'];

    applyPageInsertInverse(session, 'pdf', { afterPageIndex: 1, pages: ['x.png'] }, 'redo');

    expect(session.pdfPages).toEqual(['a.png', 'x.png', 'b.png']);
  });

  it('undo removes an inserted notebook page', () => {
    const session = makeSession();
    session.notebookPageCount = 4;

    applyPageInsertInverse(session, 'notebook', { afterPageIndex: 2, style: 'lined' }, 'undo');

    expect(session.notebookPageCount).toBe(3);
  });

  it('redo re-inserts the same notebook page with the same style', () => {
    const session = makeSession();
    session.notebookPageCount = 3;

    applyPageInsertInverse(session, 'notebook', { afterPageIndex: 2, style: 'lined' }, 'redo');

    expect(session.notebookPageCount).toBe(4);
    expect(session.notebookPageStyles?.[3]).toBe('lined');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: FAIL — `applyPageRemoveInverse`/`applyPageInsertInverse`/`ClassroomPageSnapshot` don't exist yet.

- [ ] **Step 3: Add `ClassroomPageSnapshot` to the types**

In `apps/backend/src/classroom/classroom.types.ts`, add right after `ClassroomUndoEntry`:

```ts
// page:remove undo-yozuvi uchun — o'chirilgan sahifani TO'LIQ tiklash
// (undo bosilganda) uchun yetarli ma'lumot: uning barcha chizmalari va
// (agar PDF bo'lsa) URL'i yoki (agar daftar bo'lsa) naqshi.
export interface ClassroomPageSnapshot {
  url?: string; // faqat pdf uchun
  notebookStyle?: ClassroomNotebookStyle; // faqat notebook uchun
  strokes: ClassroomStroke[];
}
```

- [ ] **Step 4: Implement `applyPageRemoveInverse`**

In `apps/backend/src/classroom/classroom.logic.ts`, add after `insertPdfPagesIntoSession`:

```ts
// page:remove'ning teskarisi. undo — o'chirilgan sahifani (URL/naqsh +
// chizmalari bilan) removePageFromSession'ning teskari yo'nalishida
// aynan o'sha 1-indexed pageIndex'ga qayta qo'yadi (keyingi sahifalar
// yuqoriga siljiydi, insertPdfPagesIntoSession/
// insertNotebookPageIntoSession bilan bir xil reindex mantiqi). redo —
// sahifani removePageFromSession orqali yana olib tashlaydi.
export function applyPageRemoveInverse(
  session: ClassroomSession, mode: ClassroomBoardMode,
  data: { pageIndex: number; page: ClassroomPageSnapshot }, direction: 'undo' | 'redo',
): void {
  if (direction === 'redo') {
    removePageFromSession(session, mode, data.pageIndex);
    return;
  }
  // undo: pageIndex (1-indexed) o'rniga qo'yish — insert funksiyalari
  // 0-indexed afterPageIndex kutadi, shuning uchun pageIndex - 1 = "shu
  // sahifadan OLDIN qo'yish nuqtasi" (Array.splice semantikasi bilan bir xil).
  const afterPageIndex = data.pageIndex - 1;
  if (mode === 'pdf') {
    insertPdfPagesIntoSession(session, [data.page.url!], afterPageIndex);
  } else {
    insertNotebookPageIntoSession(session, afterPageIndex, data.page.notebookStyle ?? 'grid');
  }
  // Qo'yilgan (bo'sh) sahifaga o'chirishdan oldingi chizmalarni qaytaramiz.
  const map = strokeMapFor(session, mode);
  map.set(data.pageIndex, data.page.strokes);
}

// page:insert'ning teskarisi. undo — qo'shilgan sahifani
// removePageFromSession orqali olib tashlaydi. redo — sahifani xuddi
// o'sha joyga (afterPageIndex) qayta qo'yadi — pdf uchun aynan o'sha
// URL(lar), notebook uchun aynan o'sha naqsh bilan (yangidan
// kutubxonadan olib bo'lmaydi, shuning uchun URL'lar entry'ning o'zida
// saqlanadi).
export function applyPageInsertInverse(
  session: ClassroomSession, mode: ClassroomBoardMode,
  data: { afterPageIndex: number; pages?: string[]; style?: ClassroomNotebookStyle }, direction: 'undo' | 'redo',
): void {
  if (direction === 'undo') {
    removePageFromSession(session, mode, data.afterPageIndex + 1);
    return;
  }
  if (mode === 'pdf') {
    insertPdfPagesIntoSession(session, data.pages ?? [], data.afterPageIndex);
  } else {
    insertNotebookPageIntoSession(session, data.afterPageIndex, data.style ?? 'grid');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.logic.spec.ts`
Expected: PASS (all tests including the new ones)

- [ ] **Step 6: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/classroom/classroom.types.ts apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.logic.spec.ts
git commit -m "feat(classroom): add page-level undo/redo inverse logic"
```

---

## Task 3: Wire Recording Into Existing Mutation Methods

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Test: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `pushUndoEntry`, `ClassroomUndoEntry`, `ClassroomPageSnapshot` (Tasks 1-2)
- Produces: every listed mutation method now pushes one `ClassroomUndoEntry` before broadcasting — consumed by Task 4 (the new `undo`/`redo` methods pop and apply these entries).

**IMPORTANT:** This task does NOT change any method's existing signature, validation, or broadcast payload — it only ADDS one `pushUndoEntry(...)` call to each method, right before that method's existing `this.recordHistoryEvent(...)`/`this.broadcaster.toRoom(...)` lines. Read each method in `classroom.service.ts` in full before editing it — some capture "before" state naturally (e.g. `moveStroke` needs the stroke's points BEFORE `updateStrokePosition` mutates them, so you must read the stroke first), others need the "before" state read out of the stroke list before the pure logic function runs.

- [ ] **Step 1: Write failing tests for undo-entry recording on each mutation method**

Read `apps/backend/src/classroom/classroom.service.spec.ts`'s `withPdf()` helper (search for `async function withPdf`) to match fixture conventions. This plan does not prescribe a public getter for `session.undoStack` — check whether `getHistoryEventsForTests` has a sibling you should add, or add one now: `getUndoStackForTests(sessionId: string): ClassroomUndoEntry[]` mirroring `getHistoryEventsForTests`'s exact shape (`return this.sessions.get(sessionId)?.undoStack ?? [];`), added to `classroom.service.ts` in this task's Step 3 below. Then add:

```ts
describe('undo entry recording', () => {
  it('stroke() pushes a stroke:add entry', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.5, 0.5] };

    service.stroke(sessionId, 'teacher-1', 1, stroke);

    const stack = service.getUndoStackForTests(sessionId);
    expect(stack.at(-1)).toMatchObject({ type: 'stroke:add', mode: 'pdf', page: 1, after: { stroke } });
  });

  it('moveStroke() pushes a stroke:transform entry with correct before/after points', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });

    service.moveStroke(sessionId, 'teacher-1', 1, 's1', 0.5, 0.5);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:transform');
    expect((entry.before as any).points).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect((entry.after as any).points[0]).toBeCloseTo(0.5);
  });

  it('updateTextStroke() pushes a stroke:text entry with before=null for a brand-new text stroke', async () => {
    const { service, sessionId } = await withPdf();
    const stroke = { id: 't1', tool: 'text' as const, color: '#000', width: 2, points: [0.2, 0.2], text: 'Salom', textBoxWidth: 100, textBoxHeight: 40 };

    service.updateTextStroke(sessionId, 'teacher-1', 1, stroke);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:text');
    expect(entry.before).toBeNull();
    expect((entry.after as any).text).toBe('Salom');
  });

  it('updateTextStroke() pushes before= the prior stroke when editing existing text', async () => {
    const { service, sessionId } = await withPdf();
    const original = { id: 't1', tool: 'text' as const, color: '#000', width: 2, points: [0.2, 0.2], text: 'Salom', textBoxWidth: 100, textBoxHeight: 40 };
    service.updateTextStroke(sessionId, 'teacher-1', 1, original);

    const edited = { ...original, text: 'Salom dunyo' };
    service.updateTextStroke(sessionId, 'teacher-1', 1, edited);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect((entry.before as any).text).toBe('Salom');
    expect((entry.after as any).text).toBe('Salom dunyo');
  });

  it('updateShapeStroke() pushes a stroke:style entry', async () => {
    const { service, sessionId } = await withPdf();
    const shape = { id: 'r1', tool: 'rectangle' as const, color: '#000', width: 2, points: [0.1, 0.1, 0.3, 0.3] };
    service.stroke(sessionId, 'teacher-1', 1, shape);

    service.updateShapeStroke(sessionId, 'teacher-1', 1, { ...shape, color: '#f00' });

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:style');
    expect((entry.before as any).color).toBe('#000');
    expect((entry.after as any).color).toBe('#f00');
  });

  it('eraseStroke() pushes a stroke:erase entry with the stroke and its original index', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    service.eraseStroke(sessionId, 'teacher-1', 1, 's2');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:erase');
    expect((entry.before as any).index).toBe(1);
    expect((entry.before as any).stroke.id).toBe('s2');
  });

  it('reorderStroke() pushes a stroke:reorder entry with full before/after order', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    service.reorderStroke(sessionId, 'teacher-1', 1, ['s1'], 'front');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('stroke:reorder');
    expect((entry.before as any).order).toEqual(['s1', 's2']);
    expect((entry.after as any).order).toEqual(['s2', 's1']);
  });

  it('removePage() pushes a page:remove entry carrying the removed page\'s strokes', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 2, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });

    service.removePage(sessionId, 'teacher-1', 'pdf', 2);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:remove');
    expect((entry.before as any).pageIndex).toBe(2);
    expect((entry.before as any).page.strokes).toHaveLength(1);
  });

  it('insertNotebookPage() pushes a page:insert entry', async () => {
    const { service, sessionId } = await setup();

    service.insertNotebookPage(sessionId, 'teacher-1', 1, 'lined');

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:insert');
    expect(entry.mode).toBe('notebook');
    expect((entry.after as any).style).toBe('lined');
  });

  it('insertPdfPagesFromLibrary() pushes a page:insert entry carrying the resolved page URLs', async () => {
    const mediaLibrary = makeFakeMediaLibrary({ pages: ['p1.webp', 'p2.webp'], status: 'ready' });
    const { service, sessionId } = await setup(mediaLibrary);
    service.setPdfForTests(sessionId, 'dars.pdf', ['a.webp']);

    await service.insertPdfPagesFromLibrary(sessionId, 'teacher-1', 'teacher', 'asset-1', [1], 1);

    const entry = service.getUndoStackForTests(sessionId).at(-1)!;
    expect(entry.type).toBe('page:insert');
    expect(entry.mode).toBe('pdf');
    expect((entry.after as any).pages).toEqual(['p1.webp']);
  });

  it('a new action clears the redo stack', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.undo(sessionId, 'teacher-1'); // populates redoStack with 1 entry

    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    expect(service.getRedoStackForTests(sessionId)).toEqual([]);
  });
});
```

Note: the last test above (`'a new action clears the redo stack'`) calls `service.undo(sessionId, 'teacher-1')` (new no-arg signature, Task 4) and `service.getRedoStackForTests` (add alongside `getUndoStackForTests`) — this test will only pass once Task 4 lands; write it now but mark it `it.skip` if Task 4 isn't done yet, or move it to Task 4's own test file section if your workflow prefers strict TDD ordering per task. Either is acceptable — note your choice in the commit message.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `pushUndoEntry` calls don't exist in any mutation method yet, and `getUndoStackForTests`/`getRedoStackForTests` don't exist.

- [ ] **Step 3: Add the test-only stack getters**

In `apps/backend/src/classroom/classroom.service.ts`, find `getHistoryEventsForTests` (search for it) and add two sibling methods right after it:

```ts
  // Faqat testlar uchun — xotiradagi undo/redo steklarini to'g'ridan-to'g'ri o'qiydi.
  getUndoStackForTests(sessionId: string): ClassroomUndoEntry[] {
    return this.sessions.get(sessionId)?.undoStack ?? [];
  }

  getRedoStackForTests(sessionId: string): ClassroomUndoEntry[] {
    return this.sessions.get(sessionId)?.redoStack ?? [];
  }
```

Add `ClassroomUndoEntry` to this file's existing import from `./classroom.types` (the multi-line import block already listing `ClassroomBoardMode`, `ClassroomSession`, etc).

Add `pushUndoEntry` to this file's existing import from `./classroom.logic` (the multi-line import block already listing `removePageFromSession`, `insertPdfPagesIntoSession`, etc).

- [ ] **Step 4: Wire `stroke()` — push a `stroke:add` entry**

Find the `stroke` method (search for `stroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke,`). Add, right after the `if (!accepted) throw new Error('INVALID_STROKE');` line and before `const payload = { page, stroke, pane, mode };`:

```ts
    pushUndoEntry(s, { type: 'stroke:add', mode, page, pane, before: null, after: { stroke } });
```

- [ ] **Step 5: Wire `moveStroke()` — push a `stroke:transform` entry**

Find the `moveStroke` method. It currently reads: `const accepted = updateStrokePosition(s, page, strokeId, x, y, strokeMapFor(s, mode));`. You need the stroke's points BEFORE this call. Change the method body to capture the prior stroke first:

```ts
  moveStroke(sessionId: string, userId: string, page: number, strokeId: string, x: number, y: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === strokeId);
    const before = priorStroke ? { points: [...priorStroke.points], rotation: priorStroke.rotation, textBoxWidth: priorStroke.textBoxWidth, textBoxHeight: priorStroke.textBoxHeight } : null;
    const accepted = updateStrokePosition(s, page, strokeId, x, y, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    if (before) {
      const updated = map.get(page)!.find((item) => item.id === strokeId)!;
      const after = { points: [...updated.points], rotation: updated.rotation, textBoxWidth: updated.textBoxWidth, textBoxHeight: updated.textBoxHeight };
      pushUndoEntry(s, { type: 'stroke:transform', mode, page, pane, strokeId, before, after });
    }
    const payload = { page, strokeId, x, y, pane, mode };
    this.recordHistoryEvent(s, 'stroke:update', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:update', payload);
  }
```

- [ ] **Step 6: Wire `updateTextStroke()` — push a `stroke:text` entry**

Find the `updateTextStroke` method. Capture the prior stroke (or `null` if new) before calling `updateTextStrokeInSession`:

```ts
  updateTextStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : null;
    const accepted = updateTextStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:text', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] } });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:textUpdate', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:textUpdate', payload);
  }
```

Note: `updateTextStrokeInSession` only succeeds if the stroke already exists in the list (read `updateTextStroke` in `classroom.logic.ts` — it returns `false` if `index === -1`), so `before` will always be non-null in practice for THIS specific service method. A brand-new text stroke is actually created via `stroke()` (the `stroke:add` path, Step 4), not `updateTextStroke()` — the `before: null` case in `applyStrokeTextInverse` (Task 1) exists for symmetry/robustness but may not be reachable through this exact call site. Do not change `updateTextStrokeInSession`'s existing validation to "fix" this — it's an existing, working invariant unrelated to this plan.

- [ ] **Step 7: Wire `updateShapeStroke()` — push a `stroke:style` entry**

Find the `updateShapeStroke` method. Same pattern as Step 6:

```ts
  updateShapeStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : {};
    const accepted = updateShapeStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:style', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] } });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:shapeUpdate', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:shapeUpdate', payload);
  }
```

- [ ] **Step 8: Wire `eraseStroke()` — push a `stroke:erase` entry**

Find the `eraseStroke` method (NOT the old `undo` method — this is the stroke-eraser TOOL, unrelated feature per Global Constraints, but it DOES get undo-tracked per the design spec's `stroke:erase` type). Capture the stroke and its index BEFORE calling `eraseStrokeById`:

```ts
  eraseStroke(sessionId: string, userId: string, page: number, strokeId: string, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const list = map.get(page) ?? [];
    const index = list.findIndex((item) => item.id === strokeId);
    const erased = eraseStrokeById(s, page, strokeId, map);
    s.boardMode = previousMode;
    if (erased) {
      if (index !== -1) pushUndoEntry(s, { type: 'stroke:erase', mode, page, pane, before: { stroke: list[index], index }, after: null });
      const payload = { page, strokeId, pane, mode };
      this.recordHistoryEvent(s, 'stroke:undo', payload);
      this.broadcaster.toRoom(sessionId, 'stroke:undo', payload);
    }
  }
```

**Do not rename or otherwise touch the `'stroke:undo'` broadcast event name here** — see Global Constraints.

- [ ] **Step 9: Wire `reorderStroke()` — push a `stroke:reorder` entry**

Find the `reorderStroke` method. Capture the id order BEFORE calling `reorderStrokesInSession`:

```ts
  reorderStroke(
    sessionId: string, userId: string, page: number, strokeIds: string[],
    op: 'front' | 'back' | 'forward' | 'backward',
    mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const beforeOrder = (map.get(page) ?? []).map((item) => item.id);
    const accepted = reorderStrokesInSession(s, page, strokeIds, op, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    const afterOrder = (map.get(page) ?? []).map((item) => item.id);
    pushUndoEntry(s, { type: 'stroke:reorder', mode, page, pane, before: { order: beforeOrder }, after: { order: afterOrder } });
    const payload = { page, strokeIds, op, pane, mode };
    this.recordHistoryEvent(s, 'stroke:reorder', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:reorder', payload);
  }
```

- [ ] **Step 10: Wire `removePage()` — push a `page:remove` entry**

Find the `removePage` method. You must capture the FULL page snapshot (URL/style + strokes) BEFORE calling `removePageFromSession` (which mutates/reindexes everything). Change the method to:

```ts
  removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const map = strokeMapFor(s, mode);
    const pageSnapshot: ClassroomPageSnapshot = {
      url: mode === 'pdf' ? s.pdfPages[pageIndex - 1] : undefined,
      notebookStyle: mode === 'notebook' ? resolveNotebookPageStyle(s, pageIndex) : undefined,
      strokes: map.get(pageIndex) ?? [],
    };
    const ok = removePageFromSession(s, mode, pageIndex);
    if (!ok) throw new Error('INVALID_PAGE_REMOVAL');
    pushUndoEntry(s, { type: 'page:remove', mode, page: pageIndex, pane, before: { pageIndex, page: pageSnapshot }, after: null });
    const payload = { mode, pageIndex, pane };
    this.recordHistoryEvent(s, 'page:remove', payload);
    this.broadcaster.toRoom(s.id, 'page:remove', payload);
  }
```

Add `ClassroomPageSnapshot` and `resolveNotebookPageStyle` to this file's existing imports (`./classroom.types` and `./classroom.logic` respectively).

- [ ] **Step 11: Wire `insertNotebookPage()` — push a `page:insert` entry**

Find the `insertNotebookPage` method. Add right after the existing `if (!ok) throw new Error('INVALID_PAGE_INSERT');`:

```ts
    pushUndoEntry(s, { type: 'page:insert', mode: 'notebook', page: afterPageIndex + 1, pane, before: null, after: { afterPageIndex, style } });
```

- [ ] **Step 12: Wire `insertPdfPagesFromLibrary()` — push a `page:insert` entry**

Find the `insertPdfPagesFromLibrary` method. Add right after the existing `if (!ok) throw new ConflictException("Noto'g'ri qo'yish joyi");`:

```ts
    pushUndoEntry(s, { type: 'page:insert', mode: 'pdf', page: afterPageIndex + 1, pane: 'left', before: null, after: { afterPageIndex, pages: newPages } });
```

(This method has no `pane` parameter — it's always host-triggered on the primary/left pane, matching how the existing PDF-insert plan already established `pane: 'left'` as the implicit default for PDF operations.)

- [ ] **Step 13: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS for all tests except (if you chose to skip it) the redo-stack-clearing test that depends on Task 4's `undo()` signature — confirm every OTHER new test passes.

- [ ] **Step 14: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 15: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): record undo entries in all annotation mutation methods"
```

---

## Task 4: Rewrite `undo`/`redo` Service Methods and Gateway Handlers

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts`
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`
- Modify: `apps/backend/src/classroom/classroom.gateway.ts`

**Interfaces:**
- Consumes: `pushUndoEntry`, all inverse-application functions (Tasks 1-2), `session.undoStack`/`session.redoStack` populated by Task 3
- Produces: `ClassroomService.undo(sessionId: string, userId: string): void`, `ClassroomService.redo(sessionId: string, userId: string): void`, socket events `board:undo`/`board:redo` with payload `{ mode: ClassroomBoardMode; page: number; entryType: ClassroomUndoActionType; strokeId?: string; before?: unknown; after?: unknown }`, gateway handlers `host:undo` (signature changed) and `host:redo` (new) — consumed by Task 5 (frontend reducers pattern-match on `entryType`, read `strokeId` directly from the payload for stroke-level entries).

**IMPORTANT:** This task DELETES the old `undo(sessionId, userId, page, mode, pane)` method entirely and replaces it. The OLD `service.undo(sessionId, 'teacher-1', 1)` test at `classroom.service.spec.ts` (search for `'undo va clear broadcastlari'`) uses the OLD 3-argument signature and WILL fail to compile once you change the method signature — you must rewrite that specific test as part of this task, not just add new tests alongside it.

- [ ] **Step 1: Write failing tests for the new `undo`/`redo` methods**

First, find and DELETE the old test (search `classroom.service.spec.ts` for `it('undo va clear broadcastlari'`) — read it first to see its exact current content, then replace it with:

```ts
it('clear broadcast', async () => {
  const { service, events, sessionId } = await withPdf();
  service.clearPage(sessionId, 'teacher-1', 1);
  expect(events.at(-1)).toMatchObject({ event: 'page:clear', payload: { page: 1 } });
});
```

(This preserves the `clearPage` coverage that test also had, dropping only the now-invalid `service.undo(sessionId, 'teacher-1', 1)` call — `clearPage`'s own behavior is unrelated to this plan and must keep working.)

Then add a new `describe` block for the rewritten `undo`/`redo`, near the other stroke-related tests:

```ts
describe('undo/redo', () => {
  it('undo with an empty stack is a silent no-op', async () => {
    const { service, events, sessionId } = await withPdf();
    const before = events.length;

    service.undo(sessionId, 'teacher-1');

    expect(events.length).toBe(before);
  });

  it('undo pops the most recent entry regardless of mode, and broadcasts board:undo', async () => {
    const { service, events, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');

    service.undo(sessionId, 'teacher-1');

    expect(events.at(-1)).toMatchObject({ event: 'board:undo', payload: { mode: 'pdf', page: 1, entryType: 'stroke:add' } });
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.strokesByPage[1] ?? []).toEqual([]);
  });

  it('undo across modes: PDF stroke then notebook stroke, two undos remove notebook first then pdf', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 'pdf-s1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');
    service.stroke(sessionId, 'teacher-1', 1, { id: 'nb-s1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'notebook');

    service.undo(sessionId, 'teacher-1');
    let snap = service.hostJoin(sessionId, 'teacher-1', 'sock-r1');
    // After first undo (removes notebook stroke), switch view to notebook mode to check via a second stroke() call's map — instead, verify via the session's own stroke pools using a second undo + testing pdf stroke is still present after ONE undo.

    service.undo(sessionId, 'teacher-1');
    // After second undo, the pdf stroke should also be gone.
    snap = service.hostJoin(sessionId, 'teacher-1', 'sock-r2');
    expect(snap.strokesByPage[1] ?? []).toEqual([]);
  });

  it('undo jumps currentPage and boardMode to the entry\'s page/mode', async () => {
    const { service, sessionId } = await withPdf();
    service.setPage(sessionId, 'teacher-1', 3);
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] }, 'pdf');

    service.undo(sessionId, 'teacher-1');

    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.currentPage).toBe(1);
    expect(snap.boardMode).toBe('pdf');
  });

  it('redo re-applies the undone action and broadcasts board:redo', async () => {
    const { service, events, sessionId } = await withPdf();
    const stroke = { id: 's1', tool: 'pen' as const, color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] };
    service.stroke(sessionId, 'teacher-1', 1, stroke);
    service.undo(sessionId, 'teacher-1');

    service.redo(sessionId, 'teacher-1');

    expect(events.at(-1)).toMatchObject({ event: 'board:redo', payload: { mode: 'pdf', page: 1, entryType: 'stroke:add' } });
    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-refresh');
    expect(snap.strokesByPage[1]).toContainEqual(stroke);
  });

  it('redo with an empty redo stack is a silent no-op', async () => {
    const { service, events, sessionId } = await withPdf();
    const before = events.length;

    service.redo(sessionId, 'teacher-1');

    expect(events.length).toBe(before);
  });

  it('a new committed action after undo clears the redo stack', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 1, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    service.undo(sessionId, 'teacher-1');
    expect(service.getRedoStackForTests(sessionId)).toHaveLength(1);

    service.stroke(sessionId, 'teacher-1', 1, { id: 's2', tool: 'pen', color: '#f00', width: 3, points: [0.3, 0.3, 0.4, 0.4] });

    expect(service.getRedoStackForTests(sessionId)).toEqual([]);
  });

  it('undo requires host', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.undo(sessionId, 'stu-1')).toThrow();
  });

  it('redo requires host', async () => {
    const { service, sessionId } = await withPdf();
    expect(() => service.redo(sessionId, 'stu-1')).toThrow();
  });

  it('undo of a page:remove restores the page with its strokes', async () => {
    const { service, sessionId } = await withPdf();
    service.stroke(sessionId, 'teacher-1', 2, { id: 's1', tool: 'pen', color: '#f00', width: 3, points: [0.1, 0.1, 0.2, 0.2] });
    const pagesBefore = service.hostJoin(sessionId, 'teacher-1', 'sock-a').pages;
    service.removePage(sessionId, 'teacher-1', 'pdf', 2);

    service.undo(sessionId, 'teacher-1');

    const snap = service.hostJoin(sessionId, 'teacher-1', 'sock-b');
    expect(snap.pages).toEqual(pagesBefore);
    expect(snap.strokesByPage[2]).toHaveLength(1);
  });
});
```

If the earlier `'a new action clears the redo stack'` test in Task 3's own test additions was written as `it.skip`, un-skip it now (this task provides the `undo()` signature it depends on).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: FAIL — `service.undo(sessionId, 'teacher-1')` (2-arg) doesn't match the current 5-arg signature; `service.redo` doesn't exist.

- [ ] **Step 3: Replace the `undo` method and add `redo`**

In `apps/backend/src/classroom/classroom.service.ts`, find the existing `undo` method (search for `undo(sessionId: string, userId: string, page: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {`) and DELETE it entirely, replacing it with:

```ts
  // Undo/redo: yagona, ikkala board mode uchun UMUMIY tarixdan eng
  // oxirgi (yoki keyingi) harakatni oladi va uning teskarisini (yoki
  // o'ziniki) qo'llaydi — sahifa/panel qaysi bo'lishidan qat'i nazar.
  undo(sessionId: string, userId: string): void {
    const s = this.requireHost(sessionId, userId);
    const entry = s.undoStack?.pop();
    if (!entry) return;
    this.applyUndoEntry(s, entry, 'undo');
    if (!s.redoStack) s.redoStack = [];
    s.redoStack.push(entry);
    s.currentPage = entry.page;
    s.boardMode = entry.mode;
    const payload = { mode: entry.mode, page: entry.page, entryType: entry.type, strokeId: entry.strokeId, before: entry.before };
    this.recordHistoryEvent(s, 'board:undo', payload);
    this.broadcaster.toRoom(s.id, 'board:undo', payload);
  }

  redo(sessionId: string, userId: string): void {
    const s = this.requireHost(sessionId, userId);
    const entry = s.redoStack?.pop();
    if (!entry) return;
    this.applyUndoEntry(s, entry, 'redo');
    if (!s.undoStack) s.undoStack = [];
    s.undoStack.push(entry);
    s.currentPage = entry.page;
    s.boardMode = entry.mode;
    const payload = { mode: entry.mode, page: entry.page, entryType: entry.type, strokeId: entry.strokeId, after: entry.after };
    this.recordHistoryEvent(s, 'board:redo', payload);
    this.broadcaster.toRoom(s.id, 'board:redo', payload);
  }

  private applyUndoEntry(s: ClassroomSession, entry: ClassroomUndoEntry, direction: 'undo' | 'redo'): void {
    switch (entry.type) {
      case 'stroke:add':
        applyStrokeAddInverse(s, entry.mode, entry.page, entry.after as { stroke: ClassroomStroke }, direction);
        break;
      case 'stroke:erase':
        applyStrokeEraseInverse(s, entry.mode, entry.page, entry.before as { stroke: ClassroomStroke; index: number }, direction);
        break;
      case 'stroke:transform':
        applyStrokeTransformInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number },
          after: entry.after as { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number },
        }, direction);
        break;
      case 'stroke:style':
        applyStrokeStyleInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as Partial<ClassroomStroke>,
          after: entry.after as Partial<ClassroomStroke>,
        }, direction);
        break;
      case 'stroke:text':
        applyStrokeTextInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as ClassroomStroke | null,
          after: entry.after as ClassroomStroke,
        }, direction);
        break;
      case 'stroke:reorder':
        applyStrokeReorderInverse(s, entry.mode, entry.page, {
          before: entry.before as { order: string[] },
          after: entry.after as { order: string[] },
        }, direction);
        break;
      case 'page:remove':
        applyPageRemoveInverse(s, entry.mode, entry.before as { pageIndex: number; page: ClassroomPageSnapshot }, direction);
        break;
      case 'page:insert':
        applyPageInsertInverse(s, entry.mode, entry.after as { afterPageIndex: number; pages?: string[]; style?: ClassroomNotebookStyle }, direction);
        break;
    }
  }
```

Every `strokeId!` non-null assertion above is safe by construction: Task 3's `pushUndoEntry` calls for `stroke:transform`/`stroke:style`/`stroke:text` always set `strokeId` at the entry's top level (Steps 5-7), and no other entry type reads it here.

Add `applyStrokeAddInverse`, `applyStrokeEraseInverse`, `applyStrokeTransformInverse`, `applyStrokeStyleInverse`, `applyStrokeTextInverse`, `applyStrokeReorderInverse`, `applyPageRemoveInverse`, `applyPageInsertInverse` to this file's existing import from `./classroom.logic`. Add `ClassroomUndoEntry`, `ClassroomPageSnapshot` to the existing import from `./classroom.types` if not already added in Task 3.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- classroom.service.spec.ts`
Expected: PASS (all tests, including the rewritten old test and all new ones)

- [ ] **Step 5: Update the gateway handler**

In `apps/backend/src/classroom/classroom.gateway.ts`, find the `host:undo` handler (search for `@SubscribeMessage('host:undo')`) and replace it entirely:

```ts
  @SubscribeMessage('host:undo')
  undo(@MessageBody() body: BaseBody) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.undo(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:redo')
  redo(@MessageBody() body: BaseBody) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.redo(body.sessionId, user.sub);
    });
  }
```

- [ ] **Step 6: Verify backend builds and full suite passes**

Run: `npm run build --workspace=apps/backend && npm run test --workspace=apps/backend`
Expected: build exit `0`; all test suites pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts apps/backend/src/classroom/classroom.gateway.ts
git commit -m "feat(classroom): rewrite undo as shared cross-mode history, add redo"
```

---

## Task 5: Frontend Reducers

**Files:**
- Modify: `apps/frontend/src/hooks/classroomReducers.ts`

**Interfaces:**
- Consumes: `board:undo`/`board:redo` payload shape `{ mode: CsBoardMode; page: number; entryType: string; strokeId?: string; before?: unknown; after?: unknown }` (Task 4)
- Produces: `applyBoardUndo(s: ClassroomState, p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; before: unknown }): ClassroomState`, `applyBoardRedo(s: ClassroomState, p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; after: unknown }): ClassroomState` — consumed by Task 6 (`useClassroomSession.ts` socket listeners) and by `useClassroomReplay.ts`'s `REDUCERS` map (not modified by this plan — undo/redo entries are recorded into `historyEvents` for audio-replay accuracy per the spec's Out of Scope note, but reconstructing the undo/redo STACKS themselves on replay load is out of scope; however the REDUCERS map replaying `board:undo`/`board:redo` events during playback must still visually reflect the same inverse — add the two new entries to that map as part of this task's Step 5 below, reusing the same `applyBoardUndo`/`applyBoardRedo` functions).

**IMPORTANT:** Read the Global Constraints section again before starting. The reducer must reindex whichever pane's `strokesByPage`/`rightStrokesByPage` currently shows `p.mode` — read the existing `applyPageRemove` reducer in full first (same file) to match its exact pane-selection pattern (`const right = p.pane === "right"` — but note `board:undo`/`board:redo` payloads do NOT carry a `pane` field per Task 4's payload shape, only `mode`; you must instead check BOTH `s.leftBoardMode`/`s.rightBoardMode` against `p.mode` to determine which pane's stroke pool to mutate, since undo doesn't know or care which pane originally emitted the action — it only knows the mode).

- [ ] **Step 1: Write the two reducers**

Add to `apps/frontend/src/hooks/classroomReducers.ts`, after `applyNotebookPageInsert` (end of file):

```ts
// entry.mode qaysi pane'da ko'rsatilayotganini aniqlaydi — split
// rejimida DUPLICATE_SPLIT_MODE tufayli ikkala pane bir xil mode'da
// bo'la olmaydi, shuning uchun bu har doim aynan bitta pane'ni tanlaydi
// (yoki yakka rejimda "left"ni, chunki notSplit holatida faqat
// strokesByPage ishlatiladi).
function paneKeyForMode(s: ClassroomState, mode: CsBoardMode): "strokesByPage" | "rightStrokesByPage" {
  return s.rightBoardMode === mode && s.leftBoardMode !== mode ? "rightStrokesByPage" : "strokesByPage";
}

function applyStrokeAddInverseClient(source: Record<number, CsStroke[]>, page: number, data: { stroke: CsStroke }, direction: "undo" | "redo"): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  return {
    ...source,
    [page]: direction === "undo" ? list.filter((s) => s.id !== data.stroke.id) : [...list, data.stroke],
  };
}

function applyStrokeEraseInverseClient(source: Record<number, CsStroke[]>, page: number, data: { stroke: CsStroke; index: number }, direction: "undo" | "redo"): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  if (direction === "undo") {
    const next = [...list];
    next.splice(data.index, 0, data.stroke);
    return { ...source, [page]: next };
  }
  return { ...source, [page]: list.filter((s) => s.id !== data.stroke.id) };
}

function applyStrokeTransformInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { strokeId: string; before: Partial<CsStroke>; after: Partial<CsStroke> },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  const target = direction === "undo" ? data.before : data.after;
  return { ...source, [page]: list.map((s) => s.id === data.strokeId ? { ...s, ...target } : s) };
}

function applyStrokeReorderInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { before: { order: string[] }; after: { order: string[] } },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  const targetOrder = direction === "undo" ? data.before.order : data.after.order;
  const byId = new Map(list.map((s) => [s.id, s]));
  return { ...source, [page]: targetOrder.map((id) => byId.get(id)).filter((s): s is CsStroke => s !== undefined) };
}

function applyStrokeTextInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { strokeId: string; before: CsStroke | null; after: CsStroke },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  if (direction === "undo") {
    return data.before === null
      ? { ...source, [page]: list.filter((s) => s.id !== data.strokeId) }
      : { ...source, [page]: list.map((s) => s.id === data.strokeId ? data.before! : s) };
  }
  const exists = list.some((s) => s.id === data.strokeId);
  return { ...source, [page]: exists ? list.map((s) => s.id === data.strokeId ? data.after : s) : [...list, data.after] };
}

function applyBoardUndoRedo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; before?: unknown; after?: unknown },
  direction: "undo" | "redo",
): ClassroomState {
  const key = paneKeyForMode(s, p.mode);
  const source = s[key];

  let nextSource: Record<number, CsStroke[]> | null = null;
  switch (p.entryType) {
    case "stroke:add":
      nextSource = applyStrokeAddInverseClient(source, p.page, (direction === "undo" ? p.before : p.after) as { stroke: CsStroke }, direction);
      break;
    case "stroke:erase":
      nextSource = applyStrokeEraseInverseClient(source, p.page, p.before as { stroke: CsStroke; index: number }, direction);
      break;
    case "stroke:transform":
    case "stroke:style":
      nextSource = applyStrokeTransformInverseClient(source, p.page, {
        strokeId: p.strokeId!,
        before: p.before as Partial<CsStroke>,
        after: p.after as Partial<CsStroke>,
      }, direction);
      break;
    case "stroke:text":
      nextSource = applyStrokeTextInverseClient(source, p.page, {
        strokeId: p.strokeId!,
        before: p.before as CsStroke | null,
        after: p.after as CsStroke,
      }, direction);
      break;
    case "stroke:reorder":
      nextSource = applyStrokeReorderInverseClient(source, p.page, { before: p.before as { order: string[] }, after: p.after as { order: string[] } }, direction);
      break;
    default:
      // page:remove / page:insert: bu ikkalasi sahifalar ro'yxati va
      // notebookPageCount/Styles'ni ham o'zgartiradi — bu funksiya faqat
      // stroke-darajasidagi turlarni qamrab oladi. Sahifa-darajasidagi
      // undo/redo alohida (quyida applyBoardUndo/applyBoardRedo ichida
      // to'liq) ishlanadi.
      return s;
  }

  return { ...s, [key]: nextSource ?? source, currentPage: p.page, boardMode: p.mode };
}
```

`applyBoardUndoRedo` is NOT exported — it's an internal helper. The exported `applyBoardUndo`/`applyBoardRedo` functions are added in Step 2 below, once the page-level counterpart exists, since both stroke-level and page-level entry types must be dispatched from the same two exported entry points.

`strokeId!` (inside `applyBoardUndoRedo`, Step 1's code above) is safe by construction the same way it is on the backend (Task 4): `p.strokeId` is only read for `stroke:transform`/`stroke:style`/`stroke:text`, and the backend's `board:undo`/`board:redo` payload always includes `strokeId` for those three entry types (Task 4, Step 3's payload construction).

- [ ] **Step 2: Add the page-level undo/redo function and the exported `applyBoardUndo`/`applyBoardRedo` entry points**

Page-level entries (`page:remove`/`page:insert`) don't fit `applyBoardUndoRedo`'s pane-only stroke-pool shape — they also change `s.pages`/`s.notebookPageCount`/`s.notebookPageStyles`. Add a separate function, after `applyBoardUndoRedo`, that reuses the existing `applyPageRemove`/`applyPdfInsert`/`applyNotebookPageInsert` reducers (same file) for the reindex math, then patches in the snapshotted strokes/style that only an undo-of-remove needs to restore (a fresh insert has no prior strokes to restore, so `applyPdfInsert`/`applyNotebookPageInsert`'s own blank-page behavior is already correct for every OTHER case):

```ts
// page:remove/page:insert'ning teskarisi — bular sahifalar ro'yxati va
// notebookPageCount/Styles'ni ham o'zgartirgani uchun applyBoardUndoRedo'dan
// alohida, sahifa-darajasidagi mavjud reducer'larni (applyPageRemove/
// applyPdfInsert/applyNotebookPageInsert) qayta ishlatadi. Backend'dagi
// applyPageRemoveInverse/applyPageInsertInverse (Task 2) bilan bir xil
// naqsh: direction'ga qarab TO'RTTA holat (remove+undo, remove+redo,
// insert+undo, insert+redo), before/after ikkalasi ham har doim to'liq
// beriladi (faqat bittasi emas).
function applyPageUndoRedo(
  s: ClassroomState,
  p: {
    mode: CsBoardMode; entryType: string;
    before: { pageIndex: number; page: { url?: string; notebookStyle?: CsNotebookStyle; strokes: CsStroke[] } } | null;
    after: { afterPageIndex: number; pages?: string[]; style?: CsNotebookStyle } | null;
  },
  direction: "undo" | "redo",
): ClassroomState {
  const pane: "left" | "right" = paneKeyForMode(s, p.mode) === "rightStrokesByPage" ? "right" : "left";

  if (p.entryType === "page:remove") {
    if (direction === "redo") {
      // redo: sahifani yana olib tashlaymiz.
      return applyPageRemove(s, { mode: p.mode, pageIndex: p.before!.pageIndex, pane });
    }
    // undo: sahifani o'zining oldingi joyiga (afterPageIndex = pageIndex - 1,
    // 0-indexed) qayta qo'yamiz, keyin qo'yilgan (bo'sh) sahifaga
    // o'chirishdan oldingi chizmalarini (va agar daftar bo'lsa naqshini)
    // qaytaramiz.
    const { pageIndex, page } = p.before!;
    const afterPageIndex = pageIndex - 1;
    const inserted = p.mode === "pdf"
      ? applyPdfInsert(s, { pages: [page.url!], afterPageIndex })
      : applyNotebookPageInsert(s, { mode: p.mode, afterPageIndex, style: page.notebookStyle ?? "grid", pane });
    const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
    return { ...inserted, [key]: { ...inserted[key], [pageIndex]: page.strokes } };
  }

  // entryType === "page:insert"
  if (direction === "redo") {
    // redo: sahifani aynan o'sha joyga, o'sha manba bilan qayta qo'shamiz.
    const { afterPageIndex, pages, style } = p.after!;
    return p.mode === "pdf"
      ? applyPdfInsert(s, { pages: pages ?? [], afterPageIndex })
      : applyNotebookPageInsert(s, { mode: p.mode, afterPageIndex, style: style ?? "grid", pane });
  }
  // undo: qo'shilgan sahifani olib tashlaymiz (uning yangi 1-indexed
  // raqami afterPageIndex + 1).
  return applyPageRemove(s, { mode: p.mode, pageIndex: p.after!.afterPageIndex + 1, pane });
}
```

Add the two exported entry points right after `applyPageUndoRedo`. Each routes to `applyPageUndoRedo` when `p.entryType` is `"page:remove"`/`"page:insert"`, and to `applyBoardUndoRedo` (Step 1's internal helper) otherwise. Since these two page-level entry types always store `before: null` on insert and `after: null` on remove (Task 3), and `applyBoardUndo` only ever receives `entry.before` while `applyBoardRedo` only ever receives `entry.after` per the socket payload shape (Task 4), each exported function passes `null` for the field it wasn't given:

```ts
export function applyBoardUndo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; before: unknown },
): ClassroomState {
  if (p.entryType === "page:remove" || p.entryType === "page:insert") {
    return applyPageUndoRedo(s, { mode: p.mode, entryType: p.entryType, before: p.before as any, after: null }, "undo");
  }
  return applyBoardUndoRedo(s, p, "undo");
}

export function applyBoardRedo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; after: unknown },
): ClassroomState {
  if (p.entryType === "page:remove" || p.entryType === "page:insert") {
    return applyPageUndoRedo(s, { mode: p.mode, entryType: p.entryType, before: null, after: p.after as any }, "redo");
  }
  return applyBoardUndoRedo(s, p, "redo");
}
```

This mirrors the backend's `applyUndoEntry` dispatch (Task 4) exactly: both sides pick the function purely by `entry.type` and pass an explicit `direction`, never by which of `before`/`after` happens to be non-null.

Add `CsNotebookStyle` to this file's existing import from `../api/classroom` if not already imported (check first — `applyNotebookPageInsert`, already in this file, uses it, so it likely already is).

- [ ] **Step 3: Manually verify the page-level branch with a written trace**

This step has no automated test (frontend reducers in this codebase have no dedicated unit test file — confirmed by the sibling plans' pattern of verifying via clean `tsc` build only). Before moving on, trace through: remove page 2 of a 3-page PDF `[a,b,c]` (`applyPageRemove` leaves `[a,c]`), then undo via `applyBoardUndo` with `entryType: "page:remove"`, `before: { pageIndex: 2, page: { url: 'b', strokes: [...] } }`. Confirm your trace produces `pages: [a,b,c]` with page 2's strokes restored and page 3's (formerly reindexed to key 2 by the removal) strokes correctly back at key 3 — matching what Task 4's backend test `'undo of a page:remove restores the page with its strokes'` asserts server-side, so client and server visually agree after this event round-trips.

- [ ] **Step 4: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/classroomReducers.ts
git commit -m "feat(classroom): add applyBoardUndo/applyBoardRedo frontend reducers"
```

---

## Task 6: Frontend Session Hook — Socket Wiring and Host Actions

**Files:**
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts`

**Interfaces:**
- Consumes: `applyBoardUndo`, `applyBoardRedo` (Task 5)
- Produces: `hostActions.undo(): void`, `hostActions.redo(): void` (both replacing the old 3-arg `undo`) — consumed by Task 7 (`ClassroomHostPage.tsx`'s hotkeys and toolbar wiring).

- [ ] **Step 1: Add the two new socket listeners**

In `apps/frontend/src/hooks/useClassroomSession.ts`, find the existing `socket.on("page:insert", ...)` listener registration and add, right after it:

```ts
    socket.on("board:undo", (p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; before: unknown }) => setState((s) => applyBoardUndo(s, p)));
    socket.on("board:redo", (p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; after: unknown }) => setState((s) => applyBoardRedo(s, p)));
```

Add `applyBoardUndo, applyBoardRedo` to this file's existing import from `./classroomReducers`.

Find the matching cleanup block (`socket.off("page:insert");`) and add, right after it:

```ts
      socket.off("board:undo");
      socket.off("board:redo");
```

- [ ] **Step 2: Replace the `undo` host action and add `redo`**

Find the `hostActions` object's existing `undo` entry:

```ts
    undo: (page: number, pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => emitHost("host:undo", { page, pane, mode }),
```

Replace it with:

```ts
    undo: () => emitHost("host:undo"),
    redo: () => emitHost("host:redo"),
```

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: this will FAIL — `ClassroomHostPage.tsx`'s existing calls to `hostActions.undo(state.currentPage, "left", state.boardMode)` and `hostActions.undo(state.currentPage, activePane, ...)` now pass arguments to a zero-arg function. This is EXPECTED and deferred to Task 7 — confirm the ONLY errors are in `ClassroomHostPage.tsx` at those two call sites, nothing in this task's own file.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/hooks/useClassroomSession.ts
git commit -m "feat(classroom): wire board:undo/board:redo socket events, simplify undo/add redo host actions"
```

---

## Task 7: Toolbar Redo Button, Hotkeys, and Page Wiring

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomToolbar.tsx`
- Modify: `apps/frontend/src/pages/ClassroomHostPage.tsx`

**Interfaces:**
- Consumes: `hostActions.undo()`, `hostActions.redo()` (Task 6)

- [ ] **Step 1: Add the Redo button and rename the Undo icon in `ClassroomToolbar.tsx`**

Find the `Props` interface (search for `onUndo: () => void;`) and add, right after it:

```ts
  onRedo: () => void;
```

Find the function's destructured parameter list (search for `onUndo,`) and add `onRedo,` right after it.

Find the top `lucide-react` import block and add `Undo2` to the existing list (it already imports `Redo2`).

Find the existing Undo button JSX (search for `title="Bekor qilish (undo)"`) and replace the whole button block, plus add a Redo button right after it:

```tsx
      <button
        type="button"
        className={iconBtn(false)}
        title="Bekor qilish (Ctrl+Z)"
        onClick={onUndo}
      >
        <Undo2 size={15} />
      </button>
      <button
        type="button"
        className={iconBtn(false)}
        title="Qaytarish (Ctrl+Shift+Z)"
        onClick={onRedo}
      >
        <Redo2 size={15} />
      </button>
```

- [ ] **Step 2: Verify frontend builds (Toolbar file only, expect ClassroomHostPage errors to persist)**

Run: `npm run build --workspace=apps/frontend`
Expected: still FAILS — `ClassroomHostPage.tsx` doesn't yet pass `onRedo` to `<ClassroomToolbar>`, and its `onUndo` callback still calls the old-signature `hostActions.undo(...)`. Confirm the error list shrank to only `ClassroomHostPage.tsx`.

- [ ] **Step 3: Fix the `mod+z` hotkey and add `mod+shift+z`**

In `apps/frontend/src/pages/ClassroomHostPage.tsx`, find:

```ts
  useHotkeys("mod+z", () => hostActions.undo(state.currentPage, "left", state.boardMode), {
    preventDefault: true,
  });
```

Replace with:

```ts
  useHotkeys("mod+z", () => hostActions.undo(), {
    preventDefault: true,
  });
  useHotkeys("mod+shift+z", () => hostActions.redo(), {
    preventDefault: true,
  });
```

- [ ] **Step 4: Fix the `<ClassroomToolbar>` `onUndo` prop and add `onRedo`**

Find the `<ClassroomToolbar` invocation (search for `onUndo={() => hostActions.undo(state.currentPage, activePane,`) and replace that one line, adding a new `onRedo` line right after it:

```tsx
              onUndo={() => hostActions.undo()}
              onRedo={() => hostActions.redo()}
```

(The `activePane`/mode-derivation logic that line previously used is no longer needed — undo/redo now take no arguments at all, since the popped entry carries its own mode/page. `activePane` state itself stays in this file unchanged, since `handleAttachPages`/`clearPage`'s `onClear` callback on the neighboring line still legitimately uses it for an unrelated purpose — do not remove `activePane` or touch `onClear`.)

- [ ] **Step 5: Verify frontend builds cleanly**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`, zero errors.

- [ ] **Step 6: Manual verification in the browser**

Run `npm run dev:backend` and `npm run dev:frontend`. As the teacher, open a classroom session with a multi-page PDF attached. Draw a stroke on the PDF page, press Ctrl+Z — confirm the stroke disappears. Press Ctrl+Shift+Z — confirm it reappears. Draw a stroke, move it (drag), press Ctrl+Z — confirm it jumps back to its pre-move position (not fully removed). Switch to notebook mode, draw a stroke, switch back to PDF, draw another stroke, then press Ctrl+Z twice — confirm the PDF stroke disappears first, then pressing Ctrl+Z again switches the view to notebook mode and removes the notebook stroke (testing the cross-mode, time-ordered behavior). Click the new Redo toolbar button — confirm it visually matches Ctrl+Shift+Z. Remove a page via the trash icon, then Ctrl+Z — confirm the page and its strokes are restored. Add a page via "+", then Ctrl+Z — confirm the added page disappears. Confirm a student viewing the same session (second browser tab) sees all of the above changes live as the host undoes/redoes them.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomToolbar.tsx apps/frontend/src/pages/ClassroomHostPage.tsx
git commit -m "feat(classroom): wire redo button and Ctrl+Shift+Z, fix undo call sites for new no-arg signature"
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

Manual end-to-end check (already covered in Task 7 Step 6, repeat here as a final pass):
- Every action type (add, move/resize/rotate, style change, text edit, reorder, erase, page remove, page insert) can be undone and redone correctly.
- Undo/redo order is a single shared timeline across PDF and notebook modes — not two independent per-mode histories.
- Undo/redo jump the view to the affected page and mode when it differs from what's currently showing.
- A new action after an undo clears the entire redo stack.
- The stroke-eraser tool's existing `stroke:undo` broadcast (unrelated to this feature) still works exactly as before — confirm by using the stroke-eraser tool and observing no regression.
- Existing zoom/scroll/splitRatio/page-removal/page-insert sync is unaffected by this diff.
