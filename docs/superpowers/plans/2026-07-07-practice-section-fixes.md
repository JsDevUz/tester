# Practice Section Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical state-management, validation, and semantic issues in the Amaliyot (Practice) section to ensure data integrity and proper error handling.

**Architecture:**

- Fix threshold state coupling and validation logic in PracticeSection.tsx
- Add validation layers (required fields, state consistency checks) in PracticeBlockView + UI warnings
- Implement test deduplication in courseStore
- Add semantic gating for threshold (show only if test blocks exist)
- Add error handling for API failures with loading state
- Implement lazy test loading (load only when needed)

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand, axios client

## Global Constraints

- Frontend-only implementation (no backend changes)
- All state lives in courseStore (zustand)
- PracticeBlock model: `{ id, type, testId: null | string, description: string }`
- PracticeBlockType: `'test' | 'image' | 'file' | 'audio'`
- PRACTICE_BLOCK_LIMIT: 4
- Validation errors/warnings shown inline (toast or inline text, existing pattern)
- No breaking changes to existing props or signatures
- Build must pass: `npm run build --workspace=apps/frontend`
- No new dependencies

---

### Task 1: Fix threshold state coupling and validation

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeSection.tsx:35-38`
- Modify: `apps/frontend/src/components/course/PracticeSection.tsx:97-113`
- Test: Manual (no jest tests exist for this component)

**Interfaces:**

- Consumes: `setPassThreshold(courseId, moduleId, lessonId, data)` from courseStore
- Uses: `lesson.passThresholdEnabled`, `lesson.passThresholdPercent`

**Problem:**

- `handlePercentChange` always sends `{ enabled: true }`, coupling input change to toggle state
- Input cleared → `percent = null` but `enabled = true` → invalid state (threshold required but value unknown)
- `Number('')` → `NaN` possible (though `type="number"` mitigates in practice)

**Solution:**

- `handlePercentChange` only updates `percent`, preserves `enabled` state
- Clear input → set `percent = 70` (default) or reject with visual feedback
- Validate `percent` is 0-100, reject `NaN`

**Steps:**

- [ ] **Step 1: Update handlePercentChange logic**

Replace [PracticeSection.tsx:35-38](apps/frontend/src/components/course/PracticeSection.tsx#L35-L38):

```typescript
function handlePercentChange(value: string) {
  // Never toggle enabled state — only update percent
  if (value === "") {
    // Clear → default to 70
    setPassThreshold(courseId, moduleId, lessonId, {
      enabled: lesson.passThresholdEnabled,
      percent: 70,
    });
    return;
  }
  const num = Number(value);
  if (isNaN(num)) return; // Reject NaN silently (type=number prevents, but safety)
  const percent = Math.min(100, Math.max(0, num));
  setPassThreshold(courseId, moduleId, lessonId, {
    enabled: lesson.passThresholdEnabled,
    percent,
  });
}
```

- [ ] **Step 2: Test in browser**

1. Enable threshold toggle
2. Type "50" → should show 50, not change toggle state
3. Clear input → should reset to 70 (or show "70" as placeholder)
4. Type "150" → should clamp to 100
5. Disable toggle → input should disappear, percent reset to null (existing logic OK)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "fix(courses): decouple threshold percent input from enabled toggle

- handlePercentChange now only updates percent, preserves enabled state
- clearing input resets to default 70 instead of null
- rejects NaN input values
- fixes invalid state where enabled=true but percent=null"
```

---

### Task 2: Add visual validation (required field indicators + error messages)

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeBlockView.tsx:80-111`
- Modify: `apps/frontend/src/stores/courseStore.ts` — add optional validation helper (non-breaking)
- Test: Manual (no jest)

**Interfaces:**

- Receives: `block.type`, `block.testId`, `block.description`
- Shows: inline error/warning text

**Problem:**

- Test blocks can be `testId: null` (not selected)
- Description blocks can be `description: ''` (empty)
- No visual feedback; user doesn't know fields are required until save

**Solution:**

- Add `*` (required) indicator next to "Testni tanlang" and "Topshiriq matni" labels
- Show inline error message if empty (red text below input)
- Disable remove/move buttons? No — but show warning on top of card if any block is invalid

**Steps:**

- [ ] **Step 1: Add required indicators and validation state**

In [PracticeBlockView.tsx:80-111](apps/frontend/src/components/course/PracticeBlockView.tsx#L80-L111), replace the inner conditional:

```typescript
<div className="border-t border-gray-100 px-4 py-4">
  {block.type === 'test' ? (
    <>
      <p className="mb-1.5 text-sm text-gray-500">
        Testni tanlang <span className="text-red-500">*</span>
      </p>
      <select
        value={block.testId ?? ''}
        onChange={(e) => onSelectTest(e.target.value)}
        className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-indigo-400 ${
          block.testId ? 'border-gray-100 bg-gray-50' : 'border-red-200 bg-red-50/30'
        }`}
      >
        <option value="" disabled>Testni tanlang...</option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.questionCount} ta savol)
          </option>
        ))}
      </select>
      {!block.testId && (
        <p className="mt-1 text-xs text-red-500">Test tanlanishi shart</p>
      )}
    </>
  ) : (
    <>
      <p className="mb-1.5 text-sm text-gray-500">
        Topshiriq matni <span className="text-red-500">*</span>
      </p>
      <textarea
        value={block.description}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder={meta.placeholder}
        rows={3}
        className={`w-full resize-none rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-indigo-400 ${
          block.description.trim() ? 'border-gray-100 bg-gray-50' : 'border-orange-200 bg-orange-50/30'
        }`}
      />
      {!block.description.trim() && (
        <p className="mt-1 text-xs text-orange-500">Topshiriq matni bo'sh bo'lmasligi shart</p>
      )}
    </>
  )}
</div>
```

- [ ] **Step 2: Test in browser**

1. Add test block → select dropdown should show red until test chosen
2. Add image block → textarea should show orange until text entered
3. Clear text in image block → should show orange warning
4. Enter text in image block → should turn gray
5. Select test in test block → should turn gray

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeBlockView.tsx
git commit -m "feat(courses): add required field indicators and validation warnings

- test blocks: red border + 'Test tanlanishi shart' if testId empty
- description blocks: orange border + warning if description empty
- add * (required) indicator next to field labels"
```

---

### Task 3: Implement test deduplication in courseStore

**Files:**

- Modify: `apps/frontend/src/stores/courseStore.ts:415-441` (setPracticeBlockTest action)
- Test: Manual (no jest)

**Interfaces:**

- Receives: `testId` string from select dropdown
- Before setting: check if any other block in same lesson already has this testId

**Problem:**

- Same test can be added to multiple practice blocks
- Usually a mistake; wastes space and confuses student

**Solution:**

- In `setPracticeBlockTest`, check if another block in the lesson already uses this testId
- If yes: silently skip (or show info toast)
- If no or testId is being cleared (`testId = null`): proceed

**Steps:**

- [ ] **Step 1: Modify setPracticeBlockTest to check for duplicates**

Replace [courseStore.ts:415-441](apps/frontend/src/stores/courseStore.ts#L415-L441):

```typescript
setPracticeBlockTest: (courseId, moduleId, lessonId, blockId, testId) => {
  set({
    courses: get().courses.map((c) =>
      c.id !== courseId
        ? c
        : {
            ...c,
            modules: c.modules.map((m) =>
              m.id !== moduleId
                ? m
                : {
                    ...m,
                    lessons: m.lessons.map((l) => {
                      if (l.id !== lessonId) return l;
                      // Dedup: if setting testId, check no other block has it
                      if (testId && l.practiceBlocks.some((b) => b.id !== blockId && b.testId === testId)) {
                        return l; // Silently reject duplicate
                      }
                      return {
                        ...l,
                        practiceBlocks: l.practiceBlocks.map((b) =>
                          b.id === blockId ? { ...b, testId } : b,
                        ),
                      };
                    }),
                  },
            ),
          },
    ),
  });
},
```

- [ ] **Step 2: Test in browser**

1. Add test block 1, select Test A
2. Add test block 2, try to select Test A → select should revert to placeholder or show warning toast
3. Select Test B in block 2 → should work
4. Go back to block 1, change to Test B → block 2 should still have Test B (dedup prevents block 1 from taking it)

Note: Current code has no toast system for notifications. If needed, we can add `console.warn` or rely on silent fail. Check if toast/alert exists in codebase.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(courses): prevent duplicate test selection across practice blocks

- setPracticeBlockTest rejects testId if another block in same lesson already has it
- silently skips duplicate assignment (no breaking change)"
```

---

### Task 4: Add semantic gating for pass threshold (show only if test blocks exist)

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeSection.tsx:76-114` (threshold card)
- Test: Manual

**Interfaces:**

- Consumes: `lesson.practiceBlocks` array
- Checks: `practiceBlocks.some(b => b.type === 'test')`

**Problem:**

- Threshold only makes sense for test blocks (they produce scores)
- If lesson has only image/file/audio (ungradeable), threshold is meaningless
- Currently always shown, confuses teacher

**Solution:**

- Wrap threshold card in conditional: only show if `practiceBlocks.some(b => b.type === 'test')`
- If no test blocks: show muted message instead

**Steps:**

- [ ] **Step 1: Add conditional to threshold card render**

Replace [PracticeSection.tsx:76-114](apps/frontend/src/components/course/PracticeSection.tsx#L76-L114):

```typescript
{lesson.practiceBlocks.some((b) => b.type === 'test') ? (
  <div className="rounded-2xl border border-gray-100 bg-white p-4">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">Minimal o'tish balini talab qilish</p>
        <p className="text-xs text-gray-400">Yoqilsa, o'quvchi belgilangan foizdan kam ball to'plasa dars o'tilmagan hisoblanadi</p>
      </div>
      <button
        type="button"
        onClick={() => setPassThreshold(courseId, moduleId, lessonId, { enabled: !lesson.passThresholdEnabled })}
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors ${
          lesson.passThresholdEnabled ? 'bg-indigo-500' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            lesson.passThresholdEnabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>

    {lesson.passThresholdEnabled && (
      <div className="mt-3">
        <p className="mb-1.5 text-sm text-gray-500">Minimal foiz</p>
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            value={lesson.passThresholdPercent ?? ''}
            onChange={(e) => handlePercentChange(e.target.value)}
            placeholder="70"
            className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 pr-9 text-sm outline-none focus:border-indigo-400"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
        </div>
      </div>
    )}
  </div>
) : (
  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
    <p className="text-xs text-gray-400">Minimal o'tish bali faqat test blok qo'shilganda qo'llaniladi</p>
  </div>
)}
```

- [ ] **Step 2: Test in browser**

1. Create lesson with only test blocks → threshold card should show
2. Create lesson with only image/file/audio blocks → should show muted message instead
3. Add test block to lesson with only description blocks → threshold card should appear
4. Remove all test blocks → threshold card should disappear, show message

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "feat(courses): show pass-threshold only when test blocks exist

- threshold card hidden if no test-type blocks in lesson
- shows muted info message instead (semantic gating)
- prevents confusing UX when threshold is inapplicable"
```

---

### Task 5: Add error handling and loading state to test fetch

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeSection.tsx:24-30`
- Test: Manual

**Interfaces:**

- Consumes: `apiListAllTests()` from api/tests
- Sets: `tests` state
- Adds: `error` state, `loading` state

**Problem:**

- `apiListAllTests()` has no `.catch()` → failed fetch leaves tests empty, no error shown
- No loading indicator

**Solution:**

- Add `.catch()` to log error, set error state
- Add loading indicator (spinner or skeleton)
- Show error message if fetch fails
- Only render dropdowns once loading done

**Steps:**

- [ ] **Step 1: Update useState + useEffect**

Replace [PracticeSection.tsx:24-30](apps/frontend/src/components/course/PracticeSection.tsx#L24-L30):

```typescript
const [tests, setTests] = useState<AllTestsItem[]>([]);
const [testsLoading, setTestsLoading] = useState(false);
const [testsError, setTestsError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  setTestsLoading(true);
  setTestsError(null);
  apiListAllTests()
    .then((items) => {
      if (!cancelled) {
        setTests(items);
        setTestsLoading(false);
      }
    })
    .catch((err) => {
      if (!cancelled) {
        console.error("Failed to load tests:", err);
        setTestsError("Testlar yuklanmadi. Qayta urinib ko'ring.");
        setTestsLoading(false);
      }
    });
  return () => {
    cancelled = true;
  };
}, []);
```

- [ ] **Step 2: Show error and loading state in JSX**

In the blocks list render, update [PracticeSection.tsx:48-66](apps/frontend/src/components/course/PracticeSection.tsx#L48-L66) to pass loading state:

```typescript
{testsError && (
  <div className="mb-6 rounded-2xl border border-red-100 bg-red-50/50 p-3">
    <p className="text-xs text-red-600">{testsError}</p>
  </div>
)}

{lesson.practiceBlocks.length === 0 ? (
  <div className="mb-6 rounded-2xl border border-dashed border-gray-200 py-14 text-center">
    <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
    <p className="text-sm font-semibold text-gray-700">Hali blok qo'shilmagan</p>
    <p className="mt-1 text-xs text-gray-400">Pastroqdan blok qo'shing</p>
  </div>
) : (
  <div className="mb-6 flex flex-col gap-2">
    {lesson.practiceBlocks.map((block, index) => (
      <PracticeBlockView
        key={block.id}
        index={index}
        isFirst={index === 0}
        isLast={index === lesson.practiceBlocks.length - 1}
        block={block}
        tests={tests}
        testsLoading={testsLoading}
        onSelectTest={(testId) => setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)}
        onChangeDescription={(description) => setPracticeBlockDescription(courseId, moduleId, lessonId, block.id, description)}
        onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
        onMoveUp={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'up')}
        onMoveDown={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'down')}
      />
    ))}
  </div>
)}
```

- [ ] **Step 3: Update PracticeBlockView to handle loading**

In [PracticeBlockView.tsx:5-15](apps/frontend/src/components/course/PracticeBlockView.tsx#L5-L15), add to props:

```typescript
interface PracticeBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: PracticeBlock;
  tests: AllTestsItem[];
  testsLoading?: boolean;
  onSelectTest: (testId: string) => void;
  onChangeDescription: (description: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}
```

And in select render (line 84-95), disable while loading:

```typescript
<select
  value={block.testId ?? ''}
  onChange={(e) => onSelectTest(e.target.value)}
  disabled={testsLoading}
  className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed ${
    block.testId ? 'border-gray-100 bg-gray-50' : 'border-red-200 bg-red-50/30'
  }`}
>
  <option value="" disabled>{testsLoading ? 'Yuklanmoqda...' : 'Testni tanlang...'}</option>
  {tests.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name} ({t.questionCount} ta savol)
    </option>
  ))}
</select>
```

- [ ] **Step 4: Test in browser**

1. Load lesson with test block → dropdown should briefly show "Yuklanmoqda..." then populate
2. Simulate network error (DevTools throttle) → should show red error box with retry message
3. Refresh → should recover if connection restored

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx apps/frontend/src/components/course/PracticeBlockView.tsx
git commit -m "feat(courses): add error handling and loading state for test fetch

- added testsLoading and testsError state
- show loading indicator in dropdown: 'Yuklanmoqda...'
- show error box if apiListAllTests fails
- disable test select while loading
- add .catch() handler to log errors"
```

---

### Task 6: Implement lazy test loading (fetch only if needed)

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeSection.tsx:24-30`
- Test: Manual

**Interfaces:**

- Consumes: `lesson.practiceBlocks`
- Decides: fetch only if any block has `type === 'test'`

**Problem:**

- `useEffect` fetches tests every time PracticeSection mounts, even if no test blocks exist
- Wastes API call and load time

**Solution:**

- Modify `useEffect` to check if lesson has any test blocks first
- Only fetch if `lesson.practiceBlocks.some(b => b.type === 'test')`
- Add `lesson.id` to dependency array (re-fetch if switched to different lesson)

**Steps:**

- [ ] **Step 1: Modify useEffect to lazy-load**

Replace [PracticeSection.tsx:26-30](apps/frontend/src/components/course/PracticeSection.tsx#L26-L30):

```typescript
useEffect(() => {
  const hasTestBlocks = lesson.practiceBlocks.some((b) => b.type === "test");
  if (!hasTestBlocks) {
    setTests([]);
    setTestsLoading(false);
    return;
  }

  let cancelled = false;
  setTestsLoading(true);
  setTestsError(null);
  apiListAllTests()
    .then((items) => {
      if (!cancelled) {
        setTests(items);
        setTestsLoading(false);
      }
    })
    .catch((err) => {
      if (!cancelled) {
        console.error("Failed to load tests:", err);
        setTestsError("Testlar yuklanmadi. Qayta urinib ko'ring.");
        setTestsLoading(false);
      }
    });
  return () => {
    cancelled = true;
  };
}, [lesson.practiceBlocks]); // Re-run if blocks change
```

- [ ] **Step 2: Test in browser**

1. Create lesson with only image/file/audio blocks → DevTools Network tab should show NO `/live/tests` call
2. Add test block to the lesson → should trigger fetch, show loading, then populate
3. Remove test block → should not fetch, just clear tests
4. Switch to different lesson → dependency change should re-evaluate

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "feat(courses): lazy-load tests only when test blocks exist

- apiListAllTests only called if lesson has type='test' blocks
- adds lesson.practiceBlocks to useEffect dependency
- skips unnecessary API call for image/file/audio-only lessons"
```

---

### Task 7: Build verification and final smoke test

**Files:**

- Verify: Build passes
- Verify: No TypeScript errors
- Test: Manual end-to-end (browser)

**Steps:**

- [ ] **Step 1: Run build**

```bash
npm run build --workspace=apps/frontend
```

Expected: No errors, warnings only if pre-existing.

- [ ] **Step 2: Verify no type errors**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: No output (clean).

- [ ] **Step 3: Manual E2E smoke test**

1. Open browser to course editor
2. Create new lesson, enable Amaliyot
3. Add test block → select test → see red validation warning if not selected, validation clears once selected
4. Add image block → see orange warning if empty, clears with text
5. Threshold card → shows only if test block exists
6. Clear all test blocks → threshold card disappears, shows message
7. Try to add same test to 2 blocks → second assignment should silently fail/revert
8. Refresh page → all state should persist (stored in courseStore)

- [ ] **Step 4: Commit summary**

```bash
git log --oneline -7
```

Expect: 7 commits from Task 1-6 + this summary commit:

```bash
git commit --allow-empty -m "build(courses): practice section fixes — verification complete

All tasks passing:
- Task 1: Threshold state decoupling
- Task 2: Field validation + required indicators
- Task 3: Test deduplication
- Task 4: Semantic gating (threshold only with test blocks)
- Task 5: Error handling + loading state for test fetch
- Task 6: Lazy test loading
- Task 7: Build + smoke test pass

Ready for review."
```
