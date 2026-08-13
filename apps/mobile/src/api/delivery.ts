import axios from 'axios';
import {API_URL} from '../config/env';
import {useAuthStore} from '../store/authStore';
import type {
  AnswerPayload,
  GetSubmissionResponse,
  PublicTest,
  SubmissionResult,
} from '../types/delivery';

// The `/public/*` delivery endpoints (test-taking) live under the API host
// but outside the `/api/v1` prefix, mirroring apps/frontend/src/api/baseUrl.ts's
// getPublicBaseUrl(). API_URL already ends with /api/v1, so strip it here.
const PUBLIC_BASE_URL = API_URL.replace(/\/api\/v1\/?$/, '');

const publicClient = axios.create({baseURL: PUBLIC_BASE_URL, timeout: 15000});
publicClient.interceptors.request.use(config => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function practiceParams(practiceMode: boolean) {
  return practiceMode ? {practice: '1'} : undefined;
}

export async function apiGetPublicTest(slug: string, practiceMode = false): Promise<PublicTest> {
  const res = await publicClient.get(`/public/tests/${slug}`, {params: practiceParams(practiceMode)});
  return res.data;
}

export async function apiGetSubmission(
  submissionId: string,
  practiceMode = false,
): Promise<GetSubmissionResponse> {
  const res = await publicClient.get(`/public/submissions/${submissionId}`, {
    params: practiceParams(practiceMode),
  });
  return res.data;
}

export async function apiGetSubmissionResult(
  submissionId: string,
  practiceMode = false,
): Promise<SubmissionResult> {
  const res = await publicClient.get(`/public/submissions/${submissionId}/result`, {
    params: practiceParams(practiceMode),
  });
  return res.data;
}

export async function apiStartSubmission(
  slug: string,
  studentName: string,
  practiceMode = false,
): Promise<{submissionId: string}> {
  const res = await publicClient.post(
    '/public/submissions',
    {slug, studentName},
    {params: practiceParams(practiceMode)},
  );
  return res.data;
}

export async function apiCheckAnswer(
  submissionId: string,
  questionId: string,
  selectedOptionIds: string[],
  textAnswer: string | null,
  practiceMode = false,
): Promise<{isCorrect: boolean | null; correctAnswer: string | null; correctOptionIds: string[]}> {
  const res = await publicClient.post(
    `/public/submissions/${submissionId}/check`,
    {questionId, selectedOptionIds, textAnswer},
    {params: practiceParams(practiceMode)},
  );
  return res.data;
}

export async function apiSubmitAnswers(
  submissionId: string,
  answers: AnswerPayload[],
  mode: 'normal' | 'violation' = 'normal',
  violationReason?: string | null,
  practiceMode = false,
): Promise<SubmissionResult> {
  const res = await publicClient.post(
    `/public/submissions/${submissionId}/submit`,
    {answers, mode, violationReason},
    {params: practiceParams(practiceMode)},
  );
  return res.data;
}

export function mediaUrl(url: string): string {
  return url.startsWith('http') ? url : `${PUBLIC_BASE_URL}${url}`;
}
