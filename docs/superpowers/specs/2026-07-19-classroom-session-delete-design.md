# Classroom Session Delete — Design Spec

**Goal:** Let a teacher permanently delete an ended, course-linked class session from the "Jonli darslar" (attendance) page — removing the DB row, its recorded audio file, and any "Jonli dars" lesson blocks that reference it. PDF pages are never touched (they're shared media-library assets, not session-owned files).

## Context

This builds on the just-shipped Classroom Replay feature (`docs/superpowers/specs/2026-07-19-classroom-replay-design.md`, `docs/superpowers/plans/2026-07-19-classroom-replay.md`). That work added:
- `class_sessions.history_events` / `recording_url` / `recording_status` / `egress_id` columns
- `content_blocks.class_session_id` (nullable FK, `onDelete: 'set null'`)
- `ClassroomRecordingService` (LiveKit Egress, writes audio to `classroom-recordings/{sessionId}.ogg` in the shared object-storage bucket)
- `CourseClassesPage.tsx`'s attendance detail modal, which already has a "Replay ko'rish" button shown only for `status === 'ended'` sessions

This spec adds a sibling "O'chirish" (delete) action in the same modal.

## Key Finding: PDF pages are NOT session-owned

`class_sessions.pdfPages` stores URLs to pages that live in the shared media library (`media_assets` → `getPdfPages`), not files scoped to the session. The same PDF can be attached to multiple class sessions across multiple courses. **Deleting a session must never delete these files** — doing so would silently break other sessions/lessons referencing the same PDF. Only the session's own audio recording (`classroom-recordings/{sessionId}.ogg`, one file per session, never shared) is safe to delete.

## Scope

**In scope:**
- Backend: `ClassroomService.deleteSession(sessionId, callerId)` + `DELETE /classroom/sessions/:id` route
- Frontend: `apiDeleteClassSession` client function, a "O'chirish" button in `CourseClassesPage.tsx`'s attendance modal

**Out of scope:**
- Deleting PDF/media-library files (explicitly never touched)
- Deleting active (non-ended) sessions
- Any deletion from the replay page itself (only from the attendance/history list)
- Bulk delete / delete-many
- Soft-delete or undo (this is a hard, irreversible delete)

## Authorization & Preconditions

- Caller must be the owning teacher (`course.adminId === callerId`) — mirrors `getReplay`'s existing authorization pattern. No student or other-course-teacher access.
- Session must have `status === 'ended'`. Attempting to delete an active session throws `ConflictException`.
- Route-level `@Roles('teacher', 'super')` (matches existing conventions on sibling classroom routes); service-level check still enforces course ownership for `teacher` role — `super` is the existing admin-override role used elsewhere in this controller and bypasses the ownership check the same way it does on other classroom routes.

## Backend Design

**New method in `ClassroomService`** (near `getReplay`):

```ts
async deleteSession(sessionId: string, callerId: string): Promise<void> {
  const row = await db.query.classSessions.findFirst({
    where: eq(classSessions.id, sessionId),
    with: { course: true },
  });
  if (!row) throw new NotFoundException('Dars topilmadi');
  const course = row.course as unknown as { adminId: string };
  if (course.adminId !== callerId) throw new ForbiddenException();
  if (row.status !== 'ended') throw new ConflictException('Faqat yakunlangan darsni o\'chirish mumkin');

  // Best-effort: recording file cleanup must never block the DB delete.
  // A missing/already-gone file, or storage being unconfigured, is not
  // an error here — the session record removal is what matters.
  if (row.recordingStatus === 'ready' && row.recordingUrl) {
    try {
      await this.storage.deleteFile(`classroom-recordings/${sessionId}.ogg`);
    } catch (e) {
      console.error(`deleteSession: failed to delete recording for ${sessionId}`, e);
    }
  }

  // Linked "Jonli dars" lesson blocks are removed together with the
  // session — an orphaned block (classSessionId nulled via the FK's
  // onDelete:'set null') would otherwise render broken in the lesson.
  await db.delete(contentBlocks).where(eq(contentBlocks.classSessionId, sessionId));
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  // attendanceRecords cascade-deletes via classSessions FK (onDelete: 'cascade') — no extra query needed.
}
```

Notes:
- `StorageService` is not currently injected into `ClassroomService` — it needs to be added to the constructor (it's already provided by `StorageModule`, which `ClassroomModule` already imports for other reasons per the replay plan's Task 5 wiring, so no new module import should be needed — confirm at implementation time).
- Deletion order matters: recording file best-effort cleanup first (non-blocking, logged-only failure), then `content_blocks` (child), then `class_sessions` (parent) — deleting the parent first would immediately null the child FK before the explicit delete runs, which still works correctly but is less explicit about intent; deleting content_blocks first keeps the operation's intent clear in the code.
- No transaction wrapping is introduced beyond what Drizzle's default (non-transactional, sequential) queries already do — consistent with the rest of `ClassroomService`, which doesn't use explicit transactions elsewhere either.

**Controller route** (near the replay route):

```ts
@Delete('sessions/:id')
@Roles('teacher', 'super')
deleteSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
  return this.classroomService.deleteSession(id, req.admin.id);
}
```

## Frontend Design

**API client** (`api/classroom.ts`, near `apiClassReplay`):

```ts
export async function apiDeleteClassSession(sessionId: string): Promise<void> {
  await client.delete(`/classroom/sessions/${sessionId}`);
}
```

**UI** (`components/course/CourseClassesPage.tsx`, attendance detail modal header — same row as the existing "Replay ko'rish" button, both gated on `detail.status === 'ended'`):

- A "O'chirish" button (trash icon, red/destructive styling to visually distinguish from "Replay ko'rish") appears next to the replay button.
- On click: `window.confirm("Bu darsni o'chirmoqchimisiz? Chizma tarixi va audio yozuv butunlay yo'qoladi, qaytarib bo'lmaydi.")`. This is a deliberately minimal confirmation — the codebase has no existing custom confirm-modal pattern (block deletion elsewhere in this app has no confirmation at all), so a browser-native `confirm()` is the appropriate level of friction here: consistent with "don't over-build," while still being strictly more protection than the zero confirmation used elsewhere.
- On confirm: call `apiDeleteClassSession(detail.id)`, then close the modal (`setDetail(null)`) and remove the session from whatever local list state renders the sessions (find the existing list-refresh pattern used after other mutations on this page, e.g. how attendance status updates refresh the list, and follow it — likely a refetch or an optimistic local filter).
- On API error: surface via whatever existing toast/error pattern this page already uses for other mutations (find and reuse it — don't introduce a new one).

## Testing

- Backend: TDD per existing `classroom.service.spec.ts` conventions — cover (1) happy path deletes the session, its content blocks, and calls `storage.deleteFile` with the expected key; (2) non-owning teacher gets `ForbiddenException`; (3) active session gets `ConflictException`; (4) recording deletion failure (mocked to throw) does not prevent the DB delete from completing (best-effort semantics). A `StorageService` mock will need to be added to this spec file's existing `ClassroomService` construction helpers, similar to how `ClassroomRecordingService` was mocked in the replay plan's Task 7.
- Frontend: no test runner exists in this project (confirmed during the replay plan's Task 10) — this stays manually verified only, consistent with the rest of the UI layer.

## Migration / Schema Impact

None — this uses only existing columns and existing FK cascade/set-null behavior already in place from the replay feature's migrations (0012, 0013). No new migration needed.
