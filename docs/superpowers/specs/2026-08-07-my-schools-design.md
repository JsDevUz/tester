# "Mening maktablarim" (My Schools) Design

## Goal

Give a student who belongs to one or more schools a school-selection step
right after login, before they reach their course list. The student picks
a school from a card list (school image, name, student count, description)
and is taken into that school's "Mening kurslarim" — the existing course
grid, now scoped to the chosen school instead of showing every school's
courses merged together.

Teachers get a matching addition on their side: an image/logo upload for
their school, added to the existing "Maktab sozlamalari" page.

Web ships first and is verified end-to-end; the mobile app mirrors the
same behavior afterward as a separate follow-up pass.

## Current state (why this is mostly plumbing, not new architecture)

Multi-school membership already exists and is already handled correctly
by the data layer — it just isn't surfaced as a concept to students:

- `schools` / `schoolMembers` / `groupEnrollments` tables already model a
  student belonging to multiple schools (`apps/backend/src/db/schema.ts:378-421`).
- `GroupsService.getMyCourses(studentId)` (`apps/backend/src/groups/groups.service.ts:312`)
  already walks every school membership the student has and flattens all
  enrolled courses into one list — there is no school grouping in the
  response today, and the frontend never asks for one.
- Teachers already have a full school admin surface — `schools.controller.ts`,
  `schools.service.ts`, `SchoolSettingsPage.tsx`, `schoolStore.ts`,
  `api/school.ts` — but `schools` has no image field, and none of this is
  reachable by students.
- The student shell (`apps/frontend/src/components/student/StudentShell.tsx`)
  has a fixed `NAV_ITEMS` array and always shows all five items; there's no
  concept of a "restricted" nav state.
- Student course cards already have the exact visual language this new
  list should reuse: `apps/frontend/src/pages/MyCoursesPage.tsx:177-241`,
  class `student-course-card`, top-right icon tile, stats row, no changes
  needed to that styling — the schools list borrows it.

## Backend

**Schema migration** — add one nullable column:

```ts
export const schools = pgTable('schools', {
  ...
  imageUrl: text('image_url'),
});
```

**`UpdateSchoolDto`** (`schools.controller.ts`) and
`SchoolsService.updateSchool()` (`schools.service.ts:85`) gain an optional
`imageUrl?: string` field, following the exact pattern `name`/`description`
already use — no new upload endpoint needed, this reuses the existing
generic media upload (`StorageService` / `apiUploadMedia`) the same way
`ProfileSheet`/`EditProfileSection` upload avatars today (upload to storage
first, then `PATCH /school` with the resulting URL).

**`ApiSchool`** (`apps/frontend/src/api/school.ts`) gains `imageUrl: string
| null`.

**New student-facing endpoint** `GET /my/schools`, sibling to the existing
`GET /my/courses` in `groups.controller.ts` / `groups.service.ts`:

```ts
async getMySchools(studentId: string): Promise<Array<{
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  studentCount: number;
  courseCount: number;
}>>
```

Implementation: load the student's `schoolMembers` rows (same query
`getMyCourses` already runs), then for each distinct `schoolId`, load the
`schools` row plus a count of `schoolMembers` with `role = 'student'` in
that school, plus a count of distinct courses reachable through that
school's group enrollments (same enrollment-walking logic `getMyCourses`
already does, just grouped by school instead of flattened).

**`GET /my/courses` filtering** — add an optional `schoolId` query param.
When present, `getMyCourses` restricts the membership list to that one
school before resolving enrollments (one extra `where` clause on the
existing membership query — no new joins).

## Web frontend

### Routing

- `/schools` — new `SchoolsListPage.tsx`. Fetches `GET /my/schools` via a
  new `apiGetMySchools()` in `api/groups.ts` (or `api/school.ts` — same
  file `ApiSchool`-adjacent types already live in). Renders school cards.
- `/schools/:schoolId/courses` — the existing `MyCoursesPage` content,
  now reading `schoolId` from the route and passing it through to
  `apiGetMyCourses({ schoolId })`.
- Post-login landing changes: today `HomeRoute` (`App.tsx:41`) sends a
  student straight to `StudentHistoryPage` at `/`. It now sends them to
  `/schools` instead — first login (and every fresh session) starts at
  school selection. Deep links / bookmarks into a specific school's
  courses keep working since the school id is in the URL; `/` remains a
  valid route reachable via the nav's "Amaliyotlar tarixi" item once a
  school context exists.

### State

New `studentSchoolStore.ts` (Zustand, mirrors the shape of the existing
teacher-side `schoolStore.ts`):

```ts
interface StudentSchoolState {
  schools: ApiMySchool[];
  currentSchoolId: string | null;
  loaded: boolean;
  loadSchools: () => Promise<void>;
  selectSchool: (id: string) => void;
}
```

`currentSchoolId` is the source of truth for "which school's courses is
the student currently looking at"; the URL param on `/schools/:schoolId/courses`
initializes/syncs it on load (so a hard refresh or shared link works
without re-selecting).

**`StudentShell` restricted-nav mode**

`StudentShell` accepts a `restrictedNav?: boolean` prop. When true (set by
`SchoolsListPage`), the sidebar/bottom-nav render only two entries:
"Mening maktablarim" (active/highlighted, points at `/schools`) and
"Sozlamalar" (opens the existing `SettingsModal`, unchanged). All other
`NAV_ITEMS` are omitted. `/schools/:schoolId/courses` and every other
existing route render `StudentShell` exactly as today (`restrictedNav`
omitted/false) — full `NAV_ITEMS`, "Mening kurslarim" now navigates to
`/schools/${currentSchoolId}/courses` instead of `/my-courses`.

**School card** (`SchoolsListPage.tsx`), reusing `student-course-card`
styling from `MyCoursesPage.tsx`:

- Top-left: rounded image from `school.imageUrl`, falling back to a
  generic icon tile (same fallback treatment `BookOpen` gets today at
  `MyCoursesPage.tsx:210-212`) when null.
- Top-right of the image: school name (bold, matches course-title
  weight).
- Below name: student count, icon + number (same `UserRound` treatment as
  course cards' student count today).
- Below that: school description (`line-clamp`, muted text).
- Click → `selectSchool(school.id)` then `navigate('/schools/${school.id}/courses')`.

If the student has zero school memberships, show the existing "hech qanday
kursga qo'shilmagansiz"-style empty state, reworded for schools.

**`SchoolSettingsPage.tsx` image upload**

Inside the existing "Maktab nomi va tavsifi" card (`SchoolSettingsPage.tsx:32-53`),
above the name input: an avatar-style clickable image (current
`school.imageUrl` or placeholder), same interaction as
`EditProfileSection`'s avatar — `launchImageLibrary`-equivalent web file
picker → `apiUploadMedia(file, 'school-logos')` → `apiUpdateSchool({
imageUrl: uploaded.url })` → `useSchoolStore` updates `imageUrl`. This
needs the store's `renameSchool`/`setSchoolDescription` pattern extended
with a parallel `setSchoolImage(url: string)` action.

## Mobile (follow-up, not part of this pass)

Once web is verified, mirror 1:1: `SchoolsScreen.tsx` card list using the
same `Ui.tsx` primitives `CoursesScreen` already uses, a new
`schoolStore.ts` alongside `authStore.ts`, and a gate in
`RootNavigator.tsx` that routes to `SchoolsScreen` before `TabsWithProfile`
when the student has schools loaded. `CourseScreen`/`CoursesScreen` gain a
`schoolId` param the same way the web `MyCoursesPage` does. This is scoped
as its own implementation pass and spec-reviewed separately if it turns out
to need mobile-specific decisions (e.g. how "back to schools" fits the
existing tab/stack navigation).

## Out of scope for this spec

- Switching schools without going back through `/schools` (no in-page
  school switcher inside the course view).
- School creation/deletion flows (already exist, unchanged).
- Any change to how a student *joins* a school (invite flow unchanged).
- Mobile implementation itself (see above — separate pass).
