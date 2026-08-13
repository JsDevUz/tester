import {create} from 'zustand';
import {colorScheme} from 'nativewind';
import {storage} from '../lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeState = {
  preference: ThemePreference;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

function applyToNativeWind(preference: ThemePreference) {
  colorScheme.set(preference);
}

export const useThemeStore = create<ThemeState>(set => ({
  preference: 'light',
  hydrated: false,

  hydrate: async () => {
    const saved = await storage.get<ThemePreference>('theme');
    const preference = saved ?? 'light';
    applyToNativeWind(preference);
    set({preference, hydrated: true});
  },

  setPreference: async preference => {
    applyToNativeWind(preference);
    set({preference});
    await storage.set('theme', preference);
  },
}));
