import client from './client';
import type { Question } from './questions';

export type CreateQuestionInput = {
  text: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
};

export interface StudentFolder {
  id: string;
  adminId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  testCount: number;
}

export interface StudentTest {
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
  requireAuth: boolean;
  autoCompleteOnLeave: boolean;
  onceOnly: boolean;
  deadline: string | null;
  createdAt: string;
  slug: string | null;
}

export interface StudentTestDetail extends StudentTest {
  questions: Question[];
}

export type CreateStudentTestData = {
  folderId: string;
  name: string;
  description?: string;
  timeLimit?: number;
  showResults?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  oneByOne?: boolean;
  autoCompleteOnLeave?: boolean;
};

export async function apiFetchStudentFolders(): Promise<StudentFolder[]> {
  const res = await client.get('/me/test-folders');
  return res.data;
}

export async function apiCreateStudentFolder(name: string, color?: string, icon?: string): Promise<StudentFolder> {
  const res = await client.post('/me/test-folders', { name, color, icon });
  return res.data;
}

export async function apiUpdateStudentFolder(id: string, data: { name?: string; color?: string; icon?: string }): Promise<StudentFolder> {
  const res = await client.patch(`/me/test-folders/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentFolder(id: string): Promise<void> {
  await client.delete(`/me/test-folders/${id}`);
}

export async function apiFetchStudentTests(folderId: string): Promise<StudentTest[]> {
  const res = await client.get('/me/tests', { params: { folder_id: folderId } });
  return res.data;
}

export async function apiGetStudentTest(id: string): Promise<StudentTestDetail> {
  const res = await client.get(`/me/tests/${id}`);
  return res.data;
}

export async function apiCreateStudentTest(data: CreateStudentTestData): Promise<StudentTest> {
  const res = await client.post('/me/tests', data);
  return res.data;
}

export async function apiUpdateStudentTest(id: string, data: Partial<Omit<CreateStudentTestData, 'folderId'>>): Promise<StudentTest> {
  const res = await client.patch(`/me/tests/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentTest(id: string): Promise<void> {
  await client.delete(`/me/tests/${id}`);
}

export async function apiAddStudentQuestion(testId: string, data: CreateQuestionInput): Promise<Question> {
  const res = await client.post(`/me/tests/${testId}/questions`, data);
  return res.data;
}

export async function apiUpdateStudentQuestion(id: string, data: Partial<CreateQuestionInput>): Promise<Question> {
  const res = await client.patch(`/me/questions/${id}`, data);
  return res.data;
}

export async function apiDeleteStudentQuestion(id: string): Promise<void> {
  await client.delete(`/me/questions/${id}`);
}
