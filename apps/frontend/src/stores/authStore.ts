import { create } from 'zustand';
import { apiCompletePasswordReset, apiLogin, apiTelegramLogin, type Admin } from '../api/auth';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  login: (phone: string, password: string) => Promise<void>;
  loginWithTelegramCode: (code: string) => Promise<void>;
  loginWithPasswordReset: (resetToken: string, newPassword: string, confirmPassword: string) => Promise<void>;
  logout: () => void;
  setAdmin: (admin: Admin) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  admin: null,
  login: async (phone, password) => {
    const { access_token, admin } = await apiLogin(phone, password);
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  loginWithTelegramCode: async (code) => {
    const { access_token, admin } = await apiTelegramLogin(code);
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  loginWithPasswordReset: async (resetToken, newPassword, confirmPassword) => {
    const { access_token, admin } = await apiCompletePasswordReset({ resetToken, newPassword, confirmPassword });
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, admin: null });
  },
  setAdmin: (admin) => set({ admin }),
}));
