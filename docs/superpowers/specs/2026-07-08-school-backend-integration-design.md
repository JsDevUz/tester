# "Mening maktabim" (School) Backend Integration — Design Spec

## Maqsad

"Mening maktabim" bo'limini (maktab sozlamalari, xodimlar boshqaruvi, talaba ro'yxatdan o'tish havolasi) — hozircha butunlay frontend-only mock (`schoolStore.ts`, sahifa yangilanganda yo'qoladi) — backend'ga ulash.

## 1. Ma'lumotlar modeli

### `schools`

```typescript
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Mening maktabim'),
  description: text('description').notNull().default(''),
  inviteToken: text('invite_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

`adminId` `unique()` — har bir o'qituvchi (`admins` yozuvi) faqat bitta maktabga ega bo'ladi (1:1). Maktab birinchi marta kerak bo'lganda avtomatik yaratiladi (Launch avtomatik-yaratish patterniga o'xshash).

### `school_members`

```typescript
export const schoolMembers = pgTable('school_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'), // 'student' | 'curator' | 'teacher_staff'
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSchoolStudent: uniqueIndex('school_members_school_id_student_id_key').on(table.schoolId, table.studentId),
}));
```

Bitta jadval ham talaba a'zoligini (invite havolasi orqali qo'shilganlar, `role: 'student'`), ham xodimlarni (`role: 'curator' | 'teacher_staff'`) qamrab oladi — `SchoolStaffPage.tsx` faqat `role !== 'student'` bo'lganlarni ko'rsatadi.

**Muhim:** `users` jadvali (talaba) o'zgarmaydi — xodim bo'lish uchun alohida login/parol kerak emas, ular `school_members.role` orqali belgilanadi, xuddi mavjud talaba hisobi ustiga "yorliq" qo'yilgandek.

### Ownership

`schools.adminId` to'g'ridan-to'g'ri, `school_members` esa `schoolId → schools.adminId` orqali (parent-chain, mavjud pattern).

## 2. Backend API

`apps/backend/src/schools/` (yangi NestJS moduli):

- `GET /school` — joriy o'qituvchining maktabini qaytaradi (`name`, `description`, `inviteToken`), yo'q bo'lsa avtomatik yaratadi.
- `PATCH /school` — `{ name?, description? }`.
- `POST /school/invite/regenerate` — yangi `inviteToken` generatsiya qiladi.
- `GET /school-invite/:token` (public, guard yo'q) — maktab nomini oldindan ko'rsatish.
- `POST /school-invite/:token` (`@Roles('student')`) — talaba maktabga `role: 'student'` bilan a'zo bo'ladi (`ConflictException` agar allaqachon a'zo bo'lsa).
- `GET /school/staff` — `role !== 'student'` bo'lgan a'zolar ro'yxati (`with: { student: true }` orqali ism/telefon).
- `GET /school/students/search?q=...` — xodim qo'shish uchun mavjud `users` (role='student') orasidan ism/telefon bo'yicha qidiruv.
- `POST /school/staff` — `{ studentId, role: 'curator' | 'teacher_staff' }` — agar `school_members` yozuvi mavjud bo'lsa, uning `role`ini yangilaydi; bo'lmasa yangi yozuv yaratadi.
- `DELETE /school/staff/:memberId`.

Barchasi `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('teacher', 'super')`, faqat `POST /school-invite/:token` (`@Roles('student')`) va `GET /school-invite/:token` (guardsiz) bundan mustasno.

## 3. Frontend

- `apps/frontend/src/api/school.ts` — yangi API wrapper.
- `schoolStore.ts` to'liq qayta yoziladi: barcha action'lar async, backend'ga ulanadi. `staff: SchoolStaff[]` endi backend'dan keladi.
- `SchoolSettingsPage.tsx` — `renameSchool`/`setSchoolDescription` async, `useEffect` orqali `loadSchool()` chaqiriladi.
- `SchoolInvitePage.tsx` — real `inviteToken`/`regenerateInviteToken`.
- `SchoolStaffPage.tsx` — `staff` backend'dan, `addStaff` endi `studentId` orqali ishlaydi.
- `AddStaffModal.tsx` — `MOCK_STUDENTS` o'rniga `GET /school/students/search` orqali real qidiruv.
- Yangi `apps/frontend/src/pages/SchoolInviteJoinPage.tsx` — `/school-invite/:token` marshruti, `JoinGroupPage.tsx`ning bir xil naqshi (preview → login-talab → tasdiqlash).

## Global cheklovlar

- `users` jadvali o'zgarmaydi — xodimlar alohida login qila olmaydi, faqat `school_members.role` orqali belgilanadi.
- `admins`/`users` jadvallariga tegilmaydi, mavjud auth oqimi o'zgarmaydi.
- Manual browser QA foydalanuvchi tomonidan bajariladi.
- Backend build/test (96 test) yashil qolishi, frontend build toza bo'lishi kerak.
