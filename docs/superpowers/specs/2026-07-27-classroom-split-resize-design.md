# Classroom Split-Panel Resize Design

## Goal

In the classroom board's split-screen layout (two panes side by side —
left/right), the teacher can currently only see a fixed 50/50 split. This
adds a draggable divider so the teacher can resize the two panes (e.g.
70/30), synced live to every connected student. A student in "free move"
mode (not synced to the teacher) can independently drag the divider on
their own screen without affecting anyone else.

## Data Model (backend)

Add `splitRatio: number` to the in-memory `ClassroomSession` state
(`apps/backend/src/classroom/classroom.service.ts`), alongside the
existing `zoom`/`rightZoom`/`scroll` fields. Represents the left pane's
share of the total width, clamped to `[0.2, 0.8]`. Default `0.5`.

Add `splitRatio?: number` to `CsSnapshot`
(`apps/backend/src/classroom/classroom.types.ts`), populated as
`session.splitRatio ?? 0.5` wherever snapshots are built (mirroring how
`zoom`/`scroll` are already included).

## Backend API

New socket event `host:setSplitRatio`, following the exact shape of the
existing `host:setZoom`:

- Gateway (`classroom.gateway.ts`): `@SubscribeMessage('host:setSplitRatio')`
  handler taking `{ sessionId, token, ratio: number }`, verifying the token
  and calling `classroomService.setSplitRatio(sessionId, user.sub, ratio)`.
- Service (`classroom.service.ts`): `setSplitRatio(sessionId, userId, ratio)`
  — calls `requireHost` (host-only, same guard as `setZoom`), clamps
  `ratio` to `[0.2, 0.8]` via `Math.min(0.8, Math.max(0.2, ratio))`, sets
  `s.splitRatio = clamped`, records a `splitRatio:set` history event via
  `recordHistoryEvent`, and broadcasts `splitRatio:set` with `{ ratio: clamped }`
  to the room via `this.broadcaster.toRoom`.

Recording this as a history event means replay sessions correctly show the
pane widths the teacher used at each point in the lesson, consistent with
how zoom/scroll changes are replayed today.

## Frontend

### `useClassroomSession.ts`

- Add `splitRatio: number` to `ClassroomState`, default `0.5` in `INITIAL`.
- In the `join()` success handler, set `splitRatio: snap.splitRatio ?? 0.5`.
- Add a socket listener: `socket.on("splitRatio:set", (p: { ratio: number }) => setState((s) => ({ ...s, splitRatio: p.ratio })))`,
  registered and torn down alongside the existing `zoom:set` listener.
- Add `setSplitRatio: (ratio: number) => emitHost("host:setSplitRatio", { ratio })`
  to `hostActions`, matching `setZoom`'s shape.

### `ClassroomPdfViewer.tsx`

- New prop `hostSplitRatio: number` (matching the existing `hostZoom`/
  `rightHostZoom` naming convention — `ClassroomHostPage`/`ClassroomStudentPage`
  both pass `state.splitRatio` under this prop name) and
  `onSetSplitRatio?: (ratio: number) => void` (host-only setter, undefined
  for students).
- `synced` is already local component state in `ClassroomPdfViewer`
  (`const [synced, setSynced] = useState(!noSync)` — not a prop passed in
  from the page), toggled by the existing `toggleSynced`/move button. New
  local state `localSplitRatio` (used only when `!isHost && !synced`, i.e.
  the student has toggled free-move mode) — initialized from the incoming
  `hostSplitRatio` prop but only updated locally while dragging, never
  emitted to the server.
- The effective ratio used for layout is: `isHost ? hostSplitRatio : (synced ? hostSplitRatio : localSplitRatio)`.
- Where the two panes currently each get `flex: "1 1 0%"` (hard 50/50),
  change to `flex: \`0 0 ${effectiveRatio * 100}%\`` for the left pane
  (`paneIndex === 0`) and `flex: \`0 0 ${(1 - effectiveRatio) * 100}%\`` for
  the right pane (`paneIndex === 1`).
- Add a divider element between the two panes: a thin (`w-1.5`) vertical
  bar that widens slightly on hover (`hover:w-2`), styled
  `bg-gray-200/70 hover:bg-indigo-300 transition-all`, cursor
  `col-resize`. Pointer drag handling (`onPointerDown` starts tracking,
  `onPointerMove` computes the new ratio from the pointer's X position
  relative to the split container's `getBoundingClientRect()`, clamped to
  `[0.2, 0.8]`, `onPointerUp` ends tracking) updates either
  `onSetSplitRatio` (host — emits to server) or `localSplitRatio` (student
  in free-move mode — local only), matching the same enable condition as
  the effective-ratio calculation above.
- When dragging is not permitted (student synced to host), the divider
  still renders (so pane proportions are visually clear) but has no
  pointer handlers attached and uses `cursor: default`.

### Pass-through

`ClassroomHostPage.tsx` passes `hostSplitRatio={state.splitRatio}` and
`onSetSplitRatio={hostActions.setSplitRatio}` into `ClassroomPdfViewer`.
`ClassroomStudentPage.tsx` passes `hostSplitRatio={state.splitRatio}` only
(no setter — `ClassroomPdfViewer`'s own internal `synced` state already
determines whether free-move local dragging is allowed).

## Why this is safe for sync

`ClassroomPdfPage`'s canvas render already reads its container's real
pixel width via `ResizeObserver` (confirmed at
`ClassroomPdfViewer.tsx:1313`), not a hardcoded reference width. Changing
a pane's `flex-basis` only changes that container's pixel width — the
canvas re-measures and re-renders at the new size automatically. Stroke
coordinates are stored normalized (0–1 relative to page width/height, per
the existing `drawStroke(ctx, s, w, h, ...)` signature), so they are
unaffected by the pane's width; only the pixel scale they're drawn at
changes, exactly as it already does when the browser window itself
resizes.

## Out of Scope

- No changes to the single (non-split) layout.
- No changes to zoom, scroll, or stroke sync logic — this only adds one
  new synced number (`splitRatio`) following the existing `zoom` pattern
  exactly.
- No persistence beyond the in-memory session (matches how `zoom`/`scroll`
  already work — not stored in Postgres, only in the live session and its
  history-event replay log).
