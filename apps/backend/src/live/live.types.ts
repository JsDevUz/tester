export interface LiveOption {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

export type LiveQuestionType =
  | 'single' | 'multi' | 'truefalse'
  | 'slider' | 'droppin' | 'matching' | 'fillblank' | 'open' | 'arrange' | 'reorder';

export interface LiveQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  type: LiveQuestionType;
  options: LiveOption[];
  correctOptionIds: string[];
  correctAnswer: string | null;
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

export type LiveGameMode = 'individual' | 'team';

export interface LiveTeam {
  id: string;
  name: string;
  captainUserId: string | null;
  memberUserIds: Set<string>;
  score: number;
  answers: Map<string, PlayerAnswer>;
  suggestions: Map<string, Map<string, string>>; // questionId -> userId -> optionId
}

export type LiveStatus = 'lobby' | 'team_assign' | 'question' | 'reveal' | 'finished';

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
  mode: LiveGameMode;
  teams: Map<string, LiveTeam> | null;
  unassignedUserIds: Set<string> | null;
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
