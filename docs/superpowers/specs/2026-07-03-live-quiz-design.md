# Live Quiz (Real-time musobaqa) — Dizayn hujjati

**Sana:** 2026-07-03
**Holat:** Tasdiqlangan

## Maqsad

Kahoot uslubidagi real-time musobaqa rejimi: ustoz mavjud testidan live sessiya yaratadi, o'quvchilar PIN bilan kiradi, savollar hammada sinxron ochiladi, tezlik ballari va jonli leaderboard bilan.

## Asosiy qarorlar

| Qaror | Tanlov |
|---|---|
| Savol manbai | Mavjud testdan (yangi test turi yaratilmaydi) |
| Savol turlari | Faqat `single`, `multi`, `truefalse` — boshqa turlar sessiyaga kiritilmaydi |
| O'quvchi kirishi | PIN + login majburiy (JWT) |
| Natijalar | DB ga saqlanadi (`submissions` + `answers`, `mode='live'`) |
| Ustoz ekrani | Dashboard: joriy savol, javob progress, live leaderboard |
| Savol vaqti | Sessiya yaratishda bitta umumiy qiymat (10/20/30/60s) |
| Javobdan keyin | Faqat kutish ekrani — to'g'ri/noto'g'ri reveal paytida ochiladi |
| O'tish | Avtomatik: hamma javob berdi YOKI vaqt tugadi (ustoz qo'lda o'tkazmaydi) |
| Transport | socket.io (`@nestjs/websockets` + `@nestjs/platform-socket.io`) |
| State | In-memory `Map` (Redis yo'q; backend restart = aktiv sessiya yo'qoladi — qabul qilingan risk) |

## Foydalanuvchi oqimi

### Ustoz
1. `/live` sahifasi: test tanlaydi (nomi bo'yicha qidiriladigan select) yoki test kartasidagi "Live" tugmasi orqali keladi (`/live?testId=...` — test oldindan tanlangan)
2. Savol vaqtini tanlaydi: 10 / 20 / 30 / 60 soniya
3. "Yaratish" → server 6 xonali unikal PIN qaytaradi → `/live/host/:pin` lobby
4. Lobbyda katta PIN + kirgan o'quvchilar ro'yxati jonli ko'rinadi
5. "Boshlash" bosadi → savol sikli boshlanadi
6. Dashboard: joriy savol matni, variantlar, timer, "X / N javob berdi" progress, reveal paytida to'g'ri javob taqsimoti va leaderboard
7. Xohlasa istalgan payt "Sessiyani tugatish" bosadi
8. Oxirida yakuniy leaderboard, natijalar DB ga yozilgan

### O'quvchi
1. `/live/join`: 6 xonali PIN kiritadi (katta raqamli input)
2. Login bo'lmasa → `/login?redirect=/live/join?pin=XXXXXX` ga yo'naladi
3. Lobbyga tushadi: "O'yin boshlanishini kuting", boshqa o'yinchilar ismlari
4. Savol ochiladi: savol matni + variantlar (letter badge), tepada kamayuvchi timer bar
5. Javob beradi → kutish ekrani: "Javob qabul qilindi" + "X / N javob berdi"
6. Reveal (4 soniya): to'g'ri javob, o'z natijasi (+ball), top-5 leaderboard, o'z o'rni
7. Keyingi savol avtomatik ochiladi
8. Oxirida podium (top-3) + to'liq ro'yxat + o'z o'rni

## Ball formulasi

```
to'g'ri javob:  round(500 + 500 × (qolgan_ms / max_ms))
noto'g'ri:      0
javob bermadi:  0
```

Vaqt server soati bo'yicha o'lchanadi: `answer_time = Date.now() - questionStartedAt`. Client yuborgan vaqtga ishonilmaydi.

`multi` turida: tanlangan to'plam to'g'ri to'plamga aynan teng bo'lsa to'g'ri (mavjud `evaluateObjectiveAnswer` mantiqiga mos).

## Backend arxitekturasi

Yangi modul: `apps/backend/src/live/`

```
live.module.ts      — modul deklaratsiyasi
live.controller.ts  — REST: POST /live/sessions (ustoz, JWT teacher/super)
live.gateway.ts     — socket.io gateway, namespace '/live'
live.service.ts     — sessiya state machine, in-memory Map<pin, LiveSession>
live.types.ts       — interfeyslar
```

### Sessiya holati

```typescript
interface LivePlayer {
  userId: string;
  name: string;
  socketId: string | null;      // null = uzilgan
  score: number;
  answers: Map<string, {        // questionId → javob
    selectedOptionIds: string[];
    isCorrect: boolean;
    points: number;
    timeMs: number;
  }>;
}

interface LiveSession {
  pin: string;                  // 6 xonali raqam, unikal aktiv sessiyalar orasida
  testId: string;
  testName: string;
  hostAdminId: string;
  hostSocketId: string | null;
  questionTimeSec: number;      // 10 | 20 | 30 | 60
  status: 'lobby' | 'question' | 'reveal' | 'finished';
  questions: LiveQuestion[];    // faqat single/multi/truefalse, correct ids server-side
  currentIdx: number;
  questionStartedAt: number;    // Date.now()
  questionTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  hostDisconnectTimer: NodeJS.Timeout | null;
  players: Map<string, LivePlayer>;  // userId → player
}
```

### REST endpoint

`POST /api/v1/live/sessions` (JWT, teacher/super)
Body: `{ testId: string, questionTimeSec: number }`
Javob: `{ pin: string }`

Server test savollarini yuklaydi, `single|multi|truefalse` turlarini filtrlaydi. Mos savol 0 ta bo'lsa — `400 NO_LIVE_QUESTIONS`. `questionTimeSec` faqat `[10,20,30,60]` dan biri.

### WebSocket eventlar (namespace `/live`)

**Client → Server:**

| Event | Payload | Kim | Izoh |
|---|---|---|---|
| `host:join` | `{ pin, token }` | ustoz | Sessiya yaratilgach gateway ga ulanish. JWT tekshiriladi, adminId sessiya egasiga mos bo'lishi shart |
| `player:join` | `{ pin, token }` | o'quvchi | JWT dan userId + name olinadi. Qayta ulanish ham shu event — userId bo'yicha taniydi |
| `host:start` | `{ pin }` | ustoz | Lobby → birinchi savol |
| `player:answer` | `{ pin, questionId, selectedOptionIds }` | o'quvchi | Faqat `status='question'` va joriy savolga. Bitta marta — takrori rad etiladi |
| `host:end` | `{ pin }` | ustoz | Majburiy tugatish → natijalar saqlanadi |

**Server → Client:**

| Event | Payload | Kimga |
|---|---|---|
| `lobby:update` | `{ players: [{name}], count }` | hammaga |
| `question:start` | `{ idx, total, text, imageUrl, type, options: [{id, text}], endsAt, timeSec }` | hammaga (to'g'ri javob YO'Q) |
| `question:progress` | `{ answered, total }` | hammaga |
| `question:reveal` | umumiy: `{ correctOptionIds, distribution: {optionId: count}, leaderboard: top5 + o'z o'rni }`; har o'quvchiga shaxsiy: `{ isCorrect, points, score, rank }` | hammaga + shaxsiy |
| `game:finished` | `{ leaderboard: to'liq [{name, score, rank}] }` | hammaga |
| `session:error` | `{ code, message }` | so'rovchi socketga |
| `session:state` | joriy to'liq holat (reconnect uchun) | qayta ulangan socketga |

### Savol sikli (server-side state machine)

```
lobby --host:start--> question(idx=0)
question: timer = questionTimeSec
  player:answer kelganda:
    - ball hisoblanadi (lekin revealgacha yuborilmaydi)
    - question:progress broadcast
    - hamma javob berdi? → darhol reveal
  timer tugadi → reveal
reveal: 4 soniya
  - question:reveal broadcast
  - currentIdx+1 < total ? → keyingi question : → finished
finished:
  - game:finished broadcast
  - natijalar DB ga yoziladi
  - 60 soniyadan keyin sessiya Map dan o'chiriladi
```

### Reconnect va uzilishlar

- **O'quvchi uzildi:** `socketId = null`, o'yin davom etadi. Qayta `player:join` → `session:state` yuboriladi (joriy savol yoki reveal). Javob bermagan savollari 0 ball.
- **Ustoz uzildi:** `hostDisconnectTimer` = 2 daqiqa. Qaytmasa sessiya avtomatik `finished` — natijalar saqlanadi, o'quvchilarga `game:finished`.
- **Kechikkan o'quvchi:** o'yin boshlangandan keyin `player:join` qabul qilinadi — joriy savoldan qo'shiladi, oldingi savollar 0 ball.
- **PIN topilmadi / sessiya tugagan:** `session:error { code: 'NOT_FOUND' }`.

## DB o'zgarishlar

`submissions` jadvaliga bitta ustun:

```sql
ALTER TABLE submissions ADD COLUMN mode text NOT NULL DEFAULT 'normal';
```

Sessiya tugaganda har bir o'yinchi uchun:
- `submissions` qatori: `testId`, `userId`, `studentName`, `score` (to'g'ri javoblar soni), `total` (savollar soni), `mode='live'`, `submittedAt=now`
- `answers` qatorlari: har savolga `selectedOptionIds`, `isCorrect`

Eslatma: `score` ustunida musobaqa ballari emas, to'g'ri javoblar soni saqlanadi — mavjud tarix/statistika sahifalari buzilmasligi uchun. Musobaqa ballari faqat sessiya ichida yashaydi.

O'quvchi tarixi (`/me/submissions`) da live testlar avtomatik ko'rinadi.

## Frontend

Yangi sahifalar (`apps/frontend/src/pages/`):

| Route | Fayl | Kim | Tavsif |
|---|---|---|---|
| `/live` | `LiveCreatePage.tsx` | ustoz | Test tanlash (searchable select, `?testId=` bilan pre-select) + vaqt tanlash + Yaratish |
| `/live/host/:pin` | `LiveHostPage.tsx` | ustoz | Lobby → dashboard → yakuniy leaderboard |
| `/live/join` | `LiveJoinPage.tsx` | o'quvchi | PIN input (6 raqam), login redirect |
| `/live/play/:pin` | `LivePlayPage.tsx` | o'quvchi | Lobby → savol → kutish → reveal → podium |

Umumiy socket hook: `apps/frontend/src/hooks/useLiveSocket.ts` — `socket.io-client` ulanish, auth token, reconnect.

**UI uslubi:** TakeTestPage bilan bir xil dizayn tili — to'liq ekran (`100dvh`), safe-area, indigo/soft palette, letter badge variantlar, `rounded-2xl`. Timer — tepada kamayuvchi rangli progress bar (oxirgi 5 soniyada qizil). Lucide ikonlar, emoji yo'q.

**Kirish nuqtalari:**
- FolderView dagi test kartasiga "Live" tugma → `/live?testId=...`
- O'quvchi uchun: login qilingan bosh sahifada / Toolbar da "Live o'yin" havolasi → `/live/join`

## Infra

- Backend: `socket.io`, `@nestjs/websockets`, `@nestjs/platform-socket.io` paketlari
- Frontend: `socket.io-client`
- Caddy: `handle /socket.io/* { reverse_proxy backend:3000 }` qo'shiladi (WS upgrade avtomatik)
- CORS: gateway da frontend originiga ruxsat

## Testlash

- **Backend unit:** ball formulasi, savol sikli o'tishlari (hamma javob berdi → erta reveal; timer → reveal), reconnect state, multi javob tekshiruvi
- **Gateway integration:** socket.io-client bilan: join → start → answer → reveal → finished to'liq sikl; 2 o'yinchi bilan leaderboard tartibi
- **Qo'lda:** 2 brauzer (ustoz + o'quvchi) bilan to'liq o'yin; telefonda safe-area

## Chegaralar (YAGNI)

- Guruh rejimlari (2vs2, jamoa) — bu specga kirmaydi, keyingi bosqich
- Redis / gorizontal masshtab — kerak emas
- Savol banki, tasodifiy savol tanlash — kerak emas (test qanday bo'lsa shunday)
- Ovoz/musiqa effektlari — kerak emas
