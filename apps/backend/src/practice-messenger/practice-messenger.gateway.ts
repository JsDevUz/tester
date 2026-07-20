import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { getAllowedOrigins } from '../cors';

interface JwtUser {
  sub: string;
  name: string;
  role: string;
}

function userRoom(userId: string) {
  return `user:${userId}`;
}

@WebSocketGateway({ namespace: '/practice-messenger', cors: { origin: getAllowedOrigins() } })
export class PracticeMessengerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;

  private readonly logger = new Logger(PracticeMessengerGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const user = this.jwtService.verify<JwtUser>(token);
      void client.join(userRoom(user.sub));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // socket.io removes the client from all rooms automatically on disconnect
  }

  notifyNewMessage(recipientUserIds: string[], payload: unknown) {
    for (const userId of new Set(recipientUserIds)) {
      this.server.to(userRoom(userId)).emit('new_message', payload);
    }
  }

  notifyMessageEvent(event: 'message_updated' | 'message_deleted', recipientUserIds: string[], payload: unknown) {
    for (const userId of recipientUserIds) this.server.to(userRoom(userId)).emit(event, payload);
  }
}
