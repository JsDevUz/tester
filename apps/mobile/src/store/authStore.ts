import { create } from 'zustand';
import { api } from '../lib/api';
import { apiCompletePasswordReset, apiVerifyPasswordResetCode } from '../api/auth';
import { storage } from '../lib/storage';
import { clearSecureToken, getSecureToken, setSecureToken } from '../lib/secureToken';
import { closePracticeMessengerSocket } from '../lib/practiceMessengerSocket';
import type { User } from '../types/api';

/**
 * Persists a session the same way everywhere: the token goes to the keychain (falls back to
 * AsyncStorage if the native module is unavailable -- see secureToken.ts), the user object
 * -- not sensitive, and needed synchronously in a few places -- stays in plain storage.
 */
async function persistSession(token: string | null, user: User | null): Promise<void> {
  if (token) {
    await setSecureToken(token);
  } else {
    await clearSecureToken();
  }
  await storage.set('session-user', user);
}

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
      // Sessions written before the keychain migration live under the old combined key.
      // Reading it here (once) and re-saving through persistSession moves the token out of
      // plaintext storage without signing already-installed users out.
      const legacy = await storage.get<{ token: string; user: User }>('session');
      let token: string | null;
      let user: User | null;
      if (legacy?.token) {
        token = legacy.token;
        user = legacy.user;
        await persistSession(token, user);
        await storage.remove('session');
      } else {
        token = await getSecureToken();
        user = await storage.get<User>('session-user');
      }
      set({ token, user });
      if (token) {
        api
          .get('/auth/me')
          .then((r) => {
            const nextUser = r.data as User;
            set({ token, user: nextUser });
            void storage.set('session-user', nextUser);
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
    await persistSession(session.token, session.user);
    set(session);
  },

  loginCode: async (code: string) => {
    const { data } = await api.post('/auth/telegram/verify', { code });
    if (data.admin.role !== 'student') {
      throw new Error("Bu ilova faqat o'quvchilar uchun");
    }
    const session = { token: data.access_token, user: data.admin as User };
    await persistSession(session.token, session.user);
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
    await persistSession(session.token, session.user);
    set(session);
  },

  setUser: async (user: User) => {
    const token = get().token;
    set({ user });
    await persistSession(token, user);
  },

  logout: async () => {
    closePracticeMessengerSocket();
    await clearSecureToken();
    await storage.remove('session-user');
    await storage.remove('session');
    set({ token: null, user: null });
  },
}));
