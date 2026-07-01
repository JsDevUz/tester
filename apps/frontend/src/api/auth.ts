import client from './client';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'super';
  phone?: string | null;
}

export async function apiLogin(email: string, password: string): Promise<{ access_token: string; admin: Admin; user: Admin }> {
  const res = await client.post('/auth/login', { email, password });
  return res.data;
}

export async function apiGetMe(): Promise<Admin> {
  const res = await client.get('/auth/me');
  return res.data;
}
