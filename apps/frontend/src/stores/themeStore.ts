import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeState {
  theme: Theme;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const storedMode = localStorage.getItem('theme_mode') as ThemeMode | null;
const initialMode: ThemeMode = storedMode ?? 'system';
const initialResolvedTheme: Theme = initialMode === 'system' ? getSystemTheme() : initialMode;
applyTheme(initialResolvedTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialResolvedTheme,
  themeMode: initialMode,
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme_mode', next);
    localStorage.setItem('theme', next);
    applyTheme(next);
    set({ theme: next, themeMode: next });
  },
  setTheme: (mode: ThemeMode) => {
    const resolved: Theme = mode === 'system' ? getSystemTheme() : mode;
    localStorage.setItem('theme_mode', mode);
    localStorage.setItem('theme', resolved);
    applyTheme(resolved);
    set({ theme: resolved, themeMode: mode });
  },
}));

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (useThemeStore.getState().themeMode === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme(resolved);
      useThemeStore.setState({ theme: resolved });
    }
  });
}
