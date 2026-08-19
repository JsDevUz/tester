import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { apiStartVideoPlayback } from '../api/videos';
import { API_URL } from '../config/env';
import { useAuthStore } from '../store/authStore';

const API_BASE = API_URL.replace(/\/$/, '');
const OFFLINE_VIDEOS_STORAGE_KEY = '@jamm_offline_videos_v1';
const BASE_OFFLINE_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/jamm_offline_videos`;

export interface OfflineVideoMeta {
  blockId: string;
  lessonId?: string;
  courseId?: string;
  title: string;
  durationSec?: number | null;
  totalBytes: number;
  downloadedAt: string;
  localManifestPath: string;
  localSubtitlePath?: string | null;
}

export type DownloadProgressCallback = (progressPercent: number, stageText: string) => void;

// Track in-flight downloads so duplicate downloads don't conflict
const activeCancelTokens = new Map<string, { cancelled: boolean }>();

async function ensureDir(dir: string): Promise<void> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(dir);
    if (!exists) {
      await ReactNativeBlobUtil.fs.mkdir(dir);
    }
  } catch {
    // ignore
  }
}

/**
 * Reads all stored offline video metadata from AsyncStorage.
 */
export async function getOfflineVideosRegistry(): Promise<Record<string, OfflineVideoMeta>> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_VIDEOS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, OfflineVideoMeta>;
  } catch {
    return {};
  }
}

/**
 * Updates offline video registry in AsyncStorage.
 */
async function saveOfflineVideosRegistry(registry: Record<string, OfflineVideoMeta>): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_VIDEOS_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // ignore
  }
}

/**
 * Checks if a specific blockId has a complete and valid offline video ready to play.
 */
export async function isOfflineVideoReady(blockId: string): Promise<boolean> {
  try {
    const registry = await getOfflineVideosRegistry();
    const meta = registry[blockId];
    if (!meta || !meta.localManifestPath) return false;

    const manifestExists = await ReactNativeBlobUtil.fs.exists(meta.localManifestPath);
    if (!manifestExists) return false;

    const keyPath = `${BASE_OFFLINE_DIR}/${blockId}/enc.key`;
    const keyExists = await ReactNativeBlobUtil.fs.exists(keyPath);
    return keyExists;
  } catch {
    return false;
  }
}

/**
 * Gets offline video metadata if ready.
 */
export async function getOfflineVideoMeta(blockId: string): Promise<OfflineVideoMeta | null> {
  const ready = await isOfflineVideoReady(blockId);
  if (!ready) return null;
  const registry = await getOfflineVideosRegistry();
  return registry[blockId] ?? null;
}

async function downloadFileWithRetry(
  localPath: string,
  remoteUrl: string,
  token?: string | null,
  maxAttempts = 4,
): Promise<void> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await ReactNativeBlobUtil.config({
        path: localPath,
        timeout: 30000,
      }).fetch('GET', remoteUrl, token ? { Authorization: `Bearer ${token}` } : undefined);

      const status = res.info().status;
      if (status >= 200 && status < 300) {
        return;
      }
      if (status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      }
      throw new Error(`HTTP ${status}`);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Downloads all HLS assets (manifest, AES-128 key, segments, subtitle) for offline playback.
 */
export async function downloadOfflineVideo(
  blockId: string,
  options: {
    title?: string;
    lessonId?: string;
    courseId?: string;
    durationSec?: number | null;
  },
  onProgress?: DownloadProgressCallback,
): Promise<OfflineVideoMeta> {
  const cancelToken = { cancelled: false };
  activeCancelTokens.set(blockId, cancelToken);

  const blockDir = `${BASE_OFFLINE_DIR}/${blockId}`;
  await ensureDir(BASE_OFFLINE_DIR);
  await ensureDir(blockDir);

  try {
    onProgress?.(5, 'Tayyorlanmoqda...');

    // 1. Get playback session info
    const playback = await apiStartVideoPlayback(blockId);
    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    const manifestUrl = playback.manifestUrl.startsWith('http')
      ? playback.manifestUrl
      : `${API_BASE}${playback.manifestUrl}`;

    onProgress?.(10, 'Manifest yuklanmoqda...');

    // 2. Fetch manifest text
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) throw new Error('Manifest yuklab bo‘lmadi');
    const manifestText = await manifestRes.text();

    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    // 3. Parse key URI and segment filenames
    let keyRemoteUrl: string | null = null;
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
      } else if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
        segmentNames.push(trimmed);
      }
    }

    if (segmentNames.length === 0) {
      throw new Error('Video segmentlari topilmadi');
    }

    // 4. Download AES Key (reuse if already downloaded)
    if (keyRemoteUrl) {
      onProgress?.(15, 'Xavfsizlik kaliti yuklanmoqda...');
      const keyLocalPath = `${blockDir}/enc.key`;
      const keyStat = await ReactNativeBlobUtil.fs.stat(keyLocalPath).catch(() => null);
      if (!keyStat || Number(keyStat.size) === 0) {
        await downloadFileWithRetry(keyLocalPath, keyRemoteUrl);
      }
    }

    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    // 5. Download Subtitle if available (reuse if already downloaded)
    let localSubtitlePath: string | null = null;
    if (playback.subtitleUrl) {
      try {
        const fullSubUrl = playback.subtitleUrl.startsWith('http')
          ? playback.subtitleUrl
          : `${API_BASE}${playback.subtitleUrl}`;
        const subLocalPath = `${blockDir}/subtitles.vtt`;
        const subStat = await ReactNativeBlobUtil.fs.stat(subLocalPath).catch(() => null);
        if (!subStat || Number(subStat.size) === 0) {
          const token = useAuthStore.getState().token;
          await downloadFileWithRetry(subLocalPath, fullSubUrl, token);
        }
        localSubtitlePath = subLocalPath;
      } catch {
        // Subtitle failure shouldn't abort entire video download
      }
    }

    // 6. Download each segment in chunks with automatic resume & retry
    const totalSegments = segmentNames.length;
    let completedSegments = 0;
    const concurrency = 2; // 2 parallel requests to ensure stable connection without socket exhaustion

    for (let i = 0; i < segmentNames.length; i += concurrency) {
      if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

      const chunk = segmentNames.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (rawSegmentLine) => {
          const segCleanName = rawSegmentLine.split('?')[0].split('/').pop() || `segment_${completedSegments}.ts`;
          const segRemoteUrl = rawSegmentLine.startsWith('http')
            ? rawSegmentLine
            : `${API_BASE}/videos/${blockId}/${rawSegmentLine}`;
          const segLocalPath = `${blockDir}/${segCleanName}`;

          // Check if already downloaded from previous attempt
          const existingStat = await ReactNativeBlobUtil.fs.stat(segLocalPath).catch(() => null);
          if (!existingStat || Number(existingStat.size) === 0) {
            try {
              await downloadFileWithRetry(segLocalPath, segRemoteUrl, null, 3);
            } catch (err: any) {
              throw new Error(`Segment yuklashda xatolik: ${segCleanName} (${err?.message || 'tarmoq uzildi'})`);
            }
          }

          completedSegments++;
          const percent = Math.min(95, Math.floor(20 + (completedSegments / totalSegments) * 75));
          onProgress?.(percent, `Yuklanmoqda: ${completedSegments}/${totalSegments}`);
        }),
      );
    }

    if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

    // 7. Generate clean local master.m3u8 with relative paths
    const localManifestLines = manifestLines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-KEY')) {
        return trimmed.replace(/URI="[^"]+"/, 'URI="enc.key"');
      }
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
        const cleanName = trimmed.split('?')[0].split('/').pop();
        return cleanName || trimmed;
      }
      return line;
    });

    const localManifestContent = localManifestLines.join('\n');
    const localManifestPath = `${blockDir}/local.m3u8`;
    await ReactNativeBlobUtil.fs.writeFile(localManifestPath, localManifestContent, 'utf8');

    // 8. Calculate total storage size
    let totalBytes = 0;
    const allFiles = await ReactNativeBlobUtil.fs.ls(blockDir);
    for (const f of allFiles) {
      const stat = await ReactNativeBlobUtil.fs.stat(`${blockDir}/${f}`).catch(() => null);
      if (stat) totalBytes += Number(stat.size || 0);
    }

    // 9. Save metadata in registry
    const meta: OfflineVideoMeta = {
      blockId,
      lessonId: options.lessonId,
      courseId: options.courseId,
      title: options.title || 'Video dars',
      durationSec: options.durationSec,
      totalBytes,
      downloadedAt: new Date().toISOString(),
      localManifestPath,
      localSubtitlePath,
    };

    const registry = await getOfflineVideosRegistry();
    registry[blockId] = meta;
    await saveOfflineVideosRegistry(registry);

    onProgress?.(100, 'Yakunlandi');
    return meta;
  } catch (error) {
    throw error;
  } finally {
    activeCancelTokens.delete(blockId);
  }
}

/**
 * Cancels an ongoing download for a blockId.
 */
export function cancelOfflineDownload(blockId: string): void {
  const token = activeCancelTokens.get(blockId);
  if (token) {
    token.cancelled = true;
  }
}

/**
 * Deletes an offline video and removes its registry entry.
 */
export async function deleteOfflineVideo(blockId: string): Promise<void> {
  cancelOfflineDownload(blockId);
  const blockDir = `${BASE_OFFLINE_DIR}/${blockId}`;
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(blockDir);
    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(blockDir);
    }
  } catch {
    // ignore
  }

  const registry = await getOfflineVideosRegistry();
  if (registry[blockId]) {
    delete registry[blockId];
    await saveOfflineVideosRegistry(registry);
  }
}

/**
 * Clears all downloaded offline videos and registry.
 */
export async function clearAllOfflineVideos(): Promise<void> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(BASE_OFFLINE_DIR);
    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(BASE_OFFLINE_DIR);
    }
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(OFFLINE_VIDEOS_STORAGE_KEY).catch(() => {});
}

/**
 * Calculates total disk space occupied by all offline videos.
 */
export async function getOfflineVideosStorageSize(): Promise<number> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(BASE_OFFLINE_DIR);
    if (!exists) return 0;

    const dirs = await ReactNativeBlobUtil.fs.ls(BASE_OFFLINE_DIR);
    let total = 0;
    for (const d of dirs) {
      const fullPath = `${BASE_OFFLINE_DIR}/${d}`;
      const stat = await ReactNativeBlobUtil.fs.stat(fullPath).catch(() => null);
      if (stat?.type === 'directory') {
        const files = await ReactNativeBlobUtil.fs.ls(fullPath).catch(() => []);
        for (const file of files) {
          const fileStat = await ReactNativeBlobUtil.fs.stat(`${fullPath}/${file}`).catch(() => null);
          if (fileStat) total += Number(fileStat.size || 0);
        }
      } else if (stat?.type === 'file') {
        total += Number(stat.size || 0);
      }
    }
    return total;
  } catch {
    return 0;
  }
}
