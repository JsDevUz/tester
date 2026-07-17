import client from './client';

// ---------- REST ----------

export interface ActiveClassSession {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
}

export async function apiCreateClassSession(courseId: string): Promise<{ id: string }> {
  const res = await client.post('/classroom/sessions', { courseId });
  return res.data;
}

// Kutubxonadagi (allaqachon WebP'ga konvertatsiya qilingan) PDF'dan
// ustoz tanlagan sahifalarni jonli darsga qo'shadi.
export async function apiAttachClassPdf(
  sessionId: string, mediaAssetId: string, pageNumbers: number[],
): Promise<{ pdfName: string; pages: string[] }> {
  const res = await client.post(`/classroom/sessions/${sessionId}/pdf`, { mediaAssetId, pageNumbers });
  return res.data;
}

// ---------- PDF kutubxonasi (jonli dars uchun alohida — umumiy fayl
// kutubxonasidan farqli, bu yerda PDF avtomatik sahifalarga aylantiriladi) ----------

export interface PdfLibraryAsset {
  id: string;
  url: string;
  type: 'file';
  originalName: string;
  uploaderName: string;
  sizeBytes: number;
  pdfPageCount: number | null;
  pdfProcessingStatus: string | null;
  createdAt: string;
}

export async function apiListPdfLibrary(): Promise<PdfLibraryAsset[]> {
  const res = await client.get('/classroom/pdf-library');
  return res.data;
}

export interface PdfLibraryUsage {
  totalBytes: number;
  fileCount: number;
  maxTotalBytes: number;
  maxFileCount: number;
}

export async function apiPdfLibraryUsage(): Promise<PdfLibraryUsage> {
  const res = await client.get('/classroom/pdf-library/usage');
  return res.data;
}

export async function apiGetPdfLibraryPages(assetId: string): Promise<{ pages: string[]; status: string | null }> {
  const res = await client.get(`/classroom/pdf-library/${assetId}/pages`);
  return res.data;
}

export async function apiUploadPdfToLibrary(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ id: string; originalName: string; pdfProcessingStatus: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/classroom/pdf-library', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return res.data;
}

export async function apiRetryPdfProcessing(assetId: string): Promise<void> {
  await client.post(`/classroom/pdf-library/${assetId}/retry`);
}

export async function apiDeletePdfFromLibrary(assetId: string): Promise<void> {
  await client.delete(`/classroom/pdf-library/${assetId}`);
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
  courseId: string;
  courseName: string;
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

export async function apiClassHistory(courseId: string): Promise<ClassHistoryItem[]> {
  const res = await client.get(`/classroom/courses/${courseId}/history`);
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
