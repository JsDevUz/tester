# Classroom: lasso font-size fix + shape/text layer controls

## Problem

1. **Lasso group resize doesn't scale text font size.** When resizing a group
   selected with the lasso tool (`ClassroomPdfViewer.tsx`, `transformGroupResize`),
   text strokes have their `textBoxWidth`/`textBoxHeight` rescaled but `fontSize`
   is left untouched, so the text box grows/shrinks while the glyphs stay the
   same visual size.
2. **No way to reorder shapes/text (z-order).** There's no "layers" concept —
   elements always render in strokes-array order, and there is no UI to bring
   an element forward/backward.

## Scope

- Fix font-size scaling in lasso group resize.
- Add layer reorder controls (send to back / send backward / bring forward /
  bring to front) to:
  - `TextStylePanel`
  - `ShapeStylePanel`
  - the lasso group-selection overlay (multi-element reorder)
- Reordering is synced to all classroom participants via a new socket event,
  following the existing `updateShapeStroke` pattern (in-memory only, no DB).

Out of scope: no new `zIndex` field — render order already equals array
order, so "layering" is purely a matter of splicing the `strokes` array.

## Design

### 1. Font-size fix

In `transformGroupResize` (`ClassroomPdfViewer.tsx:1332-1371`), compute
`const fontScale = Math.min(scaleX, scaleY);` and when `original.tool ===
"text"`, additionally set:

```ts
stroke.fontSize = Math.round(Math.max(10, Math.min(96, (original.fontSize ?? 24) * fontScale)));
```

Uniform scale (min of X/Y) avoids the font distorting differently than a
non-uniform box resize; the 10–96 clamp matches the existing single-text
resize behavior (`ClassroomPdfViewer.tsx:1615`).

### 2. Layer controls

**Ops:** `"front" | "back" | "forward" | "backward"` — four buttons, icons per
the reference screenshot (send-to-back, send-backward, bring-forward,
bring-to-front).

**Semantics:** given the page's `strokes` array and a set of target
`strokeIds`:
- `front`: move all target elements to the end of the array (rendered last =
  on top), preserving their relative order.
- `back`: move all target elements to the start of the array, preserving
  relative order.
- `forward`: swap each target element one position later in the array
  (skip if already at the end).
- `backward`: swap each target element one position earlier in the array
  (skip if already at the start).

For a single selected shape/text, `strokeIds` is a one-element set. For a
lasso group, it's `selectedGroupIds`.

**UI placement:**
- `TextStylePanel` / `ShapeStylePanel`: new "Qatlamlar" (Layers) section,
  same visual style as existing sections (label + row of icon buttons).
- Lasso group overlay (`ClassroomPdfViewer.tsx:2207-2239`): small floating
  button row near the existing delete button, using the same 4 ops over
  `selectedGroupIds`.

### 3. Data flow / sync

**Frontend (`useClassroomSession.ts`):** new action `reorderStroke(page,
strokeIds, op, pane, mode)` mirroring `updateShapeStroke`/`moveStroke`:
- optimistically splices the local `strokesByPage`/`rightStrokesByPage` array
- emits `host:reorderStroke` with `{ sessionId, token, page, strokeIds, op, pane, mode }`
- listens for broadcast `stroke:reorder` to apply the same splice from other
  events (e.g. reflecting host's own emit echo, or in case of future
  non-host actors)

**`ClassroomPdfViewer` props:** new `onReorderStroke?: (page, strokeIds, op) => void`
threaded down like `onUpdateShapeStroke`, called from the new layer buttons.

**Backend**, following the exact `updateShapeStroke` pattern:
- `classroom.gateway.ts`: `@SubscribeMessage('host:reorderStroke')` handler,
  calls `classroomService.reorderStroke(...)`.
- `classroom.service.ts`: `reorderStroke(sessionId, userId, page, strokeIds,
  op, mode, pane)` — requires host, mutates the in-memory stroke array via a
  new pure helper, broadcasts `stroke:reorder` with `{ page, strokeIds, op, pane, mode }`.
- `classroom.logic.ts`: new pure function `reorderStrokesInSession(session,
  page, strokeIds, op, strokeMap)` implementing the four ops above on the
  array in place (or returning a new array), matching the style of
  `updateShapeStroke`/`eraseStroke` helpers already there.
- Purely in-memory, no persistence — consistent with all other stroke
  mutations today.

## Testing

- Manual: lasso-select a text + shape group, resize via corner handle,
  confirm font size visually scales with the box.
- Manual: select a single shape, use each of the 4 layer buttons, confirm
  visual stacking order changes correctly against overlapping shapes.
- Manual: lasso-select multiple shapes/text, use bring-to-front/send-to-back,
  confirm relative order among the group is preserved and the whole group
  moves together.
- Manual: verify a second browser tab/session (student view) reflects the
  same reorder in real time.
