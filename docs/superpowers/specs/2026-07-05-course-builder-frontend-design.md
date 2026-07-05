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
  type: 'editor' | 'video' | 'image' | 'file';
  // video/image/file: mahalliy fayl nomi va vaqtinchalik object URL (URL.createObjectURL)
  fileName?: string;
  previewUrl?: string;
  // editor: Tiptap (rich-text) chiqishi, HTML sifatida
  html?: string;
}
```

Foydalanuvchi bilan aniqlashtirishdan so'ng "Embed" blok tushunchasi "Tahrirchi" (Tiptap asosidagi rich-text) blokiga almashtirildi. Blok tanlash panelida (rasmdagi ko'p variantlarga mos) qo'shimcha turlar — Audio, Tugma, Xabar, Chek-list, Bo'lish belgisi, Notion — vizual jihatdan ko'rsatiladi, lekin `disabled` holatda (bosilmaydi), chunki ular hozirgi qamrovga kirmaydi.

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

Kontent ketma-ket **bloklar ro'yxati** (`ContentBlock[]`) sifatida modellanadi. To'rtta faol blok turi: `editor` (Tiptap rich-text), `video`, `image`, `file` (uchtasi ham mahalliy fayl tanlash orqali, `URL.createObjectURL` bilan vaqtinchalik preview).

## Store

`apps/frontend/src/stores/courseStore.ts` — zustand store, quyidagi amallar bilan:

- `addCourse(title)`, `renameCourse(id, title)`, `deleteCourse(id)`
- `addModule(courseId, title)`, `renameModule(courseId, moduleId, title)`, `deleteModule(courseId, moduleId)`
- `addLesson(courseId, moduleId, title)`, `renameLesson(...)`, `deleteLesson(...)`, `toggleLessonStatus(...)`
- `addBlock(courseId, moduleId, lessonId, block)`, `updateBlock(..., blockId, data)`, `removeBlock(...)`

Barcha ID'lar `crypto.randomUUID()` orqali generatsiya qilinadi (backend bo'lmagani uchun).

## Komponentlar

- `apps/frontend/src/pages/CoursesPage.tsx` — asosiy sahifa, ichki `state: ViewState` (discriminated union: `'courses' | 'modules' | 'lessons' | 'editor'`) orqali qaysi komponent ko'rsatilishini va tanlangan `courseId`/`moduleId`/`lessonId`ni boshqaradi.
- `apps/frontend/src/components/course/CourseGrid.tsx` — bosqich 1.
- `apps/frontend/src/components/course/ModulesView.tsx` — bosqich 2.
- `apps/frontend/src/components/course/LessonsView.tsx` — bosqich 3.
- `apps/frontend/src/components/course/LessonEditorView.tsx` — bosqich 4: dars sarlavhasi (inline tahrirlanadigan), holat tugmasi, bo'sh holat ("Ichki kontentini to'ldiring") yoki mavjud bloklar ro'yxati, va pastda `BlockPicker`.
- `apps/frontend/src/components/course/BlockPicker.tsx` — Tahrirchi/Video/Rasm/Fayl kartochkalari faol; Audio/Tugma/Xabar/Chek-list/Bo'lish belgisi/Notion kartochkalari vizual jihatdan ko'rsatiladi, lekin `disabled` (rasmdagi to'liq variant to'plamiga mos, lekin faqat qamrovga kirgan turlar ishlaydi).
- `apps/frontend/src/components/course/EditorBlock.tsx` — Tiptap (`@tiptap/react` + `@tiptap/starter-kit`) o'rab oluvchi komponent, `html` orqali boshqariladi.
- `apps/frontend/src/components/course/ContentBlockView.tsx` — bitta blokni ko'rsatish (preview + o'chirish tugmasi). `editor`: `EditorBlock`, `video`: `<video>` player, `image`: `<img>`, `file`: fayl nomi + ikonka.
- `apps/frontend/src/components/course/PromptModal.tsx` — kurs/modul/dars nomi kiritish uchun qayta ishlatiladigan oddiy modal.

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
