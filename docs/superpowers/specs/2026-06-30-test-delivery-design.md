# Test Delivery — Design Spec
**Date:** 2026-06-30
**Subsystem:** 3 of 6 (Test Delivery)
**Depends on:** Subsystem 1 (Auth + Folder System), Subsystem 2 (Test Builder)

---

## 1. Overview

Admins share a short link (`/t/xK9mP`) with students. Students enter their name and take the test anonymously. Results are stored per-submission. Admin views submissions with scores and per-question breakdown.

---

## 2. Data Models

### New column on `tests`
```sql
ALTER TABLE tests ADD COLUMN slug varchar(8) UNIQUE NOT NULL DEFAULT '';
```
Generated at test creation: 8 random alphanumeric characters (`A-Za-z0-9`), unique-checked before insert.

### New tables
```sql
submissions
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  test_id       uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE
  student_name  text NOT NULL
  started_at    timestamptz NOT NULL DEFAULT now()
  submitted_at  timestamptz NULL
  score         integer NULL   -- null until submitted
  total         integer NULL   -- max possible score (single+multi questions only)

answers
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
  submission_id       uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE
  question_id         uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE
  selected_option_ids uuid[] NOT NULL DEFAULT '{}'  -- empty for open questions
  text_answer         text NULL                      -- open type only
  is_correct          boolean NULL                   -- null for open type
```

---

## 3. Backend

### Public endpoints (no JWT)
All under `/public` prefix, no auth guard.

| Endpoint | Method | Description |
|---|---|---|
| `/public/tests/:slug` | GET | Test info + questions + options (is_correct hidden from response) |
| `/public/submissions` | POST | Start submission — body: `{ slug, studentName }` → returns `{ submissionId }` |
| `/public/submissions/:id/submit` | POST | Submit answers — body: `{ answers: [{ questionId, selectedOptionIds, textAnswer }] }` → returns score result |

### Admin endpoints (JWT required)
| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/tests/:id/submissions` | GET | List submissions for a test (admin-scoped) |
| `/api/v1/submissions/:id` | GET | Single submission with answer breakdown |

### Scoring logic (on submit)
- `single` / `multi`: correct if all correct options selected AND no wrong options selected → 1 point
- `open`: `is_correct = null`, not counted in score
- `score` = sum of correct answers
- `total` = count of `single` + `multi` questions in the test

### Slug generation
```ts
function generateSlug(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
```
On test create: generate slug, check uniqueness in DB, retry up to 5 times if collision (astronomically unlikely).

### `GET /public/tests/:slug` response shape
```json
{
  "id": "...",
  "name": "Math Quiz",
  "description": "...",
  "timeLimit": 30,
  "showResults": "immediately",
  "shuffleQuestions": false,
  "shuffleOptions": true,
  "oneByOne": false,
  "deadline": null,
  "questions": [
    {
      "id": "...",
      "text": "What is 2+2?",
      "type": "single",
      "orderIndex": 0,
      "options": [
        { "id": "...", "text": "4", "orderIndex": 0 },
        { "id": "...", "text": "5", "orderIndex": 1 }
      ]
    }
  ]
}
```
`is_correct` is intentionally excluded from options in this response.

### `POST /public/submissions/:id/submit` response shape
```json
{
  "submissionId": "...",
  "score": 7,
  "total": 10,
  "showResults": "immediately",
  "deadline": null,
  "answers": [
    { "questionId": "...", "isCorrect": true },
    { "questionId": "...", "isCorrect": false },
    { "questionId": "...", "isCorrect": null }
  ]
}
```

---

## 4. Frontend — Student Pages (public, no auth)

### `/t/:slug` — Entry page
- Full-screen gradient background: `bg-gradient-to-br from-slate-100 to-indigo-50`
- Centered white card: `rounded-2xl shadow-2xl p-8 max-w-md`
- macOS traffic lights (decorative): three colored dots `🔴🟡🟢` top-left of card
- Shows: test name, description, time limit badge (if set), deadline badge (if set)
- Input: "Your name" text field
- Button: "Start Test" → POST `/public/submissions` → navigate to `/t/:slug/take?sid={submissionId}`

### `/t/:slug/take` — Taking the test
Query param `sid` carries the submission ID.

**Layout (both modes):**
- Top bar: test name left, timer right (if time limit set: `⏱ 04:32` monospace countdown)
- `one_by_one = false`: all questions in a scrollable list, "Submit" button at bottom
- `one_by_one = true`: one question at a time, progress bar top (`3 / 10` + indigo fill), "Next" / "Submit" buttons

**Question card (each question):**
- White card `rounded-2xl border border-gray-100 p-5`
- Question number + text
- `single`: radio-style option buttons — `border rounded-xl px-4 py-3`, selected = `bg-indigo-500 text-white border-indigo-500`
- `multi`: checkbox-style option buttons — same style, multiple selectable
- `open`: textarea input

**Shuffle (frontend):**
- `shuffleQuestions = true`: shuffle question array before rendering (seeded by submissionId for consistency on reload)
- `shuffleOptions = true`: shuffle each question's options array before rendering

**Timer:**
- Countdown from `timeLimit * 60` seconds
- When reaches 0: auto-submit current answers

**Submit flow:**
- POST `/public/submissions/:id/submit` with all answers
- Navigate to `/t/:slug/result?sid={submissionId}`

### `/t/:slug/result` — Result page
Query param `sid` carries the submission ID. Result data comes from submit response (stored in sessionStorage, not re-fetched).

**`show_results = 'immediately'`:**
- Score card: `8 / 10` large text, percentage ring or progress bar
- Per-question breakdown: each question card shows student's answer, ✓ (green) or ✗ (red), correct answer highlighted

**`show_results = 'after_deadline'`:**
- "Results will be available after {deadline formatted}" message

**`show_results = 'hidden'`:**
- "Test submitted successfully. Thank you, {studentName}!" message

---

## 5. Frontend — Admin Pages

### FolderViewPage — Test card context menu update
Add "Submissions" item to right-click menu → navigates to `/tests/:id/submissions`.
Also show slug as copyable text on the test card (small `#xK9mP` badge).

### `/tests/:id/submissions` — Submissions list page
- Toolbar + breadcrumb: `← Folder / Test Name / Submissions`
- Top: copyable share link `https://domain.com/t/{slug}`
- Cards grid (not table): each submission = white card
  - Student name (bold)
  - Score badge: `7 / 10` green if ≥ 70%, yellow if ≥ 50%, red otherwise
  - Submitted at timestamp
  - Click → `/submissions/:subId`
- Empty state: "No submissions yet"

### `/submissions/:subId` — Submission detail page
- Breadcrumb: `← Submissions / {studentName}`
- Header: name, total score, submitted at
- Per-question list:
  - Question text
  - Student's answer(s) highlighted
  - ✓ green for correct, ✗ red for wrong, `—` gray for open
  - Correct answer(s) shown below if wrong

---

## 6. UI Style (macOS Classic)

Consistent with Subsystem 1 & 2:
- Background: `bg-gradient-to-br from-slate-100 to-indigo-50`
- Cards: `bg-white rounded-2xl shadow-xl border border-gray-100`
- Primary action: `bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg`
- Traffic light dots on student-facing cards: decorative only, `w-3 h-3 rounded-full` in red/yellow/green
- Font: system default (Tailwind base)
- No custom SVG assets needed

---

## 7. Slug on test card (FolderViewPage)

Below the test name on `TestCard`, show:
```
#xK9mP  📋
```
Clicking the clipboard icon copies `https://{window.location.host}/t/{slug}` to clipboard.

---

## 8. Out of Scope (this subsystem)

- Manual grading for open questions
- Re-taking a test (each start = new submission)
- Student login / saved progress
- Bulk results export (CSV)
- Deep analytics / charts (Subsystem 4)

---

## 9. Success Criteria

- Admin shares `/t/xK9mP` link; student opens it, enters name, takes test
- `one_by_one` and `all-at-once` modes both work
- Timer auto-submits when expired
- Score calculated correctly on submit
- Admin sees submissions list with scores
- Admin clicks submission to see per-question breakdown
- `show_results` setting controls what student sees after submit
