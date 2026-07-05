# Dars "Amaliyot" bo'limi — Dizayn

## Maqsad

Kurs tuzuvchidagi dars tahrirlash sahifasida hozircha `disabled` bo'lgan "Amaliyot" tabini faollashtirish: o'qituvchi "Darsning amaliy qismi" togglini yoqib, darsga bir yoki bir nechta mavjud test biriktirishi, va ixtiyoriy ravishda minimal o'tish foizini belgilashi mumkin bo'ladi.

## Umumiy oqim

`LessonEditorView` chap paneli endi ikkita almashinadigan ko'rinishga ega: **Kontent** (mavjud blok tahrirlash, o'zgarishsiz) va **Amaliyot** (yangi). Qaysi ko'rinish faol ekanini `activeTab: 'content' | 'practice'` local state boshqaradi.

`CourseSidePanel`dagi (`variant="lesson"`) "Amaliyot" tabi `lesson.practiceEnabled` qiymatiga qarab yoqiladi/o'chiriladi:
- `practiceEnabled === false` bo'lsa — tab hali ham `disabled` (bosilmaydi, kulrang).
- `practiceEnabled === true` bo'lsa — tab bosiladigan bo'ladi, bosilganda `activeTab` `'practice'`ga o'tadi.
- `PracticeToggleCard` ("Darsning amaliy qismi" switch) `practiceEnabled`ni o'chirsa va o'sha paytda `activeTab === 'practice'` bo'lsa, avtomatik `'content'`ga qaytariladi.

## Ma'lumotlar modeli

`apps/frontend/src/stores/courseStore.ts`dagi `Lesson` interfeysiga qo'shiladi:

```typescript
export interface PracticeBlock {
  id: string;
  testId: string | null; // hali tanlanmagan bo'lsa null
}

export interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
  practiceEnabled: boolean;
  practiceBlocks: PracticeBlock[];
  passThresholdEnabled: boolean;
  passThresholdPercent: number | null; // 0-100, faqat passThresholdEnabled=true bo'lsa ma'noli
}
```

`addLesson` bu maydonlarni default qiymatlar bilan (`practiceEnabled: false`, `practiceBlocks: []`, `passThresholdEnabled: false`, `passThresholdPercent: null`) yaratadi.

## Store amallari (courseStore.ts)

Mavjud CRUD naqshiga mos (courseId/moduleId/lessonId orqali ichki massiv/maydonni yangilaydi):

- `setLessonPracticeEnabled(courseId, moduleId, lessonId, enabled: boolean)`
- `addPracticeBlock(courseId, moduleId, lessonId)` — yangi `{ id: newId(), testId: null }` qo'shadi
- `removePracticeBlock(courseId, moduleId, lessonId, blockId)`
- `movePracticeBlock(courseId, moduleId, lessonId, blockId, direction: 'up' | 'down')` — `moveBlock`ning reorder logikasi bilan bir xil (qo'shni element bilan almashtirish)
- `setPracticeBlockTest(courseId, moduleId, lessonId, blockId, testId: string)`
- `setPassThreshold(courseId, moduleId, lessonId, data: { enabled: boolean; percent?: number | null })`

## UI — Amaliyot ko'rinishi

Chap panelda (Kontent bloklari o'rnida) `activeTab === 'practice'` bo'lganda ko'rsatiladi:

- Har bir `PracticeBlock` — Kontent blokining "Blok №N" kartochkasiga o'xshash dizaynda: sarlavha "Amaliyot bloki №N", ichida test tanlash `<select>` (barcha testlar ro'yxatidan — nomi + savollar soni ko'rsatiladi, masalan "Matematika testi (12 ta savol)"). Reorder (▲▼, `isFirst`/`isLast` bilan cheklangan) va o'chirish (X) tugmalari — `ContentBlockView`dagi bilan bir xil vizual naqsh.
- Bloklar ro'yxati bo'sh bo'lsa — "Hali test qo'shilmagan" bo'sh holati.
- Pastda "+ Test qo'shish" tugmasi.
- Eng pastda, alohida kartochkada: **"Minimal o'tish balini talab qilish"** toggle-switch (`PracticeToggleCard`dagi bilan bir xil switch stili). Yoqilganda pastida "Minimal foiz" son-inputi (0-100 oralig'i, `%` belgisi bilan) paydo bo'ladi.

## Testlarni yuklash

`apps/frontend/src/api/tests.ts`ga yangi funksiya:

```typescript
export interface AllTestsItem {
  id: string;
  name: string;
  questionCount: number;
}

export async function apiListAllTests(): Promise<AllTestsItem[]> {
  const res = await client.get('/live/tests');
  return res.data.map((t: { id: string; name: string; liveQuestionCount: number }) => ({
    id: t.id,
    name: t.name,
    questionCount: t.liveQuestionCount,
  }));
}
```

Backend o'zgarishisiz — mavjud `GET /live/tests` (`apps/backend/src/live/live.controller.ts:20`, `LiveService.listTests`) qayta ishlatiladi, chunki u joriy o'qituvchining **barcha** testlarini (tur filtrisiz) nomi va savollar soni bilan qaytaradi. `liveQuestionCount` maydoni bu kontekstda "live uchun mos savollar soni" degani, lekin biz uni shunchaki "savollar soni" sifatida ko'rsatamiz — aniqlik uchun UI'da label sifatida faqat umumiy savol sonini ko'rsatish talab qilinsa, bu keyingi backend integratsiyasida to'g'rilanadi (qamrovdan tashqari, quyida qayd etilgan).

Bu chaqiruv `LessonEditorView` birinchi marta `activeTab === 'practice'`ga o'tganda amalga oshiriladi (lazy load, `useEffect` bilan, faqat bir marta — keyingi tab almashinishlarida qayta so'ralmaydi).

## Komponentlar

- `apps/frontend/src/components/course/LessonEditorView.tsx` — `activeTab` state qo'shiladi, chap panel shartli ravishda Kontent yoki Amaliyot ko'rinishini render qiladi.
- `apps/frontend/src/components/course/PracticeSection.tsx` — yangi, Amaliyot ko'rinishining o'zi: testlar ro'yxatini yuklash, `PracticeBlock`lar ro'yxati, "+ Test qo'shish", pass-threshold kartochkasi.
- `apps/frontend/src/components/course/PracticeBlockView.tsx` — yangi, bitta Amaliyot blokining kartochkasi (test select + reorder/o'chirish tugmalari), `ContentBlockView`ning sarlavha-kartochka naqshiga mos.
- `apps/frontend/src/components/course/CourseSidePanel.tsx` — "Amaliyot" tab endi `disabled` prop orqali shartli boshqariladi (`lesson-` variantida `practiceEnabled` propiga bog'liq), bosilganda `onSelectPractice` callback chaqiradi.
- `apps/frontend/src/components/course/LessonEditorView.tsx`dagi `PracticeToggleCard` — endi `enabled`/`onToggle` proplarini qabul qiladi (hozir ichki `useState` bilan ishlaydi), `lesson.practiceEnabled`ga bog'lanadi.
- `apps/frontend/src/api/tests.ts` — `apiListAllTests` qo'shiladi.

## Qamrovdan tashqari

- Backend/DB'da `practiceEnabled`/`practiceBlocks`/pass-threshold saqlanishi (courseStore hali frontend-only qoladi).
- Talaba tomonida Amaliyot bo'limini bajarish oqimi (test topshirish, natijani pass-threshold bilan solishtirish).
- Amaliyot blokidan testni to'g'ridan-to'g'ri ko'rish/tahrirlash (faqat tanlash, mavjud Testlar bo'limiga o'tish orqali tahrirlanadi).
- `liveQuestionCount`ning "live uchun mos savollar" ma'nosini "umumiy savollar soni"ga aniqlashtirish (backend `TestDetail.questions.length` orqali) — hozircha mavjud maydon ishlatiladi, aniqlik farqi kichik va keyingi bosqichda to'g'rilanadi.

## Test strategiyasi

Frontend-only qism uchun avvalgidek: `tsc -b && vite build` orqali tip tekshiruvi, backend test suite'ga tegilmagani uchun mavjud 87 ta backend test bilan ishlash davom etadi. Qo'lda tekshirish: "Darsning amaliy qismi" togglini yoqish → Amaliyot tab faollashishi → bir nechta test bloki qo'shish → har biriga test tanlash → reorder/o'chirish → pass-threshold togglini yoqib foiz kiritish → togglini o'chirib Amaliyot tabining yana disabled bo'lishini tekshirish.
