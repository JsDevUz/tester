import client from './client';

export interface ApiPracticeBlock {
  id: string;
  lessonId: string;
  testId: string | null;
  orderIndex: number;
  description: string;
  maxScore: number | null;
}

export async function apiListPracticeBlocks(lessonId: string): Promise<ApiPracticeBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/practice-blocks`);
  return res.data;
}

export async function apiCreatePracticeBlock(lessonId: string): Promise<ApiPracticeBlock> {
  const res = await client.post(`/lessons/${lessonId}/practice-blocks`, { type: 'test' });
  return res.data;
}

export async function apiUpdatePracticeBlock(
  id: string,
  data: { testId?: string | null; description?: string; maxScore?: number | null },
): Promise<ApiPracticeBlock> {
  const res = await client.patch(`/practice-blocks/${id}`, data);
  return res.data;
}

export async function apiDeletePracticeBlock(id: string): Promise<void> {
  await client.delete(`/practice-blocks/${id}`);
}

export async function apiReorderPracticeBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/practice-blocks/reorder`, { blockIds });
}
