# Kurs Tuzuvchi UI — Exode uslubiga moslashtirish

## Maqsad

Kurs tuzuvchi UI'ni (frontend-only, backend hali yo'q) Exode.biz platformasining navigatsiya va joylashuv uslubiga moslashtirish: ikki panelli daraxt navigatsiyasi o'rniga uch bosqichli (kurslar ro'yxati → kontent sahifasi → dars tahrirlash) tuzilma, va kurs ichida doim ko'rinadigan statik yon panel.

## Navigatsiya — uch bosqich

1. **Kurslar ro'yxati** (`/lessons`) — kartochkalar grid, filtrsiz (bitta kurs turi bor hozircha). Har kartochkada: kurs nomi, "N modul • N dars" statistika. Yuqorida "+ Yangi kurs" tugmasi.
2. **Kontent sahifasi** (kursni bossa) — breadcrumb "Kurslar > [Kurs nomi] > Kontent". Tepada "Mundarija" tavsif kartochkasi: sarlavha + statik tushuntirish matni + "N modul • N dars" statistika + "+ Modul qo'shish" tugmasi. Pastda bitta ustunli, **kollaps qilinadigan** modullar ro'yxati: har modul boshida ochish/yopish strelkasi, ochilganda o'sha moduldagi darslar ro'yxati (nom + holat badge: qoralama/e'lon qilingan + o'chirish tugmasi) ko'rinadi. Har modul tagida "+ Dars qo'shish", ro'yxat tagida "+ Modul qo'shish".
3. **Dars tahrirlash** (darsni bossa) — mavjud `LessonEditorView` deyarli o'zgarishsiz: dars sarlavhasi, holat tugmasi, bloklar ro'yxati, `BlockPicker`. Yuqorisiga breadcrumb "Kurslar > [Kurs] > [Modul] > [Dars]" qo'shiladi.

Har uch bosqichda ham chapdan "Orqaga" mavjud emas — breadcrumb'ning istalgan bo'g'inini bosish orqali navigatsiya qilinadi (masalan "Kurslar"ni bossa ro'yxatga, kurs nomini bossa Kontent sahifasiga qaytadi).

## O'ng statik panel

Kurs ichidagi ikkala sahifada (Kontent va Dars tahrirlash) ko'rinadi, Kurslar ro'yxatida yo'q. Tarkibi:

- **Kontent** — joriy faol tab (Kontent yoki Dars tahrirlash sahifasida bo'lsa ham shu tab active ko'rinadi, chunki ikkalasi ham "kontent" mundarijasi ostida)
- **Sozlamalar**, **Ishga tushirish va tariflar**, **Guruhlar**, **O'quvchilar**, **FAQ**, **Vazifalarni tekshirish** — barchasi `disabled` (bosilmaydi, kulrang matn/ikonka, cursor-not-allowed)
- Pastda **"Kurslarga qaytish"** tugmasi — bosilganda kurslar ro'yxatiga qaytaradi

## Ma'lumotlar modeli va store

O'zgarishsiz qoladi — `apps/frontend/src/stores/courseStore.ts`dagi `Course`/`Module`/`Lesson`/`ContentBlock` interfeyslari va barcha CRUD amallar (`addCourse`, `addModule`, `addLesson`, `addBlock`, `moveBlock` va h.k.) saqlanadi. Bu spec faqat UI/navigatsiya qatlamiga tegishli.

## Komponentlar

- `apps/frontend/src/pages/CoursesPage.tsx` — qayta quriladi: ichki `view` state discriminated union orqali uch bosqichni boshqaradi:
  ```typescript
  type ViewState =
    | { view: 'list' }
    | { view: 'content'; courseId: string }
    | { view: 'editor'; courseId: string; moduleId: string; lessonId: string };
  ```
- `apps/frontend/src/components/course/CourseGrid.tsx` — bosqich 1 (kurslar ro'yxati kartochkalari + "+ Yangi kurs"). Ilgari shu nomdagi komponent bo'lgan va keyinchalik o'chirilgan; qayta yaratiladi.
- `apps/frontend/src/components/course/CourseContentPage.tsx` — bosqich 2: breadcrumb, "Mundarija" kartochkasi, kollaps qilinadigan modul/dars ro'yxati. `CourseSidePanel`ni ham render qiladi.
- `apps/frontend/src/components/course/CourseSidePanel.tsx` — statik o'ng panel, `activeTab: 'content'` propi va "Kurslarga qaytish" uchun `onBackToList` callback qabul qiladi.
- `apps/frontend/src/components/course/LessonEditorView.tsx` — mavjud komponent saqlanadi, faqat breadcrumb qo'shish uchun ustiga yupqa wrapper qo'shiladi (yoki breadcrumb `CoursesPage`da render qilinadi, `LessonEditorView`ning o'zi o'zgarmaydi).
- `apps/frontend/src/components/course/CourseTreePanel.tsx` — endi ishlatilmaydi, o'chiriladi (uning o'rnini `CourseContentPage`dagi kollaps ro'yxat egallaydi).
- `apps/frontend/src/components/course/PromptModal.tsx`, `BlockPicker.tsx`, `ContentBlockView.tsx`, `EditorBlock.tsx` — o'zgarishsiz qoladi.

## Breadcrumb komponenti

Kichik qayta ishlatiladigan `Breadcrumb.tsx` komponenti: `{ label: string; onClick?: () => void }[]` massivini qabul qilib, oxirgi elementdan tashqari hammasini bosiladigan qilib ko'rsatadi (oxirgi element joriy sahifa, bosilmaydi, qalin shrift).

## Qamrovdan tashqari

Avvalgi spec (`2026-07-05-course-builder-frontend-design.md`)dagi barcha "qamrovdan tashqari" bandlar amal qiladi: backend/DB, real fayl yuklash (Backblaze B2), talaba tomoni, enrollment, "Sozlamalar"/"Guruhlar"/boshqa tablarning haqiqiy funksionalligi, drag-and-drop qayta tartiblash (modul/dars darajasida — blok darajasida reorder allaqachon bor).

## Test strategiyasi

Avvalgidek: frontend-only, backend yo'q. Faqat `tsc -b && vite build` orqali tip xatolari tekshiriladi. Qo'lda tekshirish: kurs yaratish → Kontent sahifasida modul/dars qo'shish → modulni kollaps/ochish → darsni bosib tahrirlash ekraniga o'tish → breadcrumb orqali orqaga qaytish → statik panelning disabled tablari bosilmasligini va "Kurslarga qaytish" ishlashini tekshirish.
