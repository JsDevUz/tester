# Resume Free Lesson Design

## Goal

Let a teacher continue a previous free (groupless) lesson from where its
board was left — a new "Davom ettirish" (Continue) button on every row of
"Mening darslarim (erkin)" (the free-lesson history page,
`FreeClassHistoryPage.tsx`), regardless of that row's status (`active` or
`ended`). Clicking it, after a confirmation prompt, starts a brand-new live
free lesson whose board (PDF/notebook pages, all strokes, mode/layout) is
pre-loaded from the old lesson's last saved state, and immediately
navigates the teacher to that new lesson's host page.

This is architecturally "create a new session, then import an old
snapshot's board state into it," not a true resume of the same session —
a free session's live state exists only in server memory
(`ClassroomService`'s `sessions` Map) and is deleted the moment it ends;
only the persisted `ClassroomBoardSnapshot` (written to
`class_sessions.board_snapshot` by `endSession`) survives afterward. The
new lesson gets its own session ID and its own shareable link — the old
lesson's link is not redirected, and the old row stays in the history list
unchanged (no "continued to X" marker, no linkage recorded).

## Backend

New service method, sibling to the existing `createFreeSession`
(`apps/backend/src/classroom/classroom.service.ts:144`):

```ts
async createFreeSessionFromSnapshot(teacherId: string, sourceSessionId: string): Promise<{ id: string }>
```

Steps:

1. Load the source row: `db.query.classSessions.findFirst({ where:
   eq(classSessions.id, sourceSessionId) })`.
2. Reject (`NotFoundException`) if the row doesn't exist, if
   `row.teacherId !== teacherId` (only the lesson's own teacher may
   resume it — matches every other ownership check in this file), or if
   `row.boardSnapshot` is `null` (nothing to import).
3. Insert a new `class_sessions` row exactly as `createFreeSession` does
   (`courseId: null, teacherId`).
4. Build the new in-memory `ClassroomSession` the same way
   `createFreeSession` does, but instead of blank defaults, seed these
   fields from the parsed `ClassroomBoardSnapshot`
   (`apps/backend/src/classroom/classroom.types.ts:187`):
   - `pdfName: snapshot.pdfName`, `pdfPages: snapshot.pages`
   - `boardMode: snapshot.boardMode`, `boardLayout: snapshot.boardLayout`,
     `leftBoardMode: snapshot.leftBoardMode`, `rightBoardMode:
     snapshot.rightBoardMode`
   - `notebookStyle: snapshot.notebookStyle`, `notebookPageCount:
     snapshot.notebookPageCount`, `notebookPageStyles:
     snapshot.notebookPageStyles`
   - `strokesByMode`: a new `Map` with two entries, `'pdf'` and
     `'notebook'`, each built from `Object.entries(...)` of
     `snapshot.strokesByPage` (left/primary pane) — **not**
     `rightStrokesByPage`. Per this codebase's established invariant
     (documented at `classroom.logic.ts`'s `strokeMapFor`), strokes are
     pooled by *mode*, shared across left/right panes, not by pane —
     `strokesByPage` already holds whichever mode `boardMode` was active
     in, so it seeds that mode's pool; `rightStrokesByPage` seeds
     whichever mode `rightBoardMode` was (if different from `boardMode`,
     both pools get populated; if the snapshot was taken in `single`
     layout, `rightBoardMode === boardMode` and both snapshot fields
     describe the same pool — merge with `strokesByPage` taking
     precedence, since it's always populated, while `rightStrokesByPage`
     may be stale/empty in single layout).
   - `currentPage: 1` (start at the first page, matching
     `createFreeSession`'s existing default — not the old lesson's exact
     last-viewed page, which isn't meaningful in a freshly-started
     session with no live viewer position yet).
   - `undoStack`/`redoStack`: left undefined (fresh history — the new
     lesson's undo/redo starts empty, matching `createFreeSession`'s
     existing lack of these fields).
   - Everything else (`participants: new Map()`, `startedAtMs: Date.now()`,
     `zoom: 1`, `scroll: null`, etc.) exactly as `createFreeSession`
     already sets it.
5. Return `{ id: newRow.id }`.

New REST route, sibling to the existing `POST /classroom/sessions/free`
(`apps/backend/src/classroom/classroom.controller.ts:47`):

```ts
@Post('sessions/free/from/:sourceSessionId')
@Roles('teacher', 'super')
async createFreeSessionFromSnapshot(@Param('sourceSessionId', ParseUUIDPipe) sourceSessionId: string, @Req() req: any) {
  return this.classroomService.createFreeSessionFromSnapshot(req.admin.id, sourceSessionId);
}
```

## Frontend

`apps/frontend/src/api/classroom.ts` gets a new client function, sibling
to `apiCreateFreeClassSession`:

```ts
export async function apiCreateFreeClassSessionFromSnapshot(sourceSessionId: string): Promise<{ id: string }> {
  const res = await client.post(`/classroom/sessions/free/from/${sourceSessionId}`);
  return res.data;
}
```

`FreeClassHistoryPage.tsx` gets a new button per row (a step-forward icon,
e.g. `SkipForward` from `lucide-react`, matching this file's existing
icon-plus-label button style), shown whenever `item.hasBoardSnapshot` is
`true` — regardless of `item.status` (`active` or `ended`), per this
spec's confirmed scope. Clicking it opens a small confirmation modal
("Shu darsni davom ettirasizmi?" / Bekor qilish / Davom ettirish), styled
like this codebase's existing confirm patterns (e.g.
`ClassroomToolbar.tsx`'s `confirmClearOpen` modal). Confirming calls
`apiCreateFreeClassSessionFromSnapshot(item.id)`, then
`navigate(`/classroom-host/${result.id}`)` on success, or a toast error on
failure (matching this page's existing `toast.error(...)` pattern for load
failures).

## Out of Scope

- Redirecting the old lesson's shareable link to the new session.
- Recording/marking a link between the old and new lesson rows in the
  history list, or in the database.
- Restoring the exact `currentPage`/`scroll`/`zoom` the old lesson was at
  when it ended — the new lesson starts at page 1, default zoom, matching
  how every other new session already starts.
- Applying this to group (course-bound) lessons — free lessons only, per
  this spec's scope (`FreeClassHistoryPage.tsx` is free-lesson-only
  already).
- Preserving the old lesson's `recordingMode`/audio recording state into
  the new session — the new lesson starts with no recording mode selected,
  same as any freshly-created free lesson.
