# Dars "Amaliyot" bo'limi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unlock the "Amaliyot" tab in the lesson editor's side panel — a teacher can enable a lesson's practice section, attach one or more existing tests to it, and optionally require a minimum pass percentage.

**Architecture:** `LessonEditorView`'s left column gets a second view (`activeTab: 'content' | 'practice'`) alongside the existing block-editing view. The `Lesson` model in the frontend-only `courseStore` grows four fields (`practiceEnabled`, `practiceBlocks`, `passThresholdEnabled`, `passThresholdPercent`) with matching store actions, mirroring the existing `ContentBlock` CRUD pattern exactly. A new `apiListAllTests()` reuses the existing `GET /live/tests` backend endpoint (already returns every test owned by the current teacher, name + question count, no backend change needed) to populate the test-picker dropdown.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand (`useCourseStore`), lucide-react icons, existing `client` axios instance (`apps/frontend/src/api/client.ts`).

## Global Constraints

- No backend/DB changes — `practiceEnabled`/`practiceBlocks`/pass-threshold live only in the frontend-only `courseStore` (spec: "Qamrovdan tashqari").
- Pass threshold is a single lesson-level setting (not per-block), stored as a percentage (0-100) (spec: "Ma'lumotlar modeli").
- Test list comes from the real backend via the existing `GET /live/tests` endpoint — do not add a new backend endpoint (spec: "Testlarni yuklash").
- The "Amaliyot" side-panel tab stays disabled until `lesson.practiceEnabled` is true; turning the toggle off while viewing the practice tab must snap the view back to "Kontent" (spec: "Umumiy oqim").
- Verify with `npm run build --workspace=apps/frontend` (runs `tsc -b && vite build`) after every task — this project has no frontend test suite; type-checking + build is the only automated verification available.

---

### Task 1: Extend `Lesson` model and add store actions for practice blocks and pass threshold

**Files:**
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Produces: `PracticeBlock` interface (`{ id: string; testId: string | null }`), extended `Lesson` interface (adds `practiceEnabled: boolean`, `practiceBlocks: PracticeBlock[]`, `passThresholdEnabled: boolean`, `passThresholdPercent: number | null`), and six new store actions:
  - `setLessonPracticeEnabled(courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void`
  - `addPracticeBlock(courseId: string, moduleId: string, lessonId: string) => void`
  - `removePracticeBlock(courseId: string, moduleId: string, lessonId: string, blockId: string) => void`
  - `movePracticeBlock(courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void`
  - `setPracticeBlockTest(courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void`
  - `setPassThreshold(courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void`

- [ ] **Step 1: Add the `PracticeBlock` interface and extend `Lesson`**

In `apps/frontend/src/stores/courseStore.ts`, replace:

```typescript
export interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
}
```

With:

```typescript
export interface PracticeBlock {
  id: string;
  testId: string | null;
}

export interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
  practiceEnabled: boolean;
  practiceBlocks: PracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null;
}
```

- [ ] **Step 2: Give `addLesson` the new default field values**

Replace:

```typescript
  addLesson: (courseId, moduleId, title) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    if (!module) return undefined;
    const lesson: Lesson = {
      id: newId(),
      title,
      orderIndex: module.lessons.length,
      status: 'draft',
      blocks: [],
    };
```

With:

```typescript
  addLesson: (courseId, moduleId, title) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    if (!module) return undefined;
    const lesson: Lesson = {
      id: newId(),
      title,
      orderIndex: module.lessons.length,
      status: 'draft',
      blocks: [],
      practiceEnabled: false,
      practiceBlocks: [],
      passThresholdEnabled: false,
      passThresholdPercent: null,
    };
```

- [ ] **Step 3: Add the six new action signatures to `CourseState`**

In the `CourseState` interface, after the existing `moveBlock` signature line (`moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;`), add:

```typescript

  setLessonPracticeEnabled: (courseId: string, moduleId: string, lessonId: string, enabled: boolean) => void;
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string) => void;
  removePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  movePracticeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;
```

- [ ] **Step 4: Implement the six actions**

At the end of the store body, right after the closing brace of `moveBlock` and before the final `}));`, add:

```typescript
  setLessonPracticeEnabled: (courseId, moduleId, lessonId, enabled) => {
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
                      lessons: m.lessons.map((l) =>
                        l.id === lessonId ? { ...l, practiceEnabled: enabled } : l,
                      ),
                    },
              ),
            },
      ),
    });
  },
  addPracticeBlock: (courseId, moduleId, lessonId) => {
    const block: PracticeBlock = { id: newId(), testId: null };
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
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, practiceBlocks: [...l.practiceBlocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removePracticeBlock: (courseId, moduleId, lessonId, blockId) => {
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
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, practiceBlocks: l.practiceBlocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  movePracticeBlock: (courseId, moduleId, lessonId, blockId, direction) => {
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
                        const index = l.practiceBlocks.findIndex((b) => b.id === blockId);
                        const swapWith = direction === 'up' ? index - 1 : index + 1;
                        if (index === -1 || swapWith < 0 || swapWith >= l.practiceBlocks.length) return l;
                        const practiceBlocks = [...l.practiceBlocks];
                        [practiceBlocks[index], practiceBlocks[swapWith]] = [practiceBlocks[swapWith], practiceBlocks[index]];
                        return { ...l, practiceBlocks };
                      }),
                    },
              ),
            },
      ),
    });
  },
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
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              practiceBlocks: l.practiceBlocks.map((b) =>
                                b.id === blockId ? { ...b, testId } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  setPassThreshold: (courseId, moduleId, lessonId, data) => {
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
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              passThresholdEnabled: data.enabled,
                              passThresholdPercent: data.enabled ? (data.percent ?? l.passThresholdPercent) : null,
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
```

- [ ] **Step 5: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build fails — no other file constructs a `Lesson` object directly (only `addLesson` inside this same file does, which was updated in Step 2), so failure here would only happen if a step above was mistyped. If it fails, re-check Steps 1-4 against the exact code blocks above. If it succeeds, that's expected too (no other file currently reads the new fields yet, so nothing can be "missing" downstream at this point).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(courses): add practiceBlocks and pass-threshold fields to Lesson model"
```

---

### Task 2: `apiListAllTests` — reuse `GET /live/tests` for the test picker

**Files:**
- Modify: `apps/frontend/src/api/tests.ts`

**Interfaces:**
- Produces: `AllTestsItem` interface (`{ id: string; name: string; questionCount: number }`) and `apiListAllTests(): Promise<AllTestsItem[]>`.

This calls the existing backend endpoint `GET /live/tests` (`apps/backend/src/live/live.controller.ts:20`, handler `LiveController.listTests`, delegating to `LiveService.listTests` in `apps/backend/src/live/live.service.ts:42-53`). That endpoint already returns every test owned by the authenticated teacher — no folder scoping, no type filtering — as `{ id, name, liveQuestionCount }[]`. No backend changes are needed for this task.

- [ ] **Step 1: Add the new interface and function**

At the end of `apps/frontend/src/api/tests.ts`, add:

```typescript

export interface AllTestsItem {
  id: string;
  name: string;
  questionCount: number;
}

export async function apiListAllTests(): Promise<AllTestsItem[]> {
  const res = await client.get('/live/tests');
  return res.data.map((t: { id: string; name: string; liveQuestionCount: number }) => ({
    id: t.id,
    name: t.name,
    questionCount: t.liveQuestionCount,
  }));
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds (this function isn't called anywhere yet, but it type-checks standalone).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/tests.ts
git commit -m "feat(tests): add apiListAllTests, reusing the existing /live/tests endpoint"
```

---

### Task 3: `PracticeBlockView` — one practice-block card (test picker + reorder/delete)

**Files:**
- Create: `apps/frontend/src/components/course/PracticeBlockView.tsx`

**Interfaces:**
- Consumes: `PracticeBlock` type from `../../stores/courseStore.ts` (`{ id: string; testId: string | null }`), `AllTestsItem` type from `../../api/tests.ts` (`{ id: string; name: string; questionCount: number }`).
- Produces: `PracticeBlockView` component with props:
  - `index: number`
  - `isFirst: boolean`
  - `isLast: boolean`
  - `block: PracticeBlock`
  - `tests: AllTestsItem[]`
  - `onSelectTest: (testId: string) => void`
  - `onRemove: () => void`
  - `onMoveUp: () => void`
  - `onMoveDown: () => void`

This mirrors `ContentBlockView`'s header row exactly (reorder/delete buttons, "Blok №N" title pattern) but with a test-picker `<select>` as its body instead of collapsible content — there is no collapse/expand state for practice blocks per the spec (they're simpler: just a select).

- [ ] **Step 1: Write the component**

```tsx
import { ClipboardList, ArrowUp, ArrowDown, X } from 'lucide-react';
import type { PracticeBlock } from '../../stores/courseStore';
import type { AllTestsItem } from '../../api/tests';

interface PracticeBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: PracticeBlock;
  tests: AllTestsItem[];
  onSelectTest: (testId: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function PracticeBlockView({
  index, isFirst, isLast, block, tests, onSelectTest, onRemove, onMoveUp, onMoveDown,
}: PracticeBlockViewProps) {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <ClipboardList size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Amaliyot bloki №{index + 1}</p>
          <p className="text-xs text-gray-400">Test</p>
        </div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Yuqoriga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Pastga surish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Blokni o'chirish"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <X size={16} />
        </button>
      </div>

      <div className="border-t border-gray-100 px-4 py-4">
        <p className="mb-1.5 text-sm text-gray-500">Testni tanlang</p>
        <select
          value={block.testId ?? ''}
          onChange={(e) => onSelectTest(e.target.value)}
          className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        >
          <option value="" disabled>Testni tanlang...</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.questionCount} ta savol)
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeBlockView.tsx
git commit -m "feat(courses): add PracticeBlockView (test-picker card for practice blocks)"
```

---

### Task 4: `PracticeSection` — practice-tab body (test list, add button, pass-threshold card)

**Files:**
- Create: `apps/frontend/src/components/course/PracticeSection.tsx`

**Interfaces:**
- Consumes: `useCourseStore` — `courses`, `addPracticeBlock`, `removePracticeBlock`, `movePracticeBlock`, `setPracticeBlockTest`, `setPassThreshold` (all from Task 1). `apiListAllTests` from `../../api/tests.ts` (Task 2). `PracticeBlockView` from `./PracticeBlockView.tsx` (Task 3).
- Produces: `PracticeSection` component with props:
  - `courseId: string`
  - `moduleId: string`
  - `lessonId: string`

The component looks up its own `lesson` from the store (same pattern as `LessonEditorView`) so it only needs the three ID props. It fetches the test list once on mount via `useEffect` + `useState`, independent of any parent lazy-loading logic — simplest correct behavior, and this component only mounts when the practice tab is actually shown (wired in Task 6), so this naturally satisfies the spec's "fetch once when switching to practice" requirement without extra plumbing in the parent.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from 'react';
import { Plus, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { apiListAllTests, type AllTestsItem } from '../../api/tests';
import { PracticeBlockView } from './PracticeBlockView';

interface PracticeSectionProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

export function PracticeSection({ courseId, moduleId, lessonId }: PracticeSectionProps) {
  const {
    courses, addPracticeBlock, removePracticeBlock, movePracticeBlock, setPracticeBlockTest, setPassThreshold,
  } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  const [tests, setTests] = useState<AllTestsItem[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiListAllTests()
      .then((items) => { if (!cancelled) setTests(items); })
      .finally(() => { if (!cancelled) setLoadingTests(false); });
    return () => { cancelled = true; };
  }, []);

  if (!lesson) return null;

  function handlePercentChange(value: string) {
    const percent = value === '' ? null : Math.min(100, Math.max(0, Number(value)));
    setPassThreshold(courseId, moduleId, lessonId, { enabled: true, percent });
  }

  return (
    <div>
      {lesson.practiceBlocks.length === 0 ? (
        <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
          <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
          <p className="text-sm font-semibold text-gray-700">Hali test qo'shilmagan</p>
          <p className="mt-1 text-xs text-gray-400">Pastroqdan test qo'shing</p>
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3">
          {lesson.practiceBlocks.map((block, index) => (
            <PracticeBlockView
              key={block.id}
              index={index}
              isFirst={index === 0}
              isLast={index === lesson.practiceBlocks.length - 1}
              block={block}
              tests={tests}
              onSelectTest={(testId) => setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)}
              onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
              onMoveUp={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'up')}
              onMoveDown={() => movePracticeBlock(courseId, moduleId, lessonId, block.id, 'down')}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => addPracticeBlock(courseId, moduleId, lessonId)}
        disabled={loadingTests}
        className="mb-6 flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-indigo-200 py-3 text-sm font-semibold text-indigo-500 transition-colors hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} /> Test qo'shish
      </button>

      <div className="rounded-2xl border-2 border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
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
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-4 py-2.5 pr-9 text-sm outline-none focus:border-indigo-400"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "feat(courses): add PracticeSection (test list, add-test button, pass-threshold card)"
```

---

### Task 5: `CourseSidePanel` — make "Amaliyot" clickable when practice is enabled

**Files:**
- Modify: `apps/frontend/src/components/course/CourseSidePanel.tsx`

**Interfaces:**
- Modify: `CourseSidePanelProps` gains two new optional props: `practiceEnabled?: boolean` and `onSelectPractice?: () => void`. Both are optional so the `'full'` variant (used on the course-content page, which has no practice concept) can keep calling `<CourseSidePanel onBackToList={...} />` unchanged.
- The "content" tab's `active` styling logic also needs a way to represent "which lesson-tab is active" — add an `activeTab?: 'content' | 'practice'` prop (defaults to `'content'`) so the Kontent tab visually deactivates when Amaliyot is showing.

Only the `'lesson'` variant's tab list changes behavior; the `'full'` variant (`FULL_TABS`) keeps rendering exactly as before (still all static `<div>`s, no clicks).

- [ ] **Step 1: Read the current file to confirm structure before editing**

Run: `sed -n '1,35p' apps/frontend/src/components/course/CourseSidePanel.tsx`
Expected: shows the imports, `CourseSidePanelProps` interface, and `LESSON_TABS` array exactly as captured in this plan's exploration — `LESSON_TABS` has three entries (`content` with `active: true`, `settings`, `practice`), none of which currently have click handlers.

- [ ] **Step 2: Update props interface and component signature**

Replace:

```tsx
interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: 'full' | 'lesson';
}
```

With:

```tsx
interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: 'full' | 'lesson';
  practiceEnabled?: boolean;
  activeTab?: 'content' | 'practice';
  onSelectPractice?: () => void;
  onSelectContent?: () => void;
}
```

- [ ] **Step 3: Remove the hardcoded `active: true` from `LESSON_TABS`' content tab**

Replace:

```tsx
const LESSON_TABS: SideTab[] = [
  { key: 'content', label: 'Kontent', description: 'Darsning kontenti', icon: LayoutGrid, active: true },
  { key: 'settings', label: 'Sozlamalar', description: 'Dizayn va parametrlar', icon: SlidersHorizontal },
  { key: 'practice', label: 'Amaliyot', description: 'Uy vazifasi', icon: Brain },
];
```

With:

```tsx
const LESSON_TABS: SideTab[] = [
  { key: 'content', label: 'Kontent', description: 'Darsning kontenti', icon: LayoutGrid },
  { key: 'settings', label: 'Sozlamalar', description: 'Dizayn va parametrlar', icon: SlidersHorizontal },
  { key: 'practice', label: 'Amaliyot', description: 'Uy vazifasi', icon: Brain },
];
```

(`active` is now computed per-render instead of hardcoded, since which tab is "active" depends on `activeTab` for the lesson variant.)

- [ ] **Step 4: Update the component body to compute activeness and wire clicks**

Replace:

```tsx
export function CourseSidePanel({ onBackToList, variant = 'full' }: CourseSidePanelProps) {
  const tabs = variant === 'lesson' ? LESSON_TABS : FULL_TABS;
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <div
              key={tab.key}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                tab.active
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'cursor-not-allowed text-gray-300'
              }`}
            >
              <Icon size={18} className={`shrink-0 ${tab.active ? 'text-indigo-500' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold ${tab.active ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">{tab.description}</p>
              </div>
            </div>
          );
        })}
      </div>
```

With:

```tsx
export function CourseSidePanel({
  onBackToList, variant = 'full', practiceEnabled = false, activeTab = 'content', onSelectPractice, onSelectContent,
}: CourseSidePanelProps) {
  const tabs = variant === 'lesson' ? LESSON_TABS : FULL_TABS;

  function isTabActive(key: string): boolean {
    if (variant !== 'lesson') return key === 'content';
    return key === activeTab;
  }

  function isTabClickable(key: string): boolean {
    if (variant !== 'lesson') return false;
    if (key === 'content') return true;
    if (key === 'practice') return practiceEnabled;
    return false;
  }

  function handleTabClick(key: string) {
    if (!isTabClickable(key)) return;
    if (key === 'content') onSelectContent?.();
    if (key === 'practice') onSelectPractice?.();
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.key);
          const clickable = isTabClickable(tab.key);
          return (
            <div
              key={tab.key}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => handleTabClick(tab.key)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ${
                active
                  ? 'bg-indigo-50 text-indigo-600'
                  : clickable
                    ? 'cursor-pointer text-gray-500 hover:bg-gray-50'
                    : 'cursor-not-allowed text-gray-300'
              }`}
            >
              <Icon size={18} className={`shrink-0 ${active ? 'text-indigo-500' : clickable ? 'text-gray-400' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold ${active ? 'text-indigo-600' : clickable ? 'text-gray-700' : 'text-gray-400'}`}>
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">{tab.description}</p>
              </div>
            </div>
          );
        })}
      </div>
```

- [ ] **Step 5: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds — `LessonEditorView.tsx` still calls `<CourseSidePanel onBackToList={onBackToList} variant="lesson" />` (all new props are optional, so this call remains valid) until Task 6 wires the new props in.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/CourseSidePanel.tsx
git commit -m "feat(courses): make Amaliyot tab clickable in CourseSidePanel when practice is enabled"
```

---

### Task 6: Wire `LessonEditorView` — practice toggle, tab switching, PracticeSection

**Files:**
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx`

**Interfaces:**
- Consumes: `PracticeSection` from `./PracticeSection.tsx` (Task 4, props `courseId`, `moduleId`, `lessonId`). `CourseSidePanel`'s new props from Task 5 (`practiceEnabled`, `activeTab`, `onSelectPractice`, `onSelectContent`). `setLessonPracticeEnabled` action from `courseStore` (Task 1).
- Modify: `PracticeToggleCard` stops managing its own `enabled` state and instead takes `enabled: boolean` and `onToggle: () => void` props (so it reflects `lesson.practiceEnabled` instead of local-only state).

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `sed -n '1,45p' apps/frontend/src/components/course/LessonEditorView.tsx`
Expected: shows the imports, `LessonEditorViewProps` interface, and the `PracticeToggleCard` function exactly as captured in this plan's exploration — `PracticeToggleCard` currently takes no props and manages `enabled` via its own `useState`.

- [ ] **Step 2: Add the `PracticeSection` import**

Replace:

```tsx
import { useState } from 'react';
import { NotebookPen, Brain } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
```

With:

```tsx
import { useState } from 'react';
import { NotebookPen, Brain } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { PracticeSection } from './PracticeSection';
```

- [ ] **Step 3: Make `PracticeToggleCard` a controlled component**

Replace:

```tsx
function PracticeToggleCard() {
  const [enabled, setEnabled] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
        <Brain size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">Darsning amaliy qismi</p>
        <p className="truncate text-xs text-gray-400">Bilimlarni mustahkamlash</p>
      </div>
      <button
        type="button"
        onClick={() => setEnabled((v) => !v)}
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
```

With:

```tsx
function PracticeToggleCard({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
        <Brain size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">Darsning amaliy qismi</p>
        <p className="truncate text-xs text-gray-400">Bilimlarni mustahkamlash</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-200'}`}
      >
        <span
          className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Destructure `setLessonPracticeEnabled` from the store and add `activeTab` state**

Replace:

```tsx
export function LessonEditorView({ courseId, moduleId, lessonId, onBackToList, onBackToContent }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  if (!course || !module || !lesson) return null;
```

With:

```tsx
export function LessonEditorView({ courseId, moduleId, lessonId, onBackToList, onBackToContent }: LessonEditorViewProps) {
  const {
    courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock, setLessonPracticeEnabled,
  } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'content' | 'practice'>('content');

  if (!course || !module || !lesson) return null;

  function handleTogglePractice() {
    const next = !lesson!.practiceEnabled;
    setLessonPracticeEnabled(courseId, moduleId, lessonId, next);
    if (!next && activeTab === 'practice') setActiveTab('content');
  }
```

- [ ] **Step 5: Replace the block-list JSX with a conditional Content/Practice view, and wire the side panel + toggle card**

Replace:

```tsx
        {lesson.blocks.length === 0 && (
          <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
            <NotebookPen size={30} className="mx-auto mb-3 text-indigo-200" />
            <p className="text-sm font-semibold text-gray-700">Ichki kontentini to'ldiring</p>
            <p className="mt-1 text-xs text-gray-400">Bu yer hozircha bo'sh, pastroqda birinchi blokni qo'shing</p>
          </div>
        )}

        {lesson.blocks.length > 0 && (
          <div className="mb-6 flex flex-col gap-3">
            {lesson.blocks.map((block, index) => (
              <ContentBlockView
                key={block.id}
                index={index}
                isFirst={index === 0}
                isLast={index === lesson.blocks.length - 1}
                block={block}
                collapsed={collapsedBlockIds.has(block.id)}
                onToggleCollapse={() => toggleCollapse(block.id)}
                onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
                onChangeEmbedUrl={(embedUrl) => handleChangeBlockEmbedUrl(block.id, embedUrl)}
                onChangeLabel={(label) => handleChangeBlockLabel(block.id, label)}
                onPickFile={(file) => handleBlockPickFile(block.id, file)}
                onRemove={() => removeBlock(courseId, moduleId, lessonId, block.id)}
                onMoveUp={() => moveBlock(courseId, moduleId, lessonId, block.id, 'up')}
                onMoveDown={() => moveBlock(courseId, moduleId, lessonId, block.id, 'down')}
              />
            ))}
          </div>
        )}

        <BlockPicker onPickEditor={handlePickEditor} onPickFile={handlePickFile} />
      </div>

      <div className="w-full shrink-0 sm:mt-11 sm:w-72">
        <div className="mb-3">
          <PracticeToggleCard />
        </div>
        <CourseSidePanel onBackToList={onBackToList} variant="lesson" />
      </div>
    </div>
  );
}
```

With:

```tsx
        {activeTab === 'content' ? (
          <>
            {lesson.blocks.length === 0 && (
              <div className="mb-6 rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
                <NotebookPen size={30} className="mx-auto mb-3 text-indigo-200" />
                <p className="text-sm font-semibold text-gray-700">Ichki kontentini to'ldiring</p>
                <p className="mt-1 text-xs text-gray-400">Bu yer hozircha bo'sh, pastroqda birinchi blokni qo'shing</p>
              </div>
            )}

            {lesson.blocks.length > 0 && (
              <div className="mb-6 flex flex-col gap-3">
                {lesson.blocks.map((block, index) => (
                  <ContentBlockView
                    key={block.id}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === lesson.blocks.length - 1}
                    block={block}
                    collapsed={collapsedBlockIds.has(block.id)}
                    onToggleCollapse={() => toggleCollapse(block.id)}
                    onChangeHtml={(html) => handleChangeBlockHtml(block.id, html)}
                    onChangeEmbedUrl={(embedUrl) => handleChangeBlockEmbedUrl(block.id, embedUrl)}
                    onChangeLabel={(label) => handleChangeBlockLabel(block.id, label)}
                    onPickFile={(file) => handleBlockPickFile(block.id, file)}
                    onRemove={() => removeBlock(courseId, moduleId, lessonId, block.id)}
                    onMoveUp={() => moveBlock(courseId, moduleId, lessonId, block.id, 'up')}
                    onMoveDown={() => moveBlock(courseId, moduleId, lessonId, block.id, 'down')}
                  />
                ))}
              </div>
            )}

            <BlockPicker onPickEditor={handlePickEditor} onPickFile={handlePickFile} />
          </>
        ) : (
          <PracticeSection courseId={courseId} moduleId={moduleId} lessonId={lessonId} />
        )}
      </div>

      <div className="w-full shrink-0 sm:mt-11 sm:w-72">
        <div className="mb-3">
          <PracticeToggleCard enabled={lesson.practiceEnabled} onToggle={handleTogglePractice} />
        </div>
        <CourseSidePanel
          onBackToList={onBackToList}
          variant="lesson"
          practiceEnabled={lesson.practiceEnabled}
          activeTab={activeTab}
          onSelectContent={() => setActiveTab('content')}
          onSelectPractice={() => setActiveTab('practice')}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 7: Verify no leftover references to the old uncontrolled `PracticeToggleCard` usage**

Run: `grep -n "PracticeToggleCard" apps/frontend/src/components/course/LessonEditorView.tsx`
Expected: two matches — the function definition (now taking `{ enabled, onToggle }`) and its single call site (now passing both props). No call site with zero arguments.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/course/LessonEditorView.tsx
git commit -m "feat(courses): wire practice toggle, tab switching, and PracticeSection into LessonEditorView"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (manual QA pass — no automated frontend tests exist in this repo, per Global Constraints).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev --workspace=apps/frontend`
Expected: server starts without errors.

- [ ] **Step 2: Walk the full flow in a browser**

1. Navigate to `/lessons`, open a course, open a lesson (or create one). Expected: side panel shows "Amaliyot" tab greyed out/disabled, "Darsning amaliy qismi" toggle is off.
2. Toggle "Darsning amaliy qismi" on. Expected: "Amaliyot" tab becomes clickable (no longer greyed out).
3. Click "Amaliyot". Expected: left column switches from the block-editing view to the practice view; "Kontent" tab is now the inactive one, "Amaliyot" is highlighted.
4. Click "Test qo'shish". Expected: a new practice-block card appears with a "Testni tanlang..." dropdown; the dropdown is populated with your real tests (name + question count) fetched from the backend.
5. Select a test in the dropdown. Expected: selection persists (shown as selected in the `<select>`).
6. Add a second practice block, verify the up/down reorder arrows swap the two blocks' positions, and the delete (X) button removes a block.
7. Toggle "Minimal o'tish balini talab qilish" on. Expected: a "Minimal foiz" number input appears; type a value (e.g. 70) and confirm it's retained after toggling to "Kontent" and back to "Amaliyot".
8. Toggle "Darsning amaliy qismi" off while still on the Amaliyot view. Expected: view snaps back to "Kontent" and the "Amaliyot" tab becomes disabled again (grey, unclickable).
9. Click "Kontent" tab directly (while practice is enabled and you're viewing Kontent). Expected: no-op, stays on Kontent (sanity check that `onSelectContent` doesn't error when already active).

- [ ] **Step 3: Stop the dev server**

Press Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 4: Final full-project build check**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds with no errors.
