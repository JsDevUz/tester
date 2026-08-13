import {io, Socket} from 'socket.io-client';
import {API_URL} from '../config/env';

const BACKEND = API_URL.replace('/api/v1', '');

let socket: Socket | null = null;

// PracticeMessengerGateway'ning umumiy user:<userId> xona-infratuzilmasidan
// foydalanadi (backend: apps/backend/src/practice-messenger/practice-messenger.gateway.ts) —
// handleConnection'da token orqali avtomatik shaxsiy xonaga qo'shiladi,
// hech qanday aniq "join" xabari kerak emas.
export function connectLiveNotificationsSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(`${BACKEND}/practice-messenger`, {
    transports: ['websocket', 'polling'],
    auth: {token},
  });
  return socket;
}

export function closeLiveNotificationsSocket(): void {
  socket?.close();
  socket = null;
}
