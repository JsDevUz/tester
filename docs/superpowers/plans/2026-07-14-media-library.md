# Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-teacher media library so that images/audio uploaded through the generic `/upload` endpoint are deduped by content hash and reusable via a picker modal, starting with the question-image/audio picker (`QuestionForm.tsx`) and the lesson rich-text editor's image insertion (`EditorBlock.tsx`).

**Architecture:** A new `media` table records every file that passes through the existing S3-backed `/upload` endpoint, keyed by a SHA-256 hash of its bytes scoped per `adminId` (the `users.id` that owns the content — confirmed as the actual JWT `sub` target, matching `courses.adminId`/`folders.adminId`). The upload endpoint computes the hash before calling `StorageService.uploadFile`; if a row with that `(adminId, hash)` already exists, it skips the S3 PUT entirely and returns the existing URL. A new `GET /media` endpoint lists an admin's files filtered by type, backing a new `MediaLibraryModal` frontend component. `QuestionForm.tsx`'s existing "Rasm"/"Audio" buttons open the modal instead of clicking the hidden `<input type=file>` directly; a "Yangi fayl yuklash" button inside the modal falls through to the native picker. For `EditorBlock.tsx`, BlockNote's `filePanel` prop (available in the installed `@blocknote/react@0.51.4`) is overridden to inject a "Kutubxonadan tanlash" tab alongside the default Upload tab.

**Tech Stack:** NestJS (Drizzle ORM, Postgres), Node's built-in `crypto` for SHA-256, existing `StorageService` (S3-compatible), React + `@blocknote/react` `FilePanelController`/`ComponentsContext`.

## Global Constraints

- FK target for any new `adminId` column: `users.id` (NOT `admins.id` — confirmed the JWT `sub`/`req.admin.id` at runtime is always a `users.id` row; `admins` table is unused by the login/JWT code path).
- Only image and audio uploads (the generic `/upload` endpoint's scope) are in scope for this plan. Video blocks (`videos.controller.ts`) and document/file blocks (`content-blocks.controller.ts`) are explicitly out of scope — do not modify them.
- Only `QuestionForm.tsx` (question image/audio) and `EditorBlock.tsx` (lesson body image) get the library UI wired in. `PracticeScreen.tsx` (student homework submission) and `PaymentsPage.tsx` (payment receipt) are explicitly out of scope — do not modify them.
- All new user-facing copy is in Uzbek, matching existing conventions (e.g. "Bekor qilish", "Yuklanmoqda...").
- Existing `ALLOWED_FOLDERS` whitelist (`lessons`, `questions`, `payments`, `practice-submissions`) in `upload.controller.ts` is unchanged — dedup applies uniformly across all of them (payments/practice-submissions still benefit from silent dedup even though they don't get library UI).

---

## File Structure

- **Modify** `apps/backend/src/db/schema.ts` — add `media` table + relations.
- **Create** `apps/backend/drizzle/migrations/0027_media_library.sql` — migration for the new table.
- **Modify** `apps/backend/src/storage/storage.service.ts` — add a `computeHash` helper and a hash-aware upload path.
- **Modify** `apps/backend/src/upload/upload.controller.ts` — compute hash, check for existing `media` row before upload, insert a `media` row after upload (or reuse), inject `req.admin.id`.
- **Create** `apps/backend/src/media/media.module.ts`, `apps/backend/src/media/media.controller.ts`, `apps/backend/src/media/media.service.ts` — new `GET /media` listing endpoint.
- **Modify** `apps/backend/src/app.module.ts` — register `MediaModule`.
- **Create** `apps/frontend/src/api/media.ts` — `apiListMedia(type)` client function + `ApiMediaItem` type.
- **Create** `apps/frontend/src/components/media/MediaLibraryModal.tsx` — the picker modal (grid of thumbnails/audio rows + search + "Yangi fayl yuklash" button).
- **Modify** `apps/frontend/src/components/QuestionForm.tsx` — wire "Rasm"/"Audio" buttons to open `MediaLibraryModal` instead of clicking the hidden inputs directly.
- **Modify** `apps/frontend/src/components/course/EditorBlock.tsx` — override BlockNote's `filePanel` to inject a library tab.
- **Create** `apps/frontend/src/components/course/EditorImageFilePanel.tsx` — the custom BlockNote file-panel component.

---

### Task 1: `media` table + migration

**Files:**
- Modify: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle/migrations/0027_media_library.sql`

**Interfaces:**
- Produces: `media` Drizzle table export with columns `id, adminId, folder, contentHash, mimeType, url, fileName, sizeBytes, createdAt`. Unique constraint on `(adminId, contentHash)`.

- [ ] **Step 1: Add the `media` table to schema.ts**

Add after the `folders` table definition (around line 56, right before `export const courses = ...`) in `apps/backend/src/db/schema.ts`:

```ts
export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folder: text('folder').notNull(),
  contentHash: text('content_hash').notNull(),
  mimeType: text('mime_type').notNull(),
  url: text('url').notNull(),
  fileName: text('file_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  adminHashUnique: uniqueIndex('media_admin_hash_unique').on(table.adminId, table.contentHash),
}));
```

This uses `pgTable`, `text`, `uuid`, `integer`, `timestamp`, `uniqueIndex` — all already imported at the top of `schema.ts:1`.

- [ ] **Step 2: Generate and hand-write the migration**

Run:
```bash
cd apps/backend && npx drizzle-kit generate --name media_library
```

Expected: a new file appears under `apps/backend/drizzle/migrations/` (drizzle-kit auto-numbers it — rename it to `0027_media_library.sql` if the generated number/name differs, keeping it consistent with the existing `NNNN_description.sql` convention seen in `apps/backend/drizzle/migrations/0026_payment_cancellations.sql`).

- [ ] **Step 3: Verify the migration SQL**

Read the generated file and confirm it matches this shape (adjust only if drizzle-kit's exact output differs cosmetically):

```sql
CREATE TABLE IF NOT EXISTS "media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" uuid NOT NULL,
  "folder" text NOT NULL,
  "content_hash" text NOT NULL,
  "mime_type" text NOT NULL,
  "url" text NOT NULL,
  "file_name" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "media"
  ADD CONSTRAINT "media_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "media_admin_hash_unique"
  ON "media" ("admin_id", "content_hash");
```

- [ ] **Step 4: Apply the migration**

Run:
```bash
cd apps/backend && npx drizzle-kit migrate
```

Expected: no errors, migration marked as applied.

- [ ] **Step 5: Type-check**

Run:
```bash
cd apps/backend && npx tsc --noEmit -p .
```

Expected: no new errors (pre-existing unrelated errors in `grading.spec.ts`/`live.service.spec.ts` are fine to see, do not fix them).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/migrations/0027_media_library.sql apps/backend/drizzle/migrations/meta
git commit -m "feat(media): add media table for library dedup"
```

---

### Task 2: Content-hash aware upload in StorageService + UploadController

**Files:**
- Modify: `apps/backend/src/storage/storage.service.ts`
- Modify: `apps/backend/src/upload/upload.controller.ts`
- Modify: `apps/backend/src/upload/upload.module.ts`

**Interfaces:**
- Consumes: `media` table from Task 1 (`import { media } from '../db/schema'`), `db` from `apps/backend/src/db/index.ts` (already used the same way in `payments.service.ts:2`).
- Produces: `POST /upload` now returns `{ url: string; type: 'image' | 'audio'; reused: boolean }` (the `reused` field is additive — existing frontend callers destructure `{ url, type }` and are unaffected by the extra field).

- [ ] **Step 1: Add a hash helper to StorageService**

In `apps/backend/src/storage/storage.service.ts`, add this import at the top (after the existing `import type { Readable } from 'stream';` on line 10):

```ts
import { createHash } from 'crypto';
```

Add this method inside the `StorageService` class (e.g. right after `normalizeEndpoint`, before `uploadFile`):

```ts
  hashBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
```

- [ ] **Step 2: Type-check StorageService change**

Run:
```bash
cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep storage.service
```

Expected: no output (no errors in this file).

- [ ] **Step 3: Rewrite UploadController to check/record media rows**

Replace the full contents of `apps/backend/src/upload/upload.controller.ts` with:

```ts
import {
  Controller, Post, UseInterceptors, UploadedFile, Body,
  BadRequestException, UseGuards, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from '../storage/storage.service';
import { db } from '../db';
import { media } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_FOLDERS = ['lessons', 'questions', 'payments', 'practice-submissions'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('upload')
export class UploadController {
  constructor(private storageService: StorageService) {}

  @Post()
  @Roles('teacher', 'super', 'student')
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
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string | undefined,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const adminId: string = req.admin.id;
    const targetFolder = ALLOWED_FOLDERS.includes(folder || '') ? (folder as string) : 'questions';
    const ext = extname(file.originalname).toLowerCase();
    const type = ALLOWED_IMAGE.includes(ext) ? 'image' : 'audio';
    const contentHash = this.storageService.hashBuffer(file.buffer);

    const existing = await db.query.media.findFirst({
      where: and(eq(media.adminId, adminId), eq(media.contentHash, contentHash)),
    });
    if (existing) {
      return { url: existing.url, type, reused: true };
    }

    const url = await this.storageService.uploadFile(file, targetFolder);
    await db.insert(media).values({
      adminId,
      folder: targetFolder,
      contentHash,
      mimeType: file.mimetype,
      url,
      fileName: file.originalname,
      sizeBytes: file.size,
    });
    return { url, type, reused: false };
  }
}
```

Note: `req.admin.id` is populated by `JwtAuthGuard` per `apps/backend/src/auth/jwt-auth.guard.ts:9-12` — same pattern already relied on elsewhere (e.g. `ContentBlocksController` passing `req.admin.id`, per prior codebase research).

- [ ] **Step 4: Verify `db.query.media` is available**

Check `apps/backend/src/db/index.ts` uses `drizzle(pool, { schema })` with the full schema object (so `db.query.media` resolves). Run:

```bash
grep -n "schema" apps/backend/src/db/index.ts
```

Expected: a line like `drizzle(pool, { schema })` or similar, confirming `schema` (the whole module, including the new `media` export) is passed in — if it imports `* as schema from './schema'`, no further change is needed since `media` is already exported from `schema.ts` by Task 1.

- [ ] **Step 5: Type-check**

Run:
```bash
cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -i upload
```

Expected: no output.

- [ ] **Step 6: Manual smoke test — dedup behavior**

Run the backend locally (`cd apps/backend && npm run start:dev` or equivalent existing script), then with a valid teacher JWT:

```bash
curl -X POST http://localhost:3001/api/v1/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/test-image.png" -F "folder=questions"
```

Expected: first call returns `{"url": "...", "type": "image", "reused": false}`. Re-running the exact same command returns the **same** `url` with `"reused": true`, and no new S3 PUT occurs (verify by checking the S3 bucket object count is unchanged, or trust the `reused: true` flag as sufficient evidence given `StorageService.uploadFile` is only called in the non-existing branch).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/storage/storage.service.ts apps/backend/src/upload/upload.controller.ts
git commit -m "feat(media): dedup uploads by content hash, record media rows"
```

---

### Task 3: `GET /media` listing endpoint

**Files:**
- Create: `apps/backend/src/media/media.module.ts`
- Create: `apps/backend/src/media/media.controller.ts`
- Create: `apps/backend/src/media/media.service.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `media` table (Task 1), `JwtAuthGuard`/`RolesGuard`/`Roles` decorator (existing, same pattern as `upload.controller.ts`).
- Produces: `GET /media?type=image|audio` → `Array<{ id, url, fileName, mimeType, sizeBytes, createdAt }>`, ordered newest-first, scoped to the requesting admin.

- [ ] **Step 1: Write `media.service.ts`**

Create `apps/backend/src/media/media.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { media } from '../db/schema';
import { and, desc, eq, like } from 'drizzle-orm';

const IMAGE_MIME_PREFIX = 'image/';
const AUDIO_MIME_PREFIX = 'audio/';

@Injectable()
export class MediaService {
  async listForAdmin(adminId: string, type?: 'image' | 'audio') {
    const prefix = type === 'image' ? IMAGE_MIME_PREFIX : type === 'audio' ? AUDIO_MIME_PREFIX : undefined;
    const rows = await db.query.media.findMany({
      where: prefix
        ? and(eq(media.adminId, adminId), like(media.mimeType, `${prefix}%`))
        : eq(media.adminId, adminId),
      orderBy: [desc(media.createdAt)],
    });
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    }));
  }
}
```

- [ ] **Step 2: Write `media.controller.ts`**

Create `apps/backend/src/media/media.controller.ts`:

```ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MediaService } from './media.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Get()
  @Roles('teacher', 'super')
  async list(@Query('type') type: string | undefined, @Req() req: any) {
    const normalizedType = type === 'image' || type === 'audio' ? type : undefined;
    return this.mediaService.listForAdmin(req.admin.id, normalizedType);
  }
}
```

- [ ] **Step 3: Write `media.module.ts`**

Create `apps/backend/src/media/media.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
```

- [ ] **Step 4: Register `MediaModule` in `app.module.ts`**

In `apps/backend/src/app.module.ts`, add the import near the other module imports (after `import { UploadModule } from './upload/upload.module';` at line 18):

```ts
import { MediaModule } from './media/media.module';
```

And add `MediaModule,` to the `imports` array (near `UploadModule,`).

- [ ] **Step 5: Type-check**

Run:
```bash
cd apps/backend && npx tsc --noEmit -p . 2>&1 | grep -i media
```

Expected: no output.

- [ ] **Step 6: Manual smoke test**

With the backend running and a valid teacher JWT (reuse the token from Task 2's smoke test, after having uploaded at least one image):

```bash
curl http://localhost:3001/api/v1/media?type=image -H "Authorization: Bearer <token>"
```

Expected: a JSON array containing the previously-uploaded image's `url`, `fileName`, `mimeType`, `sizeBytes`, `createdAt`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/media apps/backend/src/app.module.ts
git commit -m "feat(media): add GET /media listing endpoint"
```

---

### Task 4: Frontend API client for media

**Files:**
- Create: `apps/frontend/src/api/media.ts`

**Interfaces:**
- Produces: `apiListMedia(type: 'image' | 'audio'): Promise<ApiMediaItem[]>`, `ApiMediaItem` type with fields `id, url, fileName, mimeType, sizeBytes, createdAt`.

- [ ] **Step 1: Write the API client**

Create `apps/frontend/src/api/media.ts`:

```ts
import client from './client';

export interface ApiMediaItem {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function apiListMedia(type: 'image' | 'audio'): Promise<ApiMediaItem[]> {
  const res = await client.get('/media', { params: { type } });
  return res.data;
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/frontend && npx tsc --noEmit -p .
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/media.ts
git commit -m "feat(media): add frontend media API client"
```

---

### Task 5: `MediaLibraryModal` component

**Files:**
- Create: `apps/frontend/src/components/media/MediaLibraryModal.tsx`

**Interfaces:**
- Consumes: `apiListMedia` and `ApiMediaItem` from Task 4 (`apps/frontend/src/api/media.ts`), `apiUploadMedia` from `apps/frontend/src/api/questions.ts:24-33`.
- Produces: `MediaLibraryModal` component with props `{ type: 'image' | 'audio'; folder: 'lessons' | 'questions' | 'payments' | 'practice-submissions'; onSelect: (url: string) => void; onClose: () => void }`. Calling `onSelect(url)` and then the modal's own `onClose()` is the caller's responsibility (matches existing modal convention, e.g. `PaymentModal`'s `onSave` doesn't self-close).

- [ ] **Step 1: Write the component**

Create `apps/frontend/src/components/media/MediaLibraryModal.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Search, Upload, X } from "lucide-react";
import { apiListMedia, type ApiMediaItem } from "../../api/media";
import { apiUploadMedia } from "../../api/questions";

interface MediaLibraryModalProps {
  type: "image" | "audio";
  folder: "lessons" | "questions" | "payments" | "practice-submissions";
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function MediaLibraryModal({ type, folder, onSelect, onClose }: MediaLibraryModalProps) {
  const [items, setItems] = useState<ApiMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiListMedia(type)
      .then((data) => { if (!cancelled) setItems(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  const filtered = useMemo(
    () => items.filter((item) => item.fileName.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  async function handleUploadNew(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUploadMedia(file, folder);
      onSelect(url);
    } finally {
      setUploading(false);
    }
  }

  const accept = type === "image" ? "image/jpeg,image/png,image/gif,image/webp" : "audio/mpeg,audio/wav,audio/ogg,audio/mp4";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">
            {type === "image" ? "Rasmlar kutubxonasi" : "Audio kutubxonasi"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-4">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fayl nomi bo'yicha qidirish"
              className="w-full rounded-xl bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none"
            />
          </div>

          <label className="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-100">
            <input ref={fileInputRef} type="file" accept={accept} className="hidden" disabled={uploading} onChange={handleUploadNew} />
            <Upload size={15} />
            {uploading ? "Yuklanmoqda..." : "Yangi fayl yuklash"}
          </label>

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Kutubxonada fayl topilmadi</p>
          ) : type === "image" ? (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.url)}
                  className="group aspect-square overflow-hidden rounded-xl border border-gray-100 hover:border-indigo-400"
                  title={item.fileName}
                >
                  <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.url)}
                  className="flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2.5 text-left hover:border-indigo-400 hover:bg-indigo-50/40"
                >
                  <Music size={15} className="shrink-0 text-indigo-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{item.fileName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd apps/frontend && npx tsc --noEmit -p .
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/media/MediaLibraryModal.tsx
git commit -m "feat(media): add MediaLibraryModal component"
```

---

### Task 6: Wire `MediaLibraryModal` into `QuestionForm.tsx`

**Files:**
- Modify: `apps/frontend/src/components/QuestionForm.tsx`

**Interfaces:**
- Consumes: `MediaLibraryModal` from Task 5.

- [ ] **Step 1: Add state for which library modal is open**

In `apps/frontend/src/components/QuestionForm.tsx`, near the existing state block (around line 225, next to `const [uploading, setUploading] = useState(false);`), add:

```ts
  const [libraryOpen, setLibraryOpen] = useState<"image" | "audio" | null>(null);
```

Add the import at the top of the file (alongside other component imports):

```ts
import { MediaLibraryModal } from "./media/MediaLibraryModal";
```

- [ ] **Step 2: Replace the "Rasm"/"Audio" button handlers**

Replace (around line 401-409):

```tsx
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <Image size={13} /> Rasm
          </button>
```

with:

```tsx
          <button
            type="button"
            onClick={() => setLibraryOpen("image")}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <Image size={13} /> Rasm
          </button>
```

And replace (around line 423-430):

```tsx
          <button
            type="button"
            onClick={() => audioRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <Music size={13} /> Audio
          </button>
```

with:

```tsx
          <button
            type="button"
            onClick={() => setLibraryOpen("audio")}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <Music size={13} /> Audio
          </button>
```

Note: `imageRef`/`audioRef` and the two hidden `<input type=file>` elements (lines 441-454) are no longer triggered by these buttons but stay in the file unused-import-free since nothing else references them for click — **remove them** in the next step since they become dead code.

- [ ] **Step 3: Remove the now-unused hidden file inputs and refs**

Remove these lines (previously 441-454):

```tsx
      <input
        ref={imageRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={audioRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4"
        className="hidden"
        onChange={handleFileChange}
      />
```

Remove the now-unused refs (previously lines 227-228):

```ts
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
```

Remove the now-unused `handleFileChange` function (previously lines 230-249) — its logic moves into the modal's `onSelect` callback in the next step. Also remove `setUploadError`'s size-check usage there since the library-selected path has no local file to size-check (dedup upload path in `MediaLibraryModal` itself has no separate size check either — acceptable, since the underlying `apiUploadMedia` still enforces the backend's 10MB Multer limit and surfaces a rejection via the existing catch-and-toast pattern if exceeded).

Keep `uploading`/`setUploading`/`uploadError`/`setUploadError` state declarations — they're still used to disable the Rasm/Audio buttons while a library-triggered upload is in flight (wired in the next step).

- [ ] **Step 4: Render `MediaLibraryModal` and wire `onSelect`**

Near the end of the component's JSX return (find a natural spot — e.g. right after the closing of the outer form/fragment, as a sibling, following the pattern of `PaymentsPage.tsx`'s `{modalOpen && <PaymentModal .../>}`), add:

```tsx
      {libraryOpen && (
        <MediaLibraryModal
          type={libraryOpen}
          folder="questions"
          onSelect={(url) => {
            if (libraryOpen === "image") setImageUrl(url);
            else setAudioUrl(url);
            setLibraryOpen(null);
          }}
          onClose={() => setLibraryOpen(null)}
        />
      )}
```

- [ ] **Step 5: Type-check**

Run:
```bash
cd apps/frontend && npx tsc --noEmit -p .
```

Expected: no errors (specifically no "declared but never read" for removed `imageRef`/`audioRef`/`handleFileChange` — confirm they're fully removed, not just unused).

- [ ] **Step 6: Manual UI smoke test**

Start the frontend dev server, open a test creation/edit flow that renders `QuestionForm`, click "Rasm". Expected: `MediaLibraryModal` opens (title "Rasmlar kutubxonasi"), shows previously-uploaded images (if any exist from Task 2's smoke test) or an empty state, has a "Yangi fayl yuklash" button. Click "Yangi fayl yuklash", pick a new image file. Expected: modal closes, the question form's image preview shows the newly uploaded image. Click "Rasm" again, verify the just-uploaded image now appears in the library grid. Click it. Expected: modal closes, same image is selected without a new upload round-trip (check network tab: `GET /media` fires, no `POST /upload`).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/QuestionForm.tsx
git commit -m "feat(media): wire media library into QuestionForm image/audio pickers"
```

---

### Task 7: Wire library into `EditorBlock.tsx` via BlockNote `filePanel`

**Files:**
- Create: `apps/frontend/src/components/course/EditorImageFilePanel.tsx`
- Modify: `apps/frontend/src/components/course/EditorBlock.tsx`

**Interfaces:**
- Consumes: `MediaLibraryModal` from Task 5, BlockNote's `FilePanelController`/`ComponentsContext` from `@blocknote/react@0.51.4` (confirmed installed).

- [ ] **Step 1: Inspect the default FilePanel implementation for reference**

Run this to see the shape of the default UploadTab/EmbedTab composition, since our custom panel needs to preserve the "Upload" tab behavior and add a "Kutubxonadan tanlash" tab:

```bash
find node_modules/@blocknote/react/dist -iname "*FilePanel*"
```

Read the matched `.d.ts`/source files to confirm the exact prop shape of `FilePanelProps` (`{ blockId: string }`) and how `editor.uploadFile` / block updates are normally triggered from within a custom file panel (look for how `UploadTab` calls back into the editor to set the block's `url` prop after upload — this is the piece to replicate for the library-selection path). Report findings inline as a code comment in Step 2 if the exact update mechanism differs from the assumption below.

- [ ] **Step 2: Write `EditorImageFilePanel.tsx`**

Create `apps/frontend/src/components/course/EditorImageFilePanel.tsx` with this starting point (the exact BlockNote API for updating a block's file URL from a custom panel must be confirmed against Step 1's findings — the pattern below assumes `editor.updateBlock(blockId, { props: { url } })`, which is BlockNote's documented way to set an image/file block's URL programmatically):

```tsx
import { useState } from "react";
import type { FilePanelProps } from "@blocknote/react";
import { useBlockNoteEditor } from "@blocknote/react";
import { MediaLibraryModal } from "../media/MediaLibraryModal";

export function EditorImageFilePanel({ block }: FilePanelProps) {
  const editor = useBlockNoteEditor();
  const [mode, setMode] = useState<"choice" | "library">("choice");

  function applyUrl(url: string) {
    editor.updateBlock(block, { type: "image", props: { url } } as any);
  }

  if (mode === "library") {
    return (
      <MediaLibraryModal
        type="image"
        folder="lessons"
        onSelect={(url) => { applyUrl(url); setMode("choice"); }}
        onClose={() => setMode("choice")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-lg">
      <button
        type="button"
        onClick={() => setMode("library")}
        className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100"
      >
        Kutubxonadan tanlash
      </button>
      <label className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-2 text-center text-sm text-gray-500 hover:border-indigo-400">
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const url = await editor.uploadFile!(file, block);
            applyUrl(typeof url === "string" ? url : (url as any).url);
          }}
        />
        Yangi fayl yuklash
      </label>
    </div>
  );
}
```

- [ ] **Step 2b: Reconcile with Step 1 findings**

If Step 1's inspection of the default `UploadTab` reveals a different update mechanism than `editor.updateBlock(block, { type: "image", props: { url } })` (e.g. a callback passed via context, or a different prop name), adjust `applyUrl` and the file-input `onChange` handler accordingly before proceeding — this step exists because BlockNote's exact custom-file-panel wiring couldn't be fully confirmed without reading the installed package's source in-session.

- [ ] **Step 3: Wire the custom panel into `EditorBlock.tsx`**

In `apps/frontend/src/components/course/EditorBlock.tsx`, add the import (after line 9's `import { apiUploadMedia } from '../../api/questions';`):

```ts
import { FilePanelController } from '@blocknote/react';
import { EditorImageFilePanel } from './EditorImageFilePanel';
```

Find where `<BlockNoteView editor={editor} ... />` is rendered (search the file for `BlockNoteView`) and add `<FilePanelController filePanel={EditorImageFilePanel} />` as a child, matching BlockNote's documented composition pattern for overriding default UI slots via children of `BlockNoteView` (this mirrors how `SideMenuController`/`FormattingToolbarController` etc. are typically composed in BlockNote — confirm the exact child-slot API from Step 1's `.d.ts` inspection if `BlockNoteView` in this version instead expects the override via a `filePanel` prop directly rather than a child controller component, and adjust accordingly).

- [ ] **Step 4: Type-check**

Run:
```bash
cd apps/frontend && npx tsc --noEmit -p .
```

Expected: no errors. If `FilePanelController` or `FilePanelProps` aren't exported names from `@blocknote/react` in this exact version, the type-check will fail here — resolve by checking the actual named exports:

```bash
grep -rn "FilePanel" node_modules/@blocknote/react/dist/*.d.ts | head -20
```

and adjust import names in Step 2/3 to match.

- [ ] **Step 5: Manual UI smoke test**

Open a lesson editor page rendering `EditorBlock`. Trigger an image insertion (via slash-menu "/image" or drag-drop). Expected: the custom panel appears with "Kutubxonadan tanlash" and "Yangi fayl yuklash" options instead of BlockNote's stock Upload/Embed tabs. Selecting "Kutubxonadan tanlash" opens `MediaLibraryModal` scoped to `type="image"`; picking an existing image inserts it into the lesson body without a new upload. Selecting "Yangi fayl yuklash" and picking a file uploads and inserts it, and it subsequently appears in the library the next time the panel opens.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/course/EditorImageFilePanel.tsx apps/frontend/src/components/course/EditorBlock.tsx
git commit -m "feat(media): wire media library into lesson editor image insertion"
```

---

## Self-Review Notes

- **Spec coverage**: dedup-by-hash (Task 2), per-admin library scope (Task 1's `adminId` FK + Task 3's `listForAdmin`), reuse-without-duplicate-storage flow (Task 2's early-return on hash match), library modal UI matching the user's described flow — pick existing or upload new, which then lands in the library (Task 5/6/7). All covered.
- **Explicitly out of scope, confirmed with user**: `PracticeScreen.tsx`, `PaymentsPage.tsx`, video blocks, document/file blocks — none of these are touched by any task above.
- **Known open risk**: Task 7 Step 1/2b flags that BlockNote's exact custom-file-panel wiring (child-component vs. direct prop, exact update-block call) needs confirmation against the installed package's `.d.ts` files during implementation, since research could only confirm the *existence* of the `filePanel`/`FilePanelController` mechanism, not its exact call signature. This is the single highest-uncertainty task in the plan — if it proves unworkable as scoped, the fallback is to skip Task 7 and ship Task 1-6 alone (QuestionForm library, dedup on all uploads including lesson-editor ones happens silently even without the picker UI).
