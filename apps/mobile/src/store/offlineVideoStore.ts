import { create } from 'zustand';
import {
  cancelOfflineDownload,
  clearAllOfflineVideos,
  deleteOfflineVideo,
  downloadOfflineVideo,
  getOfflineVideosRegistry,
  isOfflineVideoComplete,
  OfflineVideoMeta,
} from '../lib/offlineVideoService';

export interface ActiveDownloadState {
  blockId: string;
  progress: number;
  stageText: string;
  status: 'downloading' | 'error' | 'completed';
  errorMessage?: string;
  /** Bytes on disk and the estimated final size, for a "1.7 MB / 7.2 MB" readout. */
  downloadedBytes?: number;
  totalBytes?: number;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
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
      lessonTitle?: string;
      courseId?: string;
      courseTitle?: string;
      schoolId?: string;
      durationSec?: number | null;
    },
  ) => Promise<OfflineVideoMeta | null>;
  cancelDownload: (blockId: string) => void;
  cancelDownloadsForSchool: (schoolId: string) => void;
  cancelDownloadsForCourse: (courseId: string) => void;
  cancelAllActive: () => void;
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
          blockId,
          title: options.title || options.lessonTitle || 'Video dars',
          lessonId: options.lessonId,
          lessonTitle: options.lessonTitle,
          courseId: options.courseId,
          courseTitle: options.courseTitle,
          schoolId: options.schoolId,
          progress: 0,
          stageText: 'Yuklash boshlanmoqda...',
          status: 'downloading',
        },
      },
    }));

    try {
      const meta = await downloadOfflineVideo(
        blockId,
        options,
        (progressPercent, stageText, bytes) => {
          set((state) => ({
            activeDownloads: {
              ...state.activeDownloads,
              [blockId]: {
                blockId,
                title: options.title || options.lessonTitle || 'Video dars',
                lessonId: options.lessonId,
                lessonTitle: options.lessonTitle,
                courseId: options.courseId,
                courseTitle: options.courseTitle,
                schoolId: options.schoolId,
                progress: progressPercent,
                stageText,
                status: 'downloading',
                downloadedBytes: bytes?.downloaded,
                totalBytes: bytes?.total,
              },
            },
          }));
        },
      );

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
            blockId,
            title: options.title || options.lessonTitle || 'Video dars',
            lessonId: options.lessonId,
            lessonTitle: options.lessonTitle,
            courseId: options.courseId,
            courseTitle: options.courseTitle,
            schoolId: options.schoolId,
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

  cancelDownloadsForSchool: (schoolId) => {
    const active = get().activeDownloads;
    Object.values(active).forEach((item) => {
      if (item.schoolId === schoolId) {
        cancelOfflineDownload(item.blockId);
      }
    });
    set((state) => {
      const nextActive = { ...state.activeDownloads };
      Object.keys(nextActive).forEach((bId) => {
        if (nextActive[bId]?.schoolId === schoolId) {
          delete nextActive[bId];
        }
      });
      return { activeDownloads: nextActive };
    });
  },

  cancelDownloadsForCourse: (courseId) => {
    const active = get().activeDownloads;
    Object.values(active).forEach((item) => {
      if (item.courseId === courseId) {
        cancelOfflineDownload(item.blockId);
      }
    });
    set((state) => {
      const nextActive = { ...state.activeDownloads };
      Object.keys(nextActive).forEach((bId) => {
        if (nextActive[bId]?.courseId === courseId) {
          delete nextActive[bId];
        }
      });
      return { activeDownloads: nextActive };
    });
  },

  cancelAllActive: () => {
    const active = get().activeDownloads;
    Object.values(active).forEach((item) => {
      cancelOfflineDownload(item.blockId);
    });
    set({ activeDownloads: {} });
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
    return isOfflineVideoComplete(get().registry[blockId]);
  },
}));
