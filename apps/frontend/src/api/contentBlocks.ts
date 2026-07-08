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
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  sourceKey: string | null;
  hlsMasterKey: string | null;
  hlsBaseKey: string | null;
  aesKeyRef: string | null;
  durationSec: number | null;
  errorMessage: string | null;
  processedAt: string | null;
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
  data: { html?: string; label?: string; embedUrl?: string },
): Promise<ApiContentBlock> {
  const res = await client.patch(`/blocks/${id}`, data);
  return res.data;
}

export async function apiUploadVideoBlock(
  lessonId: string,
  file: File,
  label?: string,
  onProgress?: (percent: number) => void,
): Promise<ApiContentBlock> {
  const formData = new FormData();
  formData.append('file', file);
  if (label) formData.append('label', label);
  const res = await client.post(`/lessons/${lessonId}/videos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return res.data;
}

export async function apiRetryVideoBlock(blockId: string): Promise<ApiContentBlock> {
  const res = await client.post(`/blocks/${blockId}/videos/retry`);
  return res.data;
}

export async function apiStartVideoPlayback(
  blockId: string,
): Promise<{ token: string; manifestUrl: string; expiresAt: string }> {
  const res = await client.post(`/videos/${blockId}/play`);
  return res.data;
}

export async function apiDeleteBlock(id: string): Promise<void> {
  await client.delete(`/blocks/${id}`);
}

export async function apiReorderBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/blocks/reorder`, { blockIds });
}
