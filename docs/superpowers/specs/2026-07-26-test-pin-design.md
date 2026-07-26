# Test Pin (Guruhga Tayinlash) Design

## Goal

Teachers currently share a test with a group by copying its `/t/:slug` link
and pasting it in a chat. When that link is opened inside Telegram's
in-app browser, the student can't complete the login flow properly, so they
have to copy the link out and paste it into a real browser — clunky and
error-prone, especially for less tech-savvy students.

This feature lets a teacher "pin" a test to one or more groups within a
course, for a scheduled time window. During that window, students who
belong to the targeted group(s) see a live-class-style banner in their
dashboard shell and tap it to go straight to the test — no link, no
copy-paste, no Telegram in-app browser problem.

The test-taking flow, submission flow, and results/statistics are
completely unchanged by this feature. Pinning only affects how a student
discovers and reaches the test, and (per the security requirement below)
who is allowed to open it while a pin is active.

## Data Model

New table `test_pins`, one row per test (enforces "one active pin per test"
from the start — no separate "is this the active one" flag needed):

```
test_pins
  id            uuid primary key
  test_id       uuid unique not null references tests(id) on delete cascade
  course_id     uuid not null references courses(id) on delete cascade
  group_ids     uuid[] not null default '{}'  -- empty array means "all groups in the course"
  starts_at     timestamptz not null
  ends_at       timestamptz not null
  created_at    timestamptz default now()
```

Creating a new pin for a test that already has one replaces it (upsert on
`test_id`). Removing a pin deletes the row. There is intentionally no
separate `test_pins_groups` join table — `group_ids` as a uuid array is
enough since a pin is always scoped to a single course and this project
already uses array columns elsewhere (e.g. `answers.selected_option_ids`).

## Backend

### Tests module additions

`apps/backend/src/tests/tests.controller.ts` / `tests.service.ts`:

- `PUT /tests/:id/pin` — body `{ courseId: string; groupIds: string[]; startsAt: string; endsAt: string }`. Upserts the `test_pins` row for that test. Requires `teacher`/`super` role and ownership of the test (existing pattern already used by other test-mutation endpoints).
- `DELETE /tests/:id/pin` — deletes the row for that test, if present. No-op (still 200) if none exists.
- `GET /tests/:id/pin` — returns the current pin row (or `null`), for prefilling the edit modal.

### Student-facing endpoint

There is no dedicated "students" backend module today — student-facing
`me/*` reads (e.g. `me/submissions`) live in
`apps/backend/src/submissions/submissions.controller.ts`, which uses
`@Controller()` with an empty prefix and spells out full paths per route.
Add the new route there, following that pattern: `GET /me/active-pins`.

Returns all currently-active pins visible to the calling student:
- `test_pins.starts_at <= now() <= test_pins.ends_at`
- The student is an active member (`school_members`, joined to
  `group_enrollments` with `removed_at IS NULL`) of the pin's course, and
  either `group_ids` is empty (matches any group in that course) or the
  student's `group_enrollments.group_id` is in `group_ids`.

Response shape: `Array<{ testId: string; testName: string; slug: string }>`.

### Access control while a pin is active

`getTestBySlug` (`apps/backend/src/delivery/delivery.service.ts`) and
`startSubmission` both look up the test's active pin (if any) before
proceeding:

- No active pin for this test → behavior is unchanged (open per the test's
  existing `requireAuth` setting).
- Active pin exists → the caller must be authenticated AND be an active
  member of the pin's course, matching `group_ids` the same way as the
  `/me/active-pins` check. If not, respond the same way `requireAuth`
  currently signals a login requirement (`AUTH_REQUIRED`), so the existing
  frontend redirect-to-login handling in `TakeTestEntryPage.tsx` keeps
  working unchanged. A logged-in student who doesn't belong to the
  targeted group gets a distinct rejection (`NOT_ASSIGNED`) so the entry
  page can show a clear message instead of bouncing them to login again.

This check only gates entry (`getTestBySlug` for viewing, `startSubmission`
for starting an attempt) — it does not touch answer submission, grading, or
results, which are unaffected by pin state entirely.

## Frontend

### Teacher side — `TestCard.tsx`

The dark action bar currently has 5 buttons in a `grid-cols-5` layout. Add a
6th button ("Pin", using lucide-react's `Pin` icon), changing the grid to
`grid-cols-6`.

- Button visual state: neutral (matches the other icons) when the test has
  no active pin; highlighted (e.g. amber/orange tint, similar treatment to
  how other active-state icons are styled elsewhere in this file) when a
  pin is currently active.
- Clicking always opens `TestPinModal`:
  - No existing pin: the test's owning course isn't tracked today, so the
    modal starts with a course picker (using the existing
    `apiListCourses` from `api/courses.ts`), then a group multi-select for
    that course's groups (using the existing `apiListGroups(courseId)`
    from `api/groups.ts`) with an "All groups" checkbox that clears/disables
    the individual group checkboxes, then start/end date-time pickers,
    then Save.
  - Existing pin: modal opens prefilled from `GET /tests/:id/pin`, with
    "Save changes" and "Remove pin" actions instead of a single "Save".

### Student side — `StudentShell.tsx`

Alongside the existing `liveClassSessions` polling and banner (lines
87-96, ~238), add a second polling effect calling a new
`apiActiveTestPins()` (add to `api/submissions.ts`, next to the other
`me/*` reads it already wraps, e.g. `apiGetMySubmissionDetail`) hitting
`GET /me/active-pins`, on the same 60-second interval pattern. Render an
additional banner per active pin, visually consistent with the existing
live-class banner (red bar with `Radio`-style icon, title, "Kirish"
button) but with test-appropriate copy ("Imtihon boshlandi — {testName}" /
"Kirish uchun bosing"), navigating to `/t/${slug}` on click.

### Entry page — `TakeTestEntryPage.tsx`

When the backend returns `NOT_ASSIGNED` (student logged in but not in the
pin's target group), show a clear inline message instead of the generic
"Xato yuz berdi" — e.g. "Bu test sizga tayinlanmagan." This is a small,
additive change to the existing error-handling branch in `handleStart`
and the initial test-fetch failure path.

## Out of Scope

- No changes to test-taking UI, answer submission, `onceOnly` handling,
  scoring, or the statistics/results pages.
- No WebSocket or push mechanism — polling on the same cadence as the
  existing live-class banner is enough, since exams run for hours, not
  seconds.
- No support for multiple simultaneous pins per test (confirmed: one
  active pin per test, enforced by the `test_id` unique constraint).
- No changes to how the plain, un-pinned `/t/:slug` flow works when a test
  has never been pinned or its pin has expired.
