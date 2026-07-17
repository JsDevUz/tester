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
}

// Gateway service ga shu interfeys orqali ulanadi — testlarda fake beriladi
export interface ClassroomBroadcaster {
  toRoom(sessionId: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}
