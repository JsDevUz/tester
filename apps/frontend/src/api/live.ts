import { io, Socket } from 'socket.io-client';
import client from './client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getLiveSocket(): Socket {
  if (!socket || socket.disconnected) {
    socket?.close();
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

export async function apiCreateLiveSession(testId: string, questionTimeSec: number): Promise<{ pin: string }> {
  const res = await client.post('/live/sessions', { testId, questionTimeSec });
  return res.data;
}

// WS payload tiplari
export interface WsQuestion {
  id: string;
  idx: number; total: number; text: string; imageUrl: string | null;
  type: 'single' | 'multi' | 'truefalse';
  options: Array<{ id: string; text: string }>;
  timeSec: number; endsAt: number;
}

export interface WsReveal {
  correctOptionIds: string[];
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
}
