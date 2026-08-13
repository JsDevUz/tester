import {api} from '../lib/api';
import type {Admin} from '../types/api';

export async function apiUpdateProfile(input: {
  name?: string;
  avatarUrl?: string;
}): Promise<Admin> {
  const res = await api.patch('/auth/me', input);
  return res.data;
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ok: true}> {
  const res = await api.patch('/auth/me/password', {
    currentPassword,
    newPassword,
  });
  return res.data;
}

export async function apiVerifyPasswordResetCode(
  code: string,
): Promise<{resetToken: string}> {
  const res = await api.post('/auth/password/reset/verify-code', {code});
  return res.data;
}

export async function apiCompletePasswordReset(input: {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{access_token: string; admin: Admin}> {
  const res = await api.post('/auth/password/reset/complete', input);
  return res.data;
}

export async function apiUploadMedia(
  asset: {uri: string; type: string; name: string},
  folder: 'lessons' | 'questions' | 'payments' | 'practice-submissions' | 'avatars',
): Promise<{url: string; type: 'image' | 'audio' | 'file'}> {
  const form = new FormData();
  // React Native FormData accepts {uri, type, name} directly as a file part.
  form.append('file', asset as unknown as Blob);
  form.append('folder', folder);
  const res = await api.post('/upload', form, {
    headers: {'Content-Type': 'multipart/form-data'},
  });
  return res.data;
}
