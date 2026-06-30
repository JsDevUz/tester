import { create } from 'zustand';
import { apiFetchFolders, apiCreateFolder, apiUpdateFolder, apiDeleteFolder, type Folder } from '../api/folders';

interface FolderState {
  folders: Folder[];
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color?: string, icon?: string) => Promise<void>;
  updateFolder: (id: string, data: { name?: string; color?: string; icon?: string }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  fetchFolders: async () => {
    const folders = await apiFetchFolders();
    set({ folders });
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
