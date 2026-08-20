import {Platform} from 'react-native';
import {
  clearAllOfflineVideos,
  deleteOfflineVideo,
  getLocalManifestPath,
  getLocalMergedVideoPath,
  getLocalPlayablePath,
  getLocalSegmentPath,
  getOfflineVideoMeta,
  getOfflineVideosRegistry,
  isOfflineVideoComplete,
  isOfflineVideoReady,
} from '../src/lib/offlineVideoService';

// iOS points at the merged .ts and Android at the .m3u8 playlist. The tests assert against
// whichever the current test platform selects so they stay meaningful under either
// Platform.OS. (iOS cannot actually play its file yet -- see offlineVideoService.)
const EXPECTED_PLAYABLE =
  Platform.OS === 'ios'
    ? '/mock_docs/jamm_offline_videos/block-1/merged.ts'
    : '/mock_docs/jamm_offline_videos/block-1/local.m3u8';

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
    '/mock_docs/jamm_offline_videos/block-1/merged.ts': {type: 'file', size: 1024 * 500},
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

  it('builds distinct manifest, merged and segment paths', () => {
    const manifestPath = getLocalManifestPath('block-1');
    const mergedPath = getLocalMergedVideoPath('block-1');
    const segmentPath = getLocalSegmentPath('block-1', 0);
    expect(manifestPath).toBe('/mock_docs/jamm_offline_videos/block-1/local.m3u8');
    expect(mergedPath).toBe('/mock_docs/jamm_offline_videos/block-1/merged.ts');
    expect(segmentPath).toBe('/mock_docs/jamm_offline_videos/block-1/segment_000.ts');
    expect(new Set([manifestPath, mergedPath, segmentPath]).size).toBe(3);
  });

  it('picks the playable path the current platform can actually open', () => {
    expect(getLocalPlayablePath('block-1')).toBe(EXPECTED_PLAYABLE);
  });

  it('checks if offline video is ready correctly for a non-existent block', async () => {
    const ready = await isOfflineVideoReady('non-existent');
    expect(ready).toBe(false);
  });

  it('reports ready when the platform playable file exists with sufficient size', async () => {
    const ready = await isOfflineVideoReady('block-1');
    expect(ready).toBe(true);
  });

  it('returns meta pointing at the platform playable path when ready', async () => {
    const meta = await getOfflineVideoMeta('block-1');
    expect(meta).not.toBeNull();
    expect(meta?.localManifestPath).toBe(EXPECTED_PLAYABLE);
  });

  describe('isOfflineVideoComplete', () => {
    const base = {
      blockId: 'block-1',
      title: 'Video dars',
      totalBytes: 1,
      downloadedAt: '2026-08-20T00:00:00.000Z',
      localManifestPath: EXPECTED_PLAYABLE,
    };

    it('treats a partially downloaded video as incomplete', () => {
      expect(
        isOfflineVideoComplete({...base, downloadedSegments: 9, totalSegments: 180}),
      ).toBe(false);
    });

    it('treats a fully downloaded video as complete', () => {
      expect(
        isOfflineVideoComplete({...base, downloadedSegments: 180, totalSegments: 180}),
      ).toBe(true);
    });

    it('treats a legacy entry with no counts as complete', () => {
      expect(isOfflineVideoComplete(base)).toBe(true);
    });

    it('treats a missing entry as incomplete', () => {
      expect(isOfflineVideoComplete(null)).toBe(false);
    });
  });

  it('handles deleteOfflineVideo gracefully', async () => {
    await expect(deleteOfflineVideo('block-1')).resolves.toBeUndefined();
  });

  it('handles clearAllOfflineVideos gracefully', async () => {
    await expect(clearAllOfflineVideos()).resolves.toBeUndefined();
  });
});
