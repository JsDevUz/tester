# Kurs "Tariflar" va "Guruhlar" bo'limlari — Design Spec

## Maqsad

Kurs darajasidagi sidebar panelida (`CourseSidePanel.tsx`, `variant='full'`) allaqachon ro'yxatda
turgan, lekin bosib bo'lmaydigan ikkita tab — **"Ishga tushirish va tariflar"** va **"Guruhlar"** —
ni ishga tushirish. Faqat UI/UX, frontend-only, mock ma'lumot bilan (backend keyinga qoldirilgan).
Referens: Exode.biz platformasidagi "Запуск и тарифы" va "Группы" bo'limlari.

## Scope

- Kurs darajasida (`CourseContentPage` bilan bir xil darajada) ikkita yangi sahifa:
  `CourseLaunchPage` (Tariflar) va `CourseGroupsPage` (Guruhlar).
- Dars (lesson) darajasiga tegishli emas — `LESSON_TABS` o'zgarmaydi.
- Backend/API yo'q — barcha holat `courseStore.ts` (zustand) ichida saqlanadi, xuddi
  mavjud `modules`/`lessons` kabi.

## Ma'lumot modeli

`apps/frontend/src/stores/courseStore.ts` ga qo'shiladi:

```typescript
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  groupId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Launch {
  id: string;
  name: string;
  active: boolean;
  plans: PricingPlan[];
}

export interface Group {
  id: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  curatorIds: string[];
  studentIds: string[];
}
```

`Course` interfeysiga qo'shiladi: `launches: Launch[]`, `groups: Group[]` (default bo'sh massiv,
mavjud kurslar bilan orqaga moslik uchun store yaratilishida `[]` bilan boshlanadi).

**Store action'lari (barchasi mavjud CRUD pattern bo'yicha — courseId asosida topib, immutable
yangilash):**
- `addLaunch(courseId, name)` — yangi Launch yaratadi, `active: false`, `plans: []`
- `toggleLaunchActive(courseId, launchId)`
- `renameLaunch(courseId, launchId, name)`
- `addPricingPlan(courseId, launchId, plan: Omit<PricingPlan, 'id'>)`
- `removePricingPlan(courseId, launchId, planId)`
- `addGroup(courseId, name)` — yangi Group, barcha flag `false`, massivlar bo'sh
- `renameGroup(courseId, groupId, name)`
- `toggleGroupChat(courseId, groupId)`
- `toggleGroupChannel(courseId, groupId)`
- `setGroupCurators(courseId, groupId, curatorIds: string[])`
- `addStudentToGroup(courseId, groupId, studentId)`
- `removeStudentFromGroup(courseId, groupId, studentId)`
- `deleteGroup(courseId, groupId)`

**Mock ma'lumot manbalari:**
- Kuratorlar: yangi const `MOCK_CURATORS: { id: string; name: string }[]` — joriy admin nomi
  (authStore'dan) + 2 ta o'ylab topilgan ism, komponent darajasida yoki alohida faylda
  (`apps/frontend/src/data/mockCurators.ts`).
- O'quvchilar: mavjud `MOCK_STUDENTS` (`apps/frontend/src/pages/StudentsPage.tsx` dagi) eksport
  qilinadi va guruh a'zoligi shu ro'yxatdan tanlanadi (`studentIds` shu ro'yxatdagi `id` larga
  ishora qiladi).

## Navigatsiya

`apps/frontend/src/pages/CoursesPage.tsx` dagi `ViewState` union kengaytiriladi:

```typescript
type ViewState =
  | { view: 'list' }
  | { view: 'content'; courseId: string }
  | { view: 'launch'; courseId: string }
  | { view: 'groups'; courseId: string }
  | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };
```

`CourseSidePanel.tsx`:
- `FULL_TABS` da `launch` va `groups` uchun `isTabClickable` `variant !== 'lesson'` holatda ham
  `true` qaytaradi (hozir har doim `false`).
- Yangi propslar: `activeFullTab?: 'content' | 'launch' | 'groups'`,
  `onSelectLaunch?: () => void`, `onSelectGroups?: () => void`.
- `variant='full'` uchun `isTabActive` endi `activeFullTab` bilan solishtiradi (hozir faqat
  `content` qaytaradi).

`CourseContentPage`, yangi `CourseLaunchPage`, `CourseGroupsPage` — barchasi bir xil prop
signature (`courseId`, `onBackToList`, navigatsiya callback'lari) bilan `CoursesPage`dan
render qilinadi, xuddi hozirgi `content`/`editor` almashinuvi kabi.

## "Tariflar" sahifasi — `CourseLaunchPage.tsx`

Layout: `CourseContentPage` bilan bir xil (`flex gap-2 p-6 sm:flex-row`, chapda asosiy kontent,
o'ngda `CourseSidePanel`).

**"Ishga tushirish sozlamalari" kartasi** (birinchi `Launch`, agar yo'q bo'lsa avtomatik
bo'sh nom bilan yaratiladi):
- Toggle qatori: chapda sarlavha ("Запуск в продаже" / "Запуск не в продаже" — `active`
  qiymatiga qarab matn), pastda tavsif matni; o'ngda badge ("Faol" — yashil / "Qoralama" —
  kulrang); eng o'ngda toggle switch (mavjud toggle pattern, `PracticeSection.tsx`dagi kabi).
- "Ishga tushirish nomi" input, belgi sanog'i ko'rsatiladi (`{value.length} / 65`, maxLength=65).
- Pastida statik matn "Barchasi saqlandi" (chunki zustand darhol yozadi, alohida "saqlash"
  tugmasi yo'q — mavjud loyiha patterniga mos).

**"Tariflar" kartasi:**
- Sarlavha + tavsif ("Bu yerda tariflarni qo'shishingiz mumkin").
- "Tarif yaratish" tugmasi (yashil, `bg-green-500 hover:bg-green-600`, `+` ikonka).
- Agar `plans.length === 0`: bo'sh holat (`Inbox` ikonka + "Hali tarif yo'q" matni), xuddi
  boshqa bo'sh holatlar kabi (`PracticeSection.tsx` pattern).
- Aks holda: ro'yxat — har bir `PricingPlan` uchun karta: nomi (font-semibold), narx
  (`{price.toLocaleString()} UZS`), status nuqtasi (yashil agar `startDate` o'tgan/yo'q bo'lsa),
  amal muddati matni (`{startDate} — {endDate}` yoki "Cheksiz" agar ikkalasi ham null).

**Modal — "Tarif yaratish"** (`PromptModal` pattern asosida yangi maxsus modal komponent,
`CreatePricingPlanModal.tsx`, chunki bir nechta maydon kerak — mavjud `PromptModal` bitta
input uchun mo'ljallangan):
- Guruh tanlash `<select>`: `course.groups` ro'yxatidan, + "Guruhsiz" opsiyasi (`groupId: null`).
- "Tarif nomi" input, belgi sanog'i (masalan max 65).
- "Tavsif" `<textarea>`, ixtiyoriy, placeholder "Masalan, boshqa tariflardan farqi".
- "Narx (UZS)" number input (required, min=0).
- "Chegirmasiz narx (UZS)" number input, ixtiyoriy.
- "Boshlanish sanasi" / "Tugash sanasi" — ikkita `<input type="date">`, ixtiyoriy.
- "Tarif yaratish" tugmasi (to'liq kenglik, indigo, `name` va `price` bo'sh bo'lsa disabled).

## "Guruhlar" sahifasi — `CourseGroupsPage.tsx`

Ikki ichki holat, local `useState<string | null>` (`selectedGroupId`) bilan boshqariladi —
alohida route/view emas (xuddi `CourseContentPage`dagi modul-collapse pattern kabi soddaligicha).

### Holat A — Guruhlar ro'yxati (`selectedGroupId === null`)

- Sarlavha "Guruhlarni boshqarish" + tavsif "O'quvchilarni ajratish orqali o'quv jarayonini
  soddalashtirish".
- "Guruh yaratish" tugmasi (yashil) + o'ng tomonda "{N} ta guruh" matni.
- Bo'sh holat: "Hali guruh yo'q" (`Inbox` ikonka), agar `course.groups.length === 0`.
- Aks holda: har bir `Group` uchun karta (bosilganda `setSelectedGroupId(group.id)`):
  - Yuqorida: `Users` ikonka + `{studentIds.length} ta ishtirokchi`.
  - Guruh nomi (font-semibold, kattaroq).
  - Pastki qator, kichik matn, nuqta bilan ajratilgan: cheklov holati ("Cheklovsiz" — statik,
    chunki cheklov funksiyasi scope'da yo'q) • kurator holati (`curatorIds.length === 0` bo'lsa
    "Kuratorsiz", aks holda birinchi kurator nomi + agar ko'p bo'lsa `+N`).
  - Agar `groupChatEnabled`/`groupChannelEnabled` — mos badge'lar ("Chat", "Kanal").

### Holat B — Guruh ichki ko'rinishi (`selectedGroupId` mavjud)

- Breadcrumb: Kurslar > {course.title} > Guruhlar > {group.name}.
- Ichki mini-tab navigatsiyasi (chap tomonda kichik vertikal ro'yxat, `CourseSidePanel`ning
  kichraytirilgan versiyasi emas — oddiy ikki tugmali segment, local
  `useState<'students'|'settings'>`):

**"O'quvchilar" ichki tab:**
- "O'quvchi qo'shish" tugmasi (yashil) → `AddStudentToGroupModal` ochadi: `MOCK_STUDENTS`
  ro'yxati checkbox bilan, joriy `group.studentIds`da bo'lganlar oldindan belgilangan,
  qidiruv input bilan filtrlash (mavjud `StudentsPage` qidiruv patterniga mos), "Qo'shish"
  tugmasi bosilganda `addStudentToGroup` har bir tanlangan `id` uchun chaqiriladi.
- "BARCHA O'QUVCHILAR" sarlavhasi + son badge (`group.studentIds.length`).
- Ro'yxat: `MOCK_STUDENTS.filter(s => group.studentIds.includes(s.id))` — avatar (mavjud
  `paletteFor`/`initials` helper'lar `StudentsPage.tsx`dan import yoki takrorlanadi), ism,
  telefon, o'ng tomonda "olib tashlash" (`X`) tugmasi → `removeStudentFromGroup`.
- Bo'sh holat: "O'quvchilar topilmadi" + "Ular guruh tarifi orqali sotib olingandan keyin
  paydo bo'ladi" tushuntirish matni.

**"Sozlamalar" ichki tab:**
- "Asosiy sozlamalar" karta: "Guruh nomi" input (`renameGroup`), "Guruh chati" toggle +
  tavsif ("Alohida chat o'quvchilar va kuratorlar uchun"), "Guruh kanali" toggle + tavsif
  ("Alohida kanal, faqat maktab xodimlari yoza oladi").
- "Guruh kuratorlari" karta: `<select>` orqali `MOCK_CURATORS`dan tanlash (tanlanganda
  `setGroupCurators` bilan mavjud ro'yxatga qo'shiladi, agar allaqachon bo'lsa e'tiborsiz
  qoldiriladi), tanlangan kuratorlar ro'yxati pastda (ism + `X` olib tashlash tugmasi).
- "Amallar" karta: "Guruhni o'chirish" (qizil tugma) — bosilganda tasdiqlash uchun oddiy
  `confirm()` yoki mavjud confirm-modal pattern (`SubmissionsPage.tsx`dagi `confirmDelete`
  state pattern) ishlatiladi, tasdiqlansa `deleteGroup` chaqirilib `selectedGroupId` null
  qilinadi (ro'yxatga qaytadi).
- "Guruhlarga qaytish" tugmasi (`setSelectedGroupId(null)`).

## Global Constraints

- Frontend-only, backend chaqiruvi yo'q.
- Barcha yangi UI mavjud dizayn tizimiga mos: `rounded-2xl`, `border border-border`,
  indigo/green aksent ranglar, mavjud bo'sh-holat va modal pattern'lari qayta ishlatiladi.
- Yangi fayllar: `CourseLaunchPage.tsx`, `CourseGroupsPage.tsx`,
  `CreatePricingPlanModal.tsx`, `AddStudentToGroupModal.tsx` — barchasi
  `apps/frontend/src/components/course/` papkasida.
- `MOCK_STUDENTS` `StudentsPage.tsx`dan eksport qilinadi (`export const MOCK_STUDENTS`),
  boshqa joyda takrorlanmaydi.
- Build har doim `npm run build --workspace=apps/frontend` bilan tekshiriladi (tsc + vite),
  xato bo'lmasligi kerak.
