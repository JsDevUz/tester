import client from './client';

export interface ApiMonthlyPayment {
  id: string;
  groupMemberId: string;
  periodMonth: string;
  expectedAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'debt';
  createdAt: string;
  updatedAt: string;
}

export async function apiListGroupPayments(groupId: string): Promise<ApiMonthlyPayment[]> {
  const res = await client.get(`/groups/${groupId}/payments`);
  return res.data;
}

export async function apiRecordPayment(
  paymentId: string,
  amount: number,
  discount?: number,
): Promise<ApiMonthlyPayment> {
  const res = await client.post(`/payments/${paymentId}/pay`, { amount, discount });
  return res.data;
}
