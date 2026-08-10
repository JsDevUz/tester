import { create } from 'zustand';
import {
  apiListChallenges, apiCreateChallenge, apiUpdateChallenge, apiDeleteChallenge,
  apiGetChallenge, apiAddChallengeBook, apiDeleteChallengeBook,
  apiSetChallengeBookTest, apiRemoveChallengeBookTest,
  type ApiChallenge, type ApiChallengeDetail,
} from '../api/challenges';

interface ChallengeStoreState {
  challengesByCourse: Record<string, ApiChallenge[]>;
  detail: ApiChallengeDetail | null;
  loading: boolean;
  loadChallenges: (courseId: string) => Promise<void>;
  createChallenge: (courseId: string, data: { name: string; description?: string; imageUrl?: string; type?: string }) => Promise<ApiChallenge>;
  loadChallengeDetail: (challengeId: string) => Promise<void>;
  updateChallenge: (courseId: string, challengeId: string, data: Partial<{ name: string; description: string; imageUrl: string; type: string }>) => Promise<void>;
  deleteChallenge: (courseId: string, challengeId: string) => Promise<void>;
  addBook: (challengeId: string, data: { title: string; totalPages: number }) => Promise<void>;
  deleteBook: (challengeId: string, bookId: string) => Promise<void>;
  setBookTest: (challengeId: string, bookId: string, data: { testId: string; triggerPage?: number; forceNow?: boolean }) => Promise<void>;
  removeBookTest: (challengeId: string, bookId: string) => Promise<void>;
}

export const useChallengeStore = create<ChallengeStoreState>((set, get) => ({
  challengesByCourse: {},
  detail: null,
  loading: false,

  async loadChallenges(courseId) {
    set({ loading: true });
    try {
      const list = await apiListChallenges(courseId);
      set((state) => ({ challengesByCourse: { ...state.challengesByCourse, [courseId]: list } }));
    } finally {
      set({ loading: false });
    }
  },

  async createChallenge(courseId, data) {
    const challenge = await apiCreateChallenge(courseId, data);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: [...(state.challengesByCourse[courseId] ?? []), challenge],
      },
    }));
    return challenge;
  },

  async loadChallengeDetail(challengeId) {
    const detail = await apiGetChallenge(challengeId);
    set({ detail });
  },

  async updateChallenge(courseId, challengeId, data) {
    const updated = await apiUpdateChallenge(challengeId, data);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: (state.challengesByCourse[courseId] ?? []).map((c) => (c.id === challengeId ? updated : c)),
      },
      detail: state.detail?.id === challengeId ? { ...state.detail, ...updated } : state.detail,
    }));
  },

  async deleteChallenge(courseId, challengeId) {
    await apiDeleteChallenge(challengeId);
    set((state) => ({
      challengesByCourse: {
        ...state.challengesByCourse,
        [courseId]: (state.challengesByCourse[courseId] ?? []).filter((c) => c.id !== challengeId),
      },
    }));
  },

  async addBook(challengeId, data) {
    await apiAddChallengeBook(challengeId, data);
    await get().loadChallengeDetail(challengeId);
  },

  async deleteBook(challengeId, bookId) {
    await apiDeleteChallengeBook(bookId);
    await get().loadChallengeDetail(challengeId);
  },

  async setBookTest(challengeId, bookId, data) {
    await apiSetChallengeBookTest(bookId, data);
    await get().loadChallengeDetail(challengeId);
  },

  async removeBookTest(challengeId, bookId) {
    await apiRemoveChallengeBookTest(bookId);
    await get().loadChallengeDetail(challengeId);
  },
}));
