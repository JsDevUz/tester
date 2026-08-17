# Codebase Analysis Report — Backend, Frontend, Mobile

Date: 2026-08-17
Scope: `apps/backend` (NestJS), `apps/frontend` (React 19 + Vite), `apps/mobile` (React Native 0.86)
Focus areas: Performance, Security, Clean Code

---

## Executive Summary

| App | Files (src) | Tests | Security | Performance | Clean Code |
|---|---|---|---|---|---|
| Backend | 177 `.ts` | 33 spec + 11 e2e | B+ | B | B |
| Frontend | 242 `.ts/.tsx` | 4 test files | C+ | A− | B− |
| Mobile | 121 `.ts/.tsx` | 18 test files | B− | B+ | B+ |

**Overall:** a well-architected monorepo with thoughtful domain modularization, good auth design on the backend, and disciplined frontend build optimization. The two most important gaps are: (1) an **unsanitized HTML rendering path** that, combined with `localStorage` tokens and 365-day JWTs, forms a complete account-takeover chain, and (2) **very low frontend test coverage**.

---

## 1. BACKEND (NestJS 11 + Drizzle ORM + PostgreSQL + Redis + Socket.IO)

### 1.1 Security — Strengths

- **Fail-fast env validation** ([validate-env.ts](apps/backend/src/validate-env.ts)): refuses to boot with missing `DATABASE_URL`/`JWT_SECRET`/`FRONTEND_URL` or known insecure defaults; production additionally requires `TELEGRAM_WEBHOOK_SECRET` and `REDIS_URL`. LiveKit partial-config detection is a nice touch.
- **Restricted CORS** ([cors.ts](apps/backend/src/cors.ts)) — explicit allowlist, also applied to both Socket.IO gateways.
- **Global rate limiting** — `ThrottlerGuard` (120 req/min) registered as `APP_GUARD` in [app.module.ts](apps/backend/src/app.module.ts).
- **Global `ValidationPipe({ whitelist: true, transform: true })`** — strips undeclared DTO fields everywhere.
- **Auth codes hashed with bcrypt**, expire in 10 min, single-use. [auth.service.ts](apps/backend/src/auth/auth.service.ts) `verifyCodeByPurpose()` explicitly solves two subtle attacks: code collisions across accounts (ambiguity → reject) and parallel-claim races (conditional `usedAt` update). This is above-average auth-code hygiene.
- **Telegram webhook secret verification** ([telegram.controller.ts](apps/backend/src/telegram/telegram.controller.ts)), enforced in production.
- **Upload hardening** ([upload.controller.ts](apps/backend/src/upload/upload.controller.ts)): extension allowlist, 50 MB cap, UUID-randomized object keys, folder allowlist.
- **No answer leakage in test-taking flow** — [delivery.service.ts](apps/backend/src/delivery/delivery.service.ts) line 172 maps options to `{ id, text, orderIndex }` only; correct answers are revealed solely per `showResults` policy.
- **Parameterized queries throughout** (Drizzle); the one raw `sql` usage is a `SELECT ... FOR UPDATE` with bound parameters — safe.
- **Secrets hygiene** — `.env` files gitignored; only `.env.example` files tracked.

### 1.2 Security — Issues

| # | Severity | Issue | Location |
|---|---|---|---|
| B1 | **High** | JWT lifetime is **365 days** (`signOptions: { expiresIn: '365d' }`) with no refresh-token rotation or revocation list. A stolen token works for a year. | [auth.module.ts](apps/backend/src/auth/auth.module.ts) |
| B2 | **High** | Editor HTML (`block.html`) is rendered client-side with **zero sanitization** — no DOMPurify/sanitize-html anywhere in backend or frontend. Any teacher/curator account (or a compromised one) can inject `<script>`/event-handler HTML that executes for every student viewing the lesson. | [content-blocks](apps/backend/src/content-blocks), [LessonContentRenderer.tsx](apps/frontend/src/components/course/LessonContentRenderer.tsx) |
| B3 | Medium | No **helmet** (missing CSP, X-Content-Type-Options, Referrer-Policy) and no response **compression** middleware. | [main.ts](apps/backend/src/main.ts) |
| B4 | Medium | Upload validation is **extension-only** — no magic-byte/MIME sniffing. Polyglot files (e.g., a valid PDF with embedded JS) can pass. Mitigated by object-storage hosting + random keys, but public URLs make stored content reachable. | [upload.controller.ts](apps/backend/src/upload/upload.controller.ts) |
| B5 | Medium | `verifyCodeByPurpose` fetches up to 100 unused codes and runs **up to 100 bcrypt comparisons per request** (~seconds of CPU). The generic 120/min throttler softens but doesn't eliminate this as a CPU-DoS vector. Consider a tighter per-route throttle or a code→phone index. | [auth.service.ts](apps/backend/src/auth/auth.service.ts) |
| B6 | Medium | Login endpoint shares the generic rate limit — no dedicated credential-bruteforce protection (e.g., 5–10 attempts/min + lockout). | [auth.controller.ts](apps/backend/src/auth/auth.controller.ts) |
| B7 | Low | Telegram webhook secret compared with `!==` (non-constant-time). Use `crypto.timingSafeEqual`. | [telegram.controller.ts](apps/backend/src/telegram/telegram.controller.ts) |
| B8 | Low | Passwords delivered to users in **plaintext via Telegram** (by design). Operationally accepted, but document the risk. | [auth.service.ts](apps/backend/src/auth/auth.service.ts) |
| B9 | Low | bcrypt cost factor 10 — consider 12 for future-proofing. | auth.service.ts |

### 1.3 Performance

**Strengths:**
- Socket.IO **Redis adapter** ([redis-io.adapter.ts](apps/backend/src/redis)) — horizontally scalable realtime.
- **DB indexes on hot paths**: auth codes (phone+purpose, purpose+createdAt), chat messages, enrollments, unique constraints doubling as lookup indexes ([schema.ts](apps/backend/src/db/schema.ts)).
- S3 uploads sent with `Cache-Control: public, max-age=31536000, immutable`.
- HLS manifest duration parsing avoids storing redundant metadata.

**Issues:**
- **50 MB files buffered fully in memory** (`memoryStorage()` in multer). A handful of concurrent max-size uploads can spike RAM. Switch to streaming to S3 (`PutObjectCommand` accepts streams) or disk-temp storage.
- Sequential `for (const sessionId of sessionIds) { await ... }` loop in [classroom.service.ts](apps/backend/src/classroom/classroom.service.ts) (~line 617) — batch with `Promise.all` where safe.
- No HTTP response compression (see B3) — matters for large JSON lists on mobile networks.

### 1.4 Clean Code

**Strengths:**
- Clean one-module-per-domain layout (30 feature modules), consistent controller/service/guard idioms.
- Excellent test base for a backend this size: 33 unit specs + 11 e2e files.
- Comments explain *why* (threat models, race conditions), not *what* — e.g., the AsyncLocalStorage rationale in [classroom.gateway.ts](apps/backend/src/classroom/classroom.gateway.ts).
- Only 1 TODO marker in the whole backend.

**Issues:**
- **215 `: any` usages** (excluding specs) — the largest type-safety debt of the three apps. Concentrated around `req.admin` (`@Req() req: any` in controllers) — fixable with one typed decorator.
- **[classroom.service.ts](apps/backend/src/classroom/classroom.service.ts) is 1,601 lines** — a god object. Split by responsibility (session lifecycle already extracted — continue with boards/attendance/snapshots which exist as separate services but the core still hosts too much).
- Mixed Uzbek/English comments — fine for the team, but pick one language per file for consistency.

---

## 2. FRONTEND (React 19 + Vite 8 + Mantine + Tailwind 4 + Zustand)

### 2.1 Security

**Issues:**

| # | Severity | Issue | Location |
|---|---|---|---|
| F1 | **High** (chain with B2) | `dangerouslySetInnerHTML={{ __html: block.html }}` renders **unsanitized** server-stored editor HTML to students. | [LessonContentRenderer.tsx](apps/frontend/src/components/course/LessonContentRenderer.tsx) |
| F2 | **High** (chain with B1) | JWT in **`localStorage`** ([authStore.ts](apps/frontend/src/stores/authStore.ts), read in 10+ places incl. [client.ts](apps/frontend/src/api/client.ts)). Any successful XSS = full token exfiltration, valid 365 days. | — |
| F3 | Medium | KaTeX rendered via `renderToString` + `innerHTML` ([EditorBlock.tsx](apps/frontend/src/components/course/EditorBlock.tsx)) — KaTeX output is safe by default (it escapes input), but only while `strict` mode isn't bypassed. Pin KaTeX options explicitly. | — |

**Strengths:** zero `console.*` in shipped code; no `eval`; axios 15 s timeout; global 401 → logout redirect; iframe embeds limited to teacher-authored `embedUrl`.

**Recommendation for the F1+F2+B1 chain (highest-impact fix in the whole repo):** sanitize with DOMPurify on render, move the token to an `httpOnly` cookie (or at minimum shorten JWT lifetime + add refresh rotation).

### 2.2 Performance — mostly strong

- **Route-level code splitting**: every page is `lazy()` + `Suspense` ([App.tsx](apps/frontend/src/App.tsx)).
- **Deliberate vendor chunking** ([vite.config.ts](apps/frontend/vite.config.ts)): blocknote, katex, jspdf, pdf-viewer, livekit, hls, mantine, dnd-kit each get their own chunk — heavy features load on demand.
- HLS streaming for lesson video; react-pdf isolated from the main bundle.
- Zustand (lightweight, no Provider hell) for state.

**Issues:**
- `localStorage.getItem("token")` called inline on every socket emit ([useClassroomSession.ts](apps/frontend/src/hooks/useClassroomSession.ts) line 401) — read once, cache in a ref.
- Verify list rendering in long pages uses keys + memoization; several 700–1,500-line components suggest render-profiling is overdue (below).

### 2.3 Clean Code

**Strengths:** tidy layering (`api/` / `hooks/` / `stores/` / `components/` / `pages/`); typed API modules; oxlint in CI; path-consistent naming.

**Issues:**
- **Test coverage is the weakest point of the entire monorepo: 4 test files for 242 source files.** The classroom canvas, delivery, and payments flows have no frontend tests.
- **[courseStore.ts](apps/frontend/src/stores/courseStore.ts) is 1,687 lines** — split into slices (a `stores/slices/` directory already exists — use it).
- Oversized components: `ClassroomShapeStylePanel` 1,486 lines, `ClassroomPdfViewer` 1,438, `HlsVideoPlayer` 1,170, `useClassroomSession` 922. These need decomposition; they're also the least testable files.
- 82 `: any` usages.

---

## 3. MOBILE (React Native 0.86 + React Navigation 7 + NativeWind + Skia)

### 3.1 Security

| # | Severity | Issue | Location |
|---|---|---|---|
| M1 | Medium | Session token in **AsyncStorage (unencrypted)**. On rooted/jailbroken devices it's readable. Use `react-native-keychain` / EncryptedStorage. | [storage.ts](apps/mobile/src/lib/storage.ts), [authStore.ts](apps/mobile/src/store/authStore.ts) |
| M2 | Low | 8 `console.*` calls in src — strip in release (babel-plugin-transform-remove-console). | — |
| M3 | Low | `WebScreen.tsx` embeds a WebView — audit `javaScriptEnabled`/origin allowlist if it loads remote URLs. | [WebScreen.tsx](apps/mobile/src/screens/WebScreen.tsx) |

**Strengths:** student-role gate on login; 401 → logout interceptor; centralized axios instance with timeout; `react-native-render-html` (safe HTML rendering, no raw WebView injection for lesson content).

### 3.2 Performance

**Strengths:**
- **Skia-based classroom canvas** — GPU-accelerated drawing, the right call for realtime whiteboard.
- **FlatList/SectionList in 13 files** — virtualization is used for lists.
- Offline-tolerant `cached()` helper in [storage.ts](apps/mobile/src/lib/storage.ts) — serves stale data on network failure.
- LiveKit via native WebRTC build.

**Issues:**
- **18 files use `ScrollView`** — audit each for `.map()` over unbounded arrays (kills RN scroll perf); convert long ones to FlatList.
- No list-memoization audit: check `React.memo`/`useCallback` around FlatList `renderItem` in the classroom/messenger screens (high-frequency socket updates).

### 3.3 Clean Code — the best of the three apps

- **Only 6 `: any`** in 121 files — excellent type discipline.
- 18 test files (~15% ratio) — moderate, better than frontend.
- **Issues:**
  - [lib/api.ts](apps/mobile/src/lib/api.ts) is written as minified one-liners — expand for readability.
  - [classroomReducers.ts](apps/mobile/src/lib/classroomReducers.ts) (837 lines) duplicates frontend classroom logic — consider a shared `packages/classroom-core` in the monorepo to kill the duplication.
  - `ChallengeWordPracticeScreen.tsx` 853 lines — largest screen, candidate for splitting.

---

## 4. Prioritized Recommendations

### P0 — fix immediately
1. **Sanitize editor HTML** before render: add `dompurify` to the frontend (`DOMPurify.sanitize(block.html)`) and/or `sanitize-html` on content-block save in the backend. (Fixes B2+F1.)
2. **Reduce JWT lifetime** to hours + introduce refresh tokens; until then, do not store the token in `localStorage`. (B1+F2.)
3. **Add `helmet`** in `main.ts` (one line) and `compression`.

### P1 — this sprint
4. Dedicated rate limit on `/auth/login` and code-verify endpoints; restructure `verifyCodeByPurpose` to avoid O(n) bcrypt (B5, B6).
5. Stream uploads to S3 instead of 50 MB memory buffers.
6. Frontend: write tests for the money paths first — delivery/test-taking, payments UI, classroom canvas reducers.
7. Mobile: move session to Keychain/Keystore (M1).

### P2 — next quarter
8. Split `classroom.service.ts` (backend) and `courseStore.ts` + the 1,400-line classroom components (frontend).
9. Introduce a typed `@CurrentUser()` decorator to eliminate `req: any` (cuts most of backend's 215 `any`s).
10. Extract shared classroom/lesson logic into a monorepo package consumed by both frontend and mobile.
11. `crypto.timingSafeEqual` for the Telegram webhook secret; MIME-sniff uploads.
12. Audit mobile ScrollViews for unbounded `.map()` lists; add `React.memo` around hot list rows.

---

## 5. What's Already Good (worth keeping)

- Backend auth-code flow with ambiguity rejection and atomic claiming — rare to see done correctly.
- Fail-fast env validation blocking insecure defaults.
- Answer-key isolation in the delivery flow (options stripped before reaching students).
- Disciplined Vite vendor chunking + full route-level lazy loading.
- Socket.IO on Redis adapter from day one — no painful retrofit later.
- Mobile type discipline (6 `any`s) and GPU-accelerated canvas.
- `.env` hygiene across all three apps; zero `console.*` in frontend production code.
