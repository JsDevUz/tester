# Challenges (kitobxonlik) bo'limi — dizayn

Sana: 2026-08-09

## Maqsad

Kurslar ichida ustoz "Challenge" (hozircha faqat kitobxonlik turi) yarata oladigan bo'lim. Kursning barcha a'zolari (guruhlaridan qat'i nazar) challenge'ni ko'rib, unga qo'shiladi. Qo'shilgan o'quvchi challenge ichidagi kitoblardan birini tanlab, o'qish progressini ("event") qo'shadi: boshlagan/tugagan bet, yangi lug'at soni. Har bir kitobga ustoz ixtiyoriy test biriktirib, muayyan betga yetganda (yoki darhol) uni majburiy qilishi mumkin. Challenge ichida bir nechta mezon bo'yicha leaderboard bo'ladi.

Shu bilan birga: JWT token amal qilish muddati 7 kundan 365 kunga oshiriladi (bajarildi — `apps/backend/src/auth/auth.module.ts`), va student navigatsiyasida "Jonli musobaqalar" o'rniga "Jamm" (Challenges) bo'limi chiqadi, "Jonli musobaqalar" esa "Amaliyotlar" sahifasi header'iga kichik tugma sifatida ko'chiriladi (ham web, ham mobile).

## 1. Umumiy tuzilma va qoidalar

- Challenge — kursga tegishli (`courseId`), ustoz (teacher/super) tomonidan yaratiladi: `name`, `description`, `imageUrl`, `type` (matn ustun, default `'kitobxonlik'`; frontend'da select sifatida ko'rsatiladi, hozircha yagona variant bilan — qiymat hardcode emas, kelajakda select'ga yangi variant qo'shish yetarli).
- Challenge'ga qo'shilish uchun link/invite-token yo'q. Kursning istalgan a'zosi (har qanday guruhidagi, `groupEnrollments` orqali aniqlanadi, `removedAt is null`) challenge'ni avtomatik ko'radi va "Qo'shilish" tugmasi bilan bitta marta join qiladi.
- Ustoz challenge ichiga bir nechta **kitob** qo'shadi: `title`, `totalPages` (jami bet soni, progress foizi va "tugatdi" holatini hisoblash uchun).
- Har bir kitobga ixtiyoriy ravishda **bitta test** biriktiriladi (mavjud `tests` jadvalidan tanlanadi, yangi test yaratish oqimi qo'shilmaydi):
  - `triggerPage` — shu kitobda o'quvchining `lastPageRead >= triggerPage` bo'lganda test unga majburiy ko'rinadi, YOKI
  - `forceNow = true` — ustoz istalgan vaqtda "hozir barchaga majburiy" qiladi, bet shartisiz.
- Test "majburiy" bo'lsa: o'quvchi uni tugatmaguncha (ya'ni shu `testId + userId` bo'yicha yakunlangan `submissions` yozuvi yo'q bo'lsa) o'sha kitob uchun **yangi event qo'sha olmaydi** — backend bloklaydi.
- Event'lar o'zgarmas: qo'shilgandan keyin tahrirlanmaydi/o'chirilmaydi.
- Kitobni o'chirish — cascade: unga bog'liq barcha event/progress/test-biriktirish yozuvlari ham o'chadi.
- "Boshlagan bet" qo'lda kiritilmaydi — har kitob uchun oxirgi `lastPageRead` backendda saqlanadi va yangi event ochilganda shundan avtomatik davom etiladi (birinchi marta 0).
- Lug'at — faqat son sifatida kiritiladi (necha ta yangi so'z), matn ro'yxati saqlanmaydi.
- "Tez o'qigan" reytingi vaqtsiz hisoblanadi: `jami o'qilgan bet / faollik kunlari soni` (birinchi va oxirgi event orasidagi kalendar kunlar, ya'ni `MAX(createdAt)::date - MIN(createdAt)::date + 1`).

## 2. Ma'lumotlar bazasi

Yangi jadvallar (`apps/backend/src/db/schema.ts`):

```
challenges
  id, courseId (FK courses, cascade), adminId (FK users),
  name, description (default ''), imageUrl (nullable),
  type (text, default 'kitobxonlik'),
  createdAt

challengeBooks
  id, challengeId (FK challenges, cascade),
  title, totalPages (integer),
  orderIndex (default 0),
  createdAt

challengeBookTests
  id, challengeBookId (FK challengeBooks, cascade, UNIQUE — bitta kitobga bitta test),
  testId (FK tests),
  triggerPage (integer, nullable),
  forceNow (boolean, default false),
  createdAt

challengeParticipants
  id, challengeId (FK challenges, cascade),
  studentId (FK users, cascade),
  joinedAt
  UNIQUE(challengeId, studentId)

challengeBookProgress
  id, challengeParticipantId (FK challengeParticipants, cascade),
  challengeBookId (FK challengeBooks, cascade),
  lastPageRead (integer, default 0)
  UNIQUE(challengeParticipantId, challengeBookId)

challengeEvents
  id, challengeParticipantId (FK challengeParticipants, cascade),
  challengeBookId (FK challengeBooks, cascade),
  startPage (integer), endPage (integer),
  newWordsCount (integer, default 0),
  createdAt (default now — "joriy vaqt bilan qabul qilingani")
```

`pagesRead` alohida ustun sifatida saqlanmaydi — har doim `endPage - startPage` sifatida hisoblanadi (query yoki drizzle generated column).

### Leaderboard hisob-kitoblari (query-time, alohida jadval yo'q)

Barchasi `challengeEvents` + `challengeParticipants` join orqali, `challengeId` bo'yicha guruhlangan, `studentId` kesimida:

- **Umumiy**: `SUM(endPage - startPage)` — jami o'qilgan bet.
- **Kup kitob o'qigan**: `COUNT(DISTINCT challengeBookId)` bo'yicha, faqat `challengeBookProgress.lastPageRead >= challengeBooks.totalPages` shartini qanoatlantirgan kitoblar (tugatilgan).
- **Kup lug'at**: `SUM(newWordsCount)`.
- **Tez o'qigan**: `SUM(endPage-startPage) / (kalendar kun farqi + 1)`.
- **Kitob bo'yicha**: bitta `challengeBookId` tanlanganda, shu kitob uchun `SUM(endPage-startPage)` yoki `lastPageRead` bo'yicha reyting.

### Majburiy test tekshiruvi

Yangi event yaratishdan oldin (`POST /me/challenges/:id/books/:bookId/events`):
1. `challengeBookTests` dan shu kitob uchun yozuv olinadi.
2. Agar mavjud va (`forceNow === true` YOKI `progress.lastPageRead >= triggerPage`):
   - `submissions` da `testId` + `userId` (joriy student) bo'yicha `submittedAt IS NOT NULL` yozuv qidiriladi.
   - Topilmasa → `400 Bad Request`, javobda `{ requiredTestSlug, requiredTestName }` — frontend shu orqali test sahifasiga yo'naltiradi.

## 3. Backend API

Yangi NestJS moduli: `apps/backend/src/challenges/` (`challenges.module.ts`, `challenges.controller.ts` — ustoz, `student-challenges.controller.ts` — o'quvchi, `challenges.service.ts`).

### Ustoz (teacher/super, `JwtAuthGuard` + `RolesGuard`)

- `GET /courses/:courseId/challenges` — ro'yxat
- `POST /courses/:courseId/challenges` — yaratish
- `PATCH /challenges/:id`, `DELETE /challenges/:id`
- `POST /challenges/:id/books` — kitob qo'shish
- `PATCH /challenges/books/:bookId`, `DELETE /challenges/books/:bookId`
- `PUT /challenges/books/:bookId/test` — biriktirish/yangilash (`testId, triggerPage?, forceNow?`)
- `DELETE /challenges/books/:bookId/test` — olib tashlash
- `GET /challenges/:id/leaderboard?metric=overall|books|words|speed&bookId=...`
- `GET /challenges/:id/stats` — qatnashchilar soni, har bir majburiy test uchun kim ishlagan/ishlamagan ro'yxati

Barcha yozish amallarida challenge/kitob ustozning o'z kursiga tegishli ekanligi (`adminId`) tekshiriladi — mavjud `courses.service.ts`/`tests.service.ts` patterni bo'yicha.

### O'quvchi (student, `JwtAuthGuard`)

- `GET /me/courses/:courseId/challenges` — shu kursdagi challenge'lar (`joined: boolean` bilan)
- `POST /me/challenges/:id/join` — qo'shilish (avval kurs a'zoligi tekshiriladi — `groupEnrollments` orqali)
- `GET /me/challenges/:id` — tafsilot: kitoblar, har biri uchun `lastPageRead`, majburiy test holati
- `POST /me/challenges/:id/books/:bookId/events` — yangi event (`endPage`, `newWordsCount`)
- `GET /me/challenges/:id/history` — o'zining event'lari
- `GET /me/challenges/:id/leaderboard` — xuddi ustoznikiga o'xshash, `isCurrentStudent` flag bilan

## 4. Frontend (ustoz, web)

- `CourseSidePanel.tsx` ga yangi tab: **Challenges**.
- `CourseChallengesPage.tsx` — challenge kartalar ro'yxati + "Yangi challenge" tugmasi.
- Yaratish/tahrirlash modali: `name`, `description`, rasm (`apiUploadMedia(file, 'avatars')` pattern — `SchoolSettingsPage.tsx` dagi kabi), `type` select (hozircha yagona "Kitobxonlik" varianti).
- Challenge detail: kitoblar ro'yxati boshqaruvi (qo'shish/tahrirlash/o'chirish, `totalPages`), har bir kitob qatorida "Test biriktirish" (mavjud testlar dropdown + `triggerPage` input yoki "hozir hammaga majburiy" checkbox), statistika paneli (qatnashchilar, test holati jadvali) va leaderboard preview.

## 5. Frontend (o'quvchi, web) va Mobile

### Navigatsiya o'zgarishi (ikkala platforma)

- **Web** (`StudentShell.tsx`): `NAV_ITEMS` da "Jonli musobaqalar" (`/live/join`, Radio) olib tashlanadi, o'rniga **"Jamm"** qo'shiladi (`/challenges`, `BookOpen` icon) — yangi `ChallengesListPage.tsx`: foydalanuvchining barcha kurslaridagi challenge'lari, qo'shilmaganlarga "Qo'shilish" tugmasi. `/history` (Amaliyotlar) sahifasi header'ining yuqori o'ng burchagiga kichik "Jonli musoba" tugmasi qo'shiladi (→ `/live/join`).
- **Mobile** (`RootNavigator.tsx`): bottom-tab'dagi `Live` (`LiveScreen`, Radio, "Jonli") o'rniga **`Jamm`** tab qo'yiladi (`BookOpen` icon, yangi `ChallengesScreen.tsx`). `LiveScreen` endi tab emas, `Stack.Screen` sifatida qo'shiladi (`RootStackParamList`ga `Live: undefined` qo'shiladi). `HistoryScreen.tsx` header'iga o'ng tomonda "Jonli musoba" tugmasi (Radio icon) qo'shiladi — bosilsa `navigation.navigate('Live')`.

### Challenge funksionalligi

- Challenge detail ekrani: kitoblar ro'yxati, progress bar (`lastPageRead/totalPages`), har biri uchun "+ Yangi yozuv" — forma `startPage`ni avto ko'rsatadi (readonly), faqat `endPage` va `newWordsCount` kiritiladi. Backend majburiy testni bloklasa, banner ko'rsatilib mavjud `TestTaker` ekraniga (`slug` bilan) yo'naltiriladi.
- Leaderboard: mavjud `CourseLeaderboardSheet.tsx` uslubida yangi `ChallengeLeaderboardSheet` — metric tablar: umumiy / kup kitob / kup lug'at / tez o'qigan / kitob bo'yicha.
- History: o'quvchining o'z event'lari ro'yxati (kitob, bet oralig'i, lug'at, vaqt).

## Boshqa o'zgarish (mustaqil, allaqachon bajarildi)

`apps/backend/src/auth/auth.module.ts` — JWT `expiresIn` `'7d'` dan `'365d'`ga o'zgartirildi.

## Qamrovdan tashqari (YAGNI)

- Challenge turi (`type`) uchun boshqa variantlar (faqat kitobxonlik).
- Event tahrirlash/o'chirish.
- Yangi test yaratish challenge oqimi ichida (faqat mavjud testlardan tanlash).
- Vaqt/soat asosidagi o'qish tezligi (faqat kunlik o'rtacha).
- Lug'at so'zlarining o'zini saqlash (faqat son).
