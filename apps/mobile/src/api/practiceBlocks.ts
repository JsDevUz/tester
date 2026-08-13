import {api} from '../lib/api';
import type {ApiMyImageSubmission} from '../types/api';

export async function apiSubmitPracticeImage(
  practiceBlockId: string,
  imageUrl: string,
): Promise<ApiMyImageSubmission> {
  const res = await api.post(`/practice-blocks/${practiceBlockId}/image-submissions`, {
    imageUrl,
  });
  return res.data;
}

export async function apiDeletePracticeImageSubmission(id: string): Promise<void> {
  await api.delete(`/image-submissions/${id}`);
}
