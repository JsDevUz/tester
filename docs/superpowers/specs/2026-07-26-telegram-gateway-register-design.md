# Register with Telegram Gateway OTP Design

## Goal

Add a registration flow to the login page: a single "Ism Familiya" input, a phone
input (+998 xx xxx xx xx), and a password input. After submitting, the user
receives a one-time code sent directly by Telegram itself (via the official
Telegram Gateway API), not by our custom bot. Entering the correct code creates
the account and logs the user in immediately, with the password they chose.

This replaces the bot-dependent registration path (`requestRegistration` /
`verifyRegistration` in `apps/backend/src/auth/auth.service.ts`), which
currently requires the user to `/start` our bot and share their contact before
they can receive a code, and which generates a random password sent via the
bot instead of letting the user choose one.

Existing bot-based login-by-code (`/auth/telegram/verify`) and password reset
(`/auth/password/reset/*`) are unchanged — this spec only replaces the
registration path.

## Why Telegram Gateway instead of the bot

Telegram Gateway (`gatewayapi.telegram.org`) is Telegram's official OTP
delivery product. It sends the code as a message from Telegram's own verified
system sender, not from a bot the user must first interact with, so there is
no `/start` / contact-sharing prerequisite. It is a paid, metered API (billed
per delivered verification, dashboard at gateway.telegram.org), separate from
the bot token already configured for `TELEGRAM_BOT_TOKEN`.

## Backend Changes

### Config

Add `TELEGRAM_GATEWAY_TOKEN` to `.env` / `.env.production.example`.

### New service: `apps/backend/src/telegram/telegram-gateway.service.ts`

```ts
sendVerificationMessage(phone: string): Promise<{ requestId: string }>
```
Calls `POST https://gatewayapi.telegram.org/sendVerificationMessage` with
`Authorization: Bearer <TELEGRAM_GATEWAY_TOKEN>`, body `{ phone_number, code_length: 6 }`.
Returns Telegram's `request_id`. Telegram generates and tracks the code itself
— we never see or hash it.

```ts
checkVerificationStatus(requestId: string, code: string): Promise<boolean>
```
Calls `POST https://gatewayapi.telegram.org/checkVerificationStatus` with
`{ request_id, code }`. Returns true when Telegram reports
`verification_status.status === "code_valid"`.

Handle Gateway error responses (invalid phone, expired request, rate limit) by
throwing `BadRequestException` with a message the frontend surfaces as-is.

### Schema change: `apps/backend/src/db/schema.ts`

Add to `authCodes`:
- `gatewayRequestId: text('gateway_request_id')`
- `passwordHash: text('password_hash')` (nullable — only used for the
  `register` purpose, holds the user's chosen password until the code is
  confirmed)

Migration: `apps/backend/drizzle/migrations/000X_gateway_register.sql` adding
both columns.

### `auth.service.ts` changes

`requestRegistration(input: { name, phone, password })`:
1. Normalize phone, reject if a `users` row already exists for it (unchanged
   conflict check).
2. Hash `password` with bcrypt.
3. Call `telegramGatewayService.sendVerificationMessage(phone)`.
4. Insert into `authCodes`: `phone`, `name`, `passwordHash`, `purpose: 'register'`,
   `gatewayRequestId`, `expiresAt` (Telegram's own code lifetime governs actual
   validity; keep a local `expiresAt` — e.g. 10 minutes — as a fallback
   cleanup/lookup window, not as the source of truth for code validity).
5. `authCodes.codeHash` is currently `NOT NULL` in the schema. Since Telegram
   Gateway owns code validation for `register` rows, no local code exists to
   hash. Make `codeHash` nullable in the migration and leave it `null` for
   `register`-purpose rows; `login`/`reset` purposes keep writing a real hash
   exactly as today, and their lookup path (`verifyCodeByPurpose`,
   `verifyAuthCode`) is untouched.

`verifyRegistration(phone, code)`:
1. Look up the most recent unused `authCodes` row for `(phone, purpose: 'register')`.
2. Call `telegramGatewayService.checkVerificationStatus(row.gatewayRequestId, code)`.
3. If invalid, throw `BadRequestException("Kod noto'g'ri yoki muddati tugagan.")`.
4. If valid, mark the row `usedAt`, then in a transaction re-check no user
   exists for the phone yet (race guard, same pattern as today) and insert
   the new `users` row using `row.passwordHash` and `row.name`.
5. Return `createAuthResponse(user)` directly — same shape as login — so the
   frontend logs the user in immediately without a redirect back to the login
   form.

Note the endpoint signature changes: `verifyRegistration` now needs `phone`
in addition to `code`, since the code itself is no longer looked up
globally by trying all unused codes (Gateway validates against a specific
`request_id`, which is tied to phone). Update `RegisterVerifyDto` to include
phone.

### `auth.controller.ts`

- `RegisterRequestDto` gains `password` (`@IsString() @MinLength(8) @MaxLength(128)`).
- `RegisterVerifyDto` gains `phone` (`@IsString() @MinLength(7)`).
- Routes (`POST /auth/register/request`, `POST /auth/register/verify`) keep
  the same paths and throttle rules.

### Tests

`auth.service.spec.ts`: mock `TelegramGatewayService`, cover:
- successful request + verify creates a `student` user with the chosen password.
- verify with wrong code throws and does not create a user.
- request for an already-registered phone throws conflict.
- verify does not allow re-using a consumed code.

## Frontend Changes

### `apps/frontend/src/api/auth.ts`

- `apiRequestRegistration(input: { name, phone, password })` — body updated to
  include `password`.
- `apiVerifyRegistration(input: { phone, code })` — body updated to include
  `phone`; return type becomes `{ access_token, admin, user }` (same shape as
  login), instead of today's `{ ok, user }`.

### `apps/frontend/src/stores/authStore.ts`

Add:
```ts
registerWithTelegramCode: (phone: string, code: string) => Promise<void>
```
mirroring `loginWithTelegramCode`, calling the updated `apiVerifyRegistration`
and storing `access_token`/`admin` the same way.

### `apps/frontend/src/pages/LoginPage.tsx`

Add a third top-level mode alongside existing `showPasswordLogin` /
`forgotMode`: `registerMode`, with its own step state
(`"form" | "code"`), reusing existing patterns:

- **Step "form":** one name input ("Ism Familiya"), the existing
  `maskUzPhone`-driven phone input, and a password input (`type="password"`,
  min 8 chars, same validation message style as reset password). Submit calls
  `apiRequestRegistration({ name, phone, password })`; on success moves to
  step "code". On failure, `toast.error` with the server message (e.g. phone
  already registered, invalid phone for Gateway).
- **Step "code":** reuse the existing 6-box OTP input component pattern
  (`codeDigits`/`resetCodeDigits` style — extract to a shared local render
  since there will now be three near-identical OTP inputs, or duplicate
  consistent with current file style — decide at implementation time based on
  how much the file has grown). No bot-link text under the heading, since the
  code arrives directly as a Telegram system message, not from `@BirKodBot`.
  Auto-submits via the same `useEffect`-on-length-6 pattern once 6 digits are
  entered, calling `registerWithTelegramCode(phone, code)`. On success,
  navigate to `redirectTo` exactly like existing login flows. On failure,
  `toast.error` and let the user retry (code input clears is optional, follow
  existing reset-code behavior which does not clear on error).
- A toggle link ("Ro'yxatdan o'tish" / "Login bilan kirish") next to the
  existing `showPasswordLogin` toggle switches into/out of `registerMode`,
  consistent with how `forgotMode` is toggled today.

## Error Handling

- Gateway request failures (bad phone format, Telegram account not found,
  rate-limited) surface as `BadRequestException` messages from
  `TelegramGatewayService`, shown via existing `toast.error(err.response?.data?.message ?? ...)`
  pattern already used throughout `LoginPage.tsx`.
- Existing throttle (`AUTH_THROTTLE`: 5 req/min per IP) applies unchanged to
  the register endpoints.

## Out of Scope

- Bot-based login-by-code (`/auth/telegram/verify`) and password reset flows
  are unchanged.
- `userTelegramLinks` table and bot `/start`/contact-sharing flow remain in
  place for those other flows; this spec only removes the dependency on them
  from the *registration* path.
- Migrating existing registered users or backfilling data is not needed —
  this only changes the registration code path going forward.
