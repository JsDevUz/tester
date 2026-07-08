import client from './client';

export interface ApiContentBlock {
  id: string;
  lessonId: string;
  type: 'editor' | 'video' | 'image' | 'file';
  orderIndex: number;
  html: string | null;
  fileName: string | null;
  previewUrl: string | null;
  embedUrl: string | null;
  label: string | null;
  createdAt: string;
}

export async function apiListBlocks(lessonId: string): Promise<ApiContentBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/blocks`);
  return res.data;
}

export async function apiCreateBlock(lessonId: string, type: 'editor'): Promise<ApiContentBlock> {
  const res = await client.post(`/lessons/${lessonId}/blocks`, { type });
  return res.data;
}

export async function apiUpdateBlock(
  id: string,
  data: { html?: string; label?: string },
): Promise<ApiContentBlock> {
  const res = await client.patch(`/blocks/${id}`, data);
  return res.data;
}

export async function apiDeleteBlock(id: string): Promise<void> {
  await client.delete(`/blocks/${id}`);
}

export async function apiReorderBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/blocks/reorder`, { blockIds });
}
