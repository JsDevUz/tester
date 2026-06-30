import client from './client';

export interface Test {
  id: string;
  folderId: string;
  adminId: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  deadline: string | null;
  createdAt: string;
  slug: string | null;
}

export interface TestDetail extends Test {
  questions: import('./questions').Question[];
}

export type CreateTestData = {
  folderId: string;
  name: string;
  description?: string;
  timeLimit?: number;
  showResults?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  oneByOne?: boolean;
  deadline?: string;
};

export async function apiFetchTests(folderId: string): Promise<Test[]> {
  const res = await client.get('/tests', { params: { folder_id: folderId } });
  return res.data;
}

export async function apiGetTest(id: string): Promise<TestDetail> {
  const res = await client.get(`/tests/${id}`);
  return res.data;
}

export async function apiCreateTest(data: CreateTestData): Promise<Test> {
  const res = await client.post('/tests', data);
  return res.data;
}

export async function apiUpdateTest(id: string, data: Partial<Omit<CreateTestData, 'folderId'>>): Promise<Test> {
  const res = await client.patch(`/tests/${id}`, data);
  return res.data;
}

export async function apiDeleteTest(id: string): Promise<void> {
  await client.delete(`/tests/${id}`);
}
