# Refresh-Token Auth Flow — Design Spec

Date: 2026-08-17
Status: Approved for planning

## Problem

Access tokens are JWTs signed with `expiresIn: '365d'` ([auth.module.ts](../../../apps/backend/src/auth/auth.module.ts)) and stored in `localStorage` (web) / AsyncStorage-backed `storage` (mobile). There is no refresh mechanism and no revocation list. A stolen token (e.g. via XSS on the unsanitized lesson-HTML render path) is valid for a year with no way to invalidate it short of rotating `JWT_SECRET` (which would log out every user).

## Goal

Shrink the access-token blast radius to 15 minutes while preserving the "user almost never has to log in again" experience, by introducing a long-lived (365-day), rotating, server-revocable refresh token. Existing sessions (tokens already issued under the old 365-day scheme) keep working unchanged — this migration is additive, not a forced logout.

## Scope

Backend (NestJS), frontend (React web), mobile (React Native). No changes to the Socket.IO/WebSocket auth path (classroom gateway) — those already re-verify the JWT per connection and reconnect on failure; a 15-minute access token just means classroom sessions may need a fresh token on long calls, which is a follow-up, not part of this spec.

## Non-goals

- No change to how existing (pre-migration) 365-day tokens are validated — they keep working until they naturally expire.
- No forced re-login for currently-authenticated users.
- No changes to the Telegram bot login flow's *code* generation/verification — only to what happens after a code is verified (i.e. `createAuthResponse`).

## Data model

New Drizzle table `refresh_tokens` in [schema.ts](../../../apps/backend/src/db/schema.ts):

```ts
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(), // sha256 hex of the raw token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedByTokenId: uuid('replaced_by_token_id'),
}, (table) => ({
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  tokenHashIdx: uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
}));
```

Raw token: `crypto.randomBytes(48).toString('base64url')` (opaque, not a JWT — no reason to make it parseable, and opaque tokens are trivially revocable by DB lookup). Stored as `sha256(rawToken)` hex digest (fast, deterministic, sufficient — this is a high-entropy random token, not a low-entropy password, so bcrypt's slow-hash property isn't needed and would make refresh-heavy traffic expensive).

## Token lifetimes

- Access token (JWT): **15 minutes** (`expiresIn: '15m'`).
- Refresh token (opaque, DB-backed): **365 days**, **rotated on every use** (old row marked `revokedAt` + `replacedByTokenId`, new row inserted).

## Rotation & reuse detection

On `POST /auth/refresh`:
1. Hash the incoming raw token, look up by `tokenHash`.
2. Not found → 401.
3. Found but `revokedAt` is set → **reuse of an already-rotated token**. This means either (a) a client retried a request after successfully rotating (benign — client-side race), or (b) an attacker replayed a stolen-then-already-used token. We cannot distinguish these server-side, so treat it conservatively: revoke **all** refresh tokens for that `userId` (force full re-login everywhere) and return 401. This is the standard refresh-token-rotation reuse-detection response.
4. Found, not revoked, but `expiresAt < now` → 401 (expired, no special handling).
5. Valid → mark current row `revokedAt = now()`, insert new row, sign new 15-minute access token, return both.

## API surface

### `POST /auth/refresh`
- Web: reads refresh token from the `rt` httpOnly cookie (no body needed). Sets a new `rt` cookie in the response.
- Mobile: reads refresh token from request body `{ refreshToken: string }` (mobile has no cookie jar). Returns new refresh token in the response body.
- Response body (both): `{ access_token: string, refresh_token?: string }` — `refresh_token` present only for mobile (web gets it via `Set-Cookie`, never exposed to JS).
- Distinguishing web vs mobile: a `X-Client: mobile` request header the mobile `api.ts` interceptor always sends; absence means web. (Simpler than a body flag, and doubles as a debugging aid in logs.)

### `POST /auth/logout`
- Revokes the current refresh token (from cookie or body, same dual-path as `/refresh`). Web additionally clears the `rt` cookie (`Set-Cookie` with `Max-Age=0`).
- Idempotent: unknown/already-revoked token → 200 anyway (logout should never error visibly).

### Existing login-producing endpoints — extended, not replaced
`POST /auth/login`, `POST /auth/register/verify`, `POST /auth/telegram/verify`, `POST /auth/password/reset/complete` all funnel through `AuthService.createAuthResponse()` today. That single method is extended to also mint a refresh token and (for web) attach the `Set-Cookie` header — see Task breakdown. Response body shape for these endpoints is **unchanged** for backward compatibility (`{ access_token, user, admin }`); mobile additionally receives `refresh_token` in the body, web receives it only via cookie.

## Cookie attributes (web)

`res.cookie('rt', rawToken, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/v1/auth', maxAge: 365 * 24 * 60 * 60 * 1000 })`

- `secure: isProd` — local dev runs over plain HTTP (frontend :5173 → backend :3001), so `secure: true` would silently drop the cookie locally. Gate on `NODE_ENV === 'production'`.
- `path: '/api/v1/auth'` — the cookie is only ever sent to auth endpoints, not on every API request, minimizing exposure.
- `sameSite: 'lax'` — sufficient since refresh is always a same-site XHR triggered by our own JS, not a cross-site navigation.

CORS must be updated to `credentials: true` so `withCredentials: true` XHRs actually carry/receive the cookie ([main.ts](../../../apps/backend/src/main.ts) `app.enableCors(...)`, currently `{ origin: getAllowedOrigins() }` with no `credentials` key).

`cookie-parser` middleware must be registered (not currently a dependency) so `req.cookies.rt` is readable in the controller.

## Frontend (web) changes

- [client.ts](../../../apps/frontend/src/api/client.ts): add `withCredentials: true` to the axios instance. On a `401` response (excluding requests already targeting `/auth/refresh` or `/auth/login`, to avoid infinite loops), attempt exactly one `POST /auth/refresh` (deduped — concurrent 401s from multiple in-flight requests must share a single in-flight refresh call, not fire N parallel refreshes). On success, retry the original request with the new access token. On failure, fall through to today's behavior (`logout()` + redirect to `/login`).
- [authStore.ts](../../../apps/frontend/src/stores/authStore.ts): unchanged storage mechanism for the access token (`localStorage`, same as today — out of scope per the approved design, which only asked for the refresh-token cookie, not moving the access token). `logout()` additionally fires `POST /auth/logout` (best-effort, don't block UI on it) before clearing local state.

## Mobile changes

- Add `react-native-keychain` dependency (bare RN app, confirmed no Expo/`expo-secure-store` in [package.json](../../../apps/mobile/package.json)) for refresh-token storage. Access token and user object keep using the existing `storage` helper ([storage.ts](../../../apps/mobile/src/lib/storage.ts)) exactly as today.
- [api.ts](../../../apps/mobile/src/lib/api.ts): request interceptor adds `X-Client: mobile` header always. Response interceptor: on 401 (excluding `/auth/refresh`/`/auth/login`), attempt one deduped refresh (reads refresh token from Keychain, posts to `/auth/refresh` with `{ refreshToken }` in body), update stored access token + Keychain refresh token on success, retry original request; on failure, existing `logout()` call.
- [authStore.ts](../../../apps/mobile/src/store/authStore.ts): `login`/`loginCode`/`completePasswordReset` additionally store `data.refresh_token` in Keychain. `hydrate()` unaffected (still reads access token from `storage`). `logout()` clears Keychain entry in addition to today's `storage.remove('session')`, and best-effort fires `POST /auth/logout`.

## Backward compatibility (explicit)

- Tokens issued before this change (365-day `exp`, no matching `refresh_tokens` row) continue to authenticate normally against `JwtAuthGuard`/`JwtStrategy` — nothing about token *verification* changes, only default `expiresIn` for newly-signed tokens.
- Those pre-migration sessions have no refresh token, so once their JWT naturally expires (up to 365 days out, same as today), the user must log in again — at which point they're on the new flow. No migration script, no forced logout.

## Error handling

- `/auth/refresh` with missing/malformed cookie or body field → 401 `{ message: 'Invalid refresh token' }` (no distinction from "expired" or "revoked" in the response — don't leak which case it was).
- Reuse-detected case (Rotation step 3) → same generic 401, but server-side revokes the whole family; this is invisible to the caller, they just see "please log in again."
- `/auth/logout` never returns a 4xx for a bad/missing token — always 200.

## Testing strategy

- Backend: unit tests on `AuthService` for `refresh()` (happy path rotates and returns new pair; expired token rejected; revoked/reused token triggers full-family revocation; unknown token rejected) and `logout()` (revokes matching row, idempotent on unknown token). e2e test for the full `login → refresh → refresh-with-old-token-fails` sequence via the controller.
- Frontend: the axios interceptor's single-flight dedup behavior (N concurrent 401s → exactly one `/auth/refresh` call) is the one subtle piece worth a unit test with mocked axios.
- Mobile: same dedup test, adapted for `api.ts`'s interceptor.

## Open questions resolved during brainstorming

- Storage location: web → httpOnly cookie; mobile → react-native-keychain. (User-approved.)
- Access token lifetime: 15 minutes. (User-approved.)
- Refresh token lifetime: 365 days, with rotation. (User-approved.)
- Existing sessions: left untouched, no forced re-login. (User-approved, this session.)
