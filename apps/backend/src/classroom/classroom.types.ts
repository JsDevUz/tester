export type ClassroomTool = 'pen' | 'highlighter' | 'arrow';

export interface ClassroomStroke {
  id: string;
  tool: ClassroomTool;
  color: string;
  width: number;
  // Normalizatsiyalangan (0..1) koordinatalar, flat: [x0, y0, x1, y1, ...]
  points: number[];
}

export type AttendanceStatus = 'absent' | 'present' | 'late';

export interface ClassroomParticipant {
  userId: string;
  name: string;
  enrollmentId: string;
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
}

export interface ClassroomSession {
  id: string;
  courseId: string;
  courseName: string;
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
  // Ustozning oxirgi scroll pozitsiyasi — kech kirgan o'quvchiga snapshot
  // orqali, hozir ulanganlarga broadcast orqali yetkaziladi.
  scroll: ClassroomScrollPosition | null;
}

export interface ClassroomSnapshot {
  sessionId: string;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, ClassroomStroke[]>;
  participants: Array<{ userId: string; name: string; online: boolean; status: AttendanceStatus }>;
  startedAt: number;
  hostOnline: boolean;
  zoom: number;
  scroll: ClassroomScrollPosition | null;
}

// Gateway service ga shu interfeys orqali ulanadi — testlarda fake beriladi
export interface ClassroomBroadcaster {
  toRoom(sessionId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}
