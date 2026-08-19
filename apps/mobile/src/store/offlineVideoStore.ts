import { create } from 'zustand';
import {
  cancelOfflineDownload,
  clearAllOfflineVideos,
  deleteOfflineVideo,
  downloadOfflineVideo,
  getOfflineVideosRegistry,
  OfflineVideoMeta,
} from '../lib/offlineVideoService';

export interface ActiveDownloadState {
  progress: number;
  stageText: string;
  status: 'downloading' | 'error' | 'completed';
  errorMessage?: string;
}

interface OfflineVideoStoreState {
  registry: Record<string, OfflineVideoMeta>;
  activeDownloads: Record<string, ActiveDownloadState>;
  initialized: boolean;
  loadRegistry: () => Promise<void>;
  startDownload: (
    blockId: string,
    options: {
      title?: string;
      lessonId?: string;
      courseId?: string;
      durationSec?: number | null;
    },
  ) => Promise<OfflineVideoMeta | null>;
  cancelDownload: (blockId: string) => void;
  removeDownload: (blockId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  isDownloaded: (blockId: string) => boolean;
}

export const useOfflineVideoStore = create<OfflineVideoStoreState>((set, get) => ({
  registry: {},
  activeDownloads: {},
  initialized: false,

  loadRegistry: async () => {
    const registry = await getOfflineVideosRegistry();
    set({ registry, initialized: true });
  },

  startDownload: async (blockId, options) => {
    set((state) => ({
      activeDownloads: {
        ...state.activeDownloads,
        [blockId]: {
          progress: 0,
          stageText: 'Yuklash boshlanmoqda...',
          status: 'downloading',
        },
      },
    }));

    try {
      const meta = await downloadOfflineVideo(blockId, options, (progressPercent, stageText) => {
        set((state) => ({
          activeDownloads: {
            ...state.activeDownloads,
            [blockId]: {
              progress: progressPercent,
              stageText,
              status: 'downloading',
            },
          },
        }));
      });

      set((state) => {
        const nextActive = { ...state.activeDownloads };
        delete nextActive[blockId];
        return {
          registry: {
            ...state.registry,
            [blockId]: meta,
          },
          activeDownloads: nextActive,
        };
      });

      return meta;
    } catch (err: any) {
      set((state) => ({
        activeDownloads: {
          ...state.activeDownloads,
          [blockId]: {
            progress: 0,
            stageText: 'Xatolik yuz berdi',
            status: 'error',
            errorMessage: err?.message || 'Yuklab bo‘lmadi',
          },
        },
      }));
      return null;
    }
  },

  cancelDownload: (blockId) => {
    cancelOfflineDownload(blockId);
    set((state) => {
      const nextActive = { ...state.activeDownloads };
      delete nextActive[blockId];
      return { activeDownloads: nextActive };
    });
  },

  removeDownload: async (blockId) => {
    await deleteOfflineVideo(blockId);
    set((state) => {
      const nextRegistry = { ...state.registry };
      delete nextRegistry[blockId];
      const nextActive = { ...state.activeDownloads };
      delete nextActive[blockId];
      return {
        registry: nextRegistry,
        activeDownloads: nextActive,
      };
    });
  },

  clearAll: async () => {
    await clearAllOfflineVideos();
    set({ registry: {}, activeDownloads: {} });
  },

  isDownloaded: (blockId: string) => {
    return Boolean(get().registry[blockId]);
  },
}));
