# Kurator (curator) roli — dizayn

## Muammo

`/school/staff` sahifasida bir o'quvchini "curator" deb belgilash (`assignCuratorFromStaff`) faqat `schoolMembers.role`ni o'zgartiradi. Login va ruxsatlar tizimi `users.role`ga asoslanadi (`'student' | 'teacher' | 'super'`), shuning uchun curator deb belgilangan foydalanuvchi hamon `'student'` sifatida login qiladi va o'ziga tegishli hech qanday qo'shimcha huquq olmaydi.

Maqsad: kurator tizimga kirganda faqat o'zi biriktirilgan guruh(lar)dagi o'quvchilarni ko'rsin (`/students/list`), ularning amaliyot topshiriqlarini baholay olsin, va bu baholash kim/qachon bajarganini saqlab qolsin.

## Mavjud infratuzilma (o'zgarishsiz qayta ishlatiladi)

- **Guruh-kurator bog'lanishi**: `groups.service.ts` → `assignCuratorFromStaff` / `demoteCuratorFromStaff`, `POST/DELETE /groups/:id/curators` — allaqachon ishlaydi. `schoolMembers.role='curator'` + `groupEnrollments` orqali guruhga a'zolik.
- **Baholash UI**: `StudentLearningProgressModal.tsx` (`StudentsPage.tsx`dan ochiladi) — image submission va oral practice ballarini kiritish formasi to'liq tayyor.
- **Audit trail**: `imageSubmissions.gradedAt` / `gradedByAdminId`, `oralPracticeGrades.gradedAt` / `gradedByAdminId` — allaqachon DB'da bor va `practice-blocks.service.ts`da to'g'ri yoziladi.

## O'zgarishlar

### 1. Rol sinxronizatsiyasi (backend)

`apps/backend/src/groups/groups.service.ts`:

- `assignCuratorFromStaff(groupId, adminId, studentId)` — `schoolMembers.role='curator'` qilingandan so'ng, shu `studentId` (= `users.id`) uchun `users.role`ni `'curator'`ga o'rnatadi (agar hozircha `'student'` bo'lsa; `'teacher'`/`'super'` bo'lgan foydalanuvchini pasaytirmaydi).
- `demoteCuratorFromStaff(groupId, adminId, memberId)` — `schoolMembers.role='student'`ga qaytargandan so'ng, shu foydalanuvchi **boshqa hech qanday guruhda** faol curator (`schoolMembers.role='curator'` va tegishli `groupEnrollments.removedAt IS NULL`) emasligini tekshiradi; agar shunday bo'lsa, `users.role`ni `'student'`ga qaytaradi.
- Yangi helper: `private async syncUserRoleAfterCuratorChange(studentId: string)` — barcha faol school-member yozuvlarini tekshirib, kamida bittasi `curator` bo'lsa `users.role='curator'`, aks holda (agar hozirgi `users.role==='curator'` bo'lsa) `users.role='student'`ga tushiradi. Bu funksiya ikkala joyda ham chaqiriladi (kod takrorlanishining oldini olish uchun).

### 2. Yangi `curator` roli (tип tizimi)

- `apps/backend/src/db/schema.ts` — `users.role` ustuni matn (`text()`) bo'lgani uchun DB migratsiyasi shart emas, faqat qiymat sifatida `'curator'` qo'shiladi.
- `apps/backend/src/auth/roles.decorator.ts` / `roles.guard.ts` — o'zgarishsiz (ixtiyoriy string qiymatlarni solishtiradi), lekin endi `@Roles('curator', ...)` deb chaqirish mumkin bo'ladi.
- `apps/backend/src/admins/admins.controller.ts` — `UpdateRoleDto`dagi `@IsIn(['student','teacher','super'])`ga `'curator'` qo'shiladi (super admin qo'lda ham rol bera olishi uchun, ehtiyot chorasi sifatida).
- `apps/frontend/src/api/auth.ts` — `Admin.role` tipiga `'curator'` qo'shiladi.

### 3. Ko'rish doirasini cheklash (backend)

`apps/backend/src/schools/schools.service.ts`:

- `listAllStudents(adminId)` va `listEnrollments(adminId)` — hozir `courses.adminId` orqali barcha kursni ko'radigan `teacher`/`super` uchun ishlaydi. Bu ikkala metodga `callerId: string, callerRole: string` parametri qo'shiladi:
  - Agar `callerRole === 'curator'`: avval `schoolMembers` orqali shu foydalanuvchining barcha faol `groupEnrollments`larini (curator sifatida) topadi, keyin natijani faqat o'sha `groupId`lar bilan cheklaydi.
  - Aks holda (`teacher`/`super`): xatti-harakat o'zgarmaydi (mavjud `adminId` egaligi bo'yicha filtr).
- `apps/backend/src/schools/schools.controller.ts` — endpointlar `@Roles('teacher', 'super', 'curator')`ga kengaytiriladi; controller `req.user.role`ni service metodlariga uzatadi.

`apps/backend/src/practice-blocks/practice-blocks.service.ts`:

- `assertLessonOwnership(lessonId, adminId)` — hozirgi `courses.adminId === adminId` tekshiruviga qo'shimcha "OR: caller shu darsning guruhida faol curator" sharti qo'shiladi. Bu funksiya endi `callerRole`ni ham qabul qiladi; agar `teacher`/`super` bo'lsa avvalgidek course-owner tekshiradi, agar `curator` bo'lsa — darsning kursi ostidagi guruh(lar)da shu foydalanuvchi curator sifatida faol ekanligini tekshiradi.
- Grading endpointlar (`PATCH /image-submissions/:id/grade`, `PATCH /practice-blocks/:id/oral-grades/:studentId`, va lesson-completion bilan bog'liq boshqa curator kerak bo'ladigan joylar) `@Roles('teacher','super','curator')`ga kengaytiriladi.

### 4. Frontend marshrutlash va navigatsiya

- `apps/frontend/src/components/TeacherRoute.tsx` — `role === 'student'`ni bloklaydigan hozirgi mantiq saqlanadi (curator ham, teacher ham, super ham "student emas" guruhiga kiradi) — qo'shimcha o'zgarish shart emas, chunki u allaqachon faqat studentni bloklaydi. **Tekshirish kerak**: agar boshqa joylarda `role === 'teacher' || role === 'super'` deb qattiq yozilgan tekshiruvlar bo'lsa (masalan `AppShell.tsx`dagi admin-only elementlar, yoki boshqa route guardlar), ular kurator uchun ham moslashtiriladi — lekin faqat `/students/list` route va uning ostidagi grading amallariga ruxsat berish uchun, boshqa hech narsaga emas.
- `apps/frontend/src/App.tsx` — login qilgandan keyin `role === 'curator'` bo'lsa default marshrut `/students/list` bo'ladi (hozir `teacher`/`super` uchun `/lessons`ga yo'naltirilayotgan joy tekshiriladi va kurator uchun alohida shart qo'shiladi).
- `apps/frontend/src/components/AppShell.tsx` — `SECTIONS` massivi kurator uchun faqat `{ key: "students", label: "O'quvchilar", ... }` bilan cheklanadi (boshqa barcha bo'limlar — Darslar, To'lovlar, Amaliyotlar, Mening Maktabim — kurator uchun sidebar'da ko'rsatilmaydi). Profil/chiqish/theme-toggle o'zgarishsiz qoladi.
- `apps/frontend/src/pages/StudentsPage.tsx` — hozirgidek ishlaydi (backend allaqachon scoped ma'lumot qaytaradi), UI o'zgarishi shart emas.

## Qamrovdan tashqarida (keyingi bosqichga qoldiriladi)

- Kuratorni bevosita `AdminsPage`dan yaratish/rol berish UI'si — hozircha faqat `/school/staff` orqali (mavjud oqim) ishlaydi.
- Test natijalarini qo'lda qayta baholash — testlar avtomatik baholanadi, o'zgarish yo'q.
- Kuratorga to'lov/kurs tahrirlash huquqi — kiritilmaydi.

## Test rejasi

- Backend: `assignCuratorFromStaff` → `users.role` "curator"ga o'zgarishini; `demoteCuratorFromStaff` (boshqa guruhda ham curator bo'lsa) → `users.role` "curator"da qolishini; (boshqa guruhda curator bo'lmasa) → `"student"`ga qaytishini tekshiruvchi unit/integration testlar.
- Backend: kurator boshqa guruh o'quvchisini ko'ra olmasligini (`listEnrollments` bo'sh/cheklangan qaytarishi), o'z guruhidagi topshiriqni baholay olishini, boshqa guruhning topshirig'ini baholay olmasligini (403/404) tekshiruvchi testlar.
- Frontend: qo'lda tekshirish — curator sifatida login, faqat "O'quvchilar" ko'rinishi, faqat o'z guruh o'quvchilari ro'yxatda ko'rinishi, baholash formasi orqali ball qo'yib ko'rish va `gradedByAdminId`ning to'g'ri saqlanishini tasdiqlash.
