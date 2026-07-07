# Mening Maktabim (School Settings) — Design Spec

## Maqsad

`/school` route hozircha `ComingSoonPage` placeholder ko'rsatadi. Uni Exode.biz'dagi
"Mening maktabim" bo'limiga o'xshash, lekin soddalashtirilgan UI/UX bilan almashtirish:
faqat 3 ta kichik bo'lim — **Maktab sozlamalari**, **Mening xodimlarim**,
**Ro'yxatdan o'tish**. Frontend-only, mock ma'lumot bilan (backend keyinga qoldirilgan).

## Scope

- Maktab domeni sozlamalari kerak emas (Exode'dagi "Maktab domeni" kartasi olib
  tashlanadi).
- To'liq (10+ checkbox) ruxsat-tizimi kerak emas — 3 ta oddiy rol bilan
  almashtiriladi.
- "Ro'yxatdan o'tish sozlamalari" (Exode'da "Maxfiylik va avtorizatsiya", ko'p
  toggle bilan) o'rniga faqat **maktab taklif havolasi** (invitation link).

## Ma'lumot modeli — `apps/frontend/src/stores/schoolStore.ts`

```typescript
export type SchoolStaffRole = 'admin' | 'teacher' | 'curator';

export interface SchoolStaff {
  id: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}

interface SchoolState {
  name: string;
  description: string;
  staff: SchoolStaff[];
  inviteToken: string;

  renameSchool: (name: string) => void;
  setSchoolDescription: (description: string) => void;
  addStaff: (data: Omit<SchoolStaff, 'id'>) => void;
  removeStaff: (staffId: string) => void;
  regenerateInviteToken: () => void;
}
```

**Boshlang'ich holat:**
- `name`: `"Mening maktabim"`
- `description`: `""`
- `staff`: 3 ta mock yozuv — joriy admin (authStore'dan olingan ism, agar mavjud
  bo'lsa, aks holda `"Administrator"`, `role: 'admin'`) + 2 ta o'ylab topilgan
  xodim (masalan `"Dilshod Rahimov"` — `teacher`, `"Zarina Yoldosheva"` —
  `curator`) — `getMockCurators` pattern bilan bir xil ruhda, lekin alohida
  massiv (bu real xodim ro'yxati, kurator tanlash ro'yxati emas).
- `inviteToken`: `crypto.randomUUID()` orqali generatsiya qilingan tasodifiy
  qiymat.

**Rollar** (`admin`/`teacher`/`curator`) mavjud `Admin.role` (`'student'|'teacher'|'super'`,
`apps/frontend/src/api/auth.ts`) bilan bog'lanmaydi — bu alohida, faqat UI
darajasidagi "maktab xodimi" ro'yxati, haqiqiy avtorizatsiya emas.

## Navigatsiya

**`apps/frontend/src/components/AppShell.tsx`** — `SECTIONS` massividagi `school`
yozuvi:

```typescript
{
  key: 'school', label: 'Mening Maktabim', icon: School, path: '/school/settings',
  subItems: [
    { label: 'Maktab sozlamalari', path: '/school/settings', icon: SlidersHorizontal },
    { label: 'Mening xodimlarim', path: '/school/staff', icon: UsersRound },
    { label: "Ro'yxatdan o'tish", path: '/school/invite', icon: Link2 },
  ],
},
```

Bu mavjud flyout-menyu mexanizmini (hover/click, `AppShell.tsx`dagi
`showFlyout`/`hoveredKey`) o'zgarishsiz ishlatadi — "O'quvchilar" bo'limi bilan
bir xil pattern.

**`apps/frontend/src/App.tsx`** — eski qator:

```typescript
{ path: '/school', element: <PrivateRoute><ComingSoonPage title="Mening Maktabim" /></PrivateRoute> },
```

Bunga almashtiriladi:

```typescript
{ path: '/school', element: <Navigate to="/school/settings" replace /> },
{ path: '/school/settings', element: <PrivateRoute><SchoolSettingsPage /></PrivateRoute> },
{ path: '/school/staff', element: <PrivateRoute><SchoolStaffPage /></PrivateRoute> },
{ path: '/school/invite', element: <PrivateRoute><SchoolInvitePage /></PrivateRoute> },
```

(Eski `/school` havolasi buzilmasligi uchun redirect saqlanadi.)

**`apps/frontend/src/components/school/SchoolSidePanel.tsx`** — ichki tab
navigatsiyasi. `CourseSidePanel`dan farqli o'laroq bu **route-based** (local
`ViewState` emas), chunki har bir bo'lim endi mustaqil URL:

```typescript
interface SchoolSidePanelProps {}

const TABS = [
  { path: '/school/settings', label: 'Maktab sozlamalari', description: "Ma'lumot va moslashtirish", icon: SlidersHorizontal },
  { path: '/school/staff', label: 'Mening xodimlarim', description: 'Xodimlar va rollar', icon: UsersRound },
  { path: '/school/invite', label: "Ro'yxatdan o'tish", description: 'Taklif havolasi', icon: Link2 },
];
```

`useLocation()` orqali joriy `pathname` bilan solishtirib active holatni
belgilaydi, `useNavigate()` orqali bosilganda o'tadi. Vizual uslub
`CourseSidePanel`dagi tab-ro'yxat bilan bir xil (`rounded-2xl bg-white p-2`,
indigo active holat), lekin "Kurslarga qaytish" tugmasi yo'q (bu mustaqil
sahifa, orqaga qaytish AppShell navigatsiyasi orqali).

## Sahifalar

Barchasi `apps/frontend/src/pages/` papkasida, layout: `flex gap-3 p-6
sm:flex-row` (chapda asosiy kontent, o'ngda `SchoolSidePanel`) —
`CourseSettingsPage` bilan bir xil pattern, lekin `AppShell` bilan o'raladi
(mustaqil sahifa, `CoursesPage`ning ichki view'i emas).

### `SchoolSettingsPage.tsx`

- Sarlavha: "Maktab sozlamalari"
- Karta — "Maktab nomi va tavsifi":
  - "Maktab nomi" input, belgi sanog'i (`{name.length} / 50`, maxLength=50)
  - "Tavsif" textarea, belgi sanog'i (`{description.length} / 200`,
    maxLength=200), placeholder: "Maktabingiz haqida qisqacha ma'lumot"
- Domen bo'limi YO'Q (spec talabiga ko'ra olib tashlangan).

### `SchoolStaffPage.tsx`

- Sarlavha: "Mening xodimlarim" + "Xodim qo'shish" tugmasi (yashil,
  `bg-green-500`, `+` ikonka) o'ng tomonda
- Xodimlar ro'yxati (har biri karta): avatar (ism bosh harflari, hash-based
  rang palitrasi — mavjud `paletteFor`/`initials` pattern), ism, email, rol
  badge (`Administrator` — indigo, `O'qituvchi` — teal, `Kurator` — amber),
  o'ng tomonda "olib tashlash" (`X`) tugmasi (`removeStaff` chaqiradi)
- Bo'sh holat: `staff.length === 0` bo'lsa (`Inbox` ikonka + "Hali xodim yo'q")
  — amalda kamdan-kam ko'rinadi, chunki boshlang'ich holatda 3 ta bor, lekin
  barcha o'chirilsa ko'rsatiladi
- **Modal — "Xodim qo'shish"** (`AddStaffModal.tsx`, `PromptModal` pattern
  asosida, bir nechta maydon kerak bo'lgani uchun maxsus komponent):
  - "Ism" input (required)
  - "Email" input, `type="email"` (required)
  - "Rol" `<select>`: Administrator/O'qituvchi/Kurator (default: O'qituvchi)
  - "Qo'shish" tugmasi — ism yoki email bo'sh bo'lsa disabled

### `SchoolInvitePage.tsx`

- Sarlavha: "Ro'yxatdan o'tish" + tavsif: "Ushbu havola orqali o'quvchilar
  maktabingizga ro'yxatdan o'tishlari mumkin"
- Karta:
  - `readonly` text input: `{window.location.origin}/join/{inviteToken}`
  - "Nusxalash" tugmasi yonida (`navigator.clipboard.writeText`), bosilganda
    2 soniyaga "Nusxalandi!" matni + yashil check-ikonka ko'rsatadi (`useState`
    + `setTimeout`), keyin asl "Nusxalash" holatiga qaytadi
- Pastda alohida karta: "Havolani yangilash" tugmasi (`bg-red-50
  text-red-600`, ogohlantiruvchi rang, chunki eski havolani ishlamas qiladi)
  — bosilganda tasdiqlash modali chiqadi, tavsif: "Eski havola ishlamay
  qoladi. O'quvchilar faqat yangi havola orqali ro'yxatdan o'tishlari mumkin
  bo'ladi." Tasdiqlansa `regenerateInviteToken()` chaqiriladi.

  Mavjud `ConfirmDeleteModal` (`apps/frontend/src/components/course/ConfirmDeleteModal.tsx`)
  qayta ishlatiladi, lekin uning tasdiqlash tugmasi matni hozir qattiq
  kodlangan `"O'chirish"` — bu kontekstga mos emas ("yangilash" harakati
  uchun). Shu componentga ixtiyoriy `confirmLabel?: string` prop qo'shiladi
  (default qiymat `"O'chirish"`, mavjud chaqiruvchilar o'zgarishsiz qoladi),
  bu sahifada `confirmLabel="Yangilash"` beriladi.

## Global Constraints

- Frontend-only, backend chaqiruvi yo'q.
- Yangi fayllar: `apps/frontend/src/stores/schoolStore.ts`,
  `apps/frontend/src/components/school/SchoolSidePanel.tsx`,
  `apps/frontend/src/components/school/AddStaffModal.tsx`,
  `apps/frontend/src/pages/SchoolSettingsPage.tsx`,
  `apps/frontend/src/pages/SchoolStaffPage.tsx`,
  `apps/frontend/src/pages/SchoolInvitePage.tsx`.
- Mavjud `ConfirmDeleteModal` (`apps/frontend/src/components/course/ConfirmDeleteModal.tsx`)
  havola-yangilash tasdiqlash uchun qayta ishlatiladi (import qilinadi, nusxa
  yaratilmaydi).
- Dizayn tizimi: `rounded-2xl`, `border-border` (agar border kerak bo'lsa),
  indigo/green/red aksent ranglar — mavjud kurs sahifalari bilan bir xil.
- Build har doim `npm run build --workspace=apps/frontend` bilan tekshiriladi
  (tsc + vite), xatosiz bo'lishi kerak.
