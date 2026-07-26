# Classroom autosave, simplified recording, "Jonli darslar" tarixi va mobil call bar — dizayn

## Maqsad

To'rtta bog'liq muammoni hal qilish:

1. **Theme bug**: jonli darsga kirganda board har doim light bilan boshlanadi,
   saytning umumiy (global) dark/light tanlovidan qat'i nazar.
2. **Yozib olish modali murakkab**: hozir 3 ta variant bor ("To'liq",
   "Faqat chizma (ovozli)", "Faqat chizma (ovozsiz)"), aslida uchinchisi
   alohida tanlov emas, balki har doim ishlaydigan bazaviy xatti-harakat
   bo'lishi kerak.
3. **Erkin darslar butunlay yo'qoladi**: `isFree=true` sessiyalar hech qachon
   DB'ga yozilmaydi (qarang: `2026-07-19-classroom-replay-design.md` §
   "Qamrov chegaralari" — bu spec o'sha qarorni ataylab bekor qiladi).
   Natijada na ustoz, na o'quvchi tugagan erkin darsning oxirgi chizma
   holatini qayta topa olmaydi.
4. **Mobil call bar noqulay**: mikrofon/qo'ng'iroqni tugatish tugmalari
   ekran markazida (pastki qatordan yuqorida) turadi va ularni vaqtincha
   yashiradigan chevron-pastga/chevron-yuqoriga tugmalar bor — bular
   ortiqcha va tugmalar eng pastda turishi kerak.

Bu spec quyidagilarni kiritadi:
- Har qanday jonli dars (erkin yoki guruhli, yozib olingan yoki yo'q)
  tugaganda **doskaning oxirgi holati avtomatik saqlanadi** (ovozsiz).
- Ustoz "Yozib olish"ni bosganda faqat **ovoz** yozish tanlovi qoladi:
  "To'liq" (bosqichma-bosqich replay + audio) yoki "Faqat chizma (ovozli)"
  (audio + statik yakuniy chizma).
- Ustozning "Mening darslarim" (erkin darslar tarixi) va o'quvchining
  birlashtirilgan "Jonli darslar" ro'yxati qo'shiladi.
- Davomat/tarix modallarida ikkita mustaqil ko'rish tugmasi: "To'liq
  ko'rish" (agar audio/replay bo'lsa) va "Chizmani ko'rish" (har doim, statik).
- Mobil call bar (`ClassroomCallBar.tsx`) eng pastga tushiriladi, chevron
  yashirish/ko'rsatish mexanizmi butunlay olib tashlanadi.

## Qamrov chegaralari

**Ichida:**
- Theme fallback tuzatish (3 joy).
- `RecordSessionModal.tsx` — 2 variantga tushirish.
- Backend: erkin sessiyalar uchun `class_sessions` qatori yaratish va
  `endSession`da board snapshot/tarix/recording persistensiyasini yoqish.
- Yangi `free_session_participants` jadvali — faqat login qilgan
  foydalanuvchilar uchun (mehmonlar kirmaydi).
- Ustoz uchun yangi "Mening darslarim" sahifasi (erkin darslar ro'yxati).
- O'quvchi uchun yangi "Jonli darslar" nav bo'limi va sahifasi
  (guruhli + erkin birlashtirilgan).
- Statik "Chizmani ko'rish" ko'rinishini alohida qayta ishlatiladigan
  komponentga chiqarish.
- Ikkita ko'rish tugmasi (`CourseClassesPage.tsx` davomat modali +
  yangi "Mening darslarim" modali).
- `ClassroomCallBar.tsx` — collapse/chevron state va tugmalarni olib
  tashlash, joylashuvni eng pastga (`bottom`) tushirish.

**Tashqarida:**
- Erkin sessiyalarni o'chirish oqimi (`deleteSession`) — mavjud holicha
  faqat `course.adminId` orqali tekshiradi (`with: { course: true }`);
  `courseId` endi `null` bo'lishi mumkinligi sababli, agar kimdir
  (masalan to'g'ridan-to'g'ri API orqali) erkin sessiyani shu metod bilan
  o'chirishga urinsa, `row.course` `null` bo'ladi va `course.adminId`
  o'qishda runtime xatolikka olib keladi. Frontendda o'chirish tugmasi
  erkin darslar uchun qo'shilmagani sababli oddiy foydalanuvchi bu holatga
  duch kelmaydi, lekin implementatsiya bosqichida `deleteSession`ga
  `row.course === null` uchun erta `NotFoundException`/`teacherId`
  orqali tekshiruv qo'shish kerak — mavjud xulq-atvorni buzib
  qo'ymaslik uchun kichik himoya chizig'i sifatida.
- Mehmon (guest, login qilmagan) ishtirokchilarni tarixga yozish — ular
  hech qanday hisobga bog'lanmagani uchun tamomila chiqarib tashlanadi.
- `content_blocks` "Jonli dars" blok turini erkin darslar bilan ishlashi —
  o'zgarmaydi (u faqat guruhli darslar uchun, hozirgi holicha qoladi).
- Server qayta ishga tushganda faol erkin sessiyalarni tiklash/yakunlash —
  hozirgi xatti-harakat (butunlay yo'qolishi) o'zgarmaydi, chunki bu holat
  juda kam uchraydi va alohida muammo (YAGNI).

## Bo'lim 1 — Theme fallback tuzatish

Muammo: `classroomTheme` real-vaqtda ishtirokchilar orasida socket orqali
sinxronlanadi, lekin har bir fallback yo'li literal `"light"`ga qaytadi,
`useThemeStore`dagi global temaga emas.

Uchta tuzatish:

1. `useClassroomSession.ts:78` — talaba uchun boshlang'ich holat hozir
   `INITIAL.classroomTheme` ("light") ga qattiq bog'langan; ustoz kabi
   `globalTheme`dan olinadi:
   ```ts
   classroomTheme: globalTheme, // role'dan qat'i nazar
   ```
2. `useClassroomSession.ts:117` — socket join javobida
   `snap.classroomTheme ?? "light"` o'rniga
   `snap.classroomTheme ?? globalTheme` — server hali hech qanday tema
   saqlamagan bo'lsa (yangi sessiya), joriy global temaga tushadi.
3. `useClassroomReplay.ts:40` — `baseState()` `useThemeStore`ni umuman
   import qilmaydi; hook `globalTheme` parametrini qabul qiladi
   (`ClassroomReplayPage.tsx`da chaqirilganda `useThemeStore((s) =>
   s.theme)` orqali uzatiladi) va yozib olingan tarixda `theme:set` eventi
   bo'lmasa shu qiymatga tushadi.

Boshqa arxitektura o'zgarishi yo'q — faqat "hali hech narsa tanlanmagan"
holatning ma'nosi "light" emas, "saytning joriy temasi" bo'lishi kerak.

## Bo'lim 2 — Yozib olish modali va avtomatik chizma saqlash

### 2.1 `RecordSessionModal.tsx` — 2 variant

`OPTIONS` massividan `boardSilent` olib tashlanadi. Qolgan ikkitasi ustiga
qisqa eslatma qo'shiladi:

```
Yozib olish
Chizma holati har doim avtomatik saqlanadi. Ovoz yozish uchun tanlang:

[Video] To'liq yozib olish
        Butun darsni ovoz bilan yozadi — keyinroq boshidan oxirigacha,
        chizmalar bosqichma-bosqich qayta ijro etilib, tomosha qilish mumkin.

[Mic]   Faqat chizma (ovozli)
        Dars ovozi yoziladi, lekin faqat sahifaning ENG OXIRGI holati
        saqlanadi — bosqichma-bosqich qayta ijro bo'lmaydi, faqat yakuniy
        chizma + ovoz saqlanadi.

Bekor qilish
```

`ClassRecordingMode` tipidan `'boardSilent'` frontend/backendning "tanlanadigan
qiymat" sifatida ishlatilishi qoladi (backend hali ham shu qiymatni
`recordingMode` ustuniga yozadi — pastga qarang), faqat modal uni endi
ko'rsatmaydi, chunki u endi ustoz TANLAYDIGAN narsa emas, balki hech narsa
tanlanmaganda ham sodir bo'ladigan natija.

### 2.2 Backend — avtomatik board snapshot, har doim

`classroom.service.ts`ning `endSession()` metodida hozirgi mantiq:

```ts
const isBoardOnly = s.recordingMode === 'boardAudio' || s.recordingMode === 'boardSilent';
const boardSnapshot = isBoardOnly ? this.buildBoardSnapshot(s) : null;
```

Bu shartsiz bo'ladi — `recordingMode`dan qat'i nazar, board snapshot HAR
DOIM quriladi (faqat `'full'` rejimida ham qo'shimcha sifatida, chunki
"bitta darsda ham to'liq, ham oxirgi chizma ko'rinsin" talabi bor):

```ts
const boardSnapshot = this.buildBoardSnapshot(s);
```

`historyEvents` filtri o'zgarmaydi (hali ham `recordingMode`ga bog'liq):
`'boardAudio'` — faqat pointer/scroll/zoom/page eventlari;
`recordingMode === null` (hech qanday audio tanlanmagan, faqat avtomatik
snapshot) — bo'sh massiv (`[]`) — chunki bosqichma-bosqich replay faqat
`'full'` va `'boardAudio'` uchun ma'noli, boshqa holatda uni saqlashning
keragi yo'q (xotira tejash uchun ham):

```ts
const historyEvents = s.recordingMode === 'full'
  ? (s.historyEvents ?? [])
  : s.recordingMode === 'boardAudio'
    ? (s.historyEvents ?? []).filter((event) => /* pointer/scroll/zoom/page */)
    : [];
```

`recordingMode` ustuniga `s.recordingMode ?? null` yoziladi (o'zgarmaydi) —
`null` "hech qanday audio yozilmagan, faqat avtomatik chizma bor" degani.

### 2.3 Ikkita ko'rish tugmasi

Hozir bitta "Replay ko'rish" tugmasi `recordingMode === 'full' ||
hasBoardSnapshot` shartida ko'rinadi. Endi ikkita mustaqil tugma:

- **"To'liq ko'rish"** — `recordingMode === 'full' || recordingMode ===
  'boardAudio'` bo'lganda ko'rinadi (audio bor demak). Mavjud
  `ClassroomReplayPage`ga o'tadi (`/classroom-history/:id/replay`) —
  o'zgarishsiz.
- **"Chizmani ko'rish"** — `hasBoardSnapshot` bo'lganda ko'rinadi (endi bu
  deyarli har doim `true`, chunki har bir yakunlangan darsda avtomatik
  snapshot bor). Yangi, yengil statik ko'rinish ochadi (pastga, §4 ga
  qarang) — audio/timeline yo'q, faqat oxirgi chizma.

Ikkalasi ham bir vaqtda ko'rinishi mumkin (masalan "To'liq" tanlanganda).
Ikonlar/uslub farqlanadi: "To'liq ko'rish" — asosiy (indigo, `Radio` ikon,
hozirgi uslub), "Chizmani ko'rish" — ikkinchi darajali (kulrang/oq border,
`PenTool` yoki `Eye` ikon) — ixcham, ikkalasi ham chiplike, sig'ishi uchun
matn kichikroq/yashirin (`hidden sm:inline` naqsh, mavjud kodda ishlatilgani
kabi).

## Bo'lim 3 — Erkin sessiyalarni persistensiya qilish

### 3.1 Schema o'zgarishi

`class_sessions.courseId` va `class_sessions.teacherId` erkin sessiyalar
uchun ham qator yaratilishi kerak bo'lgani uchun, `courseId` **nullable**
bo'ladi (`teacherId` allaqachon nullable, `onDelete: 'set null'`):

```ts
courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
// .notNull() olib tashlanadi
```

Migratsiya: `courseId` ustunidagi `NOT NULL` cheklovini olib tashlash.
Mavjud qatorlarga ta'sir qilmaydi (ularning barchasida `courseId` bor).

Yangi jadval — erkin sessiyada login qilgan ishtirokchilarni kuzatish
uchun:

```ts
export const freeSessionParticipants = pgTable('free_session_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sessionIdIdx: index('free_session_participants_session_id_idx').on(table.sessionId),
  userIdIdx: index('free_session_participants_user_id_idx').on(table.userId),
  uniqSessionUser: unique('free_session_participants_session_user_uniq').on(table.sessionId, table.userId),
}));
```

`attendanceRecords`ga tegilmaydi — u guruh sessiyalarga xos
(`enrollmentId` orqali), semantikasi farqli (kelish/kechikish/yo'qlik
holati), erkin darslarda esa faqat "kim qatnashdi" kifoya.

### 3.2 `createFreeSession` — DB qatori yaratish

```ts
async createFreeSession(teacherId: string): Promise<{ id: string }> {
  const [row] = await db.insert(classSessions).values({ courseId: null, teacherId }).returning();
  this.sessions.set(row.id, {
    id: row.id, courseId: null, courseName: null, isFree: true, hostUserId: teacherId,
    // ... qolgan maydonlar o'zgarmaydi
  });
  return { id: row.id };
}
```

Metod endi `async` bo'ladi (chaqiruvchi joyda `await` qo'shiladi —
`classroom.controller.ts`dagi `POST sessions/free` route handler).

### 3.3 `endSession` — erkin sessiyalar uchun ham persistensiya

Hozirgi `if (!s.isFree) { ... barcha DB yozuvlari ... }` blokining ichida
faqat **davomat qismi** (`participants` loop + `persistAttendance`)
`!s.isFree` bilan qoladi — chunki erkin darsda "guruh a'zoligi/kelish-
ketish" tushunchasi yo'q. Board snapshot / history / recording qismi
endi HAMMA sessiya turlari uchun ishlaydi:

```ts
async endSession(sessionId: string, byUserId: string | null): Promise<void> {
  const s = this.requireSession(sessionId);
  if (byUserId !== null && s.hostUserId !== byUserId) throw new ForbiddenException(...);
  if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }

  if (!s.isFree) {
    const now = Date.now();
    for (const p of s.participants.values()) {
      if (p.joinedAtMs !== null) {
        closeInterval(p, now);
        await this.persistAttendance(s.id, p);
      }
    }
  }

  const boardSnapshot = this.buildBoardSnapshot(s);
  const historyEvents = /* §2.2 dagi mantiq */;
  await db.update(classSessions)
    .set({ status: 'ended', endedAt: new Date(), historyEvents, recordingMode: s.recordingMode ?? null, boardSnapshot })
    .where(eq(classSessions.id, sessionId));
  if (s.recordingMode === 'full' || s.recordingMode === 'boardAudio') {
    void this.recording.stopRecording(s.id);
  }

  this.broadcaster.toRoom(sessionId, 'session:ended', {});
  this.sessions.delete(sessionId);
}
```

### 3.4 `startSessionRecording` — erkin sessiyalarda ham ruxsat

```ts
async startSessionRecording(sessionId: string, userId: string, mode: ClassroomRecordingMode): Promise<void> {
  const session = this.requireSessionHttp(sessionId);
  if (session.hostUserId !== userId) throw new ForbiddenException();
  // session.isFree tekshiruvi olib tashlandi
  session.recordingMode = mode;
  if (mode === 'full' || mode === 'boardAudio') {
    await this.recording.startRecording(sessionId, session.startedAtMs);
  }
}
```

### 3.5 Login qilgan ishtirokchini `free_session_participants`ga yozish

`studentJoin`ning erkin sessiya bo'limida (`classroom.service.ts:320-338`
atrofida), `userId` haqiqiy (guest emas) bo'lsa:

```ts
if (s.isFree) {
  // ... mavjud in-memory participant yaratish ...
  if (!userId.startsWith('guest:')) {
    await db.insert(freeSessionParticipants)
      .values({ sessionId: s.id, userId })
      .onConflictDoNothing(); // qayta qo'shilib chiqib ketsa (reconnect) takrorlanmasin
  }
}
```

`userId`ning `guest:` prefiksi bilan aniqlanishi — `classroom.gateway.ts`da
allaqachon shu formatda kelayotgani tasdiqlangan (JWT bo'lmasa
`guest:${guestId}`).

## Bo'lim 4 — Statik "Chizmani ko'rish" komponenti

`ClassroomReplayPage.tsx`dagi `isBoardOnly && boardSnapshot` filiali
(31-75 qatorlar atrofida) allaqachon aynan shu narsani qiladi — statik
`viewState` quradi va `ClassroomPdfViewer`ni `editable={false}` bilan
ko'rsatadi, timeline/audio'siz.

Bu logika kichik, mustaqil komponentga chiqariladi:

```tsx
// components/classroom/BoardSnapshotViewer.tsx
interface Props {
  snapshot: ClassBoardSnapshotData;
  onClose: () => void;
}
export function BoardSnapshotViewer({ snapshot, onClose }: Props) {
  // ClassroomPdfViewer'ni snapshot maydonlari bilan to'g'ridan-to'g'ri
  // ko'rsatadi — hech qanday hook/state kerak emas (butunlay statik),
  // useClassroomReplay/useClassroomTheme talab qilinmaydi.
  // Yopish tugmasi (X) + ixcham header.
}
```

Bu komponent modal sifatida (o'z sahifasi shart emas) yoki `/classroom-
history/:id/board` yengil route sifatida ochilishi mumkin — soddalik
uchun **modal** tanlanadi (yangi route/sahifa kerak emas, chunki bu faqat
bitta statik rasm-kabi ko'rinish, navigatsiya holatini saqlashning keragi
yo'q). `ClassroomReplayPage`ning o'zi ham ichkarida shu komponentni qayta
ishlatishi mumkin (`isBoardOnly` filialini shu componentga almashtirib) —
lekin bu ixtiyoriy tozalash, asosiy talab emas.

`GET /classroom/sessions/:id/replay` javobidagi `boardSnapshot` maydoni
allaqachon mavjud — yangi endpoint kerak emas, faqat frontend uni
`ClassroomReplayPage` o'rniga `BoardSnapshotViewer`ga uzatadi (yoki
`apiClassReplay` chaqiruvi natijasidan `boardSnapshot`ni ajratib oladi).

## Bo'lim 5 — Ustoz: "Mening darslarim" (erkin darslar tarixi)

Yangi sahifa, kurslardan mustaqil — ustozning barcha (guruhsiz) erkin
darslarini ro'yxatlaydi.

**Backend**: yangi endpoint `GET /classroom/my-free-sessions`
(`@Roles('teacher', 'super')`), `classroom.service.ts`ga yangi metod:

```ts
async myFreeSessionHistory(teacherId: string): Promise<ClassHistoryItem[]> {
  const rows = await db.query.classSessions.findMany({
    where: and(isNull(classSessions.courseId), eq(classSessions.teacherId, teacherId)),
    orderBy: desc(classSessions.startedAt),
  });
  // attendance counts yo'q (erkin darsda davomat tushunchasi yo'q) —
  // CourseClassesPage'dagi ClassHistoryItem'dan farqli, kichikroq shakl.
}
```

**Frontend**: yangi sahifa `FreeClassHistoryPage.tsx` — teacher/admin
navigatsiyasida (mavjud admin shell/sidebar'ga yangi element, aniq joyi
implementatsiya bosqichida admin sidebar strukturasiga qarab tanlanadi).
Ro'yxat qatorlari `CourseClassesPage.tsx`dagi tarix qatorlariga o'xshash
(sana, davomiylik), lekin kelish/kechikish/yo'qlik sonlarisiz. Qatorni
bosish — kichraytirilgan Davomat-uslubidagi modal ochadi (davomat ro'yxati
o'rniga bo'sh, faqat sarlavha + ikkita ko'rish tugmasi + "PDF nomi" kabi
metadata).

## Bo'lim 6 — O'quvchi: birlashtirilgan "Jonli darslar" ro'yxati

**Backend**: yangi endpoint `GET /classroom/my-sessions`
(`@Roles('student')`), ikki manbani birlashtiradi:

```ts
async myClassSessions(studentId: string): Promise<StudentClassSessionItem[]> {
  // 1) Guruhli: attendanceRecords -> groupEnrollments -> schoolMembers
  //    (studentId = callerId) -> classSessions (status='ended')
  const groupSessions = await db.select({ ... })
    .from(attendanceRecords)
    .innerJoin(groupEnrollments, eq(attendanceRecords.enrollmentId, groupEnrollments.id))
    .innerJoin(schoolMembers, eq(groupEnrollments.schoolMemberId, schoolMembers.id))
    .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
    .where(and(eq(schoolMembers.studentId, studentId), eq(classSessions.status, 'ended')));

  // 2) Erkin: freeSessionParticipants -> classSessions (status='ended')
  const freeSessions = await db.select({ ... })
    .from(freeSessionParticipants)
    .innerJoin(classSessions, eq(freeSessionParticipants.sessionId, classSessions.id))
    .where(and(eq(freeSessionParticipants.userId, studentId), eq(classSessions.status, 'ended')));

  // Ikkalasini birlashtirib, startedAt bo'yicha kamayish tartibida qaytaradi.
  // Ustoz ismi (teacherId -> users.name) har ikkala yo'lda ham join qilinadi.
}
```

Har bir qator: `{ sessionId, startedAt, teacherName, pdfName, hasBoardSnapshot, isFree }`.
`recordingMode`/`recordingUrl` qaytarilmaydi — o'quvchi bu ro'yxatdan
faqat **"Chizmani ko'rish"**ni oladi (aniq talab bo'yicha: "ustiga bosib
faqat ohirgi chizma holatini ko'ra olsin"), to'liq audio replay emas.

**Ruxsat tekshiruvi**: `GET /classroom/sessions/:id/replay` (yoki
`boardSnapshot`ni alohida qaytaradigan yengil variant) — hozirgi
`getReplay()`dagi kirish tekshiruvi faqat "kurs o'qituvchisi yoki shu
kursga yozilgan talaba"ni tekshiradi; erkin sessiya ishtirokchisi uchun
yangi shart qo'shiladi: `freeSessionParticipants`da `{ sessionId, userId }`
juftligi bor bo'lsa ham ruxsat beriladi.

**Frontend**:
- `StudentShell.tsx`ning `NAV_ITEMS`ga yangi element: `{ label: "Jonli
  darslar", shortLabel: "Darslar", path: "/live-classes", icon: Radio }`
  — mavjud "Jonli musobaqalar" (quiz, boshqa xususiyat)dan aniq
  farqlanishi uchun label ataylab boshqacha tanlangan, ikon esa allaqachon
  import qilingan `Radio`dan foydalanadi (kod bazasida ikkinchi marta
  ishlatilsa ham, ma'no kontekstga qarab aniq: "Jonli darslar" bo'limida).
  Mobil pastki navigatsiya `grid-cols-5`dan `grid-cols-6`ga (yoki profil
  bilan birga scroll/hidden ortiqcha elementlar naqsh) implementatsiya
  bosqichida hal qilinadi.
- Yangi sahifa `pages/StudentLiveClassesPage.tsx` — `StudentHistoryPage.tsx`
  ro'yxat naqshiga o'xshash: har bir qatorda sana, ustoz ismi, "erkin"/
  "guruhli" belgisi (badge), bosilganda `BoardSnapshotViewer` modalini
  ochadi (§4).

## Bo'lim 7 — Mobil call bar: chevron olib tashlash, eng pastga tushirish

`ClassroomCallBar.tsx` hozir mikrofon+qo'ng'iroqni tugatish tugmalarini
mobil ekranda pastdan yuqoriroq (`bottom-16`) joylashtiradi va ularning
tagida kichik chevron-pastga tugma qo'yadi — bosilsa panel butunlay
pastga sirg'alib yashiriladi, keyin xuddi shu joyda chevron-yuqoriga
tugma chiqadi (qayta ko'rsatish uchun). Bu ortiqcha bosqich — talab
bo'yicha ikkalasi ham olib tashlanadi, panel doim eng pastda ko'rinadi.

**O'zgarish** (`ClassroomCallBar.tsx`):
- `collapsed` state, `ChevronDown`/`ChevronUp` import va ikkala chevron
  tugma butunlay o'chiriladi.
- Tashqi `<div>` endi faqat mikrofon + qo'ng'iroqni tugatish tugmalarini
  o'z ichiga oladi (avvalgi `flex-col` + ichki `flex` guruhlash o'rniga
  bitta tekis `flex items-center gap-2` qator).
- Joylashuv `bottom-16` o'rniga eng pastga (`bottom-2` yoki shunga yaqin,
  xavfsiz zonani hisobga olib) tushiriladi — mobil pastki
  sahifa/zoom/split qatori bilan **to'qnashmasligini** qo'lda tekshirish
  kerak (ilgari aynan shu to'qnashuv sababli `bottom-16` + chevron
  yashirish mexanizmi qo'shilgan edi, komment bo'yicha). Agar to'qnashuv
  chiqsa, pastki qatorga nisbatan `z-index`/joylashuv orqali ustma-ust
  tushmaydigan tarzda moslashtiriladi (masalan pastki qatorning o'zi
  yon tomonga siljiydi yoki call bar undan biroz yuqoriroq, lekin
  avvalgidan pastroq turadi) — bu implementatsiya bosqichida ko'rish
  orqali hal qilinadi, chunki aniq piksel qiymati faqat real ekranda
  ko'rinadi.
- `hidden` prop (auto-hide overlay uchun, o'quvchi ekranida) o'zgarishsiz
  qoladi — bu boshqa mexanizm (chevron emas, tashqi holatdan boshqariladi).

## Xulosa jadvali — kim nima ko'radi

| Joy | Ko'rinadigan tugmalar |
|---|---|
| Ustoz — `CourseClassesPage` Davomat modali | "To'liq ko'rish" (agar audio bor bo'lsa) + "Chizmani ko'rish" (har doim) + "O'chirish" (o'zgarmadi) |
| Ustoz — yangi "Mening darslarim" (erkin) | "To'liq ko'rish" (agar audio bor bo'lsa) + "Chizmani ko'rish" (har doim) |
| O'quvchi — yangi "Jonli darslar" (birlashtirilgan) | Faqat "Chizmani ko'rish" (statik, har doim) |

## Testlash

- Backend (`classroom.service.spec.ts`):
  - `endSession`: erkin sessiya uchun ham `boardSnapshot` to'g'ri
    qurilishi va DB'ga yozilishi; davomat/attendance yozilmasligi.
  - `createFreeSession`: `class_sessions` qatori `courseId: null` bilan
    yaratilishi.
  - `startSessionRecording`: erkin sessiyada endi `ForbiddenException`
    otilmasligi.
  - `studentJoin`: erkin sessiyada login qilgan foydalanuvchi
    `freeSessionParticipants`ga yozilishi; guest yozilmasligi;
    qayta-qo'shilishda `onConflictDoNothing` orqali dublikat bo'lmasligi.
  - `myClassSessions`: guruhli + erkin natijalar to'g'ri birlashtirilishi,
    faqat `status: 'ended'` qaytarilishi.
  - `getReplay`/board-snapshot endpoint: erkin sessiya ishtirokchisi
    ruxsat olishi, aloqasi yo'q foydalanuvchi rad etilishi.
- Frontend: mavjud loyihada test runner yo'q (oldingi
  `classroom-session-delete-design.md`da tasdiqlangan) — qo'lda tekshirish:
  1. Erkin dars boshlash, chizish, hech qanday recording tanlamasdan
     tugatish → "Mening darslarim"da paydo bo'lishi, "Chizmani ko'rish"
     oxirgi holatni ko'rsatishi.
  2. Xuddi shu, lekin "To'liq" recording bilan → ikkala tugma ham
     ko'rinishi, ikkalasi ham to'g'ri ishlashi.
  3. Login qilgan o'quvchi bilan erkin darsga kirish → darsdan keyin
     o'quvchining "Jonli darslar" ro'yxatida paydo bo'lishi.
  4. Mehmon (login qilmagan) sifatida erkin darsga kirish → hech qanday
     talaba ro'yxatida paydo bo'lmasligi (chunki hisobga ulanmagan).
  5. Theme: sayt dark rejimda, jonli darsga (ustoz va talaba sifatida)
     kirilganda darhol dark bilan ochilishi, light flash bo'lmasligi.
  6. Mobil call bar: telefon o'lchamidagi ekranda (yoki brauzer devtools
     mobil emulyatsiyasida) mikrofon/qo'ng'iroqni tugatish tugmalari eng
     pastda ko'rinishi, hech qanday chevron tugma chiqmasligi, va pastki
     sahifa/zoom/split boshqaruv qatori bilan ustma-ust tushmasligi.
