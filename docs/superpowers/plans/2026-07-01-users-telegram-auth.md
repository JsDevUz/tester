# Users and Telegram Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a future-ready `users` model with `student`, `teacher`, and `super` roles, then add Telegram bot registration and password reset.

**Architecture:** Replace admin-only auth semantics with user auth while keeping compatibility with existing folder/test ownership. Build this in two phases: first database/user role foundations and student history, then Telegram bot code delivery and credential reset.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, React/Vite, Zustand, Telegram Bot HTTP API via `fetch`.

---

## File Structure

- Modify `apps/backend/src/db/schema.ts`: add `users`, `authCodes`, `userTelegramLinks`; add `submissions.userId`.
- Add migration under `apps/backend/drizzle/migrations`: create users/auth code tables, copy admins to users, add user_id to submissions.
- Modify auth files in `apps/backend/src/auth`: login, JWT payload, guards, register/reset endpoints.
- Add `apps/backend/src/telegram`: Telegram webhook, send-message service, contact linking.
- Modify ownership services/controllers: folders/tests/questions/submissions use `req.user`.
- Modify frontend auth store/API: rename admin type to user-friendly shape and support roles.
- Add student dashboard/history page.
- Modify public test entry: prefill logged-in user name and link submission to user.
- Modify super user management page: list users and update roles.

## Task 1: Backend User Schema and Migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0004_users_auth.sql`

- [ ] **Step 1: Add tables to schema**

Add `users`, `authCodes`, and `userTelegramLinks`. Keep existing `admins` for compatibility during migration, but new code should read/write `users`.

- [ ] **Step 2: Add migration**

Create SQL that:

```sql
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  username text UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'student',
  phone text UNIQUE,
  telegram_chat_id text,
  telegram_user_id text,
  created_at timestamptz DEFAULT now()
);

INSERT INTO users (id, email, password_hash, name, role, created_at)
SELECT id, email, password_hash, name,
  CASE WHEN role = 'super' THEN 'super' ELSE 'teacher' END,
  created_at
FROM admins
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  telegram_chat_id text,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  telegram_chat_id text NOT NULL,
  telegram_user_id text,
  first_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Verify migration compiles**

Run:

```bash
npm run build --workspace=apps/backend
```

Expected: exit code `0`.

## Task 2: Auth Service Moves to Users

**Files:**
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/backend/src/auth/auth.controller.ts`
- Modify: `apps/backend/src/auth/jwt.strategy.ts`
- Modify: `apps/backend/src/auth/roles.guard.ts`

- [ ] **Step 1: Write failing auth tests**

Create tests proving:

- login reads from `users`.
- new register creates role `student`.
- reset code cannot be reused.

- [ ] **Step 2: Implement user login**

Change JWT payload to:

```ts
{
  sub: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
}
```

Return:

```ts
{
  access_token: token,
  user: { id, email, name, role, phone }
}
```

Keep `admin` alias in response temporarily so old frontend code does not break during the same deploy.

- [ ] **Step 3: Update request identity**

In JWT strategy return:

```ts
return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
```

In `JwtAuthGuard`, set both:

```ts
req.user = result;
req.admin = result;
```

- [ ] **Step 4: Role guard**

Accept roles `student`, `teacher`, `super`.

## Task 3: Teacher/Super Guards for Existing Admin Features

**Files:**
- Modify: `apps/backend/src/folders/folders.controller.ts`
- Modify: `apps/backend/src/tests/tests.controller.ts`
- Modify: `apps/backend/src/questions/questions.controller.ts`
- Modify: `apps/backend/src/submissions/submissions.controller.ts`
- Modify: `apps/backend/src/upload/upload.controller.ts`

- [ ] **Step 1: Protect content creation**

Apply:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
```

to folder/test/question/submission admin routes.

- [ ] **Step 2: Keep super management guarded**

Replace admin management with user management in Task 4, guarded by:

```ts
@Roles('super')
```

## Task 4: User Management for Super

**Files:**
- Rename or replace: `apps/backend/src/admins/*` with user-oriented service/controller
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/frontend/src/pages/AdminsPage.tsx`
- Modify: `apps/frontend/src/api/admins.ts`

- [ ] **Step 1: List users**

Super can list users without password hashes.

- [ ] **Step 2: Update role**

Super can set role to `student`, `teacher`, or `super`.

- [ ] **Step 3: Prevent self-demotion**

If the target user is the current super and role would no longer be `super`, reject with `400`.

## Task 5: Student Test History

**Files:**
- Modify: `apps/backend/src/submissions/submissions.service.ts`
- Modify: `apps/backend/src/submissions/submissions.controller.ts`
- Add: `apps/frontend/src/pages/StudentHistoryPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

- [ ] **Step 1: Link submission to user**

When a logged-in user starts a public test, backend stores `submissions.userId`.

- [ ] **Step 2: Add history endpoint**

Add:

```ts
GET /api/v1/me/submissions
```

Returns submitted tests for `req.user.id`.

- [ ] **Step 3: Student dashboard**

If role is `student`, `/` renders history instead of folders.

## Task 6: Public Test Start Prefill

**Files:**
- Modify: `apps/frontend/src/pages/TakeTestEntryPage.tsx`
- Modify: `apps/frontend/src/api/delivery.ts`
- Modify: `apps/backend/src/delivery/dto/start-submission.dto.ts`
- Modify: `apps/backend/src/delivery/delivery.controller.ts`
- Modify: `apps/backend/src/delivery/delivery.service.ts`

- [ ] **Step 1: Prefill name**

If `authStore.admin` or `authStore.user` exists, set name input to that name.

- [ ] **Step 2: Keep start button**

Do not auto-start. User still clicks `Testni boshlash`.

- [ ] **Step 3: Link logged-in user**

Public start request includes bearer token if present. Backend links `userId` only if token is valid; anonymous starts still work.

## Task 7: Telegram Bot Contact Linking

**Files:**
- Add: `apps/backend/src/telegram/telegram.module.ts`
- Add: `apps/backend/src/telegram/telegram.controller.ts`
- Add: `apps/backend/src/telegram/telegram.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `.env.production.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add env**

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
APP_URL=https://test.jamm.uz
```

- [ ] **Step 2: Webhook endpoint**

Add:

```ts
POST /api/v1/telegram/webhook
```

Validate secret header if configured.

- [ ] **Step 3: Handle `/start`**

Send message asking user to share contact.

- [ ] **Step 4: Handle contact**

Store phone to `user_telegram_links` with chat id.

## Task 8: Telegram Register and Reset

**Files:**
- Modify: `apps/backend/src/auth/auth.controller.ts`
- Modify: `apps/backend/src/auth/auth.service.ts`
- Modify: `apps/frontend/src/pages/LoginPage.tsx`
- Modify: `apps/frontend/src/api/auth.ts`

- [ ] **Step 1: Register request**

Endpoint:

```ts
POST /api/v1/auth/register/request
```

Input:

```ts
{ name: string; email: string; phone: string }
```

Creates code and sends via Telegram.

- [ ] **Step 2: Register verify**

Endpoint:

```ts
POST /api/v1/auth/register/verify
```

Input:

```ts
{ phone: string; code: string }
```

Creates student and sends generated login/password.

- [ ] **Step 3: Reset request**

Endpoint:

```ts
POST /api/v1/auth/password/reset/request
```

Input:

```ts
{ phoneOrEmail: string }
```

- [ ] **Step 4: Reset verify**

Endpoint:

```ts
POST /api/v1/auth/password/reset/verify
```

Input:

```ts
{ phoneOrEmail: string; code: string }
```

Generates new password and sends it through Telegram.

## Verification

Run:

```bash
npm run test --workspace=apps/backend
npm run build --workspace=apps/backend
npm run build --workspace=apps/frontend
```

Expected:

- backend tests pass
- backend build exits `0`
- frontend build exits `0`

Manual VPS checks:

```bash
sudo docker compose run --rm migrate
sudo docker compose up -d --build
```

Then verify:

- student can register through Telegram code.
- student sees test history on `/`.
- teacher can create tests.
- super can promote student to teacher.
- public test link prefills logged-in user name and waits for start click.
