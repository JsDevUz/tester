import client from './client';

export interface ApiPracticeBlock {
  id: string;
  lessonId: string;
  type: 'test' | 'image' | 'oral';
  testId: string | null;
  orderIndex: number;
  description: string;
  maxScore: number | null;
}

export async function apiListPracticeBlocks(lessonId: string): Promise<ApiPracticeBlock[]> {
  const res = await client.get(`/lessons/${lessonId}/practice-blocks`);
  return res.data;
}

export async function apiCreatePracticeBlock(lessonId: string, type: 'test' | 'image' | 'oral' = 'test'): Promise<ApiPracticeBlock> {
  const res = await client.post(`/lessons/${lessonId}/practice-blocks`, { type });
  return res.data;
}

export interface ApiImageSubmission {
  id: string;
  imageUrl: string;
  submittedAt: string;
  score: number | null;
  graded: boolean;
}

export async function apiSubmitPracticeImage(practiceBlockId: string, imageUrl: string): Promise<ApiImageSubmission> {
  const res = await client.post(`/practice-blocks/${practiceBlockId}/image-submissions`, { imageUrl });
  return res.data;
}

export async function apiDeletePracticeImageSubmission(id: string): Promise<void> {
  await client.delete(`/image-submissions/${id}`);
}

export interface ApiImageSubmissionForGrading {
  id: string;
  practiceBlockId: string;
  studentId: string;
  studentName: string;
  imageUrl: string;
  submittedAt: string;
  score: number | null;
  gradedAt: string | null;
}

export async function apiListImageSubmissionsForGrading(lessonId: string): Promise<ApiImageSubmissionForGrading[]> {
  const res = await client.get(`/lessons/${lessonId}/image-submissions`);
  return res.data;
}

export async function apiGradeImageSubmission(id: string, score: number): Promise<ApiImageSubmissionForGrading> {
  const res = await client.patch(`/image-submissions/${id}/grade`, { score });
  return res.data;
}

export async function apiGradeOralPracticeBlock(practiceBlockId: string, studentId: string, score: number): Promise<{ score: number; gradedAt: string }> {
  const res = await client.patch(`/practice-blocks/${practiceBlockId}/oral-grades/${studentId}`, { score });
  return res.data;
}

export async function apiGradeTestPracticeSubmission(
  submissionId: string,
  score: number,
): Promise<{
  id: string;
  earnedScore: number;
  scoreOverridden: boolean;
  scoreOverriddenAt: string;
}> {
  const res = await client.patch(`/test-practice-submissions/${submissionId}/grade`, { score });
  return res.data;
}

export async function apiUpdatePracticeBlock(
  id: string,
  data: { testId?: string | null; description?: string; maxScore?: number | null },
): Promise<ApiPracticeBlock> {
  const res = await client.patch(`/practice-blocks/${id}`, data);
  return res.data;
}

export async function apiDeletePracticeBlock(id: string): Promise<void> {
  await client.delete(`/practice-blocks/${id}`);
}

export async function apiReorderPracticeBlocks(lessonId: string, blockIds: string[]): Promise<void> {
  await client.post(`/lessons/${lessonId}/practice-blocks/reorder`, { blockIds });
}
