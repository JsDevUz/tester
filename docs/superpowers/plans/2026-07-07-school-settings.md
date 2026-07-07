# Mening Maktabim (School Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/school` `ComingSoonPage` placeholder with a working "Mening Maktabim" section: school name/description editing, a mock staff roster with role-based add/remove, and an invitation-link page — all frontend-only, mock data.

**Architecture:** A new `schoolStore.ts` (zustand) holds school name/description, a mock staff array, and an invite token, following the exact same immutable-update pattern already used by `courseStore.ts`. Three new route-backed pages (`SchoolSettingsPage`, `SchoolStaffPage`, `SchoolInvitePage`) share a route-aware `SchoolSidePanel` for navigation between them (unlike `CourseSidePanel`, which is driven by local view-state, this one reads `useLocation()`/`useNavigate()` directly since each section now has its own URL). `AppShell`'s existing flyout-menu mechanism (already built for "O'quvchilar") is extended to the "Mening Maktabim" section by giving it `subItems`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, zustand, react-router-dom, lucide-react icons.

## Global Constraints

- Frontend-only — no backend/API calls anywhere in this feature.
- No school domain settings (the Exode reference has a domain card; explicitly excluded).
- No granular permission checkboxes — staff get one of exactly 3 roles: `admin`, `teacher`, `curator`.
- "Ro'yxatdan o'tish" page shows ONLY an invitation link (copy + regenerate-with-confirm), not toggles for registration policy.
- All new UI matches the existing design system: `rounded-2xl`, `bg-white` cards, indigo (`bg-indigo-500`/`text-indigo-600`) primary actions, green (`bg-green-500`) for "add" actions, red (`bg-red-50 text-red-600` / `bg-red-500`) for destructive actions.
- New files: `apps/frontend/src/stores/schoolStore.ts`, `apps/frontend/src/components/school/SchoolSidePanel.tsx`, `apps/frontend/src/components/school/AddStaffModal.tsx`, `apps/frontend/src/pages/SchoolSettingsPage.tsx`, `apps/frontend/src/pages/SchoolStaffPage.tsx`, `apps/frontend/src/pages/SchoolInvitePage.tsx`.
- The existing `ConfirmDeleteModal` (`apps/frontend/src/components/course/ConfirmDeleteModal.tsx`) is reused for the invite-regenerate confirmation — it gets an optional `confirmLabel` prop (default `"O'chirish"`, so every existing caller is unaffected).
- Build must pass cleanly: `npm run build --workspace=apps/frontend` (`tsc -b && vite build`), zero errors, for every task.

---

### Task 1: School store — model + actions

**Files:**
- Create: `apps/frontend/src/stores/schoolStore.ts`

**Interfaces:**
- Produces: `SchoolStaffRole` (`'admin' | 'teacher' | 'curator'`), `SchoolStaff` (`{ id: string; name: string; email: string; role: SchoolStaffRole }`), `useSchoolStore` zustand hook exposing `{ name: string; description: string; staff: SchoolStaff[]; inviteToken: string; renameSchool(name: string): void; setSchoolDescription(description: string): void; addStaff(data: Omit<SchoolStaff, 'id'>): void; removeStaff(staffId: string): void; regenerateInviteToken(): void }`.
- Consumed by: Tasks 4, 5, 6 (the three pages).

- [ ] **Step 1: Write the store**

Create `apps/frontend/src/stores/schoolStore.ts`:

```typescript
import { create } from 'zustand';
import { useAuthStore } from './authStore';

export type SchoolStaffRole = 'admin' | 'teacher' | 'curator';

export interface SchoolStaff {
  id: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  staff: SchoolStaff[];
  inviteToken: string;

  renameSchool: (name: string) => void;
  setSchoolDescription: (description: string) => void;
  addStaff: (data: Omit<SchoolStaff, 'id'>) => void;
  removeStaff: (staffId: string) => void;
  regenerateInviteToken: () => void;
}

function newId(): string {
  return crypto.randomUUID();
}

function buildInitialStaff(): SchoolStaff[] {
  const currentAdminName = useAuthStore.getState().admin?.name ?? 'Administrator';
  return [
    { id: newId(), name: currentAdminName, email: 'admin@maktab.uz', role: 'admin' },
    { id: newId(), name: 'Dilshod Rahimov', email: 'dilshod@maktab.uz', role: 'teacher' },
    { id: newId(), name: 'Zarina Yoldosheva', email: 'zarina@maktab.uz', role: 'curator' },
  ];
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  name: 'Mening maktabim',
  description: '',
  staff: buildInitialStaff(),
  inviteToken: newId(),

  renameSchool: (name) => set({ name }),
  setSchoolDescription: (description) => set({ description }),
  addStaff: (data) => {
    const staffMember: SchoolStaff = { ...data, id: newId() };
    set({ staff: [...get().staff, staffMember] });
  },
  removeStaff: (staffId) => {
    set({ staff: get().staff.filter((s) => s.id !== staffId) });
  },
  regenerateInviteToken: () => set({ inviteToken: newId() }),
}));
```

Note: `useAuthStore.getState()` reads the zustand store's current state directly
(not the React hook form) — this is safe to call at module-init time, unlike
calling `useAuthStore()` outside a component. If auth hasn't loaded yet when
this module initializes, it falls back to `'Administrator'`.

- [ ] **Step 2: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors (this file isn't imported anywhere yet, so it can't break anything, but `tsc` must accept its own syntax).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/stores/schoolStore.ts
git commit -m "feat(school): add schoolStore with name/description/staff/invite model

- SchoolStaffRole: 'admin' | 'teacher' | 'curator'
- initial mock staff: 1 admin (placeholder name, wired to real admin name in Task 4) + 2 sample staff
- renameSchool/setSchoolDescription/addStaff/removeStaff/regenerateInviteToken
- mirrors courseStore's create/set/get zustand pattern"
```

---

### Task 2: ConfirmDeleteModal — add optional confirmLabel

**Files:**
- Modify: `apps/frontend/src/components/course/ConfirmDeleteModal.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConfirmDeleteModalProps` gains `confirmLabel?: string` (default `"O'chirish"` when omitted). Existing callers (`CourseSettingsPage.tsx`, `CourseGroupsPage.tsx`, `CourseContentPage.tsx`, `LessonEditorView.tsx`) are unaffected since they don't pass this prop. Task 6 will pass `confirmLabel="Yangilash"`.

- [ ] **Step 1: Add the optional prop**

Replace the full contents of `apps/frontend/src/components/course/ConfirmDeleteModal.tsx`:

```typescript
interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ title, description, confirmLabel, onConfirm, onClose }: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-80 rounded-3xl bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-gray-800">{title}</p>
        <p className="mb-5 text-sm text-gray-400">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Bekor qilish
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
          >
            {confirmLabel ?? "O'chirish"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors. Confirm none of the existing 4 call sites broke by checking they still compile (they will, since the new prop is optional).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/course/ConfirmDeleteModal.tsx
git commit -m "feat(courses): add optional confirmLabel prop to ConfirmDeleteModal

Defaults to 'O'chirish' so all 4 existing callers (course/group/module/
lesson delete flows) are unaffected. Lets non-delete destructive actions
(e.g. regenerating an invite link) reuse this modal with an accurate
button label."
```

---

### Task 3: AppShell — add subItems to the "Mening Maktabim" section

**Files:**
- Modify: `apps/frontend/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: nothing new (pure config change to the existing `SECTIONS` array).
- Produces: three new routes the flyout menu will link to — `/school/settings`, `/school/staff`, `/school/invite` — which Task 4/5/6's pages and Task 7's route wiring must match exactly.

- [ ] **Step 1: Add subItems to the school section**

In `apps/frontend/src/components/AppShell.tsx`, add three icon imports. Replace:

```typescript
import {
  BookOpen,
  CreditCard,
  ClipboardList,
  Users,
  School,
  Settings,
  FileText,
  Radio,
  UsersRound,
  Clock3,
  ShieldCheck,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
```

With:

```typescript
import {
  BookOpen,
  CreditCard,
  ClipboardList,
  Users,
  School,
  Settings,
  FileText,
  Radio,
  UsersRound,
  Clock3,
  ShieldCheck,
  LogOut,
  X,
  SlidersHorizontal,
  Link2,
  type LucideIcon,
} from "lucide-react";
```

Then replace the school entry in `SECTIONS`:

```typescript
  { key: "school", label: "Mening Maktabim", icon: School, path: "/school" },
```

With:

```typescript
  {
    key: "school",
    label: "Mening Maktabim",
    icon: School,
    path: "/school/settings",
    subItems: [
      { label: "Maktab sozlamalari", path: "/school/settings", icon: SlidersHorizontal },
      { label: "Mening xodimlarim", path: "/school/staff", icon: UsersRound },
      { label: "Ro'yxatdan o'tish", path: "/school/invite", icon: Link2 },
    ],
  },
```

- [ ] **Step 2: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors. The flyout mechanism (`showFlyout`, `isRouteMatch`, mobile bottom sheet) requires no other changes — it's driven entirely by the `subItems` array and `location.pathname`, both of which now apply correctly to `/school/*`.

- [ ] **Step 3: Manual check (partial — pages don't exist yet)**

The sidebar will now show a 3-item flyout for "Mening Maktabim" on hover/click, but clicking any of its 3 items navigates to a route that doesn't exist yet (Task 7 wires the routes; Tasks 4-6 create the page components). This is expected — do not try to make navigation fully work in this task.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/AppShell.tsx
git commit -m "feat(school): give 'Mening Maktabim' sidebar section 3 sub-items

- Maktab sozlamalari (/school/settings), Mening xodimlarim (/school/staff),
  Ro'yxatdan o'tish (/school/invite)
- reuses the existing flyout-menu mechanism built for 'O'quvchilar' — no
  changes to isRouteMatch, showFlyout, or the mobile bottom sheet needed
- routes not wired yet (Task 7); pages not created yet (Tasks 4-6)"
```

---

### Task 4: SchoolSidePanel + SchoolSettingsPage

**Files:**
- Create: `apps/frontend/src/components/school/SchoolSidePanel.tsx`
- Create: `apps/frontend/src/pages/SchoolSettingsPage.tsx`

**Interfaces:**
- Consumes: `useSchoolStore` (Task 1: `name`, `description`, `renameSchool`, `setSchoolDescription`), `useAuthStore` (existing, `admin: Admin | null` with `admin.name: string`).
- Produces: `export function SchoolSidePanel(): JSX.Element` (no props — fully route-driven via `useLocation`/`useNavigate`), consumed by Tasks 5 and 6 as well. `export function SchoolSettingsPage(): JSX.Element`, consumed by Task 7's route wiring.

- [ ] **Step 1: Create the shared side panel**

Create `apps/frontend/src/components/school/SchoolSidePanel.tsx`:

```typescript
import { useLocation, useNavigate } from 'react-router-dom';
import { SlidersHorizontal, UsersRound, Link2, type LucideIcon } from 'lucide-react';

interface SchoolTab {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const TABS: SchoolTab[] = [
  { path: '/school/settings', label: 'Maktab sozlamalari', description: "Ma'lumot va moslashtirish", icon: SlidersHorizontal },
  { path: '/school/staff', label: 'Mening xodimlarim', description: 'Xodimlar va rollar', icon: UsersRound },
  { path: '/school/invite', label: "Ro'yxatdan o'tish", description: 'Taklif havolasi', icon: Link2 },
];

export function SchoolSidePanel() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
      <div className="rounded-2xl bg-white p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <div
              key={tab.path}
              role="button"
              tabIndex={0}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm cursor-pointer ${
                active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} className={`shrink-0 ${active ? 'text-indigo-500' : 'text-gray-400'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold ${active ? 'text-indigo-600' : 'text-gray-700'}`}>
                  {tab.label}
                </p>
                <p className="truncate text-xs text-gray-300">{tab.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the settings page**

Create `apps/frontend/src/pages/SchoolSettingsPage.tsx`:

```typescript
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { useSchoolStore } from '../stores/schoolStore';

const NAME_MAX = 50;
const DESCRIPTION_MAX = 200;

export function SchoolSettingsPage() {
  const { name, description, renameSchool, setSchoolDescription } = useSchoolStore();

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-800">Maktab sozlamalari</h1>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Maktab nomi va tavsifi</h2>
            <p className="mb-4 text-sm text-gray-400">Bu yerda maktab nomi va tavsifini tahrirlashingiz mumkin</p>

            <p className="mb-1.5 text-sm text-gray-500">Maktab nomi</p>
            <input
              value={name}
              onChange={(e) => renameSchool(e.target.value.slice(0, NAME_MAX))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mb-4 mt-1 text-right text-xs text-gray-300">{name.length} / {NAME_MAX}</p>

            <p className="mb-1.5 text-sm text-gray-500">Tavsif</p>
            <textarea
              value={description}
              onChange={(e) => setSchoolDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="Maktabingiz haqida qisqacha ma'lumot"
              rows={3}
              className="w-full resize-none rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
            <p className="mt-1 text-right text-xs text-gray-300">{description.length} / {DESCRIPTION_MAX}</p>
          </div>
        </div>

        <SchoolSidePanel />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/school/SchoolSidePanel.tsx apps/frontend/src/pages/SchoolSettingsPage.tsx
git commit -m "feat(school): add SchoolSidePanel and SchoolSettingsPage

- SchoolSidePanel: route-aware tab list (useLocation/useNavigate), no
  local view-state unlike CourseSidePanel — each school section is a
  real URL
- SchoolSettingsPage: name (max 50) + description (max 200) editing,
  no domain card (explicitly out of scope)
- not yet reachable (Task 7 wires the route)"
```

---

### Task 5: SchoolStaffPage + AddStaffModal

**Files:**
- Create: `apps/frontend/src/components/school/AddStaffModal.tsx`
- Create: `apps/frontend/src/pages/SchoolStaffPage.tsx`

**Interfaces:**
- Consumes: `useSchoolStore` (Task 1: `staff`, `addStaff`, `removeStaff`), `SchoolStaffRole`/`SchoolStaff` types (Task 1), `SchoolSidePanel` (Task 4, no props).
- Produces: `export function AddStaffModal(props: { onConfirm: (data: { name: string; email: string; role: SchoolStaffRole }) => void; onClose: () => void }): JSX.Element`. `export function SchoolStaffPage(): JSX.Element`, consumed by Task 7.

- [ ] **Step 1: Create the add-staff modal**

Create `apps/frontend/src/components/school/AddStaffModal.tsx`:

```typescript
import { useState } from 'react';
import { X } from 'lucide-react';
import type { SchoolStaffRole } from '../../stores/schoolStore';

interface AddStaffModalProps {
  onConfirm: (data: { name: string; email: string; role: SchoolStaffRole }) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: SchoolStaffRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'teacher', label: "O'qituvchi" },
  { value: 'curator', label: 'Kurator' },
];

export function AddStaffModal({ onConfirm, onClose }: AddStaffModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SchoolStaffRole>('teacher');

  const canSubmit = name.trim().length > 0 && email.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm({ name: name.trim(), email: email.trim(), role });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-sm sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">Xodim qo'shish</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Ism</p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Xodim ismi"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@maktab.uz"
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-gray-500">Rol</p>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as SchoolStaffRole)}
              className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            Qo'shish
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the staff page**

Create `apps/frontend/src/pages/SchoolStaffPage.tsx`:

```typescript
import { useState } from 'react';
import { Inbox, Plus, X } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { AddStaffModal } from '../components/school/AddStaffModal';
import { useSchoolStore, type SchoolStaffRole } from '../stores/schoolStore';

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

const ROLE_BADGE: Record<SchoolStaffRole, { label: string; className: string }> = {
  admin: { label: 'Administrator', className: 'bg-indigo-100 text-indigo-600' },
  teacher: { label: "O'qituvchi", className: 'bg-teal-100 text-teal-600' },
  curator: { label: 'Kurator', className: 'bg-amber-100 text-amber-600' },
};

export function SchoolStaffPage() {
  const { staff, addStaff, removeStaff } = useSchoolStore();
  const [modalOpen, setModalOpen] = useState(false);

  function handleAddStaff(data: { name: string; email: string; role: SchoolStaffRole }) {
    addStaff(data);
    setModalOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold text-gray-800">Mening xodimlarim</h1>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
            >
              <Plus size={16} /> Xodim qo'shish
            </button>
          </div>

          {staff.length === 0 ? (
            <div className="rounded-2xl bg-white py-16 text-center text-gray-300">
              <Inbox size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Hali xodim yo'q</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {staff.map((s) => {
                const badge = ROLE_BADGE[s.role];
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${paletteFor(s.id)}`}>
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{s.name}</p>
                      <p className="truncate text-xs text-gray-400">{s.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStaff(s.id)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Xodimni olib tashlash"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <SchoolSidePanel />
      </div>

      {modalOpen && (
        <AddStaffModal onConfirm={handleAddStaff} onClose={() => setModalOpen(false)} />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 3: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/school/AddStaffModal.tsx apps/frontend/src/pages/SchoolStaffPage.tsx
git commit -m "feat(school): add SchoolStaffPage with role-based staff roster

- staff cards: avatar (hash-based palette), name, email, role badge
  (Administrator/indigo, O'qituvchi/teal, Kurator/amber), remove button
- AddStaffModal: name + email (required) + role select (default O'qituvchi)
- empty state for staff.length === 0 (rare in practice — seeded with 3)
- not yet reachable (Task 7 wires the route)"
```

---

### Task 6: SchoolInvitePage

**Files:**
- Create: `apps/frontend/src/pages/SchoolInvitePage.tsx`

**Interfaces:**
- Consumes: `useSchoolStore` (Task 1: `inviteToken`, `regenerateInviteToken`), `SchoolSidePanel` (Task 4), `ConfirmDeleteModal` (Task 2, with the new `confirmLabel` prop).
- Produces: `export function SchoolInvitePage(): JSX.Element`, consumed by Task 7.

- [ ] **Step 1: Create the invite page**

Create `apps/frontend/src/pages/SchoolInvitePage.tsx`:

```typescript
import { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { SchoolSidePanel } from '../components/school/SchoolSidePanel';
import { ConfirmDeleteModal } from '../components/course/ConfirmDeleteModal';
import { useSchoolStore } from '../stores/schoolStore';

export function SchoolInvitePage() {
  const { inviteToken, regenerateInviteToken } = useSchoolStore();
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const inviteLink = `${window.location.origin}/join/${inviteToken}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirmRegenerate() {
    regenerateInviteToken();
    setConfirmRegenerate(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-3 p-6 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-lg font-bold text-gray-800">Ro'yxatdan o'tish</h1>
          <p className="mb-4 text-sm text-gray-400">
            Ushbu havola orqali o'quvchilar maktabingizga ro'yxatdan o'tishlari mumkin
          </p>

          <div className="mb-4 rounded-2xl bg-white p-5">
            <p className="mb-1.5 text-sm text-gray-500">Taklif havolasi</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="w-full min-w-0 flex-1 rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Nusxalandi!' : 'Nusxalash'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-gray-800">Amallar</h2>
            <button
              type="button"
              onClick={() => setConfirmRegenerate(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
            >
              <RotateCcw size={16} /> Havolani yangilash
            </button>
          </div>
        </div>

        <SchoolSidePanel />
      </div>

      {confirmRegenerate && (
        <ConfirmDeleteModal
          title="Havolani yangilash"
          description="Eski havola ishlamay qoladi. O'quvchilar faqat yangi havola orqali ro'yxatdan o'tishlari mumkin bo'ladi."
          confirmLabel="Yangilash"
          onConfirm={handleConfirmRegenerate}
          onClose={() => setConfirmRegenerate(false)}
        />
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: passes with zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/SchoolInvitePage.tsx
git commit -m "feat(school): add SchoolInvitePage with copyable invite link

- readonly input showing {origin}/join/{inviteToken}, copy button flips
  to 'Nusxalandi!' for 2s via setTimeout
- 'Havolani yangilash' button reuses ConfirmDeleteModal with
  confirmLabel='Yangilash' (Task 2), regenerates the token on confirm
- not yet reachable (Task 7 wires the route)"
```

---

### Task 7: Wire the three routes into App.tsx

**Files:**
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `SchoolSettingsPage` (Task 4), `SchoolStaffPage` (Task 5), `SchoolInvitePage` (Task 6) — each imported and rendered with no props (all three read from `useSchoolStore`/`useAuthStore` directly, no parent-supplied state).

- [ ] **Step 1: Replace the placeholder route with three real ones**

In `apps/frontend/src/App.tsx`, add three imports. Replace:

```typescript
import { StudentsPage } from './pages/StudentsPage';
import { AllUsersPage } from './pages/AllUsersPage';
```

With:

```typescript
import { StudentsPage } from './pages/StudentsPage';
import { AllUsersPage } from './pages/AllUsersPage';
import { SchoolSettingsPage } from './pages/SchoolSettingsPage';
import { SchoolStaffPage } from './pages/SchoolStaffPage';
import { SchoolInvitePage } from './pages/SchoolInvitePage';
```

Then replace this line:

```typescript
  { path: '/school', element: <PrivateRoute><ComingSoonPage title="Mening Maktabim" /></PrivateRoute> },
```

With:

```typescript
  { path: '/school', element: <Navigate to="/school/settings" replace /> },
  { path: '/school/settings', element: <PrivateRoute><SchoolSettingsPage /></PrivateRoute> },
  { path: '/school/staff', element: <PrivateRoute><SchoolStaffPage /></PrivateRoute> },
  { path: '/school/invite', element: <PrivateRoute><SchoolInvitePage /></PrivateRoute> },
```

- [ ] **Step 2: Build verification**

Run: `npm run build --workspace=apps/frontend`
Expected: `tsc -b && vite build` completes with zero errors — this is the final task, so the whole feature is now reachable end-to-end.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/App.tsx
git commit -m "feat(school): wire /school/settings, /school/staff, /school/invite routes

- old /school now redirects to /school/settings (preserves old links)
- ComingSoonPage import for 'Mening Maktabim' no longer used here (still
  used by /payments and /students/pending, so the import itself stays)
- feature is now fully reachable via sidebar or direct URL"
```

---

### Task 8: Manual end-to-end verification

**Files:**
- Verify only (no new files).

**Interfaces:**
- Consumes: the full feature from Tasks 1-7.

- [ ] **Step 1: Full build**

Run: `npm run build --workspace=apps/frontend`
Expected: zero errors, only the pre-existing >500kB chunk-size advisory warning (unrelated to this feature).

- [ ] **Step 2: Manual browser QA**

Start the dev server if not already running, then in the browser:

1. Navigate to `/school` — should redirect to `/school/settings`.
2. Hover/click "Mening Maktabim" in the sidebar — flyout should show 3 items: Maktab sozlamalari, Mening xodimlarim, Ro'yxatdan o'tish.
3. On Maktab sozlamalari: type into the name field — should update live, counter should reflect length, capped at 50. Same for description, capped at 200.
4. Click "Mening xodimlarim" in the flyout (or the SchoolSidePanel tab) — should navigate to `/school/staff`, tab should highlight as active.
5. Staff page should show 3 seeded staff members with role badges (Administrator/O'qituvchi/Kurator in different colors).
6. Click "Xodim qo'shish" — modal opens. Try submitting with empty name — button should stay disabled. Fill name + email, pick a role, submit — new staff card should appear immediately, modal should close.
7. Click the X button on any staff card — that staff member should disappear from the list.
8. Click "Ro'yxatdan o'tish" — should navigate to `/school/invite`, tab should highlight as active.
9. The invite link should show `{current origin}/join/{some-uuid}`. Click "Nusxalash" — button should briefly show "Nusxalandi!" with a check icon, then revert after ~2 seconds. Paste somewhere to confirm the clipboard actually got the link.
10. Click "Havolani yangilash" — confirm dialog should appear with "Yangilash" as the confirm button label (not "O'chirish"). Confirm — the invite link's token should change.
11. Refresh the page (F5) — all school data resets to the seeded defaults (expected: no persistence, matches courseStore's existing behavior).

- [ ] **Step 3: Document any findings**

If any step doesn't behave as expected, note exactly which step and what was observed — this becomes input to the final whole-branch review or a follow-up fix commit.

- [ ] **Step 4: Optional fix commit**

```bash
git add -A
git commit -m "fix(school): address manual QA findings"
```

Skip this step if no issues were found.
