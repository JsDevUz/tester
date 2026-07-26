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
  requireAuth: boolean;
  autoCompleteOnLeave: boolean;
  onceOnly: boolean;
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
  requireAuth?: boolean;
  autoCompleteOnLeave?: boolean;
  onceOnly?: boolean;
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

export interface TestStatsOptionCount {
  id: string;
  text: string;
  isCorrectOption: boolean;
  count: number;
  students: string[];
}

export interface TestStatsTextAnswerCount {
  text: string;
  count: number;
}

export interface TestStatsMatchingPair {
  leftId: string;
  leftText: string;
  correctRightText: string;
  answeredCount: number;
  correctCount: number;
}

export interface TestStatsQuestion {
  questionId: string;
  questionText: string;
  questionType: string;
  answeredCount: number;
  correctCount: number;
  correctRate: number | null;
  optionCounts: TestStatsOptionCount[] | null;
  textAnswerCounts: TestStatsTextAnswerCount[] | null;
  matchingPairStats: TestStatsMatchingPair[] | null;
}

export interface TestStats {
  totalSubmissions: number;
  hardestQuestionId: string | null;
  easiestQuestionId: string | null;
  questions: TestStatsQuestion[];
}

export async function apiGetTestStats(testId: string): Promise<TestStats> {
  const res = await client.get(`/tests/${testId}/stats`);
  return res.data;
}

export interface AllTestsItem {
  id: string;
  name: string;
  questionCount: number;
}

export async function apiListAllTests(): Promise<AllTestsItem[]> {
  const res = await client.get('/live/tests');
  return res.data.map((t: { id: string; name: string; questionCount?: number; liveQuestionCount: number }) => ({
    id: t.id,
    name: t.name,
    questionCount: t.questionCount ?? t.liveQuestionCount,
  }));
}
