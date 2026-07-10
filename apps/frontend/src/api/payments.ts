import client from './client';

export interface ApiMonthlyPayment {
  id: string;
  groupMemberId: string;
  periodMonth: string;
  expectedAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'debt' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface ApiPaymentRow {
  id: string;
  groupMemberId: string;
  periodMonth: string;
  expectedAmount: number;
  discountAmount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid' | 'debt' | 'cancelled';
  paymentMethod: string | null;
  note: string | null;
  receiptUrl: string | null;
  updatedAt: string;
  studentName: string;
  studentPhone: string | null;
  courseTitle: string;
  groupName: string;
  planName: string | null;
}

export async function apiListAllPayments(): Promise<ApiPaymentRow[]> {
  const res = await client.get('/payments');
  return res.data;
}

export async function apiListGroupPayments(groupId: string): Promise<ApiMonthlyPayment[]> {
  const res = await client.get(`/groups/${groupId}/payments`);
  return res.data;
}

export async function apiRecordPayment(
  paymentId: string,
  amount: number,
  discount?: number,
  method?: string,
  note?: string,
  receiptUrl?: string,
): Promise<ApiMonthlyPayment> {
  const res = await client.post(`/payments/${paymentId}/pay`, { amount, discount, method, note, receiptUrl });
  return res.data;
}

export async function apiCancelPayment(paymentId: string): Promise<ApiMonthlyPayment> {
  const res = await client.post(`/payments/${paymentId}/cancel`);
  return res.data;
}
