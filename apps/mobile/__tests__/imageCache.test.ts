import {
  clearCategoryCache,
  formatBytes,
  getCachedImageUri,
  getStorageUsageBreakdown,
} from '../src/lib/imageCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('react-native-blob-util', () => {
  const mockFiles: Record<string, {type: string; size: number}> = {
    '/mock_cache/jamm_cache/classroom/cached_1_page1.jpg': {type: 'file', size: 1024 * 500},
    '/mock_cache/jamm_cache/avatars/cached_2_avatar.jpg': {type: 'file', size: 1024 * 100},
    '/mock_docs/jamm_offline_videos/b1/local.m3u8': {type: 'file', size: 1024 * 50},
  };

  return {
    __esModule: true,
    default: {
      fs: {
        dirs: {
          CacheDir: '/mock_cache',
          DocumentDir: '/mock_docs',
        },
        exists: jest.fn(async (path: string) => Boolean(mockFiles[path])),
        mkdir: jest.fn(async () => {}),
        lstat: jest.fn(async (dirPath: string) => {
          return Object.entries(mockFiles)
            .filter(([k]) => k.startsWith(dirPath))
            .map(([path, data]) => ({path, type: data.type, size: data.size}));
        }),
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

describe('imageCache utility', () => {
  it('formats byte sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.2 GB');
  });

  it('returns empty string for invalid URLs', async () => {
    const res = await getCachedImageUri(null);
    expect(res).toBe('');
  });

  it('returns local file URI directly when not http/https', async () => {
    const local = 'file:///path/to/local/file.png';
    const res = await getCachedImageUri(local);
    expect(res).toBe(local);
  });

  it('calculates storage breakdown and allows clearing cache', async () => {
    const stats = await getStorageUsageBreakdown();
    expect(stats.total).toBeGreaterThanOrEqual(0);

    await clearCategoryCache('all');
    const cleared = await getStorageUsageBreakdown();
    expect(cleared.total).toBe(0);
  });
});
