# Inline Practice Test-Taking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Qayta o'tish" (retake) and "Ochish" (open past submission) in the student practice screen (`PracticeScreen.tsx`) render the test inline in `MyCoursesPage.tsx`'s content area, instead of navigating away to the standalone `/t/:slug` route — while leaving the standalone route's own behavior completely unchanged.

**Architecture:** Extract the combined logic of three existing pages (`TakeTestEntryPage` → `TakeTestPage` → `TestResultPage`, today chained via `navigate()`) into one new component, `TestTaker`, that manages `starting` / `answering` / `result` as internal React state instead of route transitions. The standalone pages become thin wrappers around `TestTaker` that translate its callbacks into real `navigate()` calls (preserving today's URLs and behavior byte-for-byte). `MyCoursesPage.tsx` renders the same `TestTaker` directly, with its callbacks wired to local state instead of `navigate()`, so the lesson sidebar stays visible and the URL never changes.

**Tech Stack:** React 19, TypeScript, react-router-dom, existing `apps/frontend/src/api/delivery.ts` and `apps/frontend/src/api/auth.ts` API clients, zustand `useAuthStore`.

## Global Constraints

- The standalone `/t/:slug`, `/t/:slug/take`, `/t/:slug/result` routes MUST behave identically to today after this change — same URLs, same navigation, same name-entry flow for non-practice test-taking. `TakeTestEntryPage.tsx` is not touched at all.
- Practice-mode inline test-taking MUST NOT show a name-entry screen — the student's name is resolved automatically (`useAuthStore` admin name, or `apiGetMe()` if only a token is present), exactly mirroring the existing lookup in `TakeTestEntryPage.tsx:28-42`.
- No backend changes. No changes to the practice-context override mechanism (`?practice=1` forcing `showResults=immediately, oneByOne=false, requireAuth=true, deadline` ignored).
- No changes to non-practice (ordinary) test-taking behavior.
- Sidebar (`<aside>` lesson list) in `MyCoursesPage.tsx` must remain visible and interactive while a practice test is open inline.
- Frontend build (`cd apps/frontend && npm run build`, i.e. `tsc -b && vite build`) must be clean (0 errors) after every task. No automated test suite exists for this frontend code — build-clean is the verification bar for every task in this plan.

---

## File Structure

- **Create:** `apps/frontend/src/components/test/TestTaker.tsx` — the extracted, phase-driven test-taking component. Contains everything currently in `TakeTestPage.tsx` (question renderers, state, effects, submit/beacon logic, JSX) plus the new `starting` phase (name resolution + `apiStartSubmission`) adapted from `TakeTestEntryPage.tsx`, plus the `result` phase adapted from `TestResultPage.tsx`.
- **Modify:** `apps/frontend/src/pages/TakeTestPage.tsx` — shrinks from ~950 lines to a thin wrapper rendering `TestTaker` with route-derived props and `navigate()`-based callbacks.
- **Modify:** `apps/frontend/src/pages/TestResultPage.tsx` — refactored to accept `{ submissionId, practiceMode }` as props (extracted into a new exported function `TestResultView`) instead of reading `useSearchParams` directly, so `TestTaker`'s `result` phase can reuse its JSX. The route-level `TestResultPage` component becomes a thin wrapper that reads `useSearchParams` and renders `TestResultView`.
- **Modify:** `apps/frontend/src/components/student/PracticeScreen.tsx` — `onStartPractice`/`onViewSubmission` prop types stay the same (parent decides what they do); no internal change needed here beyond what Task 4 requires (none — verified in Task 4).
- **Modify:** `apps/frontend/src/pages/MyCoursesPage.tsx` — adds `activeTest` state and a third branch in the `<main>` content switch that renders `TestTaker` inline; changes `onStartPractice`/`onViewSubmission` callbacks passed to `PracticeScreen` to set `activeTest` instead of `navigate()`.

---

### Task 1: Extract `TestResultView` from `TestResultPage`

This is the smallest, most isolated piece — `TestResultPage.tsx` already has no router coupling beyond `useSearchParams`, so this task only changes how it receives its two inputs.

**Files:**
- Modify: `apps/frontend/src/pages/TestResultPage.tsx` (full file, currently 374 lines)

**Interfaces:**
- Produces: `export function TestResultView({ submissionId, practiceMode }: { submissionId: string | null; practiceMode: boolean }): JSX.Element` — pure props-driven, no router hooks. Later tasks (`TestTaker`) import and render this directly.
- Produces (unchanged): `export function TestResultPage(): JSX.Element` — the route-level wrapper, same export name, same route (`/t/:slug/result`), same rendered output as today.
- Produces (unchanged): `export function getCachedSubmissionResult(...)` — keep this helper exported exactly as today; `TestResultView` uses it internally.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `sed -n '1,40p' apps/frontend/src/pages/TestResultPage.tsx`
Expected: matches the content already known — `getCachedSubmissionResult` at line 15, `TestResultPage` function starting at line 31, with `useSearchParams()` at line 32 and `isPractice`/`sid` derived at lines 34/37.

- [ ] **Step 2: Rename the function and change its signature to accept props**

Change:
```tsx
export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const isPractice = searchParams.get("practice") === "1";

  useEffect(() => {
    const sid = searchParams.get("sid");
    const raw = sessionStorage.getItem("submissionResult");
```
to:
```tsx
export function TestResultView({
  submissionId,
  practiceMode,
}: {
  submissionId: string | null;
  practiceMode: boolean;
}) {
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const isPractice = practiceMode;

  useEffect(() => {
    const sid = submissionId;
    const raw = sessionStorage.getItem("submissionResult");
```

Everything below this point in the function body (the rest of the `useEffect`, the `if (!result) return ...`, and the entire render tree) is unchanged — it already only references the local `sid`/`isPractice`/`result` variables, not `searchParams` directly.

- [ ] **Step 3: Add the new thin route wrapper at the end of the file**

Append after the closing brace of `TestResultView` (end of file, replacing nothing — this is new code):
```tsx
export function TestResultPage() {
  const [searchParams] = useSearchParams();
  return (
    <TestResultView
      submissionId={searchParams.get("sid")}
      practiceMode={searchParams.get("practice") === "1"}
    />
  );
}
```

- [ ] **Step 4: Verify the `useEffect` dependency array still references `submissionId`/`practiceMode` correctly**

Read the full `useEffect` block after your edit (it should still close with `}, []);` — the original had an empty dependency array relying on `searchParams` being stable across the component's mount; since `submissionId`/`practiceMode` are now props read once at mount time (same lifecycle as before — `TestTaker` will only mount a fresh `TestResultView` instance per submission, never reuse one across different submissions), leave the dependency array as `[]`, unchanged from today.

- [ ] **Step 5: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: `tsc -b && vite build` completes with 0 errors. (`useSearchParams` import remains used by the new `TestResultPage` wrapper, so no unused-import error.)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/TestResultPage.tsx
git commit -m "refactor(test-result): extract TestResultView as props-driven component

Splits TestResultPage into a pure TestResultView (submissionId, practiceMode
props) and a thin route wrapper, so the result UI can be reused inline by
TestTaker without router coupling. Route behavior at /t/:slug/result is
unchanged."
```

---

### Task 2: Create `TestTaker` — starting phase (auto-start, no name form)

Build the new component's skeleton and the `starting` phase only. `answering`/`result` phases are added in Tasks 3-4. This task also establishes the phase-state scaffold both later tasks build on.

**Files:**
- Create: `apps/frontend/src/components/test/TestTaker.tsx`

**Interfaces:**
- Consumes: `apiGetPublicTest`, `apiStartSubmission`, `apiGetSubmission` from `apps/frontend/src/api/delivery.ts` (all already exist, signatures: `apiGetPublicTest(slug: string, practiceMode = false): Promise<PublicTest>`, `apiStartSubmission(slug: string, studentName: string, practiceMode = false): Promise<{ submissionId: string }>`, `apiGetSubmission(submissionId: string, practiceMode = false): Promise<{ status: string; ... }>`).
- Consumes: `apiGetMe` from `apps/frontend/src/api/auth.ts` (`Promise<Admin>`, `Admin` has a `.name` field — confirmed via `apps/frontend/src/pages/TakeTestEntryPage.tsx:37`).
- Consumes: `useAuthStore` from `apps/frontend/src/stores/authStore.ts` (`admin: Admin | null`, `token: string | null`).
- Produces: `export function TestTaker({ slug, submissionId, practiceMode, onNavigateResult, onExit }: TestTakerProps): JSX.Element` and `export interface TestTakerProps { slug: string; submissionId?: string; practiceMode: boolean; onNavigateResult: (submissionId: string) => void; onExit: () => void; }` — the full public contract later tasks (and `TakeTestPage.tsx`, `MyCoursesPage.tsx`) import and use.

- [ ] **Step 1: Create the file with imports and the phase-state skeleton**

```tsx
import { useEffect, useState } from "react";
import { apiGetPublicTest, apiStartSubmission, apiGetSubmission } from "../../api/delivery";
import { apiGetMe } from "../../api/auth";
import { useAuthStore } from "../../stores/authStore";

export interface TestTakerProps {
  slug: string;
  submissionId?: string;
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;
  onExit: () => void;
}

type Phase = "starting" | "answering" | "result";

export function TestTaker({ slug, submissionId: initialSubmissionId, practiceMode, onNavigateResult, onExit }: TestTakerProps) {
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" as Phase : "starting");
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);

  function goToResult(sid: string) {
    setResolvedSubmissionId(sid);
    setPhase("result");
    onNavigateResult(sid);
  }

  // Determine starting phase: if a submissionId was passed in, check its
  // status first (mirrors TakeTestEntryPage.tsx:44-69 and the redirect
  // TakeTestPage.tsx:518-529 performs today).
  useEffect(() => {
    if (!initialSubmissionId) {
      setPhase("starting");
      return;
    }
    let cancelled = false;
    apiGetSubmission(initialSubmissionId, practiceMode)
      .then((sub) => {
        if (cancelled) return;
        if (sub.status === "submitted") {
          goToResult(initialSubmissionId);
        } else {
          setPhase("answering");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("starting");
        }
      });
    return () => { cancelled = true; };
  }, [initialSubmissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: falling back to "starting" here leaves resolvedSubmissionId holding
  // the stale invalid initialSubmissionId until the effect below overwrites it
  // with a freshly-started submission's id — resolvedSubmissionId is never read
  // while phase is "starting" (the loading-guard in Step 1 below returns early
  // for that phase), so this is safe.

  // Auto-start: resolve name and call apiStartSubmission, mirroring
  // TakeTestEntryPage.tsx:28-42 (name resolution) and :71-88 (start call),
  // but skipping the visible name-entry form per the practice-mode design.
  useEffect(() => {
    if (phase !== "starting") return;
    let cancelled = false;

    async function start() {
      let name = adminName;
      if (!name && token) {
        try {
          const me = await apiGetMe();
          name = me.name;
        } catch {
          // fall through to error below
        }
      }
      if (!name) {
        if (!cancelled) setStartError("Foydalanuvchi aniqlanmadi. Qaytadan kiring.");
        return;
      }
      try {
        const { submissionId: newId } = await apiStartSubmission(slug, name, practiceMode);
        if (cancelled) return;
        setResolvedSubmissionId(newId);
        setPhase("answering");
      } catch {
        if (!cancelled) setStartError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    }

    void start();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (startError) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-red-400 text-center text-sm">{startError}</p>
      </div>
    );
  }

  if (phase === "starting" || phase === ("checking" as Phase) || !resolvedSubmissionId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  if (phase === "result") {
    return <div>{/* Task 4 replaces this with TestResultView */}</div>;
  }

  // phase === "answering"
  return <div>{/* Task 3 replaces this with the question-answering UI */}</div>;
}
```

- [ ] **Step 2: Fix the `Phase` type to include `"checking"` properly**

The `"checking" as Phase` cast in Step 1 is a temporary placeholder — replace it with a real fourth phase value now so the type is sound. Change:
```tsx
type Phase = "starting" | "answering" | "result";
```
to:
```tsx
type Phase = "checking" | "starting" | "answering" | "result";
```
and change the two casts:
```tsx
const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" as Phase : "starting");
```
to:
```tsx
const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" : "starting");
```
and:
```tsx
if (phase === "starting" || phase === ("checking" as Phase) || !resolvedSubmissionId) {
```
to:
```tsx
if (phase === "starting" || phase === "checking" || !resolvedSubmissionId) {
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors. `TestTaker` is not yet imported anywhere, so this only validates the new file compiles standalone.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/test/TestTaker.tsx
git commit -m "feat(test-taker): scaffold TestTaker with starting/checking phase

Adds the phase-state skeleton (checking -> starting -> answering -> result)
and the auto-start logic that resolves the student's name from
useAuthStore/apiGetMe and calls apiStartSubmission without showing a name
form, per the inline-practice-test-taking design. answering/result phases
are placeholder JSX, completed in follow-up tasks."
```

---

### Task 3: `TestTaker` — answering phase (move `TakeTestPage`'s question UI in)

Move the entire question-answering implementation from `TakeTestPage.tsx` into `TestTaker.tsx`, adapting only the 4 `navigate(...)` call sites and adding the "← Orqaga" exit control.

**Files:**
- Modify: `apps/frontend/src/components/test/TestTaker.tsx`
- Read (do not modify yet): `apps/frontend/src/pages/TakeTestPage.tsx` (source of the code being moved — Task 5 removes it from here)

**Interfaces:**
- Consumes: `TestTakerProps`, `Phase`, `goToResult`, `resolvedSubmissionId`, `onExit` from Task 2's scaffold.
- Consumes: `PublicTest`, `PublicQuestion`, `apiSubmitAnswers`, `apiCheckAnswer` from `apps/frontend/src/api/delivery.ts`; `getPublicBaseUrl` from `apps/frontend/src/api/baseUrl.ts`; `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; `lucide-react` icons `Clock, CheckCircle2, XCircle`.
- Produces: the fully working `answering` phase, replacing Task 2's placeholder `<div>`.

- [ ] **Step 1: Copy all module-level helpers and question-renderer components from `TakeTestPage.tsx` into `TestTaker.tsx`**

Copy verbatim from `apps/frontend/src/pages/TakeTestPage.tsx` lines 1-474 (all imports needed by this code, `SortableItem`, `ReorderQuestion`, `mediaUrl`, `isArabicText`, `VIOLATION_REASON`, `draftKey`, `MatchingQuestion`, `SliderQuestion`, `DropPinQuestion`, `seededShuffle`, `TYPE_BADGES`, the `QuestionFeedback` interface) into `TestTaker.tsx`, placed above the `TestTakerProps` interface. Merge the import list with `TestTaker.tsx`'s existing imports from Task 2 (dedupe `useEffect`/`useState` from `react`; add `useMemo`, `useRef`).

The full merged import block at the top of `TestTaker.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import {
  apiGetPublicTest,
  apiStartSubmission,
  apiGetSubmission,
  apiSubmitAnswers,
  apiCheckAnswer,
  type PublicTest,
  type PublicQuestion,
} from "../../api/delivery";
import { apiGetMe } from "../../api/auth";
import { useAuthStore } from "../../stores/authStore";
import { getPublicBaseUrl } from "../../api/baseUrl";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

Below this, paste (unchanged) `TakeTestPage.tsx` lines 30-474: `SortableItem`, `ReorderQuestion`, `BACKEND`/`mediaUrl`, `ARABIC_RE`/`isArabicText`, `VIOLATION_REASON`, `draftKey`, `MatchingQuestion`, `SliderQuestion`, `DropPinQuestion`, `seededShuffle`, `TYPE_BADGES`, `QuestionFeedback`.

- [ ] **Step 2: Move the internal state and effects from `TakeTestPage.tsx`'s function body into `TestTaker`, adapted to use `slug`/`practiceMode`/`resolvedSubmissionId` props instead of route params**

Inside the `TestTaker` function body (from Task 2), after the existing `starting`/`checking` phase logic and before the `if (startError)` guard, add all of the following state, declared once at the top of the component (merge with Task 2's existing `phase`/`resolvedSubmissionId`/`startError`/`adminName`/`token` state — do not duplicate):

```tsx
const [test, setTest] = useState<PublicTest | null>(null);
const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
const [currentIdx, setCurrentIdx] = useState(0);
const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
const [textMap, setTextMap] = useState<Record<string, string>>({});
const [timeLeft, setTimeLeft] = useState<number | null>(null);
const [submitting, setSubmitting] = useState(false);
const [fontSize, setFontSize] = useState(16);
const [feedbackMap, setFeedbackMap] = useState<Record<string, QuestionFeedback>>({});
const [checking, setChecking] = useState(false);

const selectedMapRef = useRef<Record<string, string[]>>({});
const textMapRef = useRef<Record<string, string>>({});
const orderedQuestionsRef = useRef<PublicQuestion[]>([]);
const submittingRef = useRef(false);
const autoSubmitSentRef = useRef(false);

useEffect(() => { selectedMapRef.current = selectedMap; }, [selectedMap]);
useEffect(() => { textMapRef.current = textMap; }, [textMap]);
useEffect(() => { orderedQuestionsRef.current = orderedQuestions; }, [orderedQuestions]);
useEffect(() => { submittingRef.current = submitting; }, [submitting]);
```

This directly mirrors `TakeTestPage.tsx` lines 483-517 (skipping the `slug`/`searchParams`/`navigate`/`submissionId`/`isPractice`/`practiceSuffix` declarations, which `TestTaker` already has as props/derived values from Task 2).

- [ ] **Step 3: Add the submission-status-check effect, adapted (this logic is now redundant with Task 2's `checking` phase — confirm and skip)**

`TakeTestPage.tsx` lines 518-529 check `apiGetSubmission` status when a `submissionId` is present and redirect to `/result` if already submitted. `TestTaker`'s Task 2 `checking`-phase effect already performs this exact check (calling `goToResult` instead of `navigate`). **Do not duplicate this effect** — Task 2's version supersedes it. Verify by reading your Task 2 code that the `checking` phase effect covers this, then proceed.

- [ ] **Step 4: Add the test-fetching, draft-restore, timer, and beacon effects, adapted**

Add these effects to `TestTaker`, copied from `TakeTestPage.tsx` lines 531-699, with these substitutions applied throughout: `slug` (prop, already available, no `!` needed since prop is typed `string`), `isPractice` → `practiceMode` (prop), `submissionId` → `resolvedSubmissionId` (state from Task 2; guaranteed non-null once this code runs since it only renders during the `answering` phase), and the two `navigate(...)` calls replaced as shown:

```tsx
useEffect(() => {
  apiGetPublicTest(slug, practiceMode).then((t) => {
    setTest(t);
    const qs = t.shuffleQuestions
      ? seededShuffle(t.questions, resolvedSubmissionId ?? "")
      : [...t.questions];
    const qsWithOpts = qs.map((q) => ({
      ...q,
      options:
        t.shuffleOptions && q.type !== "matching"
          ? seededShuffle(q.options, (resolvedSubmissionId ?? "") + q.id)
          : q.options,
    }));
    setOrderedQuestions(qsWithOpts);
    const initSelected: Record<string, string[]> = {};
    for (const q of qsWithOpts) {
      if (q.type === "reorder") {
        initSelected[q.id] = q.options.map((o) => o.id);
      }
    }
    const savedDraft = resolvedSubmissionId
      ? localStorage.getItem(draftKey(resolvedSubmissionId))
      : null;
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as {
          selectedMap?: Record<string, string[]>;
          textMap?: Record<string, string>;
          currentIdx?: number;
        };
        const questionIds = new Set(qsWithOpts.map((q) => q.id));
        const restoredSelected = Object.fromEntries(
          Object.entries(parsed.selectedMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        const restoredText = Object.fromEntries(
          Object.entries(parsed.textMap ?? {}).filter(([id]) => questionIds.has(id)),
        );
        setSelectedMap({ ...initSelected, ...restoredSelected });
        setTextMap(restoredText);
        if (
          typeof parsed.currentIdx === "number" &&
          parsed.currentIdx >= 0 &&
          parsed.currentIdx < qsWithOpts.length
        ) {
          setCurrentIdx(parsed.currentIdx);
        }
      } catch {
        setSelectedMap(initSelected);
      }
    } else {
      setSelectedMap(initSelected);
    }
    if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
  });
}, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  if (!resolvedSubmissionId || orderedQuestions.length === 0 || submittingRef.current) return;
  const payload = JSON.stringify({ selectedMap, textMap, currentIdx, updatedAt: Date.now() });
  localStorage.setItem(draftKey(resolvedSubmissionId), payload);
}, [resolvedSubmissionId, orderedQuestions.length, selectedMap, textMap, currentIdx]);

useEffect(() => {
  if (timeLeft === null || timeLeft <= 0) return;
  const id = setInterval(() => {
    setTimeLeft((prev) => {
      if (prev === null || prev <= 1) {
        clearInterval(id);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);
  return () => clearInterval(id);
}, [timeLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  if (timeLeft === 0) handleSubmit();
}, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  if (!resolvedSubmissionId) return;
  const sendSubmit = () => {
    if (submittingRef.current || autoSubmitSentRef.current || orderedQuestionsRef.current.length === 0) return;
    const answers = orderedQuestionsRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMapRef.current[q.id] ?? [],
      textAnswer: textMapRef.current[q.id] ?? null,
    }));
    const base = getPublicBaseUrl() || window.location.origin;
    const url = `${base}/public/submissions/${resolvedSubmissionId}/submit${practiceMode ? "?practice=1" : ""}`;
    const body = JSON.stringify({ answers, mode: "violation", violationReason: VIOLATION_REASON });
    autoSubmitSentRef.current = true;
    const beacon = () => navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }));
    try {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        autoSubmitSentRef.current = false;
        beacon();
      });
    } catch {
      autoSubmitSentRef.current = false;
      beacon();
    }
  };
  let submitSent = false;
  const handleVisibility = () => {
    if (document.visibilityState === "hidden") {
      sendSubmit();
      submitSent = true;
    } else if (document.visibilityState === "visible" && submitSent) {
      setTimeout(() => {
        apiGetSubmission(resolvedSubmissionId, practiceMode)
          .then((sub) => {
            if (sub.status === "submitted") goToResult(resolvedSubmissionId);
            else autoSubmitSentRef.current = false;
          })
          .catch(() => {});
      }, 800);
    }
  };
  const handleBeforeUnload = () => { sendSubmit(); };
  const handlePageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) sendSubmit();
  };
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, [resolvedSubmissionId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Add `handleSubmit` and `handleCheck`, adapted**

```tsx
async function handleSubmit() {
  if (submitting || !test || !resolvedSubmissionId) return;
  submittingRef.current = true;
  setSubmitting(true);
  const answers = orderedQuestions.map((q) => ({
    questionId: q.id,
    selectedOptionIds: selectedMap[q.id] ?? [],
    textAnswer: textMap[q.id] ?? null,
  }));
  try {
    const result = await apiSubmitAnswers(resolvedSubmissionId, answers, "normal", undefined, practiceMode);
    sessionStorage.setItem("submissionResult", JSON.stringify(result));
    localStorage.removeItem(draftKey(resolvedSubmissionId));
    goToResult(resolvedSubmissionId);
  } catch {
    submittingRef.current = false;
    setSubmitting(false);
  }
}

async function handleCheck() {
  if (!test || checking || !resolvedSubmissionId) return;
  const q = orderedQuestions[currentIdx];
  if (!q) return;
  setChecking(true);
  try {
    const { isCorrect, correctAnswer } = await apiCheckAnswer(
      resolvedSubmissionId,
      q.id,
      selectedMap[q.id] ?? [],
      textMap[q.id] ?? null,
    );
    setFeedbackMap((prev) => ({ ...prev, [q.id]: { isCorrect, correctAnswer } }));
  } finally {
    setChecking(false);
  }
}
```

Note: `handleSubmit` is referenced by the timer effect in Step 4 (`if (timeLeft === 0) handleSubmit();`) — in JavaScript, function declarations aren't hoisted the same way when defined as `async function` expressions inside a component body assigned this way; keep these as plain `async function handleSubmit() {...}` declarations (not `const handleSubmit = async () => {...}`), placed anywhere in the component body — function declarations are hoisted, so the timer effect above can reference `handleSubmit` regardless of source order, matching `TakeTestPage.tsx`'s existing working pattern (`handleSubmit` is defined at line 701, after the effect that calls it at line 619, in the original file).

- [ ] **Step 6: Add `toggleOption`, `arrangeAdd`, `arrangeRemove` (unchanged)**

Copy verbatim from `TakeTestPage.tsx` lines 742-772.

- [ ] **Step 7: Add the loading guard, derived values, and `renderQuestionBody`, adapted**

Copy `TakeTestPage.tsx` lines 774-1028 verbatim, with one change: the top-level `if (!test) return (...)` guard's returned JSX loses the `min-h-screen` full-page wrapper (since this now renders inline, not as a full page) — change:
```tsx
if (!test)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );
```
to:
```tsx
if (!test)
  return (
    <div className="flex items-center justify-center py-24">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );
```
Everything else in this range (`isPerQuestion`, `isOneByOne`, `questions`, `isLast`, `formatTime`, `currentQ`, `currentFeedback`, `isChecked`, `isQuestionAnswered`, `canJumpTo`, `OPTION_LABELS`, `renderQuestionBody`) is copied unchanged — none of it references routing.

- [ ] **Step 8: Add the render tree, adapted with an exit control**

Copy `TakeTestPage.tsx` lines 1030-1421 (the full `return (...)` render tree) into `TestTaker`, replacing Task 2's placeholder `if (phase === "answering") return <div>...</div>;` block. Two changes to the copied JSX:

1. The outermost wrapper currently is:
```tsx
<div
  className="flex flex-col bg-white notranslate"
  translate="no"
  style={
    { "--q-fs": fontSize + "px", height: "100dvh" } as React.CSSProperties
  }
>
```
Since this now renders inline inside `MyCoursesPage.tsx`'s content area (not as a standalone full-viewport page), change `height: "100dvh"` to `minHeight: "60vh"` so it doesn't force full-viewport height when embedded:
```tsx
<div
  className="flex flex-col bg-white notranslate"
  translate="no"
  style={
    { "--q-fs": fontSize + "px", minHeight: "60vh" } as React.CSSProperties
  }
>
```

2. Add a "← Orqaga" exit button to the header. Find the header block (starts `{/* ── HEADER ── */}`) and its first child (the `<span className="hidden lg:block ...">{test.name}</span>` desktop test-name label). Immediately before that span, add:
```tsx
<button
  type="button"
  onClick={onExit}
  className="shrink-0 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700"
>
  ← Orqaga
</button>
```

- [ ] **Step 9: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors. Watch specifically for: unused-variable errors (the merge in Step 1-2 may leave duplicate declarations — `phase`/`resolvedSubmissionId` must each be declared exactly once across Task 2 + this task), and the `handleSubmit`/`handleCheck` hoisting concern from Step 5.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/components/test/TestTaker.tsx
git commit -m "feat(test-taker): add answering phase (question UI moved from TakeTestPage)

Moves TakeTestPage's ~950-line question-answering implementation
(fetch/draft-restore/timer/beacon/submit/render) into TestTaker's
'answering' phase unchanged, substituting props for route params and
adding a '← Orqaga' exit control so inline callers can close the test
without a route transition. TakeTestPage.tsx itself is untouched until
Task 5."
```

---

### Task 4: `TestTaker` — result phase (reuse `TestResultView`)

**Files:**
- Modify: `apps/frontend/src/components/test/TestTaker.tsx`

**Interfaces:**
- Consumes: `TestResultView` from `apps/frontend/src/pages/TestResultPage.tsx` (Task 1's output: `{ submissionId: string | null; practiceMode: boolean }` props).

- [ ] **Step 1: Import `TestResultView`**

Add to the top of `TestTaker.tsx`:
```tsx
import { TestResultView } from "../../pages/TestResultPage";
```

- [ ] **Step 2: Replace the `result`-phase placeholder**

Change:
```tsx
if (phase === "result") {
  return <div>{/* Task 4 replaces this with TestResultView */}</div>;
}
```
to:
```tsx
if (phase === "result") {
  return (
    <div>
      <button
        type="button"
        onClick={onExit}
        className="mb-2 inline-flex items-center gap-1.5 px-4 pt-4 text-xs font-bold text-gray-500 hover:text-gray-700 lg:px-8"
      >
        ← Orqaga
      </button>
      <TestResultView submissionId={resolvedSubmissionId} practiceMode={practiceMode} />
    </div>
  );
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/test/TestTaker.tsx
git commit -m "feat(test-taker): add result phase reusing TestResultView

Completes TestTaker's three phases. Result view reuses Task 1's
TestResultView unchanged, with a new '← Orqaga' exit control for inline
callers (the standalone /t/:slug/result page has no equivalent button
today and keeps none — this control only renders when TestTaker itself
is showing the result phase, which the standalone TakeTestPage wrapper
built in Task 5 does not use for its own /result route)."
```

---

### Task 5: Shrink `TakeTestPage.tsx` to a thin wrapper

**Files:**
- Modify: `apps/frontend/src/pages/TakeTestPage.tsx` (full rewrite — from ~950 lines down to a thin wrapper)

**Interfaces:**
- Consumes: `TestTaker`, `TestTakerProps` from `apps/frontend/src/components/test/TestTaker.tsx` (Tasks 2-4's output).
- Produces (unchanged export): `export function TakeTestPage(): JSX.Element`, still the default export used by the `/t/:slug/take` route in `App.tsx:46` — no route or export-name change needed.

- [ ] **Step 1: Replace the entire file contents**

The whole file becomes:
```tsx
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { TestTaker } from "../components/test/TestTaker";

export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get("sid") ?? undefined;
  const isPractice = searchParams.get("practice") === "1";
  const practiceSuffix = isPractice ? "&practice=1" : "";

  return (
    <TestTaker
      slug={slug!}
      submissionId={submissionId}
      practiceMode={isPractice}
      onNavigateResult={(sid) =>
        navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`, { replace: true })
      }
      onExit={() => navigate(`/t/${slug}`)}
    />
  );
}
```

This preserves `TakeTestPage.tsx`'s current navigation behavior exactly: the 3 `navigate(...)` calls that used to transition to `/result` (lines 523, 674, 714 in the original file) are now all funneled through `TestTaker`'s `goToResult` → `onNavigateResult`, which performs the identical `navigate('/t/${slug}/result?sid=...&practice=1', { replace: true })`. The 1 invalid-submission bounce (original line 527, `navigate('/t/${slug}')`) is now handled inside `TestTaker`'s `checking`-phase `.catch()` (Task 2), which falls back to the `starting` phase (auto-start) rather than bouncing to the entry page — this is an intentional, spec-documented behavior difference from the removed page **only within `TestTaker`'s internal logic**; but note the *route*-level behavior for `/t/:slug/take?sid=<invalid>` changes from "redirect to `/t/:slug`" to "attempt to auto-start a new submission using the resolved user name, immediately reusing the same `slug`" — call this out in the final report as a deliberate simplification (in both cases the user ends up needing to enter/resolve a name and start again; the difference is whether that happens via `TakeTestEntryPage`'s form or `TestTaker`'s auto-start). `onExit` is new: today's `TakeTestPage` has no exit control, so this callback was never triggered from the standalone route before; wiring it to `navigate('/t/${slug}')` gives it sane, harmless behavior (returns to the entry page) if a future standalone-page design adds a visible exit action, without altering any behavior reachable today.

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/TakeTestPage.tsx
git commit -m "refactor(take-test-page): shrink to thin wrapper around TestTaker

TakeTestPage.tsx now only reads route params/search params and renders
TestTaker, translating its callbacks into navigate() calls that match
the page's exact prior behavior for the /t/:slug/take and
/t/:slug/result transitions."
```

---

### Task 6: Wire inline rendering into `MyCoursesPage.tsx` and `PracticeScreen.tsx`

**Files:**
- Modify: `apps/frontend/src/pages/MyCoursesPage.tsx`
- Read (no changes needed, confirm in Step 1): `apps/frontend/src/components/student/PracticeScreen.tsx`

**Interfaces:**
- Consumes: `TestTaker` from `apps/frontend/src/components/test/TestTaker.tsx`.
- Consumes (unchanged): `PracticeScreenProps` (`onStartPractice: (block: ApiMyPracticeBlock) => void`, `onViewSubmission: (block: ApiMyPracticeBlock, submissionId: string) => void`) — `PracticeScreen.tsx` itself needs no code change; only the callbacks `MyCoursesPage.tsx` passes to it change.

- [ ] **Step 1: Confirm `PracticeScreen.tsx` needs no changes**

Run: `grep -n "onStartPractice\|onViewSubmission" apps/frontend/src/components/student/PracticeScreen.tsx`
Expected: two call sites (`onClick={() => onStartPractice(block)}` and `onClick={() => onViewSubmission(block, s.id)}`), both simple callback invocations with no navigation logic of their own — confirming the parent (`MyCoursesPage.tsx`) fully controls what these do, so no edit is needed in this file.

- [ ] **Step 2: Add the `TestTaker` import and `activeTest` state to `MyCoursesPage.tsx`**

Find the existing `showPractice` state declaration (`const [showPractice, setShowPractice] = useState(false);`) and the `useEffect` that resets it on `selectedLessonId` change. Add immediately after:
```tsx
const [activeTest, setActiveTest] = useState<{ slug: string; submissionId?: string } | null>(null);
useEffect(() => {
  setActiveTest(null);
}, [selectedLessonId]);
```

Add the import at the top of the file, alongside the existing `PracticeScreen` import:
```tsx
import { TestTaker } from '../components/test/TestTaker';
```

- [ ] **Step 3: Add the three-way content switch**

Find the existing conditional:
```tsx
{selected && showPractice ? (
  <PracticeScreen
    lesson={selected.lesson}
    onBack={() => setShowPractice(false)}
    onStartPractice={(block) => {
      if (block.testSlug) navigate(`/t/${block.testSlug}?practice=1`);
    }}
    onViewSubmission={(block, submissionId) => {
      if (block.testSlug) navigate(`/t/${block.testSlug}/result?sid=${submissionId}&practice=1`);
    }}
  />
) : selected ? (
  <LessonReader
    ...
```

Replace with:
```tsx
{selected && activeTest ? (
  <TestTaker
    slug={activeTest.slug}
    submissionId={activeTest.submissionId}
    practiceMode={true}
    onNavigateResult={() => {}}
    onExit={() => setActiveTest(null)}
  />
) : selected && showPractice ? (
  <PracticeScreen
    lesson={selected.lesson}
    onBack={() => setShowPractice(false)}
    onStartPractice={(block) => {
      if (block.testSlug) setActiveTest({ slug: block.testSlug });
    }}
    onViewSubmission={(block, submissionId) => {
      if (block.testSlug) setActiveTest({ slug: block.testSlug, submissionId });
    }}
  />
) : selected ? (
  <LessonReader
    ...
```

(Leave the rest of the `LessonReader` branch and its closing `: null}` exactly as-is — only the two branches above it change.)

- [ ] **Step 4: Check whether `navigate` is still used elsewhere in the file**

Run: `grep -n "navigate(" apps/frontend/src/pages/MyCoursesPage.tsx`
Expected: any remaining call sites are unrelated to practice (e.g. login redirects, if present) — if `navigate` becomes entirely unused after Step 3's edit, remove its `useNavigate()` declaration and import to avoid an unused-variable build error; if it's still used elsewhere, leave it as-is.

- [ ] **Step 5: Build to verify no TypeScript errors**

Run: `cd apps/frontend && npm run build`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/MyCoursesPage.tsx
git commit -m "feat(practice): render test-taking inline instead of navigating away

'Qayta o'tish' and 'Ochish' in PracticeScreen now set local activeTest
state instead of calling navigate('/t/:slug...'), so TestTaker renders
inside MyCoursesPage's content area with the lesson sidebar still
visible and the URL unchanged. Closing the inline test (via TestTaker's
new exit control) returns to PracticeScreen. Standalone /t/:slug
test-taking is untouched — see Task 5."
```

---

### Task 7: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full frontend build**

Run: `cd apps/frontend && npm run build`
Expected: `tsc -b && vite build` completes with 0 errors.

- [ ] **Step 2: Grep for any remaining direct `navigate` calls to `/t/` from practice-related files**

Run: `grep -rn "navigate(\`/t/" apps/frontend/src/pages/MyCoursesPage.tsx apps/frontend/src/components/student/PracticeScreen.tsx`
Expected: no matches (both files no longer construct `/t/:slug` URLs for practice navigation).

- [ ] **Step 3: Confirm the standalone routes in `App.tsx` are unchanged**

Run: `grep -n "/t/:slug" apps/frontend/src/App.tsx`
Expected: identical to before this plan — `{ path: '/t/:slug', element: <TakeTestEntryPage /> }`, `{ path: '/t/:slug/take', element: <TakeTestPage /> }`, `{ path: '/t/:slug/result', element: <TestResultPage /> }`.

- [ ] **Step 4: Confirm `TakeTestEntryPage.tsx` was never modified**

Run: `git log --oneline -- apps/frontend/src/pages/TakeTestEntryPage.tsx`
Expected: no commits from this plan appear (the file's history predates this plan entirely) — confirming the Global Constraint that this file is untouched.

- [ ] **Step 5: Report to the user**

Summarize: build is clean, standalone `/t/:slug` flow untouched (`TakeTestEntryPage.tsx` unmodified, `TakeTestPage.tsx`/`TestResultPage.tsx` behavior preserved via thin wrappers), practice-mode "Qayta o'tish"/"Ochish" now render inline via `TestTaker` with the lesson sidebar staying visible and no URL change. Note the one deliberate behavior nuance flagged in Task 5 Step 1 (invalid-submission handling inside `TestTaker` auto-restarts rather than bouncing to the entry page) for the user's awareness. Remind the user that manual browser QA (per the Testing section of the spec) is still needed to confirm the actual UI/UX, since no automated tests exist for this code.
