import client from './client';

export interface Admin {
  id: string;
  name: string;
  role: 'student' | 'teacher' | 'super' | 'curator';
  phone?: string | null;
  avatarUrl?: string | null;
}

export async function apiLogin(phone: string, password: string): Promise<{ access_token: string; admin: Admin; user: Admin }> {
  const res = await client.post('/auth/login', { phone, password });
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

export async function apiUpdateProfile(input: { name?: string; avatarUrl?: string }): Promise<Admin> {
  const res = await client.patch('/auth/me', input);
  return res.data;
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  const res = await client.patch('/auth/me/password', { currentPassword, newPassword });
  return res.data;
}

export async function apiRequestRegistration(input: { name: string; phone: string }) {
  const res = await client.post('/auth/register/request', input);
  return res.data;
}

export async function apiVerifyRegistration(input: { code: string }) {
  const res = await client.post('/auth/register/verify', input);
  return res.data;
}

export async function apiRequestPasswordReset(phone: string) {
  const res = await client.post('/auth/password/reset/request', { phone });
  return res.data;
}

export async function apiVerifyPasswordReset(input: { phone: string; code: string }) {
  const res = await client.post('/auth/password/reset/verify', input);
  return res.data;
}

export async function apiVerifyPasswordResetCode(code: string): Promise<{ resetToken: string }> {
  const res = await client.post('/auth/password/reset/verify-code', { code });
  return res.data;
}

export async function apiCompletePasswordReset(input: { resetToken: string; newPassword: string; confirmPassword: string }): Promise<{ access_token: string; admin: Admin; user: Admin }> {
  const res = await client.post('/auth/password/reset/complete', input);
  return res.data;
}
