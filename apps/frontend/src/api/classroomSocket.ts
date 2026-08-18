import { io, Socket } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    // Polling bilan ishonchli ulanib, darhol WebSocket'ga upgrade qilamiz.
    // Bu Caddy/Nginx va turli tarmoqlarda handshake uzilishining oldini oladi.
    socket = io(`${BACKEND}/classroom`, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20_000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function closeClassroomSocket() {
  socket?.close();
  socket = null;
}
