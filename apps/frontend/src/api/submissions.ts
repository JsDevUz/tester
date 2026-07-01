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
  questionType: 'single' | 'multi' | 'open';
  selectedOptionIds: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  correctOptionIds: string[];
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
}

export interface SubmissionDetail extends Submission {
  answers: AnswerDetail[];
}

export async function apiGetSubmissions(testId: string): Promise<Submission[]> {
  const res = await client.get(`/tests/${testId}/submissions`);
  return res.data;
}

export async function apiGetMySubmissions(): Promise<Submission[]> {
  const res = await client.get('/me/submissions');
  return res.data;
}

export async function apiGetSubmission(id: string): Promise<SubmissionDetail> {
  const res = await client.get(`/submissions/${id}`);
  return res.data;
}

export async function apiDeleteSubmission(id: string): Promise<void> {
  await client.delete(`/submissions/${id}`);
}
