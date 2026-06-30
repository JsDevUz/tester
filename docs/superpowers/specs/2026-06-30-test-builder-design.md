# Test Builder — Design Spec
**Date:** 2026-06-30
**Subsystem:** 2 of 6 (Test Builder)
**Depends on:** Subsystem 1 (Auth + Folder System)

---

## 1. Overview

Admins create tests inside folders. Each test has metadata/settings (Step 1) and questions (Step 2). Questions can be added one by one or via bulk text import. Tests are fully isolated per admin via `admin_id`.

---

## 2. Data Models

```sql
tests
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  folder_id     uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE
  admin_id      uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE
  name          text NOT NULL
  description   text
  time_limit    integer NULL          -- minutes, NULL = unlimited
  show_results  text NOT NULL DEFAULT 'immediately'  -- 'immediately' | 'after_deadline' | 'hidden'
  shuffle_questions boolean NOT NULL DEFAULT false
  shuffle_options   boolean NOT NULL DEFAULT false
  one_by_one    boolean NOT NULL DEFAULT false  -- show questions one at a time
  deadline      timestamptz NULL
  created_at    timestamptz DEFAULT now()

questions
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  test_id       uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE
  text          text NOT NULL
  type          text NOT NULL  -- 'single' | 'multi' | 'open'
  order_index   integer NOT NULL DEFAULT 0
  created_at    timestamptz DEFAULT now()

options
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  question_id   uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE
  text          text NOT NULL
  is_correct    boolean NOT NULL DEFAULT false
  order_index   integer NOT NULL DEFAULT 0
```

---

## 3. Backend

### TestsModule
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/tests` | POST | Create test (requires folder_id) |
| `/api/v1/tests?folder_id=:id` | GET | List tests in folder (admin-scoped) |
| `/api/v1/tests/:id` | GET | Test detail with questions + options |
| `/api/v1/tests/:id` | PATCH | Update test metadata/settings |
| `/api/v1/tests/:id` | DELETE | Delete test (cascades questions/options) |

All test queries scoped by `admin_id` from JWT.

### QuestionsModule
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/tests/:testId/questions` | POST | Add single question with options |
| `/api/v1/tests/:testId/questions/bulk` | POST | Bulk import from parsed format |
| `/api/v1/questions/:id` | PATCH | Edit question text/type/order |
| `/api/v1/questions/:id` | DELETE | Delete question (cascades options) |
| `/api/v1/options/:id` | PATCH | Edit option text/is_correct/order |
| `/api/v1/options/:id` | DELETE | Delete single option |

Ownership verified: question's test must belong to `req.admin.id`.

### Bulk Import Parser (backend)
`POST /api/v1/tests/:testId/questions/bulk` accepts `{ text: string }`.

Parsing rules:
- Lines starting with `#` → new question
- Lines starting with `+` → correct option
- Lines starting with `-` → wrong option
- No options → type `'open'`
- One `+` → type `'single'`
- Two or more `+` → type `'multi'`
- Empty lines ignored
- Returns inserted questions count on success

---

## 4. Frontend

### Folder View (`/folders/:id`)
- Opened by double-clicking a folder on Dashboard
- Shows folder name in toolbar (breadcrumb: Home → Folder Name)
- Grid of test cards (macOS style, like folder cards)
- "New Test" button → opens Wizard Step 1

### Test Card
- Shows: test name, question count, icons for: time limit, shuffle, one-by-one, deadline
- Double-click → opens Test Editor (Step 2 — questions)
- Right-click → context menu: Edit Settings, Delete

### Wizard Step 1 — Test Settings (modal)
Fields:
- Name (required)
- Description (optional, textarea)
- Time limit: checkbox + number input (minutes)
- Show questions: toggle "One by one" / "All at once"
- Shuffle questions: checkbox
- Shuffle answer options: checkbox
- Show results: select — "Immediately" / "After deadline" / "Hidden"
- Deadline: checkbox + datetime-local input

On submit → creates test → navigates to Step 2 (question editor).

### Wizard Step 2 — Question Editor (full page `/tests/:id/edit`)
Two tabs:
1. **Manual** — form to add one question at a time:
   - Question text (textarea)
   - Type: single / multi / open
   - Options list (add/remove rows), checkbox to mark correct
   - "Add Question" button
   - Existing questions listed below (reorderable, deletable)

2. **Bulk Import** — textarea with format hint:
   ```
   # Question text
   + Correct answer
   - Wrong answer
   - Wrong answer 2

   # Question 2 (no options = open answer)
   ```
   - "Preview" button — parses and shows question count + list
   - "Import" button — sends to backend, appends to existing questions

### Zustand Stores
```ts
testStore: { tests, fetchTests(folderId), createTest(data), updateTest(id,data), deleteTest(id) }
questionStore: { questions, fetchQuestions(testId), addQuestion(data), updateQuestion(id,data), deleteQuestion(id), bulkImport(testId,text) }
```

---

## 5. Bulk Import Format

```
# Question text here
+ Correct answer
- Wrong answer 1
- Wrong answer 2

# Another question — two correct = multi
+ First correct
+ Second correct
- Wrong one

# Open question (no options)
```

Rules:
- `#` prefix → question
- `+` prefix → correct option
- `-` prefix → wrong option
- Zero options → `open` type
- One `+` → `single` type
- 2+ `+` → `multi` type
- Blank lines ignored
- Everything after `#`/`+`/`-` and a space is the content

---

## 6. Folder Icon UI

Folder icons use the macOS classic blue folder style (provided as SVG/PNG asset). Two states:
- **Closed** (default) — standard blue folder
- **Open** (when navigated inside) — open folder variant

---

## 7. Out of Scope (this subsystem)

- Test delivery (shareable links, taking the test)
- Results & analytics
- Test taking UI (one-by-one mode is stored but rendered in subsystem 3)

---

## 8. Success Criteria

- Admin can create a test inside a folder with all settings
- Admin can add questions manually (single, multi, open types)
- Admin can bulk import questions via text format
- Test cards appear in folder view with correct metadata icons
- All operations are admin-scoped (no cross-admin access)
