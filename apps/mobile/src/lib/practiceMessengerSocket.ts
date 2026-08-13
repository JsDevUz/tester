import {io, Socket} from 'socket.io-client';
import {API_URL} from '../config/env';

const BACKEND = API_URL.replace('/api/v1', '');

let socket: Socket | null = null;

export function connectPracticeMessengerSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(`${BACKEND}/practice-messenger`, {
    transports: ['websocket', 'polling'],
    auth: {token},
  });
  return socket;
}

export function closePracticeMessengerSocket(): void {
  socket?.close();
  socket = null;
}
