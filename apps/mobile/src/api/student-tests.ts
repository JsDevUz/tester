import {api} from '../lib/api';

export interface QuestionOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface Question {
  id: string;
  testId: string;
  text: string;
  type: string;
  orderIndex: number;
  imageUrl: string | null;
  audioUrl: string | null;
  correctAnswer: string | null;
  options: QuestionOption[];
}

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
  return (await api.get('/me/test-folders')).data;
}

export async function apiCreateStudentFolder(name: string, color?: string, icon?: string): Promise<StudentFolder> {
  return (await api.post('/me/test-folders', {name, color, icon})).data;
}

export async function apiUpdateStudentFolder(id: string, data: {name?: string; color?: string; icon?: string}): Promise<StudentFolder> {
  return (await api.patch(`/me/test-folders/${id}`, data)).data;
}

export async function apiDeleteStudentFolder(id: string): Promise<void> {
  await api.delete(`/me/test-folders/${id}`);
}

export async function apiFetchStudentTests(folderId: string): Promise<StudentTest[]> {
  return (await api.get('/me/tests', {params: {folder_id: folderId}})).data;
}

export async function apiGetStudentTest(id: string): Promise<StudentTestDetail> {
  return (await api.get(`/me/tests/${id}`)).data;
}

export async function apiCreateStudentTest(data: CreateStudentTestData): Promise<StudentTest> {
  return (await api.post('/me/tests', data)).data;
}

export async function apiUpdateStudentTest(id: string, data: Partial<Omit<CreateStudentTestData, 'folderId'>>): Promise<StudentTest> {
  return (await api.patch(`/me/tests/${id}`, data)).data;
}

export async function apiDeleteStudentTest(id: string): Promise<void> {
  await api.delete(`/me/tests/${id}`);
}

export type CreateStudentQuestionData = {
  text: string;
  type: string;
  options: Array<{text: string; isCorrect: boolean; orderIndex?: number}>;
  imageUrl?: string;
  audioUrl?: string;
  correctAnswer?: string;
};

export async function apiAddStudentQuestion(testId: string, data: CreateStudentQuestionData): Promise<Question> {
  return (await api.post(`/me/tests/${testId}/questions`, data)).data;
}

export async function apiUpdateStudentQuestion(id: string, data: Partial<CreateStudentQuestionData>): Promise<Question> {
  return (await api.patch(`/me/questions/${id}`, data)).data;
}

export async function apiDeleteStudentQuestion(id: string): Promise<void> {
  await api.delete(`/me/questions/${id}`);
}
