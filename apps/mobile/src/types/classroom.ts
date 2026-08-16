export type CsTool =
  | 'pen'
  | 'highlighter'
  | 'laser'
  | 'arrow'
  | 'line'
  | 'text'
  | 'rectangle'
  | 'ellipse'
  | 'select'
  | 'eraser-pixel'
  | 'eraser-stroke'
  | 'lasso';

export interface RaisedHandItem {
  userId: string;
  userName: string;
  raisedAt: number;
}

export interface StickerReactionItem {
  id: string;
  userId: string;
  emoji: string;
  userName: string;
  isSelf: boolean;
}
export type CsBoardMode = 'pdf' | 'notebook';
export type CsBoardLayout = 'single' | 'split';
export type CsNotebookStyle = 'grid' | 'lined' | 'dot' | 'plain';
export type CsNotebookOrientation = 'portrait' | 'landscape';

export type CsFontFamily = 'Inter' | 'Arial' | 'Georgia' | 'Comic Sans MS' | 'Nunito' | string;
export type CsFillStyle = 'hachure' | 'cross-hatch' | 'solid';
export type CsStrokeStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type CsSloppiness = 0 | 1 | 2;
export type CsEdges = 'sharp' | 'round';
export type CsArrowHead = 'none' | 'arrow' | 'arrow-filled' | 'circle' | 'dot' | 'diamond' | 'bar' | 'filled' | 'open';
export type CsLineShape = 'straight' | 'curved' | 'elbow';
export type CsBindingSide = 'top' | 'right' | 'bottom' | 'left';
export interface CsShapeBinding {
  strokeId: string;
  side: CsBindingSide;
  position?: number;
}

export interface CsStroke {
  id: string;
  tool: CsTool;
  color: string;
  width: number;
  createdAt?: number;
  text?: string;
  fontFamily?: CsFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textBoxWidth?: number;
  textBoxHeight?: number;
  textColor?: string;
  rotation?: number;
  backgroundColor?: string;
  fillStyle?: CsFillStyle;
  strokeStyle?: CsStrokeStyle;
  sloppiness?: CsSloppiness;
  edges?: CsEdges;
  opacity?: number;
  startArrowHead?: CsArrowHead;
  endArrowHead?: CsArrowHead;
  lineShape?: CsLineShape;
  controlX?: number;
  controlY?: number;
  startBinding?: CsShapeBinding;
  endBinding?: CsShapeBinding;
  // pen tool: har nuqtaga mos bosim qiymati (0-1) — perfect-freehand'ga
  // real qalam bosimi bilan chizish uchun beriladi (backend/web bilan bir xil).
  pressures?: number[];
  // Normalized [0,1], flat: [x0, y0, x1, y1, ...]. Shape tools use bbox corners [x0,y0,x1,y1].
  points: number[];
}


export interface CsParticipant {
  userId: string;
  name: string;
  online: boolean;
  status: 'absent' | 'present' | 'late';
}

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
  strokesByMode?: Record<string, Record<number, CsStroke[]>>;
  participants: CsParticipant[];
  startedAt: number;
  hostOnline: boolean;
  hostUserId: string;
  hostName?: string | null;
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
  isBoardOpen?: boolean;
  classroomTheme: 'light' | 'dark';
  notebookStyle: CsNotebookStyle;
  notebookPageStyles: Record<number, CsNotebookStyle>;
  notebookPageOrientations: Record<number, CsNotebookOrientation>;
  raisedHands?: RaisedHandItem[];
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
  pane?: 'left' | 'right';
}

export interface ClassroomState {
  joined: boolean;
  error: string | null;
  ended: boolean;
  pdfName: string | null;
  pages: string[];
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage: Record<number, CsStroke[]>;
  strokesByMode?: Record<string, Record<number, CsStroke[]>>;
  participants: CsParticipant[];
  hostOnline: boolean;
  hostUserId: string | null;
  hostName: string | null;
  pointer: CsPointer | null;
  zoom: number;
  rightZoom: number;
  splitRatio: number;
  notebookPageCount: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  isFree: boolean;
  boardMode: CsBoardMode;
  boardLayout: CsBoardLayout;
  leftBoardMode: CsBoardMode;
  rightBoardMode: CsBoardMode;
  isBoardOpen: boolean;
  classroomTheme: 'light' | 'dark';
  notebookStyle?: CsNotebookStyle;
  notebookPageStyles: Record<number, CsNotebookStyle>;
  notebookPageOrientations: Record<number, CsNotebookOrientation>;
  attachedBoardId?: string;
  isReplay?: boolean;
  reactions: StickerReactionItem[];
  userReactions: Record<string, string>;
  raisedHands: RaisedHandItem[];
}

export const CLASSROOM_INITIAL_STATE: ClassroomState = {
  joined: false, error: null, ended: false,
  pdfName: null, pages: [], currentPage: 1,
  strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, hostUserId: null, hostName: null, pointer: null,
  zoom: 1, rightZoom: 1, splitRatio: 0.5, notebookPageCount: 1, scroll: null, rightScroll: null,
  isFree: false, boardMode: 'pdf', boardLayout: 'single', leftBoardMode: 'pdf', rightBoardMode: 'pdf',
  isBoardOpen: false,
  classroomTheme: 'light',
  notebookPageStyles: {}, notebookPageOrientations: {},
  reactions: [], userReactions: {}, raisedHands: [],
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.25;

export interface ClassReplayEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

export type CsRecordingMode = 'full' | 'boardAudio' | 'boardSilent';

export interface ClassSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

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
  notebookPageStyles?: Record<number, CsNotebookStyle>;
  notebookPageOrientations?: Record<number, CsNotebookOrientation>;
  notebookPageCount?: number;
  subtitles?: ClassSubtitleCue[];
}

export interface ClassReplayData {
  isTeacher: boolean;
  pdfName: string | null;
  pdfPages: string[];
  historyEvents: ClassReplayEvent[];
  recordingUrl: string | null;
  recordingStatus: 'none' | 'pending' | 'ready' | 'failed';
  recordingStartedAtMs: number | null;
  attendance: Array<{userId: string; name: string; status: 'absent' | 'present' | 'late'}>;
  recordingMode: CsRecordingMode | null;
  boardSnapshot: ClassBoardSnapshotData | null;
  subtitles?: ClassSubtitleCue[];
}

export interface ActiveClassSession {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
}
