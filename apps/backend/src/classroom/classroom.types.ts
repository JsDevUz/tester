export type ClassroomTool = 'pen' | 'highlighter' | 'laser' | 'arrow' | 'line' | 'text' | 'rectangle' | 'ellipse';
export type ClassroomBoardMode = 'pdf' | 'notebook';
export type ClassroomBoardLayout = 'single' | 'split';
export type ClassroomTheme = 'light' | 'dark';
export type ClassroomNotebookStyle = 'grid' | 'lined' | 'dot' | 'plain';
export type ClassroomNotebookOrientation = 'portrait' | 'landscape';

export type ClassroomFontFamily = 'Inter' | 'Arial' | 'Georgia' | 'Comic Sans MS' | 'Nunito';
export type ClassroomFillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type ClassroomStrokeStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type ClassroomSloppiness = 0 | 1 | 2;
export type ClassroomEdges = 'sharp' | 'round';
export type ClassroomBindingSide = 'top' | 'right' | 'bottom' | 'left';
export interface ClassroomShapeBinding {
  strokeId: string;
  side: ClassroomBindingSide;
  position?: number;
}

export interface ClassroomStroke {
  id: string;
  tool: ClassroomTool;
  createdAt?: number;
  color: string;
  textColor?: string;
  width: number;
  // Text asbobi uchun matn mazmuni; points esa matnning chap-yuqori anchor'i.
  text?: string;
  fontFamily?: ClassroomFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
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
  lineShape?: 'straight' | 'curved' | 'elbow';
  startArrowHead?: string;
  endArrowHead?: string;
  controlX?: number;
  controlY?: number;
  startBinding?: ClassroomShapeBinding;
  endBinding?: ClassroomShapeBinding;
  startBindingVector?: [number, number];
  endBindingVector?: [number, number];
  // Normalizatsiyalangan (0..1) koordinatalar, flat: [x0, y0, x1, y1, ...].
  // Shape uchun bounding box burchaklari: [x0, y0, x1, y1].
  points: number[];
  // Freehand chiziq nuqtalariga mos 0..1 stylus bosimi.
  pressures?: number[];
}

export type ClassroomUndoActionType =
  | 'stroke:add' | 'stroke:erase' | 'stroke:split' | 'stroke:transform' | 'stroke:style' | 'stroke:text'
  | 'stroke:reorder' | 'page:clear' | 'notebook:pageStyle'
  | 'page:remove' | 'page:insert';

// Har bir tugallangan (commit qilingan) harakat — bekor qilish/qaytarish
// uchun yetarli "before"/"after" ma'lumot bilan. mode har bir yozuvda
// alohida saqlanadi, chunki tarix ikkala board mode (pdf/notebook) uchun
// UMUMIY — undo joriy ko'rinayotgan moddan mustaqil ravishda eng oxirgi
// harakatni bekor qiladi, u qaysi mode'ga tegishli bo'lishidan qat'i nazar.
export interface ClassroomUndoEntry {
  type: ClassroomUndoActionType;
  mode: ClassroomBoardMode;
  page: number;
  pane: 'left' | 'right';
  // Faqat stroke-darajasidagi turlar (stroke:add/erase/transform/style/
  // text/reorder emas — reorder butun sahifa tartibiga tegishli, alohida
  // strokeId kerak emas) uchun to'ldiriladi. page:remove/page:insert
  // uchun undefined qoladi. Bu maydon dispatch vaqtida "qaysi chizmaga
  // tegish kerak" degan savolni before/after payload shaklidan mustaqil
  // ravishda javob beradi — har bir turning before/after shakli har xil
  // (ba'zilarida to'liq stroke, ba'zilarida faqat patch), shuning uchun
  // strokeId'ni alohida, barqaror joyda saqlash ancha soddaroq.
  strokeId?: string;
  groupId?: string;
  before: unknown;
  after: unknown;
}

// page:remove undo-yozuvi uchun — o'chirilgan sahifani TO'LIQ tiklash
// (undo bosilganda) uchun yetarli ma'lumot: uning barcha chizmalari va
// (agar PDF bo'lsa) URL'i yoki (agar daftar bo'lsa) naqshi.
export interface ClassroomPageSnapshot {
  url?: string; // faqat pdf uchun
  notebookStyle?: ClassroomNotebookStyle; // faqat notebook uchun
  notebookOrientation?: ClassroomNotebookOrientation; // faqat notebook uchun
  strokes: ClassroomStroke[];
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
  // /boards dagi persistent doska oddiy erkin jonli dars emas.
  isBoard?: boolean;
  title?: string | null;
  attachedBoardId?: string | null;
  hostUserId: string;
  hostSocketId: string | null;
  hostName: string;
  pdfName: string | null;
  pdfPages: string[];
  // Daftar (notebook) sahifalari soni — PDF'dan farqli, bular fayldan
  // kelmaydi (faqat bo'sh shablon), shuning uchun massiv emas, oddiy son.
  // Standart 4, sahifa o'chirilganda kamayadi (removePage orqali).
  notebookPageCount?: number;
  currentPage: number; // 1-indexed
  strokesByPage: Map<number, ClassroomStroke[]>;
  participants: Map<string, ClassroomParticipant>; // userId → participant
  startedAtMs: number;
  hostDisconnectTimer: NodeJS.Timeout | null;
  // Ustozning joriy zoom darajasi — o'quvchi sinxron rejimda bo'lsa shu
  // qiymatga moslashadi. Kech kirganlarga snapshot orqali yetkaziladi.
  zoom: number;
  rightZoom?: number;
  // Split panelning chap qismi umumiy kenglikka nisbatan ulushi (0.2-0.8
  // oralig'ida cheklangan). Kech kirgan o'quvchiga snapshot orqali,
  // hozir ulanganlarga broadcast orqali yetkaziladi — xuddi zoom kabi.
  splitRatio?: number;
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
  isBoardOpen?: boolean;
  classroomTheme?: ClassroomTheme;
  notebookStyle?: ClassroomNotebookStyle;
  // Har bir daftar sahifasining o'z naqshi — sahifa raqami -> naqsh.
  // Kalit yo'q sahifalar eski umumiy notebookStyle'ni meros qiladi
  // (page-add funksiyasidan oldin yaratilgan barcha sahifalar uchun).
  notebookPageStyles?: Record<number, ClassroomNotebookStyle>;
  notebookPageOrientations?: Record<number, ClassroomNotebookOrientation>;
  // Yagona, ikkala board mode (pdf/notebook) uchun UMUMIY, vaqt bo'yicha
  // tartiblangan undo/redo tarixi — har bir yozuv o'zining mode'ini olib
  // yuradi (ClassroomUndoEntry.mode), shuning uchun undo joriy
  // ko'rinayotgan mode'dan mustaqil ravishda har doim eng oxirgi
  // harakatni (u qaysi mode'ga tegishli bo'lishidan qat'i nazar) bekor
  // qiladi. In-memory only — snapshot/DB'ga hech qachon yozilmaydi.
  undoStack?: ClassroomUndoEntry[];
  redoStack?: ClassroomUndoEntry[];
  needsVersionCheckpointOnFirstMutation?: boolean;
  activeVersionId?: string | null;
  savedVersions?: any[];
  // Faqat isFree=false sessiyalarda to'ldiriladi — dars tugaganda
  // class_sessions.history_events'ga saqlanadi.
  historyEvents?: ClassroomHistoryEvent[];
  raisedHands?: ClassroomRaisedHand[];
  // Ustoz "Yozib olish" tugmasi orqali tanlagan rejim — null bo'lsa hech
  // narsa yozilmaydi (avval avtomatik boshlanardi, endi faqat shu tugma
  // orqali). 'full' — to'liq (ovoz + harakat tarixi, to'liq replay).
  // 'boardAudio'/'boardSilent' — faqat sessiya tugagandagi doskaning
  // yakuniy holati saqlanadi (JSON snapshot), ovoz bilan yoki ovozsiz.
  recordingMode?: ClassroomRecordingMode | null;
  recordingUrl?: string | null;
  recordingStatus?: 'none' | 'pending' | 'ready' | 'failed';
  recordingStartedAtMs?: number | null;
  egressId?: string | null;
  subtitles?: ClassroomSubtitleCue[];
}

export type ClassroomRecordingMode = 'full' | 'boardAudio' | 'boardSilent';

// Sessiya tugagan ondagi doskaning yakuniy holati — "faqat chizma"
// rejimlarida class_sessions.board_snapshot'ga saqlanadi. Vektor
// (stroke) darajasida saqlangani uchun istalgan zoom darajasida sifat
// yo'qolmasdan qayta chiziladi (rasm/PDF emas).
export interface ClassroomSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ClassroomBoardSnapshot {
  pdfName: string | null;
  pages: string[];
  strokesByPage: Record<number, ClassroomStroke[]>;
  rightStrokesByPage: Record<number, ClassroomStroke[]>;
  strokesByMode?: Record<ClassroomBoardMode, Record<number, ClassroomStroke[]>>;
  boardMode: ClassroomBoardMode;
  boardLayout: ClassroomBoardLayout;
  leftBoardMode: ClassroomBoardMode;
  rightBoardMode: ClassroomBoardMode;
  notebookStyle: ClassroomNotebookStyle;
  notebookPageCount: number;
  notebookPageStyles: Record<number, ClassroomNotebookStyle>;
  notebookPageOrientations: Record<number, ClassroomNotebookOrientation>;
  subtitles?: ClassroomSubtitleCue[];
  activeVersionId?: string | null;
  savedVersions?: any[];
}

export interface ClassroomRaisedHand {
  userId: string;
  userName: string;
  raisedAt: number;
}

export interface ClassroomSnapshot {
  sessionId: string;
  title: string | null;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, ClassroomStroke[]>;
  rightStrokesByPage: Record<number, ClassroomStroke[]>;
  strokesByMode: Record<ClassroomBoardMode, Record<number, ClassroomStroke[]>>;
  participants: Array<{ userId: string; name: string; online: boolean; status: AttendanceStatus }>;
  startedAt: number;
  hostOnline: boolean;
  hostUserId: string;
  hostName: string;
  zoom: number;
  rightZoom: number;
  splitRatio: number;
  notebookPageCount: number;
  scroll: ClassroomScrollPosition | null;
  rightScroll: ClassroomScrollPosition | null;
  isFree: boolean;
  boardMode: ClassroomBoardMode;
  boardLayout: ClassroomBoardLayout;
  leftBoardMode: ClassroomBoardMode;
  rightBoardMode: ClassroomBoardMode;
  isBoardOpen: boolean;
  classroomTheme: ClassroomTheme;
  notebookStyle: ClassroomNotebookStyle;
  notebookPageStyles: Record<number, ClassroomNotebookStyle>;
  notebookPageOrientations: Record<number, ClassroomNotebookOrientation>;
  raisedHands?: ClassroomRaisedHand[];
  subtitles?: ClassroomSubtitleCue[];
}

// Gateway service ga shu interfeys orqali ulanadi — testlarda fake beriladi.
// excludeSender=true FAQAT amal frontend'da optimistic-update qilingan
// joylarda (masalan moveStroke/updateShapeStroke — frontend socket
// yuborishdan oldin local state'ni allaqachon o'zgartirgan) ishlatiladi —
// bu holda serverdan qaytgan aks-sado hostga keraksiz, hatto zararli (eski
// qiymat bilan yangi o'zgarishni bosib yuborishi mumkin). Optimistic
// update qilinmagan amallarda (page insert/remove/style va h.k. — frontend
// faqat socket eventini yuborib, natijani SERVERDAN qaytgan shu eventdan
// kutadi) excludeSender HECH QACHON true bo'lmasligi kerak — aks holda
// hostning o'zida hech narsa yangilanmay qoladi (faqat refresh'da sync
// bo'ladi, "real-time ishlamayapti" degan simptom shu).
export interface ClassroomBroadcaster {
  toRoom(sessionId: string, event: string, payload: unknown, excludeSender?: boolean): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}
