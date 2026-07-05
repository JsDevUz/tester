# Kurs Tuzuvchi (Course Builder) — Frontend Faza 1 Dizayni

## Maqsad

O'qituvchi uchun kurs → modul → dars ierarxiyasini yaratish va har bir darsga kontent (video, rasm, fayl, embed) qo'shish imkonini beruvchi frontend UI. Bu faza faqat frontend — backend/API yo'q, ma'lumotlar frontend state'ida (zustand) saqlanadi va sahifa yangilansa yo'qoladi. Backend integratsiyasi keyingi alohida faza.

## Navigatsiya — bosqichma-bosqich drill-down

To'rtta bosqich, bitta sahifa (`/lessons`, `CoursesPage.tsx`) ichida ichki state bilan almashtiriladi. Har bosqichda "← Orqaga" tugmasi oldingi bosqichga qaytaradi.

1. **Kurslar ro'yxati** — kartochkalar grid. Har kartochkada kurs nomi va undagi modullar soni. Yuqorida "+ Yangi kurs" tugmasi (modal orqali nom so'raydi).
2. **Modullar ro'yxati** — tanlangan kurs nomi sarlavha sifatida, "← Orqaga" bilan kurslar ro'yxatiga qaytish. Modullar ro'yxati (nom + ichidagi darslar soni). "+ Yangi modul" tugmasi.
3. **Darslar ro'yxati** — tanlangan modul nomi sarlavha, "← Orqaga" bilan modullar ro'yxatiga qaytish. Darslar ro'yxati (nom + holat badge: qoralama/e'lon qilingan). "+ Yangi dars" tugmasi.
4. **Dars tahrirlash** — tanlangan dars nomi (inline tahrirlanadigan input), "← Orqaga" bilan darslar ro'yxatiga qaytish, "E'lon qilish/Qoralama" holatini almashtiruvchi tugma. Pastda kontent tahrirlash maydoni.

## Ma'lumotlar modeli (frontend-only)

```typescript
interface ContentBlock {
  id: string;
  type: 'video' | 'image' | 'file' | 'embed';
  // video/image/file: mahalliy fayl nomi va vaqtinchalik object URL (URL.createObjectURL)
  fileName?: string;
  previewUrl?: string;
  // embed: tashqi havola (YouTube/Vimeo va h.k.)
  embedUrl?: string;
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

Kontent — Tiptap emas, oddiy ketma-ket **bloklar ro'yxati** (`ContentBlock[]`) sifatida modellanadi (rich-text join emas — chunki blok turlari faqat media/embed, matn formatlashning o'zi talab qilinmagan; agar keyinchalik erkin matn bloki kerak bo'lsa, `type: 'text'` va `html: string` maydoni bilan kengaytiriladi). Bu YAGNI: Tiptap kabi og'ir kutubxonani hozircha kiritmaymiz, chunki hozirgi talab faqat 4 turdagi blokni ketma-ket qo'shish/o'chirish/qayta tartiblash.

## Store

`apps/frontend/src/stores/courseStore.ts` — zustand store, quyidagi amallar bilan:

- `addCourse(title)`, `renameCourse(id, title)`, `deleteCourse(id)`
- `addModule(courseId, title)`, `renameModule(courseId, moduleId, title)`, `deleteModule(courseId, moduleId)`
- `addLesson(courseId, moduleId, title)`, `renameLesson(...)`, `deleteLesson(...)`, `toggleLessonStatus(...)`
- `addBlock(courseId, moduleId, lessonId, block)`, `removeBlock(...)`, `reorderBlocks(...)`

Barcha ID'lar `crypto.randomUUID()` orqali generatsiya qilinadi (backend bo'lmagani uchun).

## Komponentlar

- `apps/frontend/src/pages/CoursesPage.tsx` — asosiy sahifa, ichki `view` state (`'courses' | 'modules' | 'lessons' | 'editor'`) va tanlangan `courseId`/`moduleId`/`lessonId` orqali qaysi komponent ko'rsatilishini boshqaradi.
- `apps/frontend/src/components/course/CourseGrid.tsx` — bosqich 1.
- `apps/frontend/src/components/course/ModulesView.tsx` — bosqich 2.
- `apps/frontend/src/components/course/LessonsView.tsx` — bosqich 3.
- `apps/frontend/src/components/course/LessonEditorView.tsx` — bosqich 4: dars sarlavhasi, holat tugmasi, bo'sh holat ("Ichki kontentini to'ldiring") yoki mavjud bloklar ro'yxati, va pastda `BlockPicker`.
- `apps/frontend/src/components/course/BlockPicker.tsx` — 4 ta kartochka-tugma (Video, Image, File, Embed). Video/Image/File bosilsa yashirin `<input type="file">` ochiladi; Embed bosilsa inline URL input ko'rsatiladi.
- `apps/frontend/src/components/course/ContentBlockView.tsx` — bitta blokni ko'rsatish (preview + o'chirish tugmasi). Video: `<video>` player, Image: `<img>`, File: fayl nomi + ikonka, Embed: iframe (agar YouTube/Vimeo linkka mos kelsa) yoki oddiy havola.

## AppShell integratsiyasi

`apps/frontend/src/App.tsx` dagi `/lessons` route'i:
```tsx
{ path: '/lessons', element: <PrivateRoute><CoursesPage /></PrivateRoute> },
```
`ComingSoonPage title="Darslar"` o'rniga almashtiriladi. Boshqa AppShell/sidebar o'zgarishi kerak emas — "Darslar" ikonkasi allaqachon bor.

## Qamrovdan tashqari (keyingi fazalar)

- Backend/DB (courses/modules/lessons jadvallari, API)
- Real fayl yuklash (Backblaze B2)
- Talaba tomoni (kursni ko'rish, video tomosha qilish, progress)
- Enrollment/ruxsat mexanizmi
- "Sozlamalar"/"Amaliyot" tablari dars ekranida
- Drag-and-drop qayta tartiblash (modul/dars/blok)
- Matn (rich-text) bloki

## Test strategiyasi

Frontend-only, backend yo'q — vitest/RTL orqali komponent testlari yozilmaydi (loyihada frontend uchun mavjud test infratuzilmasi yo'q, faqat `tsc -b && vite build` orqali tip xatolari tekshiriladi). Qo'lda tekshirish: dev serverda kurs yaratish → modul → dars → har 4 turdagi blok qo'shish/o'chirish oqimini sinash.
