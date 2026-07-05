# Kurs Tuzuvchi (Course Builder) — Frontend Faza 1 Dizayni

## Maqsad

O'qituvchi uchun kurs → modul → dars ierarxiyasini yaratish va har bir darsga kontent (rich-text, video, rasm, fayl) qo'shish imkonini beruvchi frontend UI. Bu faza faqat frontend — backend/API yo'q, ma'lumotlar frontend state'ida (zustand) saqlanadi va sahifa yangilansa yo'qoladi. Backend integratsiyasi keyingi alohida faza.

## Navigatsiya — ikki panelli, bitta ekran

`/lessons` (`CoursesPage.tsx`) — bitta sahifa, ichida ikkita panel yonma-yon (mobil/tor ekranda ustma-ust):

- **Chap panel** (`CourseTreePanel.tsx`, sobit kenglik `w-72`): tepada tanlangan kurs nomi (bosilsa dropdown — boshqa kurslar ro'yxati + "Yangi kurs yaratish"), qidiruv inputi, va pastda **barcha modullar va ularning darslari bitta daraxt sifatida** (har modul mustaqil kollaps/ochiq, ichida darslar ro'yxati). Pastda "+ Modul qo'shish" tugmasi.
- **O'ng panel**: chap paneldan tanlangan darsning tahrirlash ekrani (`LessonEditorView.tsx`). Hech narsa tanlanmagan bo'lsa — bo'sh holat ("Chapdan darsni tanlang").

Sahifa hech qachon to'liq almashmaydi — faqat chap panelda tanlov o'zgaradi, o'ng panel shunga qarab yangilanadi. Bu avvalgi "bosqichma-bosqich drill-down" yondashuvidan farqli — foydalanuvchi bilan sinovdan so'ng ortiqcha ichma-ichlik keltirib chiqargani sababli ikki panelli daraxt tuzilishga o'zgartirildi.

Agar hali birorta kurs yaratilmagan bo'lsa, butun sahifa o'rniga "Hali kurs yaratilmagan" bo'sh holati va "+ Yangi kurs" tugmasi ko'rsatiladi.

## Ma'lumotlar modeli (frontend-only)

```typescript
interface ContentBlock {
  id: string;
  type: 'editor' | 'video' | 'image' | 'file';
  // video/image/file: mahalliy fayl nomi va vaqtinchalik object URL (URL.createObjectURL)
  fileName?: string;
  previewUrl?: string;
  // editor: Tiptap (rich-text) chiqishi, HTML sifatida
  html?: string;
  // video: YouTube (yoki boshqa) tashqi havola — fayl yuklashga alternativ
  embedUrl?: string;
  // video/image/file: o'qituvchi kiritgan ko'rinadigan nom (fileName'dan mustaqil)
  label?: string;
}

interface Lesson {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  blocks: ContentBlock[];
}

interface Module {
  id: string;
  title: string;
  orderIndex: number;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  modules: Module[];
}
```

Kontent ketma-ket **bloklar ro'yxati** (`ContentBlock[]`) sifatida modellanadi. To'rtta faol blok turi:

- **Tahrirchi** (`type: 'editor'`) — Tiptap asosidagi to'liq rich-text muharrir. "+" tugma orqali slash-command uslubidagi mini-menyu ochiladi: Paragraf, Jadval, Ro'yxat, Havola, HTML fragmenti (code block), Sarlavha, Tekshiruv ro'yxati (task list), Ajratuvchi (horizontal rule).
- **Video** (`type: 'video'`) — YouTube havola inputi (iframe orqali ko'rsatiladi) YOKI mahalliy fayl yuklash (drag-drop/bosish orqali, `<video>` preview), ikkalasi ham qo'llab-quvvatlanadi. Qo'shimcha "Videoning nomi" inputi.
- **Rasm** (`type: 'image'`) — mahalliy fayl tanlash, `<img>` preview.
- **Fayl** (`type: 'file'`) — mahalliy fayl tanlash, faqat fayl nomi + ikonka ko'rsatiladi (preview yo'q).

Blok tanlash panelida (`BlockPicker.tsx`) qo'shimcha turlar — Audio, Tugma, Xabar, Chek-list, Bo'lish belgisi, Notion — vizual jihatdan ko'rsatiladi, lekin `disabled` holatda (bosilmaydi), chunki ular hozirgi qamrovga kirmaydi.

Har bir blok kartochkasi "Blok №N" sarlavhasi, tur nomi, yuqoriga/pastga surish (reorder), kollaps/ochish va o'chirish (X) tugmalari bilan ko'rsatiladi (`ContentBlockView.tsx`). Kollaps holati `LessonEditorView`da markazlashtirilgan (`Set<string>`) — yangi blok qo'shilganda barcha mavjud bloklar avtomatik kollaps qilinadi, shu bilan foydalanuvchi diqqati yangi blokka qaratiladi.

## Store

`apps/frontend/src/stores/courseStore.ts` — zustand store, quyidagi amallar bilan:

- `addCourse(title)`, `renameCourse(id, title)`, `deleteCourse(id)`
- `addModule(courseId, title)`, `renameModule(courseId, moduleId, title)`, `deleteModule(courseId, moduleId)`
- `addLesson(courseId, moduleId, title)`, `renameLesson(...)`, `deleteLesson(...)`, `toggleLessonStatus(...)`
- `addBlock(courseId, moduleId, lessonId, block)`, `updateBlock(..., blockId, data)`, `removeBlock(...)`, `moveBlock(..., blockId, 'up' | 'down')` (qo'shni blok bilan almashtiradi)

Barcha ID'lar `crypto.randomUUID()` orqali generatsiya qilinadi (backend bo'lmagani uchun).

## Komponentlar

- `apps/frontend/src/pages/CoursesPage.tsx` — asosiy sahifa: tanlangan `courseId` va `{ moduleId, lessonId } | null` tanlovni saqlaydi, ikki panelni yonma-yon render qiladi.
- `apps/frontend/src/components/course/CourseTreePanel.tsx` — chap panel: kurs almashtirish dropdown, qidiruv, modul/dars daraxti (kollaps holati har modul uchun mustaqil `Set<string>` orqali saqlanadi).
- `apps/frontend/src/components/course/LessonEditorView.tsx` — o'ng panel: dars sarlavhasi (inline tahrirlanadigan), holat tugmasi, bo'sh holat ("Ichki kontentini to'ldiring") yoki mavjud bloklar ro'yxati, va pastda `BlockPicker`.
- `apps/frontend/src/components/course/BlockPicker.tsx` — blok tanlash kartochkalari (faol: Tahrirchi/Video/Rasm/Fayl; disabled: Audio/Tugma/Xabar/Chek-list/Bo'lish belgisi/Notion).
- `apps/frontend/src/components/course/EditorBlock.tsx` — Tiptap o'rab oluvchi komponent (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-table*`, `@tiptap/extension-task-list`/`task-item`), slash-command mini-menyu bilan.
- `apps/frontend/src/components/course/ContentBlockView.tsx` — bitta blokni "Blok №N" sarlavha-kartochkasi ichida ko'rsatadi (reorder/kollaps/o'chirish tugmalari bilan), tur bo'yicha ichki kontent (`EditorBlock`, video/image/file preview yoki fayl tanlash maydoni, har uchalasida "nomi" inputi).
- `apps/frontend/src/components/course/PromptModal.tsx` — kurs/modul/dars nomi kiritish uchun qayta ishlatiladigan oddiy modal.

## AppShell integratsiyasi

`apps/frontend/src/App.tsx` dagi `/lessons` route'i:
```tsx
{ path: '/lessons', element: <PrivateRoute><CoursesPage /></PrivateRoute> },
```
`ComingSoonPage title="Darslar"` o'rniga almashtirildi. Boshqa AppShell/sidebar o'zgarishi kerak emas — "Darslar" ikonkasi allaqachon bor.

## Qo'shimcha kutubxonalar

`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-link`, `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-code-block`, `@tailwindcss/typography` (Tiptap chiqishini `.prose` orqali stillash uchun).

## Qamrovdan tashqari (keyingi fazalar)

- Backend/DB (courses/modules/lessons jadvallari, API)
- Real fayl yuklash (Backblaze B2)
- Talaba tomoni (kursni ko'rish, video tomosha qilish, progress)
- Enrollment/ruxsat mexanizmi
- "Sozlamalar"/"Amaliyot" tablari dars ekranida
- Drag-and-drop qayta tartiblash (modul/dars/blok)
- Audio, Tugma, Xabar, Chek-list, Bo'lish belgisi, Notion blok turlari

## Test strategiyasi

Frontend-only, backend yo'q — vitest/RTL orqali komponent testlari yozilmaydi (loyihada frontend uchun mavjud test infratuzilmasi yo'q, faqat `tsc -b && vite build` orqali tip xatolari tekshiriladi). Qo'lda tekshirish: dev serverda kurs yaratish → modul → dars → har blok turini qo'shish/tahrirlash/o'chirish oqimini sinash.
