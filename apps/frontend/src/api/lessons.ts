import client from './client';

export interface ApiLesson {
  id: string;
  moduleId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  createdAt: string;
}

export async function apiListLessons(moduleId: string): Promise<ApiLesson[]> {
  const res = await client.get(`/modules/${moduleId}/lessons`);
  return res.data;
}

export async function apiCreateLesson(moduleId: string, title: string): Promise<ApiLesson> {
  const res = await client.post(`/modules/${moduleId}/lessons`, { title });
  return res.data;
}

export async function apiUpdateLesson(id: string, data: { title?: string; status?: string }): Promise<ApiLesson> {
  const res = await client.patch(`/lessons/${id}`, data);
  return res.data;
}

export async function apiDeleteLesson(id: string): Promise<void> {
  await client.delete(`/lessons/${id}`);
}
