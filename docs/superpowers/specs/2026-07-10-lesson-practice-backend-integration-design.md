# Dars ichidagi "Amaliyot" bo'limini backendga ulash — Design Spec

## Maqsad

Dars ichidagi "Amaliy qism" (practice) bo'limini — hozircha frontendda mock/local-only holatda (`courseStore.ts`dagi `practiceBlocks`, `PracticeBlockType`, `setPracticeBlockTest` va h.k., sahifa yangilanganda yo'qoladi) — backendga ulash. O'qituvchi darsga mavjud (folder ichidagi) testlarni amaliyot sifatida biriktiradi va har bir amaliyotga, shuningdek darsning o'zini tamomlashga alohida-alohida ball (yulduz) belgilaydi. Talaba darsni ochib, "Amaliy qism"ni topshiradi, natijalarini va urinishlar tarixini ko'radi, dars balli (amaliyot + tamomlash) yig'iladi.

## 1. Ma'lumotlar modeli

### `practice_blocks` (yangi jadval)

```typescript
export const practiceBlocks = pgTable('practice_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  testId: uuid('test_id').references(() => tests.id, { onDelete: 'set null' }),
  orderIndex: integer('order_index').notNull().default(0),
  description: text('description').notNull().default(''),
  maxScore: integer('max_score'), // null = ballsiz amaliyot
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

`testId` nullable — o'qituvchi blok yaratib, keyinroq test biriktirishi mumkin (frontenddagi `addPracticeBlock`/`setPracticeBlockTest` ikki bosqichli oqimiga mos).

### `lessons` jadvaliga qo'shimcha ustunlar

```typescript
passThresholdEnabled: boolean('pass_threshold_enabled').notNull().default(false),
passThresholdPercent: integer('pass_threshold_percent'),
completionScore: integer('completion_score'), // null = ballsiz; darsni tamomlagani uchun beriladigan ball
```

### `submissions`/`answers` — o'zgarishsiz, qayta ishlatiladi

`submissions.testId` + `submissions.userId` orqali "talabaning shu testga urinishlari" so'raladi — amaliyot uchun alohida jadval kerak emas. Bitta test bir nechta amaliyot blokiga (turli darslarda) biriktirilgan bo'lsa ham, submissionlar `testId` orqali to'g'ri ajraladi (chalkashlik yo'q, chunki bitta amaliyot blokida bitta aniq `testId` bor va talaba shu blok orqali kirganda shu testni topshiradi).

### Yangi jadval: `lesson_completions` (darsni tamomlash holatini saqlash uchun)

```typescript
export const lessonCompletions = pgTable('lesson_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueLessonStudent: uniqueIndex('lesson_completions_lesson_id_student_id_key').on(table.lessonId, table.studentId),
}));
```

Bu jadval faqat "talaba shu darsni tamomladimi (ha/yo'q)" ma'lumotini saqlaydi — bir marta yaratiladi (unique constraint), qayta tamomlash hech narsani o'zgartirmaydi (idempotent).

## 2. Ball hisoblash mantig'i

- **Amaliyot balli** (bitta `practice_blocks` uchun): talabaning shu testga eng oxirgi (`submittedAt` bo'yicha) submissionidan — `Math.round((submission.score / submission.total) * practiceBlock.maxScore)`. `maxScore` `null` bo'lsa — ball ko'rsatilmaydi, faqat holat/foiz.
- **Darsni tamomlash balli**: agar `lesson_completions`da talaba uchun yozuv mavjud bo'lsa — `lesson.completionScore` to'liq beriladi (proporsional emas, hammasi yoki hech narsa). `completionScore` `null` bo'lsa — ball yo'q, faqat "tamomlangan" belgisi.
- **Darsning umumiy balli** = barcha amaliyot bloklarining olingan ballari yig'indisi + tamomlash balli (agar tamomlangan bo'lsa). Umumiy maksimal = barcha `maxScore`lar yig'indisi + `completionScore`.
- **O'tish sharti** (`passThresholdEnabled`): agar yoqilgan bo'lsa, talaba keyingi darsni ochish uchun **kamida bitta amaliyot blokida** (yoki barcha amaliyot bloklarida — implementatsiya bosqichida bitta aniq qoidaga kelishiladi, quyida ochiq savol) `passThresholdPercent`% dan kam bo'lmagan natija ko'rsatishi kerak.

## 3. Backend API

### O'qituvchi (`@Roles('teacher', 'super')`)

- `GET lessons/:id/practice-blocks` — darsning amaliyot bloklari ro'yxati (o'qituvchi ko'rinishida, submissionlarsiz).
- `POST lessons/:id/practice-blocks` — yangi bo'sh blok yaratish (`testId: null`).
- `PATCH practice-blocks/:id` — `{ testId?, description?, maxScore? }`.
- `DELETE practice-blocks/:id`.
- `POST lessons/:id/practice-blocks/reorder` — `{ blockIds: string[] }` (mavjud content-blocks reorder patterniga o'xshash).
- `PATCH lessons/:id` — mavjud endpointga `passThresholdEnabled`, `passThresholdPercent`, `completionScore` maydonlari qo'shiladi.

Ownership: parent-chain (`lessonId → module → course → course.adminId`), mavjud `content-blocks` modulidagi `assertLessonOwnership` pattern qayta ishlatiladi.

### Talaba (`@Roles('student')`)

- `GET lessons/:id/practice-blocks` (talaba ko'rinishida) — bloklar + har biri uchun: `submissions` ro'yxati (barcha urinishlar: id, submittedAt, score, total), hisoblangan `earnedScore`. Kirishdan oldin `StudentAccessService.assertStudentLessonAccess` orqali kurs kirish huquqi tekshiriladi (mavjud pattern).
- `POST lessons/:id/complete` — `lesson_completions`ga yozuv qo'shadi (talaba "Keyingi dars" yoki "Amaliyot" tugmasini bosganda chaqiriladi). Idempotent — mavjud bo'lsa xato bermaydi, shunchaki mavjud yozuvni qaytaradi.
- Test topshirish — mavjud submission-yaratish endpointi (`POST tests/:slug/submissions` yoki shunga o'xshash, joriy nomini implementatsiya bosqichida tekshirib olamiz) o'zgarishsiz qayta ishlatiladi.

## 4. "Amaliyot konteksti" — TakeTestPage'ning maxsus rejimi

Test o'zining mustaqil `/t/:slug` havolasi orqali topshirilganda — testning o'z sozlamalari (`showResults`, `oneByOne`, `requireAuth`, `deadline`) to'liq ishlaydi, hech narsa o'zgarmaydi.

Test **dars-amaliyot** sifatida (`practice_blocks` orqali) topshirilganda — frontend `TakeTestPage`ni maxsus, majburlangan qiymatlar bilan ishga tushiradi (testning DB'dagi haqiqiy sozlamalaridan qat'iy nazar):
- `showResults = 'immediately'` (natija darhol)
- `oneByOne = false` (barcha savollar birga)
- `requireAuth = true` (faqat login qilgan foydalanuvchi)
- `deadline` — e'tiborga olinmaydi

Bu **faqat frontend-darajasidagi render/oqim xatti-harakati** — backend `tests` jadvalidagi qiymatlarni o'zgartirmaydi, submission yaratish logikasi ham farqlanmaydi. Amaliyot-kontekstini frontend qanday aniqlashi (masalan yangi route `/lessons/:lessonId/practice/:blockId` yoki mavjud `/t/:slug`ga query-parametr qo'shish) implementatsiya bosqichida hal qilinadi.

## 5. Frontend

- `courseStore.ts`: `addPracticeBlock`, `removePracticeBlock`, `movePracticeBlock`, `setPracticeBlockTest`, `setPracticeBlockDescription`, `setPassThreshold` — hozirgi sinxron (`void`) versiyalardan `Promise<void>`ga o'tkaziladi, yangi backend endpointlariga ulanadi (mavjud content-block action'lari qanday qilingan bo'lsa, shunga o'xshab — awaitlab, keyin local state'ni yangilash, optimistic update yo'q).
- Yangi `setLessonCompletionScore` action — `completionScore` uchun.
- `MyCoursesPage.tsx`ning `LessonReader`iga "Amaliy qism" tugmasi qo'shiladi (rasmda ko'rsatilgan "Amaliyotni yakunlamoqga tayyormisiz? / Tamomlash" oqimidan keyin yoki alohida — aniq joylashuvi implementatsiya bosqichida). Amaliyot ekrani: "Dars uchun yulduzlar yig'ildi" (umumiy, ikki qismli: "Amaliyot" + "Darsni tamomlash"), har bir amaliyot blokining o'z "Sizning natijalaringiz" ro'yxati (urinish raqami, sana, ball, "Ochish"/"Qayta o'tish" tugmalari).
- "Keyingi dars" yoki "Amaliyot" tugmasi bosilganda `POST lessons/:id/complete` chaqiriladi (agar hali chaqirilmagan bo'lsa).

## 6. Qamrov chegarasi (bu safar NIMA qilinmaydi)

- `PracticeBlockType`ning `image`/`file`/`audio` turlari — faqat `test` turi ulanadi, qolganlari keyingi safar.
- Qo'lda (kurator tomonidan) tekshirish/baholash — yo'q, faqat avtomatik, darhol baholash.
- Urinishlar soni cheklovi — yo'q, talaba cheksiz qayta urinishi mumkin.
- Kurs bo'ylab umumiy ball agregatsiyasi (barcha darslar yig'indisi, masalan "10/106") — faqat dars darajasida hisoblanadi, kurs darajasida yig'indi bu safar qo'shilmaydi.

## 7. Ochiq savol — implementatsiya bosqichida hal qilinadi

`passThresholdPercent` tekshiruvi bir nechta amaliyot bloki bo'lsa qanday hisoblanadi — **har biri** alohida shu foizga yetishi kerakmi, yoki ularning **o'rtacha/umumiy** natijasi shu foizga yetishi kerakmi? Bu `MyCoursesPage.tsx`dagi `maxUnlockedIndex` mantig'iga bog'lanadigan joy, implementatsiya rejasida aniq qoida sifatida belgilanadi (tavsiya: barcha amaliyot bloklarining umumiy foizi, ya'ni `earnedScore_total / maxScore_total * 100 >= passThresholdPercent`, chunki bu "dars balli" tushunchasi bilan izchil).
