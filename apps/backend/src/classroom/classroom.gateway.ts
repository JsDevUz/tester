import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { ClassroomService } from './classroom.service';
import { ClassroomStroke } from './classroom.types';

interface JwtUser { sub: string; name: string; role: string }

interface BaseBody { sessionId: string; token: string }

@WebSocketGateway({ namespace: '/classroom', cors: { origin: process.env.FRONTEND_URL } })
export class ClassroomGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly classroomService: ClassroomService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    this.classroomService.setBroadcaster({
      toRoom: (sessionId, event, payload) => this.server.to(`cs:${sessionId}`).emit(event, payload),
      toSocket: (socketId, event, payload) => this.server.to(socketId).emit(event, payload),
    });
  }

  handleDisconnect(client: Socket) {
    void this.classroomService.handleDisconnect(client.id);
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
  hostJoin(@MessageBody() body: BaseBody, @ConnectedSocket() client: Socket) {
    return this.run(() => {
      const user = this.verify(body.token);
      if (user.role !== 'teacher' && user.role !== 'super') throw new Error('UNAUTHORIZED');
      const state = this.classroomService.hostJoin(body.sessionId, user.sub, client.id);
      void client.join(`cs:${body.sessionId}`);
      return { state };
    });
  }

  @SubscribeMessage('student:join')
  async studentJoin(@MessageBody() body: BaseBody, @ConnectedSocket() client: Socket) {
    try {
      const user = this.verify(body.token);
      const state = await this.classroomService.studentJoin(body.sessionId, user.sub, client.id);
      void client.join(`cs:${body.sessionId}`);
      return { ok: true, state };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }

  @SubscribeMessage('host:setPage')
  setPage(@MessageBody() body: BaseBody & { page: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setPage(body.sessionId, user.sub, body.page);
    });
  }

  @SubscribeMessage('host:stroke')
  stroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.stroke(body.sessionId, user.sub, body.page, body.stroke);
    });
  }

  @SubscribeMessage('host:undo')
  undo(@MessageBody() body: BaseBody & { page: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.undo(body.sessionId, user.sub, body.page);
    });
  }

  @SubscribeMessage('host:eraseStroke')
  eraseStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.eraseStroke(body.sessionId, user.sub, body.page, body.strokeId);
    });
  }

  @SubscribeMessage('host:splitStroke')
  splitStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; replacements: ClassroomStroke[] }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.splitStroke(body.sessionId, user.sub, body.page, body.strokeId, body.replacements);
    });
  }

  @SubscribeMessage('host:clearPage')
  clearPage(@MessageBody() body: BaseBody & { page: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.clearPage(body.sessionId, user.sub, body.page);
    });
  }

  @SubscribeMessage('host:pointer')
  pointer(@MessageBody() body: BaseBody & { page: number; x: number; y: number; active: boolean }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.pointer(body.sessionId, user.sub, body.page, body.x, body.y, body.active);
    });
  }

  @SubscribeMessage('host:setZoom')
  setZoom(@MessageBody() body: BaseBody & { zoom: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setZoom(body.sessionId, user.sub, body.zoom);
    });
  }

  @SubscribeMessage('host:scroll')
  scroll(@MessageBody() body: BaseBody & { page: number; yRatio: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.scroll(body.sessionId, user.sub, body.page, body.yRatio);
    });
  }

  @SubscribeMessage('host:end')
  async hostEnd(@MessageBody() body: BaseBody) {
    try {
      const user = this.verify(body.token);
      await this.classroomService.endSession(body.sessionId, user.sub);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, code: e?.message ?? 'ERROR' };
    }
  }
}
