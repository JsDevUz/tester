import client from './client';

export interface Folder {
  id: string;
  adminId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  testCount: number;
}

export async function apiFetchFolders(): Promise<Folder[]> {
  const res = await client.get('/folders');
  return res.data;
}

export async function apiCreateFolder(name: string, color?: string, icon?: string): Promise<Folder> {
  const res = await client.post('/folders', { name, color, icon });
  return res.data;
}

export async function apiUpdateFolder(id: string, data: { name?: string; color?: string; icon?: string }): Promise<Folder> {
  const res = await client.patch(`/folders/${id}`, data);
  return res.data;
}

export async function apiDeleteFolder(id: string): Promise<void> {
  await client.delete(`/folders/${id}`);
}
