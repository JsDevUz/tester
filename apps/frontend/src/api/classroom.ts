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

// Erkin (guruhsiz) dars — kursga bog'liq emas, DB'ga yozuv qilinmaydi.
// Havolasi orqali login qilmagan mehmon ham kira oladi.
export async function apiCreateFreeClassSession(): Promise<{ id: string }> {
  const res = await client.post('/classroom/sessions/free');
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

// Kutubxonadan tanlangan (istalgan fayldan) sahifalarni mavjud darsga
// QO'SHADI — apiAttachClassPdf'dan farqli, eski sahifalarni almashtirmaydi.
export async function apiInsertClassPdfPages(
  sessionId: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
): Promise<{ pages: string[] }> {
  const res = await client.post(`/classroom/sessions/${sessionId}/pdf/insert`, { mediaAssetId, pageNumbers, afterPageIndex });
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
  recordingMode: ClassRecordingMode | null;
  hasBoardSnapshot: boolean;
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

export interface ClassReplayEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

// "Faqat chizma" rejimida saqlangan doskaning yakuniy (harakatsiz) holati —
// vektor darajasida saqlangani uchun istalgan zoom darajasida sifat
// yo'qolmasdan ko'rsatiladi.
export interface ClassBoardSnapshotData {
  pdfName: string | null;
  pages: string[];
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  notebookStyle: CsNotebookStyle;
  notebookPageStyles: Record<number, CsNotebookStyle>;
  notebookPageCount: number;
}

export interface ClassReplayData {
  // Ustoz (kurs egasi yoki erkin darsning host'i) bo'lsa true — faqat shu
  // holatda to'liq audio replay ko'rsatiladi. O'quvchi uchun har doim
  // faqat yakuniy chizma holati (statik) ko'rinishi kerak.
  isTeacher: boolean;
  pdfName: string | null;
  pdfPages: string[];
  historyEvents: ClassReplayEvent[];
  recordingUrl: string | null;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
  // Audio yozib olish sessiya boshlanishidan necha ms keyin boshlangani —
  // historyEvents[].atMs bilan bir xil birlik. Audio va chizma tarixi
  // replay'da mos kelishi uchun shu siljish audio elementiga qo'llanadi.
  recordingStartedAtMs: number | null;
  attendance: Array<{ userId: string; name: string; status: 'absent' | 'present' | 'late' }>;
  // Ustoz "Yozib olish"da tanlagan rejim — null bo'lsa hech narsa
  // yozilmagan. 'full' bo'lsa historyEvents to'liq. 'boardAudio'da final
  // boardSnapshot bilan birga faqat pointer/scroll/zoom timeline saqlanadi.
  // 'boardSilent' faqat statik boardSnapshot saqlaydi.
  recordingMode: ClassRecordingMode | null;
  boardSnapshot: ClassBoardSnapshotData | null;
}

export async function apiClassReplay(sessionId: string): Promise<ClassReplayData> {
  const res = await client.get(`/classroom/sessions/${sessionId}/replay`);
  return res.data;
}

export async function apiDeleteClassSession(sessionId: string): Promise<void> {
  await client.delete(`/classroom/sessions/${sessionId}`);
}

export async function apiOverrideAttendance(recordId: string, status: 'absent' | 'present' | 'late'): Promise<void> {
  await client.patch(`/classroom/attendance/${recordId}`, { status });
}

export async function apiVoiceToken(sessionId: string): Promise<{ token: string; url: string }> {
  const res = await client.post(`/classroom/sessions/${sessionId}/voice-token`);
  return res.data;
}

export type ClassRecordingMode = 'full' | 'boardAudio' | 'boardSilent';

export interface FreeClassHistoryItem {
  id: string;
  status: 'active' | 'ended';
  pdfName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  recordingMode: ClassRecordingMode | null;
  hasBoardSnapshot: boolean;
}

export async function apiMyFreeSessionHistory(): Promise<FreeClassHistoryItem[]> {
  const res = await client.get('/classroom/my-free-sessions');
  return res.data;
}

export interface StudentClassSessionItem {
  id: string;
  startedAt: string | null;
  teacherName: string;
  pdfName: string | null;
  hasBoardSnapshot: boolean;
  isFree: boolean;
}

export async function apiMyClassSessions(): Promise<StudentClassSessionItem[]> {
  const res = await client.get('/classroom/my-sessions');
  return res.data;
}

export async function apiStartClassRecording(sessionId: string, mode: ClassRecordingMode): Promise<void> {
  await client.post(`/classroom/sessions/${sessionId}/recording/start`, { mode });
}

export async function apiMuteParticipant(sessionId: string, userId: string): Promise<void> {
  await client.post(`/classroom/sessions/${sessionId}/participants/${userId}/mute`);
}

// ---------- WS payload tiplari ----------

export type CsTool = 'pen' | 'highlighter' | 'arrow' | 'line' | 'text' | 'rectangle' | 'ellipse';
export type CsBoardMode = 'pdf' | 'notebook';
export type CsBoardLayout = 'single' | 'split';
export type CsNotebookStyle = 'grid' | 'lined' | 'plain';

export type CsFontFamily = "Inter" | "Arial" | "Georgia" | "Comic Sans MS" | "Nunito";
export type CsFillStyle = "hachure" | "cross-hatch" | "solid";
export type CsStrokeStyle = "none" | "solid" | "dashed" | "dotted";
export type CsSloppiness = 0 | 1 | 2;
export type CsEdges = "sharp" | "round";

export interface CsStroke {
  id: string;
  tool: CsTool;
  color: string;
  width: number;
  text?: string;
  fontFamily?: CsFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: "left" | "center" | "right";
  textBoxWidth?: number;
  textBoxHeight?: number;
  rotation?: number;
  // Shape (rectangle/ellipse) uchun sozlamalar — Excalidraw uslubidagi
  // to'liq to'plam. backgroundColor undefined/"transparent" bo'lsa ichi
  // bo'sh chiziladi.
  backgroundColor?: string;
  fillStyle?: CsFillStyle;
  strokeStyle?: CsStrokeStyle;
  sloppiness?: CsSloppiness;
  edges?: CsEdges;
  opacity?: number;
  // Normalizatsiyalangan (0..1), flat: [x0, y0, x1, y1, ...]. Shape uchun
  // bounding box burchaklari: [x0, y0, x1, y1].
  points: number[];
  // Freehand qalam uchun har bir x/y nuqtaga mos 0..1 stylus bosimi.
  // Eski chizmalarda bo'lmasa tezlik asosida pressure simulyatsiya qilinadi.
  pressures?: number[];
}

export interface CsParticipant {
  userId: string;
  name: string;
  online: boolean;
  status: 'absent' | 'present' | 'late';
}

// Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
// balandligi ichidagi nisbiy joy (0..1). Umumiy scrollHeight ratio o'rniga
// ishlatiladi, chunki lazy-loading tufayli ustoz/o'quvchida render qilingan
// sahifalar soni farq qilsa ham, bitta sahifa fixed o'lchamda bo'lgani
// uchun natija hech qachon siljimaydi.
export interface CsScrollPosition {
  page: number;
  yRatio: number;
  xRatio?: number;
}

export interface CsSnapshot {
  sessionId: string;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  participants: CsParticipant[];
  startedAt: number;
  hostOnline: boolean;
  zoom: number;
  rightZoom?: number;
  splitRatio: number;
  notebookPageCount: number;
  scroll: CsScrollPosition | null;
  rightScroll?: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  classroomTheme: "light" | "dark";
  notebookStyle: CsNotebookStyle;
  notebookPageStyles: Record<number, CsNotebookStyle>;
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
  pane?: "left" | "right";
}
