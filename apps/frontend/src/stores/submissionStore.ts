import { create } from 'zustand';
import { apiGetSubmissions, apiGetSubmission, type Submission, type SubmissionDetail } from '../api/submissions';

interface SubmissionState {
  submissions: Submission[];
  fetchSubmissions: (testId: string) => Promise<void>;
  getSubmission: (id: string) => Promise<SubmissionDetail>;
}

export const useSubmissionStore = create<SubmissionState>()((set) => ({
  submissions: [],
  fetchSubmissions: async (testId) => {
    const submissions = await apiGetSubmissions(testId);
    set({ submissions });
  },
  getSubmission: async (id) => {
    return apiGetSubmission(id);
  },
}));
