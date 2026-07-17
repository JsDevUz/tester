# Jonli dars (Live Classroom) — dizayn

## Maqsad

Ustoz guruh uchun onlayn dars oynasini ochadi: PDF materialni ko'rsatadi, sahifalar va ustiga chizilgan izohlar (annotatsiyalar) barcha o'quvchilarda real vaqtda sinxron ko'rinadi, hamma ovoz orqali gaplasha oladi. Davomat avtomatik yoziladi.

## Qabul qilingan qarorlar

- **Ishtirokchilar soni**: 25+ o'quvchi — P2P mesh emas, SFU kerak.
- **Ovoz**: self-hosted **LiveKit OSS** (Docker). Backend `livekit-server-sdk` bilan token beradi.
- **Sessiya modeli**: guruhga bog'liq — faqat shu guruhga yozilgan (aktiv enrollment) o'quvchilar kiradi.
- **Mikrofon**: hamma erkin gapiradi (o'zi ochadi/yopadi), lekin o'quvchilar darsga **mute holatda** kiradi; ustoz istalgan o'quvchini majburiy mute qila oladi (server API orqali).
- **PDF**: video-stream qilinmaydi. Ustoz yuklagan PDF **serverda sahifama-sahifa siqilgan rasmlarga** (~1600px kenglik, WebP/JPEG) aylantiriladi va S3'ga qo'yiladi. Clientlar oddiy `<img>` ko'rsatadi — mobil brauzerlarda pdf.js xotira-crash muammosi arxitektura darajasida yo'q qilinadi.
- **Chizish**: rasm ustidagi overlay-canvas. Strokelar **normalizatsiyalangan (0..1) koordinatalarda** socket orqali tarqatiladi. Faqat ustoz chizadi (MVP).
- **Davomat**: kerak. Socket connect/disconnect dan avtomatik; ustoz qo'lda tuzata oladi.

## Arxitektura — uch kanal

| Kanal | Texnologiya | Nima o'tadi |
|---|---|---|
| Ovoz | LiveKit SFU (`wss://`) | Audio oqimlari |
| Sinxronizatsiya | Socket.IO `/classroom` namespace | Sahifa, strokelar, pointer, presence, sessiya eventlari |
| Fayl/lifecycle | REST + S3 | Sessiya ochish/yopish, PDF yuklash+konvertatsiya, davomat, LiveKit token |

Mavjud `live` moduli patternlari aynan takrorlanadi: namespace + har xabarda JWT verify, `LiveBroadcaster` interfeysi, in-memory sessiya `Map`, `hostDisconnectTimer` grace period, sof logika `*.logic.ts` + spec testlar.

## DB schema (Drizzle, yangi jadvallar)

```ts
classSessions:
  id uuid pk, groupId fk->groups (cascade), teacherId fk->users (set null),
  status text ('active'|'ended') default 'active',
  pdfName text null, pdfPages jsonb (string[] URL) default [],
  startedAt timestamptz defaultNow, endedAt timestamptz null
  // index: groupId

attendanceRecords:
  id uuid pk, sessionId fk->classSessions (cascade),
  enrollmentId fk->groupEnrollments (cascade),
  firstJoinedAt timestamptz null, lastLeftAt timestamptz null,
  totalSeconds integer default 0,
  status text ('absent'|'present'|'late') default 'absent',
  overriddenByAdminId uuid fk->users null,
  // uniqueIndex (sessionId, enrollmentId)
```

Joriy sahifa va strokelar DB'da saqlanmaydi — in-memory (server restartda dars holati yo'qoladi, bu qabul qilinadi; startup'da `status='active'` qolgan sessiyalar `ended` qilinadi).

## Backend: `classroom` moduli

### REST (`classroom.controller.ts`)

- `POST /classroom/sessions {groupId}` — teacher/super, guruh egaligini `groups→courses.adminId` orqali tekshiradi. Bitta guruhda bitta aktiv sessiya (409). Yaratilganda guruhning barcha aktiv enrollmentlari uchun `absent` davomat yozuvlari insert qilinadi.
- `POST /classroom/sessions/:id/pdf` — multipart, faqat `.pdf`, max 25MB, max 60 sahifa. `mupdf` (WASM) bilan render (~1600px kenglik) → siqish → S3 `classroom/{sessionId}/page-N` kalitlariga. Sessiya row yangilanadi, xonaga `pdf:set` broadcast.
- `POST /classroom/sessions/:id/end` — sessiyani yakunlaydi (socket `host:end` bilan bir xil logika).
- `GET /classroom/sessions/active` — teacher: o'z aktiv sessiyalari; student: enrolled guruhlaridagi aktiv sessiyalar (banner uchun).
- `GET /classroom/sessions/:id` — sessiya ma'lumoti + davomat ro'yxati (teacher).
- `GET /classroom/groups/:groupId/history` — o'tgan darslar + davomat xulosasi (teacher).
- `PATCH /classroom/attendance/:recordId {status}` — ustoz qo'lda tuzatishi, `overriddenByAdminId` yoziladi.
- `POST /classroom/sessions/:id/voice-token` — a'zolik tekshiriladi, LiveKit access token qaytadi `{token, url}`. LiveKit env sozlanmagan bo'lsa 503 + tushunarli xabar (dars ovozsiz ham ishlayveradi).
- `POST /classroom/sessions/:id/participants/:userId/mute` — teacher; `RoomServiceClient` orqali o'quvchining audio tracki majburiy mute.

### Socket (`classroom.gateway.ts`, namespace `/classroom`)

Har xabarda `{sessionId, token}` + JWT verify (live.gateway uslubi). Client→server:

- `host:join` / `student:join` → to'liq snapshot: `{pdfName, pages, currentPage, strokesByPage, participants, startedAt, hostOnline}`. Student uchun enrollment tekshiruvi va davomat: `firstJoinedAt`, status (`present`, dars boshlanganidan **10 daqiqadan** kech kirsa `late`).
- `host:setPage {page}` → xonaga `page:set`
- `host:stroke {page, stroke}` → `stroke:add` (stroke: `{id, tool:'pen'|'highlighter', color, width, points: number[]}` — points normalizatsiyalangan flat massiv, ~50ms batch)
- `host:undo {page}` → `stroke:undo {page, strokeId}`
- `host:clearPage {page}` → `page:clear`
- `host:pointer {page, x, y, active}` → `pointer:move` (saqlanmaydi, lazer-pointer)
- `host:end` → davomat flush, DB `ended`, xonaga `session:ended`

Server→room qo'shimcha: `presence:update` (kim online), `pdf:set`.

### Lifecycle va edge-caselar

- **Ustoz uzilsa**: 90s grace timer (`hostDisconnectTimer`), xonaga host offline holati; qaytsa timer bekor, qaytmasa sessiya avtomatik yakunlanadi.
- **O'quvchi disconnect**: interval yopiladi — `totalSeconds += now - lastJoin`, `lastLeftAt` DB'ga yoziladi. Qayta kirsa yangi interval ochiladi.
- **Server restart**: `onModuleInit`da barcha `active` sessiyalar `ended` qilinadi.
- **Sessiya yakuni**: hali ulangan o'quvchilarning intervallari flush qilinadi.

### Yangi dependencylar (backend)

`livekit-server-sdk`, `mupdf` (WASM — native dep yo'q), kerak bo'lsa `sharp` (WebP siqish uchun). Env: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — **ixtiyoriy** (`validate-env.ts`da warning, yo'q bo'lsa ovoz o'chiq).

## Frontend

Yangi dependency: `livekit-client`.

### Routelar

- `/classroom/host/:id` — `TeacherRoute`, `ClassroomHostPage`
- `/classroom/:id` — `PrivateRoute`, `ClassroomStudentPage`

### Kirish nuqtalari

- **Ustoz**: `CourseGroupsPage`da guruh uchun "Jonli dars" tugmasi → `POST /classroom/sessions` → host sahifaga navigate. Aktiv sessiya bo'lsa "Darsga qaytish".
- **O'quvchi**: `StudentShell` mount'da + har 60s `GET /classroom/sessions/active` poll → aktiv dars bo'lsa banner "Jonli dars ketmoqda — Kirish".

### Komponentlar

- `ClassroomPdfViewer` — joriy sahifa `<img>` + overlay `<canvas>`; strokelar normalizatsiyadan displey o'lchamiga scale qilib chiziladi; resize'da qayta chiziladi. Ustozda pointer-events bilan chizish (batch yuborish), o'quvchida faqat ko'rish.
- `ClassroomToolbar` (host) — qalam (3 rang), marker, lazer-pointer, undo, sahifa tozalash, sahifa navigatsiya (oldinga/orqaga, N/M), PDF yuklash.
- `ClassroomParticipants` — ro'yxat: online holat, gapirayotgan indikator (LiveKit active speakers), ustozda har o'quvchi uchun mute tugmasi.
- `useClassroomVoice(sessionId)` hook — token olish, `Room` connect, mikrofon publish (student boshida mute), active-speaker va mute holatlarini expose qiladi. Token 503 qaytsa — "ovoz o'chirilgan" rejimda davom etadi.
- `api/classroom.ts` (REST) va `api/classroomSocket.ts` (`/live` socket clientlari uslubida).

### Davomat UI

- Host sahifada yon panel: har o'quvchi holati (keldi / kech keldi / yo'q, ulanish vaqti).
- Sessiya tarixi: `CourseGroupsPage` guruh ichida "Darslar tarixi" — sana, davomiylik, davomat foizi; sessiya ochilsa jadval + qo'lda status o'zgartirish.

## Xavfsizlik

- Socket va REST'da rol + egalik tekshiruvi: host = kurs egasi (`courses.adminId`), student = aktiv `groupEnrollment` (removedAt IS NULL).
- LiveKit token: `identity=userId`, `name=displayName`, room `classroom-{sessionId}`, TTL qisqa (dars davomida yangilanadi yoki 6h), o'quvchiga `canPublish: true` (faqat audio ishlatiladi), ustozga qo'shimcha `roomAdmin`.
- PDF konvertatsiya faqat sessiya egasi uchun; sahifa rasmlari public-read S3 (mavjud media kabi), URL taxmin qilib bo'lmaydigan UUID prefiksli.

## MVP'dan tashqarida (keyinroq)

Video/screen-share (LiveKit bilan arzon qo'shiladi), yozib olish (Egress), o'quvchini "doskaga chaqirish" (strokelar userId bilan belgilangani uchun tayyor zamin), chat (practice-messenger integratsiyasi), qo'l ko'tarish tugmasi.

## Deploy eslatmasi

LiveKit alohida Docker service (`docker-compose.yml`ga qo'shiladi): 7880/TCP (ws), 7881/TCP, 50000-60000/UDP (RTP), embedded TURN. 2 vCPU / 4GB VPS audio-only 25-50 kishiga yetadi.
