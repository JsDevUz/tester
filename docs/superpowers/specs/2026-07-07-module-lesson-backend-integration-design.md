# Modul va Dars Backend Integratsiyasi — Design Spec

## Maqsad

Course.title integratsiyasidan keyingi bosqich: `courseStore.ts`dagi
`modules`/`lessons` massivlarini haqiqiy backend'ga ulash. Faqat asosiy
maydonlar — `Module.title`/`orderIndex`, `Lesson.title`/`orderIndex`/`status`.
`Lesson.blocks`/`practiceBlocks`/`passThreshold*` hali frontend-only (mock)
qoladi.

## Scope

- Backend: `modules` va `lessons` jadvallari + ikkita NestJS moduli.
- Frontend: `apps/frontend/src/api/modules.ts`, `apps/frontend/src/api/lessons.ts`,
  `courseStore.ts`dagi modul/dars CRUD action'lari async bo'ladi.
- `loadCourses()` endi har bir kurs uchun modullarni va har bir modul uchun
  darslarni ham yuklaydi (kurs ro'yxati backend'dan kelganda ichki tarkib
  bo'sh qolmasligi uchun).
- Modul nomini tahrirlash UI'si `CourseContentPage.tsx`ga qo'shiladi (hozir
  yo'q edi — foydalanuvchi buni ham so'radi).
- **Scope'dan tashqari:** qayta tartiblash (move up/down) — mavjud UI'da
  ham yo'q, bu bosqichda ham qo'shilmaydi. `blocks`/`practiceBlocks`/
  `passThreshold*`/`launches`/`groups` — hammasi frontend-only qoladi.

## Ma'lumot modeli — `apps/backend/src/db/schema.ts`

`courses` jadvalidan keyin qo'shiladi:

```typescript
export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const modulesRelations = relations(modules, ({ one, many }) => ({
  course: one(courses, { fields: [modules.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
}));
```

`coursesRelations`ga `modules: many(modules)` qo'shiladi.

**Migration:** `npx drizzle-kit generate` orqali, keyin `psql`/`db:migrate`
bilan qo'llaniladi (avvalgi bosqichda ko'rilgan `__drizzle_migrations`
drift muammosiga ehtiyot bo'lish, generatsiya qilingan faylni ko'rib chiqib,
faqat shu ikki jadvalga tegishli statement'lar borligini tasdiqlash kerak).

## Egalik tekshiruvi

`modules`/`lessons` jadvalida `adminId` yo'q — egalik `courses.adminId`
orqali tekshiriladi. Har bir mutatsion amal avval kursning egasi ekanini
tasdiqlaydi:

```typescript
// ModulesService misoli
async create(courseId: string, adminId: string, title: string) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
  });
  if (!course) throw new NotFoundException('Course not found');
  const [module] = await db
    .insert(modules)
    .values({ courseId, title, orderIndex: /* hisoblanadi */ 0 })
    .returning();
  return module;
}
```

`orderIndex` yaratishda avtomatik hisoblanadi — mavjud modullar/darslar
sonini so'rab, shu sondan foydalaniladi (frontend'dagi
`module.lessons.length` pattern'iga o'xshash).

## Backend Modullari

**Papka nomlanishi:** NestJS'ning o'z "module" tushunchasi bilan
chalkashmasligi uchun `apps/backend/src/course-modules/` (Module) va
`apps/backend/src/lessons/` (Lesson) — ikkalasi ham `@Injectable`
service + `@Controller` + `@Module` uchlik pattern.

**`course-modules.service.ts`:**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class CourseModulesService {
  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.modules.findMany({
      where: eq(modules.courseId, courseId),
      orderBy: (m, { asc }) => [asc(m.orderIndex)],
    });
  }

  async create(courseId: string, adminId: string, title: string) {
    await this.assertCourseOwnership(courseId, adminId);
    const existing = await db.query.modules.findMany({ where: eq(modules.courseId, courseId) });
    const [module] = await db
      .insert(modules)
      .values({ courseId, title, orderIndex: existing.length })
      .returning();
    return module;
  }

  async update(id: string, adminId: string, title: string) {
    const [module] = await db
      .update(modules)
      .set({ title })
      .where(eq(modules.id, id))
      .returning();
    if (!module) throw new NotFoundException('Module not found');
    await this.assertCourseOwnership(module.courseId, adminId);
    return module;
  }

  async remove(id: string, adminId: string) {
    const module = await db.query.modules.findFirst({ where: eq(modules.id, id) });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertCourseOwnership(module.courseId, adminId);
    await db.delete(modules).where(eq(modules.id, id));
  }
}
```

**`course-modules.controller.ts`:**

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, MinLength } from 'class-validator';

class CreateModuleDto {
  @IsString() @MinLength(1) title: string;
}
class UpdateModuleDto {
  @IsString() @MinLength(1) title: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class CourseModulesController {
  constructor(private service: CourseModulesService) {}

  @Get('courses/:courseId/modules')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.service.findAll(courseId, req.admin.id);
  }

  @Post('courses/:courseId/modules')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateModuleDto) {
    return this.service.create(courseId, req.admin.id, dto.title);
  }

  @Patch('modules/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateModuleDto) {
    return this.service.update(id, req.admin.id, dto.title);
  }

  @Delete('modules/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.admin.id);
  }
}
```

**`lessons.service.ts`/`lessons.controller.ts`** — bir xil pattern, lekin
egalik zanjiri bir bosqich chuqurroq (`lesson → module → course → adminId`):

```typescript
// lessons.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class LessonsService {
  private async assertModuleOwnership(moduleId: string, adminId: string) {
    const module = await db.query.modules.findFirst({ where: eq(modules.id, moduleId) });
    if (!module) throw new NotFoundException('Module not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Module not found');
  }

  async findAll(moduleId: string, adminId: string) {
    await this.assertModuleOwnership(moduleId, adminId);
    return db.query.lessons.findMany({
      where: eq(lessons.moduleId, moduleId),
      orderBy: (l, { asc }) => [asc(l.orderIndex)],
    });
  }

  async create(moduleId: string, adminId: string, title: string) {
    await this.assertModuleOwnership(moduleId, adminId);
    const existing = await db.query.lessons.findMany({ where: eq(lessons.moduleId, moduleId) });
    const [lesson] = await db
      .insert(lessons)
      .values({ moduleId, title, orderIndex: existing.length })
      .returning();
    return lesson;
  }

  async update(id: string, adminId: string, data: { title?: string; status?: string }) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, id) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertModuleOwnership(lesson.moduleId, adminId);
    const [updated] = await db.update(lessons).set(data).where(eq(lessons.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, id) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertModuleOwnership(lesson.moduleId, adminId);
    await db.delete(lessons).where(eq(lessons.id, id));
  }
}
```

```typescript
// lessons.controller.ts
class CreateLessonDto {
  @IsString() @MinLength(1) title: string;
}
class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsIn(['draft', 'published']) status?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class LessonsController {
  constructor(private service: LessonsService) {}

  @Get('modules/:moduleId/lessons')
  findAll(@Param('moduleId') moduleId: string, @Req() req: any) {
    return this.service.findAll(moduleId, req.admin.id);
  }

  @Post('modules/:moduleId/lessons')
  create(@Param('moduleId') moduleId: string, @Req() req: any, @Body() dto: CreateLessonDto) {
    return this.service.create(moduleId, req.admin.id, dto.title);
  }

  @Patch('lessons/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateLessonDto) {
    return this.service.update(id, req.admin.id, dto);
  }

  @Delete('lessons/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.admin.id);
  }
}
```

`toggleLessonStatus` backend'da `update(id, adminId, { status })` orqali
amalga oshiriladi — frontend joriy holatni bilib, teskarisini yuboradi.

`apps/backend/src/app.module.ts`ga `CourseModulesModule` va `LessonsModule`
qo'shiladi.

## Frontend — API wrapper'lar

**`apps/frontend/src/api/modules.ts`:**

```typescript
import client from './client';

export interface ApiModule {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
}

export async function apiListModules(courseId: string): Promise<ApiModule[]> {
  const res = await client.get(`/courses/${courseId}/modules`);
  return res.data;
}
export async function apiCreateModule(courseId: string, title: string): Promise<ApiModule> {
  const res = await client.post(`/courses/${courseId}/modules`, { title });
  return res.data;
}
export async function apiRenameModule(id: string, title: string): Promise<ApiModule> {
  const res = await client.patch(`/modules/${id}`, { title });
  return res.data;
}
export async function apiDeleteModule(id: string): Promise<void> {
  await client.delete(`/modules/${id}`);
}
```

**`apps/frontend/src/api/lessons.ts`:**

```typescript
import client from './client';

export interface ApiLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
}

export async function apiListLessons(moduleId: string): Promise<ApiLesson[]> {
  const res = await client.get(`/modules/${moduleId}/lessons`);
  return res.data;
}
export async function apiCreateLesson(moduleId: string, title: string): Promise<ApiLesson> {
  const res = await client.post(`/modules/${moduleId}/lessons`, { title });
  return res.data;
}
export async function apiUpdateLesson(id: string, data: { title?: string; status?: string }): Promise<ApiLesson> {
  const res = await client.patch(`/lessons/${id}`, data);
  return res.data;
}
export async function apiDeleteLesson(id: string): Promise<void> {
  await client.delete(`/lessons/${id}`);
}
```

## Frontend — `courseStore.ts` o'zgarishi

`toFrontendCourse` endi modullarni to'ldirmasdan bo'sh qoldiradi (chunki
`loadCourses` bosqichma-bosqich yuklaydi — avval kurslar, keyin har bir
kurs uchun modullar, keyin har bir modul uchun darslar):

```typescript
loadCourses: async () => {
  const courseRows = await apiListCourses();
  const courses = await Promise.all(
    courseRows.map(async (courseRow) => {
      const moduleRows = await apiListModules(courseRow.id);
      const moduleList = await Promise.all(
        moduleRows.map(async (moduleRow) => {
          const lessonRows = await apiListLessons(moduleRow.id);
          return {
            id: moduleRow.id,
            title: moduleRow.title,
            orderIndex: moduleRow.orderIndex,
            lessons: lessonRows.map((l) => ({
              id: l.id, title: l.title, orderIndex: l.orderIndex, status: l.status,
              blocks: [], practiceEnabled: false, practiceBlocks: [],
              passThresholdEnabled: false, passThresholdPercent: null,
            })),
          };
        }),
      );
      return { id: courseRow.id, title: courseRow.title, modules: moduleList, launches: [], groups: [] };
    }),
  );
  set({ courses });
},
```

`addModule`/`renameModule`/`deleteModule`/`addLesson`/`renameLesson`/
`deleteLesson`/`toggleLessonStatus` — har biri mos API'ni chaqirib, muvaffaqiyatdan
keyin local state'ni yangilaydi (optimistic emas, avvalgi bosqich bilan bir xil
qoida). `addLesson`/`addModule` backend'dan qaytgan haqiqiy `id`ni ishlatadi
(frontend `newId()` o'rniga).

## Frontend — Modul nomini tahrirlash UI'si

`CourseContentPage.tsx`da hozir modul sarlavhasi oddiy `<span>` — bu
`renameCourse`/kurs nomi input pattern'iga o'xshab tahrirlanadigan
`<input>`ga almashtiriladi (`onChange` → `void renameModule(...)`, kurs
sozlamalaridagi nom input'i bilan bir xil uslub).

## Global Constraints

- Egalik `courses.adminId` orqali tekshiriladi — `modules`/`lessons`
  jadvalida `adminId` ustuni yo'q, har bir mutatsion so'rov ota-ona
  zanjiri orqali tekshiradi.
- Qayta tartiblash (move/reorder) bu bosqichda qo'shilmaydi.
- `blocks`/`practiceBlocks`/`passThreshold*`/`launches`/`groups` — hammasi
  frontend-only, backend jadvali yo'q.
- Backend papka nomlanishi: `apps/backend/src/course-modules/` (Module
  entity), `apps/backend/src/lessons/` (Lesson entity) — NestJS'ning o'z
  "module" atamasi bilan chalkashmaslik uchun.
- Build/test tekshiruvi AI tomonidan (`npm run build --workspace=apps/backend`,
  `npm test --workspace=apps/backend`, `npm run build --workspace=apps/frontend`),
  **manual browser QA foydalanuvchi tomonidan** amalga oshiriladi — plan'da
  bu alohida ko'rsatiladi, AI o'zi buni bajarishga urinmaydi.
