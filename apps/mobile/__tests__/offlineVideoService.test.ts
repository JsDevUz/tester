import {
  clearAllOfflineVideos,
  deleteOfflineVideo,
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

  it('checks if offline video is ready correctly', async () => {
    const ready = await isOfflineVideoReady('non-existent');
    expect(ready).toBe(false);
  });

  it('handles deleteOfflineVideo gracefully', async () => {
    await expect(deleteOfflineVideo('block-1')).resolves.toBeUndefined();
  });

  it('handles clearAllOfflineVideos gracefully', async () => {
    await expect(clearAllOfflineVideos()).resolves.toBeUndefined();
  });
});
