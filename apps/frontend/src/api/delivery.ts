import axios from 'axios';

const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export interface PublicOption {
  id: string;
  text: string;
  orderIndex: number;
}

export interface PublicQuestion {
  id: string;
  text: string;
  type: 'single' | 'multi' | 'open';
  orderIndex: number;
  options: PublicOption[];
}

export interface PublicTest {
  id: string;
  name: string;
  description: string | null;
  timeLimit: number | null;
  showResults: 'immediately' | 'after_deadline' | 'hidden';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  oneByOne: boolean;
  deadline: string | null;
  questions: PublicQuestion[];
}

export interface AnswerResultItem {
  questionId: string;
  isCorrect: boolean | null;
}

export interface SubmissionResult {
  submissionId: string;
  score: number;
  total: number;
  showResults: 'immediately' | 'after_deadline' | 'hidden';
  deadline: string | null;
  answers: AnswerResultItem[];
}

export async function apiGetPublicTest(slug: string): Promise<PublicTest> {
  const res = await publicClient.get(`/public/tests/${slug}`);
  return res.data;
}

export async function apiStartSubmission(slug: string, studentName: string): Promise<{ submissionId: string }> {
  const res = await publicClient.post('/public/submissions', { slug, studentName });
  return res.data;
}

export async function apiSubmitAnswers(
  submissionId: string,
  answers: Array<{ questionId: string; selectedOptionIds: string[]; textAnswer: string | null }>,
): Promise<SubmissionResult> {
  const res = await publicClient.post(`/public/submissions/${submissionId}/submit`, { answers });
  return res.data;
}
