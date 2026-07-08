# Lesson Content Blocks (Editor) + Backblaze B2 Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Lesson content-block "editor" type to the real backend (a new `content_blocks` Drizzle table + NestJS CRUD module), and replace the current disk-based file upload (`apps/backend/src/upload/`) with Backblaze B2 object storage so no uploaded file ever touches the server's own disk.

**Architecture:** A new `content_blocks` table mirrors the `modules`/`lessons` ownership pattern — no `adminId` column, ownership verified by walking `lesson → module → course.adminId`. Only `type: 'editor'` blocks are created/updated through the new API in this phase; `video`/`image`/`file` blocks stay frontend-only exactly as before. Separately, `apps/backend/src/upload/` is replaced by `apps/backend/src/storage/`, built around a `StorageService` adapted from a sibling project's Backblaze B2 (S3-compatible) integration, using `multer.memoryStorage()` so files are buffered in RAM and streamed directly to B2 — never written to disk. The frontend's `EditorBlock.tsx` gets its `onChange` debounced (~1.5s) before it PATCHes the backend, with an immediate flush on unmount/collapse so no edit is lost.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, `@aws-sdk/client-s3` (new dependency), `multer` (already present via `@nestjs/platform-express`), React 19, TypeScript, zustand, BlockNote editor.

## Global Constraints

- `content_blocks` has no `adminId` column — every mutating/reading query verifies ownership via `assertLessonOwnership(lessonId, adminId)`, which joins `lesson → module.courseId → course.adminId` (a helper local to `ContentBlocksService`, same shape as `LessonsService`'s `assertModuleOwnership`).
- Only `type: 'editor'` is accepted by the backend `create()` endpoint in this phase — any other `type` value in the request body throws `BadRequestException`. `video`/`image`/`file` blocks remain entirely frontend-only (no backend row), exactly as they are today.
- `CONTENT_BLOCK_LIMIT = 7` is enforced server-side too: `create()` throws `BadRequestException` if the lesson already has 7 blocks.
- `orderIndex` is set at creation from existing sibling count; changed only via the dedicated `POST /lessons/:lessonId/blocks/reorder` endpoint (no drag-and-drop, matches the existing up/down-arrow UI).
- No file is ever written to the backend server's local disk. `apps/backend/src/upload/` (which used `diskStorage`) is deleted entirely and replaced by `apps/backend/src/storage/`, which uses `multer.memoryStorage()` and streams the in-memory buffer straight to Backblaze B2 via `@aws-sdk/client-s3`.
- Object storage folder convention: uploads from the lesson editor use B2 folder `lessons/`; uploads from question/test forms use B2 folder `questions/` (existing default, unchanged). The `/upload` endpoint accepts an optional `folder` field in the multipart body; unknown/missing values fall back to `'questions'`.
- Backend Drizzle access convention: `import { db } from '../db'` module-level singleton, no dependency injection.
- No optimistic updates — local zustand state updates only after the corresponding HTTP call resolves.
- `EditorBlock.tsx`'s `onChange` is debounced ~1.5 seconds before calling the store's `updateBlock`; the debounce is flushed immediately when the component unmounts or the block is collapsed, so no edit is silently dropped.
- Manual browser QA is explicitly left to the human — every task's verification step is limited to `npm run build`/`npm test` commands.
- Backend build/test (currently 96 passing tests) must stay green; frontend build must pass.

---

### Task 1: Add `content_blocks` table to Drizzle schema + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0015_<generated-name>.sql`

**Interfaces:**
- Produces: `contentBlocks` table (`id`, `lessonId` FK → `lessons.id` cascade, `type` default `'editor'`, `orderIndex` default 0, `html`, `fileName`, `previewUrl`, `embedUrl`, `label`, `createdAt`), `contentBlocksRelations` (one `lesson`). `lessonsRelations` gains `blocks: many(contentBlocks)`. Consumed by Task 2 (`content-blocks.service.ts`).

- [ ] **Step 1: Add the table and relations to schema.ts**

In `apps/backend/src/db/schema.ts`, add this block immediately after the `lessons`/`lessonsRelations` definitions:

```typescript
export const contentBlocks = pgTable('content_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('editor'),
  orderIndex: integer('order_index').notNull().default(0),
  html: text('html'),
  fileName: text('file_name'),
  previewUrl: text('preview_url'),
  embedUrl: text('embed_url'),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const contentBlocksRelations = relations(contentBlocks, ({ one }) => ({
  lesson: one(lessons, { fields: [contentBlocks.lessonId], references: [lessons.id] }),
}));
```

Then find the existing `lessonsRelations` block:

```typescript
export const lessonsRelations = relations(lessons, ({ one }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
}));
```

Replace it with:

```typescript
export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
  blocks: many(contentBlocks),
}));
```

- [ ] **Step 2: Generate the migration**

```bash
cd apps/backend && npx drizzle-kit generate
```

Expected: a new file at `apps/backend/drizzle/migrations/0015_<auto-generated-name>.sql`.

- [ ] **Step 3: Inspect the generated migration for unrelated bundled statements**

This project has a known history of `drizzle-kit generate` bundling unrelated, already-applied statements into new migration files (happened with migrations 0013 and was checked again for 0014). Read the full generated `0015_*.sql` file:

```bash
cat apps/backend/drizzle/migrations/0015_*.sql
```

Expected: it should contain ONLY `CREATE TABLE "content_blocks" (...)` and its `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statement — nothing referencing any other table. If it contains any unrelated statement, remove it (and its `--> statement-breakpoint` marker) before applying.

- [ ] **Step 4: Apply the migration to the local database**

```bash
cd apps/backend && npm run db:migrate
```

If this fails or silently no-ops (known `__drizzle_migrations` tracking drift from prior phases), verify and apply manually:

```bash
psql "$DATABASE_URL" -c "\d content_blocks"
```

If the table is missing, apply the (corrected, per Step 3) migration SQL directly:

```bash
psql "$DATABASE_URL" -f apps/backend/drizzle/migrations/0015_<name>.sql
```

Expected: `\d content_blocks` shows the correct columns and foreign key.

- [ ] **Step 5: Verify backend build and tests still pass**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/
git commit -m "feat(content-blocks): add content_blocks table to schema + migration

- content_blocks: id, lessonId (FK lessons, cascade), type (default
  'editor'), orderIndex, html, fileName, previewUrl, embedUrl, label,
  createdAt
- lessonsRelations gains blocks: many(contentBlocks)
- no adminId column — ownership checked via join up to
  courses.adminId in the service layer (Task 2)
- schema supports all 4 block types (editor/video/image/file) for
  future-proofing, though only 'editor' is wired to the API this phase"
```

---

### Task 2: `content-blocks` NestJS module (editor-only CRUD + reorder)

**Files:**
- Create: `apps/backend/src/content-blocks/content-blocks.service.ts`
- Create: `apps/backend/src/content-blocks/content-blocks.controller.ts`
- Create: `apps/backend/src/content-blocks/content-blocks.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `contentBlocks`, `lessons`, `modules`, `courses` tables from Task 1 and the prior Module/Lesson phase.
- Produces: `GET /lessons/:lessonId/blocks`, `POST /lessons/:lessonId/blocks` (body `{ type: 'editor' }`), `PATCH /blocks/:id` (body `{ html?: string; label?: string }`), `DELETE /blocks/:id`, `POST /lessons/:lessonId/blocks/reorder` (body `{ blockIds: string[] }`) — all guarded by `JwtAuthGuard` + `RolesGuard` (`teacher`, `super`). Consumed by Task 4's `apps/frontend/src/api/contentBlocks.ts`.

- [ ] **Step 1: Create the service**

Create `apps/backend/src/content-blocks/content-blocks.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, contentBlocks } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

const CONTENT_BLOCK_LIMIT = 7;

@Injectable()
export class ContentBlocksService {
  private async assertLessonOwnership(lessonId: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
  }

  async findAll(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    return db.query.contentBlocks.findMany({
      where: eq(contentBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });
  }

  async create(lessonId: string, adminId: string, type: string) {
    if (type !== 'editor') {
      throw new BadRequestException('Only editor blocks can be created via this endpoint');
    }
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }
    const [block] = await db
      .insert(contentBlocks)
      .values({ lessonId, type: 'editor', orderIndex: existing.length, html: '' })
      .returning();
    return block;
  }

  async update(id: string, adminId: string, data: { html?: string; label?: string }) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id) });
    if (!block) throw new NotFoundException('Block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    const [updated] = await db.update(contentBlocks).set(data).where(eq(contentBlocks.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id) });
    if (!block) throw new NotFoundException('Block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    await db.delete(contentBlocks).where(eq(contentBlocks.id, id));
  }

  async reorder(lessonId: string, adminId: string, blockIds: string[]) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({
      where: and(eq(contentBlocks.lessonId, lessonId), inArray(contentBlocks.id, blockIds)),
    });
    if (existing.length !== blockIds.length) {
      throw new BadRequestException('blockIds must match the lesson\'s existing blocks');
    }
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(contentBlocks).set({ orderIndex: i }).where(eq(contentBlocks.id, blockIds[i]));
    }
  }
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/content-blocks/content-blocks.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ContentBlocksService } from './content-blocks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

class CreateBlockDto {
  @IsIn(['editor']) type: string;
}

class UpdateBlockDto {
  @IsOptional() @IsString() html?: string;
  @IsOptional() @IsString() @MinLength(0) label?: string;
}

class ReorderBlocksDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blockIds: string[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class ContentBlocksController {
  constructor(private contentBlocksService: ContentBlocksService) {}

  @Get('lessons/:lessonId/blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.contentBlocksService.findAll(lessonId, req.admin.id);
  }

  @Post('lessons/:lessonId/blocks')
  create(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: CreateBlockDto) {
    return this.contentBlocksService.create(lessonId, req.admin.id, dto.type);
  }

  @Patch('blocks/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateBlockDto) {
    return this.contentBlocksService.update(id, req.admin.id, dto);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.contentBlocksService.remove(id, req.admin.id);
  }

  @Post('lessons/:lessonId/blocks/reorder')
  @HttpCode(204)
  reorder(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: ReorderBlocksDto) {
    return this.contentBlocksService.reorder(lessonId, req.admin.id, dto.blockIds);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/backend/src/content-blocks/content-blocks.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ContentBlocksController } from './content-blocks.controller';
import { ContentBlocksService } from './content-blocks.service';

@Module({
  controllers: [ContentBlocksController],
  providers: [ContentBlocksService],
})
export class ContentBlocksModule {}
```

- [ ] **Step 4: Register the module in app.module.ts**

In `apps/backend/src/app.module.ts`, add the import after the `LessonsModule` import:

```typescript
import { ContentBlocksModule } from './content-blocks/content-blocks.module';
```

Add `ContentBlocksModule` to the `imports` array, immediately after `LessonsModule`.

- [ ] **Step 5: Build and test verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all 96 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/content-blocks/ apps/backend/src/app.module.ts
git commit -m "feat(content-blocks): add content-blocks NestJS module (editor-only CRUD + reorder)

- GET/POST /lessons/:lessonId/blocks, PATCH/DELETE /blocks/:id,
  POST /lessons/:lessonId/blocks/reorder
- create() only accepts type: 'editor' — video/image/file rejected
  with BadRequestException, stay frontend-only this phase
- CONTENT_BLOCK_LIMIT (7) enforced server-side on create()
- ownership verified by joining block -> lesson -> module -> courses.adminId
- registered in AppModule as ContentBlocksModule"
```

---

### Task 3: Backblaze B2 storage — `StorageService` + rewritten upload endpoint

**Files:**
- Create: `apps/backend/src/storage/storage.service.ts`
- Create: `apps/backend/src/storage/storage.module.ts`
- Modify: `apps/backend/src/upload/upload.controller.ts` (rewritten in place; folder is NOT renamed, to minimize import-path churn elsewhere)
- Modify: `apps/backend/src/upload/upload.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/package.json` (add `@aws-sdk/client-s3`)
- Modify: `apps/backend/.env.example` (if present) or note required env vars

**Interfaces:**
- Produces: `StorageService.uploadFile(file: Express.Multer.File, folder: string): Promise<string>` (returns a public URL), `StorageService.deleteFile(key: string): Promise<boolean>`. Rewritten `POST /upload` accepts multipart `file` + optional `folder` field, returns `{ url: string; type: 'image' | 'audio' }` (unchanged response shape). Consumed by Task 5's `apiUploadMedia` change and existing `QuestionForm.tsx`/`EditorBlock.tsx` callers (no signature change needed at the axios-wrapper call site level beyond an optional new param).

- [ ] **Step 1: Add the `@aws-sdk/client-s3` dependency**

```bash
cd apps/backend && npm install @aws-sdk/client-s3
```

Expected: `apps/backend/package.json`'s `dependencies` gains `"@aws-sdk/client-s3": "^3.x.x"` (whatever version npm resolves), and `package-lock.json` at the repo root updates accordingly.

- [ ] **Step 2: Create the StorageService**

Create `apps/backend/src/storage/storage.service.ts`:

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private publicDomain: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.normalizeEndpoint(this.configService.get<string>('OBJECT_STORAGE_ENDPOINT') || '');
    this.bucketName = this.configService.get<string>('OBJECT_STORAGE_BUCKET_NAME') || '';
    this.publicDomain = (this.configService.get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL') || '').replace(/\/+$/, '');

    this.s3Client = new S3Client({
      region: this.configService.get<string>('OBJECT_STORAGE_REGION') || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.configService.get<string>('OBJECT_STORAGE_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  private normalizeEndpoint(value: string): string {
    const raw = value.trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
    return `https://${raw.replace(/\/+$/, '')}`;
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${crypto.randomUUID()}.${ext}`;
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return this.publicDomain ? `${this.publicDomain}/${key}` : key;
    } catch (error) {
      console.error('Object storage upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    const cleanKey =
      this.publicDomain && key.startsWith(this.publicDomain) ? key.slice(this.publicDomain.length + 1) : key;
    if (!cleanKey) return false;
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: cleanKey }));
      return true;
    } catch (error) {
      console.error('Object storage delete error:', error);
      return false;
    }
  }
}
```

Note: `crypto.randomUUID()` is available globally in Node 20+ (this project's `engines.node` requires `>=20`), so no `uuid` package dependency is needed.

- [ ] **Step 3: Create the storage module**

Create `apps/backend/src/storage/storage.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 4: Rewrite the upload controller to use memory storage + StorageService**

Replace the full contents of `apps/backend/src/upload/upload.controller.ts` with:

```typescript
import {
  Controller, Post, UseInterceptors, UploadedFile, Body,
  BadRequestException, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from '../storage/storage.service';

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_FOLDERS = ['lessons', 'questions'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('upload')
export class UploadController {
  constructor(private storageService: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if ([...ALLOWED_IMAGE, ...ALLOWED_AUDIO].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Faqat rasm yoki audio fayllar qabul qilinadi'), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('folder') folder?: string) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const targetFolder = ALLOWED_FOLDERS.includes(folder || '') ? (folder as string) : 'questions';
    const ext = extname(file.originalname).toLowerCase();
    const type = ALLOWED_IMAGE.includes(ext) ? 'image' : 'audio';
    const url = await this.storageService.uploadFile(file, targetFolder);
    return { url, type };
  }
}
```

This fully replaces the previous `diskStorage`-based implementation — no file ever touches the server's local filesystem; `file.buffer` (populated by `memoryStorage()`) is handed directly to `StorageService.uploadFile`, which streams it to Backblaze B2.

- [ ] **Step 5: Update the upload module to import StorageModule**

Replace the full contents of `apps/backend/src/upload/upload.module.ts` with:

```typescript
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [UploadController],
})
export class UploadModule {}
```

- [ ] **Step 6: Remove the now-unused local uploads directory reference**

The old controller created `apps/backend/uploads/` on startup via `mkdirSync`. That logic no longer exists in the rewritten controller (Step 4), so no new files will be written there. Do not delete the existing `apps/backend/uploads/` directory or its contents — leave it as-is; it's simply no longer written to going forward. (Do not add `.gitignore` changes or attempt cleanup — out of scope.)

- [ ] **Step 7: Document the required environment variables**

Check whether `apps/backend/.env.example` exists:

```bash
ls apps/backend/.env.example apps/backend/.env 2>/dev/null
```

If `apps/backend/.env.example` exists, add these lines to it (if not already present):

```
OBJECT_STORAGE_ENDPOINT=s3.us-east-005.backblazeb2.com
OBJECT_STORAGE_REGION=us-east-005
OBJECT_STORAGE_ACCESS_KEY_ID=replace-with-b2-key-id
OBJECT_STORAGE_SECRET_ACCESS_KEY=replace-with-b2-application-key
OBJECT_STORAGE_BUCKET_NAME=replace-with-bucket-name
OBJECT_STORAGE_PUBLIC_BASE_URL=replace-with-public-cdn-or-b2-url
```

If no `.env.example` file exists in `apps/backend/`, skip this step — do not create a new top-level file outside the plan's scope. Note in the task report whether the file existed and was updated.

- [ ] **Step 8: Build verification**

```bash
npm run build --workspace=apps/backend
```

Expected: passes with zero errors. Note: `npm test --workspace=apps/backend` will very likely still pass unchanged, since no existing test exercises `/upload` (confirm this assumption by running the tests too):

```bash
npm test --workspace=apps/backend
```

Expected: all 96 existing tests still pass (no test currently covers the upload endpoint, consistent with the rest of this codebase's simple-CRUD-modules-have-no-spec-file convention).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/storage/ apps/backend/src/upload/ apps/backend/src/app.module.ts apps/backend/package.json apps/backend/package-lock.json apps/backend/.env.example 2>/dev/null
git add -u apps/backend/package-lock.json 2>/dev/null
git commit -m "feat(storage): replace disk-based upload with Backblaze B2 object storage

- StorageService wraps @aws-sdk/client-s3 against B2's S3-compatible
  endpoint, adapted from a sibling project's r2.service.ts
  (HLS/streaming-specific logic dropped — not needed here)
- UploadController rewritten: multer memoryStorage() instead of
  diskStorage() — files are buffered in RAM and streamed straight to
  B2, never written to the server's local disk
- /upload now accepts an optional 'folder' field ('lessons' or
  'questions'); unknown/missing values default to 'questions'
  (preserves existing behavior for callers that don't pass it)
- response shape unchanged: { url, type }"
```

Note: `app.module.ts` in this task only needs a change if `StorageModule` must be globally registered — it is not, since `UploadModule` imports it directly. Skip modifying `app.module.ts` in this task unless the build fails without it (it should not, since `UploadModule` already appears in `app.module.ts` from before this plan and now transitively imports `StorageModule`).

---

### Task 4: Frontend API wrapper — `apps/frontend/src/api/contentBlocks.ts` + `apiUploadMedia` folder param

**Files:**
- Create: `apps/frontend/src/api/contentBlocks.ts`
- Modify: `apps/frontend/src/api/questions.ts`

**Interfaces:**
- Consumes: `client` default export from `apps/frontend/src/api/client.ts`.
- Produces: `ApiContentBlock` interface, `apiListBlocks(lessonId)`, `apiCreateBlock(lessonId, type)`, `apiUpdateBlock(id, data)`, `apiDeleteBlock(id)`, `apiReorderBlocks(lessonId, blockIds)`. Also updates `apiUploadMedia` to accept an optional `folder` parameter. Consumed by Task 6's `courseStore.ts` changes and Task 7's `EditorBlock.tsx` change.

- [ ] **Step 1: Create the content-blocks API wrapper**

Create `apps/frontend/src/api/contentBlocks.ts`:

```typescript
import client from './client';

export interface ApiContentBlock {
  id: string;
  lessonId: string;
  type: 'editor' | 'video' | 'image' | 'file';
  orderIndex: number;
  html: string | null;
  fileName: string | null;
  previewUrl: string | null;
  embedUrl: string | null;
  label: string | null;
  createdAt: string;
}

export async function apiListBlocks(lessonId: string): Promise<ApiContentBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/blocks`);
  return res.data;
}

export async function apiCreateBlock(lessonId: string, type: 'editor'): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks`, { type });
  return res.data;
}

export async function apiUpdateBlock(
  id: string,
  data: { html?: string; label?: string },
): Promise<ApiContentBlock> {
  const res = await client.patch(`/blocks/${id}`, data);
  return res.data;
}

export async function apiDeleteBlock(id: string): Promise<void> {
  await client.delete(`/blocks/${id}`);
}

export async function apiReorderBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/blocks/reorder`, { blockIds });
}
```

- [ ] **Step 2: Update `apiUploadMedia` to accept an optional folder**

In `apps/frontend/src/api/questions.ts`, find:

```typescript
export async function apiUploadMedia(file: File): Promise<{ url: string; type: 'image' | 'audio' }> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}
```

Replace with:

```typescript
export async function apiUploadMedia(
  file: File,
  folder: 'lessons' | 'questions' = 'questions',
): Promise<{ url: string; type: 'image' | 'audio' }> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await client.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}
```

This is backward compatible: every existing call site (`QuestionForm.tsx`) that calls `apiUploadMedia(file)` with one argument keeps working unchanged, defaulting to `'questions'`.

- [ ] **Step 3: Build verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: passes with zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/contentBlocks.ts apps/frontend/src/api/questions.ts
git commit -m "feat(content-blocks): add frontend API wrapper + folder param for uploads

- apiListBlocks/apiCreateBlock/apiUpdateBlock/apiDeleteBlock/apiReorderBlocks
- apiUploadMedia gains an optional 'folder' param ('lessons'|'questions'),
  defaulting to 'questions' so existing call sites are unaffected
- not yet consumed by courseStore or EditorBlock (Tasks 6-7)"
```

---

### Task 5: Make `courseStore.ts`'s block actions async for `type: 'editor'`

**Files:**
- Modify: `apps/frontend/src/stores/courseStore.ts`

**Interfaces:**
- Consumes: `apiListBlocks`, `apiCreateBlock`, `apiUpdateBlock`, `apiDeleteBlock`, `apiReorderBlocks` from Task 4.
- Produces: rewritten `loadCourses` (adds a `blocks` fetch per lesson), `addBlock(courseId, moduleId, lessonId, block): Promise<void>` (was sync `void`), `updateBlock(courseId, moduleId, lessonId, blockId, data): Promise<void>` (was sync), `removeBlock(courseId, moduleId, lessonId, blockId): Promise<void>` (was sync), `moveBlock(courseId, moduleId, lessonId, blockId, direction): Promise<void>` (was sync). Consumed by Task 7 (`LessonEditorView.tsx`, `EditorBlock.tsx`).

- [ ] **Step 1: Add the import**

In `apps/frontend/src/stores/courseStore.ts`, find:

```typescript
import { apiListLessons, apiCreateLesson, apiUpdateLesson, apiDeleteLesson } from '../api/lessons';
```

Add immediately after it:

```typescript
import { apiListBlocks, apiCreateBlock, apiUpdateBlock, apiDeleteBlock, apiReorderBlocks } from '../api/contentBlocks';
```

- [ ] **Step 2: Update the `CourseState` interface's block signatures**

Find:

```typescript
  addBlock: (courseId: string, moduleId: string, lessonId: string, block: ContentBlock) => void;
  updateBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, data: Partial<ContentBlock>) => void;
  removeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => void;
  moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => void;
```

Replace with:

```typescript
  addBlock: (courseId: string, moduleId: string, lessonId: string, block: ContentBlock) => Promise<void>;
  updateBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, data: Partial<ContentBlock>) => Promise<void>;
  removeBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string) => Promise<void>;
  moveBlock: (courseId: string, moduleId: string, lessonId: string, blockId: string, direction: 'up' | 'down') => Promise<void>;
```

- [ ] **Step 3: Extend `loadCourses` to fetch blocks per lesson**

Find the lesson-mapping block inside `loadCourses` (from the prior Module/Lesson phase):

```typescript
        const moduleList: Module[] = await Promise.all(
          moduleRows.map(async (moduleRow) => {
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = lessonRows.map((l) => ({
              id: l.id,
              title: l.title,
              orderIndex: l.orderIndex,
              status: l.status,
              blocks: [],
              practiceEnabled: false,
              practiceBlocks: [],
              passThresholdEnabled: false,
              passThresholdPercent: null,
            }));
            return { id: moduleRow.id, title: moduleRow.title, orderIndex: moduleRow.orderIndex, lessons: lessonList };
          }),
        );
```

Replace with:

```typescript
        const moduleList: Module[] = await Promise.all(
          moduleRows.map(async (moduleRow) => {
            const lessonRows = await apiListLessons(moduleRow.id);
            const lessonList: Lesson[] = await Promise.all(
              lessonRows.map(async (l) => {
                const blockRows = await apiListBlocks(l.id);
                const blocks: ContentBlock[] = blockRows.map((b) => ({
                  id: b.id,
                  type: b.type,
                  html: b.html ?? undefined,
                  fileName: b.fileName ?? undefined,
                  previewUrl: b.previewUrl ?? undefined,
                  embedUrl: b.embedUrl ?? undefined,
                  label: b.label ?? undefined,
                }));
                return {
                  id: l.id,
                  title: l.title,
                  orderIndex: l.orderIndex,
                  status: l.status,
                  blocks,
                  practiceEnabled: false,
                  practiceBlocks: [],
                  passThresholdEnabled: false,
                  passThresholdPercent: null,
                };
              }),
            );
            return { id: moduleRow.id, title: moduleRow.title, orderIndex: moduleRow.orderIndex, lessons: lessonList };
          }),
        );
```

Since only `type: 'editor'` blocks are ever created server-side in this phase, `apiListBlocks` will only ever return editor blocks — this cascade is correct and future-proof for when video/image/file blocks are added server-side later.

- [ ] **Step 4: Rewrite the four block actions**

Find:

```typescript
  addBlock: (courseId, moduleId, lessonId, block) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId || l.blocks.length >= CONTENT_BLOCK_LIMIT
                          ? l
                          : { ...l, blocks: [...l.blocks, block] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  updateBlock: (courseId, moduleId, lessonId, blockId, data) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              blocks: l.blocks.map((b) => (b.id === blockId ? { ...b, ...data } : b)),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeBlock: (courseId, moduleId, lessonId, blockId) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, blocks: l.blocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  moveBlock: (courseId, moduleId, lessonId, blockId, direction) => {
    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) => {
                        if (l.id !== lessonId) return l;
                        const index = l.blocks.findIndex((b) => b.id === blockId);
                        const swapWith = direction === 'up' ? index - 1 : index + 1;
                        if (index === -1 || swapWith < 0 || swapWith >= l.blocks.length) return l;
                        const blocks = [...l.blocks];
                        [blocks[index], blocks[swapWith]] = [blocks[swapWith], blocks[index]];
                        return { ...l, blocks };
                      }),
                    },
              ),
            },
      ),
    });
  },
```

Replace with:

```typescript
  addBlock: async (courseId, moduleId, lessonId, block) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson || lesson.blocks.length >= CONTENT_BLOCK_LIMIT) return;

    let newBlock = block;
    if (block.type === 'editor') {
      const row = await apiCreateBlock(lessonId, 'editor');
      newBlock = {
        id: row.id,
        type: row.type,
        html: row.html ?? '',
        fileName: row.fileName ?? undefined,
        previewUrl: row.previewUrl ?? undefined,
        embedUrl: row.embedUrl ?? undefined,
        label: row.label ?? undefined,
      };
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId || l.blocks.length >= CONTENT_BLOCK_LIMIT
                          ? l
                          : { ...l, blocks: [...l.blocks, newBlock] },
                      ),
                    },
              ),
            },
      ),
    });
  },
  updateBlock: async (courseId, moduleId, lessonId, blockId, data) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);

    if (block?.type === 'editor') {
      await apiUpdateBlock(blockId, { html: data.html, label: data.label });
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : {
                              ...l,
                              blocks: l.blocks.map((b) => (b.id === blockId ? { ...b, ...data } : b)),
                            },
                      ),
                    },
              ),
            },
      ),
    });
  },
  removeBlock: async (courseId, moduleId, lessonId, blockId) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    const block = lesson?.blocks.find((b) => b.id === blockId);

    if (block?.type === 'editor') {
      await apiDeleteBlock(blockId);
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId
                          ? l
                          : { ...l, blocks: l.blocks.filter((b) => b.id !== blockId) },
                      ),
                    },
              ),
            },
      ),
    });
  },
  moveBlock: async (courseId, moduleId, lessonId, blockId, direction) => {
    const course = get().courses.find((c) => c.id === courseId);
    const module = course?.modules.find((m) => m.id === moduleId);
    const lesson = module?.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;

    const index = lesson.blocks.findIndex((b) => b.id === blockId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= lesson.blocks.length) return;

    const reordered = [...lesson.blocks];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

    const editorBlockIds = reordered.filter((b) => b.type === 'editor').map((b) => b.id);
    if (editorBlockIds.length > 0) {
      await apiReorderBlocks(lessonId, editorBlockIds);
    }

    set({
      courses: get().courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              modules: c.modules.map((m) =>
                m.id !== moduleId
                  ? m
                  : {
                      ...m,
                      lessons: m.lessons.map((l) =>
                        l.id !== lessonId ? l : { ...l, blocks: reordered },
                      ),
                    },
              ),
            },
      ),
    });
  },
```

Note on `moveBlock`: it computes `editorBlockIds` as only the editor-typed blocks in their new relative order and sends that subset to `apiReorderBlocks` — this is correct today because only editor blocks exist server-side, and it stays correct later when video/image/file blocks are added server-side (each type's reorder call would similarly filter to its own persisted subset, though that's out of scope for this phase).

- [ ] **Step 5: Build verification (expect errors confined to two known files)**

```bash
npm run build --workspace=apps/frontend 2>&1 | grep -A2 "error TS"
```

Expected: TypeScript errors, if any, confined to `apps/frontend/src/components/course/LessonEditorView.tsx` and/or `apps/frontend/src/components/course/EditorBlock.tsx` — both call these block actions synchronously today. This is expected; Task 7 fixes those call sites. Confirm any errors are confined to those files and reflect only the sync/async mismatch, not a logic bug in `courseStore.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/stores/courseStore.ts
git commit -m "feat(content-blocks): make block actions async for type: 'editor'

- loadCourses now also cascades blocks per lesson via apiListBlocks
- addBlock/updateBlock/removeBlock branch on block.type: 'editor'
  blocks call the real API (apiCreateBlock/apiUpdateBlock/apiDeleteBlock),
  other types keep the prior frontend-only behavior unchanged
- moveBlock computes the new order client-side, then persists only the
  editor-typed blocks' order via apiReorderBlocks (the only type with
  a backend row this phase)
- local state updates only after the server call resolves (no
  optimistic updates)
- build intentionally may show errors in LessonEditorView.tsx/
  EditorBlock.tsx until Task 7 updates those call sites"
```

---

### Task 6: Debounce `EditorBlock.tsx`'s `onChange` + fix call sites

**Files:**
- Modify: `apps/frontend/src/components/course/EditorBlock.tsx`
- Modify: `apps/frontend/src/components/course/LessonEditorView.tsx`
- Modify: `apps/frontend/src/api/questions.ts` is NOT touched here (already done in Task 4) — `EditorBlock.tsx`'s `uploadFile` call is updated in this task to pass `'lessons'`.

**Interfaces:**
- Consumes: the now-async `addBlock`, `updateBlock`, `removeBlock`, `moveBlock` from Task 5's `courseStore.ts`; `apiUploadMedia(file, folder)` from Task 4.

- [ ] **Step 1: Update `EditorBlock.tsx`'s upload call to use the `lessons` folder**

In `apps/frontend/src/components/course/EditorBlock.tsx`, find:

```typescript
async function uploadFile(file: File) {
  const { url } = await apiUploadMedia(file);
  return url.startsWith('http') ? url : `${BACKEND}${url}`;
}
```

Replace with:

```typescript
async function uploadFile(file: File) {
  const { url } = await apiUploadMedia(file, 'lessons');
  return url.startsWith('http') ? url : `${BACKEND}${url}`;
}
```

- [ ] **Step 2: Debounce the `onChange` handler with unmount-flush**

In `apps/frontend/src/components/course/EditorBlock.tsx`, find:

```typescript
export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const editor = useCreateBlockNote({ schema, uploadFile });
  const [ready, setReady] = useState(false);
  const initialHtmlRef = useRef(html);

  // Boshlang'ich HTML'ni bir marta BlockNote bloklariga aylantiramiz.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialHtmlRef.current) {
        const blocks = await editor.tryParseHTMLToBlocks(initialHtmlRef.current);
        if (!cancelled && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [editor]);

  async function handleChange() {
    if (!ready) return;
    const exported = await editor.blocksToFullHTML(editor.document);
    onChange(exported);
  }

  return (
    <div className="course-editor rounded-2xl bg-white py-2">
      <BlockNoteView editor={editor} onChange={handleChange} theme="light" />
    </div>
  );
}
```

Replace with:

```typescript
const DEBOUNCE_MS = 1500;

export function EditorBlock({ html, onChange }: EditorBlockProps) {
  const editor = useCreateBlockNote({ schema, uploadFile });
  const [ready, setReady] = useState(false);
  const initialHtmlRef = useRef(html);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHtmlRef = useRef<string | null>(null);

  // Boshlang'ich HTML'ni bir marta BlockNote bloklariga aylantiramiz.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialHtmlRef.current) {
        const blocks = await editor.tryParseHTMLToBlocks(initialHtmlRef.current);
        if (!cancelled && blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [editor]);

  // Component yopilganda (unmount) kutilayotgan o'zgarishni darhol yuboramiz,
  // aks holda so'nggi tahrirlar debounce oynasi ichida yo'qolib ketishi mumkin.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        if (pendingHtmlRef.current !== null) {
          onChangeRef.current(pendingHtmlRef.current);
        }
      }
    };
  }, []);

  async function handleChange() {
    if (!ready) return;
    const exported = await editor.blocksToFullHTML(editor.document);
    pendingHtmlRef.current = exported;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (pendingHtmlRef.current !== null) {
        onChangeRef.current(pendingHtmlRef.current);
        pendingHtmlRef.current = null;
      }
      debounceTimerRef.current = null;
    }, DEBOUNCE_MS);
  }

  return (
    <div className="course-editor rounded-2xl bg-white py-2">
      <BlockNoteView editor={editor} onChange={handleChange} theme="light" />
    </div>
  );
}
```

- [ ] **Step 3: Verify `LessonEditorView.tsx`'s block-related call sites are already `void`/async-safe**

Read the current content of `apps/frontend/src/components/course/LessonEditorView.tsx` and check each of these call sites:

- `addBlock(courseId, moduleId, lessonId, block)` (inside `handlePickEditor` and `handlePickFile`)
- `updateBlock(courseId, moduleId, lessonId, blockId, { html })` / `{ embedUrl }` / `{ label }` (inside `handleChangeBlockHtml`, `handleChangeBlockEmbedUrl`, `handleChangeBlockLabel`)
- `updateBlock(courseId, moduleId, lessonId, blockId, { fileName, previewUrl })` (inside `handleBlockPickFile`)
- `removeBlock(courseId, moduleId, lessonId, block.id)` (inline in the `ContentBlockView`'s `onRemove` prop)
- `moveBlock(courseId, moduleId, lessonId, block.id, "up" | "down")` (inline in the `ContentBlockView`'s `onMoveUp`/`onMoveDown` props)

Since these functions are now async (returning `Promise<void>`) per Task 5, and none of these call sites currently `await` or `void` them, update each bare call — e.g.:

```typescript
  function handleChangeBlockHtml(blockId: string, html: string) {
    updateBlock(courseId, moduleId, lessonId, blockId, { html });
  }
```

becomes:

```typescript
  function handleChangeBlockHtml(blockId: string, html: string) {
    void updateBlock(courseId, moduleId, lessonId, blockId, { html });
  }
```

Apply the same `void` prefix to `handleChangeBlockEmbedUrl`, `handleChangeBlockLabel`, `handleBlockPickFile`, `handlePickEditor`'s `addBlock(...)` call, `handlePickFile`'s `addBlock(...)` call, and the inline `onRemove={() => removeBlock(...)}` / `onMoveUp={() => moveBlock(...)}` / `onMoveDown={() => moveBlock(...)}` props (prefix each arrow function body with `void`, e.g. `onRemove={() => void removeBlock(courseId, moduleId, lessonId, block.id)}`).

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/course/EditorBlock.tsx apps/frontend/src/components/course/LessonEditorView.tsx
git commit -m "fix(content-blocks): debounce editor onChange, await async block actions

- EditorBlock: onChange is debounced ~1.5s before calling the parent's
  onChange (which now triggers an API PATCH via courseStore); an
  unmount effect flushes any pending change immediately so no edit
  made just before navigating away is lost
- EditorBlock: image uploads now pass folder: 'lessons' to
  apiUploadMedia, landing in B2's lessons/ folder instead of the
  default questions/ folder
- LessonEditorView: all addBlock/updateBlock/removeBlock/moveBlock
  call sites use void, matching their new async signatures
- build fully green"
```

---

### Task 7: Final verification

**Files:**
- Verify only (no new files).

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Full backend verification**

```bash
npm run build --workspace=apps/backend
npm test --workspace=apps/backend
```

Expected: build succeeds, all tests pass (96 from before this plan — this plan adds no new backend tests, consistent with the existing convention of not writing spec files for simple CRUD modules in this codebase).

- [ ] **Step 2: Full frontend verification**

```bash
npm run build --workspace=apps/frontend
```

Expected: `tsc -b && vite build` completes with zero errors, only the pre-existing >500kB chunk-size advisory.

- [ ] **Step 3: Confirm no remaining disk-write path for uploads**

```bash
grep -rn "diskStorage" apps/backend/src/
```

Expected: no output — `diskStorage` should no longer appear anywhere in `apps/backend/src/` after Task 3's rewrite (only `memoryStorage` should remain in `upload.controller.ts`).

- [ ] **Step 4: Do NOT attempt manual browser QA**

This plan's Global Constraints explicitly reserve manual browser QA (creating an editor block, typing content, confirming it persists across a refresh, uploading an image inside the editor and confirming it appears via a B2 URL, reordering blocks, deleting a block) for the human. Do not start a dev server, do not attempt to log in, do not simulate a browser session. Limit this task's verification to the build/test/grep commands above.

- [ ] **Step 5: Document any findings**

If any build/test step doesn't behave as expected, note exactly which step and what was observed.

- [ ] **Step 6: Optional fix commit**

```bash
git add -A
git commit -m "fix(content-blocks): address final verification findings"
```

Skip this step if no issues were found.
