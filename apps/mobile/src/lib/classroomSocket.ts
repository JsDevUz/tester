import {io, Socket} from 'socket.io-client';
import {API_URL} from '../config/env';

const BACKEND = API_URL.replace('/api/v1', '');

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    socket = io(`${BACKEND}/classroom`, {
      transports: ['websocket', 'polling'],
      // socket.io v4 only attempts the FIRST transport on the initial connection; listing
      // polling as a fallback does nothing without this. On networks that block the WebSocket
      // handshake -- some corporate proxies and carrier APNs -- the app simply never connected
      // and sat on a loading screen.
      tryAllTransports: true,
    });
  }
  return socket;
}

export function closeClassroomSocket(): void {
  socket?.close();
  socket = null;
}
