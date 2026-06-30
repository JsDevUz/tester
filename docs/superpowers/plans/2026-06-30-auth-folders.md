# Auth + Folder System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-admin test platform foundation with isolated workspaces, JWT auth, and macOS-style folder management.

**Architecture:** Monorepo with `apps/frontend` (React+Vite+Tailwind+Zustand) and `apps/backend` (NestJS+Drizzle+PostgreSQL). Each admin is fully isolated — all folder queries are scoped by `admin_id` extracted from JWT. Super admin is seeded via CLI, creates other admins from the panel.

**Tech Stack:** React 18, Vite, Tailwind CSS v3, Zustand, NestJS 10, Drizzle ORM, PostgreSQL 16, bcrypt, @nestjs/jwt, Vitest, supertest.

## Global Constraints

- Node.js >= 20
- All API routes prefixed with `/api/v1`
- JWT expiry: 1 day (`1d`)
- JWT stored in localStorage key `token`
- Passwords hashed with bcrypt, cost factor 10
- All folder queries MUST scope by `admin_id` from JWT — never from request body
- Single-level folders only (no parent_id)
- `role` field: `'super'` | `'admin'`
- Frontend env var: `VITE_API_URL` (no trailing slash)
- Backend runs on port 3000 in dev

---

## File Structure

```
apps/
  backend/
    src/
      auth/
        auth.module.ts
        auth.controller.ts
        auth.service.ts
        jwt.strategy.ts
        jwt-auth.guard.ts
        roles.guard.ts
        roles.decorator.ts
      admins/
        admins.module.ts
        admins.controller.ts
        admins.service.ts
      folders/
        folders.module.ts
        folders.controller.ts
        folders.service.ts
      db/
        schema.ts          # Drizzle table definitions
        index.ts           # db connection export
        migrate.ts         # run migrations
        seed.ts            # seed super admin
      app.module.ts
      main.ts
    drizzle/
      migrations/          # generated migration files
    drizzle.config.ts
    .env.example
    package.json
    tsconfig.json
  frontend/
    src/
      api/
        client.ts          # axios instance with auth header
        auth.ts            # login(), getMe()
        folders.ts         # CRUD folder API calls
        admins.ts          # admin CRUD API calls
      stores/
        authStore.ts       # Zustand: token, admin, login, logout
        folderStore.ts     # Zustand: folders, CRUD actions
      pages/
        LoginPage.tsx
        DashboardPage.tsx  # macOS-style folder grid
        AdminsPage.tsx     # super admin only
      components/
        FolderCard.tsx
        FolderContextMenu.tsx
        NewFolderModal.tsx
        AdminModal.tsx
        Toolbar.tsx
        PrivateRoute.tsx   # redirect to /login if no token
        SuperAdminRoute.tsx # redirect to / if not super
      App.tsx
      main.tsx
    index.html
    vite.config.ts
    tailwind.config.ts
    package.json
    tsconfig.json
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/src/main.ts`
- Create: `apps/backend/src/app.module.ts`
- Create: `apps/backend/drizzle.config.ts`
- Create: `apps/backend/.env.example`
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/tailwind.config.ts`
- Create: `apps/frontend/src/main.tsx`
- Create: `apps/frontend/src/App.tsx`

**Interfaces:**
- Produces: working `npm run dev` in both apps

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "test-platform",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:backend": "npm run dev --workspace=apps/backend",
    "dev:frontend": "npm run dev --workspace=apps/frontend"
  }
}
```

- [ ] **Step 2: Scaffold backend with NestJS CLI**

```bash
cd apps
npx @nestjs/cli new backend --package-manager npm --skip-git
cd backend
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt drizzle-orm postgres dotenv
npm install -D drizzle-kit @types/bcrypt @types/passport-jwt
```

- [ ] **Step 3: Create backend .env.example**

```
DATABASE_URL=postgresql://user:password@localhost:5432/testplatform
JWT_SECRET=change_me_to_a_long_random_string
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=changeme123
PORT=3000
```

Copy to `.env` and fill in real values:
```bash
cp apps/backend/.env.example apps/backend/.env
```

- [ ] **Step 4: Update backend src/main.ts**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || '*' });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 5: Scaffold frontend with Vite**

```bash
cd apps
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite zustand axios
npm install -D @types/node
```

- [ ] **Step 6: Configure Tailwind in vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
})
```

- [ ] **Step 7: Update frontend src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Replace frontend src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Verify both apps start**

```bash
# Terminal 1
cd apps/backend && npm run start:dev
# Expected: "Application is running on port 3000"

# Terminal 2
cd apps/frontend && npm run dev
# Expected: "Local: http://localhost:5173/"
```

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "chore: monorepo scaffold with NestJS backend and React frontend"
```

---

### Task 2: Database Schema + Migrations

**Files:**
- Create: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/src/db/index.ts`
- Create: `apps/backend/drizzle.config.ts`
- Create: `apps/backend/src/db/migrate.ts`

**Interfaces:**
- Produces: `db` (Drizzle instance), `admins` table, `folders` table
- Produces: `npm run db:migrate` command

- [ ] **Step 1: Create schema**

`apps/backend/src/db/schema.ts`:
```typescript
import { pgTable, text, uuid, timestamptz } from 'drizzle-orm/pg-core';

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamptz('created_at').defaultNow(),
});

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => admins.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon').notNull().default('folder'),
  createdAt: timestamptz('created_at').defaultNow(),
});
```

- [ ] **Step 2: Create db connection**

`apps/backend/src/db/index.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import 'dotenv/config';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: Create drizzle config**

`apps/backend/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

- [ ] **Step 4: Add db scripts to backend package.json**

Add to `scripts`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 5: Generate and run migration**

```bash
cd apps/backend
npm run db:generate
npm run db:migrate
```

Expected: migration files created in `drizzle/migrations/`, tables created in PostgreSQL.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/ apps/backend/drizzle/ apps/backend/drizzle.config.ts
git commit -m "feat: add database schema and drizzle migrations"
```

---

### Task 3: Seed Super Admin

**Files:**
- Create: `apps/backend/src/db/seed.ts`

**Interfaces:**
- Consumes: `db` from `../db/index`, `admins` table from `../db/schema`
- Produces: `npm run seed` creates super admin row in DB

- [ ] **Step 1: Create seed script**

`apps/backend/src/db/seed.ts`:
```typescript
import { db } from './index';
import { admins } from './schema';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

async function seed() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
  }

  const existing = await db.query.admins.findFirst({
    where: (a, { eq }) => eq(a.email, email),
  });

  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(admins).values({ email, passwordHash, name, role: 'super' });
  console.log(`Super admin created: ${email}`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add seed script to package.json**

Add to `scripts`:
```json
"seed": "ts-node -r tsconfig-paths/register src/db/seed.ts"
```

Install ts-node if not present:
```bash
cd apps/backend && npm install -D ts-node tsconfig-paths
```

- [ ] **Step 3: Run seed**

```bash
cd apps/backend && npm run seed
```

Expected output: `Super admin created: admin@example.com`

- [ ] **Step 4: Verify in DB**

```bash
psql $DATABASE_URL -c "SELECT id, email, role FROM admins;"
```

Expected: one row with `role = super`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/seed.ts apps/backend/package.json
git commit -m "feat: add super admin seed script"
```

---

### Task 4: Auth Module (Backend)

**Files:**
- Create: `apps/backend/src/auth/auth.module.ts`
- Create: `apps/backend/src/auth/auth.controller.ts`
- Create: `apps/backend/src/auth/auth.service.ts`
- Create: `apps/backend/src/auth/jwt.strategy.ts`
- Create: `apps/backend/src/auth/jwt-auth.guard.ts`
- Create: `apps/backend/src/auth/roles.guard.ts`
- Create: `apps/backend/src/auth/roles.decorator.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /api/v1/auth/login` → `{ access_token: string, admin: { id, email, name, role } }`
- Produces: `GET /api/v1/auth/me` → `{ id, email, name, role }`
- Produces: `JwtAuthGuard` — attach to any protected route
- Produces: `@Roles('super')` decorator + `RolesGuard` for super-admin routes
- Produces: `req.admin` = `{ id: string, email: string, name: string, role: string }` on authenticated requests

- [ ] **Step 1: Write failing e2e test**

`apps/backend/test/auth.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /api/v1/auth/login - success', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
    expect(res.body.admin.role).toBe('super');
  });

  it('POST /api/v1/auth/login - wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/auth/me - with token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    const token = loginRes.body.access_token;

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(process.env.SUPER_ADMIN_EMAIL);
  });

  it('GET /api/v1/auth/me - no token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=auth
```

Expected: FAIL — `AppModule` has no auth routes yet.

- [ ] **Step 3: Create roles decorator**

`apps/backend/src/auth/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 4: Create JWT strategy**

`apps/backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: { sub: string; email: string; name: string; role: string }) {
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
  }
}
```

- [ ] **Step 5: Create JWT auth guard**

`apps/backend/src/auth/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 6: Create roles guard**

`apps/backend/src/auth/roles.guard.ts`:
```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const { admin } = context.switchToHttp().getRequest();
    if (!roles.includes(admin?.role)) throw new ForbiddenException();
    return true;
  }
}
```

- [ ] **Step 7: Create auth service**

`apps/backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { admins } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const admin = await db.query.admins.findFirst({ where: eq(admins.email, email) });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });

    return {
      access_token: token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  }
}
```

- [ ] **Step 8: Create auth controller**

`apps/backend/src/auth/auth.controller.ts`:
```typescript
import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IsEmail, IsString, MinLength } from 'class-validator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.admin;
  }
}
```

- [ ] **Step 9: Create auth module**

`apps/backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import 'dotenv/config';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET!, signOptions: { expiresIn: '1d' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 10: Register in AppModule**

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule],
})
export class AppModule {}
```

- [ ] **Step 11: Run tests to verify they pass**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=auth
```

Expected: all 4 tests PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/auth/ apps/backend/src/app.module.ts apps/backend/test/auth.e2e-spec.ts
git commit -m "feat: add JWT auth module with login and me endpoints"
```

---

### Task 5: Admins Module (Backend)

**Files:**
- Create: `apps/backend/src/admins/admins.module.ts`
- Create: `apps/backend/src/admins/admins.controller.ts`
- Create: `apps/backend/src/admins/admins.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/admins.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard` from `../auth/jwt-auth.guard`, `RolesGuard` from `../auth/roles.guard`, `@Roles` from `../auth/roles.decorator`
- Produces: `GET /api/v1/admins` → `Array<{ id, email, name, role, createdAt }>` (super only)
- Produces: `POST /api/v1/admins` body `{ email, password, name }` → `{ id, email, name, role }` (super only)
- Produces: `DELETE /api/v1/admins/:id` → 204 (super only, cannot delete self)

- [ ] **Step 1: Write failing e2e test**

`apps/backend/test/admins.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Admins (e2e)', () => {
  let app: INestApplication;
  let superToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    superToken = res.body.access_token;
  });

  afterAll(() => app.close());

  it('GET /api/v1/admins - super admin sees list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/v1/admins - create admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'newadmin@test.com', password: 'pass1234', name: 'Test Admin' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('newadmin@test.com');
    expect(res.body.role).toBe('admin');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('DELETE /api/v1/admins/:id - delete admin', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admins')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'todelete@test.com', password: 'pass1234', name: 'To Delete' });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admins/${id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/admins - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admins');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=admins
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create admins service**

`apps/backend/src/admins/admins.service.ts`:
```typescript
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { db } from '../db';
import { admins } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminsService {
  async findAll() {
    return db.query.admins.findMany({
      columns: { passwordHash: false },
      orderBy: (a, { asc }) => [asc(a.createdAt)],
    });
  }

  async create(email: string, password: string, name: string) {
    const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);
    const [admin] = await db
      .insert(admins)
      .values({ email, passwordHash, name, role: 'admin' })
      .returning({ id: admins.id, email: admins.email, name: admins.name, role: admins.role });
    return admin;
  }

  async remove(id: string, requestingAdminId: string) {
    if (id === requestingAdminId) throw new BadRequestException('Cannot delete yourself');
    await db.delete(admins).where(eq(admins.id, id));
  }
}
```

- [ ] **Step 4: Create admins controller**

`apps/backend/src/admins/admins.controller.ts`:
```typescript
import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsEmail, IsString, MinLength } from 'class-validator';

class CreateAdminDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @MinLength(1) name: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super')
@Controller('admins')
export class AdminsController {
  constructor(private adminsService: AdminsService) {}

  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.adminsService.create(dto.email, dto.password, dto.name);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.adminsService.remove(id, req.admin.id);
  }
}
```

- [ ] **Step 5: Create admins module**

`apps/backend/src/admins/admins.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

@Module({
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
```

- [ ] **Step 6: Register in AppModule**

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule],
})
export class AppModule {}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=admins
```

Expected: all 4 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/admins/ apps/backend/src/app.module.ts apps/backend/test/admins.e2e-spec.ts
git commit -m "feat: add admins module with CRUD for super admin"
```

---

### Task 6: Folders Module (Backend)

**Files:**
- Create: `apps/backend/src/folders/folders.module.ts`
- Create: `apps/backend/src/folders/folders.controller.ts`
- Create: `apps/backend/src/folders/folders.service.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/test/folders.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `req.admin.id` (string UUID)
- Produces: `GET /api/v1/folders` → `Array<{ id, adminId, name, color, icon, createdAt }>`
- Produces: `POST /api/v1/folders` body `{ name, color?, icon? }` → folder object
- Produces: `PATCH /api/v1/folders/:id` body `{ name?, color?, icon? }` → folder object
- Produces: `DELETE /api/v1/folders/:id` → 204

- [ ] **Step 1: Write failing e2e test**

`apps/backend/test/folders.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Folders (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let folderId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    token = res.body.access_token;
  });

  afterAll(() => app.close());

  it('POST /api/v1/folders - create folder', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/folders')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Math Tests', color: '#ef4444' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Math Tests');
    expect(res.body.color).toBe('#ef4444');
    folderId = res.body.id;
  });

  it('GET /api/v1/folders - list only own folders', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/folders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((f: any) => f.name !== undefined)).toBe(true);
  });

  it('PATCH /api/v1/folders/:id - rename folder', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Science Tests' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Science Tests');
  });

  it('DELETE /api/v1/folders/:id', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/folders/${folderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('GET /api/v1/folders - no token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/folders');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=folders
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Create folders service**

`apps/backend/src/folders/folders.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { folders } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class FoldersService {
  findAll(adminId: string) {
    return db.query.folders.findMany({
      where: eq(folders.adminId, adminId),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
    });
  }

  async create(adminId: string, name: string, color?: string, icon?: string) {
    const [folder] = await db
      .insert(folders)
      .values({ adminId, name, color: color ?? '#6366f1', icon: icon ?? 'folder' })
      .returning();
    return folder;
  }

  async update(id: string, adminId: string, data: { name?: string; color?: string; icon?: string }) {
    const [folder] = await db
      .update(folders)
      .set(data)
      .where(and(eq(folders.id, id), eq(folders.adminId, adminId)))
      .returning();
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async remove(id: string, adminId: string) {
    const result = await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.adminId, adminId)))
      .returning({ id: folders.id });
    if (!result.length) throw new NotFoundException('Folder not found');
  }
}
```

- [ ] **Step 4: Create folders controller**

`apps/backend/src/folders/folders.controller.ts`:
```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateFolderDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

class UpdateFolderDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() icon?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('folders')
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.foldersService.findAll(req.admin.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateFolderDto) {
    return this.foldersService.create(req.admin.id, dto.name, dto.color, dto.icon);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateFolderDto) {
    return this.foldersService.update(id, req.admin.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.foldersService.remove(id, req.admin.id);
  }
}
```

- [ ] **Step 5: Create folders module**

`apps/backend/src/folders/folders.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
```

- [ ] **Step 6: Register in AppModule**

`apps/backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { FoldersModule } from './folders/folders.module';
import 'dotenv/config';

@Module({
  imports: [AuthModule, AdminsModule, FoldersModule],
})
export class AppModule {}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/backend && npm run test:e2e -- --testPathPattern=folders
```

Expected: all 5 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/folders/ apps/backend/src/app.module.ts apps/backend/test/folders.e2e-spec.ts
git commit -m "feat: add folders module with admin-scoped CRUD"
```

---

### Task 7: Frontend — API Client + Stores

**Files:**
- Create: `apps/frontend/src/api/client.ts`
- Create: `apps/frontend/src/api/auth.ts`
- Create: `apps/frontend/src/api/folders.ts`
- Create: `apps/frontend/src/api/admins.ts`
- Create: `apps/frontend/src/stores/authStore.ts`
- Create: `apps/frontend/src/stores/folderStore.ts`

**Interfaces:**
- Produces: `useAuthStore()` → `{ token, admin, login(email,password), logout() }`
- Produces: `useFolderStore()` → `{ folders, fetchFolders(), createFolder(name,color,icon), updateFolder(id,data), deleteFolder(id) }`
- Produces: `adminApi.list()`, `adminApi.create(email,password,name)`, `adminApi.remove(id)`

- [ ] **Step 1: Create API client**

`apps/frontend/src/api/client.ts`:
```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api/v1`,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
```

- [ ] **Step 2: Create auth API**

`apps/frontend/src/api/auth.ts`:
```typescript
import client from './client';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'super' | 'admin';
}

export async function apiLogin(email: string, password: string): Promise<{ access_token: string; admin: Admin }> {
  const res = await client.post('/auth/login', { email, password });
  return res.data;
}

export async function apiGetMe(): Promise<Admin> {
  const res = await client.get('/auth/me');
  return res.data;
}
```

- [ ] **Step 3: Create folders API**

`apps/frontend/src/api/folders.ts`:
```typescript
import client from './client';

export interface Folder {
  id: string;
  adminId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
}

export async function apiFetchFolders(): Promise<Folder[]> {
  const res = await client.get('/folders');
  return res.data;
}

export async function apiCreateFolder(name: string, color?: string, icon?: string): Promise<Folder> {
  const res = await client.post('/folders', { name, color, icon });
  return res.data;
}

export async function apiUpdateFolder(id: string, data: { name?: string; color?: string; icon?: string }): Promise<Folder> {
  const res = await client.patch(`/folders/${id}`, data);
  return res.data;
}

export async function apiDeleteFolder(id: string): Promise<void> {
  await client.delete(`/folders/${id}`);
}
```

- [ ] **Step 4: Create admins API**

`apps/frontend/src/api/admins.ts`:
```typescript
import client from './client';
import type { Admin } from './auth';

export async function apiListAdmins(): Promise<Admin[]> {
  const res = await client.get('/admins');
  return res.data;
}

export async function apiCreateAdmin(email: string, password: string, name: string): Promise<Admin> {
  const res = await client.post('/admins', { email, password, name });
  return res.data;
}

export async function apiDeleteAdmin(id: string): Promise<void> {
  await client.delete(`/admins/${id}`);
}
```

- [ ] **Step 5: Create auth store**

`apps/frontend/src/stores/authStore.ts`:
```typescript
import { create } from 'zustand';
import { apiLogin, type Admin } from '../api/auth';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  admin: null,
  login: async (email, password) => {
    const { access_token, admin } = await apiLogin(email, password);
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, admin: null });
  },
}));
```

- [ ] **Step 6: Create folder store**

`apps/frontend/src/stores/folderStore.ts`:
```typescript
import { create } from 'zustand';
import { apiFetchFolders, apiCreateFolder, apiUpdateFolder, apiDeleteFolder, type Folder } from '../api/folders';

interface FolderState {
  folders: Folder[];
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color?: string, icon?: string) => Promise<void>;
  updateFolder: (id: string, data: { name?: string; color?: string; icon?: string }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  fetchFolders: async () => {
    const folders = await apiFetchFolders();
    set({ folders });
  },
  createFolder: async (name, color, icon) => {
    const folder = await apiCreateFolder(name, color, icon);
    set({ folders: [...get().folders, folder] });
  },
  updateFolder: async (id, data) => {
    const updated = await apiUpdateFolder(id, data);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
  },
  deleteFolder: async (id) => {
    await apiDeleteFolder(id);
    set({ folders: get().folders.filter((f) => f.id !== id) });
  },
}));
```

- [ ] **Step 7: Add VITE_API_URL to frontend**

Create `apps/frontend/.env`:
```
VITE_API_URL=http://localhost:3000
```

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/api/ apps/frontend/src/stores/ apps/frontend/.env
git commit -m "feat: add frontend API client and Zustand stores"
```

---

### Task 8: Frontend — Pages & Components

**Files:**
- Create: `apps/frontend/src/components/PrivateRoute.tsx`
- Create: `apps/frontend/src/components/SuperAdminRoute.tsx`
- Create: `apps/frontend/src/components/Toolbar.tsx`
- Create: `apps/frontend/src/components/FolderCard.tsx`
- Create: `apps/frontend/src/components/FolderContextMenu.tsx`
- Create: `apps/frontend/src/components/NewFolderModal.tsx`
- Create: `apps/frontend/src/components/AdminModal.tsx`
- Create: `apps/frontend/src/pages/LoginPage.tsx`
- Create: `apps/frontend/src/pages/DashboardPage.tsx`
- Create: `apps/frontend/src/pages/AdminsPage.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useAuthStore()`, `useFolderStore()`, `apiListAdmins`, `apiCreateAdmin`, `apiDeleteAdmin`
- Produces: working UI at `/login`, `/`, `/admins`

- [ ] **Step 1: Install react-router-dom**

```bash
cd apps/frontend && npm install react-router-dom
```

- [ ] **Step 2: Create PrivateRoute**

`apps/frontend/src/components/PrivateRoute.tsx`:
```tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}
```

- [ ] **Step 3: Create SuperAdminRoute**

`apps/frontend/src/components/SuperAdminRoute.tsx`:
```tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const admin = useAuthStore((s) => s.admin);
  if (!admin) return <Navigate to="/login" replace />;
  if (admin.role !== 'super') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Create Toolbar**

`apps/frontend/src/components/Toolbar.tsx`:
```tsx
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function Toolbar() {
  const { admin, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-12 bg-white/80 backdrop-blur border-b border-gray-200 flex items-center justify-between px-4">
      <span className="font-medium text-gray-700">{admin?.name}</span>
      <div className="flex gap-2">
        {admin?.role === 'super' && (
          <button
            onClick={() => navigate('/admins')}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
          >
            Admins
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create FolderCard**

`apps/frontend/src/components/FolderCard.tsx`:
```tsx
import type { Folder } from '../api/folders';

interface Props {
  folder: Folder;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, onDoubleClick, onContextMenu }: Props) {
  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer hover:bg-white/60 active:bg-white/80 select-none w-24"
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-sm"
        style={{ backgroundColor: folder.color + '22', border: `2px solid ${folder.color}44` }}
      >
        <span style={{ color: folder.color }}>📁</span>
      </div>
      <span className="text-xs text-gray-700 text-center break-words w-full text-center leading-tight">
        {folder.name}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Create FolderContextMenu**

`apps/frontend/src/components/FolderContextMenu.tsx`:
```tsx
import { useEffect, useRef } from 'react';

interface Props {
  x: number;
  y: number;
  onRename: () => void;
  onChangeColor: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FolderContextMenu({ x, y, onRename, onChangeColor, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: y, left: x, zIndex: 1000 }}
      className="bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-36 text-sm"
    >
      <button onClick={onRename} className="w-full text-left px-4 py-1.5 hover:bg-gray-50">Rename</button>
      <button onClick={onChangeColor} className="w-full text-left px-4 py-1.5 hover:bg-gray-50">Change Color</button>
      <div className="border-t border-gray-100 my-1" />
      <button onClick={onDelete} className="w-full text-left px-4 py-1.5 hover:bg-gray-50 text-red-500">Delete</button>
    </div>
  );
}
```

- [ ] **Step 7: Create NewFolderModal**

`apps/frontend/src/components/NewFolderModal.tsx`:
```tsx
import { useState } from 'react';

const COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

interface Props {
  onSubmit: (name: string, color: string) => void;
  onClose: () => void;
  initial?: { name: string; color: string };
  title?: string;
}

export function NewFolderModal({ onSubmit, onClose, initial, title = 'New Folder' }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? '#6366f1');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), color);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h2 className="font-semibold text-gray-800 mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? '#000' : 'transparent' }}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
              {title === 'New Folder' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create AdminModal**

`apps/frontend/src/components/AdminModal.tsx`:
```tsx
import { useState } from 'react';

interface Props {
  onSubmit: (email: string, password: string, name: string) => void;
  onClose: () => void;
}

export function AdminModal({ onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) { setError('All fields required'); return; }
    onSubmit(email, password, name);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <h2 className="font-semibold text-gray-800 mb-4">Add Admin</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6)" type="password" className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2 justify-end mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create LoginPage**

`apps/frontend/src/pages/LoginPage.tsx`:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGetMe } from '../api/auth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const me = await apiGetMe();
      useAuthStore.setState({ admin: me });
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 mb-6 text-center">Admin Panel</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create DashboardPage**

`apps/frontend/src/pages/DashboardPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Toolbar } from '../components/Toolbar';
import { FolderCard } from '../components/FolderCard';
import { FolderContextMenu } from '../components/FolderContextMenu';
import { NewFolderModal } from '../components/NewFolderModal';
import { useFolderStore } from '../stores/folderStore';
import type { Folder } from '../api/folders';

export function DashboardPage() {
  const { folders, fetchFolders, createFolder, updateFolder, deleteFolder } = useFolderStore();
  const [showNewModal, setShowNewModal] = useState(false);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);

  useEffect(() => { fetchFolders(); }, []);

  function handleContextMenu(e: React.MouseEvent, folder: Folder) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, folder });
  }

  async function handleCreate(name: string, color: string) {
    await createFolder(name, color);
    setShowNewModal(false);
  }

  async function handleRename(name: string, color: string) {
    if (!editFolder) return;
    await updateFolder(editFolder.id, { name, color });
    setEditFolder(null);
  }

  async function handleDelete() {
    if (!menu) return;
    await deleteFolder(menu.folder.id);
    setMenu(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">My Folders</h2>
          <button
            onClick={() => setShowNewModal(true)}
            className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600"
          >
            + New Folder
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onDoubleClick={() => {/* future: navigate to folder tests */}}
              onContextMenu={(e) => handleContextMenu(e, folder)}
            />
          ))}
          {folders.length === 0 && (
            <p className="text-gray-400 text-sm mt-8 w-full text-center">No folders yet. Create one!</p>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewFolderModal onSubmit={handleCreate} onClose={() => setShowNewModal(false)} />
      )}
      {editFolder && (
        <NewFolderModal
          title="Rename Folder"
          initial={{ name: editFolder.name, color: editFolder.color }}
          onSubmit={handleRename}
          onClose={() => setEditFolder(null)}
        />
      )}
      {menu && (
        <FolderContextMenu
          x={menu.x}
          y={menu.y}
          onRename={() => { setEditFolder(menu.folder); setMenu(null); }}
          onChangeColor={() => { setEditFolder(menu.folder); setMenu(null); }}
          onDelete={handleDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 11: Create AdminsPage**

`apps/frontend/src/pages/AdminsPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { AdminModal } from '../components/AdminModal';
import { apiListAdmins, apiCreateAdmin, apiDeleteAdmin } from '../api/admins';
import { useAuthStore } from '../stores/authStore';
import type { Admin } from '../api/auth';

export function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showModal, setShowModal] = useState(false);
  const currentAdmin = useAuthStore((s) => s.admin);
  const navigate = useNavigate();

  async function load() {
    const list = await apiListAdmins();
    setAdmins(list);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(email: string, password: string, name: string) {
    await apiCreateAdmin(email, password, name);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this admin?')) return;
    await apiDeleteAdmin(id);
    load();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Admins</h2>
          </div>
          <button onClick={() => setShowModal(true)} className="text-sm bg-indigo-500 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-600">
            + Add Admin
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{admin.name}</p>
                <p className="text-xs text-gray-400">{admin.email} · {admin.role}</p>
              </div>
              {admin.id !== currentAdmin?.id && (
                <button onClick={() => handleDelete(admin.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {showModal && <AdminModal onSubmit={handleCreate} onClose={() => setShowModal(false)} />}
    </div>
  );
}
```

- [ ] **Step 12: Wire up App.tsx with routing**

`apps/frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminsPage } from './pages/AdminsPage';
import { PrivateRoute } from './components/PrivateRoute';
import { SuperAdminRoute } from './components/SuperAdminRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/admins" element={<SuperAdminRoute><AdminsPage /></SuperAdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 13: Verify frontend builds and runs**

```bash
cd apps/frontend && npm run dev
```

Open http://localhost:5173 — should show login page. Login with super admin credentials — should show folder grid.

- [ ] **Step 14: Commit**

```bash
git add apps/frontend/src/
git commit -m "feat: add frontend pages and components (login, dashboard, admins)"
```

---

### Task 9: Production Readiness

**Files:**
- Create: `apps/backend/ecosystem.config.js`
- Create: `nginx.conf.example`

**Interfaces:**
- Produces: VPS deployment instructions

- [ ] **Step 1: Create pm2 ecosystem config**

`apps/backend/ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'test-platform-api',
    script: 'dist/main.js',
    env: { NODE_ENV: 'production' },
    env_file: '.env',
  }],
};
```

- [ ] **Step 2: Create nginx config example**

`nginx.conf.example`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 3: Add build script notes to backend package.json**

Ensure these exist in `scripts`:
```json
"build": "nest build",
"start:prod": "node dist/main.js"
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/ecosystem.config.js nginx.conf.example
git commit -m "chore: add VPS deployment configs for pm2 and nginx"
```
