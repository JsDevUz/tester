import client from './client';
import type { Admin } from './auth';

export async function apiListAdmins(): Promise<Admin[]> {
  const res = await client.get('/admins');
  return res.data;
}

export async function apiCreateAdmin(email: string, password: string, name: string): Promise<Admin> {
  const res = await client.post('/admins', { email, password, name });
  return res.data;
}

export async function apiUpdateUserRole(id: string, role: Admin['role']): Promise<Admin> {
  const res = await client.patch(`/admins/${id}/role`, { role });
  return res.data;
}

export async function apiDeleteAdmin(id: string): Promise<void> {
  await client.delete(`/admins/${id}`);
}
