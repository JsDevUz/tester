import { io, Socket } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export interface PracticeMessengerSocketPayload {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
}

export function connectPracticeMessengerSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(`${BACKEND}/practice-messenger`, {
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  return socket;
}

export function closePracticeMessengerSocket() {
  socket?.close();
  socket = null;
}
