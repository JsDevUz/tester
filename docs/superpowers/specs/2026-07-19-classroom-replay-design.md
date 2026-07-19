# Classroom Replay (jonli dars tarixi) — dizayn

## Maqsad

Guruhga bog'liq (erkin emas) jonli darslar tugagach, ustoz va o'quvchilar
o'sha darsni keyinchalik to'liq qayta ko'ra olishi kerak: boshidan oxirigacha
bo'lgan barcha chizma/sahifa/board o'zgarishlari video-player uslubida
(play/pause + scrubber) qayta ijro etiladi, sinxron audio bilan birga.
Talaba navbariga "Darslar tarixi" bo'limi qo'shiladi — amaliyotlar tarixiga
o'xshab, kurs bo'yicha guruhlangan ro'yxat.

## Qamrov chegaralari

- **Faqat guruhga bog'liq darslar** (`isFree === false`). Erkin (mehmon)
  darslar hech qachon tarixga yozilmaydi — ular hozirgi kabi xotiradan
  butunlay o'chib ketadi.
- Playback **read-only**: chizish asboblari, toolbar butunlay yo'q. Faqat
  scroll/zoom erkin (o'quvchi replay paytida PDF/daftarni mustaqil siljitib,
  kattalashtira oladi — bu allaqachon mavjud "erkin rejim" scroll/zoom
  mexanizmi orqali, playback vaqt boshqaruvi bilan ziddiyatsiz ishlaydi).
- Audio yozib olish **best-effort**: agar LiveKit Egress ishga tushmasa yoki
  xatolik bersa, **jonli dars hech qachon to'xtamaydi yoki sekinlashmaydi** —
  faqat log yoziladi, o'sha darsning playback'ida keyinroq audio bo'lmaydi.

## Arxitektura

### 1. Event capture (backend, real vaqtda)

`ClassroomSession`ga yangi maydon qo'shiladi:

```ts
export interface ClassroomHistoryEvent {
  type: string;       // masalan 'stroke:add', 'stroke:undo', 'board:set', 'page:set'
  payload: unknown;    // o'sha eventning broadcast payload'i bilan bir xil shakl
  atMs: number;        // session.startedAtMs'dan beri o'tgan millisekund
}

// ClassroomSession'ga qo'shiladi:
historyEvents?: ClassroomHistoryEvent[];
```

`classroom.service.ts`dagi barcha session-mutatsion metodlar (`stroke`,
`moveStroke`, `updateTextStroke`, `updateShapeStroke`, `undo`, `eraseStroke`,
`reorderStroke`, `splitStroke`, `clearPage`, `setPage`, `setBoardMode`,
`setBoardView`, `setNotebookStyle`) — har biri broadcast qilishdan oldin, agar
`!s.isFree` bo'lsa, bitta yordamchi funksiyaga murojaat qiladi:

```ts
function recordHistoryEvent(s: ClassroomSession, type: string, payload: unknown): void {
  if (s.isFree) return;
  if (!s.historyEvents) s.historyEvents = [];
  s.historyEvents.push({ type, payload, atMs: Date.now() - s.startedAtMs });
}
```

Payload shakli — **broadcast qilinadigan payload bilan bir xil** (masalan
`stroke:add` uchun `{ page, stroke, pane, mode }`) — shunda frontend replay
player socket-event handlerlarining katta qismini qayta ishlatishi mumkin
(pastga qarang).

`board:set` eventi (split/single, left/right mode) ham shu ro'yxatga kiradi —
playback paytida qaysi vaqtda ekran qanday joylashgan bo'lganini to'g'ri
tiklash uchun.

Xotira cheklovi yo'q qo'yilmaydi (amaliy dars davomiyligi — soatlab emas,
o'nlab minglab event bo'lmaydi; agar kelajakda muammo chiqsa, keyinroq
compaction qo'shiladi — hozircha YAGNI).

### 2. Persistence (dars tugaganda)

`class_sessions` jadvaliga ikkita ustun qo'shiladi (migratsiya):

```sql
ALTER TABLE class_sessions ADD COLUMN history_events jsonb;
ALTER TABLE class_sessions ADD COLUMN recording_url text;
ALTER TABLE class_sessions ADD COLUMN recording_status text NOT NULL DEFAULT 'none';
-- recording_status: 'none' | 'pending' | 'ready' | 'failed'
ALTER TABLE class_sessions ADD COLUMN egress_id text;
-- LiveKit egress_ended webhook shu ustun orqali qaysi sessionId'ga
-- tegishli ekanini topadi.
```

`endSession()`da (`!s.isFree` branch ichida, mavjud
`db.update(classSessions).set({ status: 'ended', endedAt })` bilan bitta
so'rovda):

```ts
await db.update(classSessions)
  .set({ status: 'ended', endedAt: new Date(), historyEvents: s.historyEvents ?? [] })
  .where(eq(classSessions.id, sessionId));
```

PDF fayllarning o'zi qayta saqlanmaydi — `pdfName`/`pdfPages` allaqachon
`class_sessions`da bor (qaysi PDF, qaysi sahifalar ishlatilgani), media
library'dagi asl fayllarga ishora qiladi.

### 3. Audio yozib olish (LiveKit Egress)

`live.service.ts`ga yangi metod: `startRecording(sessionId, roomName)` — dars
`hostJoin` bosqichida (birinchi ustoz ulanganda) chaqiriladi, LiveKit
`RoomCompositeEgress` (faqat audio track, video kerak emas) boshlaydi va
natijada olingan `egressId`ni sessiyaga saqlaydi (`recordingStatus: 'pending'`).

**Fail-safe qoida**: bu chaqiruv `try/catch` bilan o'raladi, xatolik bo'lsa
faqat `logger.error(...)` — hech qanday exception yuqoriga otilmaydi, dars
oqimi davom etadi. LiveKit sozlanmagan bo'lsa (`LIVEKIT_URL` yo'q — hozirgi
`voiceAvailable: false` holati) recording umuman urinilmaydi.

`endSession()`da mos `egressId` uchun `stopEgress` chaqiriladi (xuddi shu
fail-safe naqsh bilan). LiveKit webhook (`egress_ended`) orqali yakuniy fayl
URL'i (S3-compatible storage'ga LiveKit avtomatik yozadi) qabul qilinadi —
loyihada hozircha LiveKit uchun webhook endpoint yo'q (faqat Telegram
webhook bor, boshqa domenga tegishli), shuning uchun yangi
`POST /webhooks/livekit` controller qo'shiladi. Kelgan `egress_ended`da
`class_sessions.recording_url` va `recording_status: 'ready'` (yoki xatolik
bo'lsa `'failed'`) yangilanadi — `egressId` webhook payload'ida keladi,
`class_sessions.egress_id` ustuniga qarab mos qatorni topib yangilanadi.

### 4. Playback API

- `GET /courses/:courseId/class-sessions` — o'sha kursning yakunlangan
  darslari ro'yxati (sana, davomiylik, `recordingStatus`). Talaba/ustoz
  ruxsati: so'rovchi shu kursga a'zo (enrollment) yoki o'sha kursning
  ustozi ekanligi tekshiriladi.
- `GET /class-sessions/:id/replay` — bitta darsning to'liq replay ma'lumoti:
  `{ pdfName, pdfPages, historyEvents, recordingUrl, recordingStatus,
  attendance: [...] }`. `attendance` — mavjud `attendance_records`
  jadvalidan (join qilingan `enrollment`/`user` ism bilan).

Ikkalasi ham mavjud `classroom.controller.ts`ga qo'shiladi (yangi controller
shart emas — resurs allaqachon shu domenga tegishli).

### 5. Frontend: replay player

Yangi sahifa `ClassroomReplayPage.tsx` (`ClassroomHostPage`/
`ClassroomStudentPage`dan mustaqil, lekin `ClassroomPdfViewer`ni qayta
ishlatadi):

- `ClassroomPdfViewer`ga `editable={false}` beriladi (allaqachon qo'llab-
  quvvatlanadigan holat — toolbar ko'rsatilmaydi, chizish o'chadi).
- `isHost={false}`, `synced={false}` beriladi — bu `useClassroomZoom`/
  `useClassroomScrollSync` ichida `freeToMove = true`ni faollashtiradi,
  ya'ni o'quvchi playback paytida mustaqil scroll/zoom qila oladi (host
  holatiga bog'liq emas, chunki playback'da "host" umuman yo'q).
- Yangi `useClassroomReplay(historyEvents)` hook — `currentTimeMs` state'i
  (scrubber orqali boshqariladi) va shu vaqtgacha bo'lgan barcha
  `historyEvents`ni **boshidan qayta qo'llab** (`reduce`), joriy
  `strokesByPage`/`rightStrokesByPage`/`boardLayout`/`leftBoardMode`/
  `rightBoardMode`/`currentPage` holatini hisoblaydi — bu hozirgi jonli
  reja bilan bir xil reducer-mantiqni qayta ishlatadi
  (`useClassroomSession.ts`dagi socket-event handlerlar allaqachon xuddi
  shu payload shaklini kutadi, shuning uchun ularning ichki logikasi
  ko'chirilib, sof funksiyaga chiqariladi va ikkala joyda — live socket
  handler va replay reducer — ishlatiladi).
- Play tugmasi bosilganda `requestAnimationFrame` orqali `currentTimeMs`
  audio elementining `currentTime`iga bog'lab oshiriladi (`<audio>` mavjud
  bo'lsa haqiqiy vaqt manbai audio bo'ladi — drift bo'lmasin; audio yo'q
  bo'lsa oddiy `performance.now()` asosida orttiriladi).
- Scrubber — pastda gorizontal chiziq, umumiy davomiylik (oxirgi event
  `atMs`i yoki audio `duration`i, qaysi kattaroq bo'lsa) bo'yicha.
- Yon panelda davomat ro'yxati (`attendance`) statik ko'rinishda.

### 6. Navigatsiya

O'quvchi navbariga "Darslar tarixi" bandi qo'shiladi → kurslar ro'yxati →
kursni tanlash → o'sha kursning yakunlangan darslari ro'yxati (sana +
davomiylik) → bosilganda `ClassroomReplayPage`ga o'tadi.

## Testlash

- Backend: `classroom.service.spec.ts`ga har bir mutatsion metod uchun
  "isFree=false bo'lganda historyEvents'ga to'g'ri type/payload/atMs bilan
  yoziladi, isFree=true bo'lganda yozilmaydi" testlari.
- Backend: `endSession` — `historyEvents` DB'ga to'g'ri saqlanishi, LiveKit
  xato qaytarganda ham `endSession` xatosiz tugashi (fail-safe).
- Frontend: `useClassroomReplay` reducer uchun unit test — bir nechta
  event turi ketma-ket qo'llab, kutilgan holatga kelishini tekshiradi.
- Qo'lda tekshirish: guruh darsini boshlab, chizib, split rejimga o'tib,
  yakunlab, keyin replay sahifasida play/pause/scrubber bilan barcha
  o'zgarishlar to'g'ri tartibda qayta ko'rinishini tasdiqlash.
