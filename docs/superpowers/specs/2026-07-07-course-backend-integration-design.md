# Kurs (Course) Backend Integratsiyasi — Design Spec

## Maqsad

Frontend'dagi `courseStore.ts` (zustand, hozircha to'liq frontend-only/mock)
kurs darajasini haqiqiy backend API'ga ulash — birinchi bosqich. Modullar,
darslar, tariflar, guruhlar hali frontend-only (mock) qoladi; faqat kurs
(`Course.title`) yaratish/ro'yxatlash/nomlash/o'chirish backend orqali ishlaydi.

## Scope

- Backend: yangi `courses` moduli (`apps/backend/src/courses/`) — `folders`
  moduli bilan bir xil pattern (auth, egalik, CRUD).
- Backend: `courses` jadvali (`id`, `adminId`, `title`, `createdAt`) —
  `folders` bilan bir xil ustunlar, modullar/darslar hali jadval sifatida
  yo'q.
- Frontend: `apps/frontend/src/api/courses.ts` yangi fayl.
- Frontend: `courseStore.ts`dagi `addCourse`/`renameCourse`/`deleteCourse`
  async bo'ladi, `loadCourses()` yangi action qo'shiladi.
- Frontend: `CourseGrid.tsx` (addCourse chaqiruvchisi) va
  `CourseSettingsPage.tsx` (renameCourse/deleteCourse chaqiruvchisi) —
  async chaqiruvlarga moslashtiriladi.
- **Scope'dan tashqari:** modules/lessons/blocks/practiceBlocks/launches/
  groups — bularning barchasi `Course` obyekti ichida frontend-only
  (mock/runtime) bo'lib qoladi, backend'da ularga mos jadval yo'q.

## Ma'lumot modeli — `apps/backend/src/db/schema.ts`

`folders` jadvalidan keyin qo'shiladi:

```typescript
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const coursesRelations = relations(courses, ({ one }) => ({
  owner: one(users, { fields: [courses.adminId], references: [users.id] }),
}));
```

`usersRelations`ga (`folders: many(folders), tests: many(tests)` qatoridan
keyin) `courses: many(courses)` qo'shiladi.

**Migration:** `npx drizzle-kit generate` orqali (`apps/backend/drizzle.config.ts`
mavjud konfiguratsiyasi bilan) yangi SQL migration fayli generatsiya qilinadi,
so'ng loyihaning mavjud migration-qo'llash usuli (`npm run db:migrate` yoki
to'g'ridan-to'g'ri `psql` orqali, ilgari shu loyihada ikkalasi ham
qo'llanilgan) bilan bazaga qo'llaniladi.

## Backend Modul — `apps/backend/src/courses/`

Loyihada Drizzle instansiyasi `import { db } from '../db'` (to'g'ridan-to'g'ri
singleton eksport, dependency-injection emas) orqali ishlatiladi — bu
`folders.service.ts`da tasdiqlangan real pattern, spec shunga amal qiladi
(oldingi loyihada muhokama qilingan `@Inject(DRIZZLE)` shakli emas).

**`courses.service.ts`** (`folders.service.ts` bilan bir xil struktura,
lekin `testCount` kabi qo'shimcha hisoblash yo'q — hozircha modul/dars
soni backend'da mavjud emas):

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class CoursesService {
  async findAll(adminId: string) {
    return db.query.courses.findMany({
      where: eq(courses.adminId, adminId),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    });
  }

  async create(adminId: string, title: string) {
    const [course] = await db
      .insert(courses)
      .values({ adminId, title })
      .returning();
    return course;
  }

  async update(id: string, adminId: string, title: string) {
    const [course] = await db
      .update(courses)
      .set({ title })
      .where(and(eq(courses.id, id), eq(courses.adminId, adminId)))
      .returning();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async remove(id: string, adminId: string) {
    const result = await db
      .delete(courses)
      .where(and(eq(courses.id, id), eq(courses.adminId, adminId)))
      .returning({ id: courses.id });
    if (!result.length) throw new NotFoundException('Course not found');
  }
}
```

**`courses.controller.ts`** (`folders.controller.ts` bilan bir xil auth/DTO
pattern, `name` o'rniga `title`):

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, MinLength } from 'class-validator';

class CreateCourseDto {
  @IsString() @MinLength(1) title: string;
}

class UpdateCourseDto {
  @IsString() @MinLength(1) title: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.coursesService.findAll(req.admin.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(req.admin.id, dto.title);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, req.admin.id, dto.title);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.coursesService.remove(id, req.admin.id);
  }
}
```

**`courses.module.ts`** (`folders.module.ts` nusxasi):

```typescript
import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
```

`apps/backend/src/app.module.ts`ga `CoursesModule` import qilinadi (mavjud
`FoldersModule`/`TestsModule` qatoriga).

**Auth/huquq:** `@Roles('teacher', 'super')` — `folders`/`tests` bilan bir
xil, faqat teacher/super rolidagi adminlar kirishi mumkin. Egalik: har bir
so'rov `req.admin.id` orqali filtrlaydi — boshqa adminning kursini o'qib/
o'zgartirib/o'chirib bo'lmaydi (`update`/`remove`da `and(eq(id), eq(adminId))`
sharti).

## Frontend — `apps/frontend/src/api/courses.ts`

```typescript
import client from './client';

export interface ApiCourse {
  id: string;
  adminId: string;
  title: string;
  createdAt: string;
}

export async function apiListCourses(): Promise<ApiCourse[]> {
  const res = await client.get('/courses');
  return res.data;
}

export async function apiCreateCourse(title: string): Promise<ApiCourse> {
  const res = await client.post('/courses', { title });
  return res.data;
}

export async function apiRenameCourse(id: string, title: string): Promise<ApiCourse> {
  const res = await client.patch(`/courses/${id}`, { title });
  return res.data;
}

export async function apiDeleteCourse(id: string): Promise<void> {
  await client.delete(`/courses/${id}`);
}
```

## Frontend — `courseStore.ts` o'zgarishi

`Course` interfeysi o'zgarmaydi (`{ id, title, modules, launches, groups }`),
lekin uni to'ldirish manbai endi backend. Har bir backend'dan kelgan
`ApiCourse` frontend'da quyidagicha `Course`ga aylantiriladi:

```typescript
function toFrontendCourse(apiCourse: ApiCourse): Course {
  return { id: apiCourse.id, title: apiCourse.title, modules: [], launches: [], groups: [] };
}
```

**Yangi action — `loadCourses`:**

```typescript
loadCourses: async () => {
  const rows = await apiListCourses();
  set({ courses: rows.map(toFrontendCourse) });
},
```

**O'zgargan action'lar** (signatura `void`/`Course`dan `Promise<Course | undefined>`
yoki `Promise<void>`ga o'zgaradi):

```typescript
addCourse: async (title) => {
  const row = await apiCreateCourse(title);
  const course = toFrontendCourse(row);
  set({ courses: [...get().courses, course] });
  return course;
},
renameCourse: async (courseId, title) => {
  await apiRenameCourse(courseId, title);
  set({
    courses: get().courses.map((c) => (c.id === courseId ? { ...c, title } : c)),
  });
},
deleteCourse: async (courseId) => {
  await apiDeleteCourse(courseId);
  set({ courses: get().courses.filter((c) => c.id !== courseId) });
},
```

Xato holati (masalan tarmoq xatosi) uchun bu bosqichda maxsus error-UI
qo'shilmaydi — `await` reject qilsa, promise chaqiruvchi joyda ushlanmagan
holda qoladi (konsolga xato chiqadi), state o'zgarmaydi. Bu YAGNI qarori —
keyingi bosqichda kerak bo'lsa error-toast qo'shiladi.

**Muhim:** bu o'zgarish state'ni endi faqat `POST`/`PATCH`/`DELETE`
muvaffaqiyatli bo'lgandan **keyin** yangilaydi (optimistic update emas) —
oddiylik uchun tanlangan qaror, brainstormingda tasdiqlangan.

## Chaqiruvchi joylar (frontend)

Ikkita fayl `addCourse`/`renameCourse`/`deleteCourse`ni chaqiradi, ular endi
`await` qo'shishi kerak:

**`apps/frontend/src/components/course/CourseGrid.tsx:15`:**

```typescript
const course = addCourse(title);
```

Bunga o'zgaradi (chaqiruvchi funksiya `async` bo'ladi):

```typescript
const course = await addCourse(title);
```

**`apps/frontend/src/components/course/CourseSettingsPage.tsx:26`
(`deleteCourse`) va `:49` (`renameCourse`):**

- `deleteCourse(courseId)` → `await deleteCourse(courseId)` (o'rab turgan
  `handleConfirmDelete` funksiyasi `async` bo'ladi).
- `renameCourse(courseId, ...)` — `onChange` ichida chaqirilgani uchun
  `await` qilish shart emas (fire-and-forget input handler'da odatiy
  amaliyot — foydalanuvchi terish davomida har bir tugma bosilishida
  promise'ni kutish kerak emas), lekin `void renameCourse(...)` deb
  belgilash tavsiya etiladi (TypeScript "unhandled promise" ogohlantirishini
  bostirish uchun, agar linter shunday sozlangan bo'lsa).

## Yuklash nuqtasi (`loadCourses` qayerda chaqiriladi)

`apps/frontend/src/pages/CoursesPage.tsx`da, komponent mount bo'lganda:

```typescript
useEffect(() => {
  loadCourses();
}, []);
```

`state.view === 'list'` bo'lganda ko'rsatiladigan `CourseGrid` shu
`CoursesPage`ning bolasi, shuning uchun bitta joyda yuklash yetarli — har
safar `/lessons`ga kirilganda kurslar ro'yxati backend'dan yangilanadi.

## Global Constraints

- Backend auth/huquq pattern `folders`/`tests` bilan bir xil:
  `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('teacher', 'super')`,
  egalik `adminId` orqali tekshiriladi.
- Drizzle instansiyasi `import { db } from '../db'` orqali ishlatiladi
  (loyihaning haqiqiy mavjud pattern'i, DI-based emas).
- Yangi backend fayllar: `apps/backend/src/courses/courses.module.ts`,
  `courses.controller.ts`, `courses.service.ts`.
- Yangi frontend fayl: `apps/frontend/src/api/courses.ts`.
- `modules`/`launches`/`groups` — `Course` obyekti ichida hali frontend-only,
  backend jadvali yo'q, bu spec doirasida ham qo'shilmaydi.
- Optimistic update yo'q — barcha CRUD amallari serverdan javob
  qaytgandan keyin local state'ni yangilaydi.
- Build tekshiruvi: backend uchun `npm run build --workspace=apps/backend`
  (agar mavjud bo'lsa) yoki `tsc` orqali, frontend uchun
  `npm run build --workspace=apps/frontend`, ikkalasi ham xatosiz o'tishi
  kerak. Backend uchun mavjud jest test suite (`npm test --workspace=apps/backend`)
  ham davom etib o'tishi kerak (mavjud 91+ testga yangi buzilish
  qo'shilmasligi).
