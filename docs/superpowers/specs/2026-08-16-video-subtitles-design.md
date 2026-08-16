# Video subtitles (teacher upload + student toggle)

Status: approved, ready for planning
Date: 2026-08-16

## Problem

Video content blocks inside lessons have no subtitle/caption support. Teachers
have no way to attach subtitles to a lesson video, and students have no way
to see captions while watching. This spec adds:

- A teacher-side `.srt` subtitle upload/replace/remove flow for video content
  blocks, on web only (the mobile app has no lesson-content-authoring surface
  at all today — course/lesson editing is entirely web-based).
- A student-side "CC" (closed captions) toggle in the video player, on both
  web and mobile, that shows/hides the uploaded subtitles during playback.

## Scope decisions (confirmed with user)

- **One subtitle file per video block.** No multi-language support. A video
  either has zero or one subtitle track.
- **Manual upload only.** No auto-generated (ASR/speech-to-text) subtitles in
  this iteration. The teacher must have a finished `.srt` file in hand
  (e.g. produced by an offline tool) and upload it through the block editor.
- **Storage format: WebVTT.** The teacher uploads `.srt`; the backend
  converts it to `.vtt` server-side (plain text/timestamp transformation, no
  ffmpeg/AI involved) and stores only the `.vtt` file. Both the web
  `<video><track>` element and `react-native-video`'s `textTracks` prop
  require WebVTT (or SubRip via `TextTrackType.SUBRIP`, but VTT is the
  standard web-native format and avoids relying on native SRT parsing on
  Android/iOS, so we standardize on VTT everywhere).
- **Public URL serving, no signed-token gating.** Unlike the HLS
  manifest/segments/key (which are gated behind a signed playback token to
  discourage video piracy), the subtitle `.vtt` file is served as a plain
  public S3 URL via the existing `StorageService.getPublicUrl()`. Subtitle
  text is low-value compared to the video itself, and gating it would add
  meaningful complexity (routing through the manifest-rewrite/token-verify
  path) for no real protection benefit.
- **Mobile is student-only for this feature.** No mobile upload UI is built.

## Architecture

### Backend — data model

Add two nullable columns to the existing `content_blocks` table
(`apps/backend/src/db/schema.ts`, alongside the other video-specific columns
like `hlsMasterKey`/`sourceKey`):

```ts
subtitleKey: text('subtitle_key'),           // S3 key of the converted .vtt file
subtitleFileName: text('subtitle_file_name'), // original uploaded filename, for UI display
```

No new table. This mirrors how other single-valued video fields
(`hlsMasterKey`, `durationSec`, etc.) already live directly on
`content_blocks` rather than a child table — appropriate since this is a
one-to-one (not one-to-many) relationship per the "one subtitle per video"
scope decision.

A Drizzle migration is required to add these columns.

### Backend — upload/convert/delete endpoints

New routes on the existing `VideosController`
(`apps/backend/src/videos/videos.controller.ts`), following the exact
pattern already used for `POST /lessons/:lessonId/videos` (multer
memoryStorage, role guard, ownership check via the service layer):

```ts
@Post('blocks/:blockId/subtitles')
@Roles('teacher', 'super')
@UseInterceptors(FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — SRT files are plain text, never large
  fileFilter: (_req, file, cb) => {
    if (/\.srt$/i.test(file.originalname)) cb(null, true);
    else cb(new BadRequestException('Faqat .srt fayllar qabul qilinadi'), false);
  },
}))
uploadSubtitle(@Param('blockId') blockId: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
  return this.videoUploadService.uploadSubtitle(blockId, req.admin.id, file);
}

@Delete('blocks/:blockId/subtitles')
@Roles('teacher', 'super')
removeSubtitle(@Param('blockId') blockId: string, @Req() req: any) {
  return this.videoUploadService.removeSubtitle(blockId, req.admin.id);
}
```

New methods on `VideoUploadService`
(`apps/backend/src/videos/video-upload.service.ts`), reusing the existing
`assertLessonOwnership`-via-block pattern already used by `retry()`:

- `uploadSubtitle(blockId, adminId, file)`:
  1. Look up the block, assert `type === 'video'`, assert lesson ownership
     (same pattern as `retry()`: `db.query.contentBlocks.findFirst` →
     `assertLessonOwnership(block.lessonId, adminId)`).
  2. Parse the uploaded `.srt` buffer as UTF-8 text, run it through a new
     pure conversion function `srtToVtt(srtText: string): string` (new file
     `apps/backend/src/videos/srt-to-vtt.ts`, unit-testable in isolation —
     see Conversion algorithm below).
  3. If conversion fails (malformed SRT — no valid cue blocks found), throw
     `BadRequestException("SRT fayl noto'g'ri formatda")`.
  4. Upload the converted text to S3 at
     `videos/${lessonId}/${blockId}/subtitles/subtitle.vtt` via
     `storageService.uploadBuffer(key, Buffer.from(vttText, 'utf-8'), 'text/vtt')`.
     If a previous subtitle already existed at that key, this simply
     overwrites it (no separate delete-then-upload needed since the key is
     stable per block).
  5. Update the block row: `subtitleKey`, `subtitleFileName: file.originalname`.
  6. Return the updated block row.
- `removeSubtitle(blockId, adminId)`:
  1. Same ownership check.
  2. If `block.subtitleKey`, call `storageService.deleteFile(block.subtitleKey)`.
  3. Update the block row: `subtitleKey: null`, `subtitleFileName: null`.
  4. Return the updated block row.

No changes needed to `content-blocks.service.ts`'s `remove()` (whole-block
deletion) — it already calls
`storageService.deletePrefix('videos/${lessonId}/${blockId}/')` on video
block delete, which recursively removes everything under that prefix
including the new `subtitles/` subfolder.

### Backend — conversion algorithm (`srt-to-vtt.ts`)

SRT and WebVTT are structurally almost identical (sequence number, timing
line, text lines, blank-line-separated cues). The only required
transformations:

1. Prepend a `WEBVTT` header line + blank line.
2. In every timing line, replace the comma-based millisecond separator with
   a period: `00:00:20,000 --> 00:00:24,400` → `00:00:20.000 --> 00:00:24.400`.
3. Strip a UTF-8 BOM if present at the start of the file (common in SRT
   files exported from Windows tools).
4. Normalize line endings to `\n`.

The numeric sequence-index lines (`1`, `2`, `3`, ...) are valid in WebVTT
too, so they do not need to be removed — keeping them is simpler and still
spec-compliant.

Validation: after conversion, confirm the text contains at least one
`-->` timing arrow; if not, treat the file as malformed and reject it
before writing to S3.

### Backend — playback response

`VideoPlaybackService.startPlayback()`
(`apps/backend/src/videos/video-playback.service.ts`) already loads `block`
via `getVideoContext(blockId)` before building its response. Add one field:

```ts
return {
  token,
  expiresAt: ...,
  manifestUrl: ...,
  subtitleUrl: block.subtitleKey ? this.storageService.getPublicUrl(block.subtitleKey) : null,
};
```

This is the only backend change needed to get the subtitle URL to players —
both web and mobile already call `startPlayback` (`POST /videos/:blockId/play`)
as their first step before loading the video, so no new endpoint or extra
round-trip is needed on the playback side.

### Frontend (web) — types & API client

`apps/frontend/src/stores/courseTypes.ts` — add to `ContentBlock`:
```ts
subtitleKey?: string;
subtitleFileName?: string;
```

`apps/frontend/src/api/contentBlocks.ts`:
- Add matching fields to `ApiContentBlock`.
- Add `subtitleUrl?: string | null` to the `apiStartVideoPlayback` return type.
- Add:
  ```ts
  export async function apiUploadSubtitle(blockId: string, file: File): Promise<ApiContentBlock> { ... }
  export async function apiDeleteSubtitle(blockId: string): Promise<ApiContentBlock> { ... }
  ```
  following the existing multipart-upload pattern used elsewhere in this
  file (e.g. however the file-block upload constructs its `FormData`/axios
  call).

`apps/frontend/src/stores/slices/courseHelpers.ts` — add `subtitleKey`/
`subtitleFileName` mapping to `toFrontendBlock`.

`apps/frontend/src/stores/courseStore.ts` — add two store actions,
`uploadSubtitleBlock(courseId, moduleId, lessonId, blockId, file)` and
`removeSubtitleBlock(courseId, moduleId, lessonId, blockId)`, mirroring the
existing `retryVideoBlock` action shape exactly (call the API, map the
response through `toFrontendBlock`, splice it into the nested
courses/modules/lessons/blocks state tree).

### Frontend (web) — teacher upload UI

`apps/frontend/src/components/course/ContentBlockView.tsx`:
- Add two new props: `onUploadSubtitle: (file: File) => void` and
  `onRemoveSubtitle: () => void`.
- Insert a small subtitle control directly below the existing
  `<HlsVideoPlayer blockId={block.id} />` render (after line ~304, inside
  the `!block.embedUrl && block.type === 'video' && processingStatus === 'ready'`
  guard so it only appears once the video itself is playable):
  - If `block.subtitleFileName` is set: show the filename with a small
    caption/subtitle icon, plus an "X" remove button (calls
    `onRemoveSubtitle`), styled consistently with the existing file-chip
    pattern used for `file`-type blocks (line ~379-390).
  - If not set: show a small "Subtitle yuklash (.srt)" button — a hidden
    `<input type="file" accept=".srt">` triggered by a styled label/button,
    calling `onUploadSubtitle(file)` on change.
- No loading spinner state is needed beyond what a simple disabled-button-
  while-uploading treatment provides — subtitle files are small and the
  upload is a single-shot multipart POST (unlike video, no
  initiate/complete/poll dance).

`apps/frontend/src/components/course/LessonEditorView.tsx` — wire the two
new callbacks through to `<ContentBlockView>`, calling the new store
actions, mirroring how `onRetryVideo` is wired at line ~321.

### Frontend (web) — student player CC toggle

`apps/frontend/src/components/course/HlsVideoPlayer.tsx`:
- Capture `subtitleUrl` from the existing `apiStartVideoPlayback(blockId)`
  call in the boot `useEffect` (~line 159) into a new
  `const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null)`.
- Add `const [captionsOn, setCaptionsOn] = useState(false)` (default off,
  consistent with how most players default captions off unless a user
  preference says otherwise — no persistence needed for this iteration).
- In the JSX, if `subtitleUrl` is set, render inside the `<video>` element:
  ```tsx
  <track kind="subtitles" src={subtitleUrl} srcLang="uz" label="Subtitle" default={false} />
  ```
  and toggle visibility by setting `videoRef.current.textTracks[0].mode`
  to `'showing'`/`'hidden'` in a `useEffect` keyed on `captionsOn` (native
  `<track>` elements don't respond to a prop for on/off — the
  `TextTrack.mode` property must be set imperatively).
- Add a small "CC" toggle button next to the existing fullscreen button
  (~line 404-411 per prior research), only rendered when `subtitleUrl` is
  truthy. Active/inactive state shown via a filled vs. outline style
  consistent with the fullscreen button's existing look.

### Mobile — types & API client

`apps/mobile/src/api/videos.ts` — add `subtitleUrl?: string | null` to the
`apiStartVideoPlayback` return type (mirrors the web change exactly, same
field name, since both hit the same backend endpoint/shape).

### Mobile — student player CC toggle

`apps/mobile/src/components/HlsVideoPlayer.tsx`:
- Add `const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null)`
  and capture it in the existing playback-fetch `useEffect` (~line 134-148)
  alongside `setManifestUrl`.
- Add `const [captionsOn, setCaptionsOn] = useState(false)`.
- Pass to the `<Video>` element (~line 347-359):
  ```tsx
  textTracks={subtitleUrl ? [{title: 'Subtitle', language: 'uz', type: TextTrackType.VTT, uri: subtitleUrl}] : undefined}
  selectedTextTrack={captionsOn ? {type: SelectedTrackType.TITLE, value: 'Subtitle'} : {type: SelectedTrackType.DISABLED}}
  ```
  (types imported from `react-native-video`, confirmed available in the
  installed version's `lib/types/video.d.ts`).
- Add a CC toggle `Pressable` next to the existing fullscreen button
  (~line 384-391), same black/45%-opacity circular-button styling, only
  rendered when `subtitleUrl` is truthy.

### Error handling

- Backend: malformed SRT → `400 Bad Request` with a Uzbek error message,
  surfaced by the frontend upload button (toast/inline error — reuse
  whatever error-surfacing convention `ContentBlockView.tsx`'s existing
  file-upload path uses, if any, otherwise a simple `alert`/toast consistent
  with the rest of the course editor).
- Backend: file too large (>2MB) or wrong extension → multer's own
  `fileFilter`/`limits` rejection, same as the existing video upload route's
  error surfacing.
- Player (both platforms): if `subtitleUrl` fails to load (404, network
  error), the CC button simply has no effect — no special error UI, since
  native `<track>`/`textTracks` degrade silently to "no captions available"
  without breaking video playback.

### Testing

- Backend: unit test `srt-to-vtt.ts` in isolation (`srt-to-vtt.spec.ts`,
  following the existing `video-upload.service.spec.ts` convention) —
  cover: valid multi-cue SRT → correct VTT header/timestamp conversion,
  BOM stripping, malformed input (no `-->`) → rejected.
  Also extend `video-upload.service.spec.ts` with `uploadSubtitle`/
  `removeSubtitle` cases (ownership check, wrong block type, S3 key
  written/cleared correctly) mirroring existing test patterns in that file.
- Frontend/mobile: manual verification only (per this repo's existing
  balance of unit vs. manual testing for UI-heavy player code) — upload a
  real `.srt` as a teacher on web, confirm the CC toggle shows captions in
  sync on both a web browser and the mobile app.

## Out of scope (explicitly deferred)

- Auto-generated (ASR) subtitles from video audio — a separate, much larger
  feature (GPU/CPU transcription infrastructure, job queueing, cost) that
  the user explicitly deferred during design discussion.
- Multiple subtitle languages per video.
- Mobile teacher-side upload (mobile has no content-authoring surface at
  all today; adding one is out of scope here).
- Signed/token-gated subtitle serving.
- Persisting the student's CC on/off preference across sessions.
