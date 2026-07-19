export type ClassroomTool = 'pen' | 'highlighter' | 'arrow' | 'text' | 'rectangle' | 'ellipse';
export type ClassroomBoardMode = 'pdf' | 'notebook';
export type ClassroomBoardLayout = 'single' | 'split';
export type ClassroomTheme = 'light' | 'dark';
export type ClassroomNotebookStyle = 'grid' | 'lined' | 'plain';

export type ClassroomFontFamily = 'Inter' | 'Arial' | 'Georgia' | 'Comic Sans MS' | 'Nunito';
export type ClassroomFillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type ClassroomStrokeStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type ClassroomSloppiness = 0 | 1 | 2;
export type ClassroomEdges = 'sharp' | 'round';

export interface ClassroomStroke {
  id: string;
  tool: ClassroomTool;
  color: string;
  width: number;
  // Text asbobi uchun matn mazmuni; points esa matnning chap-yuqori anchor'i.
  text?: string;
  fontFamily?: ClassroomFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: 'left' | 'center' | 'right';
  textBoxWidth?: number;
  textBoxHeight?: number;
  rotation?: number;
  // Shape (rectangle/ellipse) sozlamalari.
  backgroundColor?: string;
  fillStyle?: ClassroomFillStyle;
  strokeStyle?: ClassroomStrokeStyle;
  sloppiness?: ClassroomSloppiness;
  edges?: ClassroomEdges;
  opacity?: number;
  // Normalizatsiyalangan (0..1) koordinatalar, flat: [x0, y0, x1, y1, ...].
  // Shape uchun bounding box burchaklari: [x0, y0, x1, y1].
  points: number[];
}

export type AttendanceStatus = 'absent' | 'present' | 'late';

export interface ClassroomParticipant {
  userId: string;
  name: string;
  // Erkin (guruhsiz) darsda enrollment umuman bo'lmaydi — davomat yozilmaydi.
  enrollmentId: string | null;
  socketId: string | null;
  // Joriy ulanish intervalining boshlanishi; offline bo'lsa null
  joinedAtMs: number | null;
  totalSeconds: number;
  status: AttendanceStatus;
}

// Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
// balandligi ichidagi nisbiy joy (0..1). Umumiy scrollHeight ratio o'rniga
// shu model ishlatiladi: ikkala tomonda ham lazy-loading tufayli render
// qilingan sahifalar soni farq qilsa-da, bitta sahifaning o'zi fixed
// o'lchamda bo'lgani uchun natija hech qachon siljimaydi.
export interface ClassroomScrollPosition {
  page: number;
  yRatio: number;
  xRatio?: number;
}

// Har bir chizma/board mutatsiyasi shu shaklda saqlanadi (faqat
// isFree=false sessiyalarda) — payload har doim mos socket broadcast
// payload'i bilan bir xil, shunda frontend bir xil reducer'ni ham
// jonli sinxronizatsiyada, ham replay'da qayta ishlata oladi.
export interface ClassroomHistoryEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

export interface ClassroomSession {
  id: string;
  // Erkin (guruhsiz) darsda courseId/courseName null — kursga umuman
  // bog'liq emas, DB'ga hech qanday yozuv qilinmaydi.
  courseId: string | null;
  courseName: string | null;
  isFree: boolean;
  hostUserId: string;
  hostSocketId: string | null;
  pdfName: string | null;
  pdfPages: string[];
  currentPage: number; // 1-indexed
  strokesByPage: Map<number, ClassroomStroke[]>;
  participants: Map<string, ClassroomParticipant>; // userId → participant
  startedAtMs: number;
  hostDisconnectTimer: NodeJS.Timeout | null;
  // Ustozning joriy zoom darajasi — o'quvchi sinxron rejimda bo'lsa shu
  // qiymatga moslashadi. Kech kirganlarga snapshot orqali yetkaziladi.
  zoom: number;
  rightZoom?: number;
  // Ustozning oxirgi scroll pozitsiyasi — kech kirgan o'quvchiga snapshot
  // orqali, hozir ulanganlarga broadcast orqali yetkaziladi.
  scroll: ClassroomScrollPosition | null;
  rightScroll?: ClassroomScrollPosition | null;
  boardMode?: ClassroomBoardMode;
  // MUHIM: chap va o'ng panel bir xil mode-bo'yicha havuzdan o'qiydi/yozadi
  // (pane emas, mode identifikator) — shu sabab split taxtalar almashtirilganda
  // (swap) o'sha mode'ga tegishli chizmalar ham birga "ko'chib" o'tadi.
  strokesByMode?: Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>>;
  boardLayout?: ClassroomBoardLayout;
  leftBoardMode?: ClassroomBoardMode;
  rightBoardMode?: ClassroomBoardMode;
  classroomTheme?: ClassroomTheme;
  notebookStyle?: ClassroomNotebookStyle;
  // Faqat isFree=false sessiyalarda to'ldiriladi — dars tugaganda
  // class_sessions.history_events'ga saqlanadi.
  historyEvents?: ClassroomHistoryEvent[];
}

export interface ClassroomSnapshot {
  sessionId: string;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, ClassroomStroke[]>;
  rightStrokesByPage: Record<number, ClassroomStroke[]>;
  participants: Array<{ userId: string; name: string; online: boolean; status: AttendanceStatus }>;
  startedAt: number;
  hostOnline: boolean;
  zoom: number;
  rightZoom: number;
  scroll: ClassroomScrollPosition | null;
  rightScroll: ClassroomScrollPosition | null;
  isFree: boolean;
  boardMode: ClassroomBoardMode;
  boardLayout: ClassroomBoardLayout;
  leftBoardMode: ClassroomBoardMode;
  rightBoardMode: ClassroomBoardMode;
  classroomTheme: ClassroomTheme;
  notebookStyle: ClassroomNotebookStyle;
}

// Gateway service ga shu interfeys orqali ulanadi — testlarda fake beriladi
export interface ClassroomBroadcaster {
  toRoom(sessionId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}
