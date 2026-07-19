# Classroom Session Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher permanently delete an ended, course-linked class session from the "Jonli darslar" attendance page — removing the `class_sessions` DB row, its recorded audio file (if any), and any linked "Jonli dars" lesson content blocks. Shared media-library PDF files are never touched.

**Architecture:** One new `ClassroomService.deleteSession(sessionId, callerId)` method enforces ownership + `status === 'ended'`, best-effort deletes the session's recording file via the already-injected `StorageService`, deletes linked `content_blocks` rows, then deletes the `class_sessions` row (attendance records cascade automatically via existing FK). A new `DELETE /classroom/sessions/:id` route exposes it. The frontend adds a destructive "O'chirish" button next to the existing "Replay ko'rish" button in `CourseClassesPage.tsx`'s attendance modal, gated the same way (`status === 'ended'`), confirmed via `window.confirm`, and on success closes the modal and reloads the session list using the page's existing `reload()` function.

**Tech Stack:** NestJS + Drizzle ORM + PostgreSQL (backend), React + TypeScript (frontend), existing `StorageService` (S3-compatible object storage).

## Global Constraints

- Only the course-owning teacher (`course.adminId === callerId`) may delete a session; `super` role bypasses the ownership check (matches every other route in `ClassroomController`). No student or other-course-teacher access.
- Only sessions with `status === 'ended'` can be deleted — attempting to delete an active session must throw `ConflictException`.
- PDF files (`pdfPages`) are **never** deleted — they are shared media-library assets, not session-owned files. Deleting them would silently break other sessions/lessons referencing the same PDF.
- Recording file deletion is **best-effort**: `StorageService.deleteFile` already returns `Promise<boolean>` and never throws — a `false` return (missing file, storage unconfigured) must not block the rest of the deletion. Do not wrap it in try/catch (unnecessary — the method's contract is already non-throwing); just don't branch on its return value for control flow beyond an optional log.
- Delete order: recording file (best-effort) → linked `content_blocks` rows → `class_sessions` row. `attendance_records` cascade-deletes automatically via the existing `attendanceRecords.sessionId` FK (`onDelete: 'cascade'`) — no explicit query needed for it.
- No new database migration is needed — this uses only existing columns and existing FK behavior from the classroom-replay feature (migrations 0012, 0013).
- No frontend test runner exists in this project — frontend changes are manually verified only, consistent with the rest of the UI layer.

---

## File Structure

**Backend — modified:**
- `apps/backend/src/classroom/classroom.service.ts` — add `deleteSession(sessionId, callerId)` method.
- `apps/backend/src/classroom/classroom.controller.ts` — add `DELETE /classroom/sessions/:id` route, add `Delete` to the `@nestjs/common` import.
- `apps/backend/src/classroom/classroom.service.spec.ts` — add `db.delete` to the existing `jest.mock('../db')` setup, add a `deleteFile` mock to the `setup()` helper's storage mock, add tests for `deleteSession`.

**Frontend — modified:**
- `apps/frontend/src/api/classroom.ts` — add `apiDeleteClassSession(sessionId)` client function.
- `apps/frontend/src/components/course/CourseClassesPage.tsx` — add a destructive "O'chirish" button to the attendance modal header, add the delete handler.

---

## Task 1: Backend — `deleteSession` service method + tests

**Files:**
- Modify: `apps/backend/src/classroom/classroom.service.ts` (add method near `getReplay`, which starts at line 626)
- Modify: `apps/backend/src/classroom/classroom.service.spec.ts`

**Interfaces:**
- Consumes: `db.query.classSessions.findFirst` (with `course` relation, same pattern as `getReplay`), `db.delete`, `this.storage.deleteFile(key: string): Promise<boolean>` (already injected as `this.storage` in the constructor — see line 35).
- Produces: `ClassroomService.deleteSession(sessionId: string, callerId: string): Promise<void>` — consumed by Task 2 (controller route).

- [ ] **Step 1: Add `db.delete` support to the test file's DB mock**

In `apps/backend/src/classroom/classroom.service.spec.ts`, find the `jest.mock('../db', ...)` block (starts at line 6). It currently has `insert`, `update`, and `query` keys but no `delete`. Replace the mock object with this (adds a `delete` key that supports `db.delete(table).where(...)`, matching the same chain shape `content-blocks.service.ts:154` already uses in production code):

```ts
jest.mock('../db', () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: async () => [{ id: 'cs-row-1' }],
        onConflictDoNothing: async () => {},
      })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: async () => {} })) })),
    delete: jest.fn(() => ({ where: jest.fn(async () => {}) })),
    query: {
      courses: { findFirst: jest.fn() },
      groups: { findFirst: jest.fn(), findMany: jest.fn() },
      classSessions: { findFirst: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn(), findFirst: jest.fn() },
      attendanceRecords: { findFirst: jest.fn() },
      mediaAssets: { findFirst: jest.fn() },
    },
  },
}));
```

- [ ] **Step 2: Add a `deleteFile` mock to the `setup()` helper's storage argument**

In the same file, find the `setup()` function (starts at line 66):

```ts
async function setup(mediaLibrary = makeFakeMediaLibrary(), recordingService = makeFakeRecordingService()) {
  const service = new ClassroomService(
    { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}` } as any,
    { get: () => undefined } as any,
    mediaLibrary as any,
    recordingService as any,
  );
```

Replace the storage mock object (first constructor argument) with one that also has `deleteFile`, and expose it in the returned object so tests can assert on it:

```ts
async function setup(mediaLibrary = makeFakeMediaLibrary(), recordingService = makeFakeRecordingService()) {
  const storage = { uploadBuffer: jest.fn(), getPublicUrl: (k: string) => `https://cdn/${k}`, deleteFile: jest.fn().mockResolvedValue(true) };
  const service = new ClassroomService(
    storage as any,
    { get: () => undefined } as any,
    mediaLibrary as any,
    recordingService as any,
  );
  const { b, events } = makeFakeBroadcaster();
  service.setBroadcaster(b);
  setupDbForCreate();
  const { id } = await service.createSession('c-1', 'teacher-1', 'teacher');
  return { service, events, sessionId: id, mediaLibrary, recordingService, storage };
}
```

- [ ] **Step 3: Write the failing tests**

Add a new `describe` block anywhere after the existing `describe('createSession', ...)` block in the spec file:

```ts
describe('deleteSession', () => {
  it('yakunlangan sessiyani ustoz ochiradi: recording, contentBlocks va sessiya ozi ochiriladi', async () => {
    const { service, sessionId, storage } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'ready',
      recordingUrl: 'https://cdn/classroom-recordings/x.ogg',
      course: { adminId: 'teacher-1' },
    });

    await service.deleteSession(sessionId, 'teacher-1');

    expect(storage.deleteFile).toHaveBeenCalledWith(`classroom-recordings/${sessionId}.ogg`);
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it("recordingStatus 'ready' bolmasa deleteFile chaqirilmaydi", async () => {
    const { service, sessionId, storage } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'teacher-1' },
    });

    await service.deleteSession(sessionId, 'teacher-1');

    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it('deleteFile false qaytarsa (fayl topilmadi) baribir sessiya ochiriladi', async () => {
    const { service, sessionId, storage } = await setup();
    storage.deleteFile.mockResolvedValueOnce(false);
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'ready',
      recordingUrl: 'https://cdn/classroom-recordings/x.ogg',
      course: { adminId: 'teacher-1' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).resolves.toBeUndefined();
    expect(mockedDb.delete).toHaveBeenCalledTimes(2);
  });

  it('sessiya topilmasa NotFoundException otadi', async () => {
    const { service } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce(undefined);

    await expect(service.deleteSession('missing-id', 'teacher-1')).rejects.toThrow();
  });

  it('boshqa kursning ustoziga ForbiddenException otadi', async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'ended',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'boshqa-teacher' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).rejects.toThrow();
  });

  it("faol (active) sessiyani ochirishga urinilsa xato otadi", async () => {
    const { service, sessionId } = await setup();
    mockedDb.query.classSessions.findFirst.mockResolvedValueOnce({
      id: sessionId,
      status: 'active',
      recordingStatus: 'none',
      recordingUrl: null,
      course: { adminId: 'teacher-1' },
    });

    await expect(service.deleteSession(sessionId, 'teacher-1')).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest classroom.service -t "deleteSession" --silent`
Expected: FAIL — `service.deleteSession is not a function`.

- [ ] **Step 5: Implement `deleteSession`**

In `apps/backend/src/classroom/classroom.service.ts`, add the method after `getReplay` (which ends at line 661 — the closing `}` of the `return { ... }` block):

```ts
  // Yakunlangan sessiyani butunlay ochiradi: DB yozuvi, audio yozuv fayli
  // (agar bo'lsa) va unga bog'langan "Jonli dars" content_blocks. PDF
  // sahifalari (pdfPages) HECH QACHON ochirilmaydi — ular media-kutubxona
  // resursi, boshqa darslar/kurslarda ham ishlatilgan bo'lishi mumkin.
  async deleteSession(sessionId: string, callerId: string): Promise<void> {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: { course: true },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    const course = row.course as unknown as { adminId: string };
    if (course.adminId !== callerId) throw new ForbiddenException();
    if (row.status !== 'ended') throw new ConflictException("Faqat yakunlangan darsni o'chirish mumkin");

    // deleteFile hech qachon otmaydi (Promise<boolean> qaytaradi) — fayl
    // topilmasa yoki storage sozlanmagan bo'lsa false qaytaradi, bu
    // qolgan o'chirish jarayonini to'xtatmaydi.
    if (row.recordingStatus === 'ready' && row.recordingUrl) {
      await this.storage.deleteFile(`classroom-recordings/${sessionId}.ogg`);
    }

    await db.delete(contentBlocks).where(eq(contentBlocks.classSessionId, sessionId));
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
    // attendanceRecords o'zi cascade-delete bo'ladi (sessionId FK'ida
    // onDelete: 'cascade') — alohida so'rov kerak emas.
  }
```

Check the top of `classroom.service.ts` for the existing import block that includes `classSessions` — `contentBlocks` needs to be added to the same import from `../db/schema` if it isn't already imported. Run this to check:

Run: `grep -n "^import.*from '../db/schema'" apps/backend/src/classroom/classroom.service.ts`

If `contentBlocks` is not in that import list, add it. Also confirm `ConflictException` is imported from `@nestjs/common` alongside `NotFoundException`/`ForbiddenException` — check the existing import line and add it if missing.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest classroom.service -t "deleteSession" --silent`
Expected: PASS (all 6 new tests).

- [ ] **Step 7: Run the full classroom test suite to check for regressions**

Run: `cd apps/backend && npx jest classroom --silent`
Expected: all tests pass (263 existing + 6 new = 269).

- [ ] **Step 8: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/classroom/classroom.service.ts apps/backend/src/classroom/classroom.service.spec.ts
git commit -m "feat(classroom): add deleteSession service method"
```

---

## Task 2: Backend — `DELETE /classroom/sessions/:id` route

**Files:**
- Modify: `apps/backend/src/classroom/classroom.controller.ts`

**Interfaces:**
- Consumes: `ClassroomService.deleteSession(sessionId, callerId)` from Task 1.
- Produces: `DELETE /classroom/sessions/:id` — consumed by Task 3 (frontend API client).

- [ ] **Step 1: Add the `Delete` decorator import**

In `apps/backend/src/classroom/classroom.controller.ts`, find the import line (line 2):

```ts
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
```

Replace with:

```ts
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards,
```

- [ ] **Step 2: Add the route**

Add this route in the controller, near the `getReplay` route (which is at lines 72-75):

```ts
  @Delete('sessions/:id')
  @Roles('teacher', 'super')
  deleteSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.classroomService.deleteSession(id, req.admin.id);
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/backend && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd apps/backend && npx jest --silent`
Expected: all tests pass, no regressions (controller routes have no dedicated spec file in this codebase — this route addition is exercised via the service-level tests from Task 1, consistent with how `getReplay`'s route is untested at the controller layer too).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/classroom/classroom.controller.ts
git commit -m "feat(classroom): add DELETE /classroom/sessions/:id route"
```

---

## Task 3: Frontend — API client function

**Files:**
- Modify: `apps/frontend/src/api/classroom.ts`

**Interfaces:**
- Consumes: `DELETE /classroom/sessions/:id` from Task 2.
- Produces: `apiDeleteClassSession(sessionId: string): Promise<void>` — consumed by Task 4.

- [ ] **Step 1: Add the function**

In `apps/frontend/src/api/classroom.ts`, add this function right after `apiClassReplay` (which ends at line 164):

```ts
export async function apiDeleteClassSession(sessionId: string): Promise<void> {
  await client.delete(`/classroom/sessions/${sessionId}`);
}
```

This mirrors the exact shape of the existing `apiDeletePdfFromLibrary` (line 89) and `apiClassReplay` (line 161) functions already in this file.

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && npx tsc -p tsconfig.app.json`
Expected: no errors. (Note: plain `npx tsc --noEmit -p .` is a no-op in this project — the root tsconfig is a project-references shell with `"files": []` and silently reports success regardless of real errors. Always use `tsconfig.app.json` to see real frontend type errors.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/classroom.ts
git commit -m "feat(classroom): add apiDeleteClassSession client function"
```

---

## Task 4: Frontend — delete button + handler in `CourseClassesPage`

**Files:**
- Modify: `apps/frontend/src/components/course/CourseClassesPage.tsx`

**Interfaces:**
- Consumes: `apiDeleteClassSession` from Task 3.
- Produces: a destructive "O'chirish" button in the attendance modal, wired to a confirm-then-delete flow.

- [ ] **Step 1: Update the import list**

In `apps/frontend/src/components/course/CourseClassesPage.tsx`, find the icon import (line 3):

```ts
import { Clock, Radio, X } from 'lucide-react';
```

Replace with:

```ts
import { Clock, Radio, Trash2, X } from 'lucide-react';
```

Find the API import block (lines 8-12):

```ts
import {
  apiActiveClassSessions, apiClassHistory, apiClassSession, apiCreateClassSession,
  apiOverrideAttendance,
  type ClassHistoryItem, type ClassSessionDetail,
} from '../../api/classroom';
```

Replace with:

```ts
import {
  apiActiveClassSessions, apiClassHistory, apiClassSession, apiCreateClassSession,
  apiDeleteClassSession, apiOverrideAttendance,
  type ClassHistoryItem, type ClassSessionDetail,
} from '../../api/classroom';
```

- [ ] **Step 2: Add the delete handler**

Add this function right after `handleOverride` (which ends at line 102, the closing `};` of that function):

```ts
  const handleDelete = async (sessionId: string) => {
    const confirmed = window.confirm(
      "Bu darsni o'chirmoqchimisiz? Chizma tarixi va audio yozuv butunlay yo'qoladi, qaytarib bo'lmaydi.",
    );
    if (!confirmed) return;
    try {
      await apiDeleteClassSession(sessionId);
      setDetail(null);
      await reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni o'chirib bo'lmadi");
    }
  };
```

This follows the exact pattern already used by `handleStart` (line 66) and `handleOverride` (line 91) in this same file: `try`/`catch` with `toast.error(e?.response?.data?.message ?? fallback)`.

- [ ] **Step 3: Add the button to the modal header**

Find the attendance modal header block (lines 174-192):

```tsx
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-800">Davomat</h2>
                <p className="text-xs text-gray-400">{fmtDate(detail.startedAt)}{detail.pdfName ? ` — ${detail.pdfName}` : ''}</p>
              </div>
              {detail.status === 'ended' && (
                <button
                  type="button"
                  onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Radio size={14} />
                  Replay ko'rish
                </button>
              )}
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
```

Replace with (adds the delete button right after the replay button, same `detail.status === 'ended'` gate):

```tsx
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-800">Davomat</h2>
                <p className="text-xs text-gray-400">{fmtDate(detail.startedAt)}{detail.pdfName ? ` — ${detail.pdfName}` : ''}</p>
              </div>
              {detail.status === 'ended' && (
                <button
                  type="button"
                  onClick={() => navigate(`/classroom-history/${detail.id}/replay`)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Radio size={14} />
                  Replay ko'rish
                </button>
              )}
              {detail.status === 'ended' && (
                <button
                  type="button"
                  onClick={() => void handleDelete(detail.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  O'chirish
                </button>
              )}
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/frontend && npx tsc -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Manual check**

Run the frontend dev server, sign in as the teacher who owns a course with at least one ended class session, open "Jonli darslar" for that course, click an ended session's row, confirm the "O'chirish" button appears next to "Replay ko'rish" (and does NOT appear on an active session's row, if one exists). Click "O'chirish", confirm the browser confirm dialog shows the expected message, cancel it once to confirm nothing happens, then confirm it for real and verify: the modal closes, the session disappears from the list, and (if you have direct DB/storage access) the `class_sessions` row and `classroom-recordings/{id}.ogg` file (if one existed) are gone.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/CourseClassesPage.tsx
git commit -m "feat(classroom): add delete button to class attendance modal"
```

---

## Final Verification

- [ ] **Step 1: Full backend test suite**

Run: `cd apps/backend && npx jest --silent`
Expected: all tests pass (269 total: 263 pre-existing + 6 new from Task 1).

- [ ] **Step 2: Full backend build**

Run: `cd apps/backend && npm run build`
Expected: succeeds.

- [ ] **Step 3: Full frontend build**

Run: `cd apps/frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: End-to-end manual walkthrough**

1. As a teacher, open a course with at least one ended class session that has a recording (`recordingStatus === 'ready'`) and at least one linked "Jonli dars" lesson block (if the live_class block picker item is currently re-enabled — see the note below).
2. Open "Jonli darslar" for that course, click the ended session's row, click "O'chirish", confirm the browser dialog.
3. Verify the session disappears from the list.
4. Reload the lesson editor for the lesson that had a "Jonli dars" block linked to the deleted session — confirm the block is gone (not orphaned/broken).
5. Confirm the PDF used by that session (if attached from the media library) is still usable/visible elsewhere (e.g. still attachable to a new session) — proving PDF files were correctly left untouched.
6. Attempt to delete an active (non-ended) session directly via the API (e.g. `curl -X DELETE .../classroom/sessions/<active-id>` with a valid teacher token) and confirm it's rejected.

**Note:** the "Jonli dars" block picker item in `apps/frontend/src/components/course/BlockPicker.tsx` was temporarily commented out after the classroom-replay feature merged (see git history around commit `cf9cad9`, "chore(classroom): temporarily hide live_class block picker item"). If it's still disabled when you run this walkthrough, step 1's "linked lesson block" part of the scenario can't be exercised through the UI — either re-enable it first, or skip that part of the walkthrough and note it as not covered.
