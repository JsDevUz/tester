import ReactNativeBlobUtil from 'react-native-blob-util';

export type CacheCategory = 'classroom' | 'avatars' | 'challenges' | 'general';

export interface StorageBreakdown {
  classroom: number;
  avatars: number;
  challenges: number;
  general: number;
  total: number;
}

const BASE_CACHE_DIR = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/jamm_cache`;

const CATEGORY_DIRS: Record<CacheCategory, string> = {
  classroom: `${BASE_CACHE_DIR}/classroom`,
  avatars: `${BASE_CACHE_DIR}/avatars`,
  challenges: `${BASE_CACHE_DIR}/challenges`,
  general: `${BASE_CACHE_DIR}/general`,
};

// In-flight download promises deduplication to avoid parallel duplicate downloads
const inFlightDownloads = new Map<string, Promise<string>>();

// In-memory cache for fast sync lookups
const memoryCache = new Map<string, string>();

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const cleanExt = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(cleanExt) ? cleanExt : 'jpg';
  const safeSlug = encodeURIComponent(url.slice(-25).replace(/[^a-zA-Z0-9]/g, ''));
  return `cached_${Math.abs(hash)}_${safeSlug}.${ext}`;
}

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
 * Returns local file URI if cached, or downloads and caches image persistently.
 */
export async function getCachedImageUri(
  remoteUrl: string | null | undefined,
  category: CacheCategory = 'general',
): Promise<string> {
  if (!remoteUrl || typeof remoteUrl !== 'string') return '';
  if (!remoteUrl.startsWith('http://') && !remoteUrl.startsWith('https://')) {
    return remoteUrl;
  }

  const memoryHit = memoryCache.get(remoteUrl);
  if (memoryHit) {
    return memoryHit;
  }

  const targetDir = CATEGORY_DIRS[category] ?? CATEGORY_DIRS.general;
  const fileName = hashUrl(remoteUrl);
  const localFilePath = `${targetDir}/${fileName}`;
  const localFileUri = `file://${localFilePath}`;

  try {
    const exists = await ReactNativeBlobUtil.fs.exists(localFilePath);
    if (exists) {
      const stat = await ReactNativeBlobUtil.fs.stat(localFilePath);
      if (Number(stat.size) > 0) {
        memoryCache.set(remoteUrl, localFileUri);
        return localFileUri;
      }
      // If 0-byte or corrupted file exists, remove it
      await ReactNativeBlobUtil.fs.unlink(localFilePath).catch(() => {});
    }
  } catch {
    // proceed to download
  }

  // Deduplicate in-flight downloads for same URL
  if (inFlightDownloads.has(remoteUrl)) {
    return inFlightDownloads.get(remoteUrl)!;
  }

  const tmpFilePath = `${localFilePath}.tmp`;

  const downloadPromise = (async () => {
    try {
      await ensureDir(targetDir);
      // Download to temporary file first so partial downloads never corrupt final cache
      const res = await ReactNativeBlobUtil.config({
        path: tmpFilePath,
      }).fetch('GET', remoteUrl);

      const status = res.info().status;
      if (status >= 200 && status < 300) {
        const stat = await ReactNativeBlobUtil.fs.stat(tmpFilePath).catch(() => null);
        if (stat && Number(stat.size) > 0) {
          await ReactNativeBlobUtil.fs.mv(tmpFilePath, localFilePath).catch(() => {});
          memoryCache.set(remoteUrl, localFileUri);
          return localFileUri;
        }
      }
      await ReactNativeBlobUtil.fs.unlink(tmpFilePath).catch(() => {});
      return remoteUrl;
    } catch {
      await ReactNativeBlobUtil.fs.unlink(tmpFilePath).catch(() => {});
      return remoteUrl;
    } finally {
      inFlightDownloads.delete(remoteUrl);
    }
  })();

  inFlightDownloads.set(remoteUrl, downloadPromise);
  return downloadPromise;
}

/**
 * Calculates total size of files in a directory recursively.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(dirPath);
    if (!exists) return 0;

    const files = await ReactNativeBlobUtil.fs.lstat(dirPath);
    let total = 0;
    for (const file of files) {
      if (file.type === 'file') {
        total += Number(file.size || 0);
      } else if (file.type === 'directory') {
        total += await getDirectorySize(file.path);
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Retrieves storage usage breakdown across all categories.
 */
export async function getStorageUsageBreakdown(): Promise<StorageBreakdown> {
  const [classroom, avatars, challenges, general] = await Promise.all([
    getDirectorySize(CATEGORY_DIRS.classroom),
    getDirectorySize(CATEGORY_DIRS.avatars),
    getDirectorySize(CATEGORY_DIRS.challenges),
    getDirectorySize(CATEGORY_DIRS.general),
  ]);

  const total = classroom + avatars + challenges + general;
  return {
    classroom,
    avatars,
    challenges,
    general,
    total,
  };
}

/**
 * Clears cached files for a specific category or all categories.
 */
export async function clearCategoryCache(category: CacheCategory | 'all'): Promise<void> {
  memoryCache.clear();
  try {
    if (category === 'all') {
      const exists = await ReactNativeBlobUtil.fs.exists(BASE_CACHE_DIR);
      if (exists) {
        await ReactNativeBlobUtil.fs.unlink(BASE_CACHE_DIR);
      }
    } else {
      const dir = CATEGORY_DIRS[category];
      const exists = await ReactNativeBlobUtil.fs.exists(dir);
      if (exists) {
        await ReactNativeBlobUtil.fs.unlink(dir);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Human-readable byte formatting.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
