# Video Content Block HLS + AES-128 Integration — Design Spec

## Maqsad

Dars ichidagi `video` content block turini mock/local preview holatidan real backend oqimiga ulash: o'qituvchi video yuklaydi, backend uni HLS segmentlarga ajratadi, AES-128 bilan shifrlaydi va Backblaze B2'ga saqlaydi. Talaba videoni oddiy public MP4 link orqali emas, qisqa muddatli signed playback token orqali ko'radi.

Bu DRM emas. Maqsad oddiy download usullarini qiyinlashtirish: public MP4 link bo'lmaydi, video kichik segmentlarga bo'linadi, segmentlar AES-128 bilan shifrlanadi, kalit va manifest faqat access tekshiruvidan o'tgan studentga beriladi.

## Qabul qilingan arxitektura qarorlari

- MVP uchun transcoding backend container ichida `ffmpeg` bilan bajariladi.
- O'qituvchi faqat video upload tugashini kutadi. HLS/AES processing background ishlaydi.
- Kod queue-ready yoziladi: keyinchalik Redis + BullMQ + workerga o'tishda faqat `VideoJobService` implementationi almashadi.
- `ffmpeg` uchun vaqtinchalik `/tmp/video-jobs/<blockId>` workspace ishlatiladi. Job tugaganda bu papka tozalanadi. Doimiy fayllar server diskida qolmaydi.
- Original video, HLS manifest, segmentlar va AES key Backblaze B2'dagi private/predictable bo'lmagan keylar ostida saqlanadi.
- Video o'chirilganda shu block bilan bog'liq B2 objectlari ham best-effort tarzda o'chiriladi.

## Data model

Mavjud `content_blocks` jadvali kengaytiriladi. `video` block ham shu jadvalda turadi; alohida `videos` jadvali bu bosqichda kerak emas, chunki video metadata lesson blockning o'ziga bog'langan.

Qo'shiladigan ustunlar:

```typescript
processingStatus: text('processing_status').notNull().default('ready'),
sourceKey: text('source_key'),
hlsMasterKey: text('hls_master_key'),
hlsBaseKey: text('hls_base_key'),
aesKeyRef: text('aes_key_ref'),
durationSec: integer('duration_sec'),
errorMessage: text('error_message'),
processedAt: timestamp('processed_at', { withTimezone: true }),
```

`processingStatus` qiymatlari:

- `pending`: block yaratildi, upload yoki job boshlanishi kutilmoqda.
- `processing`: original video bor, ffmpeg HLS/AES tayyorlayapti.
- `ready`: HLS manifest va segmentlar tayyor.
- `failed`: processing xato bilan tugadi.

Editor blocklar uchun `processingStatus = 'ready'` bo'ladi. Video block uchun `previewUrl` public MP4 bo'lmaydi; kerak bo'lsa thumbnail yoki UI placeholder uchun ishlatiladi. `embedUrl` tashqi video link uchun saqlanadi va HLS flowga kirmaydi.

## Backend modullar

Yangi modul: `apps/backend/src/videos/`

### `VideoUploadService`

Vazifasi:

- `lessonId → module → course.adminId` parent-chain orqali ownership tekshiradi.
- Content block limitini (`7`) hurmat qiladi.
- Video block yaratadi yoki mavjud video blockni yangilaydi.
- Original faylni B2'ga `videos/{lessonId}/{blockId}/source/<uuid>.<ext>` key bilan yuklaydi.
- DB'da `sourceKey`, `fileName`, `label`, `processingStatus = 'pending'` yozadi.
- `VideoJobService.enqueue(blockId)` chaqiradi.
- API response'ni darhol qaytaradi.

Katta fayllar uchun umumiy `/upload` endpoint ishlatilmaydi. Video uchun alohida endpoint va alohida file size limit bo'ladi.

### `VideoJobService`

Bu queue abstraction. MVP implementation:

```typescript
enqueue(blockId: string) {
  setImmediate(() => this.videoTranscodeService.process(blockId));
}
```

Keyinchalik BullMQga o'tganda shu qatlam:

```typescript
enqueue(blockId: string) {
  return this.queue.add('transcode-video', { blockId });
}
```

`VideoTranscodeService.process(blockId)` o'zgarmaydi. Shu sababli 1-variantdan 2-variantga migratsiya kichik bo'ladi.

Backend start bo'lganda `pending` yoki uzoq vaqt `processing`da qolgan video blocklar qayta enqueue qilinadi. Bu restart paytida yo'qolgan background joblarni tiklaydi.

### `VideoTranscodeService`

Vazifasi:

- Blockni topadi, `type = 'video'` va `sourceKey` borligini tekshiradi.
- `processingStatus = 'processing'` qiladi.
- B2'dan original source objectni `/tmp/video-jobs/<blockId>/source.<ext>`ga stream qilib tushiradi.
- 16-byte AES key generatsiya qiladi.
- `ffmpeg` orqali HLS segmentlar yaratadi:
  - segment davomiyligi: 6 soniya.
  - output: `master.m3u8`, `segment_000.ts`, ...
  - AES-128 key URI manifestda backend key endpointiga ishora qiladi, public B2 keyga emas.
- HLS fayllarni B2'ga yuklaydi:
  - `videos/{lessonId}/{blockId}/hls/master.m3u8`
  - `videos/{lessonId}/{blockId}/hls/segment_000.ts`
  - `videos/{lessonId}/{blockId}/keys/aes.key`
- `durationSec`, `hlsMasterKey`, `hlsBaseKey`, `aesKeyRef`, `processedAt`, `processingStatus = 'ready'` yozadi.
- Xato bo'lsa `processingStatus = 'failed'`, `errorMessage` yozadi.
- Har doim `/tmp/video-jobs/<blockId>`ni tozalaydi.

Docker image'ga `ffmpeg` o'rnatiladi. Lokal developmentda ham `ffmpeg` mavjud bo'lishi kerak.

### `VideoPlaybackService`

Vazifasi:

- Student video ko'rishni boshlaganda access tekshiradi.
- Access tekshiruv parent chain orqali course topib, `StudentAccessService.assertStudentLessonAccess(courseId, studentId)` bilan bajariladi.
- Muvaffaqiyatli tekshiruvdan keyin qisqa muddatli playback token beradi.
- Token HMAC/JWT bo'ladi va quyidagilarni o'z ichiga oladi:
  - `sub`: student id
  - `blockId`
  - `courseId`
  - `exp`: 2 soat
  - optional `sid` yoki nonce

Har segment/key so'rovida DB access qayta tekshirilmaydi; token imzosi va muddati tekshiriladi. Bu performance uchun kerak.

## API endpoints

Teacher/admin:

- `POST /lessons/:lessonId/videos`
  - Guard: `JwtAuthGuard`, `RolesGuard`, `@Roles('teacher', 'super')`
  - multipart field: `file`
  - optional body: `label`
  - response: content block row, `processingStatus`

- `POST /blocks/:blockId/videos/retry`
  - Guard: teacher/super
  - failed/pending video processingni qayta enqueue qiladi.

Student playback:

- `POST /videos/:blockId/play`
  - Guard: `JwtAuthGuard`, `RolesGuard`, `@Roles('student')`
  - access tekshiradi va `{ manifestUrl, token, expiresAt }` qaytaradi.

- `GET /videos/:blockId/manifest.m3u8?token=...`
  - Token tekshiradi.
  - B2'dan manifestni o'qib, key URI va segment URIlarini backend endpointlariga token bilan rewrite qiladi.
  - `Content-Type: application/vnd.apple.mpegurl`.

- `GET /videos/:blockId/key?token=...`
  - Token tekshiradi.
  - AES keyni B2 private objectdan o'qib qaytaradi.
  - `Content-Type: application/octet-stream`.
  - `Cache-Control: no-store`.

- `GET /videos/:blockId/segments/:fileName?token=...`
  - Token tekshiradi.
  - B2'dan segmentni stream qilib qaytaradi.
  - `Content-Type: video/mp2t`.
  - Qisqa cache mumkin, lekin token exp bilan cheklanadi.

## StorageService kengaytmalari

Mavjud `StorageService.uploadFile()` kichik media upload uchun qoladi. Video/HLS uchun qo'shimcha metodlar kerak:

- `uploadBuffer(key, buffer, contentType, cacheControl?)`
- `uploadStream(key, stream, contentType, cacheControl?)`
- `getObjectStream(key)`
- `getObjectText(key)`
- `getObjectBuffer(key)`
- `deletePrefix(prefix)`

Bu metodlar B2/S3 SDK orqali ishlaydi. Public URL qaytarish video playback uchun ishlatilmaydi; video object keylar backend orqali himoyalanadi.

## Frontend integratsiyasi

Mavjud UI qayta yozilmaydi; faqat real API va status qo'shiladi.

### API

Yangi wrapper:

- `apiUploadVideoBlock(lessonId, file, label?, onProgress?)`
- `apiRetryVideoBlock(blockId)`
- `apiStartVideoPlayback(blockId)`

`courseStore.ts`:

- `addBlock` video uchun real API chaqiradi.
- Optimistic update yo'q: response kelgandan keyin state yangilanadi.
- `processing` video bor bo'lsa lesson blocks polling qiladi (`5s` interval).
- `ready` bo'lganda polling to'xtaydi.

### UI

`ContentBlockView.tsx`:

- Fayl tanlash inputi saqlanadi.
- Upload vaqtida progress ko'rsatiladi.
- `processingStatus = pending/processing`: spinner va "Video tayyorlanmoqda..." holati.
- `failed`: xato matni va "Qayta urinish" tugmasi.
- `ready`: HLS player ko'rsatiladi.
- `embedUrl` kiritilgan video tashqi iframe flowda qoladi.

HLS player:

- `hls.js` ishlatiladi.
- Safari native HLS bo'lsa `<video src={manifestUrl}>`.
- Boshqa browserlarda `Hls.loadSource(manifestUrl)`.

## Security

- Public MP4 link yo'q.
- AES key public B2 URL orqali berilmaydi.
- Manifest rewrite qilinadi, segment/key URLlar backend token endpointlariga bog'lanadi.
- Token muddati 2 soat.
- Student access faqat play session boshlanishida DB orqali tekshiriladi.
- Teacher upload/retry/delete faqat ownership tekshiruvidan o'tadi.
- Token leak bo'lsa ham muddati qisqa. Bu DRM emas, lekin oddiy downloadni qiyinlashtiradi.

## Error handling

- Upload validation: faqat video MIME/ext qabul qilinadi.
- File size limit env orqali sozlanadi, default `500MB`.
- `ffmpeg` xatosi DB'da `failed` status va qisqa `errorMessage` bilan saqlanadi.
- Background job xatosi API requestni buzmaydi; UI polling status orqali xabar oladi.
- B2 delete best-effort: xato log qilinadi, lekin content block delete API doimiy osilib qolmaydi.

## Deploy va environment

Backend Docker image:

- `ffmpeg` o'rnatiladi.
- `/tmp/video-jobs` yozish mumkin bo'lishi kerak.

Env:

```bash
VIDEO_MAX_UPLOAD_MB=500
VIDEO_PLAYBACK_TOKEN_SECRET=<long-random-secret>
VIDEO_PLAYBACK_TOKEN_TTL_SECONDS=7200
VIDEO_HLS_SEGMENT_SECONDS=6
```

Mavjud B2 envlar ishlatiladi:

```bash
OBJECT_STORAGE_ENDPOINT=...
OBJECT_STORAGE_REGION=...
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_BUCKET_NAME=...
OBJECT_STORAGE_PUBLIC_BASE_URL=...
```

## Test rejasi

Backend:

- `VideoJobService` MVP enqueue test: `process(blockId)` chaqirilishini tekshiradi.
- `VideoPlaybackService` token sign/verify test.
- Access yo'q student uchun `/videos/:blockId/play` 403 qaytaradi.
- Teacher ownership yo'q lesson uchun upload 404/403 qaytaradi.
- `content_blocks` video status update flow unit/integration test.

Frontend:

- Video block upload API wrapper test/mock.
- `ContentBlockView` status renderlari: uploading, processing, failed, ready.
- HLS player hls.js lifecycle cleanup.

Build:

- `npm run build --workspace=apps/backend`
- `npm test --workspace=apps/backend`
- `npm run build --workspace=apps/frontend`

## Migratsiya va rollout

1. Schema ustunlarini qo'shish.
2. StorageService stream/buffer helperlarini qo'shish.
3. Video backend module va endpoints.
4. Docker image'ga `ffmpeg`.
5. Frontend video upload/status/HLS player.
6. VPS deploydan keyin migration qo'lda tekshiriladi.

Drizzle migration SQL qo'lda tekshiriladi. Agar `npm run db:migrate` drift sabab ishlamasa, migration SQL `psql "$DATABASE_URL" -f <file>.sql` bilan qo'lda qo'llanadi va `\d content_blocks` bilan tekshiriladi.

## Keyinchalik BullMQ/Redisga o'tish yo'li

O'zgarmaydigan qismlar:

- DB schema.
- `VideoTranscodeService.process(blockId)`.
- Playback token/manifest/key/segment endpointlari.
- Frontend upload/status/player UI.

Almashadigan qism:

- `VideoJobService.enqueue()` Redis queue'ga yozadi.
- Alohida worker process queue'dan job olib `VideoTranscodeService.process(blockId)` chaqiradi.
- Docker Compose'ga `redis` va `video-worker` service qo'shiladi.

Shu sababli MVP implementatsiya keyingi scale bosqichiga to'siq bo'lmaydi.
