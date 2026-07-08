# school_members va group_members birlashtirish — Design Spec

## Maqsad

Hozir talaba ikkita mustaqil, bir-biriga bog'liq bo'lmagan oqim orqali tizimga kiradi:

- `/join/:token` — to'g'ridan-to'g'ri **guruhga** qo'shiladi (`group_members`), maktabga umuman tegishli emas.
- `/school-invite/:token` — **maktabga** qo'shiladi (`school_members`), guruhga tegishli emas.

Bu tabiiy emas: guruh baribir bitta maktabga tegishli kursning bir qismi. Yangi oqim: talaba **faqat** `/school-invite/:token` orqali kiradi va maktabga a'zo bo'ladi (`role: 'student'`, hozircha guruhsiz — "kutadi"). Admin uni keyin biror guruhga **biriktiradi** (guruh a'zoligi endi mustaqil emas, balki maktab-a'zoligiga bog'langan qo'shimcha yozuv). Admin uni **kurator** qilib belgilasa, bu `school_members.role`ni o'zgartiradi — kuratorlik butun maktab darajasida, guruh darajasida emas.

`/join/:token` va unga bog'liq barcha frontend/backend kod butunlay olib tashlanadi.

## 1. Ma'lumotlar modeli

### `school_members` — o'zgarishsiz qoladi

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

Bu jadval endi **"talaba/xodim shu maktabda umuman bormi va qanday rolda"** degan yagona haqiqat manbai. Guruh darajasida alohida `role` yo'q — kim kurator ekanligi faqat shu yerdan aniqlanadi.

### Yangi jadval: `group_enrollments` (`group_members`ning o'rnini bosadi)

```typescript
export const groupEnrollments = pgTable('group_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolMemberId: uuid('school_member_id').notNull().references(() => schoolMembers.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  selectedPlanId: uuid('selected_plan_id').references(() => pricingPlans.id, { onDelete: 'set null' }),
  forcedClosed: boolean('forced_closed').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
});
```

**Muhim farqlar hozirgi `group_members`dan:**
- `studentId` o'rniga `schoolMemberId` — talaba endi to'g'ridan-to'g'ri emas, avval maktabga qo'shilgan yozuvi orqali guruhga bog'lanadi.
- `role` ustuni **yo'q** — kuratorlik `school_members.role` orqali aniqlanadi.
- Unique index **yo'q darajada emas**: `(schoolMemberId, groupId)` bo'yicha unique index bo'ladi, lekin faqat mantiqiy darajada (soft-delete borligi sababli DB darajasida oddiy unique index qo'yib bo'lmaydi — quyida "Qayta biriktirish" bo'limida tushuntiriladi).
- `removedAt` saqlanadi (mavjud soft-delete pattern, chunki `monthlyPayments` to'lov tarixini yo'qotmaslik kerak — bu qat'iy talab, o'zgarishsiz qoladi).

### `monthlyPayments` — FK maqsadi o'zgaradi, nomi ham yangilanadi

```typescript
export const monthlyPayments = pgTable('monthly_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => groupEnrollments.id, { onDelete: 'cascade' }),
  // ...qolgan ustunlar o'zgarishsiz (periodMonth, expectedAmount, discountAmount, paidAmount, status, paymentMethod, note, receiptUrl, createdAt, updatedAt)
}, (table) => ({
  uniqueMemberPeriod: uniqueIndex('monthly_payments_enrollment_id_period_month_key').on(table.enrollmentId, table.periodMonth),
}));
```

`groupMemberId` → `enrollmentId`ga nomlanadi, FK endi `group_enrollments.id`ga ishora qiladi. **Payment tarixi hech qachon yo'qolmaydi** — `group_enrollments` soft-delete (`removedAt`) orqali o'chiriladi, hard-delete emas, shuning uchun `onDelete: 'cascade'` amalda hech qachon ishga tushmaydi (faqat butun guruh yoki butun maktab a'zosi hard-delete qilinsa, lekin bu oqim mavjud emas).

### `groups` va `pricingPlans` — o'zgarishsiz

`groups.courseId`, `pricingPlans.groupId` munosabatlari saqlanadi.

## 2. `role` va "kuratorlik" mantig'i

Hozir `group_members.role` guruh ichida "shu odam kurator" degan ma'noni bergan. Endi:

- **`school_members.role === 'curator'`** — bu odam butun maktabda kurator hisoblanadi.
- Biror guruhning "kuratorlari" ro'yxati = shu guruhga `group_enrollments`i bor (`removedAt IS NULL`) VA `school_members.role === 'curator'` bo'lgan odamlar.
- Guruhga kurator "biriktirish" (`assignCuratorFromStaff` ekvivalenti) endi ikkita mustaqil amalni anglatishi mumkin:
  1. Agar odam hali `school_members.role === 'curator'` bo'lmasa — avval shu roli yangilanadi (yoki alohida "avval xodim qiling" talab qilinadi — implementatsiya bosqichida hal qilinadi, quyida ochiq savol).
  2. So'ng, agar hali shu guruhga `group_enrollments`i bo'lmasa — yangi enrollment yaratiladi.

**Muhim soddalashtirish:** `role` faqat bitta joyda saqlangani uchun, "faqat shu guruhda kurator, boshqa guruhda oddiy talaba" holatini qo'llab-quvvatlash **yo'q** — bu foydalanuvchi tomonidan avvalgi brainstormingda ataylab rad etilgan (soddalik uchun tanlangan yechim).

## 3. Yangi oqim: `/school-invite/:token`

`POST /school-invite/:token` (`@Roles('student')`) — o'zgarishsiz, faqat `school_members`ga `role: 'student'` bilan qo'shadi. Guruhga hech narsa qilinmaydi.

`GET /school-invite/:token` (public preview) — o'zgarishsiz.

## 4. `/join/:token` — butunlay olib tashlanadi

Olib tashlanadigan narsalar:

- Backend: `GroupsController`dagi `GET /join/:token` (`getJoinPreview`) va `POST /join/:token` (`join` → `joinByToken`) endpointlari.
- Backend: `GroupsService.getJoinPreview()` va `GroupsService.joinByToken()` metodlari.
- Frontend: `apps/frontend/src/pages/JoinGroupPage.tsx` fayli butunlay o'chiriladi.
- Frontend: `App.tsx`dagi `/join/:token` route'i o'chiriladi.
- Frontend: `apps/frontend/src/api/groups.ts`dagi `apiGetJoinPreview`, `apiJoinGroup` funksiyalari o'chiriladi.

Guruhga qo'shish endi **faqat admin panelidan** amalga oshadi: admin maktabning talabalar ro'yxatidan (`school/students` yoki shunga o'xshash, `AllUsersPage`/`StudentsPage` allaqachon shu ma'lumotni ko'rsatadi) birini tanlab, uni biror guruhga biriktiradi.

## 5. Backend API o'zgarishlari (`groups` moduli)

`GroupsService`dagi barcha metodlar `group_members` o'rniga `group_enrollments`ga, `studentId` o'rniga `schoolMemberId` orqali ishlaydi:

- `findMembers(groupId, adminId)` — `group_enrollments` orqali, `with: { schoolMember: { with: { student: true } } }` (yoki Drizzle nested relations orqali), `isNull(removedAt)` filtri saqlanadi. Har bir qatorda `role` endi `schoolMember.role`dan olinadi (frontendga `GroupMember.role` maydoni sifatida uzatiladi, backendning ichki modeli o'zgargani frontend interfeysini o'zgartirishni talab qilmaydi — `apps/frontend/src/stores/courseStore.ts`dagi `GroupMember` interfeysi saqlanadi).
- `updateMember`, `setForcedClosed`, `removeMember` — endi `group_enrollments.id` bo'yicha ishlaydi (`memberId` semantikasi enrollment id'siga o'tadi, frontend uchun shaffof — u baribir "member id" deb ataydi).
- `assignCuratorFromStaff(groupId, adminId, studentId)` — yangilangan mantiq:
  1. `studentId` orqali shu maktabning `school_members` yozuvini topadi (agar yo'q bo'lsa — `NotFoundException`, chunki endi guruhga faqat maktab a'zosi biriktirilishi mumkin).
  2. `school_members.role`ni `'curator'`ga yangilaydi (agar hali `'curator'` bo'lmasa).
  3. Agar shu guruh uchun faol (`removedAt IS NULL`) `group_enrollments` yozuvi bo'lmasa — yangisini yaratadi.
- **Yangi endpoint:** `POST /groups/:id/enroll` — `{ studentId }` — school-a'zosini guruhga oddiy talaba (`role` o'zgarishisiz) sifatida biriktiradi. Bu `/join/:token`ning o'rnini bosadigan, admin tomonidan boshqariladigan yagona "guruhga qo'shish" yo'li.

### Qayta biriktirish (soft-delete'dan keyin)

Talaba guruhdan chiqarilgan (`removedAt` bilan belgilangan), keyin qayta biriktirilsa: mavjud (soft-deleted) `group_enrollments` yozuvi `removedAt: null` qilib qayta faollashtiriladi (hozirgi `group_members`dagi `joinByToken`'ning reactivate mantig'iga o'xshash), yangi qator yaratilmaydi — shu orqali "faol holatda unique" talabi ilova darajasida ta'minlanadi.

## 6. `StudentAccessService` yangilanishi

`assertStudentLessonAccess(courseId, studentId)` endi:
1. Kursning guruhlarini topadi (o'zgarishsiz).
2. `studentId` orqali (avval `school_members`dan uning shu maktabdagi yozuvini, so'ng) shu guruhlar ichidan `group_enrollments`ni topadi — yoki to'g'ridan-to'g'ri `group_enrollments` join `school_members` orqali `studentId` bilan filtrlash mumkin (implementatsiya tafsiloti).
3. Qolgan mantiq (`selectedPlanId`, `forcedClosed`, `monthlyPayments` orqali `status !== 'debt'`) o'zgarishsiz, faqat `monthlyPayments.groupMemberId` → `monthlyPayments.enrollmentId`ga moslashtiriladi.

## 7. "Ruxsat kutayotganlar" (`/students/pending`) semantikasi o'zgaradi

Hozirgi `GroupsService.findPendingPlanAssignment` — "guruhga qo'shilgan, lekin tarif tanlanmagan" talabalarni topadi. Bu funksiya **o'zgarishsiz** qoladi (guruhga biriktirilgan-u-lekin-tarifsiz holat hali ham mavjud), lekin endi bunga qo'shimcha ravishda **"maktabga qo'shilgan, lekin hech qaysi guruhga biriktirilmagan"** holatini ham ko'rsatish tavsiya etiladi — bu yangi oqimning tabiiy natijasi (chunki endi hamma avval maktabga kiradi). Bu ikkinchi holat uchun `SchoolsService`ga yangi metod qo'shiladi: `findStudentsWithoutGroup(adminId)` — `school_members` (`role='student'`) orasidan hech qanday faol `group_enrollments`i yo'qlarini qaytaradi.

Frontendda (`StudentsPage.tsx`, `status === 'pending'` branch) ikkala ro'yxat birlashtirilib ko'rsatiladi (yoki ikkita kichik bo'lim: "Guruhga kutilmoqda" va "Tarifga kutilmoqda") — aniq UI tafsiloti implementatsiya bosqichida hal qilinadi.

## 8. Frontend o'zgarishlari

- `apps/frontend/src/stores/schoolStore.ts` — `SchoolStaff` interfeysi o'zgarishsiz qoladi (`role` allaqachon shu yerda).
- `apps/frontend/src/stores/courseStore.ts` — `GroupMember` interfeysi **o'zgarishsiz** (frontend uchun shaffof — `id`, `studentId`, `studentName`, `role`, va h.k. bir xil ko'rinishda keladi, faqat backend ichida qayerdan olinishi o'zgaradi).
- `apps/frontend/src/components/course/CourseGroupsPage.tsx`dagi "Guruh kuratorlari" select (allaqachon school staff'dan tanlanadigan qilib ulangan, oldingi ishda) — endi to'g'ridan-to'g'ri yangi backend mantig'iga mos keladi, o'zgarishsiz qolishi mumkin.
- **Yangi:** "O'quvchi qo'shish" UI (guruh ichida) — maktab talabalari ro'yxatidan (`school/students` yoki qidiruv) tanlab, `POST /groups/:id/enroll`ni chaqiradigan modal/select. Bu ilgari `/join/:token` orqali o'zi bajargan ishni endi admin bajaradi.
- `apps/frontend/src/pages/JoinGroupPage.tsx` — o'chiriladi.
- `apps/frontend/src/App.tsx` — `/join/:token` route'i o'chiriladi.
- `apps/frontend/src/api/groups.ts` — `apiGetJoinPreview`, `apiJoinGroup` o'chiriladi; yangi `apiEnrollStudent(groupId, studentId)` qo'shiladi.

## 9. Migratsiya strategiyasi

Bu **breaking schema change** (jadval nomi, FK yo'nalishi, ustun tarkibi o'zgaradi). Loyiha hali production'da emas (lokal dev muhitida ma'lumotlar test uchun), shuning uchun eng oddiy yo'l:

1. Yangi `group_enrollments` jadvalini yaratish.
2. Mavjud `group_members` qatorlaridan mos `school_members` yozuvlarini generatsiya qilish (agar talaba `group_members`da bor-u, lekin `school_members`da yo'q bo'lsa — avtomatik `school_members` yozuvi yaratiladi, `role: 'student'`) va shu asosda `group_enrollments`ga ma'lumotlarni ko'chirish (data migration script, bitta martalik).
3. `monthlyPayments.groupMemberId`ni yangi `enrollmentId`ga moslab yangilash (eski `groupMemberId` qiymatlari va yangi `group_enrollments.id`lar orasidagi moslikni saqlab borish orqali).
4. `group_members` jadvalini o'chirish.

Bu qadam **implementatsiya rejasida alohida, ehtiyotkor bosqich** sifatida yoziladi — ma'lumotlar yo'qolmasligi (ayniqsa `monthlyPayments`) qat'iy tekshiriladi.

## 10. Ochiq savol — implementatsiya bosqichida hal qilinishi kerak

`assignCuratorFromStaff`da: agar tanlangan odam hali `school_members`da `role: 'curator'` bo'lmasa, uni **avtomatik** kuratorga aylantirish kerakmi (bitta amal bilan: "shu odamni shu guruhga kurator qil" — ikkalasi ham bajariladi), yoki avval alohida "xodim qilish" (`school/staff` orqali) talab qilinib, keyingina guruhga biriktirilishi kerakmi? Spec avtomatik yo'lni (birinchi variant) tavsiya qiladi, chunki bu foydalanuvchi tajribasi uchun soddaroq va oldingi `assignCuratorFromStaff` implementatsiyasining ruhiga mos keladi ("tanlansa, kerakli narsa avtomatik bajariladi").
