import client from './client';

// ---------- REST ----------

export interface ActiveClassSession {
  id: string;
  groupId: string;
  groupName: string;
  startedAt: number;
}

export async function apiCreateClassSession(groupId: string): Promise<{ id: string }> {
  const res = await client.post('/classroom/sessions', { groupId });
  return res.data;
}

export async function apiUploadClassPdf(sessionId: string, file: File): Promise<{ pdfName: string; pages: string[] }> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post(`/classroom/sessions/${sessionId}/pdf`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function apiEndClassSession(sessionId: string): Promise<void> {
  await client.post(`/classroom/sessions/${sessionId}/end`);
}

export async function apiActiveClassSessions(): Promise<ActiveClassSession[]> {
  const res = await client.get('/classroom/sessions/active');
  return res.data;
}

export interface ClassAttendanceEntry {
  id: string;
  userId: string;
  name: string;
  status: 'absent' | 'present' | 'late';
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  totalSeconds: number;
  overridden: boolean;
}

export interface ClassSessionDetail {
  id: string;
  groupId: string;
  groupName: string;
  status: 'active' | 'ended';
  pdfName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  attendance: ClassAttendanceEntry[];
}

export async function apiClassSession(sessionId: string): Promise<ClassSessionDetail> {
  const res = await client.get(`/classroom/sessions/${sessionId}`);
  return res.data;
}

export interface ClassHistoryItem {
  id: string;
  status: 'active' | 'ended';
  pdfName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  total: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
}

export async function apiClassHistory(groupId: string): Promise<ClassHistoryItem[]> {
  const res = await client.get(`/classroom/groups/${groupId}/history`);
  return res.data;
}

export async function apiOverrideAttendance(recordId: string, status: 'absent' | 'present' | 'late'): Promise<void> {
  await client.patch(`/classroom/attendance/${recordId}`, { status });
}

export async function apiVoiceToken(sessionId: string): Promise<{ token: string; url: string }> {
  const res = await client.post(`/classroom/sessions/${sessionId}/voice-token`);
  return res.data;
}

export async function apiMuteParticipant(sessionId: string, userId: string): Promise<void> {
  await client.post(`/classroom/sessions/${sessionId}/participants/${userId}/mute`);
}

// ---------- WS payload tiplari ----------

export type CsTool = 'pen' | 'highlighter';

export interface CsStroke {
  id: string;
  tool: CsTool;
  color: string;
  width: number;
  // Normalizatsiyalangan (0..1), flat: [x0, y0, x1, y1, ...]
  points: number[];
}

export interface CsParticipant {
  userId: string;
  name: string;
  online: boolean;
  status: 'absent' | 'present' | 'late';
}

export interface CsSnapshot {
  sessionId: string;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  startedAt: number;
  hostOnline: boolean;
}

export interface CsPresenceUpdate {
  participants: CsParticipant[];
  hostOnline: boolean;
}

export interface CsPointer {
  page: number;
  x: number;
  y: number;
  active: boolean;
}
