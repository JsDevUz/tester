import client from './client';

export interface ApiPricingPlan {
  id: string;
  launchId: string;
  groupId: string | null;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface ApiLaunch {
  id: string;
  courseId: string;
  name: string;
  active: boolean;
  createdAt: string;
  plans: ApiPricingPlan[];
}

export async function apiListLaunches(courseId: string): Promise<ApiLaunch[]> {
  const res = await client.get(`/courses/${courseId}/launches`);
  return res.data;
}

export async function apiCreateLaunch(courseId: string, name: string): Promise<ApiLaunch> {
  const res = await client.post(`/courses/${courseId}/launches`, { name });
  return res.data;
}

export async function apiUpdateLaunch(id: string, data: { name?: string; active?: boolean }): Promise<ApiLaunch> {
  const res = await client.patch(`/launches/${id}`, data);
  return res.data;
}

export async function apiDeleteLaunch(id: string): Promise<void> {
  await client.delete(`/launches/${id}`);
}

export async function apiCreatePricingPlan(
  launchId: string,
  data: {
    name: string;
    description?: string;
    price: number;
    originalPrice?: number | null;
    groupId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<ApiPricingPlan> {
  const res = await client.post(`/launches/${launchId}/plans`, data);
  return res.data;
}

export async function apiUpdatePricingPlan(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    originalPrice: number | null;
    groupId: string | null;
    startDate: string | null;
    endDate: string | null;
  }>,
): Promise<ApiPricingPlan> {
  const res = await client.patch(`/plans/${id}`, data);
  return res.data;
}

export async function apiDeletePricingPlan(id: string): Promise<void> {
  await client.delete(`/plans/${id}`);
}
