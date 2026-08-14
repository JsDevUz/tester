import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayInit, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { ClassroomService } from './classroom.service';
import { ClassroomStroke } from './classroom.types';
import { getAllowedOrigins } from '../cors';

interface JwtUser { sub: string; name: string; role: string }

interface BaseBody { sessionId: string; token: string }

@WebSocketGateway({ namespace: '/classroom', cors: { origin: getAllowedOrigins() } })
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

  private async run(sessionId: string, fn: () => unknown | Promise<unknown>) {
    try {
      const result = await this.classroomService.withSession(sessionId, fn);
      return { ok: true, ...(result && typeof result === 'object' ? result : {}) };
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      return { ok: false, code };
    }
  }

  @SubscribeMessage('host:join')
  async hostJoin(@MessageBody() body: BaseBody, @ConnectedSocket() client: Socket) {
    try {
      const user = this.verify(body.token);
      if (user.role !== 'teacher' && user.role !== 'super') throw new Error('UNAUTHORIZED');
      const state = await this.classroomService.withSession(
        body.sessionId,
        () => this.classroomService.hostJoinRestored(body.sessionId, user.sub, client.id, user.role),
      );
      void client.join(`cs:${body.sessionId}`);
      return { ok: true, state };
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      return { ok: false, code };
    }
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
      const state = await this.classroomService.withSession(
        body.sessionId,
        () => this.classroomService.studentJoin(body.sessionId, userId, client.id, body.guestName, displayName),
      );
      void client.join(`cs:${body.sessionId}`);
      return { ok: true, state };
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      return { ok: false, code };
    }
  }

  @SubscribeMessage('host:setPage')
  setPage(@MessageBody() body: BaseBody & { page: number }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setPage(body.sessionId, user.sub, body.page);
    });
  }

  @SubscribeMessage('host:setTheme')
  setTheme(@MessageBody() body: BaseBody & { theme: 'light' | 'dark' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setTheme(body.sessionId, user.sub, body.theme);
    });
  }

  @SubscribeMessage('host:stroke')
  stroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.stroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:moveStroke')
  moveStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; x: number; y: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.moveStroke(body.sessionId, user.sub, body.page, body.strokeId, body.x, body.y, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:updateTextStroke')
  updateTextStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.updateTextStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:updateShapeStroke')
  updateShapeStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.updateShapeStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:undo')
  undo(@MessageBody() body: BaseBody) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.undo(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:redo')
  redo(@MessageBody() body: BaseBody) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.redo(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:eraseStroke')
  eraseStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.eraseStroke(body.sessionId, user.sub, body.page, body.strokeId, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:reorderStroke')
  reorderStroke(@MessageBody() body: BaseBody & { page: number; strokeIds: string[]; op: 'front' | 'back' | 'forward' | 'backward'; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.reorderStroke(body.sessionId, user.sub, body.page, body.strokeIds, body.op, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:splitStroke')
  splitStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; replacements: ClassroomStroke[]; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.splitStroke(body.sessionId, user.sub, body.page, body.strokeId, body.replacements, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:clearPage')
  clearPage(@MessageBody() body: BaseBody & { page: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.clearPage(body.sessionId, user.sub, body.page, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:clearBoard')
  clearBoard(@MessageBody() body: BaseBody) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.clearBoard(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:pointer')
  pointer(@MessageBody() body: BaseBody & { page: number; x: number; y: number; active: boolean; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.pointer(body.sessionId, user.sub, body.page, body.x, body.y, body.active, body.pane);
    });
  }

  @SubscribeMessage('host:setZoom')
  setZoom(@MessageBody() body: BaseBody & { zoom: number; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setZoom(body.sessionId, user.sub, body.zoom, body.pane);
    });
  }

  @SubscribeMessage('host:setSplitRatio')
  setSplitRatio(@MessageBody() body: BaseBody & { ratio: number }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setSplitRatio(body.sessionId, user.sub, body.ratio);
    });
  }

  @SubscribeMessage('host:removePage')
  removePage(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook'; pageIndex: number; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.removePage(body.sessionId, user.sub, body.mode, body.pageIndex, body.pane ?? 'left');
    });
  }

  @SubscribeMessage('host:insertNotebookPage')
  insertNotebookPage(@MessageBody() body: BaseBody & { afterPageIndex: number; style: 'grid' | 'lined' | 'plain'; orientation?: 'portrait' | 'landscape'; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.insertNotebookPage(body.sessionId, user.sub, body.afterPageIndex, body.style, body.orientation ?? 'portrait', body.pane ?? 'left');
    });
  }

  @SubscribeMessage('host:pastePage')
  pastePage(@MessageBody() body: BaseBody & {
    mode: 'pdf' | 'notebook';
    afterPageIndex: number;
    pageUrl?: string;
    style: 'grid' | 'lined' | 'plain';
    orientation?: 'portrait' | 'landscape';
    strokes: ClassroomStroke[];
    pane?: 'left' | 'right';
  }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.pastePage(
        body.sessionId,
        user.sub,
        body.mode,
        body.afterPageIndex,
        body.pageUrl,
        body.style,
        body.orientation ?? 'portrait',
        body.strokes,
        body.pane ?? 'left',
      );
    });
  }

  @SubscribeMessage('host:setNotebookPageStyle')
  setNotebookPageStyle(@MessageBody() body: BaseBody & { page: number; style: 'grid' | 'lined' | 'plain'; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setNotebookPageStyle(body.sessionId, user.sub, body.page, body.style);
    });
  }

  @SubscribeMessage('host:setBoardMode')
  setBoardMode(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setBoardMode(body.sessionId, user.sub, body.mode);
    });
  }

  @SubscribeMessage('host:setBoardView')
  setBoardView(@MessageBody() body: BaseBody & { layout: 'single' | 'split'; leftMode: 'pdf' | 'notebook'; rightMode: 'pdf' | 'notebook' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.setBoardView(body.sessionId, user.sub, body.layout, body.leftMode, body.rightMode);
    });
  }

  @SubscribeMessage('host:scroll')
  scroll(@MessageBody() body: BaseBody & { page: number; yRatio: number; xRatio?: number; pane?: 'left' | 'right' }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      this.classroomService.scroll(body.sessionId, user.sub, body.page, body.yRatio, body.pane, body.xRatio);
    });
  }

  @SubscribeMessage('host:setBoardOpen')
  setBoardOpen(@MessageBody() body: BaseBody & { isOpen: boolean }) {
    return this.run(body.sessionId, () => {
      const user = this.verify(body.token);
      const s = this.classroomService.getSession(body.sessionId);
      if (!s) return;
      if (s.hostUserId !== user.sub) return;
      s.isBoardOpen = body.isOpen;
      this.server.to(`cs:${body.sessionId}`).emit('board:open:set', { isOpen: body.isOpen });
    });
  }

  @SubscribeMessage('host:end')
  async hostEnd(@MessageBody() body: BaseBody) {
    try {
      const user = this.verify(body.token);
      await this.classroomService.withSession(
        body.sessionId,
        () => this.classroomService.endSession(body.sessionId, user.sub),
      );
      return { ok: true };
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'ERROR';
      return { ok: false, code };
    }
  }

  @SubscribeMessage('reaction:send')
  sendReaction(
    @MessageBody() body: BaseBody & { emoji: string; userName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.run(body.sessionId, () => {
      let userId: string = client.id;
      let userName = body.userName || 'Mehmon';
      if (body.token) {
        try {
          const u = this.verify(body.token);
          userId = u.sub;
          userName = u.name || userName;
        } catch {}
      }
      const reactionId = crypto.randomUUID();
      this.classroomService.recordReaction(body.sessionId, userId, userName, body.emoji, reactionId);
      this.server.to(`cs:${body.sessionId}`).emit('reaction:receive', {
        id: reactionId,
        userId,
        emoji: body.emoji,
        userName,
        socketId: client.id,
      });
    });
  }

  @SubscribeMessage('hand:toggle')
  handToggle(
    @MessageBody() body: BaseBody & { userName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.run(body.sessionId, () => {
      let userId: string = client.id;
      let userName = body.userName || 'Mehmon';
      if (body.token) {
        try {
          const u = this.verify(body.token);
          userId = u.sub;
          userName = u.name || userName;
        } catch {}
      }
      const raisedHands = this.classroomService.handToggle(body.sessionId, userId, userName);
      this.server.to(`cs:${body.sessionId}`).emit('hand:update', { raisedHands });
    });
  }

  @SubscribeMessage('hand:lowerAll')
  handLowerAll(@MessageBody() body: BaseBody) {
    return this.run(body.sessionId, () => {
      // Faqat autentifikatsiya qilingan foydalanuvchi barcha qo'llarni tushira oladi
      this.verify(body.token);
      const raisedHands = this.classroomService.handLowerAll(body.sessionId);
      this.server.to(`cs:${body.sessionId}`).emit('hand:update', { raisedHands });
    });
  }

  @SubscribeMessage('hand:lowerUser')
  handLowerUser(@MessageBody() body: BaseBody & { targetUserId: string }) {
    return this.run(body.sessionId, () => {
      // Faqat autentifikatsiya qilingan foydalanuvchi aniq bir foydalanuvchining qo'lini tushira oladi
      this.verify(body.token);
      const raisedHands = this.classroomService.handLowerUser(body.sessionId, body.targetUserId);
      this.server.to(`cs:${body.sessionId}`).emit('hand:update', { raisedHands });
    });
  }
}
