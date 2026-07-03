import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { LiveService } from './live.service';

interface JwtUser { sub: string; name: string; role: string }

@WebSocketGateway({ namespace: '/live', cors: { origin: process.env.FRONTEND_URL } })
export class LiveGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly liveService: LiveService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    this.liveService.setBroadcaster({
      toRoom: (pin, event, payload) => this.server.to(`pin:${pin}`).emit(event, payload),
      toSocket: (socketId, event, payload) => this.server.to(socketId).emit(event, payload),
    });
  }

  handleDisconnect(client: Socket) {
    this.liveService.handleDisconnect(client.id);
  }

  private verify(token: string): JwtUser {
    try {
      return this.jwtService.verify<JwtUser>(token);
    } catch {
      throw new Error('UNAUTHORIZED');
    }
  }

  private run(fn: () => unknown) {
    try {
      const result = fn();
      return { ok: true, ...(result && typeof result === 'object' ? result : {}) };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }

  @SubscribeMessage('host:join')
  hostJoin(@MessageBody() body: { pin: string; token: string }, @ConnectedSocket() client: Socket) {
    return this.run(() => {
      const user = this.verify(body.token);
      if (user.role !== 'teacher' && user.role !== 'super') throw new Error('UNAUTHORIZED');
      const res = this.liveService.hostJoin(body.pin, user.sub, client.id);
      void client.join(`pin:${body.pin}`);
      return res;
    });
  }

  @SubscribeMessage('player:join')
  playerJoin(@MessageBody() body: { pin: string; token: string }, @ConnectedSocket() client: Socket) {
    return this.run(() => {
      const user = this.verify(body.token);
      const res = this.liveService.playerJoin(body.pin, { id: user.sub, name: user.name }, client.id);
      void client.join(`pin:${body.pin}`);
      return res;
    });
  }

  @SubscribeMessage('host:start')
  hostStart(@MessageBody() body: { pin: string; token: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.liveService.start(body.pin, user.sub);
    });
  }

  @SubscribeMessage('player:answer')
  playerAnswer(@MessageBody() body: { pin: string; token: string; questionId: string; selectedOptionIds: string[] }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.liveService.answer(body.pin, user.sub, body.questionId, body.selectedOptionIds ?? []);
    });
  }

  @SubscribeMessage('host:end')
  async hostEnd(@MessageBody() body: { pin: string; token: string }) {
    try {
      const user = this.verify(body.token);
      await this.liveService.end(body.pin, user.sub);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }
}
