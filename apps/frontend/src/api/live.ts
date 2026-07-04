import { io, Socket } from 'socket.io-client';
import client from './client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getLiveSocket(): Socket {
  if (!socket) {
    socket = io(`${BACKEND}/live`, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeLiveSocket() {
  socket?.close();
  socket = null;
}

export interface LiveTestItem {
  id: string;
  name: string;
  liveQuestionCount: number;
}

export async function apiLiveTests(): Promise<LiveTestItem[]> {
  const res = await client.get('/live/tests');
  return res.data;
}

export async function apiCreateLiveSession(
  testId: string,
  questionTimeSec: number,
  mode: 'individual' | 'team' = 'individual',
): Promise<{ pin: string }> {
  const res = await client.post('/live/sessions', { testId, questionTimeSec, mode });
  return res.data;
}

export interface LiveSessionHistoryItem {
  id: string;
  pin: string;
  testId: string;
  testName: string;
  mode: 'individual' | 'team';
  status: 'active' | 'finished';
  createdAt: string;
  finishedAt: string | null;
}

export async function apiListLiveSessions(limit: number, offset: number): Promise<LiveSessionHistoryItem[]> {
  const res = await client.get('/live/sessions', { params: { limit, offset } });
  return res.data;
}

// WS payload tiplari
export type LiveQuestionType =
  | 'single' | 'multi' | 'truefalse'
  | 'slider' | 'droppin' | 'matching' | 'fillblank' | 'open' | 'arrange' | 'reorder';

export interface WsQuestion {
  id: string;
  idx: number; total: number; text: string; imageUrl: string | null;
  type: LiveQuestionType;
  options: Array<{ id: string; text: string }>;
  timeSec: number; endsAt: number;
}

export interface WsReveal {
  correctOptionIds: string[];
  correctAnswer: string | null;
  distribution: Record<string, number>;
  leaderboard: Array<{ userId: string; name: string; score: number; rank: number }>;
  isCorrect?: boolean;
  points?: number;
  score?: number;
  rank?: number;
}

export interface WsState {
  pin: string; testName: string; status: string;
  playerCount: number; players: Array<{ name: string }>;
  questionTimeSec: number; totalQuestions: number;
  currentQuestion: WsQuestion | null;
  me: { score: number; answeredCurrent: boolean } | null;
  leaderboard?: Array<{ userId: string; name: string; score: number; rank: number }>;
  teams?: WsTeam[];
  unassigned?: WsTeamMember[];
}

export interface WsTeamMember {
  userId: string;
  name: string;
}

export interface WsTeam {
  id: string;
  name: string;
  captainUserId: string | null;
  members: WsTeamMember[];
}

export interface WsTeamUpdate {
  teams: WsTeam[];
  unassigned: WsTeamMember[];
}

export interface WsSuggestionUpdate {
  questionId: string;
  counts: Record<string, number>;
}
