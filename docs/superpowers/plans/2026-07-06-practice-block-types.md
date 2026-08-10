# Amaliyot bo'limi — ko'p turdagi bloklar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the lesson editor's "Amaliyot" (practice) section so a teacher can add Rasm (image), Fayl (file), and Audio practice blocks — each carrying an instruction/description text — alongside the existing Test block type.

**Architecture:** `PracticeBlock` gains a `type: PracticeBlockType` discriminator and a `description: string` field. `addPracticeBlock` takes the type as a parameter instead of always creating a test block. A new `setPracticeBlockDescription` store action mirrors the existing `setPracticeBlockTest`. `PracticeBlockView` renders a type-specific body (test picker vs. description textarea) driven by a `TYPE_META` lookup table. A new `PracticeBlockPicker` component (visually modeled on the existing `BlockPicker`) replaces the current single "+ Test qo'shish" button with four type cards.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand (`useCourseStore`), lucide-react icons.

## Global Constraints

- No backend/DB changes — this is entirely within the frontend-only `courseStore` (spec: "Qamrovdan tashqari").
- No file/image/audio upload of any kind, for either the teacher's sample or a student's answer — only a text `description` field (spec: "Ma'lumotlar modeli", confirmed in brainstorming Q&A).
- Student-side answer submission UI is out of scope for this plan (spec: "Qamrovdan tashqari").
- Verify with `npm run build --workspace=apps/frontend` (runs `tsc -b && vite build`) after every task — this project has no frontend test suite; type-checking + build is the only automated verification available.

---

### Task 1: Extend `PracticeBlock` model — add `type`/`description`, update `addPracticeBlock`, add `setPracticeBlockDescription`

**Files:**

- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**

- Produces: `PracticeBlockType = 'test' | 'image' | 'file' | 'audio'`, extended `PracticeBlock` (`{ id: string; type: PracticeBlockType; testId: string | null; description: string }`), changed `addPracticeBlock` signature (`(courseId: string, moduleId: string, lessonId: string, type: PracticeBlockType) => void`), and new action `setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => void`.
- Consumes: nothing new — this task only touches `courseStore.ts`.

This is a breaking change to `addPracticeBlock`'s signature. Its only current caller is `apps/frontend/src/components/course/PracticeSection.tsx` (`onClick={() => addPracticeBlock(courseId, moduleId, lessonId)}`), which Task 4 updates — until then, the build will fail after this task, which is expected and gets fixed in Task 4.

- [ ] **Step 1: Read the current file to confirm exact line numbers before editing**

Run: `grep -n "PracticeBlockType\|export interface PracticeBlock\|addPracticeBlock:\|addPracticeBlock = \|addPracticeBlock: (courseId" apps/frontend/src/stores/courseStore.ts`
Expected: shows `export interface PracticeBlock { id: string; testId: string | null; }` (no `PracticeBlockType` yet), the `addPracticeBlock: (courseId: string, moduleId: string, lessonId: string) => void;` signature in the `CourseState` interface, and the `addPracticeBlock: (courseId, moduleId, lessonId) => { const block: PracticeBlock = { id: newId(), testId: null }; ... }` implementation — matching this plan's exploration of the codebase.

- [ ] **Step 2: Add `PracticeBlockType` and extend the `PracticeBlock` interface**

Replace:

```typescript
export interface PracticeBlock {
  id: string;
  testId: string | null;
}
```

With:

```typescript
export type PracticeBlockType = "test" | "image" | "file" | "audio";

export interface PracticeBlock {
  id: string;
  type: PracticeBlockType;
  testId: string | null;
  description: string;
}
```

- [ ] **Step 3: Update `addPracticeBlock`'s signature in the `CourseState` interface**

Replace:

```typescript
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string) => void;
```

With:

```typescript
  addPracticeBlock: (courseId: string, moduleId: string, lessonId: string, type: PracticeBlockType) => void;
```

- [ ] **Step 4: Add `setPracticeBlockDescription` to the `CourseState` interface**

Replace:

```typescript
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
```

With:

```typescript
  setPracticeBlockTest: (courseId: string, moduleId: string, lessonId: string, blockId: string, testId: string) => void;
  setPracticeBlockDescription: (courseId: string, moduleId: string, lessonId: string, blockId: string, description: string) => void;
```

- [ ] **Step 5: Update the `addPracticeBlock` implementation to accept and use `type`**

Replace:

```typescript
  addPracticeBlock: (courseId, moduleId, lessonId) => {
    const block: PracticeBlock = { id: newId(), testId: null };
```

With:

```typescript
  addPracticeBlock: (courseId, moduleId, lessonId, type) => {
    const block: PracticeBlock = { id: newId(), type, testId: null, description: '' };
```

- [ ] **Step 6: Add the `setPracticeBlockDescription` implementation**

Find the `setPracticeBlockTest` implementation (a `set({ courses: get().courses.map(...) })` block ending in a line with `b.id === blockId ? { ...b, testId } : b,` followed by the closing braces of that action). Immediately after that action's closing `},`, add:

```typescript
  setPracticeBlockDescription: (courseId, moduleId, lessonId, blockId, description) => {
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
                                b.id === blockId ? { ...b, description } : b,
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
```

- [ ] **Step 7: Verify the build fails for the expected reason**

Run: `npm run build --workspace=apps/frontend`
Expected: build FAILS with a TypeScript error at `apps/frontend/src/components/course/PracticeSection.tsx` about `addPracticeBlock` being called with 3 arguments when 4 are expected (or similar "Expected 4 arguments, but got 3"/argument-count mismatch). This is expected — `PracticeSection.tsx`'s only call site hasn't been updated yet; that happens in Task 4. Confirm the failure is specifically this signature mismatch and not some other error (e.g. a typo in Steps 2-6).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(courses): add type/description fields to PracticeBlock model"
```

---

### Task 2: `PracticeBlockPicker` — four-card type picker for the practice section

**Files:**

- Create: `apps/frontend/src/components/course/PracticeBlockPicker.tsx`

**Interfaces:**

- Consumes: `PracticeBlockType` from `../../stores/courseStore.ts` (Task 1: `'test' | 'image' | 'file' | 'audio'`).
- Produces: `PracticeBlockPicker` component with prop `onPickType: (type: PracticeBlockType) => void`, called immediately when a card is clicked (no file picker, no intermediate dialog — this section never uploads files, per Global Constraints).

This mirrors the visual pattern of the existing `apps/frontend/src/components/course/BlockPicker.tsx` (rounded-2xl bordered cards in a responsive grid, icon + label), but all four cards here are always enabled (no `disabled` cards, unlike `BlockPicker` which has several placeholder-disabled types).

- [ ] **Step 1: Write the component**

```tsx
import {
  ClipboardList,
  Image as ImageIcon,
  Paperclip,
  Mic,
} from "lucide-react";
import type { PracticeBlockType } from "../../stores/courseStore";

interface PracticeBlockPickerProps {
  onPickType: (type: PracticeBlockType) => void;
}

const TYPES: Array<{
  type: PracticeBlockType;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { type: "test", label: "Test", icon: ClipboardList },
  { type: "image", label: "Rasm", icon: ImageIcon },
  { type: "file", label: "Fayl", icon: Paperclip },
  { type: "audio", label: "Audio", icon: Mic },
];

export function PracticeBlockPicker({ onPickType }: PracticeBlockPickerProps) {
  return (
    <div>
      <p className="mb-3 text-center text-xs text-gray-400">
        Yangi blok qo'shish
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TYPES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onPickType(item.type)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-5 text-sm font-medium text-gray-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
            >
              <Icon size={22} className="text-indigo-400" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build still fails with the SAME `addPracticeBlock` argument-count error from Task 1 (this new file isn't wired in yet, and TypeScript still checks the whole project). Confirm the error is unchanged from Task 1's — this new file itself introduces no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/PracticeBlockPicker.tsx
git commit -m "feat(courses): add PracticeBlockPicker (test/image/file/audio type cards)"
```

---

### Task 3: `PracticeBlockView` — type-specific body (test picker vs. description textarea)

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeBlockView.tsx`

**Interfaces:**

- Consumes: `PracticeBlock` (now with `type`/`description` fields, from Task 1).
- Modify: `PracticeBlockViewProps` gains `onChangeDescription: (description: string) => void`. Existing props (`index`, `isFirst`, `isLast`, `block`, `tests`, `onSelectTest`, `onRemove`, `onMoveUp`, `onMoveDown`) are unchanged.

The header's hardcoded "Test" subtitle becomes type-driven via a `TYPE_META` lookup (label + icon per type), and the body conditionally renders the existing test-picker `<select>` only when `block.type === 'test'`, otherwise a description `<textarea>`.

- [ ] **Step 1: Read the current file to confirm exact structure before editing**

Run: `cat apps/frontend/src/components/course/PracticeBlockView.tsx`
Expected: matches the file shown in this plan's exploration — a single `ClipboardList` icon import, hardcoded `<ClipboardList size={15} />` icon and `<p ...>Test</p>` subtitle in the header, and a single `<div className="border-t ...">` body containing only the test-picker `<select>`.

- [ ] **Step 2: Replace the imports and add a `TYPE_META` lookup**

Replace:

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
```

With:

```tsx
import { ClipboardList, Image as ImageIcon, Paperclip, Mic, ArrowUp, ArrowDown, X } from 'lucide-react';
import type { PracticeBlock, PracticeBlockType } from '../../stores/courseStore';
import type { AllTestsItem } from '../../api/tests';

interface PracticeBlockViewProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  block: PracticeBlock;
  tests: AllTestsItem[];
  onSelectTest: (testId: string) => void;
  onChangeDescription: (description: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const TYPE_META: Record<PracticeBlockType, { label: string; icon: typeof ClipboardList; placeholder: string }> = {
  test: { label: 'Test', icon: ClipboardList, placeholder: '' },
  image: {
    label: 'Rasm',
    icon: ImageIcon,
    placeholder: "Masalan: Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang",
  },
  file: {
    label: 'Fayl',
    icon: Paperclip,
    placeholder: "Masalan: Uy vazifasini PDF formatida tayyorlab yuklang",
  },
  audio: {
    label: 'Audio',
    icon: Mic,
    placeholder: "Masalan: Matnni ovoz chiqarib o'qing va audio yozib yuklang",
  },
};

export function PracticeBlockView({
  index, isFirst, isLast, block, tests, onSelectTest, onChangeDescription, onRemove, onMoveUp, onMoveDown,
}: PracticeBlockViewProps) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;
```

- [ ] **Step 3: Replace the hardcoded header icon/subtitle with the type-driven ones**

Replace:

```tsx
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <ClipboardList size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Amaliyot bloki №{index + 1}</p>
          <p className="text-xs text-gray-400">Test</p>
        </div>
```

With:

```tsx
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">Amaliyot bloki №{index + 1}</p>
          <p className="text-xs text-gray-400">{meta.label}</p>
        </div>
```

- [ ] **Step 4: Replace the body to conditionally show the test picker or a description textarea**

Replace:

```tsx
<div className="border-t border-gray-100 px-4 py-4">
  <p className="mb-1.5 text-sm text-gray-500">Testni tanlang</p>
  <select
    value={block.testId ?? ""}
    onChange={(e) => onSelectTest(e.target.value)}
    className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
  >
    <option value="" disabled>
      Testni tanlang...
    </option>
    {tests.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name} ({t.questionCount} ta savol)
      </option>
    ))}
  </select>
</div>
```

With:

```tsx
<div className="border-t border-gray-100 px-4 py-4">
  {block.type === "test" ? (
    <>
      <p className="mb-1.5 text-sm text-gray-500">Testni tanlang</p>
      <select
        value={block.testId ?? ""}
        onChange={(e) => onSelectTest(e.target.value)}
        className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
      >
        <option value="" disabled>
          Testni tanlang...
        </option>
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.questionCount} ta savol)
          </option>
        ))}
      </select>
    </>
  ) : (
    <>
      <p className="mb-1.5 text-sm text-gray-500">Topshiriq matni</p>
      <textarea
        value={block.description}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder={meta.placeholder}
        rows={3}
        className="w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
      />
    </>
  )}
</div>
```

- [ ] **Step 5: Verify the build fails for the expected (still unrelated) reason**

Run: `npm run build --workspace=apps/frontend`
Expected: build FAILS, but now with a different/additional error — the only current caller of `PracticeBlockView` (`apps/frontend/src/components/course/PracticeSection.tsx`) does not pass the new required `onChangeDescription` prop, so expect a TypeScript error about a missing property `onChangeDescription` on the `<PracticeBlockView>` call site, in addition to the still-unfixed `addPracticeBlock` argument-count error from Task 1. Both get fixed together in Task 4.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/PracticeBlockView.tsx
git commit -m "feat(courses): render type-specific body in PracticeBlockView (test picker vs description textarea)"
```

---

### Task 4: Wire `PracticeSection` — swap add-button for the type picker, pass through the new prop

**Files:**

- Modify: `apps/frontend/src/components/course/PracticeSection.tsx`

**Interfaces:**

- Consumes: `PracticeBlockPicker` (Task 2, prop `onPickType: (type: PracticeBlockType) => void`), `PracticeBlockView`'s new `onChangeDescription` prop (Task 3), `setPracticeBlockDescription` action and `addPracticeBlock`'s new 4-arg signature (both Task 1).

This is the task that resolves both build failures left open by Tasks 1 and 3.

- [ ] **Step 1: Read the current file to confirm exact structure before editing**

Run: `cat apps/frontend/src/components/course/PracticeSection.tsx`
Expected: matches the file shown in this plan's exploration — imports `Plus, Inbox` from `lucide-react`, destructures `addPracticeBlock` (among others) from `useCourseStore()`, renders a single `<button onClick={() => addPracticeBlock(courseId, moduleId, lessonId)}>+ Test qo'shish</button>`, and renders `<PracticeBlockView>` without an `onChangeDescription` prop.

- [ ] **Step 2: Import `PracticeBlockPicker` and destructure the new store action**

Replace:

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
```

With:

```tsx
import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { apiListAllTests, type AllTestsItem } from '../../api/tests';
import { PracticeBlockView } from './PracticeBlockView';
import { PracticeBlockPicker } from './PracticeBlockPicker';

interface PracticeSectionProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

export function PracticeSection({ courseId, moduleId, lessonId }: PracticeSectionProps) {
  const {
    courses, addPracticeBlock, removePracticeBlock, movePracticeBlock, setPracticeBlockTest,
    setPracticeBlockDescription, setPassThreshold,
  } = useCourseStore();
```

- [ ] **Step 3: Pass `onChangeDescription` into each `PracticeBlockView`**

Replace:

```tsx
<PracticeBlockView
  key={block.id}
  index={index}
  isFirst={index === 0}
  isLast={index === lesson.practiceBlocks.length - 1}
  block={block}
  tests={tests}
  onSelectTest={(testId) =>
    setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)
  }
  onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
  onMoveUp={() =>
    movePracticeBlock(courseId, moduleId, lessonId, block.id, "up")
  }
  onMoveDown={() =>
    movePracticeBlock(courseId, moduleId, lessonId, block.id, "down")
  }
/>
```

With:

```tsx
<PracticeBlockView
  key={block.id}
  index={index}
  isFirst={index === 0}
  isLast={index === lesson.practiceBlocks.length - 1}
  block={block}
  tests={tests}
  onSelectTest={(testId) =>
    setPracticeBlockTest(courseId, moduleId, lessonId, block.id, testId)
  }
  onChangeDescription={(description) =>
    setPracticeBlockDescription(
      courseId,
      moduleId,
      lessonId,
      block.id,
      description,
    )
  }
  onRemove={() => removePracticeBlock(courseId, moduleId, lessonId, block.id)}
  onMoveUp={() =>
    movePracticeBlock(courseId, moduleId, lessonId, block.id, "up")
  }
  onMoveDown={() =>
    movePracticeBlock(courseId, moduleId, lessonId, block.id, "down")
  }
/>
```

- [ ] **Step 4: Replace the "+ Test qo'shish" button with `PracticeBlockPicker`**

Replace:

```tsx
<button
  type="button"
  onClick={() => addPracticeBlock(courseId, moduleId, lessonId)}
  disabled={loadingTests}
  className="mb-6 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-indigo-200 py-3 text-sm font-semibold text-indigo-500 transition-colors hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50"
>
  <Plus size={16} /> Test qo'shish
</button>
```

With:

```tsx
<div className="mb-6">
  <PracticeBlockPicker
    onPickType={(type) => addPracticeBlock(courseId, moduleId, lessonId, type)}
  />
</div>
```

Note: the previous `disabled={loadingTests}` guard (which prevented adding a test block while the test list was still loading) is intentionally dropped here — `PracticeBlockPicker`'s four cards are always enabled per its own spec (Task 2), and a teacher adding a block while tests are still loading simply sees an empty/loading `<select>` inside the newly-added test block until `tests` populates, which is the same transient state `PracticeBlockView` already handles today for the empty-tests-array case.

- [ ] **Step 5: Update the empty-state copy since blocks are no longer test-only**

Replace:

```tsx
<div className="mb-6 rounded-2xl border border-dashed border-gray-200 py-14 text-center">
  <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
  <p className="text-sm font-semibold text-gray-700">Hali test qo'shilmagan</p>
  <p className="mt-1 text-xs text-gray-400">Pastroqdan test qo'shing</p>
</div>
```

With:

```tsx
<div className="mb-6 rounded-2xl border border-dashed border-gray-200 py-14 text-center">
  <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
  <p className="text-sm font-semibold text-gray-700">Hali blok qo'shilmagan</p>
  <p className="mt-1 text-xs text-gray-400">Pastroqdan blok qo'shing</p>
</div>
```

- [ ] **Step 6: Verify the build succeeds**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds — both the `addPracticeBlock` argument-count error (Task 1) and the missing `onChangeDescription` prop error (Task 3) are now resolved.

- [ ] **Step 7: Verify no leftover unused imports**

Run: `grep -n "^import" apps/frontend/src/components/course/PracticeSection.tsx`
Expected: `Plus` is no longer imported from `lucide-react` (only `Inbox` remains) since the button that used it was replaced. If the build in Step 6 succeeded with no unused-import warnings, this is already confirmed — this grep is a quick visual sanity check.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components/course/PracticeSection.tsx
git commit -m "feat(courses): wire PracticeBlockPicker and per-type description into PracticeSection"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (manual QA pass — no automated frontend tests exist in this repo, per Global Constraints).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev --workspace=apps/frontend`
Expected: server starts without errors.

- [ ] **Step 2: Walk the full flow in a browser**

1. Navigate to `/lessons`, open a course, open a lesson, enable "Darsning amaliy qismi", click the "Amaliyot" tab.
2. In the block picker at the bottom, click "Rasm". Expected: a new practice block card appears, header shows a Rasm-appropriate icon and "Rasm" subtitle, body shows a "Topshiriq matni" label with an empty textarea and the placeholder "Masalan: Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang".
3. Type instructions into the textarea (e.g. "Yangi mavzu bo'yicha 50ta gap tuzib daftarga yozing va uni rasmga olib yuklang"). Expected: text persists as you type; switch to the Kontent tab and back to Amaliyot — the text you typed is still there.
4. Click "Fayl" in the picker. Expected: a second block appears with a Fayl icon/subtitle and its own empty textarea with the Fayl-specific placeholder.
5. Click "Audio" in the picker. Expected: a third block appears with an Audio icon/subtitle and its own textarea with the Audio-specific placeholder.
6. Click "Test" in the picker. Expected: a fourth block appears, still showing the original "Testni tanlang" `<select>` populated with your real tests (name + question count) — confirming the Test type still works exactly as before.
7. Use the up/down reorder arrows to move the Rasm block below the Test block. Expected: order updates, each block's own content (textarea text / selected test) moves with it.
8. Delete the Audio block via its X button. Expected: it's removed, the remaining three blocks stay intact with their content.
9. Confirm the pass-threshold toggle and percent input at the bottom of the Amaliyot view still work exactly as before (unaffected by this plan's changes).

- [ ] **Step 3: Stop the dev server**

Press Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 4: Final full-project build check**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds with no errors.
