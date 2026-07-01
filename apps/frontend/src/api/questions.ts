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
  type: 'single' | 'multi' | 'open' | 'arrange' | 'truefalse' | 'reorder' | 'matching' | 'fillblank';
  orderIndex: number;
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
  createdAt: string;
  options: Option[];
}

export async function apiUploadMedia(file: File): Promise<{ url: string; type: 'image' | 'audio' }> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data;
}

export async function apiAddQuestion(testId: string, data: {
  text: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
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
