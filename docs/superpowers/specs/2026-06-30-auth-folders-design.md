# Auth + Folder System — Design Spec
**Date:** 2026-06-30  
**Subsystem:** 1 of 6 (Auth + Folder System)  
**Stack:** React + Vite + Tailwind + Zustand | NestJS + Drizzle + PostgreSQL  
**Deploy:** Frontend → Vercel, Backend + DB → VPS (nginx + pm2)

---

## 1. Overview

Multi-admin test platform. Each admin has a fully isolated workspace — folders and tests. Admins cannot see each other's data. A super admin manages other admins and has all the same isolation guarantees for their own content.

---

## 2. Architecture

```
apps/
  frontend/   # React + Vite + Tailwind + Zustand
  backend/    # NestJS + Drizzle + PostgreSQL
docs/
  superpowers/specs/
```

Monorepo, single git repository.

- **API style:** REST (`/api/v1/...`)
- **Auth:** JWT Bearer token, 1 day expiry, stored in localStorage
- **CORS:** Backend allows Vercel frontend origin

---

## 3. Data Models

```sql
admins
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  email         text UNIQUE NOT NULL
  password_hash text NOT NULL
  name          text NOT NULL
  role          text NOT NULL DEFAULT 'admin'  -- 'super' | 'admin'
  created_at    timestamptz DEFAULT now()

folders
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  admin_id      uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE
  name          text NOT NULL
  color         text DEFAULT '#6366f1'
  icon          text DEFAULT 'folder'
  created_at    timestamptz DEFAULT now()
```

All queries on `folders` are scoped by `admin_id` extracted from the JWT — no cross-admin data leakage possible at the query level.

---

## 4. Backend — NestJS Modules

### AuthModule
| Endpoint | Method | Access |
|----------|--------|--------|
| `/api/v1/auth/login` | POST | Public |
| `/api/v1/auth/me` | GET | JWT required |

- `login`: validates email/password, returns `{ access_token, admin }` 
- `me`: returns current admin info from token

### AdminsModule
| Endpoint | Method | Access |
|----------|--------|--------|
| `/api/v1/admins` | GET | Super admin only |
| `/api/v1/admins` | POST | Super admin only |
| `/api/v1/admins/:id` | DELETE | Super admin only |

- Super admin is seeded via `npm run seed` — creates first super admin from env vars
- Super admin creates other admins from the panel (plain password sent, hashed on backend with bcrypt)

### FoldersModule
| Endpoint | Method | Access |
|----------|--------|--------|
| `/api/v1/folders` | GET | JWT required |
| `/api/v1/folders` | POST | JWT required |
| `/api/v1/folders/:id` | PATCH | JWT required (own only) |
| `/api/v1/folders/:id` | DELETE | JWT required (own only) |

- All operations scoped to `admin_id` from JWT — no `admin_id` accepted from request body
- Single-level folders only (no parent_id)

### Guards
- `JwtGuard` — validates Bearer token, attaches admin to request
- `RolesGuard` — checks `role === 'super'` for super-admin routes

---

## 5. Frontend — Pages & Components

### Login Page (`/login`)
- Email + password form
- On success: stores JWT in localStorage, redirects to `/`
- On failure: shows error message

### Main Panel (`/`)
- **Toolbar:** Admin name (top left), Logout button (top right)
- **Folder grid:** macOS Finder style, icon + name cards
  - Double-click → navigate to `/folders/:id` (shows tests inside)
  - Right-click → context menu: Rename, Change Color, Delete
- **New Folder button:** opens modal with name + color picker

### Admins Page (`/admins`) — super admin only
- List of all admins (name, email, role, created date)
- "Add Admin" button → modal: name, email, password
- Delete button per admin (cannot delete self)

### Zustand Stores
```ts
authStore: { token, admin, login(), logout() }
folderStore: { folders, fetchFolders(), createFolder(), updateFolder(), deleteFolder() }
```

---

## 6. Deployment

### VPS Setup
- PostgreSQL running locally on VPS
- NestJS via pm2 (`pm2 start dist/main.js`)
- nginx reverse proxy → NestJS on port 3000
- `.env` file with DB connection string, JWT secret

### Vercel
- `apps/frontend` deployed as static site
- `VITE_API_URL` env var points to VPS domain

### Seed
```bash
cd apps/backend && npm run seed
# Creates super admin from SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD env vars
```

---

## 7. Out of Scope (this subsystem)

The following are handled in later subsystems:
- Test builder
- Test delivery (shareable links)
- Results & analytics
- Test settings (time, deadline, etc.)

---

## 8. Success Criteria

- Super admin can log in and see their own folder grid
- Regular admin logs in and sees only their own folders
- Super admin can add/remove other admins
- Folders CRUD works with correct isolation
- JWT expires after 1 day, user is redirected to login
