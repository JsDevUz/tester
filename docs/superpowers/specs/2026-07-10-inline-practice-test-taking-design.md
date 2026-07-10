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

### Component extraction: `TestTaker`

Extract `TakeTestPage.tsx`'s (~950 lines) internal logic and render tree into a new presentational component:

```
apps/frontend/src/components/test/TestTaker.tsx

interface TestTakerProps {
  slug: string;
  submissionId?: string;       // present → resume/view this submission; absent → start fresh
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;  // called after successful submit
  onExit: () => void;          // "back"/"close" action
}
```

- All internal state, effects, fetch/submit/timer/draft-autosave/beacon logic, and the question-rendering tree move into `TestTaker` unchanged in behavior.
- The existing module-level question-type renderers (`SortableItem`, `ReorderQuestion`, `MatchingQuestion`, `SliderQuestion`, `DropPinQuestion`, `seededShuffle`, draft-key helper) are reused as-is — no changes needed, they don't touch routing.
- The 4 existing `navigate(...)` call sites (result transition, invalid-submission bounce, post-submit, beacon/auto-submit effect) are replaced with calls to `onNavigateResult` / `onExit`.
- Draft-autosave (localStorage) is unchanged — closing via `onExit` mid-test leaves the draft in place; reopening the same slug/submission resumes it, per existing mechanism. No confirmation dialog on exit.

### `TakeTestPage.tsx` becomes a thin wrapper

```tsx
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
      onNavigateResult={(sid) => navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`)}
      onExit={() => navigate(-1)}  // or existing back-navigation behavior, preserved as-is
    />
  );
}
```

This preserves the standalone page's exact current behavior — the callbacks are the same `navigate()` calls that exist today, just relocated.

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
    onNavigateResult={(sid) => setActiveTest({ slug: activeTest.slug, submissionId: sid })}
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
- After `onNavigateResult` fires (test submitted), `activeTest.submissionId` is set, so `TestTaker` re-renders in result-viewing mode for that submission — matching today's `/t/:slug/result?sid=...` behavior, just inline.
- `onExit` (back/close) simply clears `activeTest`, returning the student to `PracticeScreen` (not `LessonReader` — `showPractice` remains `true` from before `activeTest` was set).

### Data flow / consistency

- `PracticeScreen`'s displayed scores (`earnedScore`, submissions list) come from `ApiMyLesson.practiceBlocks`, refreshed via `GroupsService.getMyCourseDetail` — this data is not automatically refetched when `activeTest` closes. Since this is pre-existing behavior (the same staleness already exists after any submission today) and out of scope for this fix, no change is made here; scores reflect their state as of the last full course-detail load. (Consistent with the earlier-fixed pattern where `course` state is patched locally after `apiMarkLessonComplete` — a similar local patch could be added later but is not required for this fix to work correctly, since the student can navigate away and back to force a refresh.)

## Testing

- No backend changes — this is a frontend-only component extraction and wiring change.
- Manual QA (left to the user, per established project convention): standalone `/t/:slug` test-taking still works identically (start, answer, submit, view result, browser back). Practice-mode inline flow: open a lesson with practice blocks → "Amaliyot" → "Qayta o'tish" opens the test inline (sidebar visible, URL unchanged) → answer and submit → result shown inline → back button returns to `PracticeScreen` with updated "Sizning natijalaringiz" list (may require a full reload to reflect the new submission, per the Data flow note above) → "Ochish" on a past submission opens it inline in view-only/result mode.
- Frontend build (`tsc -b && vite build`) verified clean by the implementing session, same as prior tasks in this feature area.
