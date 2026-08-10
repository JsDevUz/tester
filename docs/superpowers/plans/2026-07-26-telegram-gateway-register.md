# Register with Telegram Gateway OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bot-dependent registration flow with one where the user picks their own password and receives the OTP directly from Telegram's official Gateway API (no `/start` or contact-sharing with our bot required), then add a matching register UI to the login page.

**Architecture:** Add a `TelegramGatewayService` that wraps `gatewayapi.telegram.org`'s `sendVerificationMessage` / `checkVerificationStatus` endpoints. `AuthService.requestRegistration` stores the user's chosen password (hashed) and name against a Gateway `request_id`; `AuthService.verifyRegistration` asks Gateway to validate the code, then creates the user and logs them in directly (same response shape as login). The frontend gets a new register mode in `LoginPage.tsx` reusing the existing OTP-box UI pattern.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, `fetch` for Gateway HTTP calls, React/Vite, Zustand, Jest.

## Global Constraints

- Existing bot-based login-by-code (`/auth/telegram/verify`) and password reset (`/auth/password/reset/*`) must keep working unchanged — do not touch `verifyTelegramCode`, `requestPasswordReset`, `verifyPasswordReset`, `verifyPasswordResetCode`, `completePasswordReset`, or their controller routes.
- `userTelegramLinks` / bot `/start` flow stays in place for those other flows; only the *registration* path stops depending on it.
- Auth endpoints keep the existing throttle: 5 requests/min per IP (`AUTH_THROTTLE` in `apps/backend/src/auth/auth.controller.ts`).
- All new user-facing strings are in Uzbek, matching the existing tone in `LoginPage.tsx` and `auth.service.ts` (e.g. `"Kod noto'g'ri yoki muddati tugagan."`).
- New env var: `TELEGRAM_GATEWAY_TOKEN`.

---

## File Structure

- Create `apps/backend/src/telegram/telegram-gateway.service.ts`: wraps Telegram Gateway HTTP calls.
- Modify `apps/backend/src/telegram/telegram.module.ts`: provide/export `TelegramGatewayService`.
- Modify `apps/backend/src/db/schema.ts`: add `gatewayRequestId` and nullable `passwordHash` to `authCodes`; make `codeHash` nullable.
- Generate migration under `apps/backend/drizzle/migrations` via `drizzle-kit generate`.
- Modify `apps/backend/src/auth/auth.service.ts`: `requestRegistration` / `verifyRegistration` rewritten to use Gateway.
- Modify `apps/backend/src/auth/auth.controller.ts`: DTOs gain `password` (request) and `phone` (verify).
- Modify `apps/backend/src/auth/auth.service.spec.ts`: update/replace the registration test for the new flow.
- Modify `apps/backend/.env`, `apps/backend/.env.production.example`: add `TELEGRAM_GATEWAY_TOKEN`.
- Modify `apps/frontend/src/api/auth.ts`: update `apiRequestRegistration` / `apiVerifyRegistration` signatures and return types.
- Modify `apps/frontend/src/stores/authStore.ts`: add `registerWithTelegramCode`.
- Modify `apps/frontend/src/pages/LoginPage.tsx`: add register mode (form step + OTP step) and a mode toggle.

---

## Task 1: Telegram Gateway Service

**Files:**
- Create: `apps/backend/src/telegram/telegram-gateway.service.ts`
- Create: `apps/backend/src/telegram/telegram-gateway.service.spec.ts`
- Modify: `apps/backend/src/telegram/telegram.module.ts`

**Interfaces:**
- Produces: `TelegramGatewayService.sendVerificationMessage(phone: string): Promise<{ requestId: string }>`
- Produces: `TelegramGatewayService.checkVerificationStatus(requestId: string, code: string): Promise<boolean>`

- [ ] **Step 1: Write failing tests for the Gateway service**

Create `apps/backend/src/telegram/telegram-gateway.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { TelegramGatewayService } from './telegram-gateway.service';

describe('TelegramGatewayService', () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_GATEWAY_TOKEN;

  beforeEach(() => {
    process.env.TELEGRAM_GATEWAY_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.TELEGRAM_GATEWAY_TOKEN = originalToken;
  });

  it('sends a verification message and returns the request id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { request_id: 'req-1' } }),
    }) as any;

    const service = new TelegramGatewayService();
    const result = await service.sendVerificationMessage('+998901112233');

    expect(result).toEqual({ requestId: 'req-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://gatewayapi.telegram.org/sendVerificationMessage',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('throws BadRequestException when Gateway rejects the phone', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'PHONE_NUMBER_INVALID' }),
    }) as any;

    const service = new TelegramGatewayService();

    await expect(service.sendVerificationMessage('123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns true when the code is valid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_valid' } } }),
    }) as any;

    const service = new TelegramGatewayService();
    const result = await service.checkVerificationStatus('req-1', '123456');

    expect(result).toBe(true);
  });

  it('returns false when the code is invalid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_invalid' } } }),
    }) as any;

    const service = new TelegramGatewayService();
    const result = await service.checkVerificationStatus('req-1', '000000');

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- telegram-gateway.service.spec.ts`
Expected: FAIL with "Cannot find module './telegram-gateway.service'"

- [ ] **Step 3: Implement `TelegramGatewayService`**

Create `apps/backend/src/telegram/telegram-gateway.service.ts`:

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramGatewayService {
  private readonly logger = new Logger(TelegramGatewayService.name);
  private readonly baseUrl = 'https://gatewayapi.telegram.org';

  async sendVerificationMessage(phone: string): Promise<{ requestId: string }> {
    const data = await this.call('/sendVerificationMessage', {
      phone_number: phone,
      code_length: 6,
    });

    const requestId = data?.result?.request_id;
    if (!requestId) {
      this.logger.error(`Gateway sendVerificationMessage missing request_id: ${JSON.stringify(data)}`);
      throw new BadRequestException("Telegram orqali kod yuborib bo'lmadi.");
    }

    return { requestId };
  }

  async checkVerificationStatus(requestId: string, code: string): Promise<boolean> {
    const data = await this.call('/checkVerificationStatus', {
      request_id: requestId,
      code,
    });

    return data?.result?.verification_status?.status === 'code_valid';
  }

  private async call(path: string, body: Record<string, unknown>) {
    const token = process.env.TELEGRAM_GATEWAY_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_GATEWAY_TOKEN is not configured');
      throw new BadRequestException('Telegram Gateway sozlanmagan.');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      this.logger.warn(`Gateway ${path} failed: ${JSON.stringify(data)}`);
      throw new BadRequestException("Bu telefon raqami bilan Telegram orqali bog'lanib bo'lmadi.");
    }

    return data;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- telegram-gateway.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Register the service in `TelegramModule`**

Modify `apps/backend/src/telegram/telegram.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramGatewayService } from './telegram-gateway.service';

@Module({
  imports: [StorageModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramGatewayService],
  exports: [TelegramService, TelegramGatewayService],
})
export class TelegramModule {}
```

- [ ] **Step 6: Add the env var**

Append to `apps/backend/.env` and `apps/backend/.env.production.example`:

```env
TELEGRAM_GATEWAY_TOKEN=
```

(Leave the local `.env` value blank or ask the user for the real token out of band — do not invent a value.)

- [ ] **Step 7: Verify backend still builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/telegram/telegram-gateway.service.ts apps/backend/src/telegram/telegram-gateway.service.spec.ts apps/backend/src/telegram/telegram.module.ts apps/backend/.env apps/backend/.env.production.example
git commit -m "feat(telegram): add Telegram Gateway OTP service"
```

---

## Task 2: Schema and Migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`

**Interfaces:**
- Consumes: none
- Produces: `authCodes.gatewayRequestId: text | null`, `authCodes.passwordHash: text | null`, `authCodes.codeHash` becomes nullable — used by Task 3.

- [ ] **Step 1: Update the `authCodes` table definition**

In `apps/backend/src/db/schema.ts`, find the `authCodes` table (currently at lines 30-40) and change it to:

```ts
export const authCodes = pgTable('auth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: text('phone').notNull(),
  name: text('name'),
  telegramChatId: text('telegram_chat_id'),
  purpose: text('purpose').notNull(),
  codeHash: text('code_hash'),
  gatewayRequestId: text('gateway_request_id'),
  passwordHash: text('password_hash'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

The only changes from the current definition: `codeHash` drops `.notNull()`, and two new nullable columns (`gatewayRequestId`, `passwordHash`) are added.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate --workspace=apps/backend`

This produces a new file under `apps/backend/drizzle/migrations/` (drizzle-kit names it automatically, e.g. `0020_<generated-name>.sql`) plus a matching snapshot in `apps/backend/drizzle/migrations/meta/`. Confirm the generated SQL only contains:

```sql
ALTER TABLE "auth_codes" ALTER COLUMN "code_hash" DROP NOT NULL;
ALTER TABLE "auth_codes" ADD COLUMN "gateway_request_id" text;
ALTER TABLE "auth_codes" ADD COLUMN "password_hash" text;
```

(column order and exact statement grouping may differ slightly — verify no unrelated tables are touched).

- [ ] **Step 3: Verify backend builds with the new schema**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations
git commit -m "feat(db): add gateway_request_id and nullable password_hash/code_hash to auth_codes"
```

---

## Task 3: Auth Service Registration Rewrite

**Files:**
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `TelegramGatewayService.sendVerificationMessage`, `TelegramGatewayService.checkVerificationStatus` (Task 1); `authCodes.gatewayRequestId`/`passwordHash` (Task 2)
- Produces: `AuthService.requestRegistration(input: { name: string; phone: string; password: string }): Promise<{ ok: true }>`, `AuthService.verifyRegistration(phone: string, code: string): Promise<{ access_token: string; user: SafeUser; admin: SafeUser }>` (same shape as `login`)

- [ ] **Step 1: Write failing tests for the new registration flow**

Replace the first test in `apps/backend/src/auth/auth.service.spec.ts` (currently `'creates a student account after verifying a Telegram registration code'`, lines 55-82) with:

```ts
it('requests a registration code through Telegram Gateway', async () => {
  (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
  telegramGatewayService.sendVerificationMessage.mockResolvedValue({ requestId: 'req-1' });
  mockInsertReturning({ id: 'code-1' });

  const service = new AuthService(
    jwtService as any,
    telegramService as any,
    storageService as any,
    telegramGatewayService as any,
  );

  const result = await service.requestRegistration({
    name: 'Student One',
    phone: '+998901112233',
    password: 'strongpass1',
  });

  expect(result).toEqual({ ok: true });
  expect(telegramGatewayService.sendVerificationMessage).toHaveBeenCalledWith('+998901112233');
  expect(bcrypt.hash).toHaveBeenCalledWith('strongpass1', 10);
});

it('rejects registration request for an already-registered phone', async () => {
  (db.query.users.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-user' });

  const service = new AuthService(
    jwtService as any,
    telegramService as any,
    storageService as any,
    telegramGatewayService as any,
  );

  await expect(
    service.requestRegistration({ name: 'Student One', phone: '+998901112233', password: 'strongpass1' }),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(telegramGatewayService.sendVerificationMessage).not.toHaveBeenCalled();
});

it('creates a student account after Telegram Gateway confirms the code', async () => {
  const authCode = {
    id: 'code-1',
    phone: '+998901112233',
    name: 'Student One',
    passwordHash: 'hashed-value',
    gatewayRequestId: 'req-1',
    purpose: 'register',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };
  (db.query.authCodes.findFirst as jest.Mock).mockResolvedValue(authCode);
  (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);
  telegramGatewayService.checkVerificationStatus.mockResolvedValue(true);
  mockUpdate();
  mockInsertReturning({
    id: 'user-1',
    displayName: 'Student One',
    role: 'student',
    phone: '+998901112233',
    displayAvatarUrl: null,
  });

  const service = new AuthService(
    jwtService as any,
    telegramService as any,
    storageService as any,
    telegramGatewayService as any,
  );

  const result = await service.verifyRegistration('+998901112233', '123456');

  expect(result.access_token).toBe('signed-token');
  expect(result.user.role).toBe('student');
  expect(telegramGatewayService.checkVerificationStatus).toHaveBeenCalledWith('req-1', '123456');
});

it('rejects registration verify when Telegram Gateway reports an invalid code', async () => {
  const authCode = {
    id: 'code-1',
    phone: '+998901112233',
    name: 'Student One',
    passwordHash: 'hashed-value',
    gatewayRequestId: 'req-1',
    purpose: 'register',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };
  (db.query.authCodes.findFirst as jest.Mock).mockResolvedValue(authCode);
  telegramGatewayService.checkVerificationStatus.mockResolvedValue(false);

  const service = new AuthService(
    jwtService as any,
    telegramService as any,
    storageService as any,
    telegramGatewayService as any,
  );

  await expect(service.verifyRegistration('+998901112233', '000000')).rejects.toBeInstanceOf(BadRequestException);
  expect(db.insert).not.toHaveBeenCalled();
});
```

Add `ConflictException` to the existing `import { BadRequestException } from '@nestjs/common';` line (change to `import { BadRequestException, ConflictException } from '@nestjs/common';`), and add a `telegramGatewayService` mock alongside the existing `telegramService`/`storageService` mocks near the top of the file:

```ts
const telegramGatewayService = {
  sendVerificationMessage: jest.fn(),
  checkVerificationStatus: jest.fn(),
};
```

The existing `jest.clearAllMocks()` in `beforeEach` already resets `telegramGatewayService`'s `jest.fn()`s since it clears all mocks module-wide — no separate reset needed.

Also update the two other existing `new AuthService(...)` call sites in this file (in the `'rejects a reset code after it has been used once'` and `'logs in a Telegram user with a one-time code'` tests) to pass the 4th argument, so the constructor signature change doesn't leave them out of sync:

```ts
const service = new AuthService(
  jwtService as any,
  telegramService as any,
  storageService as any,
  telegramGatewayService as any,
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- auth.service.spec.ts`
Expected: FAIL — `requestRegistration`/`verifyRegistration` signatures don't match yet, `AuthService` constructor doesn't accept a 4th argument.

- [ ] **Step 3: Update `AuthService` constructor and imports**

In `apps/backend/src/auth/auth.service.ts`, update the top of the class:

```ts
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { authCodes, userTelegramLinks, users } from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramGatewayService } from '../telegram/telegram-gateway.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private telegramService: TelegramService,
    private storageService: StorageService,
    private telegramGatewayService: TelegramGatewayService,
  ) {}
```

- [ ] **Step 4: Rewrite `requestRegistration`**

Replace the existing `requestRegistration` method (currently lines 49-61) with:

```ts
  async requestRegistration(input: { name: string; phone: string; password: string }) {
    const phone = this.telegramService.normalizePhone(input.phone);
    const existingUser = await db.query.users.findFirst({ where: eq(users.phone, phone) });
    if (existingUser) throw new ConflictException("Bu telefon allaqachon ro'yxatdan o'tgan.");

    const { requestId } = await this.telegramGatewayService.sendVerificationMessage(phone);
    const passwordHash = await bcrypt.hash(input.password, 10);

    await db.insert(authCodes).values({
      phone,
      name: input.name.trim(),
      passwordHash,
      gatewayRequestId: requestId,
      purpose: 'register',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    return { ok: true };
  }
```

- [ ] **Step 5: Rewrite `verifyRegistration`**

Replace the existing `verifyRegistration` method (currently lines 63-103) with:

```ts
  async verifyRegistration(phone: string, code: string) {
    const normalizedPhone = this.telegramService.normalizePhone(phone);
    const authCode = await db.query.authCodes.findFirst({
      where: and(eq(authCodes.phone, normalizedPhone), eq(authCodes.purpose, 'register'), isNull(authCodes.usedAt)),
      orderBy: [desc(authCodes.createdAt)],
    });

    if (!authCode || authCode.usedAt || authCode.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Kod noto'g'ri yoki muddati tugagan.");
    }
    if (!authCode.gatewayRequestId || !authCode.passwordHash || !authCode.name) {
      throw new BadRequestException("Ro'yxatdan o'tish so'rovi topilmadi.");
    }

    const valid = await this.telegramGatewayService.checkVerificationStatus(authCode.gatewayRequestId, code);
    if (!valid) throw new BadRequestException("Kod noto'g'ri yoki muddati tugagan.");

    await db.update(authCodes).set({ usedAt: new Date() }).where(eq(authCodes.id, authCode.id));

    const user = await db.transaction(async (tx) => {
      const existingUser = await tx.query.users.findFirst({
        where: eq(users.phone, normalizedPhone),
      });
      if (existingUser) throw new ConflictException("Bu foydalanuvchi allaqachon mavjud.");

      const [created] = await tx
        .insert(users)
        .values({
          passwordHash: authCode.passwordHash!,
          name: authCode.name!,
          phone: normalizedPhone,
          role: 'student',
        })
        .returning({
          id: users.id,
          displayName: users.displayName,
          role: users.role,
          phone: users.phone,
          displayAvatarUrl: users.displayAvatarUrl,
        });
      return created;
    });

    return this.createAuthResponse(user);
  }
```

Note this drops the call to `this.telegramService.sendCredentialsToPhone(...)` that used to send a generated password — the user already knows their password since they chose it.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- auth.service.spec.ts`
Expected: PASS (all tests, including the 3 unrelated pre-existing ones for reset/login-by-code)

- [ ] **Step 7: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/auth/auth.service.ts apps/backend/src/auth/auth.service.spec.ts
git commit -m "feat(auth): register via Telegram Gateway OTP with user-chosen password"
```

---

## Task 4: Auth Controller DTOs

**Files:**
- Modify: `apps/backend/src/auth/auth.controller.ts`

**Interfaces:**
- Consumes: `AuthService.requestRegistration(input: { name, phone, password })`, `AuthService.verifyRegistration(phone, code)` (Task 3)
- Produces: `POST /auth/register/request` body `{ name, phone, password }`; `POST /auth/register/verify` body `{ phone, code }` returning `{ access_token, user, admin }`

- [ ] **Step 1: Update `RegisterRequestDto` and `RegisterVerifyDto`**

In `apps/backend/src/auth/auth.controller.ts`, replace:

```ts
class RegisterRequestDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(7) phone: string;
}

class RegisterVerifyDto {
  @IsString() @MinLength(4) code: string;
}
```

with:

```ts
class RegisterRequestDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(7) phone: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
}

class RegisterVerifyDto {
  @IsString() @MinLength(7) phone: string;
  @IsString() @MinLength(4) code: string;
}
```

- [ ] **Step 2: Update the `verifyRegistration` route handler**

Replace:

```ts
  @Throttle(AUTH_THROTTLE)
  @Post('register/verify')
  @HttpCode(200)
  verifyRegistration(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(dto.code);
  }
```

with:

```ts
  @Throttle(AUTH_THROTTLE)
  @Post('register/verify')
  @HttpCode(200)
  verifyRegistration(@Body() dto: RegisterVerifyDto) {
    return this.authService.verifyRegistration(dto.phone, dto.code);
  }
```

(`requestRegistration` route handler at `@Post('register/request')` already passes the whole `dto` through, so it needs no change — it already forwards `dto.password` once the DTO has the field.)

- [ ] **Step 3: Verify backend builds**

Run: `npm run build --workspace=apps/backend`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/auth/auth.controller.ts
git commit -m "feat(auth): accept password on register request, phone on register verify"
```

---

## Task 5: Frontend API Client and Auth Store

**Files:**
- Modify: `apps/frontend/src/api/auth.ts`
- Modify: `apps/frontend/src/stores/authStore.ts`

**Interfaces:**
- Consumes: `POST /auth/register/request` and `POST /auth/register/verify` (Task 4)
- Produces: `apiRequestRegistration(input: { name, phone, password }): Promise<{ ok: true }>`, `apiVerifyRegistration(input: { phone, code }): Promise<{ access_token: string; admin: Admin; user: Admin }>`, `useAuthStore().registerWithTelegramCode(phone, code): Promise<void>`

- [ ] **Step 1: Update `apiRequestRegistration` and `apiVerifyRegistration`**

In `apps/frontend/src/api/auth.ts`, replace:

```ts
export async function apiRequestRegistration(input: { name: string; phone: string }) {
  const res = await client.post('/auth/register/request', input);
  return res.data;
}

export async function apiVerifyRegistration(input: { code: string }) {
  const res = await client.post('/auth/register/verify', input);
  return res.data;
}
```

with:

```ts
export async function apiRequestRegistration(input: { name: string; phone: string; password: string }): Promise<{ ok: true }> {
  const res = await client.post('/auth/register/request', input);
  return res.data;
}

export async function apiVerifyRegistration(input: { phone: string; code: string }): Promise<{ access_token: string; admin: Admin; user: Admin }> {
  const res = await client.post('/auth/register/verify', input);
  return res.data;
}
```

- [ ] **Step 2: Add `registerWithTelegramCode` to the auth store**

In `apps/frontend/src/stores/authStore.ts`, update the import and interface:

```ts
import { create } from 'zustand';
import { apiCompletePasswordReset, apiLogin, apiTelegramLogin, apiVerifyRegistration, type Admin } from '../api/auth';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  login: (phone: string, password: string) => Promise<void>;
  loginWithTelegramCode: (code: string) => Promise<void>;
  loginWithPasswordReset: (resetToken: string, newPassword: string, confirmPassword: string) => Promise<void>;
  registerWithTelegramCode: (phone: string, code: string) => Promise<void>;
  logout: () => void;
  setAdmin: (admin: Admin) => void;
}
```

Add the implementation inside `create<AuthState>((set) => ({ ... }))`, alongside `loginWithTelegramCode`:

```ts
  registerWithTelegramCode: async (phone, code) => {
    const { access_token, admin } = await apiVerifyRegistration({ phone, code });
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
```

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/auth.ts apps/frontend/src/stores/authStore.ts
git commit -m "feat(frontend): wire register API client and store action for Gateway OTP"
```

---

## Task 6: Login Page Register UI

**Files:**
- Modify: `apps/frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `apiRequestRegistration` (Task 5), `useAuthStore().registerWithTelegramCode` (Task 5), existing `maskUzPhone` helper already in this file

- [ ] **Step 1: Add register state**

In `LoginPage.tsx`, alongside the existing `forgotMode`/`forgotStep` state (after line 37, before `loading`), add:

```ts
  const [registerMode, setRegisterMode] = useState(false);
  const [registerStep, setRegisterStep] = useState<"form" | "code">("form");
  const [registerName, setRegisterName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("+998 ");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerCode, setRegisterCode] = useState("");
```

Update the destructured store call (currently `const { login, loginWithTelegramCode, loginWithPasswordReset } = useAuthStore();`) to:

```ts
  const { login, loginWithTelegramCode, loginWithPasswordReset, registerWithTelegramCode } = useAuthStore();
```

Add the OTP-box refs and digit derivation next to the existing `codeRefs`/`resetCodeRefs` (after line 45's block):

```ts
  const registerCodeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const registerCodeDigits = useMemo(() => {
    const digits = registerCode.slice(0, CODE_LENGTH).split("");
    return Array.from({ length: CODE_LENGTH }, (_, index) => digits[index] ?? "");
  }, [registerCode]);
```

- [ ] **Step 2: Import `apiRequestRegistration`**

Change the existing import line:

```ts
import { apiVerifyPasswordResetCode } from "../api/auth";
```

to:

```ts
import { apiRequestRegistration, apiVerifyPasswordResetCode } from "../api/auth";
```

- [ ] **Step 3: Add submit handlers**

Add these functions near `verifyResetCode`/`completeReset` (after the `completeReset` function, before `updateCodeDigit`):

```ts
  async function submitRegisterForm(event: React.FormEvent) {
    event.preventDefault();
    if (registerPassword.length < 8) {
      toast.error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
      return;
    }
    setLoading(true);
    try {
      await apiRequestRegistration({ name: registerName, phone: registerPhone, password: registerPassword });
      setRegisterStep("code");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Ro'yxatdan o'tib bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegisterCode() {
    if (registerCodeDigits.join("").length !== CODE_LENGTH || loading) return;
    setLoading(true);
    try {
      await registerWithTelegramCode(registerPhone, registerCode);
      navigate(redirectTo);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Kod noto'g'ri yoki muddati tugagan");
    } finally {
      setLoading(false);
    }
  }

  function updateRegisterCodeDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...registerCodeDigits];
    next[index] = digit;
    setRegisterCode(next.join(""));
    if (digit && index < CODE_LENGTH - 1) registerCodeRefs.current[index + 1]?.focus();
  }

  function handleRegisterCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !registerCodeDigits[index] && index > 0) {
      registerCodeRefs.current[index - 1]?.focus();
    }
  }

  function handleRegisterCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    setRegisterCode(pasted);
    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    window.requestAnimationFrame(() => registerCodeRefs.current[focusIndex]?.focus());
  }
```

- [ ] **Step 4: Add auto-submit effect for the register OTP**

Add this alongside the existing auto-submit effects (after the `forgotMode`/`forgotStep` effect at line 73):

```ts
  useEffect(() => {
    if (!registerMode || registerStep !== "code" || registerCode.length !== CODE_LENGTH || loading) return;
    void submitRegisterCode();
  }, [registerMode, registerStep, registerCode]);
```

- [ ] **Step 5: Render the register form and OTP steps**

In the JSX, the current top-level structure branches on `forgotMode` first, then `!showPasswordLogin`, then `!forgotMode && showPasswordLogin`. Add a `registerMode` branch as a sibling, placed before the `forgotMode ? (...)` ternary (so the render order becomes: `registerMode` branch, then existing `forgotMode` ternary, then existing login branches gated with `!forgotMode && !registerMode`):

```tsx
        {registerMode ? (
          registerStep === "form" ? (
            <form onSubmit={submitRegisterForm} className="flex flex-col gap-4">
              <h1 className="login-title mb-2 text-2xl font-bold">Ro'yxatdan o'tish</h1>
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Ism Familiya"
                autoComplete="name"
                className="login-admin-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
              />
              <input
                type="text"
                value={registerPhone}
                onChange={(e) => setRegisterPhone(maskUzPhone(e.target.value))}
                placeholder="Telefon raqami"
                inputMode="tel"
                autoComplete="tel"
                maxLength={17}
                className="login-admin-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
              />
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Parol"
                autoComplete="new-password"
                className="login-admin-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
              />
              <button
                type="submit"
                disabled={loading || !registerName.trim() || registerPhone.replace(/\D/g, "").length < 12}
                className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
              >
                {loading ? "Yuborilmoqda..." : "Ro'yxatdan o'tish"}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void submitRegisterCode(); }} className="flex flex-col items-center">
              <h1 className="login-title text-2xl font-black leading-none">Kodni Kiriting</h1>
              <p className="login-description mt-5 max-w-100 text-center text-sm font-medium leading-relaxed">
                Telegram orqali kelgan 6 xonali kodni kiriting.
              </p>
              <div className="mt-8 flex w-full justify-center gap-2">
                {registerCodeDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { registerCodeRefs.current[index] = node; }}
                    autoFocus={index === 0}
                    value={digit}
                    onChange={(event) => updateRegisterCodeDigit(index, event.target.value)}
                    onKeyDown={(event) => handleRegisterCodeKeyDown(index, event)}
                    onPaste={handleRegisterCodePaste}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    aria-label={`Ro'yxatdan o'tish kodi raqami ${index + 1}`}
                    className="login-code-input h-11 w-9 rounded-xl border text-center text-xl font-semibold outline-none transition"
                  />
                ))}
              </div>
              <button type="submit" disabled={loading || registerCode.length !== CODE_LENGTH} className="sr-only">
                {loading ? "Tekshirilmoqda..." : "Kodni tasdiqlash"}
              </button>
            </form>
          )
        ) : forgotMode ? (
```

Change the line right after that ternary's closing (currently `) : !showPasswordLogin && (`) to also exclude register mode — since `registerMode` is now the outermost branch and its `else` already flows into the existing `forgotMode ? (...) : ...` chain, no further change is needed there; just make sure the existing `!forgotMode && showPasswordLogin` block and the trailing toggle buttons are also gated so they don't render during `registerMode`. Update:

```tsx
        {!forgotMode && showPasswordLogin && (
```

to:

```tsx
        {!forgotMode && !registerMode && showPasswordLogin && (
```

And update the trailing toggle button block (currently `{!forgotMode && <button ... }`) to add a second toggle for register, plus hide the existing one during register mode:

```tsx
        {!forgotMode && !registerMode && (
          <button
            type="button"
            onClick={() => setShowPasswordLogin((value) => !value)}
            className="login-toggle mt-10 w-full text-center text-xs font-medium"
          >
            {showPasswordLogin ? "Telegram kod bilan kirish" : "Login bilan kirish"}
          </button>
        )}
        {!forgotMode && !registerMode && (
          <button
            type="button"
            onClick={() => { setRegisterMode(true); setRegisterStep("form"); }}
            className="login-toggle mt-2 w-full text-center text-xs font-medium"
          >
            Ro'yxatdan o'tish
          </button>
        )}
        {registerMode && (
          <button
            type="button"
            onClick={() => { setRegisterMode(false); setRegisterStep("form"); }}
            className="login-toggle mt-10 w-full text-center text-xs font-medium"
          >
            Login bilan kirish
          </button>
        )}
```

Leave the existing `{forgotMode && (...)}` toggle-back button untouched.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev:frontend` (and `npm run dev:backend` in another terminal, with a real `TELEGRAM_GATEWAY_TOKEN` set)

Open the login page, click "Ro'yxatdan o'tish", fill in name/phone/password, submit, confirm the 6-box code screen appears, enter the code received via Telegram, confirm it logs in and redirects. Also click through "Login bilan kirish" to confirm the existing login/forgot-password flows still render correctly and are not visually broken by the new branch.

- [ ] **Step 7: Verify frontend builds**

Run: `npm run build --workspace=apps/frontend`
Expected: exit code `0`

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/LoginPage.tsx
git commit -m "feat(frontend): add register form and OTP step to login page"
```

---

## Verification

Run the full check before considering the feature done:

```bash
npm run test --workspace=apps/backend
npm run build --workspace=apps/backend
npm run build --workspace=apps/frontend
```

Expected: backend tests pass, both builds exit `0`.

Manual end-to-end check (requires a real `TELEGRAM_GATEWAY_TOKEN`):
- Register with a fresh phone number → receive OTP directly from Telegram (not from `@BirKodBot`) → enter code → land logged in on `/`.
- Attempt to register the same phone twice → second attempt is rejected with "Bu telefon allaqachon ro'yxatdan o'tgan."
- Enter a wrong code on the register OTP screen → rejected, can retry.
- Existing login (password and bot-code) and password reset flows still work unchanged.
