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

export async function apiTelegramLogin(code: string): Promise<{ access_token: string; admin: Admin; user: Admin }> {
  const res = await client.post('/auth/telegram/verify', { code });
  return res.data;
}

export async function apiGetMe(): Promise<Admin> {
  const res = await client.get('/auth/me');
  return res.data;
}

export async function apiRequestRegistration(input: { name: string; email: string; phone: string }) {
  const res = await client.post('/auth/register/request', input);
  return res.data;
}

export async function apiVerifyRegistration(input: { code: string }) {
  const res = await client.post('/auth/register/verify', input);
  return res.data;
}

export async function apiRequestPasswordReset(phoneOrEmail: string) {
  const res = await client.post('/auth/password/reset/request', { phoneOrEmail });
  return res.data;
}

export async function apiVerifyPasswordReset(input: { phoneOrEmail: string; code: string }) {
  const res = await client.post('/auth/password/reset/verify', input);
  return res.data;
}
