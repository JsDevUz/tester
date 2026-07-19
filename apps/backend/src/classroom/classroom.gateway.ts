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

  // Erkin (guruhsiz) darsga login qilmagan mehmon ham kirishi mumkin —
  // shu holatda token bo'sh keladi, o'rniga client tomonidan generatsiya
  // qilingan guestId + foydalanuvchi kiritgan guestName ishlatiladi.
  // Login qilgan foydalanuvchi (guruhdan qat'iy nazar) token bilan kiradi —
  // haqiqiy ismi ishlatiladi, guestName e'tiborsiz qoldiriladi.
  @SubscribeMessage('student:join')
  async studentJoin(
    @MessageBody() body: BaseBody & { guestId?: string; guestName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      let userId: string;
      let displayName: string | undefined;
      if (body.token) {
        const user = this.verify(body.token);
        userId = user.sub;
        displayName = user.name;
      } else {
        if (!body.guestId || !body.guestName?.trim()) throw new Error('GUEST_NAME_REQUIRED');
        userId = `guest:${body.guestId}`;
      }
      const state = await this.classroomService.studentJoin(body.sessionId, userId, client.id, body.guestName, displayName);
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

  @SubscribeMessage('host:setTheme')
  setTheme(@MessageBody() body: BaseBody & { theme: 'light' | 'dark' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setTheme(body.sessionId, user.sub, body.theme);
    });
  }

  @SubscribeMessage('host:setNotebookStyle')
  setNotebookStyle(@MessageBody() body: BaseBody & { style: 'grid' | 'lined' | 'plain' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setNotebookStyle(body.sessionId, user.sub, body.style);
    });
  }

  @SubscribeMessage('host:stroke')
  stroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.stroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:moveStroke')
  moveStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; x: number; y: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.moveStroke(body.sessionId, user.sub, body.page, body.strokeId, body.x, body.y, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:updateTextStroke')
  updateTextStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.updateTextStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:updateShapeStroke')
  updateShapeStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.updateShapeStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:undo')
  undo(@MessageBody() body: BaseBody & { page: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.undo(body.sessionId, user.sub, body.page, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:eraseStroke')
  eraseStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.eraseStroke(body.sessionId, user.sub, body.page, body.strokeId, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:reorderStroke')
  reorderStroke(@MessageBody() body: BaseBody & { page: number; strokeIds: string[]; op: 'front' | 'back' | 'forward' | 'backward'; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.reorderStroke(body.sessionId, user.sub, body.page, body.strokeIds, body.op, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:splitStroke')
  splitStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; replacements: ClassroomStroke[]; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.splitStroke(body.sessionId, user.sub, body.page, body.strokeId, body.replacements, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:clearPage')
  clearPage(@MessageBody() body: BaseBody & { page: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.clearPage(body.sessionId, user.sub, body.page, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:pointer')
  pointer(@MessageBody() body: BaseBody & { page: number; x: number; y: number; active: boolean; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.pointer(body.sessionId, user.sub, body.page, body.x, body.y, body.active, body.pane);
    });
  }

  @SubscribeMessage('host:setZoom')
  setZoom(@MessageBody() body: BaseBody & { zoom: number; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setZoom(body.sessionId, user.sub, body.zoom, body.pane);
    });
  }

  @SubscribeMessage('host:setBoardMode')
  setBoardMode(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setBoardMode(body.sessionId, user.sub, body.mode);
    });
  }

  @SubscribeMessage('host:setBoardView')
  setBoardView(@MessageBody() body: BaseBody & { layout: 'single' | 'split'; leftMode: 'pdf' | 'notebook'; rightMode: 'pdf' | 'notebook' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setBoardView(body.sessionId, user.sub, body.layout, body.leftMode, body.rightMode);
    });
  }

  @SubscribeMessage('host:scroll')
  scroll(@MessageBody() body: BaseBody & { page: number; yRatio: number; xRatio?: number; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.scroll(body.sessionId, user.sub, body.page, body.yRatio, body.pane, body.xRatio);
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
