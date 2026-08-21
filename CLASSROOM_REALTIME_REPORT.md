# Jonli dars (Classroom) — Ustoz ↔ O'quvchi aloqasi: xatolar tahlili va fix rejasi

Sana: 2026-08-20
Qamrov: `web → web` (ustoz web, o'quvchi web) va `web → mobile` (ustoz web, o'quvchi React Native)
Maqsad: jonli darsni to'liq silliq, kechikishsiz va to'xtovsiz ishlashiga xalaqit berayotgan sabablarni aniqlash.
Format: har bir topilma uchun **Sabab → Natija → Qanday fix qilinadi**.

---

## 0. Executive Summary

Aloqa uchta kanaldan iborat: **(1)** doska sinxronizatsiyasi — Socket.IO (`/classroom` namespace),
**(2)** ovoz — LiveKit SFU, **(3)** yengil signalizatsiya — reaksiyalar + qo'l ko'tarish.

Umumiy holat: arxitektura to'g'ri tanlangan (SFU + socket.io + optimistic UI), ko'p nozik joylar
allaqachon yaxshi ishlangan (throttle/debounce, optimistic stroke, excludeSender echo himoyasi,
windowing/virtualization). Lekin **"smooth va to'xtovsiz"** bo'lishiga to'siq bo'layotgan
muammolar 4 guruhga bo'linadi:

| # | Guruh | Asosiy xulosa | Eng og'riqli joylar |
|---|---|---|---|
| 1 | Ovoz (LiveKit) | **Reconnection umuman yo'q** — bir marta uzilsa, ovoz abadiy o'ladi | A1, A2 |
| 2 | Mobile ulanish | Join timeout/retry va transport fallback yo'q — cheklangan tarmoqlarda "cheksiz Loading" | B9, B10 |
| 3 | Server holati | In-memory session + har 15s to'liq JSONB yozish → uzun darslarda server "mikro-qotishlari" | B3, B5 |
| 4 | Vositalar to'plami | Faqat ovoz + emoji + qo'l; chat yo'q, mute majburiy emas, mobile'da pinch-zoom yo'q | D1–D5 |

```
Ustoz (web)                              Server (NestJS — 1 instans, docker)
  ├─ Socket.IO /classroom ─────────────►   ClassroomGateway → ClassroomService
  │    host:stroke / setPage / zoom / ...      (sessiya holati — XOTIRADA, Map)
  │                                            │  broadcast: cs:<sessionId> xonasi
  │                                            └─ har 15s: butun doska JSONB → Postgres
  └─ LiveKit (wss://livekit...) ────────►  LiveKit SFU — ovoz (UDP 50000-50200 / TCP 7881)

O'quvchi (web)    ◄── socket.io broadcast + LiveKit audio (livekit-client)
O'quvchi (mobile) ◄── socket.io (websocket) + LiveKit (@livekit/react-native)
```

---

## 1. OVOZ (LiveKit) — "to'xtab qolish" ning 1-raqamli sababi

### A1. [P0] LiveKit reconnection yo'q (web va mobile)

- **Sabab:** [useClassroomVoice.ts (web)](apps/frontend/src/hooks/useClassroomVoice.ts#L150-L157) va
  [useClassroomVoice.ts (mobile)](apps/mobile/src/hooks/useClassroomVoice.ts#L109-L113) xonaga
  **bir marta** ulanadi. `RoomEvent.Disconnected` da faqat `connected: false` bo'ladi —
  yangi token olib qayta ulanishga urinish **yo'q**. `RoomEvent.Reconnecting` hech yerda
  qo'llanmagan (butun repoda `Reconnecting` ga match yo'q). livekit-client'ning ichki
  auto-resume faqat qisqa (~15s gacha) uzilishlar uchun ishlaydi; resume yetsa yoki
  token eskirsa — xona o'lik holatda qoladi.
- **Natija:** Wi-Fi↔LTE almashinuvi, VPN yoqib-o'chirish, laptop sleep, telefonni qisqa
  backgroundga olish → **ovoz abadiy yo'qoladi**, doska esa ishlashda davom etadi. Foydalanuvchi
  "ovoz keldi-ketdi, sahifani yangilashdan boshqa yo'l yo'q" deb shikoyat qiladi. Bu eng ko'p
  uchraydigan "to'xtatish" sababi.
- **Fix:**
  1. `room.on(RoomEvent.Reconnecting, ...)` → UI'da "Ovoz qayta ulanmoqda..." indikatori.
  2. `Disconnected` sababi `client-initiated` bo'lmasa → exponential backoff (2s→4s→...→30s)
     bilan `apiVoiceToken` dan **yangi token** olib `room.connect()` qayta chaqirish
     (eski token bilan emas — resume otagan bo'lsa yangi token shart).
  3. Mobile'da `AppState → active` da `room.state !== 'connected'` bo'lsa ham shu reconnect
     ishga tushsin.

### A2. [P0] Mobile: background audio rejimi va KeepAwake yo'q

- **Sabab:** iOS `Info.plist`da `UIBackgroundModes: audio` yo'q (pbxproj'da umuman topilmadi),
  `expo-keep-awake`/`react-native-keep-awake` ishlatilmagan, ovoz hook'ida `AppState` handling yo'q.
- **Natija:** (a) ekran bloklanadigan bo'lsa yoki foydalanuvchi appni 5-10 soniya
  backgroundga o'sa iOS WebRTC'ni suspend qiladi → ovoz uziladi; qaytib kelganda doska socketi
  qayta join qiladi ([useClassroomSession.ts](apps/mobile/src/hooks/useClassroomSession.ts#L283-L289)),
  lekin LiveKit xonasi qayta ulanmaydi (A1) → o'quvchi **jimgina o'lib qoladi**.
  (b) Ekran avtomatik o'chib, darsni tomosha qilish uziladi.
- **Fix:** iOS'da `UIBackgroundModes: audio` qo'shish; classroom ekranida `activateKeepAwake()`;
  `AudioSession` ni `playAndRecord` + `.mixWithOthers` konfiguratsiyasi bilan to'g'rilash;
  A1'dagi AppState-reconnect bilan birga.

### A3. [P1] Ustozning "mute"i majburiy emas — talaba darhol unmute qila oladi

- **Sabab:** [classroom-voice.service.ts](apps/backend/src/classroom/classroom-voice.service.ts#L42-L48)
  hammaga `canPublish: true` beradi. `muteParticipant` faqat joriy trackni mute qiladi
  (`mutePublishedTrack`), LiveKit **permission** o'zgarmaydi.
- **Natija:** mute qilingan talaba o'z UI'sidagi mikrofon tugmasini bosib darhol qayta gapira
  boshlaydi. Katta guruhlarda shovqin tartibsizligi — ustoz nazorati "maslahat" darajasida.
- **Fix:** mute da `RoomServiceClient.updateParticipant(room, identity, undefined,
  { canPublish: false, canSubscribe: true })` — server tomonidan qattiq o'chirish; unmute da
  qayta ruxsat. (Yoki teskari model: standart `canPublish: false`, "gapirishga ruxsat berish"
  tugmasi bilan boshqarish.)

### A4. [P1] Guest'ni mute qilish umuman ishlamaydi (400 xato)

- **Sabab:** [classroom.controller.ts](apps/backend/src/classroom/classroom.controller.ts#L204-L214)
  `@Param('userId', ParseUUIDPipe)` — guest'ning IDsi `guest:<id>` formatida, UUID emas →
  validatsiyada qaytariladi. (`live.ts`dagi quiz mute'da ham xuddi shu naqsh.)
- **Natija:** Erkin darsda (link bilan kirgan mehmonlar) ustoz hech kimga mute qila olmaydi,
  toast: "Mute qilib bo'lmadi".
- **Fix:** `userId` parametrdan `ParseUUIDPipe`ni olib tashlab, string sifatida validatsiya
  qilish (`/^guest:[\w-]+$|^[0-9a-f-]{36}$/i` kabi).

### A5. [P1] TURN server yo'q — ba'zi mobil tarmoqlarda ovoz umuman yo'q/bir tomonlama

- **Sabab:** [livekit.yaml](docker/livekit.yaml)da `turn:` bloki yo'q. Faqat `use_external_ip`
  (STUN) + ochiq UDP 50000-50200 + TCP 7881 taxminiga tayaniladi.
- **Natija:** Symmetric NAT / korporativ firewall / ba'zi operator APN'larida WebRTC
  candidate'lari o'tmaydi: talabaning ovozi keladi-yoki kelmaydi, yoki faqat bir tomonlama
  eshitiladi. "Ba'zi o'quvchilarda ishlaydi, ba'zilarida yo'q" tarzidagi shikoyatning
  klassik sababi.
- **Fix:** LiveKit embedded TURN'ni yoqish (`turn: enabled: true, domain, cert, tls_port: 5349`)
  + `udp_port: 443`; 7881 va 50000-50200 portlari ochiqligini tekshirish; imkon bo'lsa TURN
  TCP/TLS 443 — eng cheklangan tarmoqlar uchun ham o'tadigan yo'l.

### A6. [P2] Mobile: iOS audio interruption/route handling yo'q, `needsAudioUnlock` — o'lik kod

- **Sabab:** [useClassroomVoice.ts (mobile)](apps/mobile/src/hooks/useClassroomVoice.ts#L48-L209)
  `needsAudioUnlock` hech qachon `true` bo'lmaydi; qo'ng'iroq/Siri interruption, naushnik
  uzilishi (`AudioSession` eventlari) kuzatilmaydi.
- **Natija:** qo'ng'iroqdan keyin yoki naushnik almashtirilgandan keyin ovoz jimgina ishlamay
  qolishi mumkin, tiklanish yo'li yo'q.
- **Fix:** `AudioSession.addAudioInterruptionListener` va audio-device-changed listenerlarini
  ulash; interruption tugagach `configureAudio` + `startAudioSession()` qayta chaqirish.

### A7. [P2] Mobile `toggleMic` eskirgan state'dan o'qiydi

- **Sabab:** [useClassroomVoice.ts:177-203](apps/mobile/src/hooks/useClassroomVoice.ts#L177-L203)
  — `const next = !micEnabled` closure'dagi state'dan; tez ikki marta bosilganda ikkala bosish ham
  bir xil qiymatni o'qiydi; web'dagi `isTogglingMicRef` himoyasi ham yo'q.
- **Natija:** tez bosganda UI va haqiqiy track holati desinxron — "tugma ishlamayapti" hissi.
- **Fix:** `room.localParticipant.isMicrophoneEnabled`'ni to'g'ridan-to'g'ri o'qish + busy-ref
  (web versiyasidagi kabi).

---

## 2. DOSKA SINXRONIZATSIYASI (Socket.IO)

### B1. [P0] Uzilish davrida eventlar yo'qoladi; "sokin o'lim" 25-45s davom etadi

- **Sabab:** Server broadcast'lari fire-and-forget. Talabaning socketi uzilsa, o'sha onsdagi
  `stroke:add / page:set / board:undo` lar **qayta o'ynamaydi**. Socket.io o'zi reconnect'da
  `connect` eventini chiqaradi → client qaytadan `student:join` qilib to'liq snapshot oladi
  (bu yaxshi, ikkala platformada bor), LEKIN: NAT timeout kabi "sokin o'lim"da socket.io
  uzilishni faqat ping timeout (~25-45s) dan keyin sezadi. Web'da `visibilitychange` handling
  yo'q (mobile'da `AppState` bor).
- **Natija:** talaba 30-60 soniyaga "muzlagan" doskani ko'radi (hech narsa yangilanmaydi,
  ogohlantirish yo'q), keyin birdan sakrab to'g'ri holatga o'tadi. Aynan "kechikish + muzlash"
  shikoyatining manbalaridan biri.
- **Fix:**
  1. Serverda har 5-10s `board:hb` (page + strokeCount version) heartbeat broadcast qilish;
     client 2 ta ketma-ket heartbeat'da versiya farqini sezsa — o'zi `student:join` (resync)
     qiladi. (`toSocket` infratuzilmasi [classroom.gateway.ts:43](apps/backend/src/classroom/classroom.gateway.ts#L43)
     allaqachon bor.)
  2. Socket.io `pingInterval: 10_000, pingTimeout: 10_000` — sokin o'limni 2x tezroq sezish.
  3. Web'ga `visibilitychange` → ko'rinadigan bo'lganda `join()` (mobile'dagi AppState naqshi).

### B2. [P1] `withSession` — bo'sh funksiya: sessiya bo'yicha tartib (mutex) yo'q

- **Sabab:** [classroom.service.ts:104-106](apps/backend/src/classroom/classroom.service.ts#L104-L106)
  — `_sessionId` ishlatilmaydi, shunchaki `action()` ni chaqiradi. Async handlerlar
  (`studentJoin`, `endSession`, `handleDisconnect`) DB kutish nuqtalarida boshqa eventlar bilan
  aralashadi (masalan, `host:end` ichidagi await'lar davomida kelgan `host:stroke` → tugayotgan
  sessiyaga stroke qo'shilib broadcast qilinishi mumkin).
- **Natija:** kam uchraydigan, lekin qayta tiklanmaydigan "g'alati holatlar": ended ekranida
  paydo bo'lgan chiziq, ikki marta persist, undo anomaliyalari. Race-shartli — testda ushlash qiyin.
- **Fix:** `withSession`ni haqiqiy navbatga aylantirish: `Map<sessionId, Promise>` zanjiri —
  har bir amal oldingisi tugashini kutadi (barcha handler'lar allaqachon shu funksiyadan o'tadi,
  faqat ichini to'ldirish kerak). Har bir `await`dan keyin sessiya hali mavjudligini tekshirish.

### B3. [P1] Sessiya holati xotirada, 1 instans; Redis adapter "yarim ulangan"

- **Sabab:** `this.sessions = new Map()` — jarayon xotirasida. Socket.IO Redis adapter
  ([redis-io.adapter.ts](apps/backend/src/redis/redis-io.adapter.ts)) cross-instance broadcast
  uchun, lekin **holat** o'zgarmaydi: 2-instans ochildigan bo'lsa, ustoz A'da, talaba B'da tushsa
  B o'z eski DB snapshotidan ikkinchi, divergent nusxa yaratadi. Hozir docker-compose'da 1 replica
  (pm2 ham fork mode) — tasodifan `--scale backend=2` qilinsa darhol buziladi.
- **Natija:** (a) scale-out imkoniyati yo'q; (b) backend restart = barcha jonli darslar "resync
  sakrashi"ni boshdan kechiradi; (c) bitta process'ning event-loop'i (quyidagi B5) barcha
  darslarga ta'sir qiladi.
- **Fix:** qisqa muddat: 1 instans + deployment'da sticky bo'lishini kafolatlash. O'rta muddat:
  sessiya holatini Redis'ga o'tkazish ([redis-session.store.ts](apps/backend/src/redis/redis-session.store.ts)
  fayli mavjud, lekin ulanmagan) yoki snapshot-as-truth + resync broadcast modeli.

### B4. [P1] Restore view-state'ni yo'qotadi: page=1, zoom=1, scroll=null, theme=light

- **Sabab:** [classroom.service.ts:1597-1631](apps/backend/src/classroom/classroom.service.ts#L1597-L1631)
  `getOrRestoreSession` `currentPage: 1, zoom: 1, scroll: null, participants: new Map(),
  classroomTheme: 'light'` bilan tiklaydi. `startedAtMs` ham qayta boshlanadi.
- **Natija:** server restart yoki ustozning 90s (`HOST_GRACE_MS`)dan uzun uzilishidan keyin:
  hamma 1-sahifaga sakraydi, zoom/scroll sinxronizatsiyasi yo'qoladi, qo'l ko'tarilganlar
  tozalanadi, tema light'ga "flash" qiladi (qorong'i doskada ko'zga tashlanadi). Replay
  timeline bazi ham siljiydi.
- **Fix:** `boardSnapshot`ga `currentPage, zoom, rightZoom, splitRatio, scroll, rightScroll,
  classroomTheme, raisedHands` ni qo'shib, restore'da qaytarish. `startedAtMs`ni ham saqlash.

### B5. [P0] Har 15s butun doska JSONB qilib qayta yoziladi — event loop'da

- **Sabab:** [classroom.service.ts:165-170](apps/backend/src/classroom/classroom.service.ts#L165-L170)
  `@Interval(15_000) autoPersistActiveSessions` → har bir aktiv sessiyaning **butun**
  strokesByMode + savedVersions obyekti serialize → UPDATE (yana 1.5s debounce'li persist har
  mutatsiyada, [onBoardMutation](apps/backend/src/classroom/classroom.service.ts#L739-L752)).
  JSON serialize va drizzle yozuvi asosiy thread'da; satr dars davomida o'sib boradi.
- **Natija:** uzun/yukli darslarda (yoki bir vaqtda 2-3 dars) har 15 soniyada server
  mikro-qotishlari — **barcha** ulangan foydalanuvchilarda bir vaqtda stroke/pointer kechikish
  "spayki". Dars oxirigacha borib katta doskalarda yozuv bir necha MB bo'ladi → TOAST rewrite
  og'irlashadi. Bu "davom etar ekan sekinlashib boradi" hissining server tomoni.
- **Fix:** (1) faqat o'zgargan sessiyalarni va kamroq tez yozish (o'zgarish bo'lsa ≥45-60s);
  (2) serialize'ni worker thread'ga yoki `jsonb_set` bilan sahifa-darajasida inkremental yozishga;
  (3) `savedVersions` soni/hajmini kaplash; (4) B6 (laser prune) va B8 (history cap) bilan birga —
  satr hajmini barqaror ushlab turish.

### B6. [P2] Lazer chizmalari serverda hech qachon o'chmaydi

- **Sabab:** [classroom.service.ts:728](apps/backend/src/classroom/classroom.service.ts#L728) —
  lazer undo'dan chiqariladi, lekin stroke xaritasida **saqlanib qolaveradi** (client 3s'dan
  keyin ko'rsatmaydi, [classroomCanvasDraw.ts:640-646](apps/frontend/src/components/classroom/classroomCanvasDraw.ts#L640-L646)).
- **Natija:** xotira + snapshot + join payload'i lazer ishlatgan sari o'sadi, lekin hech kim
  ko'rmaydi. Kech kirgan o'quvchi o'lik lazerlarni ham yuklaydi.
- **Fix:** serverda lazer uchun alohida qisqa TTL bufer (faqat broadcast, saqlashsiz), yoki
  `onBoardMutation`da 10s+ lazerlarni tozalash.

### B7. [P2] Join snapshot ma'lumotni ~3x dublikat yuboradi

- **Sabab:** [buildSnapshot](apps/backend/src/classroom/classroom.logic.ts#L683-L736) `strokesByPage`
  + `rightStrokesByPage` + `strokesByMode` (uchinchisida birinchi ikkovining mazmuni yana bor).
- **Natija:** katta doskalarda join/reconnect payload 2-3 barobar ortiq — mobil tarmoqda sekin
  kirish, timeout xavfi oshadi.
- **Fix:** faqat `strokesByMode` + joriy mode/layout yuborish; `strokesByPage`ni client
  derive qiladi (mobile allaqachon `strokesByMode`ni qo'llaydi).

### B8. [P2] `historyEvents` cheklanmagan o'sadi

- **Sabab:** [recordHistoryEvent](apps/backend/src/classroom/classroom.service.ts#L1449-L1461)
  — pointer/scroll 200ms coalesce bilan, lekin umumiy soni cheklanmagan; har stroke to'liq
  payload bilan tarixga ham yoziladi (strokesByMode'dagi nusxadan tashqari).
- **Natija:** 2 soatlik intensiv darsda o'n minglab eventlar → RAM o'sishi + dars oxiridagi
  gigant yakuniy UPDATE; replay sekin ochiladi.
- **Fix:** kap (masalan 20k event, eski pointer/scroll'larni siqish/sampling), stroke payloadini
  reference orqali (id + stroke) saqlash.

### B9. [P0] Mobile join: timeout, retry va `connect_error` handling yo'q

- **Sabab:** [useClassroomSession.ts (mobile):75-79](apps/mobile/src/hooks/useClassroomSession.ts#L75-L79)
  — oddiy `socket.emit`, `socket.timeout()` yo'q; `connect_error` listener yo'q; join muvaffaqiyatsiz
  bo'lsa retry yo'q (web versiyada 3 martagacha retry + `CONNECTION_TIMEOUT` bor,
  [web useClassroomSession.ts:176-239](apps/frontend/src/hooks/useClassroomSession.ts#L176-L239)).
  `ERROR_MESSAGES`'da ham ulanish kodlari yo'q.
- **Natija:** sekin/bloklangan tarmoqda yoki bitta ack yo'qolsa — o'quvchi **cheksiz Loading**
  ekranida qoladi, hech qanday xato yoki "qayta urinish" ko'rsatilmaydi.
- **Fix:** web'dagi naqshni ko'chirish: `socket.timeout(15_000).emit(...)` + 3 martagacha
  backoff retry + `connect_error` → xolat (`RECONNECTING/CONNECTION_TIMEOUT`) + UI banner.

### B10. [P0] Mobile socket: `['websocket','polling']` fallback ishlamaydi

- **Sabab:** [classroomSocket.ts (mobile):10](apps/mobile/src/lib/classroomSocket.ts#L10) —
  socket.io-client v4 boshlang'ich ulanishda faqat **birinchi** transportni sinaydi; polling'ga
  tushish uchun `tryAllTransports: true` kerak (yo'q). Web buning uchun `['polling','websocket']`
  tartibini ishlatadi.
- **Natija:** WS handshake'i bloklanadigan tarmoqlarda (ba'zi korporativ/proksi) mobile umuman
  ulanmaydi — va B9 tufayli bu cheksiz Loading sirtida ko'rinadi.
- **Fix:** `tryAllTransports: true` qo'shish (yoki web kabi polling-first + upgrade).

---

## 3. RENDER / PERFORMANS (kechikish va "izg'irib" hissi)

### C1. [P1] Web: har eventda to'liq canvas redraw + lazer 60fps forced redraw

- **Sabab:** [useClassroomCanvasRenderer.ts:41-268](apps/frontend/src/components/classroom/useClassroomCanvasRenderer.ts#L41-L268)
  — barcha strokelar har o'zgarishda qaytadan chiziladi (offscreen cache yo'q). Lazer aktiv
  bo'lsa (3s gacha) [rAF loop](apps/frontend/src/components/classroom/useClassroomCanvasRenderer.ts#L341-L345)
  har freymda **butun** canvasni qayta chizishga majbur qiladi.
- **Natija:** sahifa to'lgan sida (yuzlab chiziq) har yangi stroke sekinroq ko'rinadi; lazer
  ishlatganda past imkoniyatli o'quvchi noutbuklarida ko'rinchli qaltirash. Katta darslarda
  "chizish kechikadi" shikoyati.
- **Fix:** ikki qatlamli canvas: (1) commit qilingan strokelar offscreen bitmap'ga keshlanadi,
  faqat strukturaviy o'zgarishda qayta chiziladi; (2) yangi chiziq/lazer alohida ustki qatlamda,
  lazer rAF'i faqat o'sha qatlamga tegadi.

### C2. [P2] Mobile: `ClassroomBoard` React.memo samarasiz, `ClassroomPageView` memo yo'q

- **Sabab:** har `setState`da yangi `state` obyekti → memo o'tkazib yuboradi; ko'rinayotgan
  ±3 sahifa to'liq re-render bo'ladi (Skia path rebuild'i `useMemo` strokes-identity bilan
  qisman saqlanadi).
- **Natija:** past imkoniyatli Android'larda tez chizilganda stroke kelishi biroz
  "titraydi"; katta guruh presence/reaksiya o'zgarishlari ham butun boardni re-render qiladi.
- **Fix:** `ClassroomPageView`ni `React.memo` + custom comparator (strokes array reference),
  state'ni sahifa-bo'yicha bo'lish (selector/store) — faqat o'zgargan sahifa re-render bo'lsin.

### C3. [P1] Mobile PDF sahifa rasmlari: prefetch va mustahkam cache yo'q

- **Sabab:** [ClassroomPageView.tsx:139-154](apps/mobile/src/components/classroom/ClassroomPageView.tsx#L139-L154)
  — oddiy RN `Image`, prefetch yo'q; ±3 oynadan chiqqach qayta yuklanadi (RN cache eviction
  ostida); atrofdagi sahifalar oldindan tortilmaydi.
- **Natija:** ustoz sahifa almashtirganda/pastga scroll qilganda talabada **oq sahifa flash'i**
  (rasm yuklanishini kutish) — "orqada qolib ketish" hissi, ayniqsa 3G'da.
- **Fix:** `expo-image`/`react-native-fast-image` + joriy sahifa atrofidagi ±2 sahifani
  `prefetch()`; `retry` mantiqi allaqachon bor — yaxshi.

### C4. [P2] Web student: sahifa rasmlari oldindan yuklanmaydi

- **Sabab:** virtualization ±5 bor, lekin keyingi sahifalar proactive `new Image()`/`decode()`
  bilan tayyorlanmaydi.
- **Natija:** katta PDF'da tez sahifa sakrashda studentda bir zumlik bo'sh sahifa.
- **Fix:** `currentPage` o'zgarganda ±2 qo'shni URL'ni `<link rel=preload>`/`new Image()` bilan
  oldindan yuklash.

### C5. [P2] Scroll sinxronizatsiyasi "teleport" hissi beradi

- **Sabab:** ustoz tomonda [220ms toza debounce](apps/frontend/src/hooks/useClassroomSession.ts#L462-L497)
  — scroll to'xtagachagina oxirgi pozitsiya yuboriladi.
- **Natija:** student ustoz scrollini uzluksiz emas, "sakrab-sakrab" ko'radi. Bu atayin qilingan
  trade-off (trafik tejash), lekin "smooth" hisni kamaytiradi.
- **Fix:** debounce o'rniga ~120-150ms throttle (oxirgi qiymat bilan) — uzluksizlik va trafik
  o'rtasida; yoki student tomonda qisqa `behavior: smooth` interpolatsiya.

---

## 4. ALOQA VOSITALARI PARITY (web→web va web→mobile "to'liq" bo'lishi uchun)

### D1. [P1] Matnli chat yo'q

- **Sabab:** gateway'da ([classroom.gateway.ts](apps/backend/src/classroom/classroom.gateway.ts))
  faqat `reaction:send` va `hand:*` eventlari bor — chat kanali umuman yo'q.
- **Natija:** mikrofoni yo'q/shovqinli muhitdagi o'quvchi savol bera olmaydi (faqat emoji).
  Jonli dars "aloqasi" to'liq emas — web'da ham, mobile'da ham.
- **Fix:** `chat:send` (student→server, rate-limit, uzunlik kap) → `chat:message` broadcast +
  snapshot'ga oxirgi N ta xabar; web call-bar'ga va mobile call-bar'ga chat tugmasi. Infra
  (room broadcast) tayyor — arzon qo'shiladi.

### D2. [P2] Qo'l ko'tarishda ustoz tomonda faqat vizual indikator

- **Natija:** ustoz doskaga band bo'lib qolsa, qo'l ko'tarilganini o'tkazib yuboradi.
- **Fix:** host uchun toast + yumshoq signal ovozi + tab title'bá ("✋ 2 qo'l") — `hand:update`
  allaqachon keladi.

### D3. [P1] Mobile: pinch-zoom gesture yo'q (faqat +/− tugmalar)

- **Sabab:** [ClassroomBoard.tsx](apps/mobile/src/components/classroom/ClassroomBoard.tsx#L283-L370)
  pan + tap gesture bor, pinch yo'q; mavjud [ClassroomZoomPan.tsx](apps/mobile/src/components/classroom/ClassroomZoomPan.tsx)
  komponenti **hech qayerda ishlatilmaydi**.
- **Natija:** mobile o'quvchi ustoz zoomini ko'radi, lekin o'zi tabiiy ravishda "chimchilab"
  katta ololmaydi — web student'da bor imkoniyat. "Web→mobile to'liq" shartiga to'siq.
- **Fix:** `Gesture.Pinch()`ni pan bilan simultaneous qilib ulash (reanimated scale/focal
  matematikasi joriy clampCamera bilan birga).

### D4. [P2] Mobile: `splitRatio` e'tiborga olinmaydi

- **Sabab:** [ClassroomBoard.tsx:689-731](apps/mobile/src/components/classroom/ClassroomBoard.tsx#L689-L731)
  split rejimda ikkala pane `flex: 1` — ustozning nisbati (`state.splitRatio`) ishlatilmaydi.
- **Natija:** split darsda mobile o'quvchi ustoz ko'rayotgan proporsiyadan boshqacha ko'radi
  (kichik pane'da matn o'qib bo'lmaydi).
- **Fix:** `width: ${splitRatio*100}%` / `${(1-splitRatio)*100}%` tarzda ulash.

### D5. [P2] Qo'lda "resync" tugmasi yo'q

- **Natija:** client-side xato/desink holatida o'quvchi sahifani to'liq yangilashdan boshqa
  yo'li yo'q.
- **Fix:** `state:resync` event → server `toSocket(socketId, 'board:set', buildSnapshot(s))`
  (broadcaster'da `toSocket` tayyor); call-bar'da kichik "Sinxronlash" tugmasi.

---

## 5. Nima allaqachon yaxshi ishlayapti (buzish kerak emas)

- Optimistik stroke + `excludeSender` echo himoyasi ([gateway AsyncLocalStorage](apps/backend/src/classroom/classroom.gateway.ts#L20-L44))
  — chizishda "yo'qolib-qayta paydo bo'lish" yo'q.
- Pointer 30ms throttle, scroll/zoom debounce, RAF coalescing — tarmoq yuki boshqarilgan.
- Restart'ga qarshi: 15s autosave + SIGTERM'da graceful persist + `persistChain` navbati.
- Host grace (90s) — qisqa uzilishda dars o'lmaydi; board/student restore mexanizmi bor.
- Virtualization (web ±5, mobile ±3 sahifa) — 200 sahifali PDF ham DOM'ni bo'g'maydi.
- Mobile AppState re-join, guest name flow, audio unlock tugmasi (web), qurilma tanlash (web).

---

## 6. Ustuvorlik rejasi

| Prioritet | Topilmalar | Kutilayotgan effekt |
|---|---|---|
| **P0 — "to'xtashlarni" yo'q qiladi** | A1 (voice reconnect), A2 (background/keepawake), B9 (mobile join timeout/retry), B10 (tryAllTransports), B1 (heartbeat+resync) | Ovoz va doska uzilishlardan keyin o'zi tiklanadi; mobile cheklangan tarmoqlarda ham ulanadi yoki aniq xato ko'rsatadi |
| **P1 — "kechikish/qotishni" kamaytiradi** | B5 (autosave light), C1 (canvas layer cache), C3 (mobile prefetch), A3+A4 (mute enforcement + guest fix), A5 (TURN), D1 (chat), D3 (pinch-zoom), B2 (session mutex), B4 (view-state restore) | Uzoq darslarda ham barqaror fps; server spayklari yo'qoladi; ustoz nazorati haqiqiy; mobile UX web'dan qolishmaydi |
| **P2 — polirovka** | B3 (Redis state/scale), B6, B7, B8 (payload/xotira), C2, C4, C5, A6, A7, D2, D4, D5 | Hajm o'sishi barqaror; kichik UX nuqsonlar |

### Tez g'alabalar (1-2 kun ichida)
1. `tryAllTransports: true` + mobile join timeout/retry (B10, B9) — ~20 satr.
2. Voice reconnect + `Reconnecting` banner (A1) — ~60 satr, eng katta foyda.
3. Mute endpoint'dan `ParseUUIDPipe`ni olish (A4) — 1 satr.
4. iOS `UIBackgroundModes: audio` + KeepAwake (A2) — config-only.
5. `state:resync` event + student UI tugmasi (D5) — kichik, B1'ning birinchi qadami.
6. Mobile pinch-zoom (D3) — gesture qo'shish.

### Test reja (har fixdan keyin)
- **Ovoz uzilish testi:** dars davomida Wi-Fi↔LTE almashtirish, 30s flight mode, ekran lock 2min —
  ovoz ≤10s ichida qaytishi kerak (web va mobile).
- **Board resync testi:** student'ni 20s offline qilib qaytaring — sakrashsiz, to'g'ri holatga
  chiqishi; host heartbeat versiyasi bilan mos kelishi.
- **Uzun dars testi:** 90+ daqiqa intensiv chizish — server'da event-loop lag (perf hooks) va
  DB satr hajmi monitoring; student qurilmada fps.
- **Cheklangan tarmoq:** WS bloklangan proxy orqali mobile — polling fallback ishlashi;
  TURN'lik simulyatsiya (UDP yo'q) — audio TLS 443 orqali o'tishi.
- **Guest mute:** erkin darsda mehmonni mute → qayta unmute qila olmasligi (A3 fixdan keyin).
