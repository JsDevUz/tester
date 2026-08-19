# Offline Video: Switch to Local HLS Playlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make offline-downloaded videos actually playable on iOS by replacing the single concatenated `video.ts` file with a proper local HLS asset: each decrypted segment kept as its own `.ts` file plus a locally-generated `.m3u8` playlist referencing them.

**Architecture:** `downloadOfflineVideo` currently AES-CBC-decrypts every HLS segment and byte-concatenates the plaintext into one `video.ts` file ([offlineVideoService.ts:252-272](../../../apps/mobile/src/lib/offlineVideoService.ts#L252-L272)). `AVFoundation` (iOS, via `react-native-video`) refuses to open that file (`AVFoundationErrorDomain -11828 "This media format is not supported."`), confirmed via device log capture — the file parses under `ffprobe` (lenient) with `probe_score=50` and duplicate audio-stream entries, evidence of the concatenation seams `AVPlayer` won't tolerate. The fix: keep each decrypted segment as `segment_XXX.ts` under the block's local directory, and write a plaintext local `local.m3u8` (no `#EXT-X-KEY`, since segments are already decrypted) with correct `#EXTINF` durations pulled from the original remote manifest. `react-native-video` then plays this as real local HLS, which `AVPlayer`/`ExoPlayer` both support natively, including seeking.

**Tech Stack:** React Native (`apps/mobile`), `react-native-blob-util` for filesystem, `aes-js` for AES-128-CBC decryption, `react-native-video` (v6.19.2) player, Jest for tests.

**Spec:** No separate spec doc — this plan is scoped directly from the bug investigation in this conversation (device log evidence + `ffprobe` analysis) and from the pre-existing test file `apps/mobile/__tests__/offlineVideoService.test.ts`, whose mocks already assume a `local.m3u8` + `segment_000.ts` layout, confirming this was the intended design that the shipped `video.ts`-concatenation implementation diverged from.

## Global Constraints

- No new dependencies — segments are decrypted client-side already; no native remux library needed.
- Local manifest must NOT contain `#EXT-X-KEY` — segments on disk are plaintext once decrypted, so no local decryption step is needed at playback time.
- Preserve the existing on-disk directory (`getOfflineVideoDir(blockId)`), registry shape (`OfflineVideoMeta`), and public function names consumed by `HlsVideoPlayer.tsx` and `offlineVideoStore.ts` (`getOfflineVideoMeta`, `isOfflineVideoReady`, `downloadOfflineVideo`, `startAutoCacheVideo`, `deleteOfflineVideo`, `clearAllOfflineVideos`, `cancelOfflineDownload`) — only their internals change.
- `#EXTINF` segment durations must come from the real remote manifest (already emitted by the backend via ffmpeg's `-hls_time`/standard HLS muxing, per `apps/backend/src/videos/video-transcode.service.ts`), not guessed/uniform values — mismatched durations break native seeking.
- Existing downloaded videos on users' devices (old `video.ts` layout) will not be auto-migrated in this plan — `isOfflineVideoReady` must treat a stale `video.ts`-only directory as NOT ready so playback correctly falls through to online/error rather than trying to play the broken file again. (No migration task — out of scope; flagged as a follow-up, not silently ignored.)

---

## File Structure

- **Modify: `apps/mobile/src/lib/offlineVideoService.ts`**
  - `getLocalVideoPath` removed (no longer meaningful — there is no single video file).
  - `getLocalManifestPath(blockId)` now returns `${getOfflineVideoDir(blockId)}/local.m3u8` (a real, distinct path from segments — fixes the original `video.ts`/`video.ts` alias bug too).
  - New `getLocalSegmentPath(blockId, index)` returns `${getOfflineVideoDir(blockId)}/segment_${pad3(index)}.ts`.
  - `isOfflineVideoReady` checks for `local.m3u8` existence + size instead of `video.ts`.
  - `getOfflineVideoMeta` returns `localManifestPath` pointing at `local.m3u8`.
  - `downloadOfflineVideo`: parse `#EXTINF` durations alongside segment names; decrypt each segment to its own segment file (no append/concat); after all segments succeed, write `local.m3u8` with correct `#EXTINF` lines, `#EXT-X-VERSION:3`, `#EXT-X-TARGETDURATION`, `#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-ENDLIST`; final registry save uses the (already-fixed) `videoLocalPath`-equivalent renamed to `localManifestPath` pointing at `local.m3u8`.
  - `deleteOfflineVideo` unchanged (already deletes the whole block directory recursively).
- **Modify: `apps/mobile/__tests__/offlineVideoService.test.ts`**
  - Extend existing mocks/tests to cover the new `local.m3u8` + `segment_000.ts` reality end-to-end (the mocks already assume this layout; wire real assertions to it).
- **No changes needed to `apps/mobile/src/components/HlsVideoPlayer.tsx`** — it already only consumes `localMeta.localManifestPath` / `localMeta.localSubtitlePath` off the `OfflineVideoMeta` object and treats it as an opaque `file://` URI for `react-native-video`'s `source.uri`; `react-native-video` handles a local `.m3u8` `file://` URI as HLS automatically.
- **No changes needed to `apps/mobile/src/store/offlineVideoStore.ts`** — it's a thin pass-through over `offlineVideoService.ts`'s public API, which keeps the same function signatures.

---

## Task 1: Fix the already-identified `localManifestPath` scope bug while touching this code

This was found and fixed earlier in the debugging session at `offlineVideoService.ts:460` (`localManifestPath` → `videoLocalPath`). Task 2 replaces that whole block anyway (renaming `videoLocalPath` further), so this task is a no-op checkpoint confirming the current state before the bigger rewrite — included so the plan's file history is self-consistent for whoever executes it.

**Files:**
- Verify: `apps/mobile/src/lib/offlineVideoService.ts:460`

**Interfaces:**
- Consumes: n/a
- Produces: n/a

- [ ] **Step 1: Confirm current state**

Run: `grep -n "localManifestPath" apps/mobile/src/lib/offlineVideoService.ts`

Expected: line 460 reads `localManifestPath: videoLocalPath,` (already fixed earlier in this session). If it still reads bare `localManifestPath,`, apply that one-line fix first before continuing to Task 2.

- [ ] **Step 2: Run tsc to confirm no TS2552 error remains**

Run: `cd apps/mobile && npx tsc --noEmit -p . 2>&1 | grep -i "offlineVideoService.*TS2552"`

Expected: no output (empty).

---

## Task 2: Rewrite `offlineVideoService.ts` path helpers and download pipeline for local HLS playlist

**Files:**
- Modify: `apps/mobile/src/lib/offlineVideoService.ts`
- Test: `apps/mobile/__tests__/offlineVideoService.test.ts`

**Interfaces:**
- Consumes: `ReactNativeBlobUtil.fs.{exists,stat,mkdir,writeFile,readFile,unlink,ls}`, `aesjs.ModeOfOperation.cbc`, `apiStartVideoPlayback(blockId): Promise<{token, manifestUrl, expiresAt, subtitleUrl}>`
- Produces (unchanged public signatures, consumed by `HlsVideoPlayer.tsx` / `offlineVideoStore.ts`):
  - `getOfflineBaseDir(): string`
  - `getOfflineVideoDir(blockId: string): string`
  - `getLocalManifestPath(blockId: string): string` — now returns a real `local.m3u8` path, distinct from segment paths
  - `getLocalKeyPath(blockId: string): string` (unchanged, now unused internally but kept exported since it's public API — no other file imports it today, confirmed via `grep -rn "getLocalKeyPath" apps/mobile/src apps/mobile/__tests__`, safe to keep as a harmless export)
  - `getLocalSubtitlePath(blockId: string): string` (unchanged)
  - New: `getLocalSegmentPath(blockId: string, index: number): string` — `${getOfflineVideoDir(blockId)}/segment_${String(index).padStart(3, '0')}.ts`
  - `interface OfflineVideoMeta` (unchanged shape)
  - `isOfflineVideoReady(blockId: string): Promise<boolean>` (same signature, checks `local.m3u8` now)
  - `getOfflineVideoMeta(blockId: string): Promise<OfflineVideoMeta | null>` (same signature)
  - `downloadOfflineVideo(blockId, options, onProgress?): Promise<OfflineVideoMeta>` (same signature)
  - `startAutoCacheVideo`, `cancelOfflineDownload`, `deleteOfflineVideo`, `clearAllOfflineVideos`, `getOfflineVideosStorageSize` (all unchanged signatures/behavior)

- [ ] **Step 1: Write the failing test for the new path helpers and readiness check**

Add to `apps/mobile/__tests__/offlineVideoService.test.ts`, replacing the whole file:

```typescript
import {
  clearAllOfflineVideos,
  deleteOfflineVideo,
  getLocalManifestPath,
  getLocalSegmentPath,
  getOfflineVideoMeta,
  getOfflineVideosRegistry,
  isOfflineVideoReady,
} from '../src/lib/offlineVideoService';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
  };
});

jest.mock('react-native-blob-util', () => {
  const mockFiles: Record<string, {type: string; size: number}> = {
    '/mock_docs/jamm_offline_videos/block-1/local.m3u8': {type: 'file', size: 1024},
    '/mock_docs/jamm_offline_videos/block-1/enc.key': {type: 'file', size: 16},
    '/mock_docs/jamm_offline_videos/block-1/segment_000.ts': {type: 'file', size: 1024 * 100},
  };

  return {
    __esModule: true,
    default: {
      fs: {
        dirs: {
          DocumentDir: '/mock_docs',
        },
        exists: jest.fn(async (path: string) => Boolean(mockFiles[path])),
        mkdir: jest.fn(async () => {}),
        writeFile: jest.fn(async () => {}),
        ls: jest.fn(async () => ['local.m3u8', 'enc.key', 'segment_000.ts']),
        stat: jest.fn(async (path: string) => mockFiles[path] ?? {type: 'file', size: 100}),
        unlink: jest.fn(async (path: string) => {
          for (const k of Object.keys(mockFiles)) {
            if (k.startsWith(path)) delete mockFiles[k];
          }
        }),
      },
      config: () => ({
        fetch: jest.fn(async () => ({
          info: () => ({status: 200}),
        })),
      }),
    },
  };
});

describe('offlineVideoService', () => {
  it('returns empty registry initially', async () => {
    const registry = await getOfflineVideosRegistry();
    expect(registry).toEqual({});
  });

  it('builds distinct manifest and segment paths', () => {
    const manifestPath = getLocalManifestPath('block-1');
    const segmentPath = getLocalSegmentPath('block-1', 0);
    expect(manifestPath).toBe('/mock_docs/jamm_offline_videos/block-1/local.m3u8');
    expect(segmentPath).toBe('/mock_docs/jamm_offline_videos/block-1/segment_000.ts');
    expect(manifestPath).not.toBe(segmentPath);
  });

  it('checks if offline video is ready correctly for a non-existent block', async () => {
    const ready = await isOfflineVideoReady('non-existent');
    expect(ready).toBe(false);
  });

  it('reports ready when local.m3u8 exists with sufficient size', async () => {
    const ready = await isOfflineVideoReady('block-1');
    expect(ready).toBe(true);
  });

  it('returns meta with the m3u8 manifest path when ready', async () => {
    const meta = await getOfflineVideoMeta('block-1');
    expect(meta).not.toBeNull();
    expect(meta?.localManifestPath).toBe('/mock_docs/jamm_offline_videos/block-1/local.m3u8');
  });

  it('handles deleteOfflineVideo gracefully', async () => {
    await expect(deleteOfflineVideo('block-1')).resolves.toBeUndefined();
  });

  it('handles clearAllOfflineVideos gracefully', async () => {
    await expect(clearAllOfflineVideos()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest __tests__/offlineVideoService.test.ts -v`

Expected: FAIL — `getLocalSegmentPath` is not exported, and `isOfflineVideoReady('block-1')` currently checks for `video.ts` (not in the mock's `mockFiles`), so it returns `false` instead of `true`.

- [ ] **Step 3: Replace the path helpers (lines 19-33)**

In `apps/mobile/src/lib/offlineVideoService.ts`, replace:

```typescript
export function getLocalVideoPath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/video.ts`;
}

export function getLocalManifestPath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/video.ts`;
}

export function getLocalKeyPath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/enc.key`;
}

export function getLocalSubtitlePath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/subtitles.vtt`;
}
```

with:

```typescript
export function getLocalManifestPath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/local.m3u8`;
}

export function getLocalSegmentPath(blockId: string, index: number): string {
  return `${getOfflineVideoDir(blockId)}/segment_${String(index).padStart(3, '0')}.ts`;
}

export function getLocalKeyPath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/enc.key`;
}

export function getLocalSubtitlePath(blockId: string): string {
  return `${getOfflineVideoDir(blockId)}/subtitles.vtt`;
}
```

- [ ] **Step 4: Update `isOfflineVideoReady` (lines 90-101) to check the manifest, not `video.ts`**

Replace:

```typescript
export async function isOfflineVideoReady(blockId: string): Promise<boolean> {
  try {
    const videoPath = getLocalVideoPath(blockId);
    const exists = await ReactNativeBlobUtil.fs.exists(videoPath).catch(() => false);
    if (!exists) return false;

    const stat = await ReactNativeBlobUtil.fs.stat(videoPath).catch(() => null);
    return Boolean(stat && Number(stat.size) > 1000);
  } catch {
    return false;
  }
}
```

with:

```typescript
export async function isOfflineVideoReady(blockId: string): Promise<boolean> {
  try {
    const manifestPath = getLocalManifestPath(blockId);
    const exists = await ReactNativeBlobUtil.fs.exists(manifestPath).catch(() => false);
    if (!exists) return false;

    const stat = await ReactNativeBlobUtil.fs.stat(manifestPath).catch(() => null);
    if (!stat || Number(stat.size) === 0) return false;

    const firstSegmentPath = getLocalSegmentPath(blockId, 0);
    const firstSegmentExists = await ReactNativeBlobUtil.fs.exists(firstSegmentPath).catch(() => false);
    return firstSegmentExists;
  } catch {
    return false;
  }
}
```

(Checking segment 0 in addition to the manifest guards against a stale/orphaned `local.m3u8` from an interrupted download where the manifest write raced ahead of segment writes — belt-and-suspenders given `downloadOfflineVideo` in Step 6 only writes the manifest as the very last step, but cheap to check.)

- [ ] **Step 5: Update `getOfflineVideoMeta` (lines 106-126) to use the new manifest path**

Replace:

```typescript
export async function getOfflineVideoMeta(blockId: string): Promise<OfflineVideoMeta | null> {
  const ready = await isOfflineVideoReady(blockId);
  if (!ready) return null;
  const registry = await getOfflineVideosRegistry();
  const meta = registry[blockId];
  const videoPath = getLocalVideoPath(blockId);
  const subPath = getLocalSubtitlePath(blockId);
  const subExists = await ReactNativeBlobUtil.fs.exists(subPath).catch(() => false);

  return {
    blockId,
    lessonId: meta?.lessonId,
    courseId: meta?.courseId,
    title: meta?.title || 'Video dars',
    durationSec: meta?.durationSec,
    totalBytes: meta?.totalBytes || 0,
    downloadedAt: meta?.downloadedAt || new Date().toISOString(),
    localManifestPath: videoPath,
    localSubtitlePath: subExists ? subPath : null,
  };
}
```

with:

```typescript
export async function getOfflineVideoMeta(blockId: string): Promise<OfflineVideoMeta | null> {
  const ready = await isOfflineVideoReady(blockId);
  if (!ready) return null;
  const registry = await getOfflineVideosRegistry();
  const meta = registry[blockId];
  const manifestPath = getLocalManifestPath(blockId);
  const subPath = getLocalSubtitlePath(blockId);
  const subExists = await ReactNativeBlobUtil.fs.exists(subPath).catch(() => false);

  return {
    blockId,
    lessonId: meta?.lessonId,
    courseId: meta?.courseId,
    title: meta?.title || 'Video dars',
    durationSec: meta?.durationSec,
    totalBytes: meta?.totalBytes || 0,
    downloadedAt: meta?.downloadedAt || new Date().toISOString(),
    localManifestPath: manifestPath,
    localSubtitlePath: subExists ? subPath : null,
  };
}
```

- [ ] **Step 6: Run test to verify Steps 3-5 pass the readiness/meta tests**

Run: `cd apps/mobile && npx jest __tests__/offlineVideoService.test.ts -v`

Expected: `builds distinct manifest and segment paths`, `reports ready when local.m3u8 exists with sufficient size`, and `returns meta with the m3u8 manifest path when ready` now PASS. `downloadOfflineVideo` isn't touched yet, so no regressions expected there (it's not under test here).

- [ ] **Step 7: Add `#EXTINF` duration capture to the manifest parser (lines 315-342)**

Replace:

```typescript
    // 3. Parse key URI and segment filenames
    let keyRemoteUrl: string | null = null;
    let keyIvHex: string | null = null;
    const segmentNames: string[] = [];
    const manifestLines = manifestText.split('\n');

    for (const line of manifestLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-KEY')) {
        const match = trimmed.match(/URI="([^"]+)"/);
        if (match && match[1]) {
          const rawKeyUri = match[1];
          keyRemoteUrl = rawKeyUri.startsWith('http')
            ? rawKeyUri
            : `${API_BASE}/videos/${blockId}/${rawKeyUri}`;
        }
        const ivMatch = trimmed.match(/IV=([^,\s]+)/);
        if (ivMatch && ivMatch[1]) {
          keyIvHex = ivMatch[1];
        }
      } else if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
        segmentNames.push(trimmed);
      }
    }

    if (segmentNames.length === 0) {
      throw new Error('Video segmentlari topilmadi');
    }
```

with:

```typescript
    // 3. Parse key URI, segment filenames, and per-segment durations
    let keyRemoteUrl: string | null = null;
    let keyIvHex: string | null = null;
    const segmentNames: string[] = [];
    const segmentDurations: number[] = [];
    let pendingDuration = 0;
    const manifestLines = manifestText.split('\n');

    for (const line of manifestLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-KEY')) {
        const match = trimmed.match(/URI="([^"]+)"/);
        if (match && match[1]) {
          const rawKeyUri = match[1];
          keyRemoteUrl = rawKeyUri.startsWith('http')
            ? rawKeyUri
            : `${API_BASE}/videos/${blockId}/${rawKeyUri}`;
        }
        const ivMatch = trimmed.match(/IV=([^,\s]+)/);
        if (ivMatch && ivMatch[1]) {
          keyIvHex = ivMatch[1];
        }
      } else if (trimmed.startsWith('#EXTINF')) {
        const durMatch = trimmed.match(/#EXTINF:([0-9.]+)/);
        pendingDuration = durMatch ? parseFloat(durMatch[1]) : 0;
      } else if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
        segmentNames.push(trimmed);
        segmentDurations.push(pendingDuration);
        pendingDuration = 0;
      }
    }

    if (segmentNames.length === 0) {
      throw new Error('Video segmentlari topilmadi');
    }
```

- [ ] **Step 8: Replace segment download/decrypt loop (lines 382-439) to write per-segment files instead of concatenating**

Replace the entire block from `// 6. Download and decrypt segments sequentially into video.ts` through the end of the `for` loop (through line 439, just before `if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');` at line 441):

```typescript
    // 6. Download and decrypt segments sequentially, each into its own local .ts file
    const totalSegments = segmentNames.length;
    let completedSegments = 0;

    for (let i = 0; i < segmentNames.length; i++) {
      if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

      const rawSegmentLine = segmentNames[i];
      const segRemoteUrl = rawSegmentLine.startsWith('http')
        ? rawSegmentLine
        : `${API_BASE}/videos/${blockId}/${rawSegmentLine}`;
      const tempEncPath = `${blockDir}/temp_${i}.enc`;
      const segmentLocalPath = getLocalSegmentPath(blockId, i);

      try {
        await downloadFileWithRetry(tempEncPath, segRemoteUrl, null, 3);
        if (keyBytes && keyBytes.length === 16) {
          const iv = parseIv(keyIvHex, i);
          await decryptSegmentToFile(tempEncPath, segmentLocalPath, keyBytes, iv);
        } else {
          const rawB64 = await ReactNativeBlobUtil.fs.readFile(tempEncPath, 'base64');
          await ReactNativeBlobUtil.fs.writeFile(segmentLocalPath, rawB64, 'base64');
        }
        await ReactNativeBlobUtil.fs.unlink(tempEncPath).catch(() => { });
      } catch (err: any) {
        throw new Error(`Segment yuklashda xatolik: segment_${i}.ts (${err?.message || 'tarmoq uzildi'})`);
      }

      completedSegments++;
      const percent = Math.min(95, Math.floor(20 + (completedSegments / totalSegments) * 75));
      onProgress?.(percent, `Yuklanmoqda: ${completedSegments}/${totalSegments}`);
    }

    // 7. Write the local HLS playlist referencing the decrypted local segments
    const targetDuration = Math.max(1, Math.ceil(Math.max(...segmentDurations, 1)));
    const manifestLinesOut = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-PLAYLIST-TYPE:VOD',
      ...segmentNames.flatMap((_name, i) => [
        `#EXTINF:${segmentDurations[i].toFixed(3)},`,
        `segment_${String(i).padStart(3, '0')}.ts`,
      ]),
      '#EXT-X-ENDLIST',
      '',
    ];
    const localManifestContent = manifestLinesOut.join('\n');
    const manifestLocalPath = getLocalManifestPath(blockId);
    await ReactNativeBlobUtil.fs.writeFile(manifestLocalPath, localManifestContent, 'utf8');

    // Save progressive metadata to registry now that segments + manifest exist
    const partialMeta: OfflineVideoMeta = {
      blockId,
      lessonId: options.lessonId,
      courseId: options.courseId,
      title: options.title || 'Video dars',
      durationSec: options.durationSec,
      totalBytes: 0,
      downloadedAt: new Date().toISOString(),
      localManifestPath: manifestLocalPath,
      localSubtitlePath,
    };
    const reg = await getOfflineVideosRegistry();
    reg[blockId] = partialMeta;
    await saveOfflineVideosRegistry(reg);
```

Note: the local manifest is now written only after ALL segments finish downloading (not incrementally), so `isOfflineVideoReady` (Step 4) correctly reports "not ready" for any interrupted/partial download — this fixes the earlier ambiguity where a partial `video.ts` could pass the size check but be truncated mid-segment. A cancelled or failed download simply leaves segment files + no manifest; a subsequent retry via `downloadOfflineVideo` will re-run and overwrite from segment 0 (existing `ensureDir`/re-entry behavior is unaffected since segment writes are idempotent per-index, unlike the old append-based approach which depended on `isFirst`).

- [ ] **Step 9: Update remaining references to the old `videoLocalPath`/`localManifestPath` variables in the final metadata block (lines that followed, now renumbered)**

Find the block starting at `// 8. Calculate total storage size` (originally line 443) through the end of the function's `try` block. It currently reads:

```typescript
    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    // 8. Calculate total storage size
    let totalBytes = 0;
    const allFiles = await ReactNativeBlobUtil.fs.ls(blockDir);
    for (const f of allFiles) {
      const stat = await ReactNativeBlobUtil.fs.stat(`${blockDir}/${f}`).catch(() => null);
      if (stat) totalBytes += Number(stat.size || 0);
    }

    // 9. Save final metadata in registry
    const meta: OfflineVideoMeta = {
      blockId,
      lessonId: options.lessonId,
      courseId: options.courseId,
      title: options.title || 'Video dars',
      durationSec: options.durationSec,
      totalBytes,
      downloadedAt: new Date().toISOString(),
      localManifestPath: videoLocalPath,
      localSubtitlePath,
    };
```

Change only the `localManifestPath` value (the rest is unaffected since `videoLocalPath` no longer exists anywhere in the function after Step 8's rewrite):

```typescript
    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    // 8. Calculate total storage size
    let totalBytes = 0;
    const allFiles = await ReactNativeBlobUtil.fs.ls(blockDir);
    for (const f of allFiles) {
      const stat = await ReactNativeBlobUtil.fs.stat(`${blockDir}/${f}`).catch(() => null);
      if (stat) totalBytes += Number(stat.size || 0);
    }

    // 9. Save final metadata in registry
    const meta: OfflineVideoMeta = {
      blockId,
      lessonId: options.lessonId,
      courseId: options.courseId,
      title: options.title || 'Video dars',
      durationSec: options.durationSec,
      totalBytes,
      downloadedAt: new Date().toISOString(),
      localManifestPath: manifestLocalPath,
      localSubtitlePath,
    };
```

- [ ] **Step 10: Replace `decryptAndAppendSegment` (lines 252-272) with a per-file `decryptSegmentToFile` helper**

Replace:

```typescript
async function decryptAndAppendSegment(
  encryptedLocalPath: string,
  targetVideoPath: string,
  keyBytes: Uint8Array,
  iv: Uint8Array,
  isFirst: boolean,
): Promise<void> {
  const base64Data = await ReactNativeBlobUtil.fs.readFile(encryptedLocalPath, 'base64');
  const encryptedBytes = base64ToUint8Array(base64Data);

  const aesCbc = new aesjs.ModeOfOperation.cbc(keyBytes, iv);
  const decryptedBytes = aesCbc.decrypt(encryptedBytes);
  const cleanBytes = removePkcs7Padding(decryptedBytes);

  const cleanBase64 = uint8ArrayToBase64(cleanBytes);
  if (isFirst) {
    await ReactNativeBlobUtil.fs.writeFile(targetVideoPath, cleanBase64, 'base64');
  } else {
    await ReactNativeBlobUtil.fs.appendFile(targetVideoPath, cleanBase64, 'base64');
  }
}
```

with:

```typescript
async function decryptSegmentToFile(
  encryptedLocalPath: string,
  targetSegmentPath: string,
  keyBytes: Uint8Array,
  iv: Uint8Array,
): Promise<void> {
  const base64Data = await ReactNativeBlobUtil.fs.readFile(encryptedLocalPath, 'base64');
  const encryptedBytes = base64ToUint8Array(base64Data);

  const aesCbc = new aesjs.ModeOfOperation.cbc(keyBytes, iv);
  const decryptedBytes = aesCbc.decrypt(encryptedBytes);
  const cleanBytes = removePkcs7Padding(decryptedBytes);

  const cleanBase64 = uint8ArrayToBase64(cleanBytes);
  await ReactNativeBlobUtil.fs.writeFile(targetSegmentPath, cleanBase64, 'base64');
}
```

- [ ] **Step 11: Remove the now-dead `existingVideoStat`/`isFirst` setup that preceded the old loop**

This was part of the block already replaced in Step 8 (the original lines 385-389: `const videoLocalPath = getLocalVideoPath(blockId);`, the `existingVideoStat` stat call, and `let isFirst = ...`). Confirm it's gone:

Run: `grep -n "videoLocalPath\|existingVideoStat\|isFirst" apps/mobile/src/lib/offlineVideoService.ts`

Expected: no output (empty) — all three were only used in the code replaced by Step 8.

- [ ] **Step 12: Run full test suite to verify everything passes**

Run: `cd apps/mobile && npx jest __tests__/offlineVideoService.test.ts -v`

Expected: all 7 tests PASS.

- [ ] **Step 13: Run tsc to confirm no new type errors**

Run: `cd apps/mobile && npx tsc --noEmit -p . 2>&1 | grep -i "offlineVideoService"`

Expected: only the 6 pre-existing, unrelated errors remain (the two `setTimeout`/`Promise` resolver typing warnings at what were lines 147/153, and the four `atob`/`btoa` global-lookup warnings at what were lines 163-194 — these predate this plan and are out of scope). Zero occurrences of `videoLocalPath`, `getLocalVideoPath`, `decryptAndAppendSegment`, or `TS2552`.

- [ ] **Step 14: Commit**

```bash
git add apps/mobile/src/lib/offlineVideoService.ts apps/mobile/__tests__/offlineVideoService.test.ts
git commit -m "fix: store offline videos as local HLS playlist instead of concatenated .ts

AVPlayer on iOS rejects the byte-concatenated video.ts file
(AVFoundationErrorDomain -11828 'This media format is not supported'),
confirmed via device log capture. Segments are now kept as individual
decrypted .ts files referenced by a locally-generated local.m3u8
playlist, which react-native-video plays as real local HLS."
```

---

## Task 3: Manual verification on iOS simulator

**Files:** none (manual QA task)

**Interfaces:**
- Consumes: the rebuilt app from Task 2

- [ ] **Step 1: Rebuild and relaunch the app on the iOS simulator**

Run: `cd apps/mobile && npx react-native run-ios`

- [ ] **Step 2: Clear any stale offline video data from the previous (broken) `video.ts` implementation**

In the running app, use the existing "delete downloaded video" UI action (long-press / the download-button's delete confirmation in `HlsVideoPlayer.tsx`), or if no video is marked downloaded in-session, manually clear the simulator's app documents directory for this bundle to remove any orphaned `video.ts` from earlier testing:

Run: `xcrun simctl get_app_container booted <bundle-id> data` to find the container, then remove `Documents/jamm_offline_videos/<blockId>/video.ts` if present, so `isOfflineVideoReady` (which now checks for `local.m3u8`) doesn't get confused by leftover files from the old format. (Not required for correctness — `isOfflineVideoReady` no longer looks at `video.ts` at all — but keeps the test directory clean.)

- [ ] **Step 3: Open a lesson video, let it auto-cache fully (or use the explicit Download button and wait for "Muvaffaqiyatli")**

Watch the download progress reach 100% / "Yakunlandi", or wait for the success alert if using the explicit download button.

- [ ] **Step 4: Verify segment files and manifest exist on disk**

Run: `find "$(xcrun simctl get_app_container booted <bundle-id> data)/Documents/jamm_offline_videos" -type f`

Expected: a `local.m3u8` file and multiple `segment_000.ts`, `segment_001.ts`, ... files, NOT a single `video.ts`.

- [ ] **Step 5: Inspect the generated manifest**

Run: `cat "$(xcrun simctl get_app_container booted <bundle-id> data)/Documents/jamm_offline_videos/<blockId>/local.m3u8"`

Expected: valid HLS playlist — `#EXTM3U`, `#EXT-X-VERSION:3`, `#EXT-X-TARGETDURATION:<n>`, `#EXT-X-PLAYLIST-TYPE:VOD`, alternating `#EXTINF:<duration>,` / `segment_NNN.ts` lines, ending `#EXT-X-ENDLIST`. No `#EXT-X-KEY` line.

- [ ] **Step 6: Disable network in the simulator (Settings > Wi-Fi off, or Network Link Conditioner) and reopen the same lesson video**

Expected: video plays from the local files with no "Internetga ulanmagansiz" error screen. Watch for the full cached duration (or as far as segments were downloaded, if playback was stopped before the download finished — though per this plan the manifest is only written after ALL segments complete, so a fully-interrupted download will correctly show the offline-error screen rather than attempting partial playback; this is a deliberate simplification versus the previous partial-progress approach, and acceptable since the ORIGINAL bug this plan fixes is about a *completed* download being unplayable, not partial-download UX).

- [ ] **Step 7: Check Metro/simulator logs for absence of the AVFoundationErrorDomain error**

Run: `xcrun simctl spawn booted log stream --level debug --predicate 'composedMessage CONTAINS "HlsVideoPlayer"'` while reproducing Step 6.

Expected: no `"Video onError event"` log line, or if present, no `-11828`/`"Cannot Open"` error.

- [ ] **Step 8: Re-enable network, confirm online playback still works (regression check)**

Expected: same lesson video plays normally when online, confirming the online (non-offline) code path in `HlsVideoPlayer.tsx` is unaffected by this change (it was never touched).

---

## Self-Review Notes

**Spec coverage:** The single requirement — "offline video should be playable on iOS after going offline, for as much as was downloaded" — is addressed by Task 2 (playlist generation) and verified end-to-end in Task 3. The pre-existing `localManifestPath` ReferenceError (Task 1) is folded in since Task 2 rewrites that same code region anyway.

**Placeholder scan:** No TBD/TODO markers; every step has literal code or literal shell commands.

**Type consistency:** `getLocalSegmentPath(blockId: string, index: number): string` is defined once in Task 2 Step 3 and used with the same signature in Step 8's download loop and in the test file's Step 1. `OfflineVideoMeta.localManifestPath` keeps its existing `string` type throughout — no shape change to the public interface, only what the string points to.

**Known follow-up (explicitly out of scope):** users who already downloaded a video under the old `video.ts` scheme will have an orphaned, unplayable file taking up disk space, and `getOfflineVideosStorageSize`/`clearAllOfflineVideos` will still count/clear it correctly since those operate on the whole directory tree — so no dangling-storage bug, just a UX nicety (auto-detecting and re-prompting a re-download of stale `video.ts`-only entries) that could be a fast-follow if it matters for this app's existing user base.
