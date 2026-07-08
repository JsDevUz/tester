import client from './client';

export interface ApiGroup {
  id: string;
  courseId: string;
  name: string;
  groupChatEnabled: boolean;
  groupChannelEnabled: boolean;
  inviteToken: string;
  paymentDay: number;
  createdAt: string;
}

export interface ApiGroupMember {
  id: string;
  groupId: string;
  studentId: string;
  role: 'student' | 'curator';
  selectedPlanId: string | null;
  forcedClosed: boolean;
  joinedAt: string;
  student: { id: string; name: string; phone: string | null; email: string };
  selectedPlan: { id: string; name: string; price: number } | null;
  latestPayment: {
    id: string;
    periodMonth: string;
    expectedAmount: number;
    discountAmount: number;
    paidAmount: number;
    status: 'pending' | 'partial' | 'paid' | 'debt';
  } | null;
}

export async function apiListGroups(courseId: string): Promise<ApiGroup[]> {
  const res = await client.get(`/courses/${courseId}/groups`);
  return res.data;
}

export async function apiCreateGroup(courseId: string, name: string, paymentDay?: number): Promise<ApiGroup> {
  const res = await client.post(`/courses/${courseId}/groups`, { name, paymentDay });
  return res.data;
}

export async function apiUpdateGroup(
  id: string,
  data: { name?: string; groupChatEnabled?: boolean; groupChannelEnabled?: boolean; paymentDay?: number },
): Promise<ApiGroup> {
  const res = await client.patch(`/groups/${id}`, data);
  return res.data;
}

export async function apiDeleteGroup(id: string): Promise<void> {
  await client.delete(`/groups/${id}`);
}

export async function apiListGroupMembers(groupId: string): Promise<ApiGroupMember[]> {
  const res = await client.get(`/groups/${groupId}/members`);
  return res.data;
}

export async function apiUpdateGroupMember(
  groupId: string,
  memberId: string,
  data: { role?: 'student' | 'curator'; selectedPlanId?: string | null },
): Promise<ApiGroupMember> {
  const res = await client.patch(`/groups/${groupId}/members/${memberId}`, data);
  return res.data;
}

export async function apiSetMemberForcedClosed(
  groupId: string,
  memberId: string,
  forcedClosed: boolean,
): Promise<ApiGroupMember> {
  const res = await client.patch(`/groups/${groupId}/members/${memberId}/force-close`, { forcedClosed });
  return res.data;
}

export async function apiRemoveGroupMember(groupId: string, memberId: string): Promise<void> {
  await client.delete(`/groups/${groupId}/members/${memberId}`);
}

export async function apiAssignCurator(groupId: string, studentId: string): Promise<ApiGroupMember> {
  const res = await client.post(`/groups/${groupId}/curators`, { studentId });
  return res.data;
}

export interface ApiPendingPlanAssignment {
  id: string;
  studentName: string;
  studentPhone: string | null;
  groupName: string;
  courseTitle: string;
  joinedAt: string;
}

export async function apiGetPendingPlanAssignment(): Promise<ApiPendingPlanAssignment[]> {
  const res = await client.get('/groups/pending-plan-assignment');
  return res.data;
}

export async function apiGetJoinPreview(token: string): Promise<{ groupName: string; courseTitle: string }> {
  const res = await client.get(`/join/${token}`);
  return res.data;
}

export async function apiJoinGroup(token: string): Promise<ApiGroupMember> {
  const res = await client.post(`/join/${token}`);
  return res.data;
}

export interface ApiMyCourse {
  courseId: string;
  courseTitle: string;
  groupName: string;
  selectedPlanName: string | null;
  latestPaymentStatus: 'pending' | 'partial' | 'paid' | 'debt' | null;
  hasAccess: boolean;
}

export async function apiGetMyCourses(): Promise<ApiMyCourse[]> {
  const res = await client.get('/my/courses');
  return res.data;
}
