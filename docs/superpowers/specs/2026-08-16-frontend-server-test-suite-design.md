# Frontend + Backend Test Suite (Core Flows): Design

## Context

The backend (NestJS) already has an established test culture: unit specs
(`*.spec.ts`, colocated with source, real logic under `classroom.logic.ts`,
`live.logic.ts` etc. is well covered) and e2e specs
(`apps/backend/test/*.e2e-spec.ts`) that run against a **real Postgres
database** via `jest-e2e.json`. Coverage today: `app`, `auth`, `admins`,
`tests`, `questions`, `groups`, `folders`, `submissions`, `schools`. No
e2e specs exist yet for `student-tests`, `classroom`, or `live`, despite
those having the heaviest business logic in the codebase
(`classroom.service.ts` is 1593 lines, `live.service.ts` 803 lines).

The frontend (React 19 + Vite + Zustand) has `vitest` wired up
(`apps/frontend/package.json` → `"test": "vitest run"`, jsdom installed)
but **zero test files exist**. 39 pages, ~30 API client modules under
`src/api/`, and a large `hooks/`/`stores/` layer are all untested.

There is no E2E tool anywhere in the repo (`apps/mobile` has Jest unit
tests only, no Detox/Playwright either).

This spec covers the first slice: **Auth**, **Tests/Questions** (core
product loop: teacher builds a test → student takes it → gets a result),
and **Classroom/Live** (real-time, Socket.IO-based, highest risk).
Remaining 30ish backend controllers and pages are explicitly out of
scope — follow-up slices once this foundation lands.

## Goals

- Frontend gets a real unit/integration test layer using the already
  configured Vitest + jsdom, following the pattern already validated in
  `apps/mobile/__tests__` (reducers, hooks, API modules tested with
  mocked HTTP).
- Backend gap-filled with e2e specs only where the 3 core flows lack
  them (`student-tests`, `classroom`, `live` controllers), reusing the
  existing `supertest` + real-DB pattern from `auth.e2e-spec.ts` — not
  reinventing it.
- A new Playwright E2E layer drives the real frontend dev server against
  the real backend + real Postgres, covering the 3 core flows
  end-to-end, including a two-browser-context classroom scenario (host +
  student sharing one live session over Socket.IO).

## Non-goals

- Payments, telegram, videos, boards-drawing internals, live voice
  (LiveKit) internals, school settings, challenges, word-decks,
  practice-messenger — not touched in this pass.
- Visual regression / screenshot testing.
- Load/performance testing of Socket.IO gateways.
- Fixing the stale `SUPER_ADMIN_EMAIL` in `.env.example` (actual code
  uses `SUPER_ADMIN_PHONE` per `seed.ts` — noted here so it isn't
  mistaken for spec error; a one-line fix but unrelated to test work).

## Architecture

Three layers, each independently runnable:

```
apps/frontend/src/**/*.test.ts(x)   — Vitest, jsdom, mocked axios/socket.io
apps/backend/test/*.e2e-spec.ts     — Jest + supertest, real Postgres
e2e/**/*.spec.ts (new top-level)    — Playwright, real dev servers, real DB
```

`e2e/` lives at the repo root (sibling to `apps/`) since it exercises
both apps together — it is its own workspace-like package, not owned by
frontend or backend alone.

### Layer 1 — Frontend unit/integration (Vitest)

Scope: `src/api/auth.ts`, `src/api/tests.ts`, `src/api/questions.ts`,
`src/api/student-tests.ts`, `src/api/classroom.ts`, `src/api/live.ts`,
`src/stores/authStore` (or wherever it lives), classroom reducers/hooks
equivalent to what `apps/mobile/__tests__/classroomReducers.test.ts`
already covers on mobile, and `client.ts`'s 401→logout→redirect
interceptor behavior.

Pattern: mock `axios` (or use `vi.mock('./client')`) so these are true
unit tests — no network, no backend required, fast. For hooks with
non-trivial state machines (classroom sync, zoom, scroll), test the
reducer/pure-logic functions directly rather than mounting full
components, mirroring the mobile app's approach.

A handful of component tests (React Testing Library, already have
`jsdom`) for the riskiest interactive pieces — login form validation,
test-taking question navigation — but the bulk of value is in
API-client and state-logic tests, not component snapshot tests.

New dependency needed: `@testing-library/react` (+
`@testing-library/jest-dom` optionally) — not currently installed.

### Layer 2 — Backend e2e gap-fill (Jest + supertest)

Add, following the exact shape of `auth.e2e-spec.ts`:

- `test/student-tests.e2e-spec.ts` — student fetches assigned
  tests/folders, submits answers.
- `test/classroom.e2e-spec.ts` — HTTP surface of
  `classroom.controller.ts` (session create/join/list, not the
  WebSocket gateway itself — that's covered live in Playwright).
- `test/live.e2e-spec.ts` — HTTP surface of `live.controller.ts`
  similarly.

These reuse the existing real-DB approach (no new infra). WebSocket
gateway behavior (`classroom.gateway.ts`, `live.gateway.ts`) is
intentionally **not** unit/e2e tested here beyond what
`classroom.service.spec.ts` / `live.service.spec.ts` already cover —
real-time multi-client behavior is exactly what the Playwright layer
below is for, and duplicating it in a raw socket.io-client test would
just be a weaker copy of that.

### Layer 3 — Playwright E2E (new)

New root-level `e2e/` package:

```
e2e/
  package.json
  playwright.config.ts
  fixtures/
    auth.setup.ts        # logs in once per role, saves storageState
  tests/
    auth.spec.ts          # login, bad password, register, password reset
    test-taking.spec.ts   # teacher creates test+questions → student takes it → result
    classroom.spec.ts     # two browser contexts: host starts session, student joins,
                           # host draws/changes page, student's view updates
```

- `playwright.config.ts` defines two projects (`teacher`, `student`)
  seeded via `auth.setup.ts` using real login against the dev backend,
  each saving a `storageState` json reused across tests — avoids
  re-logging-in per test.
- `webServer` config in Playwright starts backend (`nest start`) +
  frontend (`vite`) automatically for local/CI runs, pointed at a
  dedicated test database (`DATABASE_URL` override, e.g.
  `testplatform_e2e`) so runs are repeatable and don't pollute dev data.
  A `db:migrate` + a minimal seed (super admin + one teacher + one
  student fixture user) runs in `globalSetup` before tests start.
- Classroom test uses two Playwright `BrowserContext`s in the same test
  to simulate host + student sharing a live Socket.IO session — this is
  the one thing no lower layer can meaningfully cover.

New dependency: `@playwright/test`, added as its own small package
(`e2e/package.json`) rather than bolted onto frontend or backend, since
it depends on neither app's runtime and has its own browser-binary
install step (`playwright install`).

## Test data / environment

- A dedicated Postgres database for e2e (`testplatform_e2e` or similar),
  separate from whatever `apps/backend/test/*.e2e-spec.ts` currently
  targets (need to check whether those already assume a specific DB —
  worth confirming they're safe to run against a disposable DB before
  wiring CI).
- `.env.test` (or equivalent) holding `SUPER_ADMIN_PHONE` /
  `SUPER_ADMIN_PASSWORD` matching what `seed.ts` actually expects (not
  the stale `.env.example` keys).
- Playwright's `globalSetup` runs drizzle migrations + a small seed
  script (extending `src/db/seed.ts` or adding a sibling
  `seed.e2e.ts`) creating: 1 super admin, 1 teacher/admin role user, 1
  student user, so `auth.setup.ts` has real credentials to log in with.

## Error handling / flakiness concerns

- Socket.IO-based classroom test is the main flakiness risk — use
  Playwright's built-in auto-waiting/`expect.poll` on DOM state (e.g.
  "student's page indicator shows page 2") rather than fixed sleeps.
- 401-redirect interceptor test (frontend unit) must assert
  `window.location.href` mutation without actually navigating jsdom —
  mock `window.location` or check the store's `logout()` call instead.

## Testing the tests

- `apps/frontend`: `npm run test` (already wired, just needs test files).
- `apps/backend`: `npm run test` (unit) and `npm run test:e2e` (already
  wired, new specs just added to existing dirs).
- `e2e/`: new `npm run test:e2e` (or similar) invoking
  `playwright test`, documented in a short README in `e2e/`.

## Open items for follow-up slices (not this pass)

- Remaining ~30 backend controllers without e2e coverage.
- Remaining ~35 frontend pages without unit/component coverage.
- CI wiring (GitHub Actions or equivalent) to run all three layers on
  PRs — not addressed here, this spec is scoped to local test-suite
  construction first.
