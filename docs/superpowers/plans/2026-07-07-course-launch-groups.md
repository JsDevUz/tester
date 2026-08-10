# Kurs "Tariflar" va "Guruhlar" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurs darajasidagi sidebar panelida hozircha bosib bo'lmaydigan "Ishga tushirish va tariflar" va "Guruhlar" tablarini ishga tushirish — frontend-only, mock ma'lumot bilan, Exode.biz uslubidagi UI.

**Architecture:** `courseStore.ts`ga `Launch`/`PricingPlan`/`Group` modellari va ularning CRUD action'lari qo'shiladi. `CoursesPage.tsx`dagi `ViewState` ikkita yangi view (`launch`, `groups`) bilan kengaytiriladi. `CourseSidePanel.tsx` `variant='full'` uchun endi navigatsiya qila oladigan qilinadi. Ikkita yangi sahifa komponenti (`CourseLaunchPage.tsx`, `CourseGroupsPage.tsx`) va ikkita yangi modal (`CreatePricingPlanModal.tsx`, `AddStudentToGroupModal.tsx`) yaratiladi, mavjud `CourseContentPage.tsx` layout patterniga mos.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand, lucide-react ikonkalar.

## Global Constraints

- Frontend-only — backend/API chaqiruvi yo'q, hamma narsa `courseStore.ts` (zustand) da saqlanadi.
- Barcha yangi UI mavjud dizayn tizimiga mos: `rounded-2xl`, `border border-border` (loyihada `--color-border: #d7d8d9` custom token, `apps/frontend/src/index.css`), indigo (`bg-indigo-500`/`text-indigo-600`) va green (`bg-green-500`) aksent ranglar.
- Yangi fayllar `apps/frontend/src/components/course/` papkasida: `CourseLaunchPage.tsx`, `CourseGroupsPage.tsx`, `CreatePricingPlanModal.tsx`, `AddStudentToGroupModal.tsx`.
- `MOCK_STUDENTS` `apps/frontend/src/pages/StudentsPage.tsx` dan eksport qilinadi (`export const MOCK_STUDENTS`), boshqa joyda takrorlanmaydi.
- Build har doim `npm run build --workspace=apps/frontend` bilan tekshiriladi (tsc + vite), xatosiz o'tishi kerak.
- Dars (lesson) darajasidagi `LESSON_TABS` o'zgarmaydi — bu funksiya faqat kurs darajasiga (`FULL_TABS`) tegishli.

---

### Task 1: Store modeli — Launch, PricingPlan, Group + CRUD action'lar

**Files:**
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Produces: `PricingPlan`, `Launch`, `Group` interfeyslari; `Course.launches: Launch[]`, `Course.groups: Group[]`; quyidagi store action'lari: `addLaunch(courseId, name): Launch | undefined`, `toggleLaunchActive(courseId, launchId): void`, `renameLaunch(courseId, launchId, name): void`, `addPricingPlan(courseId, launchId, plan: Omit<PricingPlan, 'id'>): void`, `removePricingPlan(courseId, launchId, planId): void`, `addGroup(courseId, name): Group | undefined`, `renameGroup(courseId, groupId, name): void`, `toggleGroupChat(courseId, groupId): void`, `toggleGroupChannel(courseId, groupId): void`, `setGroupCurators(courseId, groupId, curatorIds: string[]): void`, `addStudentToGroup(courseId, groupId, studentId): void`, `removeStudentFromGroup(courseId, groupId, studentId): void`, `deleteGroup(courseId, groupId): void`.

- [ ] **Step 1: Interfeyslarni qo'shish**

`apps/frontend/src/stores/courseStore.ts` faylida, `export interface Course {` blokidan oldin (10-qatordan keyin, `PracticeBlock` interfeysidan keyin) qo'shing:

```typescript
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  groupId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Launch {
  id: string;
  name: string;
  active: boolean;
  plans: PricingPlan[];
}

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  curatorIds: string[];
  studentIds: string[];
}
```

- [ ] **Step 2: `Course` interfeysiga maydon qo'shish**

Mavjud kodni:

```typescript
export interface Course {
  id: string;
  title: string;
  modules: Module[];
}
```

Bunga almashtiring:

```typescript
export interface Course {
  id: string;
  title: string;
  modules: Module[];
  launches: Launch[];
  groups: Group[];
}
```

- [ ] **Step 3: `CourseState` interfeysiga yangi action signaturalarini qo'shish**

Mavjud kodni:

```typescript
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;
}
```

Bunga almashtiring (yangi qatorlar `setPassThreshold`dan keyin qo'shiladi):

```typescript
  setPassThreshold: (courseId: string, moduleId: string, lessonId: string, data: { enabled: boolean; percent?: number | null }) => void;

  addLaunch: (courseId: string, name: string) => Launch | undefined;
  toggleLaunchActive: (courseId: string, launchId: string) => void;
  renameLaunch: (courseId: string, launchId: string, name: string) => void;
  addPricingPlan: (courseId: string, launchId: string, plan: Omit<PricingPlan, 'id'>) => void;
  removePricingPlan: (courseId: string, launchId: string, planId: string) => void;

  addGroup: (courseId: string, name: string) => Group | undefined;
  renameGroup: (courseId: string, groupId: string, name: string) => void;
  toggleGroupChat: (courseId: string, groupId: string) => void;
  toggleGroupChannel: (courseId: string, groupId: string) => void;
  setGroupCurators: (courseId: string, groupId: string, curatorIds: string[]) => void;
  addStudentToGroup: (courseId: string, groupId: string, studentId: string) => void;
  removeStudentFromGroup: (courseId: string, groupId: string, studentId: string) => void;
  deleteGroup: (courseId: string, groupId: string) => void;
}
```

- [ ] **Step 4: `addCourse` action'ida yangi maydonlarni initsializatsiya qilish**

Mavjud kodni:

```typescript
  addCourse: (title) => {
    const course: Course = { id: newId(), title, modules: [] };
    set({ courses: [...get().courses, course] });
    return course;
  },
```

Bunga almashtiring:

```typescript
  addCourse: (title) => {
    const course: Course = { id: newId(), title, modules: [], launches: [], groups: [] };
    set({ courses: [...get().courses, course] });
    return course;
  },
```

- [ ] **Step 5: Launch action'larini qo'shish**

Fayl oxirida, `setPassThreshold` action'idan keyin (yopuvchi `}));` dan oldin) qo'shing:

```typescript
  addLaunch: (courseId, name) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const launch: Launch = { id: newId(), name, active: false, plans: [] };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, launches: [...c.launches, launch] } : c,
      ),
    });
    return launch;
  },
  toggleLaunchActive: (courseId, launchId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id === launchId ? { ...l, active: !l.active } : l,
              ),
            },
      ),
    });
  },
  renameLaunch: (courseId, launchId, name) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) => (l.id === launchId ? { ...l, name } : l)),
            },
      ),
    });
  },
  addPricingPlan: (courseId, launchId, plan) => {
    const newPlan: PricingPlan = { ...plan, id: newId() };
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: [...l.plans, newPlan] },
              ),
            },
      ),
    });
  },
  removePricingPlan: (courseId, launchId, planId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              launches: c.launches.map((l) =>
                l.id !== launchId ? l : { ...l, plans: l.plans.filter((p) => p.id !== planId) },
              ),
            },
      ),
    });
  },
```

- [ ] **Step 6: Group action'larini qo'shish**

Xuddi shu joyda, Launch action'laridan keyin qo'shing:

```typescript
  addGroup: (courseId, name) => {
    const course = get().courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const group: Group = {
      id: newId(),
      name,
      groupChatEnabled: false,
      groupChannelEnabled: false,
      curatorIds: [],
      studentIds: [],
    };
    set({
      courses: get().courses.map((c) =>
        c.id === courseId ? { ...c, groups: [...c.groups, group] } : c,
      ),
    });
    return group;
  },
  renameGroup: (courseId, groupId, name) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) },
      ),
    });
  },
  toggleGroupChat: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChatEnabled: !g.groupChatEnabled } : g,
              ),
            },
      ),
    });
  },
  toggleGroupChannel: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id === groupId ? { ...g, groupChannelEnabled: !g.groupChannelEnabled } : g,
              ),
            },
      ),
    });
  },
  setGroupCurators: (courseId, groupId, curatorIds) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : { ...c, groups: c.groups.map((g) => (g.id === groupId ? { ...g, curatorIds } : g)) },
      ),
    });
  },
  addStudentToGroup: (courseId, groupId, studentId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId || g.studentIds.includes(studentId)
                  ? g
                  : { ...g, studentIds: [...g.studentIds, studentId] },
              ),
            },
      ),
    });
  },
  removeStudentFromGroup: (courseId, groupId, studentId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              groups: c.groups.map((g) =>
                g.id !== groupId
                  ? g
                  : { ...g, studentIds: g.studentIds.filter((id) => id !== studentId) },
              ),
            },
      ),
    });
  },
  deleteGroup: (courseId, groupId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId ? c : { ...c, groups: c.groups.filter((g) => g.id !== groupId) },
      ),
    });
  },
```

- [ ] **Step 7: Build orqali tekshirish**

Run: `npm run build --workspace=apps/frontend`
Expected: `tsc -b` xatosiz o'tadi (yangi maydonlar hali hech qayerda ishlatilmagani uchun boshqa fayllarda buzilish bo'lmaydi — `Course` obyekti faqat `addCourse` orqali yaratiladi, u Step 4da yangilangan).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(courses): add Launch/PricingPlan/Group models and CRUD actions

- Course now has launches[] and groups[] arrays
- addLaunch/toggleLaunchActive/renameLaunch/addPricingPlan/removePricingPlan
- addGroup/renameGroup/toggleGroupChat/toggleGroupChannel/setGroupCurators
- addStudentToGroup/removeStudentFromGroup/deleteGroup
- all frontend-only, mirrors existing module/lesson CRUD pattern"
```

---

### Task 2: MOCK_STUDENTS eksport qilish + MOCK_CURATORS yaratish

**Files:**
- Modify: `apps/frontend/src/pages/StudentsPage.tsx`
- Create: `apps/frontend/src/data/mockCurators.ts`

**Interfaces:**
- Consumes: `Admin` turi (`apps/frontend/src/api/auth.ts`, maydonlari `{ id: string; email: string; name: string; role: 'student'|'teacher'|'super'; phone?: string|null }`), `useAuthStore` (`apps/frontend/src/stores/authStore.ts`, `admin: Admin | null`).
- Produces: `export const MOCK_STUDENTS: StudentRow[]` va `export interface StudentRow` (`StudentsPage.tsx`dan); `export interface Curator { id: string; name: string }` va `export function getMockCurators(currentAdminName?: string | null): Curator[]` (`mockCurators.ts`dan).

- [ ] **Step 1: `StudentsPage.tsx`da `StudentRow` va `MOCK_STUDENTS`ni eksport qilish**

Mavjud kodni:

```typescript
interface StudentRow {
```

Bunga almashtiring:

```typescript
export interface StudentRow {
```

Va mavjud kodni:

```typescript
// TODO: mock data — /admins/users kabi backend endpoint ulanganda almashtiriladi
const MOCK_STUDENTS: StudentRow[] = [
```

Bunga almashtiring:

```typescript
// TODO: mock data — /admins/users kabi backend endpoint ulanganda almashtiriladi
export const MOCK_STUDENTS: StudentRow[] = [
```

- [ ] **Step 2: `mockCurators.ts` faylini yaratish**

`apps/frontend/src/data/mockCurators.ts` yangi fayl:

```typescript
export interface Curator {
  id: string;
  name: string;
}

const FALLBACK_CURATORS: Curator[] = [
  { id: 'curator-2', name: 'Dilshod Rahimov' },
  { id: 'curator-3', name: 'Zarina Yoldosheva' },
];

// Joriy tizimga kirgan admin + 2 ta o'ylab topilgan namunaviy o'qituvchi.
// Backend ulanganda bu funksiya xodimlar API'siga almashtiriladi.
export function getMockCurators(currentAdminName?: string | null): Curator[] {
  if (!currentAdminName) return FALLBACK_CURATORS;
  return [{ id: 'curator-1', name: currentAdminName }, ...FALLBACK_CURATORS];
}
```

- [ ] **Step 3: Build orqali tekshirish**

Run: `npm run build --workspace=apps/frontend`
Expected: xatosiz o'tadi.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/StudentsPage.tsx apps/frontend/src/data/mockCurators.ts
git commit -m "refactor(students): export MOCK_STUDENTS and StudentRow, add mock curators data

- StudentsPage's mock student list is now reusable by group membership UI
- new getMockCurators() helper returns current admin + 2 sample curator names"
```

---

### Task 3: `CourseSidePanel.tsx` — full-variant navigatsiyasini yoqish

**Files:**
- Modify: `apps/frontend/src/components/course/CourseSidePanel.tsx`

**Interfaces:**
- Consumes: hech narsa (sof UI komponenti).
- Produces: yangilangan `CourseSidePanelProps` — qo'shilgan `activeFullTab?: 'content' | 'launch' | 'groups'`, `onSelectLaunch?: () => void`, `onSelectGroups?: () => void`. Bu proplarni Task 4, 5, 6 lardagi sahifalar ishlatadi.

- [ ] **Step 1: Props interfeysini kengaytirish**

Mavjud kodni:

```typescript
interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: 'full' | 'lesson';
  practiceEnabled?: boolean;
  activeTab?: 'content' | 'practice';
  onSelectPractice?: () => void;
  onSelectContent?: () => void;
}
```

Bunga almashtiring:

```typescript
interface CourseSidePanelProps {
  onBackToList: () => void;
  variant?: 'full' | 'lesson';
  practiceEnabled?: boolean;
  activeTab?: 'content' | 'practice';
  onSelectPractice?: () => void;
  onSelectContent?: () => void;
  activeFullTab?: 'content' | 'launch' | 'groups';
  onSelectLaunch?: () => void;
  onSelectGroups?: () => void;
}
```

- [ ] **Step 2: Funksiya signaturasiga yangi proplarni qo'shish**

Mavjud kodni:

```typescript
export function CourseSidePanel({
  onBackToList, variant = 'full', practiceEnabled = false, activeTab = 'content', onSelectPractice, onSelectContent,
}: CourseSidePanelProps) {
```

Bunga almashtiring:

```typescript
export function CourseSidePanel({
  onBackToList, variant = 'full', practiceEnabled = false, activeTab = 'content', onSelectPractice, onSelectContent,
  activeFullTab = 'content', onSelectLaunch, onSelectGroups,
}: CourseSidePanelProps) {
```

- [ ] **Step 3: `isTabActive` ni full-variant uchun ham to'g'ri ishlashini ta'minlash**

Mavjud kodni:

```typescript
  function isTabActive(key: string): boolean {
    if (variant !== 'lesson') return key === 'content';
    return key === activeTab;
  }
```

Bunga almashtiring:

```typescript
  function isTabActive(key: string): boolean {
    if (variant !== 'lesson') return key === activeFullTab;
    return key === activeTab;
  }
```

- [ ] **Step 4: `isTabClickable` ni `launch`/`groups` uchun yoqish**

Mavjud kodni:

```typescript
  function isTabClickable(key: string): boolean {
    if (variant !== 'lesson') return false;
    if (key === 'content') return true;
    if (key === 'practice') return practiceEnabled;
    return false;
  }
```

Bunga almashtiring:

```typescript
  function isTabClickable(key: string): boolean {
    if (variant !== 'lesson') {
      return key === 'content' || key === 'launch' || key === 'groups';
    }
    if (key === 'content') return true;
    if (key === 'practice') return practiceEnabled;
    return false;
  }
```

- [ ] **Step 5: `handleTabClick` ni yangi tablarni ham boshqarishga kengaytirish**

Mavjud kodni:

```typescript
  function handleTabClick(key: string) {
    if (!isTabClickable(key)) return;
    if (key === 'content') onSelectContent?.();
    if (key === 'practice') onSelectPractice?.();
  }
```

Bunga almashtiring:

```typescript
  function handleTabClick(key: string) {
    if (!isTabClickable(key)) return;
    if (key === 'content') onSelectContent?.();
    if (key === 'practice') onSelectPractice?.();
    if (key === 'launch') onSelectLaunch?.();
    if (key === 'groups') onSelectGroups?.();
  }
```

- [ ] **Step 6: Manual tekshirish**

`CourseContentPage.tsx` hozircha `CourseSidePanel`ni yangi proplarsiz chaqiradi (`<CourseSidePanel onBackToList={onBackToList} />`), bu holatda `activeFullTab` default `'content'` bo'lganidan "Kontent" hali ham active ko'rinadi, "launch"/"groups" bosilsa hech narsa bo'lmaydi (callback berilmagan) — bu regressiya emas, chunki Task 5/6da bu sahifalar proplarni beradi.

Run: `npm run build --workspace=apps/frontend`
Expected: xatosiz o'tadi.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/course/CourseSidePanel.tsx
git commit -m "feat(courses): enable launch/groups tab navigation in full-variant side panel

- isTabClickable now allows launch and groups tabs when variant='full'
- isTabActive compares against new activeFullTab prop for full variant
- handleTabClick wired to new onSelectLaunch/onSelectGroups callbacks"
```

---

### Task 4: `CoursesPage.tsx` — yangi view'larni ulash

**Files:**
- Modify: `apps/frontend/src/pages/CoursesPage.tsx`

**Interfaces:**
- Consumes: `CourseLaunchPage` (Task 5da yaratiladi, props: `{ courseId: string; onBackToList: () => void; onSelectContent: () => void; onSelectGroups: () => void }`), `CourseGroupsPage` (Task 6da yaratiladi, bir xil prop shape).
- Produces: `ViewState` endi `{ view: 'launch'; courseId: string }` va `{ view: 'groups'; courseId: string }` variantlarini o'z ichiga oladi.

- [ ] **Step 1: `ViewState` union'ini kengaytirish**

Mavjud kodni:

```typescript
type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };
```

Bunga almashtiring:

```typescript
type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'launch'; courseId: string }
  | { view: 'groups'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };
```

- [ ] **Step 2: Importlarni va JSX render bloklarini qo'shish**

Mavjud kodni (fayl boshidagi importlar):

```typescript
import { CourseContentPage } from '../components/course/CourseContentPage';
```

Bunga almashtiring:

```typescript
import { CourseContentPage } from '../components/course/CourseContentPage';
import { CourseLaunchPage } from '../components/course/CourseLaunchPage';
import { CourseGroupsPage } from '../components/course/CourseGroupsPage';
```

Mavjud kodni:

```typescript
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
```

Bunga almashtiring:

```typescript
      {state.view === 'content' && (
        <CourseContentPage
          courseId={state.courseId}
          onBackToList={backToList}
          onOpenLesson={(moduleId, lessonId) =>
            setState({ view: 'editor', courseId: state.courseId, moduleId, lessonId })
          }
        />
      )}
      {state.view === 'launch' && (
        <CourseLaunchPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectGroups={() => setState({ view: 'groups', courseId: state.courseId })}
        />
      )}
      {state.view === 'groups' && (
        <CourseGroupsPage
          courseId={state.courseId}
          onBackToList={backToList}
          onSelectContent={() => setState({ view: 'content', courseId: state.courseId })}
          onSelectLaunch={() => setState({ view: 'launch', courseId: state.courseId })}
        />
      )}
      {state.view === 'editor' && (
```

- [ ] **Step 3: Build (implementatsiya tugagach to'liq yashil bo'ladi, hozircha kutilgan xato)**

Bu bosqichda `CourseLaunchPage`/`CourseGroupsPage` hali mavjud emas, shuning uchun build muvaffaqiyatsiz tugaydi — bu kutilgan holat, Task 5 va 6 shu fayllarni yaratadi. Buni tasdiqlash uchun:

Run: `npm run build --workspace=apps/frontend 2>&1 | grep "Cannot find module"`
Expected: `Cannot find module '../components/course/CourseLaunchPage'` va `CourseGroupsPage` haqida xabar chiqadi.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/CoursesPage.tsx
git commit -m "feat(courses): wire launch and groups views into CoursesPage view state

- ViewState extended with 'launch' and 'groups' variants
- build intentionally broken until CourseLaunchPage/CourseGroupsPage exist (Task 5/6)"
```

---

### Task 5: `CourseLaunchPage.tsx` + `CreatePricingPlanModal.tsx`

**Files:**
- Create: `apps/frontend/src/components/course/CourseLaunchPage.tsx`
- Create: `apps/frontend/src/components/course/CreatePricingPlanModal.tsx`

**Interfaces:**
- Consumes: `useCourseStore` (`courses`, `addLaunch`, `toggleLaunchActive`, `renameLaunch`, `addPricingPlan` — Task 1), `Breadcrumb` (`apps/frontend/src/components/course/Breadcrumb.tsx`, props `{ items: BreadcrumbItem[] }`, `BreadcrumbItem = { label: string; onClick?: () => void }`), `CourseSidePanel` (Task 3, props `activeFullTab`, `onSelectContent`, `onSelectGroups`, `onSelectLaunch`, `onBackToList`), `Course`/`Launch`/`PricingPlan`/`Group` types (Task 1, `apps/frontend/src/stores/courseStore.ts`).
- Produces: `export function CourseLaunchPage(props: { courseId: string; onBackToList: () => void; onSelectContent: () => void; onSelectGroups: () => void }): JSX.Element` — Task 4 shuni import qiladi.

- [ ] **Step 1: `CreatePricingPlanModal.tsx` yaratish**

`apps/frontend/src/components/course/CreatePricingPlanModal.tsx`:

```typescript
import { useState } from 'react';
import { X } from 'lucide-react';
import type { Group, PricingPlan } from '../../stores/courseStore';

interface CreatePricingPlanModalProps {
  groups: Group[];
  onConfirm: (plan: Omit<PricingPlan, 'id'>) => void;
  onClose: () => void;
}

const NAME_MAX = 65;

export function CreatePricingPlanModal({ groups, onConfirm, onClose }: CreatePricingPlanModalProps) {
  const [groupId, setGroupId] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const trimmedName = name.trim();
  const priceNum = Number(price);
  const canSubmit = trimmedName.length > 0 && price.trim() !== '' && !isNaN(priceNum) && priceNum >= 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm({
      name: trimmedName,
      description: description.trim(),
      price: priceNum,
      originalPrice: originalPrice.trim() === '' ? null : Number(originalPrice),
      groupId: groupId || null,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">Tarif yaratish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Guruh, qaysiga o'tkazish</p>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            >
              <option value="">Guruhsiz</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-sm text-gray-500">Tarif nomi</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="Masalan: Bazaviy"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>
          </div>

          <div>
            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Masalan, boshqa tariflardan farqi"
              rows={2}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Narx (UZS)</p>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="1000"
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Chegirmasiz narx</p>
              <input
                type="number"
                min={0}
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Ixtiyoriy"
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Boshlanish sanasi</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-gray-500">Tugash sanasi</p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-1 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            Tarif yaratish
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CourseLaunchPage.tsx` yaratish**

`apps/frontend/src/components/course/CourseLaunchPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { useCourseStore, type PricingPlan } from '../../stores/courseStore';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { CreatePricingPlanModal } from './CreatePricingPlanModal';

interface CourseLaunchPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectGroups: () => void;
}

const LAUNCH_NAME_MAX = 65;

function formatPlanDateRange(plan: PricingPlan): string {
  if (!plan.startDate && !plan.endDate) return 'Cheksiz';
  const start = plan.startDate ?? '…';
  const end = plan.endDate ?? '…';
  return `${start} — ${end}`;
}

export function CourseLaunchPage({ courseId, onBackToList, onSelectContent, onSelectGroups }: CourseLaunchPageProps) {
  const { courses, addLaunch, toggleLaunchActive, renameLaunch, addPricingPlan } = useCourseStore();
  const course = courses.find((c) => c.id === courseId);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (course && course.launches.length === 0) {
      addLaunch(courseId, 'Запуск №1');
    }
  }, [course, courseId, addLaunch]);

  if (!course) return null;
  const launch = course.launches[0];
  if (!launch) return null;

  function handleCreatePlan(plan: Omit<PricingPlan, 'id'>) {
    addPricingPlan(courseId, launch.id, plan);
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-2 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Ishga tushirish va tariflar' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Ishga tushirish sozlamalari</h2>
          <p className="mb-4 text-sm text-gray-400">Bu yerda ishga tushirish sozlamalarini o'zgartirishingiz mumkin.</p>

          <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800">
                {launch.active ? 'Ishga tushirish sotuvda' : 'Ishga tushirish sotuvda emas'}
              </p>
              <p className="text-xs text-gray-400">Bosing, ishga tushirish savdo holatini o'zgartirish uchun</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              launch.active ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'
            }`}>
              {launch.active ? 'Faol' : 'Qoralama'}
            </span>
            <button
              type="button"
              onClick={() => toggleLaunchActive(courseId, launch.id)}
              className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${
                launch.active ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  launch.active ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-sm text-gray-500">Ishga tushirish nomi</p>
            <input
              value={launch.name}
              onChange={(e) => renameLaunch(courseId, launch.id, e.target.value.slice(0, LAUNCH_NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{launch.name.length} / {LAUNCH_NAME_MAX}</p>
          </div>

          <p className="mt-4 text-center text-xs text-gray-300">Barchasi saqlandi</p>
        </div>

        <div className="rounded-2xl bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="mb-1 text-lg font-bold text-gray-800">Tariflar</h2>
              <p className="text-sm text-gray-400">Bu yerda tariflarni qo'shishingiz mumkin</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Tarif yaratish
            </button>
          </div>

          {launch.plans.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 py-14 text-center">
              <Inbox size={30} className="mx-auto mb-3 text-indigo-200" />
              <p className="text-sm font-semibold text-gray-700">Hali tarif yo'q</p>
              <p className="mt-1 text-xs text-gray-400">Yuqoridagi tugma orqali birinchi tarifni yarating</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {launch.plans.map((plan) => (
                <div key={plan.id} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{plan.name}</p>
                    <p className="text-xs text-gray-400">{formatPlanDateRange(plan)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-gray-700">{plan.price.toLocaleString()} UZS</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CourseSidePanel
        onBackToList={onBackToList}
        activeFullTab="launch"
        onSelectContent={onSelectContent}
        onSelectGroups={onSelectGroups}
        onSelectLaunch={() => {}}
      />

      {modalOpen && (
        <CreatePricingPlanModal
          groups={course.groups}
          onConfirm={handleCreatePlan}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build orqali tekshirish**

Run: `npm run build --workspace=apps/frontend 2>&1 | grep "CourseGroupsPage"`
Expected: hali ham `Cannot find module '../components/course/CourseGroupsPage'` xatosi chiqadi (Task 6 hali bajarilmagan) — bu kutilgan.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/course/CourseLaunchPage.tsx apps/frontend/src/components/course/CreatePricingPlanModal.tsx
git commit -m "feat(courses): add CourseLaunchPage with pricing plan creation modal

- launch settings card: active toggle, name input with char counter
- pricing plans list with empty state
- CreatePricingPlanModal: group select, name, description, price/original price, date range
- build still broken pending CourseGroupsPage (Task 6)"
```

---

### Task 6: `CourseGroupsPage.tsx` + `AddStudentToGroupModal.tsx`

**Files:**
- Create: `apps/frontend/src/components/course/CourseGroupsPage.tsx`
- Create: `apps/frontend/src/components/course/AddStudentToGroupModal.tsx`

**Interfaces:**
- Consumes: `useCourseStore` (`courses`, `addGroup`, `renameGroup`, `toggleGroupChat`, `toggleGroupChannel`, `setGroupCurators`, `addStudentToGroup`, `removeStudentFromGroup`, `deleteGroup` — Task 1), `MOCK_STUDENTS`/`StudentRow` (`apps/frontend/src/pages/StudentsPage.tsx`, Task 2), `getMockCurators`/`Curator` (`apps/frontend/src/data/mockCurators.ts`, Task 2), `useAuthStore` (`admin: Admin | null`, `admin.name: string`), `Breadcrumb`, `CourseSidePanel` (Task 3).
- Produces: `export function CourseGroupsPage(props: { courseId: string; onBackToList: () => void; onSelectContent: () => void; onSelectLaunch: () => void }): JSX.Element` — Task 4 shuni import qiladi.

- [ ] **Step 1: `AddStudentToGroupModal.tsx` yaratish**

`apps/frontend/src/components/course/AddStudentToGroupModal.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MOCK_STUDENTS } from '../../pages/StudentsPage';

interface AddStudentToGroupModalProps {
  alreadyInGroup: string[];
  onConfirm: (studentIds: string[]) => void;
  onClose: () => void;
}

export function AddStudentToGroupModal({ alreadyInGroup, onConfirm, onClose }: AddStudentToGroupModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(alreadyInGroup));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_STUDENTS;
    return MOCK_STUDENTS.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q));
  }, [query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">O'quvchi qo'shish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              className="w-full rounded-2xl bg-gray-50 py-2.5 pl-9 pr-4 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Hech narsa topilmadi.</p>
          ) : (
            <div className="flex flex-col gap-1 pb-2">
              {filtered.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 shrink-0 accent-indigo-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.phone}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3">
          <button
            onClick={() => onConfirm([...selected])}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CourseGroupsPage.tsx` yaratish**

`apps/frontend/src/components/course/CourseGroupsPage.tsx`:

```typescript
import { useState } from 'react';
import { Inbox, Plus, Users, X, Trash2 } from 'lucide-react';
import { useCourseStore } from '../../stores/courseStore';
import { useAuthStore } from '../../stores/authStore';
import { MOCK_STUDENTS } from '../../pages/StudentsPage';
import { getMockCurators } from '../../data/mockCurators';
import { Breadcrumb } from './Breadcrumb';
import { CourseSidePanel } from './CourseSidePanel';
import { AddStudentToGroupModal } from './AddStudentToGroupModal';

interface CourseGroupsPageProps {
  courseId: string;
  onBackToList: () => void;
  onSelectContent: () => void;
  onSelectLaunch: () => void;
}

const AVATAR_PALETTES = [
  'bg-indigo-100 text-indigo-600',
  'bg-amber-100 text-amber-600',
  'bg-teal-100 text-teal-600',
  'bg-rose-100 text-rose-600',
];

function paletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function CourseGroupsPage({ courseId, onBackToList, onSelectContent, onSelectLaunch }: CourseGroupsPageProps) {
  const {
    courses, addGroup, renameGroup, toggleGroupChat, toggleGroupChannel,
    setGroupCurators, addStudentToGroup, removeStudentFromGroup, deleteGroup,
  } = useCourseStore();
  const admin = useAuthStore((s) => s.admin);
  const course = courses.find((c) => c.id === courseId);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<'students' | 'settings'>('students');
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!course) return null;
  const group = selectedGroupId ? course.groups.find((g) => g.id === selectedGroupId) : undefined;
  const curators = getMockCurators(admin?.name);

  function handleCreateGroup() {
    const newGroup = addGroup(courseId, `Guruh ${course.groups.length + 1}`);
    if (newGroup) {
      setSelectedGroupId(newGroup.id);
      setInnerTab('students');
    }
  }

  function handleAddStudents(studentIds: string[]) {
    if (!group) return;
    studentIds.forEach((id) => addStudentToGroup(courseId, group.id, id));
    setAddStudentModalOpen(false);
  }

  function handleConfirmDeleteGroup() {
    if (!group) return;
    deleteGroup(courseId, group.id);
    setSelectedGroupId(null);
    setConfirmDelete(false);
  }

  function handlePickCurator(curatorId: string) {
    if (!group || !curatorId) return;
    if (group.curatorIds.includes(curatorId)) return;
    setGroupCurators(courseId, group.id, [...group.curatorIds, curatorId]);
  }

  function handleRemoveCurator(curatorId: string) {
    if (!group) return;
    setGroupCurators(courseId, group.id, group.curatorIds.filter((id) => id !== curatorId));
  }

  // ─── Holat B: guruh ichki ko'rinishi ───────────────────────────────
  if (group) {
    const groupStudents = MOCK_STUDENTS.filter((s) => group.studentIds.includes(s.id));

    return (
      <div className="flex flex-col gap-2 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            items={[
              { label: 'Kurslar', onClick: onBackToList },
              { label: course.title, onClick: onSelectContent },
              { label: 'Guruhlar', onClick: () => setSelectedGroupId(null) },
              { label: group.name },
            ]}
          />

          <div className="mb-4 flex gap-2 rounded-2xl bg-white p-2">
            <button
              type="button"
              onClick={() => setInnerTab('students')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                innerTab === 'students' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              O'quvchilar
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('settings')}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                innerTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              Sozlamalar
            </button>
          </div>

          {innerTab === 'students' ? (
            <div className="rounded-2xl bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Barcha o'quvchilar</p>
                  <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
                    {group.studentIds.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddStudentModalOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                >
                  <Plus size={16} /> O'quvchi qo'shish
                </button>
              </div>

              {groupStudents.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 py-14 text-center">
                  <Users size={30} className="mx-auto mb-3 text-indigo-200" />
                  <p className="text-sm font-semibold text-gray-700">O'quvchilar topilmadi</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Ular guruh tarifi orqali sotib olingandan keyin paydo bo'ladi
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {groupStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3.5 py-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${paletteFor(s.id)}`}>
                        {initials(s.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.phone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStudentFromGroup(courseId, group.id, s.id)}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="Guruhdan olib tashlash"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Asosiy sozlamalar</h3>
                <p className="mb-1.5 text-sm text-gray-500">Guruh nomi</p>
                <input
                  value={group.name}
                  onChange={(e) => renameGroup(courseId, group.id, e.target.value)}
                  className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                />

                <div className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">Guruh chati</p>
                    <p className="text-xs text-gray-400">Alohida chat o'quvchilar va kuratorlar uchun</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroupChat(courseId, group.id)}
                    className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${
                      group.groupChatEnabled ? 'bg-indigo-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      group.groupChatEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                <div className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">Guruh kanali</p>
                    <p className="text-xs text-gray-400">Alohida kanal, faqat maktab xodimlari yoza oladi</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleGroupChannel(courseId, group.id)}
                    className={`relative inline-block h-6 w-11 shrink-0 rounded-full p-0 transition-colors ${
                      group.groupChannelEnabled ? 'bg-indigo-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      group.groupChannelEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Guruh kuratorlari</h3>
                <select
                  value=""
                  onChange={(e) => handlePickCurator(e.target.value)}
                  className="mb-3 w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
                >
                  <option value="">Kurator tanlang...</option>
                  {curators.filter((c) => !group.curatorIds.includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {group.curatorIds.length === 0 ? (
                  <p className="text-xs text-gray-400">Hozircha kurator tayinlanmagan</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {group.curatorIds.map((curatorId) => {
                      const curator = curators.find((c) => c.id === curatorId);
                      if (!curator) return null;
                      return (
                        <div key={curatorId} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">{curator.name}</p>
                          <button
                            type="button"
                            onClick={() => handleRemoveCurator(curatorId)}
                            className="shrink-0 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label="Kuratorni olib tashlash"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-5">
                <h3 className="mb-4 text-base font-bold text-gray-800">Amallar</h3>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 size={16} /> Guruhni o'chirish
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
          >
            Guruhlarga qaytish
          </button>
        </div>

        <CourseSidePanel
          onBackToList={onBackToList}
          activeFullTab="groups"
          onSelectContent={onSelectContent}
          onSelectLaunch={onSelectLaunch}
          onSelectGroups={() => {}}
        />

        {addStudentModalOpen && (
          <AddStudentToGroupModal
            alreadyInGroup={group.studentIds}
            onConfirm={handleAddStudents}
            onClose={() => setAddStudentModalOpen(false)}
          />
        )}

        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
          >
            <div className="w-80 rounded-3xl bg-white p-6">
              <p className="mb-1 text-sm font-semibold text-gray-800">Guruhni o'chirish</p>
              <p className="mb-5 text-sm text-gray-400">
                "{group.name}" guruhi o'chiriladi. Chat, kanal va a'zolik ma'lumotlari ham yo'qoladi.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Bekor qilish
                </button>
                <button
                  onClick={handleConfirmDeleteGroup}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Holat A: guruhlar ro'yxati ────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 p-6 sm:flex-row">
      <div className="min-w-0 flex-1">
        <Breadcrumb
          items={[
            { label: 'Kurslar', onClick: onBackToList },
            { label: course.title, onClick: onSelectContent },
            { label: 'Guruhlar' },
          ]}
        />

        <div className="mb-4 rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Guruhlarni boshqarish</h2>
          <p className="mb-4 text-sm text-gray-400">
            O'quvchilarni ajratish orqali o'quv jarayonini soddalashtirish
          </p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCreateGroup}
              className="flex items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Guruh yaratish
            </button>
            <p className="text-xs text-gray-400">{course.groups.length} ta guruh</p>
          </div>
        </div>

        {course.groups.length === 0 ? (
          <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
            <Inbox size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hali guruh yo'q</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {course.groups.map((g) => {
              const curatorNames = g.curatorIds
                .map((id) => curators.find((c) => c.id === id)?.name)
                .filter((n): n is string => !!n);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); setInnerTab('students'); }}
                  className="w-full rounded-2xl bg-white p-4 text-left transition-colors hover:bg-indigo-50/30"
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={13} />
                    {g.studentIds.length} ta ishtirokchi
                  </div>
                  <p className="mb-1.5 text-base font-bold text-gray-800">{g.name}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                    <span>Cheklovsiz</span>
                    <span>•</span>
                    <span>
                      {curatorNames.length === 0
                        ? 'Kuratorsiz'
                        : curatorNames.length === 1
                          ? curatorNames[0]
                          : `${curatorNames[0]} +${curatorNames.length - 1}`}
                    </span>
                    {g.groupChatEnabled && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-500">Chat</span>
                    )}
                    {g.groupChannelEnabled && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-500">Kanal</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CourseSidePanel
        onBackToList={onBackToList}
        activeFullTab="groups"
        onSelectContent={onSelectContent}
        onSelectLaunch={onSelectLaunch}
        onSelectGroups={() => {}}
      />
    </div>
  );
}
```

- [ ] **Step 3: Build orqali tekshirish**

Run: `npm run build --workspace=apps/frontend`
Expected: `tsc -b && vite build` xatosiz o'tadi, chunki endi `CourseLaunchPage` va `CourseGroupsPage` ikkalasi ham mavjud (Task 4dagi importlar to'liq bajariladi).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/course/CourseGroupsPage.tsx apps/frontend/src/components/course/AddStudentToGroupModal.tsx
git commit -m "feat(courses): add CourseGroupsPage with student/settings inner tabs

- group list with empty state, participant/curator/chat-channel badges
- group detail: Students tab (add via modal, remove, empty state)
- group detail: Settings tab (rename, chat/channel toggles, curator assign/remove, delete with confirm)
- AddStudentToGroupModal reuses MOCK_STUDENTS with search + checkbox selection
- build now fully green (CoursesPage imports resolved)"
```

---

### Task 7: Manual end-to-end tekshiruv va build tozaligi

**Files:**
- Verify only (no new files).

**Interfaces:**
- Consumes: barcha oldingi tasklar natijasi.

- [ ] **Step 1: To'liq build**

Run: `npm run build --workspace=apps/frontend`
Expected: `tsc -b` va `vite build` ikkalasi ham xatosiz, chiqishda faqat mavjud "chunk size > 500kB" ogohlantirishi (bu oldindan mavjud, ushbu funksiya bilan bog'liq emas).

- [ ] **Step 2: Dev serverni ishga tushirish va qo'lda tekshirish**

Run: `npm run dev --workspace=apps/frontend` (yoki mavjud dev server ishlatiladi).

Brauzerda tekshirish ro'yxati:
1. `/lessons` ga o'ting, biror kursni oching (yoki yangi kurs yarating).
2. Kurs "Kontent" sahifasida o'ng paneldagi "Ishga tushirish va tariflar" ustiga bosing → `CourseLaunchPage` ochilishi kerak, sidebar'da shu tab active (indigo) bo'lishi kerak.
3. "Запуск №1" nomi avtomatik ko'rinishi, toggle bosilganda "Faol"/"Qoralama" badge almashishi va rang o'zgarishi kerak.
4. "Tarif yaratish" tugmasini bosing → modal ochiladi, guruh tanlash "Guruhsiz" ko'rsatadi (chunki hali guruh yo'q).
5. Nomi va narxni to'ldirib "Tarif yaratish" bosing → modal yopiladi, tarif ro'yxatda ko'rinadi.
6. Sidebar'dan "Guruhlar" ga o'ting → `CourseGroupsPage`, bo'sh holat ko'rinishi kerak.
7. "Guruh yaratish" bosing → avtomatik "Guruh 1" yaratilib, ichki ko'rinishga o'tadi ("O'quvchilar" tab active).
8. "O'quvchi qo'shish" bosing → modal ochiladi, `MOCK_STUDENTS` ro'yxati ko'rinadi, bir nechtasini belgilab "Qo'shish" bosing → ro'yxatga qo'shiladi.
9. "Sozlamalar" ichki tab'ga o'ting → guruh nomini o'zgartiring, chat/kanal toggle'larini yoqing, kurator tanlang (dropdown'da joriy admin ismi ko'rinishi kerak).
10. "Tariflar" ga qaytib, yangi tarif yarating va bu safar yangi yaratilgan guruhni tanlang — muvaffaqiyatli saqlanishi kerak.
11. "Guruhni o'chirish" bosing → tasdiqlash modali chiqadi, tasdiqlansa guruh ro'yxatdan yo'qoladi.
12. Sahifani yangilang (F5) — barcha ma'lumot yo'qolishi kutiladi (chunki state faqat runtime'da, persist qilinmagan) — bu regressiya emas, mavjud kurslar/darslar xatti-harakati bilan bir xil.

- [ ] **Step 3: Muammo topilsa hujjatlashtirish**

Agar biror qadam kutilganidek ishlamasa, aniq qaysi qadam va nima kuzatilgani progress ledger yoki fix-report faylida yozib qo'yiladi (final review shuni ko'rib chiqadi).

- [ ] **Step 4: Yakuniy commit (agar Step 2/3 davomida tuzatish kiritilgan bo'lsa)**

```bash
git add -A
git commit -m "fix(courses): address manual QA findings for launch/groups pages"
```

Agar tuzatish kerak bo'lmasa, bu qadam o'tkazib yuboriladi (tasklar ro'yxati "hammasi PASS" bilan yopiladi).
