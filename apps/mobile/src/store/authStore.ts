import { create } from 'zustand';
import { api } from '../lib/api';
import { apiCompletePasswordReset, apiVerifyPasswordResetCode } from '../api/auth';
import { storage } from '../lib/storage';
import { closePracticeMessengerSocket } from '../lib/practiceMessengerSocket';
import type { User } from '../types/api';

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  loginCode: (code: string) => Promise<void>;
  verifyPasswordResetCode: (code: string) => Promise<{ resetToken: string }>;
  completePasswordReset: (
    resetToken: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>;
  setUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const session = await storage.get<{ token: string; user: User }>('session');
      set({ token: session?.token ?? null, user: session?.user ?? null });
      if (session?.token) {
        api
          .get('/auth/me')
          .then((r) => {
            const next = { token: session.token, user: r.data as User };
            set(next);
            void storage.set('session', next);
          })
          .catch(() => undefined);
      }
    } catch {
      // A corrupt/unavailable native storage must not leave the app on the splash screen.
      set({ token: null, user: null });
    } finally {
      set({ hydrated: true });
    }
  },

  login: async (phone: string, password: string) => {
    const { data } = await api.post('/auth/login', { phone, password });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    const session = { token: data.access_token, user: data.admin as User };
    await storage.set('session', session);
    set(session);
  },

  loginCode: async (code: string) => {
    const { data } = await api.post('/auth/telegram/verify', { code });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    const session = { token: data.access_token, user: data.admin as User };
    await storage.set('session', session);
    set(session);
  },

  verifyPasswordResetCode: async (code: string) => {
    return apiVerifyPasswordResetCode(code);
  },

  completePasswordReset: async (
    resetToken: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    const data = await apiCompletePasswordReset({ resetToken, newPassword, confirmPassword });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    const session = { token: data.access_token, user: data.admin as User };
    await storage.set('session', session);
    set(session);
  },

  setUser: async (user: User) => {
    const token = get().token;
    set({ user });
    await storage.set('session', { token, user });
  },

  logout: async () => {
    closePracticeMessengerSocket();
    await storage.remove('session');
    set({ token: null, user: null });
  },
}));
