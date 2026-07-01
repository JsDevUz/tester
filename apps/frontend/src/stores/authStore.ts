import { create } from 'zustand';
import { apiLogin, apiTelegramLogin, type Admin } from '../api/auth';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithTelegramCode: (code: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  admin: null,
  login: async (email, password) => {
    const { access_token, admin } = await apiLogin(email, password);
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  loginWithTelegramCode: async (code) => {
    const { access_token, admin } = await apiTelegramLogin(code);
    localStorage.setItem('token', access_token);
    set({ token: access_token, admin });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, admin: null });
  },
}));
