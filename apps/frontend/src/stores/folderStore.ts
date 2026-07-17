import { create } from 'zustand';
import { apiFetchFolders, apiCreateFolder, apiUpdateFolder, apiDeleteFolder, type Folder } from '../api/folders';

interface FolderState {
  folders: Folder[];
  foldersLoading: boolean;
  foldersLoaded: boolean;
  foldersError: string | null;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color?: string, icon?: string) => Promise<void>;
  updateFolder: (id: string, data: { name?: string; color?: string; icon?: string }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  foldersLoading: false,
  foldersLoaded: false,
  foldersError: null,
  fetchFolders: async () => {
    set({ foldersLoading: true, foldersError: null });
    try {
      const folders = await apiFetchFolders();
      set({ folders, foldersLoaded: true });
    } catch (error) {
      set({ foldersError: "Papkalarni yuklab bo'lmadi", foldersLoaded: true });
      throw error;
    } finally {
      set({ foldersLoading: false });
    }
  },
  createFolder: async (name, color, icon) => {
    const folder = await apiCreateFolder(name, color, icon);
    set({ folders: [...get().folders, folder] });
  },
  updateFolder: async (id, data) => {
    const updated = await apiUpdateFolder(id, data);
    set({ folders: get().folders.map((f) => (f.id === id ? updated : f)) });
  },
  deleteFolder: async (id) => {
    await apiDeleteFolder(id);
    set({ folders: get().folders.filter((f) => f.id !== id) });
  },
}));
