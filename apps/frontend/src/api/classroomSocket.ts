import { io, Socket } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    // Cloudflare/Nginx ayrim ulanishlarda WebSocket handshake'ni reset qilishi
    // mumkin. Polling bilan ishonchli ulanib, keyin WebSocket'ga upgrade qilamiz.
    socket = io(`${BACKEND}/classroom`, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      timeout: 10_000,
      reconnection: true,
    });
  }
  return socket;
}

export function closeClassroomSocket() {
  socket?.close();
  socket = null;
}
