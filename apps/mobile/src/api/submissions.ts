import {api} from '../lib/api';
import type {SubmissionDetail, SubmissionResult} from '../types/api';

export async function apiGetMySubmissionDetail(id: string): Promise<SubmissionDetail> {
  const res = await api.get(`/me/submissions/${id}`);
  return res.data;
}

export async function apiGetSubmissionResult(
  submissionId: string,
  practiceMode = false,
): Promise<SubmissionResult> {
  const res = await api.get(`/public/submissions/${submissionId}/result`, {
    params: practiceMode ? {practice: '1'} : undefined,
  });
  return res.data;
}
