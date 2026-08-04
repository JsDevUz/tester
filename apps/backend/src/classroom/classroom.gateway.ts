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

  @SubscribeMessage('host:stroke')
  stroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.stroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane);
    });
  }

  @SubscribeMessage('host:moveStroke')
  moveStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; x: number; y: number; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.moveStroke(body.sessionId, user.sub, body.page, body.strokeId, body.x, body.y, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:updateTextStroke')
  updateTextStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.updateTextStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:updateShapeStroke')
  updateShapeStroke(@MessageBody() body: BaseBody & { page: number; stroke: ClassroomStroke; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.updateShapeStroke(body.sessionId, user.sub, body.page, body.stroke, body.mode, body.pane, body.groupId);
    });
  }

  @SubscribeMessage('host:undo')
  undo(@MessageBody() body: BaseBody) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.undo(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:redo')
  redo(@MessageBody() body: BaseBody) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.redo(body.sessionId, user.sub);
    });
  }

  @SubscribeMessage('host:eraseStroke')
  eraseStroke(@MessageBody() body: BaseBody & { page: number; strokeId: string; mode?: 'pdf' | 'notebook'; pane?: 'left' | 'right'; groupId?: string }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.eraseStroke(body.sessionId, user.sub, body.page, body.strokeId, body.mode, body.pane, body.groupId);
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

  @SubscribeMessage('host:setSplitRatio')
  setSplitRatio(@MessageBody() body: BaseBody & { ratio: number }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setSplitRatio(body.sessionId, user.sub, body.ratio);
    });
  }

  @SubscribeMessage('host:removePage')
  removePage(@MessageBody() body: BaseBody & { mode: 'pdf' | 'notebook'; pageIndex: number; pane?: 'left' | 'right' }) {
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.removePage(body.sessionId, user.sub, body.mode, body.pageIndex, body.pane ?? 'left');
    });
  }

  @SubscribeMessage('host:insertNotebookPage')
  insertNotebookPage(@MessageBody() body: BaseBody & { afterPageIndex: number; style: 'grid' | 'lined' | 'plain'; orientation?: 'portrait' | 'landscape'; pane?: 'left' | 'right' }) {
    return this.run(() => {
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
    return this.run(() => {
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
    return this.run(() => {
      const user = this.verify(body.token);
      this.classroomService.setNotebookPageStyle(body.sessionId, user.sub, body.page, body.style);
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

  @SubscribeMessage('reaction:send')
  sendReaction(
    @MessageBody() body: BaseBody & { emoji: string; userName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.run(() => {
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

  @SubscribeMessage('board:subtitle')
  sendSubtitle(
    @MessageBody() body: BaseBody & { text: string; startMs: number; endMs: number },
    @ConnectedSocket() client: Socket,
  ) {
    return this.run(() => {
      const cue = {
        id: crypto.randomUUID(),
        text: body.text,
        startMs: body.startMs,
        endMs: body.endMs,
      };
      this.classroomService.addSubtitleCue(body.sessionId, cue);
      this.server.to(`cs:${body.sessionId}`).emit('board:subtitle', cue);
    });
  }

  @SubscribeMessage('board:subtitle_audio')
  async handleSubtitleAudio(
    @MessageBody() body: BaseBody & { audioBase64: string; startMs: number; endMs: number },
  ) {
    try {
      const s = this.classroomService.getSession(body.sessionId);
      if (!s) {
        console.warn(`[Subtitle] Session not found: ${body.sessionId}`);
        return;
      }

      console.log(`[Subtitle] 📥 Received audio chunk for ${body.sessionId}, base64 len: ${body.audioBase64?.length}`);

      const primaryUrl = process.env.SUBTITLE_SERVER_URL || 'http://subtitle-server:8090';
      let response: Response | null = null;

      try {
        response = await fetch(`${primaryUrl}/transcribe-base64`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: body.audioBase64,
            startMs: body.startMs,
            endMs: body.endMs,
          }),
        });
      } catch (err1) {
        try {
          response = await fetch('http://127.0.0.1:8090/transcribe-base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: body.audioBase64,
              startMs: body.startMs,
              endMs: body.endMs,
            }),
          });
        } catch (err2) {
          console.warn('[Subtitle] Connection error to subtitle-server:', err2);
        }
      }

      if (!response || !response.ok) {
        console.warn(`[Subtitle] Subtitle server response not ok: ${response?.status}`);
        return;
      }

      const data = (await response.json()) as { text?: string };
      console.log(`[Subtitle] 💬 Whisper transcribed for ${body.sessionId}: "${data.text}"`);

      if (data.text && data.text.trim().length > 0) {
        const cue = {
          id: crypto.randomUUID(),
          text: data.text.trim(),
          startMs: body.startMs,
          endMs: body.endMs,
        };
        this.classroomService.addSubtitleCue(body.sessionId, cue);
        this.server.to(`cs:${body.sessionId}`).emit('board:subtitle', cue);
        console.log(`[Subtitle] 📢 Broadcasted cue to cs:${body.sessionId}: "${cue.text}"`);
      }
    } catch (err) {
      console.warn('[Subtitle] Gateway error:', err);
    }
  }

  @SubscribeMessage('hand:toggle')
  handToggle(
    @MessageBody() body: BaseBody & { userName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.run(() => {
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
    return this.run(() => {
      const raisedHands = this.classroomService.handLowerAll(body.sessionId);
      this.server.to(`cs:${body.sessionId}`).emit('hand:update', { raisedHands });
    });
  }

  @SubscribeMessage('hand:lowerUser')
  handLowerUser(@MessageBody() body: BaseBody & { targetUserId: string }) {
    return this.run(() => {
      const raisedHands = this.classroomService.handLowerUser(body.sessionId, body.targetUserId);
      this.server.to(`cs:${body.sessionId}`).emit('hand:update', { raisedHands });
    });
  }
}
