import axios from 'axios';
import { useLoadingStore } from '../store/loadingStore';
import { getPublicBaseUrl } from './baseUrl';

const publicClient = axios.create({
  baseURL: getPublicBaseUrl(),
});

publicClient.interceptors.request.use((config) => {
  useLoadingStore.getState().inc();
  return config;
});

publicClient.interceptors.response.use(
  (res) => { useLoadingStore.getState().dec(); return res; },
  (err) => { useLoadingStore.getState().dec(); return Promise.reject(err); },
);

export interface PublicOption {
  id: string;
  text: string;
  orderIndex: number;
}

export interface PublicQuestion {
  id: string;
  text: string;
  type: 'single' | 'multi' | 'open' | 'arrange';
  orderIndex: number;
  imageUrl?: string | null;
  audioUrl?: string | null;
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
  questionText: string;
  questionType: string;
  isCorrect: boolean | null;
  selectedOptionIds: string[];
  textAnswer: string | null;
  options?: Array<{ id: string; text: string; isCorrectOption: boolean }>;
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

export async function apiGetSubmission(submissionId: string): Promise<
  | { status: 'in_progress'; testId: string; studentName: string }
  | { status: 'submitted'; score: number; total: number; showResults: string; deadline: string | null }
> {
  const res = await publicClient.get(`/public/submissions/${submissionId}`);
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
