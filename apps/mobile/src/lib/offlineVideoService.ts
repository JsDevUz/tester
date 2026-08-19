import AsyncStorage from '@react-native-async-storage/async-storage';
import aesjs from 'aes-js';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { apiStartVideoPlayback } from '../api/videos';
import { API_URL } from '../config/env';
import { useAuthStore } from '../store/authStore';

const API_BASE = API_URL.replace(/\/$/, '');
const OFFLINE_VIDEOS_STORAGE_KEY = '@jamm_offline_videos_v1';

export function getOfflineBaseDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/jamm_offline_videos`;
}

export function getOfflineVideoDir(blockId: string): string {
  return `${getOfflineBaseDir()}/${blockId}`;
}

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
    const videoPath = getLocalVideoPath(blockId);
    const exists = await ReactNativeBlobUtil.fs.exists(videoPath).catch(() => false);
    if (!exists) return false;

    const stat = await ReactNativeBlobUtil.fs.stat(videoPath).catch(() => null);
    return Boolean(stat && Number(stat.size) > 1000);
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

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const placeHolders = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((len * 3) / 4 - placeHolders);
  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_CHARS.indexOf(clean[i]);
    const b = B64_CHARS.indexOf(clean[i + 1]);
    const c = B64_CHARS.indexOf(clean[i + 2]);
    const d = B64_CHARS.indexOf(clean[i + 3]);
    bytes[j++] = (a << 2) | (b >> 4);
    if (c !== -1 && j < bytes.length) bytes[j++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1 && j < bytes.length) bytes[j++] = ((c & 3) << 6) | (d & 63);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, i + chunk);
      for (let j = 0; j < sub.length; j++) bin += String.fromCharCode(sub[j]);
    }
    return btoa(bin);
  }
  let result = '';
  let i;
  const len = bytes.length;
  for (i = 0; i < len - 2; i += 3) {
    result += B64_CHARS[bytes[i] >> 2];
    result += B64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += B64_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += B64_CHARS[bytes[i + 2] & 63];
  }
  if (i === len - 1) {
    result += B64_CHARS[bytes[i] >> 2];
    result += B64_CHARS[(bytes[i] & 3) << 4];
    result += '==';
  } else if (i === len - 2) {
    result += B64_CHARS[bytes[i] >> 2];
    result += B64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += B64_CHARS[(bytes[i + 1] & 15) << 2];
    result += '=';
  }
  return result;
}

function parseIv(ivStr: string | null, sequenceIndex: number): Uint8Array {
  if (ivStr && ivStr.startsWith('0x')) {
    const hex = ivStr.slice(2).padStart(32, '0');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  const iv = new Uint8Array(16);
  iv[12] = (sequenceIndex >> 24) & 0xff;
  iv[13] = (sequenceIndex >> 16) & 0xff;
  iv[14] = (sequenceIndex >> 8) & 0xff;
  iv[15] = sequenceIndex & 0xff;
  return iv;
}

function removePkcs7Padding(data: Uint8Array): Uint8Array {
  const pad = data[data.length - 1];
  if (pad > 0 && pad <= 16) {
    let isValid = true;
    for (let i = data.length - pad; i < data.length; i++) {
      if (data[i] !== pad) {
        isValid = false;
        break;
      }
    }
    if (isValid) {
      return data.subarray(0, data.length - pad);
    }
  }
  return data;
}

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

  const baseDir = getOfflineBaseDir();
  const blockDir = getOfflineVideoDir(blockId);
  await ensureDir(baseDir);
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

    // 4. Download AES Key
    let keyBytes: Uint8Array | null = null;
    if (keyRemoteUrl) {
      onProgress?.(15, 'Xavfsizlik kaliti yuklanmoqda...');
      const keyLocalPath = `${blockDir}/enc.key`;
      const keyStat = await ReactNativeBlobUtil.fs.stat(keyLocalPath).catch(() => null);
      if (!keyStat || Number(keyStat.size) === 0) {
        await downloadFileWithRetry(keyLocalPath, keyRemoteUrl);
      }
      try {
        const keyBase64 = await ReactNativeBlobUtil.fs.readFile(keyLocalPath, 'base64');
        keyBytes = base64ToUint8Array(keyBase64);
      } catch {
        // key read failed
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

    // 6. Download and decrypt segments sequentially into video.ts
    const totalSegments = segmentNames.length;
    let completedSegments = 0;
    const videoLocalPath = getLocalVideoPath(blockId);

    // Check if starting clean or appending
    const existingVideoStat = await ReactNativeBlobUtil.fs.stat(videoLocalPath).catch(() => null);
    let isFirst = !existingVideoStat || Number(existingVideoStat.size) === 0;

    for (let i = 0; i < segmentNames.length; i++) {
      if (cancelToken.cancelled) throw new Error('Yuklab olish bekor qilindi');

      const rawSegmentLine = segmentNames[i];
      const segRemoteUrl = rawSegmentLine.startsWith('http')
        ? rawSegmentLine
        : `${API_BASE}/videos/${blockId}/${rawSegmentLine}`;
      const tempEncPath = `${blockDir}/temp_${i}.enc`;

      try {
        await downloadFileWithRetry(tempEncPath, segRemoteUrl, null, 3);
        if (keyBytes && keyBytes.length === 16) {
          const iv = parseIv(keyIvHex, i);
          await decryptAndAppendSegment(tempEncPath, videoLocalPath, keyBytes, iv, isFirst);
        } else {
          // Plain segment copy
          const rawB64 = await ReactNativeBlobUtil.fs.readFile(tempEncPath, 'base64');
          if (isFirst) {
            await ReactNativeBlobUtil.fs.writeFile(videoLocalPath, rawB64, 'base64');
          } else {
            await ReactNativeBlobUtil.fs.appendFile(videoLocalPath, rawB64, 'base64');
          }
        }
        isFirst = false;
        await ReactNativeBlobUtil.fs.unlink(tempEncPath).catch(() => { });
      } catch (err: any) {
        throw new Error(`Segment yuklashda xatolik: segment_${i}.ts (${err?.message || 'tarmoq uzildi'})`);
      }

      completedSegments++;
      const percent = Math.min(95, Math.floor(20 + (completedSegments / totalSegments) * 75));
      onProgress?.(percent, `Yuklanmoqda: ${completedSegments}/${totalSegments}`);

      // Save progressive metadata to registry
      const partialMeta: OfflineVideoMeta = {
        blockId,
        lessonId: options.lessonId,
        courseId: options.courseId,
        title: options.title || 'Video dars',
        durationSec: options.durationSec,
        totalBytes: 0,
        downloadedAt: new Date().toISOString(),
        localManifestPath: videoLocalPath,
        localSubtitlePath,
      };
      const reg = await getOfflineVideosRegistry();
      reg[blockId] = partialMeta;
      await saveOfflineVideosRegistry(reg);
    }

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

const autoCacheInProgress = new Set<string>();

/**
 * Starts auto-caching a video in the background without blocking the UI.
 */
export function startAutoCacheVideo(
  blockId: string,
  options?: {
    title?: string;
    lessonId?: string;
    courseId?: string;
    durationSec?: number | null;
  },
): void {
  if (autoCacheInProgress.has(blockId)) return;
  autoCacheInProgress.add(blockId);

  downloadOfflineVideo(blockId, options ?? {})
    .catch(() => { })
    .finally(() => {
      autoCacheInProgress.delete(blockId);
    });
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
  const blockDir = getOfflineVideoDir(blockId);
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
    const baseDir = getOfflineBaseDir();
    const exists = await ReactNativeBlobUtil.fs.exists(baseDir);
    if (exists) {
      await ReactNativeBlobUtil.fs.unlink(baseDir);
    }
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(OFFLINE_VIDEOS_STORAGE_KEY).catch(() => { });
}

/**
 * Calculates total disk space occupied by all offline videos.
 */
export async function getOfflineVideosStorageSize(): Promise<number> {
  try {
    const baseDir = getOfflineBaseDir();
    const exists = await ReactNativeBlobUtil.fs.exists(baseDir);
    if (!exists) return 0;

    const dirs = await ReactNativeBlobUtil.fs.ls(baseDir);
    let total = 0;
    for (const d of dirs) {
      const fullPath = `${baseDir}/${d}`;
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
