# Classroom Page Removal Design

## Goal

Let a teacher delete a single page (PDF or notebook) from a live lesson
board, with a confirmation prompt, synced live to all students. Deleting a
page reindexes every later page (and its strokes) down by one, so a
teacher who mis-imported a page — or wants to drop a page mid-lesson — can
clean it up without restarting the session.

A "+" button to add pages is explicitly out of scope for this spec; it
will be designed separately later.

## Data Model Changes

### Notebook page count becomes variable

Today, `NOTEBOOK_PAGE_COUNT = 4` (`apps/backend/src/classroom/classroom.logic.ts:15`)
is a hardcoded constant used only in `isValidPage`. This spec removes that
constant entirely and replaces it with a per-session field, since notebook
pages aren't a file — they're just an empty template count that can now
grow or shrink independently per session.

Add to `ClassroomSession` (`apps/backend/src/classroom/classroom.types.ts`):

```ts
// Daftar (notebook) sahifalari soni — PDF'dan farqli, bular fayldan
// kelmaydi (faqat bo'sh shablon), shuning uchun massiv emas, oddiy son.
// Standart 4, sahifa o'chirilganda kamayadi.
notebookPageCount: number;
```

Default `4` wherever a new session is constructed (matching today's
`NOTEBOOK_PAGE_COUNT` default), and included in `ClassroomSnapshot`
(`notebookPageCount: number`, required) the same way `zoom`/`splitRatio`
already are, so a late-joining client gets the correct count.

`isValidPage` (`classroom.logic.ts`) changes from:

```ts
export function isValidPage(session: ClassroomSession, page: number): boolean {
  const pageCount = (session.boardMode ?? 'pdf') === 'notebook'
    ? NOTEBOOK_PAGE_COUNT
    : session.pdfPages.length;
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}
```

to reading `session.notebookPageCount` instead of the constant.

### Frontend mirrors the same field

`useClassroomSession.ts`'s `ClassroomState` and `useClassroomReplay.ts`'s
replay state both gain `notebookPageCount: number` (default `4`),
following the exact same threading pattern already established for
`splitRatio` (session field → snapshot → socket sync → state → prop).

`ClassroomPdfViewer.tsx`'s `visiblePageCount` function:

```ts
const visiblePageCount = (mode: CsBoardMode) => mode === "notebook" ? 4 : pageUrls.length;
```

becomes:

```ts
const visiblePageCount = (mode: CsBoardMode) => mode === "notebook" ? notebookPageCount : pageUrls.length;
```

where `notebookPageCount` is a new required prop threaded through from
`state.notebookPageCount` on both `ClassroomHostPage.tsx` and
`ClassroomStudentPage.tsx`, matching the `hostSplitRatio` prop pattern.

## Backend: `removePage`

New method on `ClassroomService`, following the exact synced-mutation
shape already used by `setSplitRatio`/`setZoom` (host-only guard → mutate
→ record history → broadcast):

```ts
removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number, pane: 'left' | 'right' = 'left'): void
```

`pageIndex` is 1-indexed, matching every other page-number parameter in
this codebase (`currentPage`, `setPage`, etc.).

Steps:

1. `const s = this.requireHost(sessionId, userId);`
2. Validate `pageIndex` is a valid page for `mode` via the *current*
   `isValidPage`-equivalent check for that mode (reject with a thrown
   error if out of range — matching how other mutations reject invalid
   input in this file, e.g. `setPage`'s `INVALID_PAGE` throw).
3. **Minimum-one-page guard**: if the page count for `mode` is already 1,
   throw (reject the removal) — a board must always have at least one
   page. The frontend also disables the trash button in this case (belt
   and suspenders, matching how `splitRatio` clamps on both sides).
4. Remove the page:
   - `mode === 'pdf'`: `s.pdfPages.splice(pageIndex - 1, 1)`.
   - `mode === 'notebook'`: `s.notebookPageCount -= 1`.
5. **Reindex strokes**: get `s.strokesByMode.get(mode)` (the
   `Map<number, ClassroomStroke[]>` for that mode — note this map is keyed
   by page number and shared across left/right panes per the existing
   `strokeMapFor`/`activeStrokeMap` design, so `pane` is not used to select
   a different stroke pool, only for the broadcast payload). Build a new
   map: entries with a key less than `pageIndex` are copied unchanged;
   entries with a key equal to `pageIndex` are dropped (that page's
   strokes are gone); entries with a key greater than `pageIndex` are
   re-inserted under `key - 1`. Replace `strokesByMode.get(mode)` with
   this rebuilt map (and if `mode === s.boardMode`, also update
   `s.strokesByPage` to point at the same rebuilt map, mirroring what
   `activeStrokeMap` already keeps in sync).
6. **Reindex `currentPage`**: if `s.currentPage > pageIndex`, decrement it
   by 1. If `s.currentPage === pageIndex` and it was the last page (now
   out of range after removal), clamp it to the new last page (`new page
   count`). Otherwise leave it unchanged.
7. Build `payload = { mode, pageIndex, pane }`, call
   `this.recordHistoryEvent(s, 'page:remove', payload)`, then
   `this.broadcaster.toRoom(s.id, 'page:remove', payload)`.

## Frontend: socket handling and reindex mirroring

`useClassroomSession.ts` adds a `socket.on("page:remove", ...)` listener
(with matching `socket.off` in cleanup) that applies the identical
reindexing logic described in steps 4-6 above to the client-side
`ClassroomState` — this must exactly mirror the backend's page-count
mutation, stroke-map reindexing, and `currentPage` adjustment, since the
socket event carries only `{ mode, pageIndex, pane }`, not a full
recomputed snapshot (matching how other fine-grained sync events like
`stroke:add`/`page:clear` work today — the client reducer re-derives state
from a small payload rather than receiving a full snapshot each time).

`useClassroomReplay.ts` gets a matching `"page:remove"` entry in its
`REDUCERS` map, so replaying a lesson correctly shows pages disappearing
at the point they were removed, applying the same reindex logic to the
replay's reconstructed state.

`hostActions` in `useClassroomSession.ts` gains:

```ts
removePage: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right" = "left") =>
  emitHost("host:removePage", { mode, pageIndex, pane }),
```

Backend gateway (`classroom.gateway.ts`) adds:

```ts
@SubscribeMessage('host:removePage')
removePage(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook'; pageIndex: number; pane?: 'left' | 'right' }) {
  return this.run(() => {
    const user = this.verify(body.token);
    this.classroomService.removePage(body.sessionId, user.sub, body.mode, body.pageIndex, body.pane ?? 'left');
  });
}
```

## Frontend UI: trash icon and confirmation

In `ClassroomPdfViewer.tsx`'s `ClassroomPdfPage` component (the
per-page render), add a small trash icon anchored at the bottom of each
rendered page, visible only when `isHost` is true. Clicking it opens a
confirmation dialog: "`{pageNumber}`-sahifani darsdan o'chirasizmi?" with
"Ha" / "Yo'q" actions (styling matches this codebase's existing confirm
patterns, e.g. the folder/test delete confirmations used elsewhere in the
app — a simple centered modal, not a new design system).

Confirming calls `hostActions.removePage(paneMode, pageNumber, pane)`
where `pane` is `"left"` or `"right"` depending on which split pane
(or `"left"` in single/non-split layout) the page belongs to.

The trash icon is hidden (or disabled) when `visiblePageCount(mode) <= 1`
for that mode — the frontend never lets the teacher even attempt to
remove the last page, though the backend enforces this independently as
the authoritative guard.

## Out of Scope

- No "+" add-page button — deferred to a future spec.
- No undo for page removal — once confirmed and broadcast, it's final for
  that session (matching how `page:clear`/`stroke` removal in this
  codebase already work — no undo history beyond the existing per-stroke
  undo stack, which does not cover page-level operations).
- No changes to how PDF pages are originally attached
  (`attachPdfFromLibrary`) — this spec only adds removal of an already-
  attached page.
- No persistence of `notebookPageCount` to Postgres beyond the existing
  in-memory session + history-event replay log, matching `zoom`/`scroll`/
  `splitRatio`.
