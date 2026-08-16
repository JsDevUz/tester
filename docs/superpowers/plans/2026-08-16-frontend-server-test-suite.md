# Frontend + Backend Core-Flow Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real test layer for the currently-untested frontend (Vitest unit/integration tests), fill backend e2e gaps for the delivery/classroom/live flows, and add a new Playwright E2E layer covering login, the full test-taking loop, and a two-browser-context classroom real-time session.

**Architecture:** Three independent layers. Frontend unit tests mock `axios` and exercise `src/api/*.ts` + Zustand stores directly (no network, no backend). Backend e2e specs reuse the existing `supertest` + real-Postgres pattern already established in `apps/backend/test/*.e2e-spec.ts`. A new root-level `e2e/` package drives Playwright against real `vite` + `nest start` dev servers pointed at a dedicated test database.

**Tech Stack:** Vitest (already installed) + `@testing-library/react` (new) for frontend; Jest + supertest (already installed) for backend; `@playwright/test` (new) in a new `e2e/` workspace package.

**Spec:** `docs/superpowers/specs/2026-08-16-frontend-server-test-suite-design.md`

## Global Constraints

- Backend login is **phone + password**, not email — `POST /api/v1/auth/login` body is `{ phone, password }` (`apps/backend/src/auth/auth.controller.ts`). The `.env.example` file's `SUPER_ADMIN_EMAIL` key is stale; actual seeding (`apps/backend/src/db/seed.ts`) reads `SUPER_ADMIN_PHONE` and `SUPER_ADMIN_PASSWORD`. All new e2e/Playwright code must use `phone`.
- All backend routes are prefixed `api/v1` (`app.setGlobalPrefix('api/v1')` set in every existing e2e spec's `beforeAll`).
- Student "take a test" flow is **public** (no JWT required) — `apps/backend/src/delivery/delivery.controller.ts`, `@Controller('public')`, keyed by test `slug`, with an optional Bearer token for logged-in students. This is a different flow from `apps/backend/src/student-tests/*` (which is a *student's own* private test/folder feature gated `@Roles('student')`) — do not confuse the two. Core-flow E2E work in this plan targets the **delivery** (public) flow.
- Classroom session creation via `POST /classroom/sessions` requires a real `courseId` (full course/group/enrollment graph). `POST /classroom/sessions/free` (`createFreeSession`) requires only a logged-in teacher/super admin and no course — use the **free session** endpoint for E2E classroom coverage to avoid seeding an unrelated course subsystem.
- No `data-testid` attributes exist anywhere in `apps/frontend/src` today. Playwright specs must select by visible role/label/text (Playwright's recommended approach) except where this plan explicitly adds a `data-testid` to disambiguate.
- Existing test file naming conventions must be followed exactly: backend e2e specs are `<name>.e2e-spec.ts` in `apps/backend/test/`; backend unit specs are `<name>.spec.ts` colocated with source; frontend unit tests use `<name>.test.ts`/`.test.tsx` (mirroring `apps/mobile/__tests__` naming, but colocated next to source per Vitest convention, not in a separate `__tests__` dir, since no such dir exists in `apps/frontend`).

---

## Task 1: Frontend Vitest environment setup

**Files:**
- Modify: `apps/frontend/package.json`
- Create: `apps/frontend/vitest.config.ts`
- Create: `apps/frontend/src/test/setup.ts`

**Interfaces:**
- Produces: a working `npm run test` in `apps/frontend` that discovers `*.test.ts`/`*.test.tsx` files, runs them under jsdom, and has `@testing-library/react` + `@testing-library/jest-dom` matchers available globally.

- [ ] **Step 1: Install test dependencies**

Run:
```bash
cd apps/frontend && npm install -D @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

- [ ] **Step 2: Create the Vitest config**

`apps/frontend/vite.config.ts` already exists and configures the Vite build — create a separate `vitest.config.ts` so test config doesn't fight the build config's plugins:

```typescript
// apps/frontend/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 3: Create the setup file**

```typescript
// apps/frontend/src/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Update package.json test script to use the new config**

Modify `apps/frontend/package.json`:
```json
"test": "vitest run --config vitest.config.ts"
```

- [ ] **Step 5: Verify the harness runs with zero test files**

Run: `cd apps/frontend && npm run test`
Expected: exits 0, reports "No test files found" (or similar) — confirms config loads without errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vitest.config.ts apps/frontend/src/test/setup.ts apps/frontend/package-lock.json
git commit -m "test(frontend): add Vitest + Testing Library harness"
```

---

## Task 2: Frontend unit tests — auth API client and authStore

**Files:**
- Create: `apps/frontend/src/api/auth.test.ts`
- Create: `apps/frontend/src/stores/authStore.test.ts`
- Test: (same files — these are the tests)

**Interfaces:**
- Consumes: `apiLogin(phone, password)`, `apiTelegramLogin(code)`, `apiCompletePasswordReset(input)` from `apps/frontend/src/api/auth.ts`; `useAuthStore` from `apps/frontend/src/stores/authStore.ts` (state shape: `{ token, admin, login, loginWithTelegramCode, loginWithPasswordReset, logout, setAdmin }`).
- Produces: nothing consumed by later tasks — this task is self-contained.

- [ ] **Step 1: Write the failing test for `apiLogin`**

`client.ts` (`apps/frontend/src/api/client.ts`) is a real axios instance wired to `useLoadingStore`/`useAuthStore` — mock the whole module so `apiLogin` etc. are unit tests, not integration tests against a real client.

```typescript
// apps/frontend/src/api/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import client from './client';
import { apiLogin, apiGetMe, apiChangePassword } from './auth';

vi.mock('./client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

describe('auth api client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('apiLogin posts phone/password and returns the response body', async () => {
    const body = { access_token: 'tok', admin: { id: '1', name: 'Ali', role: 'student' }, user: { id: '1', name: 'Ali', role: 'student' } };
    vi.mocked(client.post).mockResolvedValueOnce({ data: body });

    const result = await apiLogin('+998901234567', 'secret');

    expect(client.post).toHaveBeenCalledWith('/auth/login', { phone: '+998901234567', password: 'secret' });
    expect(result).toEqual(body);
  });

  it('apiGetMe fetches the current admin', async () => {
    const admin = { id: '1', name: 'Ali', role: 'teacher' as const };
    vi.mocked(client.get).mockResolvedValueOnce({ data: admin });

    const result = await apiGetMe();

    expect(client.get).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual(admin);
  });

  it('apiChangePassword patches with current/new password', async () => {
    vi.mocked(client.patch).mockResolvedValueOnce({ data: { ok: true } });

    const result = await apiChangePassword('old', 'newpass123');

    expect(client.patch).toHaveBeenCalledWith('/auth/me/password', { currentPassword: 'old', newPassword: 'newpass123' });
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes cleanly**

Run: `cd apps/frontend && npx vitest run src/api/auth.test.ts`
Expected: PASS (this is testing existing, already-correct code — the point of Step 2 here is confirming the mock wiring works, since there's no new implementation to write). If it fails, the mock shape is wrong — fix the test, not `auth.ts`.

- [ ] **Step 3: Write the failing test for `authStore`**

```typescript
// apps/frontend/src/stores/authStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ token: null, admin: null });
    vi.clearAllMocks();
  });

  it('login stores the token in localStorage and updates state', async () => {
    const admin = { id: '1', name: 'Ali', role: 'student' as const };
    vi.mocked(authApi.apiLogin).mockResolvedValueOnce({ access_token: 'tok-1', admin, user: admin });

    await useAuthStore.getState().login('+998901234567', 'secret');

    expect(localStorage.getItem('token')).toBe('tok-1');
    expect(useAuthStore.getState().token).toBe('tok-1');
    expect(useAuthStore.getState().admin).toEqual(admin);
  });

  it('logout clears the token and admin', () => {
    localStorage.setItem('token', 'tok-1');
    useAuthStore.setState({ token: 'tok-1', admin: { id: '1', name: 'Ali', role: 'student' } });

    useAuthStore.getState().logout();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().admin).toBeNull();
  });

  it('login propagates a rejected promise on failure without touching state', async () => {
    vi.mocked(authApi.apiLogin).mockRejectedValueOnce(new Error('bad creds'));

    await expect(useAuthStore.getState().login('+998901234567', 'wrong')).rejects.toThrow('bad creds');
    expect(useAuthStore.getState().token).toBeNull();
  });
});
```

- [ ] **Step 4: Run both test files**

Run: `cd apps/frontend && npx vitest run src/api/auth.test.ts src/stores/authStore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/auth.test.ts apps/frontend/src/stores/authStore.test.ts
git commit -m "test(frontend): cover auth api client and authStore"
```

---

## Task 3: Frontend unit tests — 401 interceptor behavior in `client.ts`

**Files:**
- Create: `apps/frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: the default-exported axios instance from `apps/frontend/src/api/client.ts`, which reads `localStorage.getItem('token')` on request and calls `useAuthStore.getState().logout()` + `window.location.href = '/login'` on a 401 response.

- [ ] **Step 1: Write the test**

This tests real interceptor logic (not mocked), using axios's built-in adapter mocking is overkill here — instead, invoke the interceptor functions directly via axios's `interceptors.response.handlers` is fragile across versions. Simpler and robust: mock the `authStore` module (so `logout()` is observable) and drive a real request against a mock HTTP server is unnecessary — test the interceptor's error handler directly by triggering a rejected promise through the client's configured adapter.

```typescript
// apps/frontend/src/api/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../stores/authStore';

vi.mock('../stores/authStore', () => ({
  useAuthStore: { getState: vi.fn() },
}));

describe('api client 401 handling', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(useAuthStore.getState).mockReturnValue({ logout: vi.fn() } as any);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  it('logs out and redirects to /login on a 401 response', async () => {
    const { default: client } = await import('./client');
    const logout = useAuthStore.getState().logout;

    // Drive the response interceptor directly with a synthetic 401 error,
    // since spinning up a real HTTP 401 requires a live server this test
    // must not depend on.
    const handler = (client.interceptors.response as any).handlers[0];
    await expect(handler.rejected({ response: { status: 401 } })).rejects.toBeDefined();

    expect(logout).toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });

  it('does not log out on a non-401 error', async () => {
    const { default: client } = await import('./client');
    const logout = useAuthStore.getState().logout;

    const handler = (client.interceptors.response as any).handlers[0];
    await expect(handler.rejected({ response: { status: 500 } })).rejects.toBeDefined();

    expect(logout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/frontend && npx vitest run src/api/client.test.ts`
Expected: PASS. If `interceptors.response.handlers` isn't accessible in the installed axios version, fall back to reading `client.interceptors.response['handlers']` (same shape, axios has kept this internal array stable across v1.x) — do not change `client.ts` to make it more testable; test the existing code as-is.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/client.test.ts
git commit -m "test(frontend): cover 401 interceptor logout+redirect behavior"
```

---

## Task 4: Frontend unit tests — delivery API client (test-taking flow)

**Files:**
- Create: `apps/frontend/src/api/delivery.test.ts`

**Interfaces:**
- Consumes: `apiGetPublicTest`, `apiStartSubmission`, `apiCheckAnswer`, `apiSubmitAnswers`, `apiGetSubmissionResult` from `apps/frontend/src/api/delivery.ts` (uses its own `publicClient` axios instance, not the shared `client.ts`).

- [ ] **Step 1: Write the test**

```typescript
// apps/frontend/src/api/delivery.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  apiGetPublicTest,
  apiStartSubmission,
  apiSubmitAnswers,
  apiGetSubmissionResult,
} from './delivery';

vi.mock('axios');

describe('delivery api client', () => {
  const mockInstance = { get: vi.fn(), post: vi.fn(), interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.create).mockReturnValue(mockInstance as any);
  });

  it('apiGetPublicTest fetches by slug', async () => {
    const test = { id: 't1', name: 'Math Quiz', questions: [] };
    mockInstance.get.mockResolvedValueOnce({ data: test });

    const result = await apiGetPublicTest('abc123');

    expect(mockInstance.get).toHaveBeenCalledWith('/public/tests/abc123', { params: undefined });
    expect(result).toEqual(test);
  });

  it('apiGetPublicTest passes practice=1 when practiceMode is true', async () => {
    mockInstance.get.mockResolvedValueOnce({ data: {} });

    await apiGetPublicTest('abc123', true);

    expect(mockInstance.get).toHaveBeenCalledWith('/public/tests/abc123', { params: { practice: '1' } });
  });

  it('apiStartSubmission posts slug and studentName', async () => {
    mockInstance.post.mockResolvedValueOnce({ data: { submissionId: 'sub1' } });

    const result = await apiStartSubmission('abc123', 'Vali');

    expect(mockInstance.post).toHaveBeenCalledWith('/public/submissions', { slug: 'abc123', studentName: 'Vali' }, { params: undefined });
    expect(result).toEqual({ submissionId: 'sub1' });
  });

  it('apiSubmitAnswers posts answers with default normal mode', async () => {
    const resultBody = { submissionId: 'sub1', score: 1, total: 2, showResults: 'immediately', deadline: null, answers: [] };
    mockInstance.post.mockResolvedValueOnce({ data: resultBody });

    const result = await apiSubmitAnswers('sub1', [{ questionId: 'q1', selectedOptionIds: ['o1'], textAnswer: null }]);

    expect(mockInstance.post).toHaveBeenCalledWith(
      '/public/submissions/sub1/submit',
      { answers: [{ questionId: 'q1', selectedOptionIds: ['o1'], textAnswer: null }], mode: 'normal', violationReason: undefined },
      { params: undefined },
    );
    expect(result).toEqual(resultBody);
  });

  it('apiGetSubmissionResult fetches the result for a submission', async () => {
    mockInstance.get.mockResolvedValueOnce({ data: { submissionId: 'sub1', score: 2, total: 2 } });

    const result = await apiGetSubmissionResult('sub1');

    expect(mockInstance.get).toHaveBeenCalledWith('/public/submissions/sub1/result', { params: undefined });
    expect(result).toEqual({ submissionId: 'sub1', score: 2, total: 2 });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/frontend && npx vitest run src/api/delivery.test.ts`
Expected: PASS. If `axios.create` mocking doesn't intercept the module-level call in `delivery.ts` (since it runs at import time), use `vi.mock('axios')` with a factory that returns `{ create: vi.fn(() => mockInstance), ...}` declared inline in the `vi.mock` call so hoisting captures it correctly — Vitest hoists `vi.mock` calls above imports automatically.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/delivery.test.ts
git commit -m "test(frontend): cover delivery api client (public test-taking flow)"
```

---

## Task 5: Frontend unit tests — classroom reducers/hooks pure logic

**Files:**
- Read first: `apps/frontend/src/hooks/classroomReducers.ts` (already exists — inspect its exports before writing tests; do not assume shape)
- Create: `apps/frontend/src/hooks/classroomReducers.test.ts`

**Interfaces:**
- Consumes: whatever reducer functions `classroomReducers.ts` exports — inspect the file first since this plan was written without reading its full contents (only confirmed the file exists at `apps/frontend/src/hooks/classroomReducers.ts` and that `apps/mobile/__tests__/classroomReducers.test.ts` tests an equivalent on mobile).

- [ ] **Step 1: Read the frontend reducer file and its mobile equivalent side by side**

Run:
```bash
cat apps/frontend/src/hooks/classroomReducers.ts
cat apps/mobile/__tests__/classroomReducers.test.ts
```

Identify each exported pure function (likely stroke add/undo/redo/page-change handlers operating on `strokesByPage`/`CsStroke[]` state, based on `ClassroomPdfViewer.tsx`'s props: `strokesByPage: Record<number, CsStroke[]>`, `currentPage: number`). Mirror the mobile test's scenarios (add stroke, undo, redo, clear page) against the frontend's actual exported function names — **do not invent function names**; use exactly what Step 1's `cat` output shows.

- [ ] **Step 2: Write tests for each exported reducer function**

Follow this shape, substituting real function/type names discovered in Step 1 (example shown using placeholder names `addStrokeToPage`/`undoLastStroke` — replace with actual names before writing):

```typescript
// apps/frontend/src/hooks/classroomReducers.test.ts
import { describe, it, expect } from 'vitest';
// import { <actualExportedFunctions> } from './classroomReducers';

describe('classroomReducers', () => {
  it('adding a stroke to an empty page appends it to that page\'s array', () => {
    // const state = {};
    // const stroke = { id: 's1', points: [[0, 0]], /* ...other CsStroke fields per classroom.ts types */ };
    // const next = addStrokeToPage(state, 1, stroke);
    // expect(next[1]).toEqual([stroke]);
  });

  it('undo removes the most recently added stroke on the current page', () => {
    // seed two strokes, call undo, assert only the first remains
  });

  it('clearing a page empties only that page\'s strokes, leaving others untouched', () => {
    // seed strokes on page 1 and page 2, clear page 1, assert page 2 unchanged
  });
});
```

Replace the commented pseudocode with real assertions against the actual function signatures found in Step 1. This step cannot be fully pre-written without reading the source first — that reading happens in Step 1 of this task, at implementation time, not in this planning pass.

- [ ] **Step 3: Run it**

Run: `cd apps/frontend && npx vitest run src/hooks/classroomReducers.test.ts`
Expected: PASS once assertions match real behavior.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/hooks/classroomReducers.test.ts
git commit -m "test(frontend): cover classroom board reducer pure logic"
```

---

## Task 6: Backend e2e — delivery flow (public test-taking)

**Files:**
- Create: `apps/backend/test/delivery.e2e-spec.ts`

**Interfaces:**
- Consumes: `db` and `folders`, `tests`, `questions`, `options` from `apps/backend/src/db/schema.ts` (same import pattern as `apps/backend/test/tests.e2e-spec.ts`), plus the public delivery routes: `GET /public/tests/:slug`, `POST /public/submissions`, `POST /public/submissions/:id/submit`, `GET /public/submissions/:id/result`.

- [ ] **Step 1: Write the e2e spec**

```typescript
// apps/backend/test/delivery.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders, tests, questions, options } from '../src/db/schema';

describe('Delivery (e2e) - public test-taking flow', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let slug: string;
  let questionId: string;
  let correctOptionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SUPER_ADMIN_PHONE, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Delivery E2E Folder' }).returning();

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId: folder.id, name: 'Delivery E2E Test', showResults: 'immediately' });
    slug = createRes.body.slug;
    // Slug is only assigned once the test is published/has a slug column
    // populated — if createRes.body.slug is null, this flow needs a
    // publish step; verify against tests.service.ts's create() before
    // assuming slug is always set on creation.

    const questionRes = await request(app.getHttpServer())
      .post(`/api/v1/tests/${createRes.body.id}/questions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: '2 + 2 = ?',
        type: 'single',
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      });
    questionId = questionRes.body.id;
    correctOptionId = questionRes.body.options.find((o: any) => o.isCorrect).id;
  });

  afterAll(() => app.close());

  it('GET /api/v1/public/tests/:slug - fetches the public test shape without auth', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/public/tests/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].id).toBe(questionId);
  });

  it('full flow: start submission -> submit answers -> get result', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/api/v1/public/submissions')
      .send({ slug, studentName: 'Anonim Talaba' });
    expect(startRes.status).toBe(201);
    const submissionId = startRes.body.submissionId;

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/public/submissions/${submissionId}/submit`)
      .send({ answers: [{ questionId, selectedOptionIds: [correctOptionId], textAnswer: null }], mode: 'normal' });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.score).toBe(1);
    expect(submitRes.body.total).toBe(1);

    const resultRes = await request(app.getHttpServer()).get(`/api/v1/public/submissions/${submissionId}/result`);
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.score).toBe(1);
  });

  it('GET /api/v1/public/tests/:slug - 404 for unknown slug', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/tests/doesnotexist');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and fix any wrong assumptions about slug assignment**

Run: `cd apps/backend && npm run test:e2e -- delivery.e2e-spec.ts`
Expected: PASS. If `createRes.body.slug` is `null` (test not yet "published"), read `apps/backend/src/tests/tests.service.ts`'s `create()` method to find the correct call to assign a slug (e.g. a separate publish endpoint), and adjust Step 1's `beforeAll` accordingly — this is exactly the kind of assumption that must be corrected against real behavior, not guessed twice.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/delivery.e2e-spec.ts
git commit -m "test(backend): add e2e coverage for public delivery (test-taking) flow"
```

---

## Task 7: Backend e2e — classroom free-session flow

**Files:**
- Create: `apps/backend/test/classroom.e2e-spec.ts`

**Interfaces:**
- Consumes: `POST /classroom/sessions/free`, `GET /classroom/sessions/:id`, `POST /classroom/sessions/:id/end`, `DELETE /classroom/sessions/:id` from `apps/backend/src/classroom/classroom.controller.ts`.

- [ ] **Step 1: Write the e2e spec**

```typescript
// apps/backend/test/classroom.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Classroom (e2e) - free session HTTP surface', () => {
  let app: INestApplication;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SUPER_ADMIN_PHONE, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
  });

  afterAll(() => app.close());

  it('POST /api/v1/classroom/sessions/free - creates a free session with no courseId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/classroom/sessions/free')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'E2E Free Lesson' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    sessionId = res.body.id;
  });

  it('GET /api/v1/classroom/sessions/:id - fetches the created session', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/classroom/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
  });

  it('POST /api/v1/classroom/sessions/free - 401 without a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/classroom/sessions/free')
      .send({ title: 'No Auth' });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/classroom/sessions/:id/end - ends the session', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/classroom/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/backend && npm run test:e2e -- classroom.e2e-spec.ts`
Expected: PASS. `POST` routes in this controller default to NestJS's 201 for POST unless `@HttpCode` overrides it — `endSession` has no `@HttpCode` decorator in the controller, so 201 is correct per Nest's default; if this fails with a different status, check `classroom.controller.ts` for an `@HttpCode` decorator on that route before changing the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/classroom.e2e-spec.ts
git commit -m "test(backend): add e2e coverage for classroom free-session HTTP routes"
```

---

## Task 8: Backend e2e — live session flow

**Files:**
- Create: `apps/backend/test/live.e2e-spec.ts`

**Interfaces:**
- Consumes: `GET /live/tests`, `POST /live/sessions`, `GET /live/sessions` from `apps/backend/src/live/live.controller.ts`. Needs a test with at least one "live-eligible" question — read `apps/backend/src/live/live.service.ts`'s `createSession` for what `NO_LIVE_QUESTIONS` requires before assuming a plain `single`-type question qualifies.

- [ ] **Step 1: Check what makes a question "live-eligible"**

Run: `grep -n "NO_LIVE_QUESTIONS\|listTests\b" -A 15 apps/backend/src/live/live.service.ts`

This determines which question `type`s are usable in the seeded test fixture below — adjust the `type`/`options` in Step 2 to match what the grep reveals (e.g. it may exclude `open`/`fillblank` types that can't be auto-scored live).

- [ ] **Step 2: Write the e2e spec**

```typescript
// apps/backend/test/live.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db } from '../src/db';
import { folders } from '../src/db/schema';

describe('Live (e2e) - session creation HTTP surface', () => {
  let app: INestApplication;
  let token: string;
  let adminId: string;
  let testId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SUPER_ADMIN_PHONE, password: process.env.SUPER_ADMIN_PASSWORD });
    token = loginRes.body.access_token;
    adminId = loginRes.body.admin.id;

    const [folder] = await db.insert(folders).values({ adminId, name: 'Live E2E Folder' }).returning();
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tests')
      .set('Authorization', `Bearer ${token}`)
      .send({ folderId: folder.id, name: 'Live E2E Test' });
    testId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/tests/${testId}/questions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'Capital of France?',
        type: 'single',
        options: [{ text: 'Paris', isCorrect: true }, { text: 'Berlin', isCorrect: false }],
      });
  });

  afterAll(() => app.close());

  it('GET /api/v1/live/tests - lists tests eligible for live sessions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/live/tests')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((t: any) => t.id === testId)).toBe(true);
  });

  it('POST /api/v1/live/sessions - creates a live session with a valid pin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/live/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId, questionTimeSec: 20, mode: 'individual' });
    expect(res.status).toBe(201);
    expect(res.body.pin).toMatch(/^\d{6}$/);
  });

  it('POST /api/v1/live/sessions - 404 for an unknown testId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/live/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ testId: '00000000-0000-0000-0000-000000000000', questionTimeSec: 20 });
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/live/sessions - 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/live/sessions');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run it**

Run: `cd apps/backend && npm run test:e2e -- live.e2e-spec.ts`
Expected: PASS. If `NO_LIVE_QUESTIONS` fires on the `single`-type question, revisit Step 1's grep output and adjust the question fixture.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/live.e2e-spec.ts
git commit -m "test(backend): add e2e coverage for live session creation HTTP routes"
```

---

## Task 9: Playwright package scaffold

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tsconfig.json`
- Create: `e2e/.gitignore`

**Interfaces:**
- Produces: a runnable `npx playwright test` from `e2e/` that, per `webServer` config, boots the backend and frontend dev servers automatically and tears them down after the run.

- [ ] **Step 1: Create the package**

```json
// e2e/package.json
{
  "name": "e2e",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

```json
// e2e/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["@playwright/test"]
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create the Playwright config**

Two projects share one `storageState`-producing setup project; `webServer` starts both apps pointed at a dedicated test database via `DATABASE_URL` override (the value here assumes a local Postgres reachable at this URL — matches the `DATABASE_URL` shape already used in `apps/backend/.env.example`, just a different database name so it never touches dev data):

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:3001';
const TEST_DATABASE_URL = process.env.E2E_DATABASE_URL
  ?? 'postgresql://testplatform:change_me@localhost:5432/testplatform_e2e';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // classroom.spec.ts shares real-time socket state; keep runs serial for now
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'teacher',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/teacher.json' },
      dependencies: ['setup'],
    },
    {
      name: 'student',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/student.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../apps/backend',
      url: `${BACKEND_URL}/api/v1/health`,
      env: { DATABASE_URL: TEST_DATABASE_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: '../apps/frontend',
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
```

- [ ] **Step 4: Create `.gitignore` for Playwright artifacts**

```
# e2e/.gitignore
node_modules/
test-results/
playwright-report/
.auth/
```

- [ ] **Step 5: Install and verify Playwright launches (no tests yet)**

Run:
```bash
cd e2e && npm install && npx playwright install --with-deps chromium
```
Expected: installs cleanly. There are no test files yet (Task 10 adds the first), so `npx playwright test` at this point is expected to report "no tests found" — that's the success condition for this step, don't add a placeholder test file to force a pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/package.json e2e/playwright.config.ts e2e/tsconfig.json e2e/.gitignore e2e/package-lock.json
git commit -m "test(e2e): scaffold Playwright package with dual dev-server webServer config"
```

---

## Task 10: Playwright — database seed script for E2E fixtures

**Files:**
- Create: `apps/backend/src/db/seed.e2e.ts`
- Create: `e2e/fixtures/globalSetup.ts`

**Interfaces:**
- Produces: a `teacher@e2e` and `student@e2e` fixture user in the `testplatform_e2e` database with known phone/password, callable both from a standalone script (`ts-node`) and from Playwright's `globalSetup`.
- Consumes: `apps/backend/src/db/seed.ts`'s pattern (reads `SUPER_ADMIN_PHONE`/`SUPER_ADMIN_PASSWORD`, inserts via drizzle) — read that file fully before writing this one, to reuse its password-hashing approach (likely `bcrypt`, matching `auth.service.ts`'s login check) rather than reinventing it.

- [ ] **Step 1: Read the existing seed script and auth password verification**

Run:
```bash
cat apps/backend/src/db/seed.ts
grep -n "bcrypt\|compare\|hash" apps/backend/src/auth/auth.service.ts
```

Confirm the exact hashing call (e.g. `bcrypt.hash(password, 10)`) used at signup/seed time so the E2E seed produces a password hash the login endpoint will actually accept.

- [ ] **Step 2: Write the E2E seed script, mirroring `seed.ts`'s structure**

```typescript
// apps/backend/src/db/seed.e2e.ts
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';

const FIXTURES = [
  { phone: '998900000001', password: 'e2e-teacher-pass', name: 'E2E Teacher', role: 'teacher' as const },
  { phone: '998900000002', password: 'e2e-student-pass', name: 'E2E Student', role: 'student' as const },
];

async function seedE2eFixtures() {
  for (const fixture of FIXTURES) {
    const existing = await db.query.users.findFirst({ where: eq(users.phone, fixture.phone) });
    if (existing) continue;
    const passwordHash = await bcrypt.hash(fixture.password, 10);
    await db.insert(users).values({
      phone: fixture.phone,
      passwordHash,
      name: fixture.name,
      role: fixture.role,
    });
    console.log(`Seeded ${fixture.role}: ${fixture.phone}`);
  }
}

seedE2eFixtures()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

Note: field names (`passwordHash` vs `password`, exact `users` columns) must match what Step 1's read of `schema.ts`'s `users` table actually defines — adjust the `db.insert(users).values(...)` call to the real column names before running.

- [ ] **Step 3: Add a `db:seed:e2e` script to backend package.json**

Modify `apps/backend/package.json`, add alongside the existing `"seed"` script:
```json
"seed:e2e": "ts-node -r tsconfig-paths/register src/db/seed.e2e.ts"
```

- [ ] **Step 4: Wire Playwright's globalSetup to run migrations + this seed**

```typescript
// e2e/fixtures/globalSetup.ts
import { execSync } from 'node:child_process';

export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.E2E_DATABASE_URL
      ?? 'postgresql://testplatform:change_me@localhost:5432/testplatform_e2e',
  };
  execSync('npm run db:migrate', { cwd: '../apps/backend', env, stdio: 'inherit' });
  execSync('npm run seed:e2e', { cwd: '../apps/backend', env, stdio: 'inherit' });
}
```

Reference it in `e2e/playwright.config.ts` by adding `globalSetup: './fixtures/globalSetup.ts'` to the `defineConfig({...})` object from Task 9.

- [ ] **Step 5: Verify migrations + seed run cleanly against a local Postgres**

Run (requires a local Postgres reachable at the configured URL, and the `testplatform_e2e` database to already exist — `createdb testplatform_e2e` first if needed):
```bash
cd apps/backend && DATABASE_URL=postgresql://testplatform:change_me@localhost:5432/testplatform_e2e npm run db:migrate
DATABASE_URL=postgresql://testplatform:change_me@localhost:5432/testplatform_e2e npm run seed:e2e
```
Expected: migration applies cleanly, seed logs `Seeded teacher: 998900000001` and `Seeded student: 998900000002`. Running the seed a second time should log nothing new (idempotent via the `existing` check) rather than erroring on a unique constraint.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/seed.e2e.ts apps/backend/package.json e2e/fixtures/globalSetup.ts e2e/playwright.config.ts
git commit -m "test(e2e): add database seed script and Playwright globalSetup for fixture users"
```

---

## Task 11: Playwright — auth setup project and login E2E spec

**Files:**
- Create: `e2e/fixtures/auth.setup.ts`
- Create: `e2e/tests/auth.spec.ts`

**Interfaces:**
- Consumes: the phone/password fixtures seeded in Task 10 (`998900000001`/`e2e-teacher-pass` for teacher, `998900000002`/`e2e-student-pass` for student); the real `LoginPage` at `/login` (`apps/frontend/src/pages/LoginPage.tsx`), whose phone input is masked to display as `+998 XX XXX XX XX` (see `maskUzPhone` in that file) — Playwright must type the raw national number digits, not the full E164 string, since the input's `onChange` re-masks on every keystroke.

- [ ] **Step 1: Write the auth setup project**

`LoginPage.tsx` has no `data-testid`s. It has a password-login toggle (`showPasswordLogin` state) that must be clicked first since the default view is Telegram-code login. Inspect the rendered button text before finalizing selectors — the plan below uses `getByRole('button', { name: /parol|password/i })` as the toggle target; verify this text against the actual JSX (lines beyond what was read in this planning pass) at implementation time and adjust if the real label differs.

```typescript
// e2e/fixtures/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const TEACHER_PHONE_DIGITS = '900000001';
const TEACHER_PASSWORD = 'e2e-teacher-pass';
const STUDENT_PHONE_DIGITS = '900000002';
const STUDENT_PASSWORD = 'e2e-student-pass';

async function loginAs(page: import('@playwright/test').Page, phoneDigits: string, password: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: /parol/i }).click();
  await page.getByPlaceholder(/\+998/).fill(phoneDigits);
  await page.getByPlaceholder(/parol/i).fill(password);
  await page.getByRole('button', { name: /kirish|login/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

setup('authenticate as teacher', async ({ page }) => {
  await loginAs(page, TEACHER_PHONE_DIGITS, TEACHER_PASSWORD);
  await page.context().storageState({ path: 'e2e/.auth/teacher.json' });
});

setup('authenticate as student', async ({ page }) => {
  await loginAs(page, STUDENT_PHONE_DIGITS, STUDENT_PASSWORD);
  await page.context().storageState({ path: 'e2e/.auth/student.json' });
});
```

- [ ] **Step 2: Run just the setup project to validate selectors against the real running app**

Run (requires Task 10's seed to have run against the test DB, and both dev servers reachable — Playwright's `webServer` config handles this automatically):
```bash
cd e2e && npx playwright test --project=setup --headed
```
Expected: both setup tests pass, `e2e/.auth/teacher.json` and `e2e/.auth/student.json` are created. If a selector doesn't match (e.g. the password-toggle button's real accessible name differs from `/parol/i`), open the Playwright trace/headed browser output to read the actual DOM and correct the selector — this is expected iteration, not a plan defect, since `LoginPage.tsx`'s full JSX wasn't read in the planning pass.

- [ ] **Step 3: Write the login E2E spec covering the failure path too**

```typescript
// e2e/tests/auth.spec.ts
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } }); // start logged out regardless of project default

test('shows an error toast on wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /parol/i }).click();
  await page.getByPlaceholder(/\+998/).fill('900000001');
  await page.getByPlaceholder(/parol/i).fill('wrong-password');
  await page.getByRole('button', { name: /kirish|login/i }).click();

  await expect(page.getByText(/noto'g'ri/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('a logged-in teacher landing on /login is redirected away', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/teacher.json' });
  const page = await context.newPage();
  await page.goto('/login');
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});
```

- [ ] **Step 4: Run the full auth project**

Run: `cd e2e && npx playwright test tests/auth.spec.ts --project=teacher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/auth.setup.ts e2e/tests/auth.spec.ts
git commit -m "test(e2e): add Playwright auth setup project and login flow spec"
```

---

## Task 12: Playwright — full test-taking E2E flow

**Files:**
- Create: `e2e/tests/test-taking.spec.ts`

**Interfaces:**
- Consumes: teacher's authenticated session (`e2e/.auth/teacher.json` from Task 11) to create a folder/test/question via the UI (or directly seed via backend API call from within the test, which is more stable than driving the full test-builder UI for fixture setup — this task uses the API-seed approach and reserves UI-driven creation for a future slice per the spec's non-goals). Then drives the public `/t/:slug` flow as an anonymous browser context.

- [ ] **Step 1: Write the spec, seeding the test via direct API call and driving only the student-facing UI through Playwright**

```typescript
// e2e/tests/test-taking.spec.ts
import { test, expect, request as playwrightRequest } from '@playwright/test';

const API_BASE = 'http://localhost:3001/api/v1';

async function seedPublishedTest() {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const loginRes = await api.post('/auth/login', { data: { phone: '998900000001', password: 'e2e-teacher-pass' } });
  const { access_token: token, admin } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}` };

  const folderRes = await api.post('/folders', { headers, data: { name: 'E2E Test-Taking Folder' } });
  const folder = await folderRes.json();

  const testRes = await api.post('/tests', { headers, data: { folderId: folder.id, name: 'E2E Geography Quiz', showResults: 'immediately' } });
  const createdTest = await testRes.json();

  await api.post(`/tests/${createdTest.id}/questions`, {
    headers,
    data: {
      text: 'What is the capital of Uzbekistan?',
      type: 'single',
      options: [{ text: 'Tashkent', isCorrect: true }, { text: 'Samarkand', isCorrect: false }],
    },
  });

  await api.dispose();
  return createdTest.slug as string;
}

test.use({ storageState: { cookies: [], origins: [] } }); // student takes the test anonymously, no login needed

test('student takes a public test end-to-end and sees their score', async ({ page }) => {
  const slug = await seedPublishedTest();

  await page.goto(`/t/${slug}`);
  await page.getByPlaceholder(/ism|name/i).fill('Playwright Talaba');
  await page.getByRole('button', { name: /boshlash|start/i }).click();

  await expect(page.getByText(/capital of uzbekistan/i)).toBeVisible();
  await page.getByText('Tashkent').click();
  await page.getByRole('button', { name: /yakunlash|submit|tugatish/i }).click();

  await expect(page.getByText(/1\s*\/\s*1|100%/)).toBeVisible();
});
```

Selector names for the "name" input, "start" button, and "submit" button on `TakeTestEntryPage`/the question-taking UI were not fully read in this planning pass (only the first 100 lines of `TakeTestEntryPage.tsx` were inspected, and `TakeTestPage.tsx`'s actual rendering component wasn't opened at all — it's a 23-line file that likely delegates to a component under `src/components/`). Before running this test, read the full `TakeTestEntryPage.tsx` and whatever component `TakeTestPage.tsx` renders, and correct every selector to match real button/input text.

- [ ] **Step 2: Read the actual test-taking UI components to fix selectors**

Run:
```bash
cat apps/frontend/src/pages/TakeTestPage.tsx
grep -rn "boshlash\|Boshlash\|yakunlash\|Yakunlash" apps/frontend/src/pages/TakeTestEntryPage.tsx apps/frontend/src/components/ 2>/dev/null
```

Update Step 1's selectors to match what's found.

- [ ] **Step 3: Run it**

Run: `cd e2e && npx playwright test tests/test-taking.spec.ts --project=student --headed`
Expected: PASS after selector corrections. Use `--headed` and Playwright's trace viewer (`npx playwright show-trace`) to debug any mismatch rather than guessing again.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/test-taking.spec.ts
git commit -m "test(e2e): add end-to-end public test-taking flow spec"
```

---

## Task 13: Playwright — two-context classroom real-time spec

**Files:**
- Create: `e2e/tests/classroom.spec.ts`

**Interfaces:**
- Consumes: `e2e/.auth/teacher.json` and `e2e/.auth/student.json` (Task 11) in two separate `BrowserContext`s within one test; the free-session creation flow validated at the HTTP layer in Task 7 (`POST /classroom/sessions/free`), now driven through the UI; `classroom.gateway.ts`'s `host:setPage`/`student:join` socket events (confirmed to exist in Task-planning exploration) surface as UI state changes the test asserts on, not raw socket assertions.

- [ ] **Step 1: Identify the actual host/student classroom page routes and their join mechanism**

Run:
```bash
grep -n "ClassroomHostPage\|ClassroomStudentPage" apps/frontend/src/App.tsx
cat apps/frontend/src/pages/ClassroomHostPage.tsx | head -80
cat apps/frontend/src/pages/ClassroomStudentPage.tsx | head -80
```

This determines the real route pattern (e.g. `/classroom/host/:id` vs `/classroom/:id`) and how a student navigates to join a specific session (by session id in the URL, or by entering a code) — not assumed in this planning pass since these files weren't read.

- [ ] **Step 2: Write the two-context spec**

```typescript
// e2e/tests/classroom.spec.ts
import { test, expect, chromium } from '@playwright/test';

test('teacher starts a free classroom session and a student sees the shared page state', async ({ browser }) => {
  const teacherContext = await browser.newContext({ storageState: 'e2e/.auth/teacher.json' });
  const studentContext = await browser.newContext({ storageState: 'e2e/.auth/student.json' });
  const teacherPage = await teacherContext.newPage();
  const studentPage = await studentContext.newPage();

  // Route path confirmed against App.tsx in Step 1 — placeholder below
  // uses the pattern found in ClassroomController's /classroom/sessions/free
  // response { id }; adjust to the real frontend route before running.
  await teacherPage.goto('/boards'); // or wherever "start free lesson" lives — verify in Step 1
  await teacherPage.getByRole('button', { name: /yangi dars|start lesson|erkin dars/i }).click();
  await expect(teacherPage).toHaveURL(/\/classroom\//);

  const sessionUrl = teacherPage.url();
  const sessionId = sessionUrl.split('/').pop();

  await studentPage.goto(`/classroom/student/${sessionId}`); // verify real student route in Step 1

  // Assert the student sees the host's identity/title, proving the join succeeded
  await expect(studentPage.getByText(/e2e teacher/i)).toBeVisible({ timeout: 10_000 });

  await teacherContext.close();
  await studentContext.close();
});
```

This test is intentionally written with two explicit "verify in Step 1" markers rather than guessed route strings — Step 1's `grep`/`cat` output must resolve both before this test can run. Do not invent route paths; use what `App.tsx`'s router config actually shows.

- [ ] **Step 3: Fill in the verified routes and run it**

Run: `cd e2e && npx playwright test tests/classroom.spec.ts --headed`
Expected: PASS after routes are corrected against Step 1's findings. If the student-side assertion needs a real-time signal beyond host name (e.g. a page-sync indicator), extend the test with a second assertion: teacher clicks a "next page" control, student's page indicator updates within a few seconds (`await expect(...).toHaveText('2', { timeout: 10_000 })` style, relying on Playwright's polling rather than a fixed `page.waitForTimeout`).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/classroom.spec.ts
git commit -m "test(e2e): add two-context classroom real-time session spec"
```

---

## Task 14: Documentation — README for running all three layers

**Files:**
- Create: `e2e/README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write the README**

```markdown
# E2E test suite

Playwright tests covering full-stack flows: login, public test-taking, and
a two-browser classroom real-time session.

## Prerequisites

- A local Postgres reachable at the URL in `playwright.config.ts` (or set
  `E2E_DATABASE_URL`), with a `testplatform_e2e` database already created:
  `createdb testplatform_e2e`
- `apps/backend/.env` (or equivalent env vars) with `JWT_SECRET` set —
  shared with the dev backend, since `webServer` boots it in dev mode.

## Running

    cd e2e
    npm install
    npx playwright install --with-deps chromium
    npm run test:e2e

Playwright's `webServer` config starts both `apps/backend` (`npm run
start:dev`) and `apps/frontend` (`npm run dev`) automatically, pointed at
the test database via `DATABASE_URL` override — dev data is never touched.

`globalSetup` (`fixtures/globalSetup.ts`) runs drizzle migrations and
seeds two fixture users (`998900000001` / `998900000002`) before any test
runs.

## Debugging a failing test

    npx playwright test tests/<file>.spec.ts --headed
    npx playwright show-trace test-results/<trace-file>.zip
```

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): add setup and running instructions for the Playwright suite"
```

---

## Self-Review Notes

- **Spec coverage:** Layer 1 (frontend unit) → Tasks 1–5. Layer 2 (backend e2e gap-fill for delivery/classroom/live) → Tasks 6–8. Layer 3 (Playwright) → Tasks 9–13. Documentation → Task 14. All three spec layers have tasks; the spec's explicit non-goals (payments, telegram, other ~30 controllers/pages, CI wiring) have no tasks here, matching scope.
- **Corrected spec assumption:** the spec's Layer 2 described `student-tests.e2e-spec.ts` as covering "student takes a test" — investigation during plan-writing found `student-tests` is actually a *different* feature (student's own private test folders), and the real "student takes a teacher's test" flow is `delivery` (public, slug-based, no auth required). Task 6 targets `delivery`, not `student-tests`, and the Global Constraints section documents this correction explicitly so it isn't re-discovered mid-implementation.
- **Known incomplete selectors:** Tasks 12 and 13 contain explicit "verify against real source before running" markers for UI selectors/routes that weren't fully read during plan-writing (`TakeTestPage.tsx`'s rendered component, `ClassroomHostPage.tsx`/`ClassroomStudentPage.tsx`, `App.tsx`'s router). This is intentional — those files are large and reading them fully belongs to the implementer's Step 1 of each task, not to plan-writing — but it means Tasks 12 and 13 require one extra investigation step before their Playwright specs will pass. This is flagged inline in each task, not hidden.
- **Type consistency:** `Admin`/`admin` shape (`{ id, name, role, phone?, avatarUrl? }`) used consistently from `apps/frontend/src/api/auth.ts` across Tasks 2–3. `access_token`/`admin`/`user` response shape from `apiLogin` matches across Tasks 2, 6, 7, 8, 11, 12. `phone`+`password` login body used consistently everywhere (never `email`).
