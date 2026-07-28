# Classroom Undo/Redo Design

## Goal

Replace the classroom board's current "pop the last stroke off the current
page" undo with a full command-history undo/redo system: every annotation
action — adding, moving, resizing, recoloring, restyling, reordering,
erasing a stroke; editing text (content/font/size/color as one committed
edit); removing or inserting a page — becomes one entry in a single
ordered history shared across both board modes (PDF and notebook) and
both split panes. `Ctrl+Z` steps backward through that history
regardless of which page or mode is currently showing, jumping to
whichever page (and mode) the undone action touched; `Ctrl+Shift+Z` (and
a new toolbar redo button) steps forward again. Actions on PDF and
notebook interleave in exactly the order they happened in wall-clock
time — draw on a PDF page, switch to notebook, draw there, and two
undos remove the notebook stroke first, then the PDF stroke, regardless
of which mode is currently on screen when each undo fires.

## Data Model

### `ClassroomUndoEntry` — one undoable action

Distinct from the existing `ClassroomHistoryEvent` (which is a flat
audio/replay log, append-only, never mutated). The new type is a stack
entry with an inverse. Critically, **one history is shared across both
board modes** (PDF and notebook) — confirmed with the user via a concrete
example: draw on a PDF page, switch to notebook, draw there, then undo
twice — the first undo removes the notebook stroke, the second removes
the PDF stroke. Undo always targets whatever happened most recently in
wall-clock time, regardless of which mode is currently displayed or which
mode the action originally belonged to. Every entry therefore carries its
own `mode` so the inverse can be applied to the right stroke pool even
when it no longer matches what's currently on screen:

```ts
export type ClassroomUndoActionType =
  | 'stroke:add' | 'stroke:erase'
  | 'stroke:transform'   // move, resize, rotate — one committed drag/resize gesture
  | 'stroke:style'       // color, font family, font size, shape style — one committed style change
  | 'stroke:text'        // one committed text-edit session (content + any style changed during it)
  | 'stroke:reorder'     // front/back/forward/backward
  | 'page:remove' | 'page:insert';

export interface ClassroomUndoEntry {
  type: ClassroomUndoActionType;
  mode: ClassroomBoardMode; // which stroke pool this entry's inverse applies to
  page: number;             // which page to jump to on undo/redo
  pane: 'left' | 'right';   // which pane emitted it (broadcast payload only — see below)
  // Inverse data: enough to reconstruct "before" from "after" and vice
  // versa without storing full-page snapshots. Shape depends on `type`:
  before: unknown;
  after: unknown;
}
```

Add to `ClassroomSession` (`classroom.types.ts`):

```ts
// Yagona, ikkala board mode (pdf/notebook) uchun UMUMIY, vaqt bo'yicha
// tartiblangan undo/redo tarixi — har bir yozuv o'zining mode'ini olib
// yuradi (ClassroomUndoEntry.mode), shuning uchun undo joriy ko'rinayotgan
// mode'dan mustaqil ravishda har doim eng oxirgi harakatni (u qaysi
// mode'ga tegishli bo'lishidan qat'i nazar) bekor qiladi.
undoStack?: ClassroomUndoEntry[];
redoStack?: ClassroomUndoEntry[];
```

Not persisted to Postgres or included in `ClassroomSnapshot` —
in-memory only, scoped to the live session, matching `zoom`/`splitRatio`.
A page refresh mid-lesson does not lose it (session survives in server
memory across reconnects), but the stack does not survive server
restart or session end — acceptable, matching this codebase's existing
"most sync state is ephemeral" pattern. Max depth: 100 entries total
(oldest dropped on overflow) — bounds memory for long lessons without
needing per-entry size accounting.

### Inverse payload shapes per action type

- **`stroke:add`**: `before: null`, `after: { stroke: ClassroomStroke }`.
  Undo = erase that stroke by id. Redo = re-add it.
- **`stroke:erase`**: `before: { stroke: ClassroomStroke, index: number }`,
  `after: null`. Undo = re-insert the stroke at its original index (so
  layering is preserved). Redo = erase it again.
- **`stroke:transform`** (move/resize/rotate, one committed gesture):
  `before: { points: number[], rotation?: number, textBoxWidth?: number,
  textBoxHeight?: number }`, `after: <same shape, post-gesture values>`.
  Undo/redo = overwrite just those fields on the stroke by id.
- **`stroke:style`** (color/width/font/shape-style change committed
  outside a text-edit session — e.g. changing a shape's fill after the
  fact via its style panel): `before`/`after` are partial `ClassroomStroke`
  patches covering only the changed fields.
- **`stroke:text`** (one text-edit session, start to commit): `before` is
  either `null` (new text stroke) or the full prior stroke; `after` is the
  full stroke as committed. Covers content, font family/size/weight,
  color, alignment, box size — anything changed during that one open→close
  session, as a single entry.
- **`stroke:reorder`**: `before: { order: string[] }` (full id order of the
  page's stroke list before the op), `after: { order: string[] }` (after).
  Undo/redo = replace the list's order to match.
- **`page:remove`**: `before: { mode, pageIndex, page: ClassroomPageSnapshot
  }` where `ClassroomPageSnapshot` is everything needed to fully
  reconstruct the page — its strokes array and, for notebook, its style.
  `after: null`. Undo = re-insert the page (and its strokes) at
  `pageIndex`, exactly mirroring `insertPdfPagesIntoSession`/
  `insertNotebookPageIntoSession`'s reindex-up logic. Redo = remove it
  again via the existing `removePageFromSession`.
- **`page:insert`**: `before: null`, `after: { mode, afterPageIndex }`.
  Undo = remove the inserted page via `removePageFromSession` (same
  reindex-down logic already in place). Redo = re-insert it — but a
  redo of a PDF insert cannot re-fetch from the library (the page URL is
  already known from `after`), so `after` for PDF must also carry
  `pages: string[]` (the resolved URLs), not just the request that
  produced them.

## Backend: Recording

Every existing mutation method (`stroke`, `moveStroke`, `updateTextStroke`,
`updateShapeStroke`, `eraseStroke`, `reorderStroke`, `removePage`,
`insertNotebookPage`, `insertPdfPagesFromLibrary`) gains one call —
`pushUndoEntry(session, entry)` — right before it broadcasts, using the
state captured before/after its existing mutation logic runs (most
already compute or have access to both). `entry.mode` is set by the
caller to whatever mode that specific mutation targets (already a known
value at every call site — `stroke`'s own `mode` parameter,
`removePage`'s own `mode` parameter, etc). `pushUndoEntry` pushes onto
the single shared `session.undoStack` and clears `session.redoStack` in
full (new action invalidates ALL redo history — both modes' — standard
editor behavior; a redo of a notebook action doesn't make sense to keep
around once a new PDF action has happened, since replaying it would now
insert out of the timeline it was captured in).

`splitStroke` (pixel-eraser) is **not** given its own undo entry type —
it already erases-and-replaces in one step; modeling it as a
`stroke:erase` of the original plus N `stroke:add`s would be overkill
for a first version. Out of scope for this spec (see below); it remains
undo-untracked, matching how it's already excluded from the plain
`undo()` today.

## Backend: `undo(sessionId, userId)` / `redo(sessionId, userId)`

Replace the existing `page`/`mode`-scoped `undo` method signature
entirely — no parameters beyond the session/host identity, since the
single shared stack's top entry already carries its own `mode` and
`page`.

```ts
undo(sessionId: string, userId: string): void
redo(sessionId: string, userId: string): void
```

Steps for `undo`:
1. `requireHost`.
2. Pop `session.undoStack`; if empty, no-op (return silently, matching
   today's "nothing to undo" behavior).
3. Dispatch on `entry.type` to apply the inverse against `entry.mode`'s
   stroke pool (each type's inverse logic lives as a pure function in
   `classroom.logic.ts`, sibling to `removePageFromSession`/
   `insertPdfPagesIntoSession` — takes `session`, `entry.mode`, and the
   entry's `before` data).
4. Push the entry onto `session.redoStack`.
5. Set `session.currentPage = entry.page` and `session.boardMode =
   entry.mode` (jump to wherever — and whichever mode — the undone
   action happened, per the "tartib bilan orqaga qaytsin" requirement:
   undo can switch the visible mode, not just the page).
6. Broadcast a single `board:undo` event carrying enough for the frontend
   to apply the same inverse without re-deriving it: `{ mode: entry.mode,
   page: entry.page, entryType: entry.type, before: entry.before }` — the
   frontend reducer pattern-matches on `entryType` exactly like the
   reverse operation.

`redo` is the mirror: pop `session.redoStack`, apply the forward
(`entry.after`) against `entry.mode`, push back to `session.undoStack`,
jump to `entry.page` and `entry.mode`, broadcast `board:redo` with
`{ mode: entry.mode, page: entry.page, entryType, after: entry.after }`.

## Frontend

`hostActions.undo()` / `hostActions.redo()` — no arguments at all now.
`useHotkeys("mod+z", ...)` and a new `useHotkeys("mod+shift+z", ...)`
call these directly, replacing the current `hostActions.undo(state.
currentPage, "left", state.boardMode)` call shape. This is a global
shortcut independent of which pane is focused or which mode is currently
displayed — pressing Ctrl+Z always undoes the single most recent action
across the whole session, exactly matching the design's core requirement
(draw on PDF, switch to notebook, draw there, Ctrl+Z twice undoes
notebook-then-PDF in that order, regardless of what's on screen when each
Ctrl+Z fires).

`ClassroomToolbar.tsx` gets a Redo button next to the existing Undo
button, disabled when the (client-mirrored) redo stack is empty —
matching Undo's existing disabled-when-empty pattern if it has one, or
simply always-enabled and letting the no-op happen silently server-side
otherwise (implementer's call during planning, based on what Undo
currently does).

`useClassroomSession.ts` adds `socket.on("board:undo", ...)` /
`socket.on("board:redo", ...)`, applying a new `applyBoardUndo`/
`applyBoardRedo` reducer pair in `classroomReducers.ts` that
pattern-matches `entryType` the same way the backend's inverse dispatch
does, mutating whichever pane's `strokesByPage`/`rightStrokesByPage`
currently shows `payload.mode` (both panes if both happen to show it,
though `DUPLICATE_SPLIT_MODE` makes that unreachable in split — so in
practice exactly one pane, or the single non-split view). Also updates
`currentPage`/`boardMode` to jump to the affected page and mode, matching
the backend's jump behavior — an undo can switch what the host is
currently looking at (e.g. undoing a notebook action while the PDF pane
is focused switches the view to notebook, at the affected page).

## Session lifecycle for multi-step actions

- **Text**: one entry per open→close editing session (already how
  `onUpdateTextStroke` fires today — no change to the commit boundary,
  only to what gets recorded).
- **Move/resize/rotate**: one entry per pointer-down→pointer-up gesture
  (already the natural boundary — `onMoveStroke`/shape-resize handlers
  already fire once per gesture, not per intermediate frame).
- **Style changes via a style panel** (color swatch click, font-size
  preset click): one entry per discrete click — these are already
  discrete user actions with no intermediate "dragging" state, so no
  grouping logic is needed beyond firing on each `onColorChange`-style
  callback.

## Out of Scope

- `splitStroke` (pixel-eraser cut) — not undo-tracked (matches today).
- Undo/redo history persisted beyond the live in-memory session (no
  Postgres, no replay-log integration) — a lesson recording's replay
  continues to use the existing flat `ClassroomHistoryEvent` log
  unchanged; `board:undo`/`board:redo` are recorded into that log like
  any other event (for audio-replay accuracy) but the *undo/redo stacks
  themselves* are not reconstructed on replay-page load.
- Collapsing/coalescing rapid repeated actions of the same type (e.g. ten
  quick color changes in a row) into fewer undo steps — every committed
  action gets its own entry, no smart merging.
