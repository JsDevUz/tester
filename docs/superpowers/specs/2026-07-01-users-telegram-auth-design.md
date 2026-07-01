# Users and Telegram Auth Design

## Goal

Move the app from an admin-only model to a future-ready user platform with three roles:

- `student`: default role for every new registration.
- `teacher`: can create folders, tests, questions, and view submissions for owned tests.
- `super`: can manage users and promote/demote roles.

Telegram bot authentication is used for registration credentials and password reset codes.

## Data Model

Create a new `users` table and migrate existing `admins` into it. Keep existing ownership columns named `admin_id` for a small first migration, but point them to `users.id` in code. A later cleanup can rename `admin_id` to `owner_id`.

`users` fields:

- `id`
- `email`
- `username`
- `password_hash`
- `name`
- `role`: `student | teacher | super`
- `phone`
- `telegram_chat_id`
- `telegram_user_id`
- `created_at`

Create `auth_codes` for short-lived registration and password reset verification:

- `id`
- `phone`
- `telegram_chat_id`
- `purpose`: `register | reset`
- `code_hash`
- `expires_at`
- `used_at`
- `created_at`

Submissions get an optional `user_id`. Existing anonymous/public submissions continue to work. When a logged-in user starts a test, the frontend sends the current user's name and the backend links the submission to `user_id`.

## Backend Auth Flow

Existing email/password login remains. JWT payload changes from `admin` semantics to `user` semantics, but the request can expose both `req.user` and `req.admin` temporarily so current controllers can be migrated safely.

Registration flow:

1. User enters name, email, phone.
2. Backend creates a 6-digit code for the phone.
3. Telegram bot sends the code if phone is linked to a Telegram chat.
4. User submits the code.
5. Backend creates a `student` user and generates a random password.
6. Bot sends login/password to Telegram.

Password reset flow:

1. User enters phone or email.
2. Backend sends a one-time code to Telegram.
3. User submits code.
4. Backend generates a new random password and sends it through Telegram.

Telegram webhook:

- Endpoint: `/api/v1/telegram/webhook`
- Bot handles `/start` and contact sharing.
- Contact links `phone -> telegram_chat_id`.

## Frontend Flow

Login page gains:

- Register tab.
- Forgot password tab.
- Telegram bot instructions.

Role redirects:

- `student`: student dashboard with previous test history.
- `teacher`: existing dashboard.
- `super`: existing dashboard plus user management.

When a logged-in user opens a public test link, the name field is prefilled from profile and disabled or editable later. The user still clicks "Boshlash".

## Security

- Codes are stored hashed, expire quickly, and are single-use.
- Generated passwords are hashed in DB and only sent via Telegram once.
- Public registration always creates `student`, never `teacher`.
- Only `super` can change roles.

## Phasing

Phase 1 builds `users`, roles, student dashboard/history, and logged-in public test autofill.

Phase 2 adds Telegram bot registration and password reset.
