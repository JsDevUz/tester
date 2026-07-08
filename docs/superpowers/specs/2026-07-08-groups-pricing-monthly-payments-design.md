# Groups + Pricing Plans + Monthly Payment Cycle — Design Spec

## Maqsad

Kurs ichidagi Guruh (`Group`), Tarif (`Launch`/`PricingPlan`) tushunchalarini backend'ga ulash va ular ustiga oylik takroriy to'lov nazorati tizimini qurish. Bu talaba video darslarni ko'rish huquqini backend darajasida cheklashning zarur old sharti (video HLS himoyasi shu tizimga tayanadi, lekin bu bosqichda video hali qurilmaydi).

Asosiy oqim: o'qituvchi guruh yaratadi va invite havola oladi → talaba havola orqali guruhga qo'shiladi (tarifsiz holatda) → o'qituvchi talabaga tarif (`PricingPlan`) belgilaydi → shu kundan boshlab har oy belgilangan sanada avtomatik to'lov hujjati yaratiladi → o'qituvchi to'lovni qabul qilib summani kiritadi → tizim holatni (`to'landi`/`qisman`/`kutilmoqda`/`qarz`) hisoblaydi → faqat `qarz` holati yoki o'qituvchining qo'lda majburiy yopishi darslarni berkitadi.

## 1. Ma'lumotlar modeli

### `groups`

```typescript
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  groupChatEnabled: boolean('group_chat_enabled').notNull().default(false),
  groupChannelEnabled: boolean('group_channel_enabled').notNull().default(false),
  inviteToken: text('invite_token').notNull().unique(),
  paymentDay: integer('payment_day').notNull().default(1), // 1-28, oyning qaysi sanasida to'lov kutiladi
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

`paymentDay` 1-28 oralig'ida cheklanadi (29/30/31 barcha oylarda mavjud emas, shuning uchun oddiy qoidani saqlash uchun 28 bilan cheklanadi).

### `launches`

```typescript
export const launches = pgTable('launches', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

### `pricing_plans`

```typescript
export const pricingPlans = pgTable('pricing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  launchId: uuid('launch_id').notNull().references(() => launches.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  originalPrice: integer('original_price'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

`groupId` ixtiyoriy (`nullable`) — bitta guruhga bir nechta tarif biriktirilishi mumkin (masalan turli chegirma darajalari), yoki tarif hali hech qaysi guruhga bog'lanmagan bo'lishi mumkin (faqat marketing sifatida ko'rsatish uchun).

### `group_members`

```typescript
export const groupMembers = pgTable('group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'), // 'student' | 'curator'
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
});
```

Bitta `(groupId, studentId)` juftligi bo'yicha noyoblik cheklovi (`unique index`) — talaba bir guruhga faqat bitta marta a'zo bo'ladi.

`role`: `curatorIds`/`studentIds` (avvalgi frontend-only massivlar) endi shu bitta jadval orqali ifodalanadi — `role='curator'` bo'lganlar kuratorlar, `role='student'` bo'lganlar oddiy o'quvchilar.

`forcedClosed`: o'qituvchining istalgan vaqtda, avtomatik to'lov holatidan qat'iy nazar, talabani darsdan mahrum qilishi. Bu bayroq `true` bo'lsa, `assertStudentLessonAccess` har doim rad etadi.

### `monthly_payments`

```typescript
export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupMemberId: uuid('group_member_id').notNull().references(() => groupMembers.id, { onDelete: 'cascade' }),
  periodMonth: timestamp('period_month', { withTimezone: true }).notNull(), // oyning 1-kuni, masalan 2026-08-01T00:00:00Z
  expectedAmount: integer('expected_amount').notNull(),
  discountAmount: integer('discount_amount').notNull().default(0),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('pending'), // 'pending' | 'partial' | 'paid' | 'debt'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

`(groupMemberId, periodMonth)` bo'yicha noyoblik cheklovi — bir a'zo uchun bir oyda faqat bitta yozuv.

**Holat hisoblash qoidasi** (`paidAmount` yangilanganda qayta hisoblanadi):
- `paidAmount >= expectedAmount - discountAmount` → `'paid'`
- `0 < paidAmount < expectedAmount - discountAmount` → `'partial'`
- `paidAmount === 0` va yozuv joriy oyga tegishli (eng yangi) → `'pending'`
- `paidAmount === 0` (yoki `'partial'`) va undan keyingi oy uchun yangi yozuv allaqachon yaratilgan bo'lsa (ya'ni bu yozuv endi "o'tgan oy" hisoblanadi) → `'debt'` (cron job tomonidan belgilanadi, pastga qarang)

`discountAmount` faqat shu bitta oylik yozuvga tegishli — keyingi oy avtomatik yaratilganda `discountAmount: 0` bilan boshlanadi.

### Ownership

Barcha yangi jadvallarda `adminId` yo'q. Ownership zanjiri:
- `groups`/`launches` → `courses.adminId` (to'g'ridan-to'g'ri, bitta bosqich)
- `pricing_plans` → `launches.courseId → courses.adminId`
- `group_members` → `groups.courseId → courses.adminId`
- `monthly_payments` → `group_members.groupId → groups.courseId → courses.adminId`

Har biri uchun mos `assert*Ownership` helper yoziladi (mavjud `assertModuleOwnership`/`assertLessonOwnership` patterniga mos).

## 2. Kunlik Cron Job — oylik to'lov hujjatlarini yaratish

NestJS'ning `@nestjs/schedule` paketi orqali (`@Cron('0 1 * * *')` — har kuni tunda soat 01:00da) ishga tushadigan vazifa:

1. Barcha `groups`ni olib, `paymentDay === bugungi kun` bo'lganlarini filtrlaydi.
2. Har bir mos guruh uchun, `selectedPlanId IS NOT NULL` bo'lgan barcha `group_members`ni oladi.
3. Har bir a'zo uchun:
   - Agar shu oy (`periodMonth = joriy oyning 1-kuni`) uchun yozuv allaqachon mavjud bo'lsa — o'tkazib yuboriladi (idempotent, cron ikki marta ishga tushsa ham xavfsiz).
   - Aks holda: agar OLDINGI oy yozuvi mavjud va uning `status` `'pending'` yoki `'partial'` bo'lsa — o'sha yozuv `'debt'`ga o'tkaziladi.
   - Yangi yozuv yaratiladi: `expectedAmount = plan.price`, `discountAmount: 0`, `paidAmount: 0`, `status: 'pending'`.

Bu vazifa `apps/backend/src/payments/payments-cron.service.ts`da joylashadi.

## 3. Kirish huquqi qoidasi

```typescript
async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
  const membership = await findGroupMembershipForStudentInCourse(courseId, studentId);
  if (!membership || !membership.selectedPlanId) return false;
  if (membership.forcedClosed) return false;

  const latestPayment = await findLatestMonthlyPayment(membership.id);
  if (!latestPayment) return false; // hali birorta to'lov hujjati yaratilmagan
  return latestPayment.status !== 'debt';
}
```

Bu helper video/HLS bosqichida ishlatiladi (bu spec doirasidan tashqarida), lekin shu bosqichda yoziladi va `GET /my/courses` orqali talaba tomonidan "bu kursni ko'raman lekin darslar qulflangan" holatini ko'rsatish uchun ham ishlatiladi.

## 4. API

### O'qituvchi tomoni — Guruhlar (`apps/backend/src/groups/`)

- `GET /courses/:courseId/groups` — ro'yxat
- `POST /courses/:courseId/groups` — yaratish (`{ name, paymentDay }`), `inviteToken` avtomatik generatsiya qilinadi (`crypto.randomUUID()`)
- `PATCH /groups/:id` — `{ name?, groupChatEnabled?, groupChannelEnabled?, paymentDay? }`
- `DELETE /groups/:id`
- `GET /groups/:id/members` — a'zolar + har birining eng so'nggi to'lov holati
- `PATCH /groups/:id/members/:memberId` — `{ role?, selectedPlanId? }` (tarif belgilash/kurator qilish)
- `PATCH /groups/:id/members/:memberId/force-close` — `{ forcedClosed: boolean }`
- `DELETE /groups/:id/members/:memberId` — a'zolikni butunlay o'chirish

### O'qituvchi tomoni — Tariflar (`apps/backend/src/launches/`)

- `GET/POST /courses/:courseId/launches`
- `PATCH /launches/:id` — `{ name?, active? }`
- `DELETE /launches/:id`
- `POST /launches/:launchId/plans` — `{ name, description, price, originalPrice?, groupId?, startDate?, endDate? }`
- `PATCH /plans/:id`, `DELETE /plans/:id`

### O'qituvchi tomoni — To'lovlar (`apps/backend/src/payments/`)

- `GET /groups/:id/payments` — guruhdagi barcha a'zolarning oylik to'lov tarixi
- `POST /payments/:id/pay` — `{ amount: number, discount?: number }` — `paidAmount += amount`, agar `discount` berilsa `discountAmount = discount` (faqat shu yozuvga), status qayta hisoblanadi

### Talaba tomoni (`apps/backend/src/join/` yoki `groups` moduliga qo'shiladi)

- `GET /join/:token` — guruh/kurs nomini ko'rsatish (auth shart emas, faqat ma'lumot)
- `POST /join/:token` — login qilgan talaba (`JwtAuthGuard`, `@Roles('student')`) shu guruhga `role: 'student'`, `selectedPlanId: null` bilan qo'shiladi (agar allaqachon a'zo bo'lmasa — `ConflictException`)
- `GET /my/courses` — talaba tegishli barcha guruhlar orqali kurslar ro'yxati, har birida `hasAccess: boolean` (`assertStudentLessonAccess` natijasi) va `paymentStatus` ko'rsatiladi

## 5. Frontend

- `courseStore.ts`: `Group` interfeysi backend bilan mos keladi (`inviteToken`, `paymentDay` qo'shiladi; `curatorIds`/`studentIds` massivlari o'rniga `members: GroupMember[]` — har birida `id`, `studentId`, `name`, `role`, `selectedPlanId`, `forcedClosed`, `latestPaymentStatus`). `Launch`/`PricingPlan` backend bilan ulanadi.
- Barcha guruh/launch/pricing-plan CRUD action'lari (`addGroup`, `renameGroup`, `toggleGroupChat`, `toggleGroupChannel`, `addStudentToGroup` va h.k.) async, API-backed qilinadi.
- Yangi action'lar: `setMemberPlan(groupId, memberId, planId)`, `setMemberForcedClosed(groupId, memberId, closed)`, `recordPayment(paymentId, amount, discount?)`.
- `AddStudentToGroupModal.tsx`: `MOCK_STUDENTS` o'rniga real talabalar qidiruvi (yangi backend endpoint, `users` jadvalidan `role='student'` bo'yicha qidirish).
- Yangi sahifa: `apps/frontend/src/pages/JoinGroupPage.tsx` — `/join/:token` route, login qilmagan bo'lsa avval login/ro'yxatdan o'tishga yo'naltiradi, keyin `POST /join/:token` chaqiradi.
- Guruh boshqaruv UI'siga: "Havolani nusxalash" tugmasi, har a'zo qatorida tarif tanlash dropdown, to'lov holati belgisi (rang bilan: kutilmoqda/qisman/to'landi/qarz), "To'lov qabul qilish" modal (summa + ixtiyoriy chegirma), "Majburiy yopish" toggle.

## Global cheklovlar

- `@nestjs/schedule` yangi dependency sifatida qo'shiladi (cron uchun).
- Barcha yangi jadvallar ownership'ni parent-chain orqali tekshiradi, hech birida to'g'ridan-to'g'ri `adminId` yo'q (courses/launches va groups bundan mustasno — ular `courseId` orqali bevosita bog'lanadi).
- `paymentDay` 1 dan 28 gacha cheklanadi (backend validatsiyasi).
- Chegirma (`discountAmount`) faqat bitta oylik yozuvga tegishli, keyingi oyga o'tmaydi.
- `forcedClosed` avtomatik to'lov hisob-kitobidan mustaqil — har doim ustunlik qiladi (`true` bo'lsa kirish rad etiladi, boshqa barcha holatlardan qat'iy nazar).
- Video/HLS himoyasi, Click/Payme kabi real to'lov provayder integratsiyasi, va talaba tomonidan to'liq "mening kurslarim" ko'rish sahifasi ushbu spec doirasidan **tashqarida** — bu yerda faqat `assertStudentLessonAccess` helper va `/my/courses` ro'yxat darajasidagi ko'rsatkich qamrab olinadi.
- Manual browser QA foydalanuvchi tomonidan bajariladi, AI faqat build/test tekshiruvini amalga oshiradi.
- Backend build/test (hozirgi 96 test) yashil qolishi, frontend build toza bo'lishi kerak.
