import client from './client';

export interface Submission {
  id: string;
  testId: string;
  testName?: string;
  studentName: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
}

export interface AnswerDetail {
  questionId: string;
  questionText: string;
  questionType: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  correctAnswer?: string | null;
  isCorrect: boolean | null;
  options: Array<{ id: string; text: string; isCorrectOption: boolean }>;
}

export interface SubmissionDetail extends Submission {
  testName?: string;
  showResults?: string;
  answers: AnswerDetail[];
}

export async function apiGetSubmissions(testId: string): Promise<Submission[]> {
  const res = await client.get(`/tests/${testId}/submissions`);
  return res.data;
}

export async function apiGetMySubmissions(limit = 10, offset = 0): Promise<Submission[]> {
  const res = await client.get('/me/submissions', { params: { limit, offset } });
  return res.data;
}

export async function apiGetMySubmissionDetail(id: string): Promise<SubmissionDetail> {
  const res = await client.get(`/me/submissions/${id}`);
  return res.data;
}

export async function apiGetSubmission(id: string): Promise<SubmissionDetail> {
  const res = await client.get(`/submissions/${id}`);
  return res.data;
}

export async function apiDeleteSubmission(id: string): Promise<void> {
  await client.delete(`/submissions/${id}`);
}
