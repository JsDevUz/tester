import client from './client';

export interface ApiModule {
  id: string;
  courseId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
}

export async function apiListModules(courseId: string): Promise<ApiModule[]> {
  const res = await client.get(`/courses/${courseId}/modules`);
  return res.data;
}

export async function apiCreateModule(courseId: string, title: string): Promise<ApiModule> {
  const res = await client.post(`/courses/${courseId}/modules`, { title });
  return res.data;
}

export async function apiRenameModule(id: string, title: string): Promise<ApiModule> {
  const res = await client.patch(`/modules/${id}`, { title });
  return res.data;
}

export async function apiDeleteModule(id: string): Promise<void> {
  await client.delete(`/modules/${id}`);
}

export async function apiReorderModules(courseId: string, moduleIds: string[]): Promise<void> {
  await client.post(`/courses/${courseId}/modules/reorder`, { moduleIds });
}
