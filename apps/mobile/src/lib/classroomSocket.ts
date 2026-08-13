import {io, Socket} from 'socket.io-client';
import {API_URL} from '../config/env';

const BACKEND = API_URL.replace('/api/v1', '');

let socket: Socket | null = null;

export function getClassroomSocket(): Socket {
  if (!socket) {
    socket = io(`${BACKEND}/classroom`, {transports: ['websocket', 'polling']});
  }
  return socket;
}

export function closeClassroomSocket(): void {
  socket?.close();
  socket = null;
}
