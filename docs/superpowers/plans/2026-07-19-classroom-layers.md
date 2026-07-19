# Classroom Lasso Font-Size Fix + Layer Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix lasso-group resize not scaling text font size, and add layer
reorder controls (send to back / send backward / bring forward / bring to
front) for shapes, text, and lasso-selected groups in the classroom canvas.

**Architecture:** Render order in `strokes` arrays already equals z-order, so
"layering" is pure array reordering — no new stroke field. A new
`reorderStroke` action is added end-to-end (frontend optimistic update →
socket emit → backend in-memory mutation → broadcast → other clients apply
same reorder), mirroring the existing `updateShapeStroke` action exactly.

**Tech Stack:** React/TypeScript frontend (`ClassroomPdfViewer.tsx`,
`useClassroomSession.ts`), NestJS + Socket.IO backend
(`classroom.gateway.ts`, `classroom.service.ts`, `classroom.logic.ts`), no
database involved (strokes are in-memory only).

## Global Constraints

- Follow the exact existing pattern for stroke mutation actions (see
  `updateShapeStroke` in all three backend files and
  `hostActions.updateShapeStroke` in `useClassroomSession.ts`) — one
  `@SubscribeMessage` gateway method, one service method, one pure logic
  helper, one broadcast event, one frontend hook action, one prop threaded
  through `ClassroomPdfPage` → `ClassroomPdfViewer` → `ClassroomHostPage`.
- No persistence — everything is in-memory per session, consistent with all
  other stroke operations.
- No new `zIndex`/`layer` field on `CsStroke`/`ClassroomStroke` — reordering
  is done by splicing the array.

---

### Task 1: Fix lasso group resize not scaling font size

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx:1332-1371` (`transformGroupResize`)

**Interfaces:**
- Consumes: existing `resizingGroupRef`, `selectedGroupStrokes`, `CsStroke.fontSize` (already defined in `apps/frontend/src/api/classroom.ts:172-197`)
- Produces: no new exports — internal behavior fix only

This is a visual bug with no automated test harness in this codebase (canvas
rendering, pointer-drag driven) — verify manually per the steps below
instead of a unit test.

- [ ] **Step 1: Reproduce the bug manually**

Start the frontend dev server, open a classroom as host, switch to notebook
board, add a text stroke (e.g. type "abc"), lasso-select it together with a
shape, and drag a corner resize handle. Observe: the box grows/shrinks but
the text glyphs stay the same visual size.

- [ ] **Step 2: Add font scale calculation and apply it to text strokes in `transformGroupResize`**

In `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`, inside
`transformGroupResize` (starts at line 1332), after the existing
`scaleX`/`scaleY` computation (lines 1347-1348) and before the `for` loop
(line 1349), add:

```ts
    const scaleX = (nextRight - nextLeft) / startW;
    const scaleY = (nextBottom - nextTop) / startH;
    const fontScale = Math.min(scaleX, scaleY);
    for (const stroke of selectedGroupStrokes) {
```

Then, inside the `if (original.tool === "text")` branch (currently lines
1356-1360), add the font size line so the block reads:

```ts
      if (original.tool === "text") {
        const [x, y] = remap(original.points[0], original.points[1]);
        stroke.points = [x, y];
        stroke.textBoxWidth = (original.textBoxWidth ?? 320) * scaleX;
        stroke.textBoxHeight = (original.textBoxHeight ?? 120) * scaleY;
        stroke.fontSize = Math.round(Math.max(10, Math.min(96, (original.fontSize ?? 24) * fontScale)));
      } else {
```

The `Math.min(scaleX, scaleY)` keeps text legible under non-uniform
(diagonal-only) drags instead of stretching/squashing the glyphs, and the
10–96 clamp matches the existing single-text resize behavior at line 1615
and the backend validation at `classroom.logic.ts:124`.

- [ ] **Step 3: Verify the fix manually**

Repeat Step 1's reproduction: lasso-select a text + shape group, drag a
corner handle. Confirm the text font size now visibly grows/shrinks in
proportion to the box, and stays clamped between 10–96px even when dragged
to extremes. Also confirm shapes (rectangle/ellipse) in the same group still
resize correctly (unaffected by this change, since `fontScale` is only
applied in the `text` branch).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "fix(classroom): scale text font size during lasso group resize"
```

---

### Task 2: Backend — add reorderStroke logic, service method, and gateway handler

**Files:**
- Modify: `apps/backend/src/classroom/classroom.logic.ts` (add `reorderStrokes` after `eraseStroke`, around line 187)
- Modify: `apps/backend/src/classroom/classroom.service.ts` (add `reorderStroke` method after `eraseStroke`, around line 465; add import)
- Modify: `apps/backend/src/classroom/classroom.gateway.ts` (add `@SubscribeMessage('host:reorderStroke')` handler after `eraseStroke`, around line 161)

**Interfaces:**
- Consumes: `ClassroomSession`, `ClassroomStroke` types from `classroom.types.ts`; `strokeMapFor`, `isValidPage` helpers already imported in `classroom.service.ts`
- Produces: `reorderStrokes(session: ClassroomSession, page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward", targetMap?: Map<number, ClassroomStroke[]>): boolean` (logic helper); `ClassroomService.reorderStroke(sessionId: string, userId: string, page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward", mode?: 'pdf' | 'notebook', pane?: 'left' | 'right'): void` (service method); broadcasts `stroke:reorder` with payload `{ page, strokeIds, op, pane, mode }`

- [ ] **Step 1: Add the pure reorder helper to `classroom.logic.ts`**

In `apps/backend/src/classroom/classroom.logic.ts`, add this function
immediately after `eraseStroke` (which ends at line 187):

```ts
// Layer tartibini o'zgartirish: massiv tartibi = render tartibi (z-order),
// shuning uchun alohida zIndex maydoni shart emas — faqat massivda
// ko'chirish kifoya. Guruh (bir nechta strokeIds) uchun ularning o'zaro
// nisbiy tartibi saqlanadi.
export function reorderStrokes(
  session: ClassroomSession, page: number, strokeIds: string[],
  op: 'front' | 'back' | 'forward' | 'backward',
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  if (!isValidPage(session, page) || strokeIds.length === 0) return false;
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const idSet = new Set(strokeIds);
  if (![...idSet].every((id) => list.some((s) => s.id === id))) return false;

  if (op === 'front' || op === 'back') {
    const selected = list.filter((s) => idSet.has(s.id));
    const rest = list.filter((s) => !idSet.has(s.id));
    const next = op === 'front' ? [...rest, ...selected] : [...selected, ...rest];
    list.splice(0, list.length, ...next);
    return true;
  }

  // forward: har bir tanlangan elementni undan keyingi (tanlanmagan)
  // qo'shni bilan almashtiradi; backward — oldingisi bilan. Eng chetdagi
  // (front/back'da allaqachon turgan) elementlar o'tkazib yuboriladi.
  const step = op === 'forward' ? 1 : -1;
  const indices = op === 'forward'
    ? [...list.keys()].filter((i) => idSet.has(list[i].id)).reverse()
    : [...list.keys()].filter((i) => idSet.has(list[i].id));
  for (const i of indices) {
    const j = i + step;
    if (j < 0 || j >= list.length || idSet.has(list[j].id)) continue;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return true;
}
```

- [ ] **Step 2: Add the service method in `classroom.service.ts`**

In `apps/backend/src/classroom/classroom.service.ts`, update the import
block (lines 13-19) to add `reorderStrokes`:

```ts
import {
  addStroke, attendanceStatusOnJoin, buildSnapshot, clearPage as clearPageStrokes,
  closeInterval, eraseStroke as eraseStrokeById, HOST_GRACE_MS, isValidPage,
  reorderStrokes as reorderStrokesInSession,
  setPage as setSessionPage, splitStroke as splitStrokeInSession, strokeMapFor, switchBoardMode, undoStroke,
  updateShapeStroke as updateShapeStrokeInSession,
  updateStrokePosition, updateTextStroke as updateTextStrokeInSession,
} from './classroom.logic';
```

Then add this method immediately after `eraseStroke` (which ends at line 465):

```ts
  // Layer tartibini o'zgartirish: send-to-back/send-backward/bring-forward/
  // bring-to-front. Guruh (lasso) uchun bir nechta strokeIds birga keladi.
  reorderStroke(
    sessionId: string, userId: string, page: number, strokeIds: string[],
    op: 'front' | 'back' | 'forward' | 'backward',
    mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const accepted = reorderStrokesInSession(s, page, strokeIds, op, strokeMapFor(s, mode, pane));
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    this.broadcaster.toRoom(sessionId, 'stroke:reorder', { page, strokeIds, op, pane, mode });
  }
```

- [ ] **Step 3: Add the gateway handler in `classroom.gateway.ts`**

In `apps/backend/src/classroom/classroom.gateway.ts`, add this immediately
after the `eraseStroke` handler (ends at line 161):

```ts
  @SubscribeMessage('host:reorderStroke')
  reorderStroke(@MessageBody() body: BaseBody & { page: number; strokeIds: string[]; op: 'front' | 'back' | 'forward' | 'backward'; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.reorderStroke(body.sessionId, user.sub, body.page, body.strokeIds, body.op, body.mode, body.pane);
    });
  }
```

- [ ] **Step 4: Typecheck the backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no new type errors (existing unrelated errors, if any, are out of
scope for this task — only confirm nothing new appears referencing
`reorderStroke`/`reorderStrokes`).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/classroom/classroom.logic.ts apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.gateway.ts
git commit -m "feat(classroom): add reorderStroke backend handler for layer ordering"
```

---

### Task 3: Frontend session hook — add `reorderStroke` action and `stroke:reorder` listener

**Files:**
- Modify: `apps/frontend/src/hooks/useClassroomSession.ts`

**Interfaces:**
- Consumes: existing `emitHost`, `setState`, `ClassroomState.strokesByPage`/`rightStrokesByPage` (already defined at top of file)
- Produces: `hostActions.reorderStroke(page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward", pane?: "left" | "right", mode?: "pdf" | "notebook"): void`

- [ ] **Step 1: Add a pure reorder helper near `moveStrokePoints`**

In `apps/frontend/src/hooks/useClassroomSession.ts`, add this function
immediately after `moveStrokePoints` (ends at line 9):

```ts
function reorderStrokeList(list: CsStroke[], strokeIds: string[], op: "front" | "back" | "forward" | "backward"): CsStroke[] {
  const idSet = new Set(strokeIds);
  if (op === "front" || op === "back") {
    const selected = list.filter((s) => idSet.has(s.id));
    const rest = list.filter((s) => !idSet.has(s.id));
    return op === "front" ? [...rest, ...selected] : [...selected, ...rest];
  }
  const next = [...list];
  const step = op === "forward" ? 1 : -1;
  const indices = op === "forward"
    ? [...next.keys()].filter((i) => idSet.has(next[i].id)).reverse()
    : [...next.keys()].filter((i) => idSet.has(next[i].id));
  for (const i of indices) {
    const j = i + step;
    if (j < 0 || j >= next.length || idSet.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
```

- [ ] **Step 2: Add the `stroke:reorder` socket listener**

In the same file, add this listener immediately after the `stroke:shapeUpdate`
listener (ends at line 185, right before `stroke:undo` at line 186):

```ts
    socket.on("stroke:reorder", (p: { page: number; strokeIds: string[]; op: "front" | "back" | "forward" | "backward"; pane?: "left" | "right"; mode?: CsBoardMode }) => {
      setState((s) => {
        const right = p.pane === "right";
        if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
        const key = right ? "rightStrokesByPage" : "strokesByPage";
        const source = s[key];
        const list = source[p.page] ?? [];
        return { ...s, [key]: { ...source, [p.page]: reorderStrokeList(list, p.strokeIds, p.op) } };
      });
    });
```

- [ ] **Step 3: Register cleanup for the new listener**

In the `return () => { ... }` cleanup block (starts at line 237), add this
line immediately after `socket.off("stroke:shapeUpdate");` (line 245):

```ts
      socket.off("stroke:reorder");
```

- [ ] **Step 4: Add the `reorderStroke` host action**

In the `hostActions` object, add this method immediately after
`updateShapeStroke` (ends at line 312, right before `undo` at line 313):

```ts
    reorderStroke: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward", pane: "left" | "right" = "left", mode: "pdf" | "notebook" = "pdf") => {
      setState((s) => {
        const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
        const source = s[key];
        const list = source[page] ?? [];
        return { ...s, [key]: { ...source, [page]: reorderStrokeList(list, strokeIds, op) } };
      });
      emitHost("host:reorderStroke", { page, strokeIds, op, pane, mode });
    },
```

- [ ] **Step 5: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new type errors referencing `reorderStroke`/`reorderStrokeList`/`stroke:reorder`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/hooks/useClassroomSession.ts
git commit -m "feat(classroom): add reorderStroke action to classroom session hook"
```

---

### Task 4: `ClassroomPdfViewer` — thread `onReorderStroke` prop through `ClassroomPdfPage`

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `hostActions.reorderStroke` (from Task 3), existing `Props`/`PageProps` interfaces, existing `onPaneUpdateShapeStroke`-style pane/mode dispatch pattern (lines 2592-2595 for reference)
- Produces: `Props.onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void`; `Props.onPaneReorderStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void`; `PageProps.onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void`

- [ ] **Step 1: Add `onReorderStroke`/`onPaneReorderStroke` to the outer `Props` interface**

In `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`, in the
`Props` interface, add these two lines immediately after
`onPaneUpdateShapeStroke` (line 153):

```ts
  onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
  onPaneReorderStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
```

- [ ] **Step 2: Add `onReorderStroke` to the `PageProps` interface**

In the same file, in the `PageProps` interface, add this line immediately
after `onUpdateShapeStroke` (line 1090):

```ts
  onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
```

- [ ] **Step 3: Destructure the new prop in `ClassroomPdfPage` and `ClassroomPdfViewer`**

In `ClassroomPdfPage`'s parameter destructuring (line 1104-1106), add
`onReorderStroke` to the list — the block currently reads:

```ts
function ClassroomPdfPage({
  pageNumber, url, notebook = false, notebookStyle = "grid", strokes, pointer, showPointer, editable, tool, showStylePanel, onActivate, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange,
  shapeStyle = DEFAULT_SHAPE_STYLE, onShapeStyleChange, onUpdateShapeStroke,
  onStrokeComplete, onMoveStroke, onUpdateTextStroke, onPointerMove, onEraseStroke, onSplitStroke, registerEl,
}: PageProps) {
```

change it to:

```ts
function ClassroomPdfPage({
  pageNumber, url, notebook = false, notebookStyle = "grid", strokes, pointer, showPointer, editable, tool, showStylePanel, onActivate, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange,
  shapeStyle = DEFAULT_SHAPE_STYLE, onShapeStyleChange, onUpdateShapeStroke,
  onStrokeComplete, onMoveStroke, onUpdateTextStroke, onPointerMove, onEraseStroke, onSplitStroke, onReorderStroke, registerEl,
}: PageProps) {
```

And in `ClassroomPdfViewer`'s destructuring (lines 2249-2253), add
`onReorderStroke, onPaneReorderStroke` immediately after
`onPaneUpdateShapeStroke` on line 2250 — change:

```ts
  hostScroll, rightHostScroll = null, onScrollChange, onPaneScrollChange, rightHostZoom = hostZoom, onPaneZoomChange, tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, shapeStyle, onShapeStyleChange, onUpdateShapeStroke, onPaneUpdateShapeStroke, onStrokeComplete, onMoveStroke, onPaneMoveStroke, onPaneStrokeComplete, onPointerMove,
```

to:

```ts
  hostScroll, rightHostScroll = null, onScrollChange, onPaneScrollChange, rightHostZoom = hostZoom, onPaneZoomChange, tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, shapeStyle, onShapeStyleChange, onUpdateShapeStroke, onPaneUpdateShapeStroke, onReorderStroke, onPaneReorderStroke, onStrokeComplete, onMoveStroke, onPaneMoveStroke, onPaneStrokeComplete, onPointerMove,
```

- [ ] **Step 4: Pass the dispatching callback down to `ClassroomPdfPage` in JSX**

In the `<ClassroomPdfPage ... />` JSX block (starts at line 2572), add this
immediately after the `onUpdateShapeStroke={...}` block (lines 2592-2595):

```tsx
                    onReorderStroke={(page, strokeIds, op) => {
                      if (displayLayout === "split") onPaneReorderStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, strokeIds, op);
                      else onReorderStroke?.(page, strokeIds, op);
                    }}
```

- [ ] **Step 5: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no new type errors — `onReorderStroke` prop is now defined and
threaded, but not yet called from any UI (that's Task 5/6), so it will show
as unused only if TS is configured to flag unused destructured props (it
generally is not for React props). Confirm no errors appear.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): thread onReorderStroke prop through ClassroomPdfViewer"
```

---

### Task 5: `TextStylePanel` and `ShapeStylePanel` — add Layers UI section

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `lucide-react` icons (already imported at line 2); existing panel prop patterns
- Produces: `TextStylePanelProps.onReorder: (op: "front" | "back" | "forward" | "backward") => void` (required, panel is only shown for an already-selected element); `ShapeStylePanelProps.onReorder: (op: "front" | "back" | "forward" | "backward") => void`

- [ ] **Step 1: Add layer icons to the lucide-react import**

Change the import at line 2 from:

```ts
import { AlignCenter, AlignLeft, AlignRight, Columns2, Minus, Move, Plus, Repeat2, RotateCcw as ResetZoom, Trash2 } from "lucide-react";
```

to:

```ts
import { AlignCenter, AlignLeft, AlignRight, BringToFront, ChevronsDown, ChevronsUp, Columns2, Minus, Move, Plus, Repeat2, RotateCcw as ResetZoom, SendToBack, Trash2 } from "lucide-react";
```

(`SendToBack` = send-to-back icon, `BringToFront` = bring-to-front icon,
`ChevronsDown`/`ChevronsUp` = send-backward/bring-forward one step. All
four are confirmed to exist in this project's installed `lucide-react`
version.)

- [ ] **Step 2: Add a shared `LAYER_OPTIONS` constant and `LayersSection` helper component**

Add this immediately before the `TextStylePanel` function definition (line
625), i.e. right after the `TEXT_ALIGN_OPTIONS` array (ends at line 602):

```tsx
const LAYER_OPTIONS: Array<{ value: "back" | "backward" | "forward" | "front"; label: string; icon: typeof SendToBack }> = [
  { value: "back", label: "Eng orqaga", icon: SendToBack },
  { value: "backward", label: "Orqaga", icon: ChevronsDown },
  { value: "forward", label: "Oldinga", icon: ChevronsUp },
  { value: "front", label: "Eng oldinga", icon: BringToFront },
];

// TextStylePanel va ShapeStylePanel'da baravar ishlatiladigan qatlam
// (z-order) tugmalari — 4 ta amal: eng orqaga/bir pog'ona orqaga/bir
// pog'ona oldinga/eng oldinga.
function LayersSection({ onReorder }: { onReorder: (op: "front" | "back" | "forward" | "backward") => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-gray-400">Qatlamlar</p>
      <div className="grid grid-cols-4 gap-1">
        {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onReorder(value)}
            className="flex items-center justify-center rounded-lg bg-gray-100 py-1.5 text-gray-600 transition-colors hover:bg-gray-200"
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `onReorder` to `TextStylePanelProps` and render `LayersSection`**

In `TextStylePanelProps` (lines 604-619), add this line immediately after
`onTextAlignChange` (line 614):

```ts
  onReorder: (op: "front" | "back" | "forward" | "backward") => void;
```

In the `TextStylePanel` function signature (lines 625-628), add `onReorder`
to the destructured props — change:

```ts
function TextStylePanel({
  color, fontFamily, fontSize, fontWeight, textAlign,
  onColorChange, onFontFamilyChange, onFontSizeChange, onFontWeightChange, onTextAlignChange, onDelete,
}: TextStylePanelProps) {
```

to:

```ts
function TextStylePanel({
  color, fontFamily, fontSize, fontWeight, textAlign,
  onColorChange, onFontFamilyChange, onFontSizeChange, onFontWeightChange, onTextAlignChange, onReorder, onDelete,
}: TextStylePanelProps) {
```

Then render `<LayersSection onReorder={onReorder} />` immediately before the
`{onDelete && (...)}` block — change (around lines 715-717):

```tsx
      </div>

      {onDelete && (
```

to:

```tsx
      </div>

      <LayersSection onReorder={onReorder} />

      {onDelete && (
```

- [ ] **Step 4: Add `onReorder` to `ShapeStylePanelProps` and render `LayersSection`**

In `ShapeStylePanelProps` (lines 780-795), add this line immediately after
`onOpacityChange` (line 794):

```ts
  onReorder: (op: "front" | "back" | "forward" | "backward") => void;
```

In the `ShapeStylePanel` function signature (lines 799-803), add `onReorder`
to the destructured props — change:

```ts
function ShapeStylePanel({
  color, backgroundColor, fillStyle, strokeWidth, strokeStyle, edges, opacity,
  onColorChange, onBackgroundColorChange, onFillStyleChange, onStrokeWidthChange,
  onStrokeStyleChange, onEdgesChange, onOpacityChange,
}: ShapeStylePanelProps) {
```

to:

```ts
function ShapeStylePanel({
  color, backgroundColor, fillStyle, strokeWidth, strokeStyle, edges, opacity,
  onColorChange, onBackgroundColorChange, onFillStyleChange, onStrokeWidthChange,
  onStrokeStyleChange, onEdgesChange, onOpacityChange, onReorder,
}: ShapeStylePanelProps) {
```

Then render `<LayersSection onReorder={onReorder} />` as the last section
before the closing `</div>` of the panel — change the end of the function
(lines 927-941) from:

```tsx
      {hasBackground && <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shaffoflik</p>
        <input
          aria-label="Shaffoflik"
          type="range"
          min={0}
          max={100}
          step={10}
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          className="classroom-opacity-slider w-full"
        />
      </div>}
    </div>
  );
}
```

to:

```tsx
      {hasBackground && <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shaffoflik</p>
        <input
          aria-label="Shaffoflik"
          type="range"
          min={0}
          max={100}
          step={10}
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          className="classroom-opacity-slider w-full"
        />
      </div>}

      <LayersSection onReorder={onReorder} />
    </div>
  );
}
```

Note: `ShapeStyleOnlyPanel` (a separate, pre-creation-only panel at line
961) is intentionally NOT touched — there is no stroke yet to reorder before
a shape exists.

- [ ] **Step 5: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: errors will appear at the two call sites of `<TextStylePanel />`
and `<ShapeStylePanel />` (around lines 2110 and 2189) complaining that
`onReorder` is missing — this is expected and fixed in the next task. Note
the exact error lines to confirm they match.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): add Layers section UI to TextStylePanel and ShapeStylePanel"
```

---

### Task 6: Wire `onReorder` at the single-selection call sites and add lasso-group layer buttons

**Files:**
- Modify: `apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx`

**Interfaces:**
- Consumes: `onReorderStroke` (from `ClassroomPdfPage` props, Task 4), `selectedText`/`selectedShape`/`selectedGroupIds` (existing local state in `ClassroomPdfPage`), `LayersSection`/`LAYER_OPTIONS` (from Task 5)
- Produces: none new — this is the final call-site wiring

- [ ] **Step 1: Wire `onReorder` on the `<TextStylePanel />` call site**

At the `<TextStylePanel ... />` JSX (lines 2110-2125), add an `onReorder`
prop immediately after `onTextAlignChange` (line 2120):

```tsx
              onTextAlignChange={(textAlign) => updateSelectedText({ textAlign })}
              onReorder={(op) => selectedText && onReorderStroke?.(pageNumber, [selectedText.id], op)}
```

- [ ] **Step 2: Wire `onReorder` on the `<ShapeStylePanel />` call site (selected-shape variant)**

At the second `<ShapeStylePanel ... />` JSX (the one guarded by
`tool === "select" && selectedShape`, lines 2189-2204), add an `onReorder`
prop immediately after `onOpacityChange` (line 2203):

```tsx
              onOpacityChange={(opacity) => updateSelectedShape({ opacity })}
              onReorder={(op) => selectedShape && onReorderStroke?.(pageNumber, [selectedShape.id], op)}
```

- [ ] **Step 3: Wire `onReorder` on the first `<ShapeStylePanel />` call site (pre-creation variant)**

At the first `<ShapeStylePanel ... />` JSX (guarded by
`showStylePanel && (tool === "rectangle" || tool === "ellipse") &&
!selectedShape`, lines 2133-2148), add a no-op `onReorder` immediately after
`onOpacityChange` (line 2147) — there is no stroke yet to reorder before one
is drawn:

```tsx
              onOpacityChange={(opacity) => onShapeStyleChange({ ...shapeStyle, opacity })}
              onReorder={() => {}}
```

- [ ] **Step 4: Add a layer button row to the lasso group-selection overlay**

In the lasso group overlay JSX (`{tool === "lasso" && selectedGroupBounds &&
(...)}`, lines 2207-2239), add a layer button row next to the existing
delete button. Change the block starting at line 2230 from:

```tsx
              <button
                type="button"
                aria-label="Tanlangan guruhni o'chirish"
                onClick={deleteSelectedGroup}
                className="pointer-events-auto absolute -top-9 left-1/2 -translate-x-1/2 rounded-full bg-red-500 p-1.5 text-white shadow-md hover:bg-red-600"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
```

to:

```tsx
              <div className="pointer-events-auto absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={() => onReorderStroke?.(pageNumber, [...selectedGroupIds], value)}
                    className="rounded-full bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-100"
                  >
                    <Icon size={13} />
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Tanlangan guruhni o'chirish"
                  onClick={deleteSelectedGroup}
                  className="rounded-full bg-red-500 p-1.5 text-white shadow-md hover:bg-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors — all `onReorder`/`onReorderStroke` usages are now
fully wired and typed.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/classroom/ClassroomPdfViewer.tsx
git commit -m "feat(classroom): wire layer reorder buttons for text, shape, and lasso group selections"
```

---

### Task 7: Wire `onReorderStroke`/`onPaneReorderStroke` from `ClassroomHostPage`

**Files:**
- Modify: `apps/frontend/src/pages/ClassroomHostPage.tsx:164-178` (near `onUpdateShapeStroke`/`onPaneUpdateShapeStroke`)

**Interfaces:**
- Consumes: `hostActions.reorderStroke` (from Task 3), `state.boardMode` (existing)
- Produces: none new — final host-side wiring

- [ ] **Step 1: Add `onReorderStroke`/`onPaneReorderStroke` props to `<ClassroomPdfViewer />`**

In `apps/frontend/src/pages/ClassroomHostPage.tsx`, add these two props
immediately after `onPaneUpdateShapeStroke` (line 165):

```tsx
          onReorderStroke={(page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, "left", state.boardMode)}
          onPaneReorderStroke={(pane, mode, page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, pane, mode)}
```

- [ ] **Step 2: Typecheck the frontend**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end verification**

Start both backend and frontend dev servers. Open the classroom as host in
one browser tab and as a student in a second tab (or private window) joined
to the same session.

1. Draw a rectangle and a text box that overlap. Select the rectangle,
   confirm the "Qatlamlar" section appears in `ShapeStylePanel` with 4
   icons. Click "Eng oldinga" (bring to front) — confirm the rectangle now
   renders on top of the text, and the student tab reflects the same order
   within ~1 second.
2. Select the text box, confirm the same 4 buttons appear in
   `TextStylePanel`, and "Eng orqaga" (send to back) moves it behind the
   rectangle on both tabs.
3. Lasso-select both elements together, confirm the floating layer button
   row appears next to the delete button on the group-selection overlay,
   and bring-to-front/send-to-back moves the whole group together (relative
   order between the rectangle and text within the group is preserved)
   while other strokes on the page are unaffected.
4. Resize the lasso-selected group again (this was Task 1's fix) and
   confirm the text font size now scales with the box.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/ClassroomHostPage.tsx
git commit -m "feat(classroom): wire reorderStroke host actions into ClassroomPdfViewer"
```
