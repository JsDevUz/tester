# Kurs Tuzuvchi UI — Exode uslubi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-panel tree navigation on `/lessons` with Exode's three-stage flow (course list → content page with breadcrumb + collapsible module/lesson list → lesson editor) plus a static right-hand side panel that appears inside a course.

**Architecture:** `CoursesPage.tsx` keeps a discriminated-union view state (`list` | `content` | `editor`) and renders one of three new/kept components per stage. A shared `Breadcrumb` component renders the clickable trail. A shared `CourseSidePanel` renders the static tab list + "back to list" button on both the content and editor stages. `courseStore.ts` (Course/Module/Lesson/ContentBlock model and all CRUD actions) is untouched — this plan is UI/navigation only.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand (existing `useCourseStore`), lucide-react icons.

## Global Constraints

- No backend/API work — this is a frontend-only rebuild of the course builder screen (spec: "Maqsad").
- No course-type filter (Barcha/Video/Matnli/Paketlar) — out of scope per spec Q&A.
- Course cards show only title + "N modul • N dars" — no cover image placeholder.
- Module/lesson list on the content page is single-column and collapsible (not the old two-panel side-by-side tree).
- The static side panel's tabs are: Kontent (active), Sozlamalar, Ishga tushirish va tariflar, Guruhlar, O'quvchilar, FAQ, Vazifalarni tekshirish — all except Kontent are permanently disabled placeholders.
- The side panel appears on **both** the content page and the lesson editor page, not on the course list.
- `CourseTreePanel.tsx` is removed once nothing references it.
- Verify with `npm run build --workspace=apps/frontend` (runs `tsc -b && vite build`) after every task — this project has no frontend test suite; type-checking + build is the only automated verification available.

---

### Task 1: `Breadcrumb` component

**Files:**
- Create: `apps/frontend/src/components/course/Breadcrumb.tsx`

**Interfaces:**
- Produces: `Breadcrumb` component with prop `items: Array<{ label: string; onClick?: () => void }>`. The last item renders as bold, non-clickable, current-page text; every earlier item renders as a clickable link-styled button (only if it has an `onClick`); items are separated by a `ChevronRight` icon (from `lucide-react`, size 14, `text-gray-300`).

- [ ] **Step 1: Write the component**

```tsx
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-gray-300" />}
            {isLast || !item.onClick ? (
              <span className={isLast ? 'font-semibold text-gray-800' : 'text-gray-400'}>
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={item.onClick}
                className="text-gray-400 transition-colors hover:text-indigo-500"
              >
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds (this file isn't imported anywhere yet, so this only checks it type-checks in isolation — TypeScript still checks unimported files during `tsc -b`).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/Breadcrumb.tsx
git commit -m "feat(courses): add reusable Breadcrumb component"
```

---

### Task 2: `CourseSidePanel` component

**Files:**
- Create: `apps/frontend/src/components/course/CourseSidePanel.tsx`

**Interfaces:**
- Consumes: nothing from other new components.
- Produces: `CourseSidePanel` component with prop `onBackToList: () => void`. Renders a static vertical tab list inside a card (matches the visual weight of other cards in this codebase: `rounded-2xl border-2 border-gray-100 bg-white`), with the "Kontent" tab visually active (indigo background/text) and all other tabs disabled (gray, `cursor-not-allowed`, no click handler). Below the tab list, a "Kurslarga qaytish" button that calls `onBackToList`.

- [ ] **Step 1: Write the component**

```tsx
import {
  LayoutGrid, SlidersHorizontal, Send, Users, UserRound, HelpCircle, ListChecks, ArrowLeft,
} from 'lucide-react';

interface CourseSidePanelProps {
  onBackToList: () => void;
}

interface SideTab {
  key: string;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
  active?: boolean;
}

const TABS: SideTab[] = [
  { key: 'content', label: 'Kontent', description: 'Modullar, darslar va amaliyot', icon: LayoutGrid, active: true },
  { key: 'settings', label: 'Sozlamalar', description: "Ma'lumot va moslashtirish", icon: SlidersHorizontal },
  { key: 'launch', label: 'Ishga tushirish va tariflar', description: 'Savdo va narxlar sozlamalari', icon: Send },
  { key: 'groups', label: 'Guruhlar', description: "O'quvchilarni ajratish", icon: Users },
  { key: 'students', label: "O'quvchilar", description: 'Statistika va taraqqiyot', icon: UserRound },
  { key: 'faq', label: 'FAQ', description: 'Shubhalarga javoblar', icon: HelpCircle },
  { key: 'homework', label: 'Vazifalarni tekshirish', description: 'Talabalardan amaliyot', icon: ListChecks },
];

export function CourseSidePanel({ onBackToList }: CourseSidePanelProps) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-2">
        {TABS.map((tab) => {
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

      <button
        type="button"
        onClick={onBackToList}
        className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
      >
        <ArrowLeft size={16} /> Kurslarga qaytish
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/CourseSidePanel.tsx
git commit -m "feat(courses): add static CourseSidePanel with disabled placeholder tabs"
```

---

### Task 3: `CourseGrid` component (course list, stage 1)

**Files:**
- Create: `apps/frontend/src/components/course/CourseGrid.tsx`

**Interfaces:**
- Consumes: `useCourseStore` from `apps/frontend/src/stores/courseStore.ts` — specifically `courses: Course[]` and `addCourse: (title: string) => Course`. `Course` has shape `{ id: string; title: string; modules: Module[] }`; `Module` has `{ id: string; lessons: Lesson[] }`.
- Consumes: `PromptModal` from `./PromptModal` (props: `title`, `placeholder`, `confirmLabel`, `onConfirm: (value: string) => void`, `onClose: () => void`).
- Produces: `CourseGrid` component with prop `onOpenCourse: (courseId: string) => void`, called when a course card is clicked or right after a new course is created.

This replicates course-count and lesson-count math already used elsewhere in this codebase (e.g. `course.modules.length`, `course.modules.reduce(...)` pattern) — no new store method is needed.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { GraduationCap, Layers, Plus, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { PromptModal } from './PromptModal';

interface CourseGridProps {
  onOpenCourse: (courseId: string) => void;
}

export function CourseGrid({ onOpenCourse }: CourseGridProps) {
  const { courses, addCourse } = useCourseStore();
  const [showModal, setShowModal] = useState(false);

  function handleCreate(title: string) {
    const course = addCourse(title);
    setShowModal(false);
    onOpenCourse(course.id);
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-800">Kurslar</h2>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
        >
          <Plus size={16} /> Yangi kurs
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="py-16 text-center text-gray-300">
          <Inbox size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Hali kurs yaratilmagan</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => onOpenCourse(course.id)}
                className="flex flex-col gap-3 rounded-2xl border-2 border-gray-100 bg-white p-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-500">
                  <GraduationCap size={20} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800">{course.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Layers size={12} />
                    {course.modules.length} modul • {lessonCount} dars
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showModal && (
        <PromptModal
          title="Yangi kurs"
          placeholder="Kurs nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/CourseGrid.tsx
git commit -m "feat(courses): add CourseGrid (course list stage, filter-free)"
```

---

### Task 4: `CourseContentPage` component (breadcrumb + Mundarija + collapsible module list, stage 2)

**Files:**
- Create: `apps/frontend/src/components/course/CourseContentPage.tsx`

**Interfaces:**
- Consumes: `useCourseStore` — `courses`, `addModule: (courseId, title) => Module | undefined`, `addLesson: (courseId, moduleId, title) => Lesson | undefined`, `deleteModule: (courseId, moduleId) => void`, `deleteLesson: (courseId, moduleId, lessonId) => void`. Types: `Lesson` has `{ id, title, status: 'draft' | 'published' }`.
- Consumes: `Breadcrumb` from `./Breadcrumb` (Task 1), `CourseSidePanel` from `./CourseSidePanel` (Task 2), `PromptModal` from `./PromptModal`.
- Produces: `CourseContentPage` component with props:
  - `courseId: string`
  - `onBackToList: () => void`
  - `onOpenLesson: (moduleId: string, lessonId: string) => void`

The module list is single-column and collapsible: each module row has a chevron toggle; expanding shows that module's lessons (title + status badge + delete button) and a "+ Dars qo'shish" row; below all modules, a "+ Modul qo'shish" row.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, FileText, Trash2, Plus, Inbox } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { PromptModal } from './PromptModal';

interface CourseContentPageProps {
  courseId: string;
  onBackToList: () => void;
  onOpenLesson: (moduleId: string, lessonId: string) => void;
}

type ModalState =
  | { type: 'newModule' }
  | { type: 'newLesson'; moduleId: string }
  | null;

export function CourseContentPage({ courseId, onBackToList, onOpenLesson }: CourseContentPageProps) {
  const { courses, addModule, addLesson, deleteModule, deleteLesson } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);

  if (!course) return null;

  const lessonCount = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

  function toggleModule(moduleId: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function handleCreateModule(title: string) {
    addModule(courseId, title);
    setModal(null);
  }

  function handleCreateLesson(title: string) {
    if (modal?.type !== 'newLesson') return;
    const lesson = addLesson(courseId, modal.moduleId, title);
    setModal(null);
    if (lesson) onOpenLesson(modal.moduleId, lesson.id);
  }

  return (
    <div className="flex flex-col gap-3 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title },
            { label: 'Kontent' },
          ]}
        />

        <div className="mb-4 rounded-2xl border-2 border-gray-100 bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Mundarija</h2>
          <p className="mb-4 text-sm text-gray-400">
            Bu yerda siz modullar va darslarni tahrirlashingiz, tartiblashingiz, nashr qilishingiz yoki
            o'chirishingiz mumkin.
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setModal({ type: 'newModule' })}
              className="flex items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-600"
            >
              <Plus size={16} /> Modul qo'shish
            </button>
            <p className="text-xs text-gray-400">
              {course.modules.length} modul • {lessonCount} dars
            </p>
          </div>
        </div>

        {course.modules.length === 0 ? (
          <div className="rounded-2xl border-2 border-gray-100 bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali modul yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {course.modules.map((module) => {
              const collapsed = collapsedModules.has(module.id);
              return (
                <div key={module.id} className="rounded-2xl border-2 border-gray-100 bg-white">
                  <div className="group flex items-center gap-2 px-4 py-3">
                    <button type="button" onClick={() => toggleModule(module.id)} className="text-gray-400">
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <Layers size={16} className="shrink-0 text-indigo-400" />
                    <span className="flex-1 truncate text-sm font-semibold text-gray-700">{module.title}</span>
                    <button
                      type="button"
                      onClick={() => deleteModule(courseId, module.id)}
                      className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {!collapsed && (
                    <div className="border-t border-gray-100 px-2 py-2">
                      {module.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-gray-50"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenLesson(module.id, lesson.id)}
                            className="flex flex-1 items-center gap-2 truncate text-left"
                          >
                            <FileText size={14} className="shrink-0 text-gray-300" />
                            <span className="truncate text-gray-700">{lesson.title}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                lesson.status === 'published'
                                  ? 'bg-green-50 text-green-600'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {lesson.status === 'published' ? "E'lon qilingan" : 'Qoralama'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLesson(courseId, module.id, lesson.id)}
                            className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-colors hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'newLesson', moduleId: module.id })}
                        className="w-full rounded-xl px-3 py-2.5 text-left text-xs font-medium text-indigo-400 hover:bg-indigo-50/50"
                      >
                        + Dars qo'shish
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CourseSidePanel onBackToList={onBackToList} />

      {modal?.type === 'newModule' && (
        <PromptModal
          title="Yangi modul"
          placeholder="Modul nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreateModule}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'newLesson' && (
        <PromptModal
          title="Yangi dars"
          placeholder="Dars nomi"
          confirmLabel="Yaratish"
          onConfirm={handleCreateLesson}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/CourseContentPage.tsx
git commit -m "feat(courses): add CourseContentPage with breadcrumb and collapsible module list"
```

---

### Task 5: Add breadcrumb to `LessonEditorView` (stage 3)

**Files:**
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx`

**Interfaces:**
- Consumes: `Breadcrumb` from `./Breadcrumb` (Task 1).
- Modify: `LessonEditorViewProps` gains two new required props: `onBackToList: () => void` and `onBackToContent: () => void`. Existing props (`courseId`, `moduleId`, `lessonId`) are unchanged. The component still looks up `course`/`module`/`lesson` from the store the same way it already does for `lesson` — extend that lookup to also keep references to `course` and `module` so their titles are available for the breadcrumb.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `sed -n '1,25p' apps/frontend/src/components/course/LessonEditorView.tsx`
Expected: shows the imports and the `LessonEditorViewProps` interface exactly as captured in this plan's "Current State" exploration — the component destructures `courseId, moduleId, lessonId` and looks up `lesson` via `courses.find(...).modules.find(...).lessons.find(...)`.

- [ ] **Step 2: Update the props interface and add the course/module lookups**

Replace:
```tsx
import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({ courseId, moduleId, lessonId }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock } = useCourseStore();
  const lesson = courses
    .find((c) => c.id === courseId)
    ?.modules.find((m) => m.id === moduleId)
    ?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  if (!lesson) return null;
```

With:
```tsx
import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useCourseStore, type ContentBlock } from '../../stores/courseStore';
import { BlockPicker } from './BlockPicker';
import { ContentBlockView } from './ContentBlockView';
import { Breadcrumb } from './Breadcrumb';

interface LessonEditorViewProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  onBackToList: () => void;
  onBackToContent: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

export function LessonEditorView({ courseId, moduleId, lessonId, onBackToList, onBackToContent }: LessonEditorViewProps) {
  const { courses, renameLesson, toggleLessonStatus, addBlock, updateBlock, removeBlock, moveBlock } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const module = course?.modules.find((m) => m.id === moduleId);
  const lesson = module?.lessons.find((l) => l.id === lessonId);

  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(new Set());

  if (!course || !module || !lesson) return null;
```

- [ ] **Step 3: Render the breadcrumb above the existing title row**

Replace:
```tsx
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
```

With:
```tsx
  return (
    <div className="p-6">
      <Breadcrumb
        items={[
          { label: 'Kurslar', onClick: onBackToList },
          { label: course.title, onClick: onBackToContent },
          { label: module.title, onClick: onBackToContent },
          { label: lesson.title },
        ]}
      />
      <div className="mb-6 flex items-center justify-between gap-3">
```

- [ ] **Step 4: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build fails — `CoursesPage.tsx` (the only current caller of `LessonEditorView`) doesn't yet pass `onBackToList`/`onBackToContent`. This confirms the prop change took effect; it will be fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/course/LessonEditorView.tsx
git commit -m "feat(courses): add breadcrumb to LessonEditorView (requires caller update)"
```

---

### Task 6: Rewire `CoursesPage` to the three-stage flow, remove `CourseTreePanel`

**Files:**
- Modify: `apps/frontend/src/pages/CoursesPage.tsx` (full rewrite)
- Delete: `apps/frontend/src/components/course/CourseTreePanel.tsx`

**Interfaces:**
- Consumes: `CourseGrid` (Task 3, prop `onOpenCourse`), `CourseContentPage` (Task 4, props `courseId`, `onBackToList`, `onOpenLesson`), `LessonEditorView` (Task 5, props `courseId`, `moduleId`, `lessonId`, `onBackToList`, `onBackToContent`).
- Produces: `CoursesPage` component (default export used by `apps/frontend/src/App.tsx`'s `/lessons` route — confirm via `grep -n "CoursesPage" apps/frontend/src/App.tsx` that the import path and named export `CoursesPage` stay the same, since this task keeps the export name unchanged).

The empty-state ("Hali kurs yaratilmagan") screen currently shown when there are zero courses moves into `list` view naturally once `CourseGrid` (Task 3) handles its own empty state — so `CoursesPage` no longer needs a special zero-courses branch.

- [ ] **Step 1: Replace the full file**

```tsx
import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { CourseGrid } from '../components/course/CourseGrid';
import { CourseContentPage } from '../components/course/CourseContentPage';
import { LessonEditorView } from '../components/course/LessonEditorView';

type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };

export function CoursesPage() {
  const [state, setState] = useState<ViewState>({ view: 'list' });

  function backToList() {
    setState({ view: 'list' });
  }

  return (
    <AppShell>
      {state.view === 'list' && (
        <CourseGrid onOpenCourse={(courseId) => setState({ view: 'content', courseId })} />
      )}
      {state.view === 'content' && (
        <CourseContentPage
          courseId={state.courseId}
          onBackToList={backToList}
          onOpenLesson={(moduleId, lessonId) =>
            setState({ view: 'editor', courseId: state.courseId, moduleId, lessonId })
          }
        />
      )}
      {state.view === 'editor' && (
        <LessonEditorView
          courseId={state.courseId}
          moduleId={state.moduleId}
          lessonId={state.lessonId}
          onBackToList={backToList}
          onBackToContent={() => setState({ view: 'content', courseId: state.courseId })}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Delete the now-unused tree panel**

Run: `git rm apps/frontend/src/components/course/CourseTreePanel.tsx`
Expected: file removed from the working tree and staged for deletion.

- [ ] **Step 3: Verify the build**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds — no more references to `CourseTreePanel`, and `LessonEditorView`'s new required props are satisfied.

- [ ] **Step 4: Verify no other file references the removed component**

Run: `grep -rn "CourseTreePanel" apps/frontend/src`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/CoursesPage.tsx
git commit -m "refactor(courses): rewire CoursesPage to the three-stage Exode-style flow"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (manual QA pass — no automated frontend tests exist in this repo, per Global Constraints).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev --workspace=apps/frontend`
Expected: server starts on the configured port without errors.

- [ ] **Step 2: Walk the full flow in a browser**

1. Navigate to `/lessons`. Expected: course grid (or empty state) shows, no course-type filter present.
2. Create a course via "+ Yangi kurs". Expected: navigates straight to the Kontent page for the new course, breadcrumb reads "Kurslar > [nom] > Kontent", side panel visible with only "Kontent" active and "Kurslarga qaytish" at the bottom.
3. Click "Modul qo'shish", then "+ Dars qo'shish" inside the new module. Expected: creating a lesson navigates straight into `LessonEditorView`, breadcrumb reads "Kurslar > [kurs] > [modul] > [dars]".
4. Click the module name in the breadcrumb. Expected: returns to the Kontent page for the same course, with the module still present.
5. Collapse and re-expand the module via its chevron. Expected: lesson list toggles visibility.
6. Click "Kurslar" in the breadcrumb. Expected: returns to the course grid; the created course and its updated module/lesson counts are visible on its card.
7. Re-open the course, open the lesson again, click a disabled side-panel tab (e.g. "Sozlamalar"). Expected: no navigation occurs, tab stays visually inactive.
8. Click "Kurslarga qaytish" from both the Kontent page and the lesson editor page. Expected: both return to the course grid.

- [ ] **Step 3: Stop the dev server**

Press Ctrl+C in the terminal running `npm run dev`.

- [ ] **Step 4: Final full-project build check**

Run: `npm run build --workspace=apps/frontend`
Expected: build succeeds with no errors.
