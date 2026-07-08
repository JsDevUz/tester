# Lesson Content Blocks (Editor) + Backblaze B2 Storage — Design Spec

## Maqsad

Dars (Lesson) ichidagi kontent bloklari tizimini backend'ga ulash — birinchi navbatda faqat `editor` (matn/rich-text) blok turi. Shu bilan birga, hozirgi fayl yuklash yo'li (`apps/backend/src/upload/`, diskStorage orqali serverning o'z diskiga saqlaydi) butunlay olib tashlanadi va Backblaze B2 (S3-mos SDK) bilan almashtiriladi — hech qanday fayl serverning o'zida saqlanmaydi.

`video`/`image`/`file` blok turlari ushbu bosqichda backend'ga ulanmaydi (frontend-only mock bo'lib qoladi), lekin `content_blocks` jadvali barcha 4 tur uchun umumiy sxema bilan loyihalanadi — keyingi bosqichda schema o'zgarishisiz qo'shsa bo'ladi.

## 1. Ma'lumotlar modeli — `content_blocks` jadvali

Yangi Drizzle jadvali, `apps/backend/src/db/schema.ts`ga qo'shiladi:

```typescript
export const contentBlocks = pgTable('content_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('editor'), // 'editor' | 'video' | 'image' | 'file'
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

`lessonsRelations`ga `blocks: many(contentBlocks)` qo'shiladi.

**Ownership:** `content_blocks` jadvalida `adminId` yo'q. Ownership `assertLessonOwnership(lessonId, adminId)` helper orqali tekshiriladi: `lesson → module.courseId → course.adminId` zanjiri (Modules/Lessons integratsiyasidagi bir xil pattern).

**Cheklovlar:** `CONTENT_BLOCK_LIMIT = 7` (frontend'da mavjud konstantani backend ham hurmat qiladi — `create()` chaqirilganda mavjud bloklar sonini tekshiradi, limitdan oshsa `BadRequestException`). `orderIndex` yaratishda `existing.length` orqali hisoblanadi, alohida reorder qilinmaguncha o'zgarmaydi.

## 2. Backblaze B2 integratsiyasi

Hozirgi `apps/backend/src/upload/` moduli (`UploadController` + `diskStorage`) butunlay o'chiriladi va `apps/backend/src/storage/` bilan almashtiriladi:

**`StorageService`** (`nam-gap/jamm-server/src/common/services/r2.service.ts`dan moslashtirilgan, soddalashtirilgan — HLS/video-stream'ga xos qismlar (`getFileStream`, `getFileText`, cache-control granularity) olib tashlanadi, chunki bizga faqat rasm/audio/fayl yuklash kerak):

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

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
    const key = `${folder}/${uuidv4()}.${ext}`;
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return this.publicDomain ? `${this.publicDomain}/${key}` : key;
    } catch (error) {
      console.error('Object storage upload error:', error);
      throw new InternalServerErrorException('Faylni yuklashda xatolik yuz berdi');
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    const cleanKey = this.publicDomain && key.startsWith(this.publicDomain)
      ? key.slice(this.publicDomain.length + 1)
      : key;
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

**`UploadController`** qayta yoziladi — `diskStorage` o'rniga `memoryStorage()` (fayl RAM'da buffer sifatida saqlanadi, diskka yozilmaydi), va `folder` maydonini qabul qiladi:

```typescript
import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from './storage.service';

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_FOLDERS = ['lessons', 'questions'];
const MAX_SIZE = 10 * 1024 * 1024;

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('upload')
export class UploadController {
  constructor(private storageService: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if ([...ALLOWED_IMAGE, ...ALLOWED_AUDIO].includes(ext)) cb(null, true);
      else cb(new BadRequestException('Faqat rasm yoki audio fayllar qabul qilinadi'), false);
    },
  }))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('folder') folder?: string) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const targetFolder = ALLOWED_FOLDERS.includes(folder || '') ? folder! : 'questions';
    const ext = extname(file.originalname).toLowerCase();
    const type = ALLOWED_IMAGE.includes(ext) ? 'image' : 'audio';
    const url = await this.storageService.uploadFile(file, targetFolder);
    return { url, type };
  }
}
```

`ALLOWED_FOLDERS` faqat `'lessons'` va `'questions'`ni qabul qiladi — noma'lum/bo'sh qiymat `'questions'`ga tushadi (mavjud xatti-harakatni buzmaslik uchun default).

**Dependency:** `@aws-sdk/client-s3` va `uuid` (agar backend'da hali yo'q bo'lsa) `apps/backend/package.json`ga qo'shiladi.

**Muhit o'zgaruvchilari** (`.env`, `nam-gap`dagi nom konvensiyasi bilan bir xil):
```
OBJECT_STORAGE_ENDPOINT=s3.us-east-005.backblazeb2.com
OBJECT_STORAGE_REGION=us-east-005
OBJECT_STORAGE_ACCESS_KEY_ID=<b2-key-id>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<b2-application-key>
OBJECT_STORAGE_BUCKET_NAME=<bucket-name>
OBJECT_STORAGE_PUBLIC_BASE_URL=<cdn-yoki-b2-public-url>
```

Eski `apps/backend/uploads/` papka va undagi fayllar ishlatilmay qoladi (mavjud fayllarga havolalar buzilishi mumkin — bu loyihada production foydalanuvchi ma'lumoti yo'qligi sababli muammo emas, deb hisoblanadi).

## 3. Content Block CRUD API

Yangi NestJS moduli: `apps/backend/src/content-blocks/`

**`ContentBlocksService`:**
- `findAll(lessonId, adminId)` — ownership tekshirib, `orderIndex` bo'yicha saralab qaytaradi.
- `create(lessonId, adminId, type, data)` — ownership + limit tekshiradi (`existing.length >= 7` bo'lsa `BadRequestException`), `orderIndex: existing.length` bilan yaratadi. Bu bosqichda faqat `type === 'editor'` qabul qilinadi (`video`/`image`/`file` kelsa `BadRequestException`).
- `update(id, adminId, data: { html?: string; label?: string })` — ownership (blok → lesson → module → course) tekshirib yangilaydi.
- `remove(id, adminId)` — ownership tekshirib o'chiradi.
- `reorder(lessonId, adminId, blockIds: string[])` — ownership tekshirib, berilgan tartib bo'yicha har bir blokning `orderIndex`ini yangilaydi (transaction ichida).

**`ContentBlocksController`:**
- `GET /lessons/:lessonId/blocks`
- `POST /lessons/:lessonId/blocks` — body: `{ type: 'editor' }` (hozircha faqat shu)
- `PATCH /blocks/:id` — body: `{ html?: string; label?: string }`
- `DELETE /blocks/:id`
- `POST /lessons/:lessonId/blocks/reorder` — body: `{ blockIds: string[] }`

Barchasi `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('teacher', 'super')`.

`apps/backend/src/app.module.ts`ga `ContentBlocksModule` va `StorageModule` (yangi, `UploadModule`ni almashtiradi) ro'yxatga olinadi.

## 4. Frontend integratsiyasi

**`apps/frontend/src/api/contentBlocks.ts`** (yangi):
```typescript
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

apiListBlocks(lessonId): Promise<ApiContentBlock[]>
apiCreateBlock(lessonId, type: 'editor'): Promise<ApiContentBlock>
apiUpdateBlock(id, data: { html?: string; label?: string }): Promise<ApiContentBlock>
apiDeleteBlock(id): Promise<void>
apiReorderBlocks(lessonId, blockIds: string[]): Promise<void>
```

**`apps/frontend/src/api/questions.ts`** — `apiUploadMedia`ga ixtiyoriy `folder` parametri qo'shiladi:
```typescript
export async function apiUploadMedia(file: File, folder: 'lessons' | 'questions' = 'questions') {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await client.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}
```
`EditorBlock.tsx`dagi `uploadFile` chaqiruvi `apiUploadMedia(file, 'lessons')` bo'ladi; `QuestionForm.tsx`daki o'zgarmaydi (default `'questions'`).

**`courseStore.ts`:**
- `loadCourses` yana bir daraja chuqurlashadi: har bir lesson uchun `apiListBlocks(lesson.id)` chaqiriladi, natija `Lesson.blocks`ga joylashadi (faqat `type: 'editor'` bo'lgan bloklar hozircha real ma'lumot bilan keladi — boshqa turlar bu bosqichda backend'da yaratilmaydi, shuning uchun amalda bo'sh yoki faqat editor bloklar qaytadi).
- `addBlock`/`updateBlock`/`removeBlock`/`moveBlock` async qilinadi:
  - `addBlock` — faqat `block.type === 'editor'` bo'lsa `apiCreateBlock` chaqiradi (boshqa turlar hali ham frontend-only qoladi — signature saqlanadi, lekin ichida shart qo'yiladi: `if (block.type !== 'editor') { /* frontend-only qo'shish, eski xatti-harakat */ }`).
  - `updateBlock` — `type === 'editor'` bo'lgan bloklar uchun `apiUpdateBlock` chaqiradi (faqat `html`/`label` maydonlarini yuboradi), boshqa turlar frontend-only qoladi.
  - `removeBlock` — `type === 'editor'` bo'lsa `apiDeleteBlock` chaqiradi.
  - `moveBlock` — `apiReorderBlocks` bilan butun ro'yxat tartibini yuboradi (agar barcha bloklar frontend-only bo'lsa, hech narsa yubormaydi — hozircha faqat editor bloklari borligida chaqiriladi).

**`EditorBlock.tsx`:**
- `onChange` debounce qilinadi (~1.5-2 soniya, `useRef` + `setTimeout` orqali, har chaqiruvda oldingi timer tozalanadi).
- Component unmount bo'lganda (yoki foydalanuvchi blokni yopganda/collapse qilganda) kutilayotgan debounce darhol flush qilinadi, o'zgarish yo'qolmasligi uchun.

## Global cheklovlar

- Faqat `type: 'editor'` backend'ga ulanadi bu bosqichda; `video`/`image`/`file` frontend-only qoladi (`CONTENT_BLOCK_LIMIT`, mock preview va h.k. o'zgarmaydi).
- Hech qanday fayl serverning o'z diskiga saqlanmaydi — barcha yuklamalar `memoryStorage()` orqali RAM'da ushlanib, to'g'ridan-to'g'ri Backblaze B2'ga oqadi.
- Ownership: `content_blocks` uchun `assertLessonOwnership` — parent-chain (`lesson → module → course.adminId`).
- `orderIndex` yaratishda hisoblanadi; alohida `reorder` endpoint orqali o'zgartiriladi (drag-drop emas, mavjud yuqoriga/pastga tugmalari orqali).
- No optimistic updates — API chaqiruvi muvaffaqiyatli tugagach local state yangilanadi (mavjud pattern).
- Manual browser QA — foydalanuvchi tomonidan bajariladi, AI faqat build/test tekshiruvini bajaradi.
- Backend build/test (hozirgi 96 test) yashil qolishi kerak, frontend build toza bo'lishi kerak.
