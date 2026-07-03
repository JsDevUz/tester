export interface LiveOption {
  id: string;
  text: string;
}

export interface LiveQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  type: 'single' | 'multi' | 'truefalse';
  options: LiveOption[];
  correctOptionIds: string[];
}

export interface PlayerAnswer {
  selectedOptionIds: string[];
  isCorrect: boolean;
  points: number;
  timeMs: number;
}

export interface LivePlayer {
  userId: string;
  name: string;
  socketId: string | null;
  score: number;
  answers: Map<string, PlayerAnswer>; // questionId → javob
}

export type LiveStatus = 'lobby' | 'question' | 'reveal' | 'finished';

export interface LiveSession {
  pin: string;
  testId: string;
  testName: string;
  hostAdminId: string;
  hostSocketId: string | null;
  questionTimeSec: number;
  status: LiveStatus;
  questions: LiveQuestion[];
  currentIdx: number;
  questionStartedAt: number;
  questionTimer: NodeJS.Timeout | null;
  revealTimer: NodeJS.Timeout | null;
  hostDisconnectTimer: NodeJS.Timeout | null;
  players: Map<string, LivePlayer>; // userId → player
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  score: number;
  rank: number;
}

// Gateway service ga shu interfeys orqali ulanadi — testlarda fake beriladi
export interface LiveBroadcaster {
  toRoom(pin: string, event: string, payload: unknown): void;
  toSocket(socketId: string, event: string, payload: unknown): void;
}
