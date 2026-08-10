# Jamm: "Mening testlarim" va "Mening lug'atlarim" — dizayn

Sana: 2026-08-10

## Maqsad

`/jamm` (Bilim va musobaqalar markazi) sahifasiga "Jonli Musobaqalar" kartasidan keyin ikkita yangi karta qo'shiladi:

- **Mening testlarim** — o'quvchi ustozdek o'zi test tuzadi, folder-based tashkil qiladi, link orqali ulashadi.
- **Mening lug'atlarim** — o'quvchi o'zi so'z-tarjima ro'yxatlari (deck) tuzadi, folder-based tashkil qiladi, link orqali ulashadi; ochilgan link "So'z yodlash" challenge'idagi kabi flashcard/test mashq UI'sini ochadi.

Ikkalasi ham faqat **student** roli uchun; teacher o'z alohida Dashboard oqimidan foydalanishda davom etadi, bu ikki karta unga ko'rinmaydi/tegishli emas.

## 1. Mening testlarim

### 1.1 Qoidalar

- O'quvchi teacherdagi kabi to'liq imkoniyatli test tuzadi: savollar (bir nechta variant, to'g'ri javob), `shuffleQuestions`, `shuffleOptions`, `showResults`, `timeLimit`, `oneByOne`, `autoCompleteOnLeave` — hammasi mavjud `TestSettingsModal` maydonlari bilan bir xil.
- Quyidagi imkoniyatlar **o'chiq va UI'da umuman ko'rsatilmaydi**:
  - `onceOnly` (har bir odamga bir marta ruxsat) — har doim `false`.
  - `deadline` (muddat) — har doim `null`.
  - Pin qilish (`test_pins`) — pin UI yo'q, `test_pins`ga yozuv yaratilmaydi.
- `requireAuth` har doim majburiy `true` — o'quvchi buni o'chira olmaydi, UI'da toggle sifatida ko'rsatilmaydi (doim yoqilgan sifatida ma'lum, o'zgartirib bo'lmaydi). Ya'ni link faqat tizimga kirgan (login qilgan) foydalanuvchilarga ochiladi, mehmon kira olmaydi.
- Test ulashish uchun mavjud slug-based public link mexanizmi qayta ishlatiladi (`/t/:slug`).
- Bitta foydalanuvchi bir testni **cheksiz marta** ishlashi mumkin — har bir urinish alohida `submissions` qatori sifatida saqlanadi.
- **Natijalar/statistika hech kimga ko'rsatilmaydi**: na test egasi (owner), na boshqa ishlovchilar bir-birining natijasini ko'ra olmaydi. Har bir foydalanuvchi faqat o'zining "Amaliyotlar tarixi"da (agar mavjud bo'lsa — talaba uchun mavjud shaxsiy tarix sahifasi) o'z urinishini ko'radi. Owner uchun "kim qachon ishladi" degan submission-ro'yxat/statistika sahifasi yaratilmaydi.

### 1.2 Ma'lumotlar bazasi

**Yangi jadval yaratilmaydi.** Mavjud `folders` va `tests` jadvallari (`apps/backend/src/db/schema.ts:62`, `:445`) qayta ishlatiladi — ikkalasida ham `adminId` oddiy `users.id` FK, DB darajasida teacher/student cheklovi yo'q (cheklov faqat controller darajasidagi `@Roles`). O'quvchi o'z folder/testlarini xuddi shu jadvallarga yaratadi, `adminId = student.id`.

`questions`, `options`, `submissions`, `answers` jadvallari o'zgarishsiz — `testId` orqali bog'lanadi, kim yaratgani (teacher/student) ularga farqsiz.

Schema o'zgarishi shart emas: `adminId` orqali `users` jadvaliga join qilib, `users.role`dan kim yaratganini bilish mumkin (alohida `creatorRole` ustuni kerak emas).

### 1.3 Backend API

Yangi, mustaqil controller/service fayllar — mavjud teacher controllerlariga (`tests.controller.ts`, `folders.controller.ts`, `@Roles('teacher','super')`) tegilmaydi, chunki student versiyasida yaratish qoidalari boshqacha (majburiy `requireAuth`, pin/deadline/onceOnly yo'q) va ularni bitta controllerga aralashtirish teacher oqimini murakkablashtiradi. Bu naqsh loyihada allaqachon bor: `challenges.controller.ts` (teacher) / `student-challenges.controller.ts` (student) bitta `challenges` jadvalidan alohida controllerlar orqali foydalanadi.

`apps/backend/src/student-tests/` (yangi modul):

- `me/test-folders` — `@Roles('student')`
  - `GET /` — o'z folderlari ro'yxati (`WHERE adminId = req.user.id`)
  - `POST /`, `PATCH /:id`, `DELETE /:id` — nom, rang, icon (`NewFolderModal` bilan bir xil maydonlar)
- `me/tests` — `@Roles('student')`
  - `GET /folders/:folderId` — folder ichidagi testlar ro'yxati (faqat o'zinikilar)
  - `POST /` — test yaratish; backend `requireAuth=true`, `onceOnly=false`, `deadline=null` ni majburiy qo'yadi, so'ralgan qiymatlardan qat'i nazar
  - `PATCH /:id`, `DELETE /:id` — faqat egasi (`adminId = req.user.id` tekshiruvi)
  - Savol/variant CRUD — mavjud teacher savol-boshqaruv logikasi bilan bir xil shaklda, lekin `assertTestOwnership` studentning o'z `adminId`sini tekshiradi
  - **Submission-ro'yxat/statistika endpointi yo'q** — bunday endpoint umuman yaratilmaydi.

Mavjud `delivery.controller.ts` (`/delivery/tests/:slug`, `/delivery/submissions`) **o'zgarishsiz ishlaydi** — u faqat `tests.slug` va `requireAuth`ni tekshiradi, testni kim yaratgani (teacher/student) uni qiziqtirmaydi.

### 1.4 Frontend

- `ChallengesHubPage.tsx` — yangi karta, `/my-tests` ga yo'naltiradi.
- `MyTestsPage.tsx` — folder grid, mavjud `FolderCard`/`NewFolderModal` komponentlari qayta ishlatiladi (yangi `me/test-folders` API bilan).
- `MyTestFolderViewPage.tsx` — folder ichidagi test ro'yxati, mavjud `FolderViewPage.tsx`/`TestCard.tsx` asosida, lekin pin-tugma, deadline-belgi va natija-soni ko'rsatkichlari olib tashlangan soddalashtirilgan versiya. Ulashish tugmasi qoladi (`copyLink` → `/t/{slug}`).
- Test yaratish/tahrirlash formasi — mavjud `TestSettingsModal.tsx` asosida, `requireAuth`/`onceOnly`/`deadline` maydonlari va `TestPinModal` chaqiruvi olib tashlangan versiya.
- Test yechish oqimi (`/t/:slug` → `TakeTestEntryPage`/`TakeTestPage`/`TestResultPage`) **o'zgarishsiz** qayta ishlatiladi.

## 2. Mening lug'atlarim

### 2.1 Qoidalar

- O'quvchi folder-based deck tuzadi: bir nechta deck yaratadi, har birida so'z-tarjima juftliklari.
- So'z kiritish — `CourseChallengeWordsPanel.tsx` naqshiga o'xshab: bitta-bitta forma (so'z + tarjima) yoki ommaviy import (`"so'z - tarjima"` formatidagi qatorlar, ` - ` ajratkichi, natija xabari `X qo'shildi, Y o'tkazib yuborildi`).
- Har bir deck uchun public link (`/d/:slug`) — link orqali kirish uchun tizimga kirgan (login qilgan) bo'lish shart, lekin deck egasi bo'lish shart emas (xuddi testlardagi kabi `requireAuth` mantiqiga o'xshash, majburiy va o'zgartirib bo'lmaydi).
- Link ochilganda "So'z yodlash" challenge'idagi bilan bir xil UX: avval rejim tanlovi (**Flashcard** / **Test**), keyin yo'nalish tanlovi (**So'z → Tarjima** / **Tarjima → So'z**), so'ng mashq ekrani (`docs/superpowers/specs/2026-08-10-word-memorization-design.md` bandidagi Flashcard/Test ekranlari bilan bir xil vizual/interaktsiya naqsh — karta stack, swipe, 4-variantli test).
- **Statistika/malumot umuman saqlanmaydi**: "bilaman/bilmayman" holati faqat frontend state'da, sessiya davomida. Sahifa tark etilsa yoki qayta ochilsa, hamma so'z yana boshlang'ich ("bilmayman"/navbatda) holatga qaytadi. Backend'ga progress yozuvchi endpoint umuman yo'q.

### 2.2 Ma'lumotlar bazasi

Yangi, mustaqil jadvallar (mavjud `challengeWords` course/challenge'ga qattiq bog'liq bo'lgani uchun mos kelmaydi):

```
wordDecks
  id, ownerId (FK users, cascade),
  name,
  slug (varchar(8), unique — public link uchun),
  createdAt

deckWords
  id, deckId (FK wordDecks, cascade),
  word, translation,
  orderIndex (default 0),
  createdAt
```

Progress jadvali **yaratilmaydi** — talab bo'yicha hech qanday urinish/holat backend'da saqlanmaydi.

### 2.3 Backend API

`apps/backend/src/word-decks/` (yangi modul):

- `me/word-decks` — `@Roles('student')`
  - `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` — deck CRUD (faqat `ownerId = req.user.id`)
  - `POST /:id/words`, `POST /:id/words/bulk`, `PATCH /words/:wordId`, `DELETE /words/:wordId` — so'z CRUD, egalik tekshiruvi bilan
- `decks/:slug` — `JwtAuthGuard` bilan himoyalangan (login talab qilinadi), `@Roles` yo'q (istalgan rol o'qiy oladi, deck egasi bo'lish shart emas)
  - `GET /` — deck nomi + so'zlar ro'yxati (`{ id, word, translation }`, `known` maydoni yo'q — progress saqlanmagani uchun)

Progress yozish endpointi yo'q — flashcard/test ekranlaridagi "bilaman/bilmayman" bosilishi faqat frontend state'ni yangilaydi, hech qanday tarmoq so'rovi yubormaydi.

### 2.4 Frontend

- `ChallengesHubPage.tsx` — yangi karta, `/my-dictionaries` ga yo'naltiradi.
- `MyDictionariesPage.tsx` — deck grid (folder o'rnida deck kartalari, `FolderCard` uslubida).
- `WordDeckViewPage.tsx` — deck ichidagi so'zlar boshqaruvi (`CourseChallengeWordsPanel.tsx` asosida: bitta-bitta qo'shish + ommaviy import), ulashish tugmasi (`copyLink` → `/d/{slug}`).
- `DeckPracticePage.tsx` — public link sahifasi (`/d/:slug`), `ChallengeWordPracticePage.tsx` bilan bir xil tuzilma: rejim/yo'nalish tanlovi (`SegmentedControl`) + flashcard yoki test UI. Farqi — progress backend'ga yozilmaydi, faqat local `useState` bilan boshqariladi (`known: boolean` massiv/map sessiya davomida).

## 3. Ruxsat modeli xulosasi

| | Mening testlarim | Mening lug'atlarim |
|---|---|---|
| Yaratuvchi | faqat student | faqat student |
| Jadval | mavjud `folders`/`tests` (qayta ishlatiladi) | yangi `wordDecks`/`deckWords` |
| Kirish (link) | login qilgan userlar (majburiy, o'zgartirib bo'lmaydi) | login qilgan userlar (majburiy, o'zgartirib bo'lmaydi) |
| Ishlash cheklovi | cheksiz marta | tegishli emas (statistika yo'q) |
| Owner natija ko'radimi | yo'q | tegishli emas (statistika yo'q) |
| Boshqalar natija ko'radimi | yo'q — har kim faqat o'zining amaliyotlar tarixida | tegishli emas |
| Pin / deadline / onceOnly | yo'q, UI'da ko'rsatilmaydi | tegishli emas |
| Progress saqlanadimi | ha (`submissions`/`answers`, mavjud mexanizm) | yo'q, sessiya-only |

## Qamrovdan tashqari (YAGNI)

- Teacher uchun bu ikki karta/oqim — faqat student roli uchun, teacher Dashboard'i o'zgarmaydi.
- "Mening testlarim"da submission-ro'yxat, natija-statistika, yoki "kim ishladi" ko'rinishi — umuman yo'q.
- "Mening lug'atlarim"da progress saqlash, reyting, yoki tarix — umuman yo'q.
- Pin, deadline, onceOnly — ikkala funksiyada ham yo'q va qo'shilishi rejalashtirilmagan.
- Folder/deck darajasida ulashish linki (faqat individual test/deck darajasida link bor, butun folder uchun emas).
- Mobil ilova qamrovi — bu spec faqat web frontend (`apps/frontend`) va backendni qamrab oladi; mobilga kengaytirish alohida ish.
