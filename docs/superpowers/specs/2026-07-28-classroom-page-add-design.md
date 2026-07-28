# Classroom Page Add Design

## Goal

Let a teacher add a new page (PDF or notebook) to a live lesson board,
mid-lesson, inserted right after any existing page — mirroring the
just-shipped page-removal feature. Deleting a page reindexes later pages
down; adding a page reindexes later pages up. Together the two features
let a teacher freely curate the board's page list during a live lesson.

This is the deferred "+" button from the page-removal spec
(`2026-07-28-classroom-page-removal-design.md`), now designed on its own.

## Data Model Changes

### Notebook page style becomes per-page, not session-wide

Today, `session.notebookStyle` (`'grid' | 'lined' | 'plain'`,
`apps/backend/src/classroom/classroom.types.ts:117`) is a single
session-wide setting applied to every notebook page uniformly, changed via
`host:setNotebookStyle` → `ClassroomService.setNotebookStyle`
(`classroom.service.ts:453`) → broadcast `notebookStyle:set`. Every
notebook page reads the same value.

This spec makes style a per-page property, since pages added at different
times can now have different styles. Add to `ClassroomSession`:

```ts
// Har bir daftar sahifasining o'z naqshi — sahifa raqami -> naqsh.
// Kalit yo'q sahifalar eski umumiy notebookStyle'ni meros qiladi (orqaga
// moslik: page-add funksiyasidan oldin yaratilgan barcha sahifalar).
notebookPageStyles?: Record<number, ClassroomNotebookStyle>;
```

Resolve a page's style as `session.notebookPageStyles?.[page] ??
session.notebookStyle ?? 'grid'`. Add the same field (required, defaulting
to `{}`) to `ClassroomSnapshot` and `ClassroomBoardSnapshot`.

**`host:setNotebookStyle` and the global style picker are removed.** The
"⋮" overflow menu's "Daftar: Katakli / Yo'l-yo'l / Naqshsiz" rows go away
entirely — there is no longer a "change every page's style at once"
action. Existing sessions keep working because of the `?? 'grid'`
fallback chain; no migration needed since sessions are in-memory only.

### `session.pdfName` becomes advisory only

Once pages can be appended from a different library asset than the one
that originally attached the PDF, `pdfPages: string[]` may contain pages
from multiple source files. `pdfName` stays as a display label (whatever
the most recent full-attach or first-attach set it to) but is no longer a
reliable description of every page in `pdfPages`. No code currently
depends on `pdfName` matching every page's origin (confirmed: it's only
used for display and for the board-export file name), so this requires no
structural change — just a note that it's advisory, not authoritative.

## Backend: PDF page insertion

New REST method on `ClassroomService`, sibling to the existing
`attachPdfFromLibrary` (`classroom.service.ts:174`) but appending instead
of replacing:

```ts
async insertPdfPagesFromLibrary(
  sessionId: string, teacherId: string, teacherRole: string,
  mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
): Promise<{ pages: string[] }>
```

`afterPageIndex` is 0 for "insert at the very start" and `pdfPages.length`
for "insert at the very end" — i.e. it's the same convention as
`Array.splice`'s insertion index, matching how `removePageFromSession`
already treats page positions. The frontend always passes "the page the
teacher clicked '+' under" as this index (so clicking '+' under page 3
inserts starting at index 3, making the new page(s) numbered 4, 5, ...).

Steps (mirroring `attachPdfFromLibrary`'s validation, `removePageFromSession`'s
reindex-in-reverse shape):

1. `requireHost`-equivalent check (`s.hostUserId !== teacherId` → `ForbiddenException`).
2. Resolve `pageNumbers` against the source asset via
   `this.mediaLibrary.getPdfPages(mediaAssetId, teacherId, teacherRole)`
   exactly as `attachPdfFromLibrary` does — same "not ready" / "no pages"
   / "invalid page number" rejections.
3. `const newPages = uniqueSorted.map((n) => allPages[n - 1]);`
4. Validate `afterPageIndex`: integer, `0 <= afterPageIndex <=
   s.pdfPages.length` — reject (`ConflictException`) otherwise.
5. `s.pdfPages.splice(afterPageIndex, 0, ...newPages);`
6. **Reindex strokes**: get the pdf stroke map
   (`strokeMapFor(s, 'pdf')`). Build a new map: keys `<= afterPageIndex`
   copied unchanged; keys `> afterPageIndex` shift up by `newPages.length`
   (the exact inverse of `removePageFromSession`'s downward shift). No
   page loses strokes — this is a pure reindex, nothing is dropped.
7. **Reindex `currentPage`**: if `s.currentPage > afterPageIndex`,
   `s.currentPage += newPages.length`. Otherwise unchanged.
8. Persist `pdfPages` to `class_sessions.pdf_pages` (same DB write
   `attachPdfFromLibrary` already does, since this table column is the
   durable copy).
9. `payload = { pages: newPages, afterPageIndex }`; call
   `this.recordHistoryEvent(s, 'pdf:insert', payload)`, then
   `this.broadcaster.toRoom(sessionId, 'pdf:insert', payload)`.

This is a REST endpoint (not a socket message), matching
`attachPdfFromLibrary`'s existing transport — it needs the same
`mediaLibrary.getPdfPages` async DB/storage lookup that socket handlers in
this codebase don't perform.

## Backend: Notebook page insertion

New socket-driven method on `ClassroomService`, the mirror image of
`removePage`:

```ts
insertNotebookPage(
  sessionId: string, userId: string, afterPageIndex: number,
  style: ClassroomNotebookStyle, pane: 'left' | 'right' = 'left',
): void
```

Steps:

1. `const s = this.requireHost(sessionId, userId);`
2. Validate `afterPageIndex`: integer, `0 <= afterPageIndex <=
   (s.notebookPageCount ?? 4)` — throw `INVALID_PAGE_INSERT` otherwise.
3. `s.notebookPageCount = (s.notebookPageCount ?? 4) + 1;`
4. **Reindex `notebookPageStyles`**: build a new map — keys `<=
   afterPageIndex` unchanged; keys `> afterPageIndex` shift up by 1. Then
   set `notebookPageStyles[afterPageIndex + 1] = style` (the new page's
   own style).
5. **Reindex strokes**: same upward-shift rebuild as the PDF path, against
   `strokeMapFor(s, 'notebook')` — keys `> afterPageIndex` shift up by 1
   (there's nothing to move INTO the new page's slot; it starts empty).
   Mirror into `s.strokesByPage` if `session.boardMode === 'notebook'`,
   exactly as `removePageFromSession` already does for the mode-vs-active
   check.
6. **Reindex `currentPage`**: if `s.currentPage > afterPageIndex`,
   increment by 1.
7. `payload = { mode: 'notebook', afterPageIndex, style, pane }`; call
   `this.recordHistoryEvent(s, 'page:insert', payload)`, then
   `this.broadcaster.toRoom(s.id, 'page:insert', payload)`.

Gateway (`classroom.gateway.ts`) adds, mirroring `host:removePage`:

```ts
@SubscribeMessage('host:insertNotebookPage')
insertNotebookPage(@MessageBody() body: BaseBody & {
  afterPageIndex: number; style: 'grid' | 'lined' | 'plain'; pane?: 'left' | 'right';
}) {
  return this.run(() => {
    const user = this.verify(body.token);
    this.classroomService.insertNotebookPage(
      body.sessionId, user.sub, body.afterPageIndex, body.style, body.pane ?? 'left',
    );
  });
}
```

## Frontend: socket handling and reindex mirroring

`useClassroomSession.ts` adds two listeners, each applying the identical
upward-shift reindex logic described above to `ClassroomState`:

- `socket.on("pdf:insert", ...)` — splices `pages` at `afterPageIndex`,
  shifts `strokesByPage`/`rightStrokesByPage` keys `> afterPageIndex` up
  by `pages.length` inserted, adjusts `currentPage`.
- `socket.on("page:insert", ...)` — increments `notebookPageCount`, shifts
  `notebookPageStyles` keys up by 1 and sets the new page's style, shifts
  the relevant pane's stroke pool up by 1, adjusts `currentPage`. Gated by
  the same mode-vs-pane guard `applyPageRemove` already has (`p.mode !==
  (right ? s.rightBoardMode : s.leftBoardMode)` → no-op), for the same
  split-layout-safety reason.

`useClassroomReplay.ts` gets matching `"pdf:insert"` / `"page:insert"`
entries in its `REDUCERS` map, reusing the same reducer functions by
reference (as `"page:remove"` already does for `applyPageRemove`), so
replaying a lesson correctly shows pages appearing at the point they were
added.

`hostActions` gains:

```ts
insertNotebookPage: (afterPageIndex: number, style: CsNotebookStyle, pane: "left" | "right" = "left") =>
  emitHost("host:insertNotebookPage", { afterPageIndex, style, pane }),
```

(PDF insertion goes through the existing REST client pattern — a new
`apiInsertClassPdfPages(sessionId, assetId, pageNumbers, afterPageIndex)`
function alongside the existing `apiAttachClassPdf`, not a `hostActions`
socket emit.)

## Frontend UI

### Per-page "+" button

In `ClassroomPdfPage` (`ClassroomPdfViewer.tsx`), add a small "+" button
next to the existing trash button (same bottom-right cluster, host-only).
No confirmation dialog — adding a page is non-destructive, unlike removal.

**PDF mode:** clicking "+" opens the existing
`ClassroomPdfLibraryModal` → `PdfPageSelectModal` two-step flow (any
library asset, not just the currently-attached one), with
`afterPageIndex` fixed to the clicked page's number for the lifetime of
that modal flow. Confirming calls the new
`apiInsertClassPdfPages(sessionId, assetId, pageNumbers, afterPageIndex)`.

**Notebook mode:** clicking "+" opens a small popup (anchored to the
button, not a full modal) with 3 icon options — Katakli (grid) / Yo'l-yo'l
(lined) / Naqshsiz (plain). Clicking one immediately calls
`hostActions.insertNotebookPage(afterPageIndex, style, pane)` and closes
the popup — no separate confirm step.

### "⋮" overflow menu: remove the global style picker

Delete the "Daftar: Katakli / Yo'l-yo'l / Naqshsiz" three rows from
`ClassroomCallBarMenu.tsx` (added earlier this session for the same
menu). `host:setNotebookStyle` and `ClassroomService.setNotebookStyle`
are deleted from the backend (dead code once nothing calls them); existing
`notebookStyle:set` history-event replay handling can stay harmless-inert
in `useClassroomReplay.ts` (older recorded sessions may still contain this
event type) or be removed if confirmed unreachable — implementer's call
during the plan, not a design-level requirement either way.

## Out of Scope

- No removal-undo interaction between add/remove (e.g. "undo last
  removal" is not the same as "add a page back") — add and remove remain
  fully independent operations.
- No drag-to-reorder pages — insertion position is exclusively "after the
  page whose '+' was clicked."
- No per-page style editing after the page is added (changing an existing
  page's notebook style post-creation is not in scope — only chosen at
  add-time).
- No changes to `pdfName`'s display beyond treating it as advisory (no new
  "mixed sources" UI indicator).
