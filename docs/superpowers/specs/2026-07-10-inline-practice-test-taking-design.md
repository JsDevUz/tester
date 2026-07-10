# Inline Practice Test-Taking Design

## Problem

In the student-facing lesson practice screen (`PracticeScreen.tsx`), clicking "Qayta o'tish" (retake) or "Ochish" (open a past submission) currently calls `navigate('/t/${testSlug}...')`, sending the student to the standalone test-taking route. This breaks the "Amaliyot" (practice) flow — the student loses the lesson-practice context and the sidebar lesson list, and must navigate back manually.

Reference screenshots (Exode LMS) show the desired behavior: the student stays in the same content area (lesson sidebar always visible), and the test — questions, one continuous scroll ("savollar birga" style, matching the existing practice-context override), and a "Tamomlash" (finish) button — renders inline where the lesson/practice content normally goes.

## Goal

Make "Qayta o'tish" and "Ochish" render the test inline in `MyCoursesPage.tsx`'s content area (replacing what `PracticeScreen`/`LessonReader` show, sidebar untouched), without changing the standalone `/t/:slug` page's behavior at all.

## Non-goals

- No changes to `/t/:slug`'s own navigation, results flow, or URL structure.
- No changes to non-practice (ordinary) test-taking.
- No change to the practice-context override mechanism (`?practice=1` forcing `showResults=immediately, oneByOne=false, requireAuth=true, deadline` ignored) — inline mode reuses it as-is.
- Does not address ledger item #1 (scoping submissions to `practiceBlockId`) — separate, already-deferred work.

## Design

### Actual route structure (corrected from initial research)

`/t/:slug` is not one page — it is three, chained by `navigate()`:

1. **`TakeTestEntryPage`** (`/t/:slug`) — fetches the test by slug, collects a student name (auto-filled from `useAuthStore`/`apiGetMe` if logged in, otherwise a text field), calls `apiStartSubmission(slug, name, practiceMode)`, then navigates to `/t/:slug/take?sid=...`. If a `sid` is already in the URL (resuming), it checks submission status and redirects straight to `/take` or `/result` without re-collecting a name.
2. **`TakeTestPage`** (`/t/:slug/take`) — the ~950-line question-answering UI covered in the original research (fetch test, render questions, timer, draft-autosave, beacon auto-submit, submit).
3. **`TestResultPage`** (`/t/:slug/result`) — reads `sid`, shows cached `sessionStorage` result if fresh, else fetches via `apiGetSubmissionResult`. Only uses `useSearchParams`, no `useNavigate` — already safe to reuse as a plain component.

### Practice mode skips the entry-page UI (decided during brainstorming)

Practice-mode students are always authenticated (`requireAuth=true` is forced by the existing practice-context override), so their name is already available via `useAuthStore`/`apiGetMe` — the same source `TakeTestEntryPage` uses to auto-fill its name field. Inline practice mode skips showing that entry screen entirely: when `submissionId` is absent, the name is resolved automatically and `apiStartSubmission` is called immediately, landing the student directly on the question-answering UI. There is no user-visible "Testni boshlash" step in practice mode.

### Component extraction: `TestTaker`

One new component absorbs the logic of all three pages, since the whole point is that no route transition should occur inline:

```
apps/frontend/src/components/test/TestTaker.tsx

interface TestTakerProps {
  slug: string;
  submissionId?: string;       // present → resume/view this submission; absent → auto-start a new one
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;  // called once a submission's status is confirmed 'submitted'
  onExit: () => void;          // "back"/"close" action (only reachable pre-submit, from TakeTestPage's equivalent of a cancel action — see Exit affordance note below)
}
```

Internal phases, replacing the 3-page hand-off with local state (`'starting' | 'answering' | 'result'`):

- **`submissionId` absent** → phase `'starting'`: resolve the student's name from `useAuthStore`/`apiGetMe` (same lookup `TakeTestEntryPage` performs today), call `apiStartSubmission(slug, name, practiceMode)`, then move to `'answering'` with the returned `submissionId`. No name form is rendered (per the decision above). If name resolution fails (not logged in — should not happen in practice mode given `requireAuth=true`, but handled defensively by showing the same error state `TakeTestEntryPage` shows today for a failed test fetch), render an inline error rather than throwing.
- **`submissionId` present** → on mount, call `apiGetSubmission(submissionId, practiceMode)` (same check `TakeTestEntryPage` and `TakeTestPage` each already perform) to determine status: `'submitted'` → phase `'result'`; otherwise → phase `'answering'` (resuming a draft).
- **`'answering'`** → renders `TakeTestPage`'s existing question-answering tree verbatim (fetch test, timer, draft-autosave, beacon auto-submit, submit). All 4 existing `navigate(...)` call sites become: the 3 that transition to the result view call `onNavigateResult(submissionId)` (which flips local phase to `'result'` inside `TestTaker`, no callback plumbing needed beyond that — see below); the 1 invalid-submission bounce (today: `navigate('/t/${slug}')`) becomes falling back to phase `'starting'` (equivalent to landing back on the entry page).
- **`'result'`** → renders `TestResultPage`'s existing JSX verbatim (it already takes its `sid`/`practice` inputs via `useSearchParams` only — refactor it to accept `{ submissionId, practiceMode }` as props instead, since it has no other router coupling).

Since all 3 phases live inside one component's local state, `onNavigateResult` is actually only used by the wrapping page (`TakeTestPage`, to change the real URL) — internally, `TestTaker` transitions phase directly. To keep one prop contract for both consumers:

```tsx
function goToResult(submissionId: string) {
  setPhase('result');
  setResolvedSubmissionId(submissionId);
  onNavigateResult(submissionId);  // no-op for inline caller, or a real navigate() for the standalone wrapper
}
```

This keeps `TakeTestPage.tsx`'s URL-based behavior working (so a student can bookmark/refresh `/t/:slug/result?sid=...` and it still resolves independently via `TestResultPage`'s own mount-time fetch) while letting `MyCoursesPage.tsx` no-op the callback and rely purely on `TestTaker`'s internal phase state.

**Exit affordance**: `TakeTestPage` today has no visible "cancel" button — a student leaves only via submit, timeout, or a violation (tab-switch) auto-submit. `onExit` therefore has no call site inside the `'answering'` phase’s existing UI. It fires from a new, minimal "← Orqaga" control added to `TestTaker`'s `'answering'`-phase header (inline mode only — see below), and from `TestResultPage`'s render (a new "Amaliyotga qaytish" style back action) when in inline mode.

- The existing module-level question-type renderers (`SortableItem`, `ReorderQuestion`, `MatchingQuestion`, `SliderQuestion`, `DropPinQuestion`, `seededShuffle`, draft-key helper) are reused as-is — no changes needed, they don't touch routing.
- Draft-autosave (localStorage) is unchanged — closing via `onExit` mid-test leaves the draft in place; reopening the same slug/submission resumes it, per existing mechanism. No confirmation dialog on exit.

### `TakeTestPage.tsx`, `TakeTestEntryPage.tsx` routes become thin wrappers around `TestTaker`

The three routes collapse to two (entry-page route becomes redundant for the take/result cases it used to redirect through, but is kept as-is for backward-compatible bookmarks/links — it still redirects to `/take` or `/result` exactly as today):

```tsx
// TakeTestPage.tsx (route: /t/:slug/take)
function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get('sid') ?? undefined;
  const isPractice = searchParams.get('practice') === '1';
  const practiceSuffix = isPractice ? '&practice=1' : '';

  return (
    <TestTaker
      slug={slug!}
      submissionId={submissionId}
      practiceMode={isPractice}
      onNavigateResult={(sid) => navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`, { replace: true })}
      onExit={() => navigate(`/t/${slug}`)}
    />
  );
}
```

`TakeTestEntryPage.tsx` is **not** touched — it keeps its own current implementation (name form, `apiStartSubmission`, redirect to `/take`) exactly as-is, since standalone (non-practice) test-taking must keep collecting a name. It is a separate code path from `TestTaker`'s auto-start branch, not a caller of it.

This preserves the standalone page's exact current behavior for both the entry flow and the take/result flow.

### Inline rendering in `MyCoursesPage.tsx`

`MyCoursesPage.tsx` gains one new piece of local state:

```tsx
const [activeTest, setActiveTest] = useState<{ slug: string; submissionId?: string } | null>(null);
```

Reset alongside `showPractice` when `selectedLessonId` changes (same `useEffect` pattern already in place for `showPractice`).

The `<main>` content switch becomes three-way:

```tsx
{selected && activeTest ? (
  <TestTaker
    slug={activeTest.slug}
    submissionId={activeTest.submissionId}
    practiceMode={true}
    onNavigateResult={() => {}}  // no route change needed; TestTaker's internal phase handles the transition
    onExit={() => setActiveTest(null)}
  />
) : selected && showPractice ? (
  <PracticeScreen
    lesson={selected.lesson}
    onBack={() => setShowPractice(false)}
    onStartPractice={(block) => { if (block.testSlug) setActiveTest({ slug: block.testSlug }); }}
    onViewSubmission={(block, submissionId) => { if (block.testSlug) setActiveTest({ slug: block.testSlug, submissionId }); }}
  />
) : selected ? (
  <LessonReader ... />
) : null}
```

- Sidebar (`<aside>`, the lesson list) is untouched — it's a sibling of `<main>` and keeps rendering regardless of which content state is active.
- No `navigate()` call is made anywhere in this inline path — URL stays on the course page throughout starting, taking, and finishing a practice test.
- `onExit` (back/close, from either the `'answering'` header control or the result-view back action) clears `activeTest`, returning the student to `PracticeScreen` (not `LessonReader` — `showPractice` remains `true` from before `activeTest` was set).

### Data flow / consistency

- `PracticeScreen`'s displayed scores (`earnedScore`, submissions list) come from `ApiMyLesson.practiceBlocks`, refreshed via `GroupsService.getMyCourseDetail` — this data is not automatically refetched when `activeTest` closes. Since this is pre-existing behavior (the same staleness already exists after any submission today) and out of scope for this fix, no change is made here; scores reflect their state as of the last full course-detail load. (Consistent with the earlier-fixed pattern where `course` state is patched locally after `apiMarkLessonComplete` — a similar local patch could be added later but is not required for this fix to work correctly, since the student can navigate away and back to force a refresh.)

## Testing

- No backend changes — this is a frontend-only component extraction and wiring change.
- Manual QA (left to the user, per established project convention):
  - Standalone flow unchanged: `/t/:slug` (name entry, or auto-redirect if `sid` present) → `/t/:slug/take` (answer questions) → `/t/:slug/result` (view result) all still work identically, including browser back/refresh at each step.
  - Ordinary (non-practice) test-taking via `/t/:slug` is completely unaffected — `TakeTestEntryPage` is untouched.
  - Practice-mode inline flow: open a lesson with practice blocks → "Amaliyot" → "Qayta o'tish" auto-starts a new submission inline (no name form, sidebar visible, URL unchanged) → answer and submit → result shown inline → back action returns to `PracticeScreen` with updated "Sizning natijalaringiz" list (may require a full reload to reflect the new submission, per the Data flow note above) → "Ochish" on a past submission opens it inline directly in result/view-only mode (skips the `'answering'` phase entirely since its submission is already `'submitted'`).
  - Mid-test exit: start a practice test, answer a question, click the new inline "← Orqaga" control → confirm it returns to `PracticeScreen` without submitting, and reopening "Qayta o'tish" resumes the draft (existing localStorage draft mechanism).
- Frontend build (`tsc -b && vite build`) verified clean by the implementing session, same as prior tasks in this feature area.
