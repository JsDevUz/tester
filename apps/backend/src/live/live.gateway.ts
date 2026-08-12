import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { LiveService } from './live.service';
import { getAllowedOrigins } from '../cors';

interface JwtUser { sub: string; name: string; role: string }

@WebSocketGateway({ namespace: '/live', cors: { origin: getAllowedOrigins() } })
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
    void this.liveService.handleDisconnect(client.id);
  }

  private verify(token: string): JwtUser {
    try {
      return this.jwtService.verify<JwtUser>(token);
    } catch {
      throw new Error('UNAUTHORIZED');
    }
  }

  private async run(pin: string, fn: () => unknown | Promise<unknown>) {
    try {
      const result = await this.liveService.withSession(pin, fn);
      return { ok: true, ...(result && typeof result === 'object' ? result : {}) };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }

  @SubscribeMessage('host:join')
  async hostJoin(@MessageBody() body: { pin: string; token: string }, @ConnectedSocket() client: Socket) {
    try {
      const user = this.verify(body.token);
      if (user.role !== 'teacher' && user.role !== 'super') throw new Error('UNAUTHORIZED');
      const res = await this.liveService.withSession(body.pin, () => this.liveService.hostJoin(body.pin, user.sub, client.id));
      void client.join(`pin:${body.pin}`);
      return { ok: true, ...res };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }

  @SubscribeMessage('player:join')
  playerJoin(@MessageBody() body: { pin: string; token: string }, @ConnectedSocket() client: Socket) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      const res = this.liveService.playerJoin(body.pin, { id: user.sub, name: user.name }, client.id);
      void client.join(`pin:${body.pin}`);
      return res;
    });
  }

  @SubscribeMessage('host:start')
  hostStart(@MessageBody() body: { pin: string; token: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.start(body.pin, user.sub);
    });
  }

  @SubscribeMessage('host:createTeam')
  hostCreateTeam(@MessageBody() body: { pin: string; token: string; name: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      return this.liveService.createTeam(body.pin, user.sub, body.name);
    });
  }

  @SubscribeMessage('host:assignPlayer')
  hostAssignPlayer(@MessageBody() body: { pin: string; token: string; userId: string; teamId: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.assignPlayer(body.pin, user.sub, body.userId, body.teamId);
    });
  }

  @SubscribeMessage('host:setCaptain')
  hostSetCaptain(@MessageBody() body: { pin: string; token: string; teamId: string; userId: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.setCaptain(body.pin, user.sub, body.teamId, body.userId);
    });
  }

  @SubscribeMessage('host:removeTeam')
  hostRemoveTeam(@MessageBody() body: { pin: string; token: string; teamId: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.removeTeam(body.pin, user.sub, body.teamId);
    });
  }

  @SubscribeMessage('host:startTeam')
  hostStartTeam(@MessageBody() body: { pin: string; token: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.startTeamGame(body.pin, user.sub);
    });
  }

  @SubscribeMessage('member:suggest')
  memberSuggest(@MessageBody() body: { pin: string; token: string; teamId: string; optionId: string }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.suggest(body.pin, body.teamId, user.sub, body.optionId);
    });
  }

  @SubscribeMessage('captain:answer')
  captainAnswer(@MessageBody() body: { pin: string; token: string; questionId: string; selectedOptionIds: string[]; textAnswer: string | null }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.captainAnswer(body.pin, user.sub, body.questionId, body.selectedOptionIds ?? [], body.textAnswer ?? null);
    });
  }

  @SubscribeMessage('player:answer')
  playerAnswer(@MessageBody() body: { pin: string; token: string; questionId: string; selectedOptionIds: string[]; textAnswer?: string | null }) {
    return this.run(body.pin, () => {
      const user = this.verify(body.token);
      this.liveService.answer(body.pin, user.sub, body.questionId, body.selectedOptionIds ?? [], body.textAnswer ?? null);
    });
  }

  @SubscribeMessage('host:end')
  async hostEnd(@MessageBody() body: { pin: string; token: string }) {
    try {
      const user = this.verify(body.token);
      await this.liveService.withSession(body.pin, () => this.liveService.end(body.pin, user.sub));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }
}
