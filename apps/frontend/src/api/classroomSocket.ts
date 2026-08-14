import { io, Socket } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    // Cloudflare/Nginx ayrim ulanishlarda WebSocket handshake'ni reset qilishi
    // mumkin. Polling bilan ishonchli ulanib, keyin WebSocket'ga upgrade qilamiz.
    socket = io(`${BACKEND}/classroom`, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 15_000,
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
