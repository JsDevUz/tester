# Refresh-Token Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink access-token lifetime from 365 days to 15 minutes and introduce a rotating, server-revocable 365-day refresh token, without forcing existing logged-in users to re-authenticate.

**Architecture:** A new `refresh_tokens` Postgres table stores sha256 hashes of opaque, high-entropy refresh tokens. A new `POST /auth/refresh` endpoint rotates them on every use (old row revoked, new row inserted) and detects reuse of an already-rotated token as a signal to revoke the whole token family. Web receives its refresh token via an `httpOnly` cookie scoped to `/api/v1/auth`; mobile receives it in the JSON response body and stores it in the OS keychain. Both clients' axios instances gain a single-flight 401 interceptor that transparently refreshes and retries.

**Tech Stack:** NestJS 11 + Drizzle ORM + PostgreSQL (backend), React 19 + axios + Zustand (frontend web), React Native 0.86 + axios + Zustand + react-native-keychain (mobile).

**Spec:** [docs/superpowers/specs/2026-08-17-refresh-token-auth-design.md](../specs/2026-08-17-refresh-token-auth-design.md)

## Global Constraints

- Access token (JWT) lifetime: **15 minutes** for all newly-issued tokens.
- Refresh token lifetime: **365 days**, rotated on every successful `/auth/refresh` call.
- Refresh token is opaque (`crypto.randomBytes(48).toString('base64url')`), stored server-side only as `sha256(rawToken)` hex — never store the raw value.
- Existing (pre-migration) 365-day JWTs must keep authenticating unchanged — `JwtStrategy` validation logic is untouched by this plan.
- Response body shape of `POST /auth/login`, `/auth/register/verify`, `/auth/telegram/verify`, `/auth/password/reset/complete` stays `{ access_token, user, admin }` for backward compatibility; `refresh_token` is added to the body **only** for mobile requests (identified by the `X-Client: mobile` header), web gets its refresh token exclusively via `Set-Cookie`.
- `/auth/refresh` and `/auth/logout` never leak *why* a token was rejected (expired vs. revoked vs. unknown) — always a generic 401 / always 200 respectively.
- Cookie attributes: `httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', path: '/api/v1/auth', maxAge: 365d`.

---

## File Structure

**Backend (`apps/backend/src`):**
- `db/schema.ts` — add `refreshTokens` table (modify).
- `drizzle/migrations/` — new generated migration (create, via `db:generate`).
- `auth/refresh-token.util.ts` — pure helpers: `generateRefreshToken()`, `hashRefreshToken(raw)` (create).
- `auth/auth.service.ts` — extend `createAuthResponse`, add `issueRefreshToken`, `refresh`, `logout` methods (modify).
- `auth/auth.controller.ts` — add `POST /auth/refresh`, `POST /auth/logout`; wire cookie read/write (modify).
- `auth/auth.service.spec.ts` — add unit tests for `refresh`/`logout`/reuse-detection (modify).
- `test/auth.e2e-spec.ts` — add e2e coverage for the full login→refresh→old-token-rejected sequence (modify).
- `main.ts` — register `cookie-parser`, add `credentials: true` to CORS (modify).
- `package.json` — add `cookie-parser` + `@types/cookie-parser` (modify).

**Frontend (`apps/frontend/src`):**
- `api/client.ts` — `withCredentials: true`, single-flight 401-refresh interceptor (modify).
- `api/client.refresh.test.ts` — interceptor dedup test (create).
- `api/auth.ts` — add `apiLogout()` (modify, if this file exists — verified in Task 6).
- `stores/authStore.ts` — `logout()` fires best-effort `POST /auth/logout` (modify).

**Mobile (`apps/mobile/src`):**
- `package.json` — add `react-native-keychain` (modify).
- `lib/refreshTokenStore.ts` — thin wrapper around Keychain get/set/clear for the refresh token (create).
- `lib/api.ts` — `X-Client: mobile` header, single-flight 401-refresh interceptor (modify).
- `lib/__tests__/api.refresh.test.ts` — interceptor dedup test (create).
- `store/authStore.ts` — store/clear refresh token on login/logout, best-effort `POST /auth/logout` (modify).

---

## Task 1: Backend — `refresh_tokens` table + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/00XX_<generated_name>.sql` (via `npm run db:generate`)

**Interfaces:**
- Produces: `refreshTokens` Drizzle table export with columns `id, userId, tokenHash, expiresAt, createdAt, revokedAt, replacedByTokenId`, importable as `import { refreshTokens } from '../db/schema'`.

- [ ] **Step 1: Add the table definition**

Open `apps/backend/src/db/schema.ts`. Find the `users` table export (near the top of the file) and add the new table directly after it (all the imports it needs — `pgTable`, `text`, `uuid`, `timestamp`, `index`, `uniqueIndex` — are already imported at the top of this file):

```ts
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedByTokenId: uuid('replaced_by_token_id'),
}, (table) => ({
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  tokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `cd apps/backend && npm run db:generate`
Expected: a new file appears under `apps/backend/drizzle/migrations/` (e.g. `0032_<name>.sql`) containing a `CREATE TABLE "refresh_tokens" (...)` statement with the `user_id` foreign key and both indexes. Read the generated file to confirm it matches the schema (correct column types, `ON DELETE CASCADE` on `user_id`).

- [ ] **Step 3: Apply the migration to the local dev database**

Run: `cd apps/backend && npm run db:migrate`
Expected: command exits 0, no errors. Verify with `psql "$DATABASE_URL" -c "\d refresh_tokens"` (or equivalent) showing the new table.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/
git commit -m "feat(backend): add refresh_tokens table"
```

---

## Task 2: Backend — refresh token generation/hashing utility

**Files:**
- Create: `apps/backend/src/auth/refresh-token.util.ts`
- Test: `apps/backend/src/auth/refresh-token.util.spec.ts`

**Interfaces:**
- Consumes: nothing (pure Node `crypto`).
- Produces: `generateRefreshToken(): string` and `hashRefreshToken(raw: string): string`, both imported as `import { generateRefreshToken, hashRefreshToken } from './refresh-token.util'` by Task 3.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/auth/refresh-token.util.spec.ts`:

```ts
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

describe('refresh-token.util', () => {
  it('generates a high-entropy, url-safe token', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically', () => {
    const raw = 'fixed-test-token-value';
    expect(hashRefreshToken(raw)).toEqual(hashRefreshToken(raw));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashRefreshToken('token-a')).not.toEqual(hashRefreshToken('token-b'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest src/auth/refresh-token.util.spec.ts`
Expected: FAIL — `Cannot find module './refresh-token.util'`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/auth/refresh-token.util.ts`:

```ts
import { randomBytes, createHash } from 'crypto';

// Opaque, high-entropy refresh token — deliberately NOT a JWT. It carries
// no claims, so it can only be used by looking it up in refresh_tokens,
// which makes revocation trivial (delete/mark the row) unlike a JWT whose
// validity is self-contained until its own expiry.
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

// sha256, not bcrypt: this token is already high-entropy random data (not
// a low-entropy human password), so bcrypt's deliberately-slow hashing
// buys no security here and would make every refresh call unnecessarily
// expensive under load.
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest src/auth/refresh-token.util.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/refresh-token.util.ts apps/backend/src/auth/refresh-token.util.spec.ts
git commit -m "feat(backend): add refresh token generation/hashing utility"
```

---

## Task 3: Backend — `AuthService.issueRefreshToken` / `refresh` / `logout`

**Files:**
- Modify: `apps/backend/src/auth/auth.module.ts` (JWT lifetime 365d → 15m)
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `generateRefreshToken`, `hashRefreshToken` from Task 2; `refreshTokens` table from Task 1.
- Produces: `AuthService.issueRefreshToken(userId: string): Promise<string>` (returns the **raw** token, caller decides where to put it), `AuthService.refresh(rawToken: string): Promise<{ userId: string; access_token: string; refresh_token: string; user: SafeUser }>` (throws `UnauthorizedException` on any invalid/expired/reused token), `AuthService.logout(rawToken: string | undefined): Promise<void>` (never throws). `createAuthResponse` now also returns `refresh_token: string` in its return object (all four call sites — `login`, `verifyRegistration`, `verifyTelegramCode`, `completePasswordReset` — get this for free since they already call `createAuthResponse`/duplicate its body; Step 3 below consolidates the two duplicate inline `sign()` call sites in `login()` and the private `createAuthResponse()` into calling the same helper).

- [ ] **Step 1: Shrink JWT lifetime**

In `apps/backend/src/auth/auth.module.ts`, change:

```ts
signOptions: { expiresIn: '365d' },
```

to:

```ts
signOptions: { expiresIn: '15m' },
```

This is safe to do first and independently — `JwtStrategy` validates any correctly-signed token regardless of the `exp` used when it was minted, so tokens already issued under `365d` keep validating fine; only newly-signed tokens get the shorter lifetime.

- [ ] **Step 2: Write the failing unit tests**

Open `apps/backend/src/auth/auth.service.spec.ts`. Add these tests inside the existing `describe('AuthService telegram auth', ...)` block (they reuse the `db` mock and `jwtService`/`telegramService`/`storageService` fixtures already defined at the top of the file):

```ts
  describe('refresh token flow', () => {
    function mockRefreshTokenLookup(row: unknown) {
      (db.query as any).refreshTokens = { findFirst: jest.fn().mockResolvedValue(row) };
    }

    it('rotates a valid refresh token and returns a new pair', async () => {
      const rawToken = 'valid-raw-token';
      mockRefreshTokenLookup({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        revokedAt: null,
      });
      (db.query.users.findFirst as jest.Mock).mockResolvedValue({
        id: 'user-1',
        displayName: 'Student One',
        role: 'student',
        phone: '+998901112233',
        displayAvatarUrl: null,
      });
      mockUpdate();
      mockInsertReturning({ id: 'rt-2' });

      const service = new AuthService(jwtService as any, telegramService as any, storageService as any);
      const result = await service.refresh(rawToken);

      expect(result.access_token).toBe('signed-token');
      expect(result.refresh_token).toEqual(expect.any(String));
      expect(result.refresh_token).not.toBe(rawToken);
      // the old row must be revoked
      expect(db.update).toHaveBeenCalled();
    });

    it('rejects an unknown refresh token', async () => {
      mockRefreshTokenLookup(null);
      const service = new AuthService(jwtService as any, telegramService as any, storageService as any);
      await expect(service.refresh('unknown-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      mockRefreshTokenLookup({
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });
      const service = new AuthService(jwtService as any, telegramService as any, storageService as any);
      await expect(service.refresh('expired-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes the whole token family when a rotated token is reused', async () => {
      mockRefreshTokenLookup({
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        revokedAt: new Date(),
      });
      mockUpdate();

      const service = new AuthService(jwtService as any, telegramService as any, storageService as any);
      await expect(service.refresh('reused-token')).rejects.toBeInstanceOf(UnauthorizedException);
      // family revocation issues an UPDATE against all of that user's tokens
      expect(db.update).toHaveBeenCalled();
    });

    it('logout revokes the matching token and never throws for an unknown one', async () => {
      mockRefreshTokenLookup({ id: 'rt-1', userId: 'user-1', revokedAt: null });
      mockUpdate();
      const service = new AuthService(jwtService as any, telegramService as any, storageService as any);
      await expect(service.logout('some-token')).resolves.toBeUndefined();

      mockRefreshTokenLookup(null);
      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });
```

Add `UnauthorizedException` to the existing `@nestjs/common` import at the top of the file if it isn't already imported (check — `login()` in `auth.service.ts` already throws it, so it likely already needs importing in the service, but confirm the **spec** file imports it too: add `import { UnauthorizedException } from '@nestjs/common';` near the top of `auth.service.spec.ts` if missing).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/backend && npx jest src/auth/auth.service.spec.ts`
Expected: FAIL — `service.refresh is not a function` / `service.logout is not a function`.

- [ ] **Step 4: Implement `issueRefreshToken`, `refresh`, `logout` in `AuthService`**

Open `apps/backend/src/auth/auth.service.ts`. Add the import at the top:

```ts
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';
import { refreshTokens } from '../db/schema';
```

(`db`, `users`, `eq`, `and` etc. are already imported — check the existing import lines and extend them rather than duplicating.)

Add a private constant near the top of the class:

```ts
  private static readonly REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
```

Add these methods to the `AuthService` class (near `createAuthResponse`, since they're closely related):

```ts
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + AuthService.REFRESH_TOKEN_TTL_MS),
    });
    return raw;
  }

  async refresh(rawToken: string): Promise<{ access_token: string; refresh_token: string; user: ReturnType<AuthService['toSafeUser']> }> {
    const tokenHash = hashRefreshToken(rawToken);
    const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, tokenHash) });
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revokedAt) {
      // Reuse of an already-rotated token: either a benign client retry or
      // a replayed stolen token. We can't tell which, so the safe response
      // is to kill every refresh token this user holds — anyone using a
      // stale token (attacker or the legitimate device that raced) is
      // forced to log in again.
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.userId, row.userId));
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token');

    const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const newRawToken = generateRefreshToken();
    const [newRow] = await db.insert(refreshTokens).values({
      userId: row.userId,
      tokenHash: hashRefreshToken(newRawToken),
      expiresAt: new Date(Date.now() + AuthService.REFRESH_TOKEN_TTL_MS),
    }).returning({ id: refreshTokens.id });
    await db.update(refreshTokens).set({ revokedAt: new Date(), replacedByTokenId: newRow.id }).where(eq(refreshTokens.id, row.id));

    const access_token = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      name: user.displayName,
      role: user.role,
    });

    return { access_token, refresh_token: newRawToken, user: this.toSafeUser(user) };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, tokenHash) });
    if (!row) return;
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
  }
```

Now refactor `login()` and `createAuthResponse()` to share a `toSafeUser` helper and to also issue a refresh token. First, find the existing `login()` method (it inlines the same `safeUser`/`sign()` shape that `createAuthResponse` uses) and the private `createAuthResponse` method. Add a small private helper right above `createAuthResponse`:

```ts
  private toSafeUser(user: { id: string; displayName: string; role: string; phone: string; displayAvatarUrl: string | null }) {
    return {
      id: user.id,
      name: user.displayName,
      role: user.role,
      phone: user.phone,
      avatarUrl: user.displayAvatarUrl,
    };
  }
```

Replace the body of `createAuthResponse` to use it and to also mint+attach a refresh token:

```ts
  private async createAuthResponse(user: {
    id: string;
    displayName: string;
    role: string;
    phone: string;
    displayAvatarUrl: string | null;
  }) {
    const token = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      name: user.displayName,
      role: user.role,
    });
    const refresh_token = await this.issueRefreshToken(user.id);
    const safeUser = this.toSafeUser(user);

    return {
      access_token: token,
      refresh_token,
      user: safeUser,
      admin: safeUser,
    };
  }
```

Note this changes `createAuthResponse` from sync to `async` — find every call site (`verifyRegistration`, `verifyTelegramCode`, `completePasswordReset` — grep the file for `createAuthResponse(`) and make sure each already `await`s it (they likely already do since the method returns a Promise-shaped object being returned directly from an `async` caller — if any call site does `return this.createAuthResponse(user)` without `await` inside a non-async wrapper, add `await`).

Finally, update `login()` (currently inlines its own `sign()` + `safeUser` instead of calling `createAuthResponse` — check whether it already calls `createAuthResponse` or duplicates the logic). If it duplicates the logic, replace the duplicated block with `return this.createAuthResponse(user);` (making `login` await it, since it's already an `async` method). If it already delegates to `createAuthResponse`, no change needed there beyond it now being awaited.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && npx jest src/auth/auth.service.spec.ts`
Expected: PASS (all tests, old + new).

- [ ] **Step 6: Run the full backend unit suite to catch regressions from the `createAuthResponse` signature change**

Run: `cd apps/backend && npx jest --silent`
Expected: PASS. Pay special attention to any other spec file that calls `login()`, `verifyRegistration()`, `verifyTelegramCode()`, or `completePasswordReset()` directly — since `createAuthResponse` is now `async`, any test asserting on its return value synchronously needs `await` added. Fix any such failures.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/auth/auth.module.ts apps/backend/src/auth/auth.service.ts apps/backend/src/auth/auth.service.spec.ts
git commit -m "feat(backend): shrink JWT lifetime to 15m, add refresh/logout to AuthService"
```

---

## Task 4: Backend — `POST /auth/refresh` and `POST /auth/logout` endpoints with cookie plumbing

**Files:**
- Modify: `apps/backend/package.json` (add `cookie-parser`, `@types/cookie-parser`)
- Modify: `apps/backend/src/main.ts`
- Modify: `apps/backend/src/auth/auth.controller.ts`
- Modify: `apps/backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.refresh`, `AuthService.logout` from Task 3.
- Produces: `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout`, both consumed by frontend (Task 5) and mobile (Task 6).

- [ ] **Step 1: Install `cookie-parser`**

Run: `cd apps/backend && npm install cookie-parser && npm install -D @types/cookie-parser`
Expected: `package.json` and `package-lock.json` updated, both packages under `dependencies`/`devDependencies` respectively.

- [ ] **Step 2: Register cookie-parser and enable CORS credentials**

In `apps/backend/src/main.ts`, add the import:

```ts
import cookieParser from 'cookie-parser';
```

Add `app.use(cookieParser());` right after the `app` is created (after the `NestFactory.create` line, before the CORS setup). Change:

```ts
app.enableCors({ origin: getAllowedOrigins() });
```

to:

```ts
app.enableCors({ origin: getAllowedOrigins(), credentials: true });
```

- [ ] **Step 3: Write the failing e2e test**

**Pre-existing issue, out of scope — read before writing tests:** `apps/backend/test/auth.e2e-spec.ts` currently sends `{ email: process.env.SUPER_ADMIN_EMAIL, password: ... }` to `/auth/login`, but `AuthController`'s `LoginDto` (in `apps/backend/src/auth/auth.controller.ts`) only declares a `phone` field, and the seed script (`apps/backend/src/db/seed.ts`) creates the super-admin user from `SUPER_ADMIN_PHONE`, not `SUPER_ADMIN_EMAIL`. Confirm this by running `cd apps/backend && npx jest --config test/jest-e2e.json auth.e2e-spec.ts` now, before any changes — it likely already fails or was never passing in CI. **Do not fix the existing 4 tests in this file as part of this plan** (that's a pre-existing, unrelated bug); just note what you find. Write the new tests below using `SUPER_ADMIN_PHONE` (which the seed script actually uses, so it's the field guaranteed to exist and work against a freshly-seeded test database), and if `SUPER_ADMIN_PHONE` isn't set in the test environment's `.env`, set it there to match whatever phone number the seeded super-admin actually has (check `apps/backend/.env`'s `SUPER_ADMIN_PHONE` value, or run the seed script locally against the test DB first: `cd apps/backend && npx ts-node src/db/seed.ts`, using credentials from `.env`).

Add the following new tests to the file (append them; leave the 4 existing `email`-based tests as-is per the note above):

```ts
  it('POST /api/v1/auth/refresh - rotates cookie-based refresh token and rejects reuse of the old one', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ phone: process.env.SUPER_ADMIN_PHONE, password: process.env.SUPER_ADMIN_PASSWORD });
    expect(loginRes.status).toBe(200);
    const setCookieHeader = loginRes.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();

    const firstRefresh = await agent.post('/api/v1/auth/refresh').send({});
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.body).toHaveProperty('access_token');

    // Replaying the ORIGINAL cookie (captured before rotation) via a fresh
    // agent must now be rejected — it was revoked when firstRefresh rotated it.
    const staleAgent = request.agent(app.getHttpServer());
    staleAgent.jar.setCookies(setCookieHeader);
    const secondRefreshWithOldCookie = await staleAgent.post('/api/v1/auth/refresh').send({});
    expect(secondRefreshWithOldCookie.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh - rejects when no refresh token present', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/logout - always returns 200', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/logout').send({});
    expect(res.status).toBe(200);
  });
```

This requires `SUPER_ADMIN_PHONE` — check whether that env var already exists in the test environment (grep the repo/CI config for `SUPER_ADMIN_PHONE` vs `SUPER_ADMIN_EMAIL`); use whichever field `LoginDto` actually validates, matching Step 3's investigation above.

- [ ] **Step 4: Run e2e test to verify it fails**

Run: `cd apps/backend && npx jest --config test/jest-e2e.json auth.e2e-spec.ts`
Expected: FAIL — 404 on `/api/v1/auth/refresh` (route doesn't exist yet).

- [ ] **Step 5: Implement the controller endpoints**

Open `apps/backend/src/auth/auth.controller.ts`. Add imports:

```ts
import { Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
```

(`Req` may already be imported — check the existing import line from `@nestjs/common` and extend it rather than duplicating; same for checking if `Request`/`Response` types are already imported from `express`.)

Add a private helper method and the two new endpoints to `AuthController`:

```ts
  private readonly REFRESH_COOKIE_NAME = 'rt';
  private readonly REFRESH_COOKIE_PATH = '/api/v1/auth';

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(this.REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: this.REFRESH_COOKIE_PATH,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  private isMobileClient(req: Request): boolean {
    return req.headers['x-client'] === 'mobile';
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { refreshToken?: string }) {
    const rawToken = this.isMobileClient(req) ? body.refreshToken : req.cookies?.[this.REFRESH_COOKIE_NAME];
    if (!rawToken) throw new UnauthorizedException('Invalid refresh token');

    const result = await this.authService.refresh(rawToken);

    if (this.isMobileClient(req)) {
      return { access_token: result.access_token, refresh_token: result.refresh_token, user: result.user, admin: result.user };
    }
    this.setRefreshCookie(res, result.refresh_token);
    return { access_token: result.access_token, user: result.user, admin: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { refreshToken?: string }) {
    const rawToken = this.isMobileClient(req) ? body.refreshToken : req.cookies?.[this.REFRESH_COOKIE_NAME];
    await this.authService.logout(rawToken);
    if (!this.isMobileClient(req)) {
      res.clearCookie(this.REFRESH_COOKIE_NAME, { path: this.REFRESH_COOKIE_PATH });
    }
    return { ok: true };
  }
```

Add `import { UnauthorizedException } from '@nestjs/common';` if not already present in this file's imports (check the existing `@nestjs/common` import line).

Now update `login()` and every other `AuthService` call site in this controller that returns `createAuthResponse`'s result to also attach the cookie for web / include `refresh_token` for mobile. Find the `login` method:

```ts
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone, dto.password);
  }
```

Replace with:

```ts
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: LoginDto) {
    const result = await this.authService.login(dto.phone, dto.password);
    return this.attachRefreshToken(req, res, result);
  }
```

Add the shared helper (place it near `setRefreshCookie`):

```ts
  private attachRefreshToken(req: Request, res: Response, result: { access_token: string; refresh_token: string; user: unknown; admin: unknown }) {
    if (this.isMobileClient(req)) {
      return result;
    }
    this.setRefreshCookie(res, result.refresh_token);
    const { refresh_token, ...rest } = result;
    return rest;
  }
```

Apply the identical `async ... { const result = await this.authService.X(...); return this.attachRefreshToken(req, res, result); }` transformation to `verifyRegistration`, `verifyTelegramCode`, and `completePasswordReset` — each currently does `return this.authService.<method>(...)`; change the method signature to add `@Req() req: Request, @Res({ passthrough: true }) res: Response` params (alongside the existing `@Body() dto: ...`) and route through `attachRefreshToken` the same way `login` now does.

- [ ] **Step 6: Run e2e test to verify it passes**

Run: `cd apps/backend && npx jest --config test/jest-e2e.json auth.e2e-spec.ts`
Expected: PASS (all tests, old + new).

- [ ] **Step 7: Run the full backend test suite (unit + e2e)**

Run: `cd apps/backend && npm test && npm run test:e2e`
Expected: PASS. Fix any regression before proceeding — in particular check any other e2e spec that calls `/auth/login` and asserts on the exact response body shape (the body shape for web callers is unchanged — `refresh_token` was stripped out by `attachRefreshToken` — but double check nothing asserted on `Object.keys(res.body)` exactly).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/package.json apps/backend/package-lock.json apps/backend/src/main.ts apps/backend/src/auth/auth.controller.ts apps/backend/test/auth.e2e-spec.ts
git commit -m "feat(backend): add /auth/refresh and /auth/logout endpoints"
```

---

## Task 5: Frontend — axios interceptor with single-flight refresh

**Files:**
- Modify: `apps/frontend/src/api/client.ts`
- Modify: `apps/frontend/src/api/auth.ts` (add `apiLogout`, if this file exists — check first)
- Modify: `apps/frontend/src/stores/authStore.ts`
- Create: `apps/frontend/src/api/client.refresh.test.ts`

**Interfaces:**
- Consumes: `POST /auth/refresh` (returns `{ access_token, user, admin }`, cookie rotated server-side), `POST /auth/logout` from Task 4.
- Produces: `client` (default export of `client.ts`) transparently retries any request that got a 401 due to an expired access token, calling `/auth/refresh` at most once for any burst of concurrent 401s.

- [ ] **Step 1: Check the frontend test runner and existing axios-mock patterns**

Run: `cat apps/frontend/package.json | grep -A2 '"test"'` and `find apps/frontend/src -iname "*.test.ts" -o -iname "*.test.tsx" | head -5` to see the test runner (Vitest vs Jest) and how existing tests mock axios/modules, so Step 2 follows the established convention rather than guessing.

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/src/api/client.refresh.test.ts` (adapt the mock syntax — `vi.mock`/`jest.mock` — to whatever Step 1 found; the example below uses Vitest syntax, swap to Jest equivalents if that's what the repo uses):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return { default: { ...actual.default, create: vi.fn() } };
});

describe("client 401 refresh interceptor", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("dedupes concurrent 401s into a single /auth/refresh call", async () => {
    // This test's exact shape depends on how the interceptor is wired
    // (axios-mock-adapter vs manual mocks) — the important assertion,
    // regardless of mocking approach, is: when N requests fail with 401
    // at roughly the same time, exactly ONE POST to /auth/refresh fires,
    // and all N original requests are retried with the refreshed token.
    // Implement using whichever HTTP-mocking library this repo already
    // depends on (check package.json for axios-mock-adapter or msw before
    // adding a new one).
    expect(true).toBe(true); // placeholder assertion replaced in Step 3below
  });
});
```

Note for the implementer: **before finalizing this test file**, check `apps/frontend/package.json` for `axios-mock-adapter` or `msw`. If neither exists, the simplest dependency-free approach is mocking `client`'s internal axios instance methods directly with `vi.fn()`/`jest.fn()` and asserting call counts — replace the placeholder body with a real assertion using whatever's available, following this repo's existing test conventions from Step 1.

- [ ] **Step 3: Run test to verify it fails or is inconclusive**

Run: `cd apps/frontend && npx vitest run src/api/client.refresh.test.ts` (or the repo's actual test command from Step 1)
Expected: the placeholder assertion trivially passes — replace it now with a real one before moving on, per the Step 2 note, then re-run and confirm it FAILS against the current (pre-Step-4) `client.ts` because no refresh logic exists yet.

- [ ] **Step 4: Implement the interceptor**

Open `apps/frontend/src/api/client.ts`. Replace its contents with:

```ts
import axios from "axios";
import { useLoadingStore } from "../stores/loadingStore";
import { useAuthStore } from "../stores/authStore";
import { getApiBaseUrl } from "./baseUrl";

const client = axios.create({
  baseURL: getApiBaseUrl(),
  // Native WebViews can otherwise wait indefinitely when the connection drops.
  timeout: 15_000,
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  useLoadingStore.getState().inc();
  return config;
});

// Single in-flight refresh promise shared by every concurrent 401 — without
// this, N requests failing at once (e.g. a page firing 5 parallel API
// calls right as the access token expires) would each independently POST
// /auth/refresh, racing to rotate the same refresh token and causing all
// but the first to fail with the reuse-detection 401 from Task 3.
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${getApiBaseUrl()}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.access_token as string;
        localStorage.setItem("token", token);
        return token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

client.interceptors.response.use(
  (res) => {
    useLoadingStore.getState().dec();
    return res;
  },
  async (err) => {
    useLoadingStore.getState().dec();
    const originalRequest = err.config;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/refresh") || originalRequest?.url?.includes("/auth/login");

    if (err.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retried) {
      originalRequest._retried = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(err);
      }
    }

    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default client;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/api/client.refresh.test.ts` (or repo's test command)
Expected: PASS.

- [ ] **Step 6: Add `apiLogout` and wire it into the store**

Check whether `apps/frontend/src/api/auth.ts` exists (it's referenced by `authStore.ts`'s imports of `apiLogin`/`apiTelegramLogin`/`apiCompletePasswordReset`). Read it. Add:

```ts
export async function apiLogout(): Promise<void> {
  await client.post("/auth/logout").catch(() => {});
}
```

(matching this file's existing style for exported functions — check whether other functions here use `client` default-imported or something else, and match it).

Open `apps/frontend/src/stores/authStore.ts`. Change:

```ts
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, admin: null });
  },
```

to:

```ts
  logout: () => {
    void apiLogout();
    localStorage.removeItem('token');
    set({ token: null, admin: null });
  },
```

Add `apiLogout` to the existing `import { apiCompletePasswordReset, apiLogin, apiTelegramLogin, type Admin } from '../api/auth';` line at the top of the file.

- [ ] **Step 7: Manually verify in the browser**

Run the frontend dev server (`cd apps/frontend && npm run dev` if not already running), log in, open DevTools → Application → Cookies and confirm an `rt` httpOnly cookie is present scoped to `/api/v1/auth`. Open the Network tab, wait for (or manually trigger, e.g. by editing `localStorage`'s `token` to an expired/garbage value and making a request) a 401, and confirm exactly one `/auth/refresh` call fires followed by the original request retried successfully.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/api/client.ts apps/frontend/src/api/client.refresh.test.ts apps/frontend/src/api/auth.ts apps/frontend/src/stores/authStore.ts
git commit -m "feat(frontend): add single-flight 401 refresh interceptor and logout revocation"
```

---

## Task 6: Mobile — Keychain-backed refresh token + axios interceptor

**Files:**
- Modify: `apps/mobile/package.json` (add `react-native-keychain`)
- Create: `apps/mobile/src/lib/refreshTokenStore.ts`
- Modify: `apps/mobile/src/lib/api.ts`
- Modify: `apps/mobile/src/store/authStore.ts`
- Modify: `apps/mobile/src/api/auth.ts` (add `apiLogout`, if separate from `authStore.ts`'s inline calls — check first)
- Create: `apps/mobile/src/lib/__tests__/api.refresh.test.ts`

**Interfaces:**
- Consumes: `POST /auth/refresh` with `{ refreshToken }` body (mobile path, identified by `X-Client: mobile` header) returning `{ access_token, refresh_token, user, admin }`; `POST /auth/logout` from Task 4.
- Produces: `refreshTokenStore.get()/set(token)/clear()` (Keychain wrapper), used by both `api.ts`'s interceptor and `authStore.ts`.

- [ ] **Step 1: Install `react-native-keychain`**

Run: `cd apps/mobile && npm install react-native-keychain`
Expected: `package.json`/`package-lock.json` updated. Since this is a bare RN app (not Expo), also run `cd apps/mobile/ios && pod install` if an `ios/` directory with a `Podfile` exists (check `ls apps/mobile/ios/Podfile` first) — native module linking is required for this package to work on iOS. Android autolinking requires no extra step for RN 0.86.

- [ ] **Step 2: Write the Keychain wrapper**

Create `apps/mobile/src/lib/refreshTokenStore.ts`:

```ts
import * as Keychain from 'react-native-keychain';

const SERVICE = 'jamm.refresh-token';

export const refreshTokenStore = {
  async get(): Promise<string | null> {
    const result = await Keychain.getGenericPassword({ service: SERVICE });
    return result ? result.password : null;
  },
  async set(token: string): Promise<void> {
    await Keychain.setGenericPassword('refresh-token', token, { service: SERVICE });
  },
  async clear(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE });
  },
};
```

- [ ] **Step 3: Check the mobile test runner conventions**

Run: `find apps/mobile/src -iname "*.test.ts" | head -3` and read one to see the mocking pattern used for `axios`/native modules in this codebase (likely Jest, given `apps/mobile` has 18 existing test files per the earlier analysis).

- [ ] **Step 4: Write the failing test**

Create `apps/mobile/src/lib/__tests__/api.refresh.test.ts`, following the mocking conventions found in Step 3 (adapt import paths/mock syntax to match — the shape below is illustrative):

```ts
import axios from 'axios';

jest.mock('../refreshTokenStore', () => ({
  refreshTokenStore: {
    get: jest.fn().mockResolvedValue('stored-refresh-token'),
    set: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('api 401 refresh interceptor', () => {
  it('sends X-Client: mobile on every request', async () => {
    const { api } = require('../api');
    const config = await api.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers['X-Client']).toBe('mobile');
  });
});
```

Note for the implementer: this is a starting point, not exhaustive — the single-flight dedup assertion (mirroring Task 5 Step 2's intent: N concurrent 401s → exactly one `/auth/refresh` call) should be added here too, adapted to however this repo's existing mobile tests mock axios interceptor internals (inspect Step 3's example file for the actual pattern, since axios interceptor internals aren't trivially unit-testable without either a real axios instance + `axios-mock-adapter` or restructuring the interceptor logic into an exported, directly-testable function).

- [ ] **Step 5: Run test to verify it fails**

Run: `cd apps/mobile && npx jest src/lib/__tests__/api.refresh.test.ts`
Expected: FAIL — `X-Client` header not set yet.

- [ ] **Step 6: Implement the interceptor**

Open `apps/mobile/src/lib/api.ts`. Replace its contents with:

```ts
import axios from 'axios';
import {API_URL} from '../config/env';
import {useAuthStore} from '../store/authStore';
import {refreshTokenStore} from './refreshTokenStore';

export const api = axios.create({baseURL: API_URL, timeout: 15000});

api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Client'] = 'mobile';
  return config;
});

// Single in-flight refresh promise shared by every concurrent 401 — same
// rationale as the frontend web client (Task 5): without this, concurrent
// requests failing together would each try to rotate the same refresh
// token, and all but the first would hit the reuse-detection 401.
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const storedRefreshToken = await refreshTokenStore.get();
      if (!storedRefreshToken) throw new Error('No refresh token stored');
      const {data} = await axios.post(
        `${API_URL}/auth/refresh`,
        {refreshToken: storedRefreshToken},
        {headers: {'X-Client': 'mobile'}},
      );
      await refreshTokenStore.set(data.refresh_token);
      return data.access_token as string;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  r => r,
  async error => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/refresh') || originalRequest?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retried) {
      originalRequest._retried = true;
      try {
        const newToken = await refreshAccessToken();
        useAuthStore.setState({token: newToken});
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        void useAuthStore.getState().logout();
        return Promise.reject(error);
      }
    }

    if (error.response?.status === 401) void useAuthStore.getState().logout();
    return Promise.reject(error);
  },
);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/mobile && npx jest src/lib/__tests__/api.refresh.test.ts`
Expected: PASS.

- [ ] **Step 8: Wire refresh-token storage into `authStore.ts`**

Open `apps/mobile/src/store/authStore.ts`. Add the import: `import {refreshTokenStore} from '../lib/refreshTokenStore';`

In `login`, change:

```ts
  login: async (phone: string, password: string) => {
    const { data } = await api.post('/auth/login', { phone, password });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    const session = { token: data.access_token, user: data.admin as User };
    await storage.set('session', session);
    set(session);
  },
```

to:

```ts
  login: async (phone: string, password: string) => {
    const { data } = await api.post('/auth/login', { phone, password });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    if (data.refresh_token) await refreshTokenStore.set(data.refresh_token);
    const session = { token: data.access_token, user: data.admin as User };
    await storage.set('session', session);
    set(session);
  },
```

Apply the identical `if (data.refresh_token) await refreshTokenStore.set(data.refresh_token);` addition to `loginCode` and `completePasswordReset` (both follow the same `data.access_token`/`data.admin` destructuring pattern — add the line right before their existing `const session = ...` line).

In `logout`, change:

```ts
  logout: async () => {
    closePracticeMessengerSocket();
    await storage.remove('session');
    set({ token: null, user: null });
  },
```

to:

```ts
  logout: async () => {
    closePracticeMessengerSocket();
    await api.post('/auth/logout', { refreshToken: await refreshTokenStore.get() }).catch(() => {});
    await refreshTokenStore.clear();
    await storage.remove('session');
    set({ token: null, user: null });
  },
```

- [ ] **Step 9: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest --silent`
Expected: PASS. Fix any regression (e.g. other tests mocking `authStore`'s `logout` or `login` that now need `refreshTokenStore` mocked too).

- [ ] **Step 10: Manually verify on the emulator**

Confirm the mobile dev environment can build (`cd apps/mobile && npx react-native run-android` or `run-ios` if an emulator/simulator is available), log in with a test student account, and confirm login succeeds. If a way to force-expire the access token is available for manual testing (e.g. temporarily setting the backend's JWT lifetime to `10s` locally), verify a subsequent API call transparently refreshes rather than logging the user out.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/src/lib/refreshTokenStore.ts apps/mobile/src/lib/api.ts apps/mobile/src/lib/__tests__/api.refresh.test.ts apps/mobile/src/store/authStore.ts
git commit -m "feat(mobile): add Keychain-backed refresh token and single-flight 401 interceptor"
```

---

## Task 7: End-to-end verification across all three apps

**Files:** none (verification only).

- [ ] **Step 1: Backend — full suite**

Run: `cd apps/backend && npm test && npm run test:e2e`
Expected: PASS, zero regressions.

- [ ] **Step 2: Frontend — full suite + typecheck**

Run: `cd apps/frontend && npx tsc --noEmit && npx vitest run` (or repo's actual test command per Task 5 Step 1's findings)
Expected: PASS.

- [ ] **Step 3: Mobile — full suite + typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p . && npx jest --silent`
Expected: PASS.

- [ ] **Step 4: Manual cross-app smoke test**

1. Log in on web with a fresh session. Confirm `rt` cookie present (httpOnly, not readable from `document.cookie` in the console — this itself is a good manual XSS-mitigation check).
2. Log in on mobile with a fresh session (or the emulator from Task 6 Step 10). Confirm the app still works normally.
3. On the backend, confirm a pre-existing (pre-migration) token — if any real one is available from before this change shipped — still authenticates against `/auth/me`. If none is available, mint one manually with the *old* 365-day `expiresIn` via a throwaway script using the same `JWT_SECRET`, and confirm `GET /auth/me` with it still returns 200 (proving `JwtStrategy` validation is untouched by this plan, satisfying the spec's backward-compatibility requirement).
4. Confirm `POST /auth/logout` on web clears the `rt` cookie (DevTools → Application → Cookies, cookie disappears after logout) and a subsequent `/auth/refresh` with the old value returns 401.

- [ ] **Step 5: Update the analysis report**

Open `ANALYSIS_REPORT.md` at the repo root. Under item B1 (JWT lifetime) and F2 (localStorage token), add a short note that this has been addressed by the refresh-token flow (link to the spec doc), so the report reflects current reality for whoever reads it next. Do not remove the historical finding — annotate it as resolved.

- [ ] **Step 6: Commit**

```bash
git add ANALYSIS_REPORT.md
git commit -m "docs: mark JWT lifetime / localStorage-token findings as resolved"
```
