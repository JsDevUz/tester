import client from './client';

export interface ApiCourse {
  id: string;
  adminId: string;
  title: string;
  createdAt: string;
}

export async function apiListCourses(): Promise<ApiCourse[]> {
  const res = await client.get('/courses');
  return res.data;
}

export async function apiCreateCourse(title: string): Promise<ApiCourse> {
  const res = await client.post('/courses', { title });
  return res.data;
}

export async function apiRenameCourse(id: string, title: string): Promise<ApiCourse> {
  const res = await client.patch(`/courses/${id}`, { title });
  return res.data;
}

export async function apiDeleteCourse(id: string): Promise<void> {
  await client.delete(`/courses/${id}`);
}
