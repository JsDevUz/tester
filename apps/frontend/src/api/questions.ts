import client from './client';

export interface Option {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface Question {
  id: string;
  testId: string;
  text: string;
  type: 'single' | 'multi' | 'open';
  orderIndex: number;
  createdAt: string;
  options: Option[];
}

export async function apiAddQuestion(testId: string, data: {
  text: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
}): Promise<Question> {
  const res = await client.post(`/tests/${testId}/questions`, data);
  return res.data;
}

export async function apiBulkImport(testId: string, text: string): Promise<{ imported: number }> {
  const res = await client.post(`/tests/${testId}/questions/bulk`, { text });
  return res.data;
}

export async function apiUpdateQuestion(id: string, data: { text?: string; type?: string; orderIndex?: number }): Promise<Question> {
  const res = await client.patch(`/questions/${id}`, data);
  return res.data;
}

export async function apiDeleteQuestion(id: string): Promise<void> {
  await client.delete(`/questions/${id}`);
}

export async function apiUpdateOption(id: string, data: { text?: string; isCorrect?: boolean; orderIndex?: number }): Promise<Option> {
  const res = await client.patch(`/options/${id}`, data);
  return res.data;
}

export async function apiDeleteOption(id: string): Promise<void> {
  await client.delete(`/options/${id}`);
}
