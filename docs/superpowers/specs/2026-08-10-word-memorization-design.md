# So'z yodlash — Challenges'ning yangi turi — dizayn

Sana: 2026-08-10

## Maqsad

Mavjud "Challenges" (Jamm) tizimiga kitobxonlikdan tashqari ikkinchi challenge turi qo'shiladi: **So'z yodlash**. Ustoz so'z-tarjima juftliklaridan iborat ro'yxat yaratadi. Challenge'ga qo'shilgan o'quvchi ikki usulda mashq qiladi — **Flashcard** (swipe-uslubidagi karta) yoki **Test** (4 variantli savol) — va har bir so'z uchun "bilaman"/"bilmayman" holati real vaqtda serverga yoziladi. Challenge ichida kitobxonlikdagiga o'xshash **Reyting** bo'limi bo'lib, u yerda o'quvchilar necha so'z yodlaganiga qarab saralanadi.

`challenges.type` ustuni allaqachon shu maqsadda mo'ljallangan (mavjud spec: `docs/superpowers/specs/2026-08-09-challenges-design.md`, band 1) — frontend `type`ni select sifatida ko'rsatadi, hozircha "Kitobxonlik" yagona variant edi; bu spec ikkinchi variantni ("So'z yodlash") qo'shadi.

## 1. Umumiy tuzilma va qoidalar

- Challenge yaratishda `type` maydoni endi ikkita qiymatdan birini oladi: `'kitobxonlik'` (mavjud) yoki `'soz_yodlash'` (yangi). Qiymat frontend select'ida hardcode qilinmaydi — backend `type`ni oddiy matn ustuni sifatida saqlaydi, frontend faqat shu ikki variantni select opsiyasi sifatida ko'rsatadi.
- `type = 'soz_yodlash'` bo'lgan challenge'da kitoblar (`challengeBooks`) o'rniga **so'zlar** (`challengeWords`) bo'ladi. Ikkala turning umumiy qismi (`challenges` jadvali, `challengeParticipants`, qo'shilish oqimi, kurs a'zoligi tekshiruvi) o'zgarishsiz qoladi.
- Ustoz so'zlarni ikki yo'l bilan kiritadi:
  1. **Birma-bir**: so'z + tarjima formasi.
  2. **Ommaviy import**: bitta katta textarea, har qatorda `so'z - tarjima` formatida (masalan `apple - olma`). Parse qilishda ` - ` ajratkichi ishlatiladi; formatga mos kelmagan qatorlar o'tkazib yuboriladi va import natijasida nechta qator qo'shilgani/o'tkazib yuborilgani frontend'da ko'rsatiladi.
- Har bir so'zning har bir ishtirokchi uchun bitta holati bor: **bilaman** yoki **bilmayman** (boolean, `known`). Boshlang'ich holat — hali baholanmagan (`challengeWordProgress` qatori mavjud emas, `known = false` sifatida ko'rsatiladi/hisoblanadi).
- Holat yangilanishi (barchasi darhol, real vaqtda, backend'ga yozib boriladi):
  - **Flashcard, o'ngga surish** ("Topdim") → `known = true`.
  - **Flashcard, chapga surish** ("Eslay olmadim") → `known = false` (agar avval `true` bo'lgan bo'lsa ham, qayta `false`ga tushadi).
  - **Test, to'g'ri javob** → `known = true`.
  - **Test, noto'g'ri javob** → `known = false`.
- Bitta umumiy holat — flashcard va test bir-biriga ta'sir qiladi (bittasi belgilagan holatni ikkinchisi o'zgartirishi mumkin).
- Mashqni boshlashdan oldin o'quvchi ikkita narsani tanlaydi: **rejim** (Flashcard / Test) va **yo'nalish** (So'z→Tarjima / Tarjima→So'z). Tanlov faqat shu mashq sessiyasi uchun amal qiladi (saqlanmaydi, har safar qayta tanlanadi).
- Test rejimida noto'g'ri variantlar xuddi shu challenge ichidagi boshqa so'zlarning tarjimalaridan (yoki, yo'nalishga qarab, so'zlaridan) tasodifiy tanlanadi. Agar challenge'da 4 tadan kam so'z bo'lsa, variantlar mavjud so'zlar soniga qadar kamaytiriladi (masalan 3 ta so'z bo'lsa — 3 variant).
- Reyting metrikasi: **yodlangan so'zlar soni** — `challengeWordProgress` da `known = true` bo'lgan qatorlar soni, `challengeId` va `studentId` bo'yicha guruhlangan. Bitta metrikali reyting (kitobxonlikdagi kabi bir nechta metrikaga ehtiyoj yo'q).

## 2. Ma'lumotlar bazasi

Yangi jadvallar (`apps/backend/src/db/schema.ts`):

```
challengeWords
  id, challengeId (FK challenges, cascade),
  word, translation,
  orderIndex (default 0),
  createdAt

challengeWordProgress
  id, challengeParticipantId (FK challengeParticipants, cascade),
  challengeWordId (FK challengeWords, cascade),
  known (boolean, default false),
  updatedAt
  UNIQUE(challengeParticipantId, challengeWordId)
```

`challengeParticipants` jadvali kitobxonlik bilan bir xil qoladi — bitta ishtirokchi bitta challenge'ga tegishli, `type`dan qat'i nazar.

### Reyting hisob-kitobi (query-time)

`challengeWordProgress` + `challengeParticipants` join, `challengeId` bo'yicha filtrlangan, `studentId` kesimida: `COUNT(*) WHERE known = true`.

## 3. Backend API

Mavjud `apps/backend/src/challenges/` moduliga qo'shiladi (yangi controller/service fayllar: `challenge-words.controller.ts`, `challenge-words.service.ts`, yoki mavjud `challenges.service.ts`/`student-challenges.service.ts` ichiga `type`ga qarab shoxlanadigan metodlar — implementatsiya bosqichida hal qilinadi).

### Ustoz

- `POST /challenges/:id/words` — bitta so'z qo'shish (`word`, `translation`)
- `POST /challenges/:id/words/bulk` — ommaviy import (`{ text: string }`, backend parse qiladi, natija: `{ added: number, skipped: number }`)
- `PATCH /challenges/words/:wordId`, `DELETE /challenges/words/:wordId`
- `GET /challenges/:id/leaderboard` — mavjud endpoint, `type = 'soz_yodlash'` bo'lganda avtomatik "yodlangan so'zlar soni" metrikasini qaytaradi (metric parametrisiz, chunki bitta metrika bor)

Barcha yozish amallarida so'z challenge'ning ustoziga tegishli ekanligi tekshiriladi (mavjud `assertBookOwnership` patterniga o'xshash `assertWordOwnership`).

### O'quvchi

- `GET /me/challenges/:id/words` — so'zlar ro'yxati, har biri `{ id, word, translation, known }` bilan (joriy ishtirokchining holati qo'shilgan)
- `POST /me/challenges/:id/words/:wordId/progress` — `{ known: boolean }`, darhol `challengeWordProgress`ga yozadi (`onConflictDoUpdate`)
- `GET /me/challenges/:id/leaderboard` — mavjud endpoint, `isCurrentStudent` flag bilan

## 4. Frontend (ustoz, web)

`CourseChallengesPage.tsx` — challenge yaratish/tahrirlash modaliga `type` select qo'shiladi: "Kitobxonlik" / "So'z yodlash". Challenge detail sahifasi `type`ga qarab shoxlanadi:

- `type = 'kitobxonlik'` bo'lsa — mavjud kitoblar boshqaruvi (o'zgarishsiz).
- `type = 'soz_yodlash'` bo'lsa — so'zlar ro'yxati boshqaruvi:
  - Jadval: so'z, tarjima, o'chirish tugmasi har qatorda.
  - "+ So'z qo'shish" — inline forma (so'z, tarjima).
  - "Ommaviy import" — modal, katta textarea (`"so'z - tarjima"` formatidagi qatorlar), "Import qilish" tugmasi, natija xabari (`X ta qo'shildi, Y ta o'tkazib yuborildi`).

## 5. Frontend (o'quvchi, web) va Mobile

Challenge detail sahifasi (`ChallengeDetailPage.tsx` / mobil ekvivalenti) `type`ga qarab shoxlanadi:

- `type = 'kitobxonlik'` — mavjud "Kitoblar" tab (o'zgarishsiz).
- `type = 'soz_yodlash'` — so'zlar ro'yxati (so'z, tarjima, holat belgisi) + "Mashq qilish" tugmasi. Bosilganda:
  1. Rejim tanlovi: **Flashcard** / **Test** (2 ta karta yoki tugma).
  2. Yo'nalish tanlovi: **So'z → Tarjima** / **Tarjima → So'z**.
  3. Mashq ekrani ochiladi.

**Reyting tab** — kitobxonlikdagi bilan bir xil komponent (`ChallengeLeaderboardSheet`/mavjud leaderboard UI), faqat `type = 'soz_yodlash'` bo'lganda bitta ustun ("Yodlangan so'zlar") ko'rsatiladi, metric tanlovisiz.

### Flashcard ekrani

Brauzerda tayyorlangan demo (`v9`, arab-tili-lugatlar.vercel.app uslubida) asosida:

- To'q fon (`#18181b`), sarlavha "✦ So'z yodlash" + "CHAPGA - TAKRORLASH · O'NGGA - BILAMAN" tavsifi.
- Statistika, 3 ustun: **Umumiy** (kulrang, sessiyadagi so'zlarning jami soni, o'zgarmas), **Qolgan** (binafsha, hozircha "bilaman" deb belgilanmagan — ya'ni hali navbatda turgan — so'zlar soni: o'ngga surilganda kamayadi, chapga surilganda o'zgarmaydi, chunki so'z hali ham "bilmayman" holatida navbatda qoladi), **Bilaman** (yashil, shu sessiya davomida o'ngga surilgan so'zlar soni).
- Karta stack: bir vaqtda bir nechta karta orqama-orqa ko'rinadi (kamida 6 ta), har biri tasodifiy (lekin deterministik, `uid` asosida) burchak bilan biroz egilgan, kichrayib-xiralashib pastga ketadi.
- Eng tepadagi kartaga bosilganda tarjima (yoki yo'nalishga qarab so'z) kartaning pastki qismida ochiladi — **flip effektisiz**, "JAVOBNI KO'RSATISH" matni markazda, bosilgach yo'qolib, javob o'rniga chiqadi.
- Sudrash (drag/swipe):
  - **O'ngga** (chegara: kichik, ~35px) → karta o'ng tomonga uchib chiqib ketadi, butunlay yo'qoladi (`known=true`, serverga darhol yoziladi), "BILAMAN ✓" belgisi ko'rinadi.
  - **Chapga** (xuddi shu chegara) → karta joyida kichrayib, pastga cho'kib, xiralashib g'oyib bo'ladi (yon tomonga uchmaydi — "orqaga qaytish" taassurotini beradi, "chiqib ketish"dan farqli), so'z navbat **oxiriga** qo'shiladi (`known=false`, serverga darhol yoziladi), "YANA ✗" belgisi ko'rinadi.
  - Sudrash tugagach chegaraga yetmasa — karta joyiga qaytadi, hech narsa yozilmaydi.
- Pastda alohida tugma yo'q (✗/✓/YOPISH tugmalari olib tashlangan) — faqat swipe orqali boshqariladi. Sessiyani tark etish uchun sahifaning umumiy "Orqaga" navigatsiyasi ishlatiladi.
- "So'z / Tarjima" yo'nalish tumbleri sarlavha ostida, mashq davomida ham almashtirilishi mumkin (almashtirilganda joriy stack qayta chiziladi).
- Barcha so'zlar "bilaman" bo'lganda (`deck.length === 0`) — "🎉 Tugadi!" xabari.

### Test ekrani

- Yo'nalishga mos savol (so'z yoki tarjima) katta matn sifatida ko'rsatiladi.
- 4 ta variant tugma (to'g'ri javob + shu challenge ichidagi boshqa so'zlardan tasodifiy 3 ta noto'g'ri variant).
- Variant bosilgach: to'g'ri/noto'g'ri rang bilan darhol ko'rsatiladi, natija serverga yoziladi (`known = true/false`), qisqa kechikishdan keyin avtomatik keyingi savolga o'tadi.
- Oxirida natija ekrani: "X/Y to'g'ri".

## Qamrovdan tashqari (YAGNI)

- So'zlarga misol jumla qo'shish (faqat so'z + tarjima).
- CSV fayl yuklash orqali import (faqat matn-qator formatidagi ommaviy import).
- Yo'nalish/rejim tanlovini saqlab qolish (har safar qayta tanlanadi).
- Flashcard/test statistikasini alohida-alohida ko'rsatish (bitta umumiy `known` holati).
- So'z darajasidagi "qiyinlik" yoki spaced-repetition algoritmi (oddiy bilaman/bilmayman holati yetarli).
