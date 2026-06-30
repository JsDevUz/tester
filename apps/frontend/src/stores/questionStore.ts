import { create } from 'zustand';
import { apiAddQuestion, apiBulkImport, apiUpdateQuestion, apiDeleteQuestion, type Question } from '../api/questions';

interface QuestionState {
  questions: Question[];
  setQuestions: (questions: Question[]) => void;
  addQuestion: (testId: string, data: { text: string; type: string; options: Array<{ text: string; isCorrect: boolean }> }) => Promise<void>;
  bulkImport: (testId: string, text: string) => Promise<number>;
  updateQuestion: (id: string, data: { text?: string; type?: string; orderIndex?: number }) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
}

export const useQuestionStore = create<QuestionState>((set, get) => ({
  questions: [],
  setQuestions: (questions) => set({ questions }),
  addQuestion: async (testId, data) => {
    const question = await apiAddQuestion(testId, data);
    set({ questions: [...get().questions, question] });
  },
  bulkImport: async (testId, text) => {
    const { imported } = await apiBulkImport(testId, text);
    return imported;
  },
  updateQuestion: async (id, data) => {
    const updated = await apiUpdateQuestion(id, data);
    set({ questions: get().questions.map((q) => (q.id === id ? updated : q)) });
  },
  deleteQuestion: async (id) => {
    await apiDeleteQuestion(id);
    set({ questions: get().questions.filter((q) => q.id !== id) });
  },
}));
