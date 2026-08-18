import { randomUUID } from 'crypto';
import {
  ConflictException, ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException,
  OnApplicationShutdown, OnModuleInit, Optional, ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BoardsService } from './boards.service';
import { ClassroomVoiceService } from './classroom-voice.service';
import { ClassroomAttendanceService } from './classroom-attendance.service';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '../db';
import { attendanceRecords, classSessions, contentBlocks, courses, freeSessionParticipants, groupEnrollments, groups, mediaAssets, schoolMembers, users } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { MediaLibraryService } from '../upload/media-library.service';
import { PracticeMessengerGateway } from '../practice-messenger/practice-messenger.gateway';
import { ClassroomRecordingService } from './classroom-recording.service';
import {
  addStroke, applyNotebookPageStyleInverse, applyPageClearInverse, applyPageInsertInverse, applyPageRemoveInverse, applyStrokeAddInverse, applyStrokeEraseInverse,
  applyStrokeReorderInverse, applyStrokeSplitInverse, applyStrokeStyleInverse, applyStrokeTextInverse, applyStrokeTransformInverse,
  attendanceStatusOnJoin, buildSnapshot, clearPage as clearPageStrokes,
  closeInterval, eraseStroke as eraseStrokeById, HOST_GRACE_MS, insertNotebookPageIntoSession, insertPdfPagesIntoSession, isValidPage,
  pushUndoEntry, removePageFromSession,
  reorderStrokes as reorderStrokesInSession, resolveNotebookPageOrientation, resolveNotebookPageStyle,
  setPage as setSessionPage, splitStroke as splitStrokeInSession, strokeMapFor, switchBoardMode,
  updateShapeStroke as updateShapeStrokeInSession,
  updateStrokePosition, updateTextStroke as updateTextStrokeInSession,
} from './classroom.logic';
import {
  AttendanceStatus, ClassroomBoardMode, ClassroomBoardSnapshot, ClassroomBroadcaster, ClassroomHistoryEvent, ClassroomNotebookOrientation, ClassroomNotebookStyle,
  ClassroomPageSnapshot, ClassroomParticipant, ClassroomRaisedHand, ClassroomRecordingMode, ClassroomSession, ClassroomSnapshot, ClassroomStroke, ClassroomUndoEntry,
} from './classroom.types';
import { RedisSessionStore } from '../redis/redis-session.store';
import { RedisService } from '../redis/redis.service';

import { ClassroomReplayService } from './classroom-replay.service';
import { ClassroomSnapshotService } from './classroom-snapshot.service';
import { ClassroomBoardAttachmentService } from './classroom-board-attachment.service';
import { ClassroomSessionLifecycleService } from './classroom-session-lifecycle.service';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['absent', 'present', 'late'];

@Injectable()
export class ClassroomService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ClassroomService.name);
  private sessions = new Map<string, ClassroomSession>();
  private broadcaster: ClassroomBroadcaster = { toRoom: () => {}, toSocket: () => {} };

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly mediaLibrary: MediaLibraryService,
    private readonly recording: ClassroomRecordingService,
    private readonly notifications: PracticeMessengerGateway,
    @Optional() @Inject(forwardRef(() => BoardsService)) private readonly boardsService?: BoardsService,
    @Optional() private readonly voiceService?: ClassroomVoiceService,
    @Optional() @Inject(forwardRef(() => ClassroomAttendanceService)) private readonly attendanceService?: ClassroomAttendanceService,
    @Optional() private readonly replayService?: ClassroomReplayService,
    @Optional() private readonly snapshotService?: ClassroomSnapshotService,
    @Optional() private readonly attachmentService?: ClassroomBoardAttachmentService,
    @Optional() private readonly lifecycleService?: ClassroomSessionLifecycleService,
    @Optional() private readonly sessionStore?: RedisSessionStore,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private subtitleTranscriptionJobs = new Map<string, Promise<void>>();

  private get boardsSvc(): BoardsService {
    return this.boardsService ?? new BoardsService(this);
  }

  private get voiceSvc(): ClassroomVoiceService {
    return this.voiceService ?? new ClassroomVoiceService(this.config);
  }

  private get attendanceSvc(): ClassroomAttendanceService {
    return this.attendanceService ?? new ClassroomAttendanceService(this);
  }

  private get replaySvc(): ClassroomReplayService {
    return this.replayService ?? new ClassroomReplayService(this.storage, this.config, this.recording);
  }

  private get snapshotSvc(): ClassroomSnapshotService {
    return this.snapshotService ?? new ClassroomSnapshotService();
  }

  private get attachmentSvc(): ClassroomBoardAttachmentService {
    return this.attachmentService ?? new ClassroomBoardAttachmentService(this.mediaLibrary);
  }

  private get lifecycleSvc(): ClassroomSessionLifecycleService {
    return this.lifecycleService ?? new ClassroomSessionLifecycleService(this.storage, this.notifications, this.snapshotSvc);
  }

  private sessionKey(sessionId: string) { return `classroom:session:${sessionId}`; }

  async withSession<T>(sessionId: string, action: () => Promise<T> | T): Promise<T> {
    // Agar sessiya xotirada faol bo'lsa, har bir so'rovda Redis distributed lock
    // va og'ir JSON.stringify / JSON.parse qilmasdan to'g'ridan-to'g'ri (0ms)
    // bajarish xizmat tezligini minglab marta oshiradi.
    if (this.sessions.has(sessionId)) {
      return action();
    }
    const store = this.sessionStore;
    if (!store) return action();
    return store.transaction(this.sessionKey(sessionId), async () => {
      const shared = await store.get<ClassroomSession>(this.sessionKey(sessionId));
      if (shared) this.sessions.set(sessionId, shared);
      const result = await action();
      const current = this.sessions.get(sessionId);
      if (current) await store.set(this.sessionKey(sessionId), current, 7 * 86_400);
      else await store.delete(this.sessionKey(sessionId));
      return result;
    });
  }

  private async indexSocket(socketId: string, sessionId: string) {
    if (this.redis?.enabled) await this.redis.raw.set(`classroom:socket:${socketId}`, sessionId, { EX: 7 * 86_400 });
  }

  setBroadcaster(b: ClassroomBroadcaster) {
    this.broadcaster = b;
  }

  // Server restartda aktiv sessiyalarni yopmaymiz. Ular DB snapshotdan
  onModuleInit() {
    // Boshlang'ich init logikasi (hozircha bo'sh — autosave @Interval orqali)
  }

  // Deploy/restart (SIGTERM) 15 soniyalik autoPersistActiveSessions
  // oralig'ining istalgan o'rtasida kelishi mumkin — shu oraliqdagi eng
  // so'nggi chizmalar hech qachon DB'ga yozilmasdan jarayon bilan birga
  // yo'qolishi mumkin edi. main.ts'da enableShutdownHooks() yoqilgach, bu
  // hook process SIGTERM bilan o'lishidan oldin barcha aktiv sessiyalarni
  // majburan saqlaydi.
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`onApplicationShutdown(${signal ?? ''}): saqlanadigan aktiv sessiyalar soni = ${this.sessions.size}`);
    await this.snapshotSvc.autoSaveSnapshots(this.sessions);
    this.logger.log('onApplicationShutdown: autoSaveSnapshots tugadi');
  }

  // Aktiv darslar doska holatini har 15 soniyada DB ga avtomatik saqlaydi —
  // ustoz to'satdan brauzerni yopib yuborsa ham saqlanmay qolib ketmaydi.
  // NestJS @Interval dekoratori setInterval'dan farqli: lifecycle bilan
  // integratsiya qilingan, graceful shutdown'da to'g'ri to'xtatiladi.
  @Interval(15_000)
  private async autoPersistActiveSessions(): Promise<void> {
    await this.snapshotSvc.autoSaveSnapshots(this.sessions);
  }

  // ---------- REST: lifecycle ----------

  private async loadCourseEnrollments(courseId: string) {
    return this.lifecycleSvc.loadCourseEnrollments(courseId);
  }

  async createSession(courseId: string, teacherId: string, role: string, title?: string): Promise<{ id: string }> {
    return this.lifecycleSvc.createSession(courseId, teacherId, role, this.sessions, title);
  }

  async createFreeSession(teacherId: string, title?: string): Promise<{ id: string }> {
    return this.lifecycleSvc.createFreeSession(teacherId, this.sessions, title);
  }

  // -------------------- BOARDS (Delegated to BoardsService) --------------------

  initBoardSession(id: string, teacherId: string, hostName: string, title: string | null): void {
    this.sessions.set(id, {
      id,
      courseId: null,
      courseName: null,
      title,
      isFree: true,
      isBoard: true,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      boardMode: 'notebook',
      boardLayout: 'single',
      leftBoardMode: 'notebook',
      rightBoardMode: 'notebook',
      classroomTheme: 'light',
      notebookStyle: 'grid',
      notebookPageCount: 1,
      strokesByMode: new Map([['pdf', new Map()], ['notebook', new Map()]]),
      participants: new Map(),
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    });
  }

  broadcastToRoom(roomId: string, event: string, payload: unknown): void {
    this.broadcaster.toRoom(roomId, event, payload);
  }

  async createBoard(teacherId: string, title?: string): Promise<{ id: string }> {
    return this.boardsSvc.createBoard(teacherId, title);
  }

  async listMyBoards(teacherId: string) {
    return this.boardsSvc.listMyBoards(teacherId);
  }

  async deleteBoard(boardId: string, teacherId: string): Promise<void> {
    return this.boardsSvc.deleteBoard(boardId, teacherId);
  }

  async updateBoardTitle(boardId: string, teacherId: string, title: string): Promise<void> {
    return this.boardsSvc.updateBoardTitle(boardId, teacherId, title);
  }

  async getBoardActivity(boardId: string, userId: string, page = 1, limit = 20) {
    return this.boardsSvc.getBoardActivity(boardId, userId, page, limit);
  }

  async createBoardVersionCheckpoint(sessionId: string, customLabel?: string, explicitSnapshot?: any): Promise<void> {
    return this.boardsSvc.createBoardVersionCheckpoint(sessionId, customLabel, explicitSnapshot);
  }

  async getBoardVersions(boardId: string, userId: string) {
    return this.boardsSvc.getBoardVersions(boardId, userId);
  }

  async restoreBoardVersion(boardId: string, userId: string, versionId: string): Promise<void> {
    return this.boardsSvc.restoreBoardVersion(boardId, userId, versionId);
  }

  // -------------------- END BOARDS --------------------

  async createFreeSessionFromSnapshot(teacherId: string, sourceSessionId: string): Promise<{ id: string }> {
    return this.lifecycleSvc.createFreeSessionFromSnapshot(teacherId, sourceSessionId, this.sessions);
  }

  async createClassSessionFromSnapshot(sourceSessionId: string, teacherId: string, role: string, title?: string): Promise<{ id: string }> {
    return this.lifecycleSvc.createClassSessionFromSnapshot(sourceSessionId, teacherId, role, this.sessions, title);
  }

  async reopenFreeSession(teacherId: string, sessionId: string, title?: string): Promise<void> {
    return this.lifecycleSvc.reopenFreeSession(teacherId, sessionId, this.sessions, title);
  }

  async attachPdfFromLibrary(
    sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[],
  ): Promise<{ pdfName: string; pages: string[] }> {
    const s = this.requireSession(sessionId);
    return this.attachmentSvc.attachPdfFromLibrary(
      s, teacherId, teacherRole, mediaAssetId, pageNumbers,
      (sess) => this.buildBoardSnapshot(sess),
      (sessId, label, snap) => this.createBoardVersionCheckpoint(sessId, label, snap),
      (sess, type, payload) => this.recordHistoryEvent(sess, type, payload),
      this.broadcaster,
      (sess) => this.onBoardMutation(sess),
    );
  }

  async attachBoardToSession(
    sessionId: string, teacherId: string, boardId: string,
  ): Promise<{ ok: boolean; state?: any }> {
    const s = this.requireSession(sessionId);
    return this.attachmentSvc.attachBoardToSession(
      s, teacherId, boardId, this.sessions,
      (sess) => this.buildBoardSnapshot(sess),
      (sessId, label, snap) => this.createBoardVersionCheckpoint(sessId, label, snap),
      (sess, type, payload) => this.recordHistoryEvent(sess, type, payload),
      this.broadcaster,
    );
  }

  async insertPdfPagesFromLibrary(
    sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
  ): Promise<{ pages: string[] }> {
    const s = this.requireSession(sessionId);
    return this.attachmentSvc.insertPdfPagesFromLibrary(
      s, teacherId, teacherRole, mediaAssetId, pageNumbers, afterPageIndex,
      (sess, type, payload) => this.recordHistoryEvent(sess, type, payload),
      this.broadcaster,
      (sess) => this.onBoardMutation(sess),
    );
  }

  private applyPdf(s: ClassroomSession, pdfName: string, pages: string[]) {
    this.attachmentSvc.applyPdf(s, pdfName, pages);
  }

  // Testlar uchun to'g'ridan-to'g'ri holat o'rnatish (S3/konvertatsiyasiz)
  setPdfForTests(sessionId: string, pdfName: string, pages: string[]) {
    this.applyPdf(this.requireSession(sessionId), pdfName, pages);
  }

  setBoardMode(sessionId: string, userId: string, mode: ClassroomBoardMode): void {
    const s = this.requireHost(sessionId, userId);
    if (mode !== 'pdf' && mode !== 'notebook') throw new Error('INVALID_BOARD_MODE');
    s.boardLayout = 'single'; s.leftBoardMode = mode; s.rightBoardMode = mode;
    switchBoardMode(s, mode);
    const snapshot = buildSnapshot(s);
    const payload = {
      mode,
      layout: 'single', leftMode: mode, rightMode: mode,
      currentPage: snapshot.currentPage,
      strokesByPage: snapshot.strokesByPage,
      rightStrokesByPage: snapshot.rightStrokesByPage,
      strokesByMode: snapshot.strokesByMode,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      notebookPageOrientations: snapshot.notebookPageOrientations,
      pdfName: snapshot.pdfName,
      pages: snapshot.pages,
    };
    this.recordHistoryEvent(s, 'board:set', payload);
    this.broadcaster.toRoom(sessionId, 'board:set', payload);
  }

  setBoardView(sessionId: string, userId: string, layout: 'single' | 'split', leftMode: ClassroomBoardMode, rightMode: ClassroomBoardMode): void {
    const s = this.requireHost(sessionId, userId);
    if (!['pdf', 'notebook'].includes(leftMode) || !['pdf', 'notebook'].includes(rightMode)) throw new Error('INVALID_BOARD_MODE');
    if (layout === 'split' && leftMode === rightMode) throw new Error('DUPLICATE_SPLIT_MODE');
    s.boardLayout = layout === 'split' ? 'split' : 'single';
    s.leftBoardMode = leftMode;
    s.rightBoardMode = rightMode;
    s.boardMode = leftMode;
    switchBoardMode(s, leftMode);
    const snapshot = buildSnapshot(s);
    const payload = {
      mode: leftMode, layout: s.boardLayout, leftMode, rightMode,
      currentPage: snapshot.currentPage, strokesByPage: snapshot.strokesByPage,
      rightStrokesByPage: snapshot.rightStrokesByPage,
      strokesByMode: snapshot.strokesByMode,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      notebookPageOrientations: snapshot.notebookPageOrientations,
      pdfName: snapshot.pdfName,
      pages: snapshot.pages,
    };
    this.recordHistoryEvent(s, 'board:set', payload);
    this.broadcaster.toRoom(sessionId, 'board:set', payload);
  }

  getSession(sessionId: string): ClassroomSession | undefined {
    return this.sessions.get(sessionId);
  }

  async endSession(sessionId: string, byUserId: string | null): Promise<void> {
    const s = this.requireSession(sessionId);
    if (byUserId !== null && s.hostUserId !== byUserId) throw new ForbiddenException('Faqat dars ustozi yakunlay oladi');

    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }

    // Davomat (attendance) faqat guruhga bog'liq darslarda ma'noli — erkin
    // darsda enrollment tushunchasi yo'q, shu qism o'tkazib yuboriladi.
    if (!s.isFree) {
      const now = Date.now();
      for (const p of s.participants.values()) {
        if (p.joinedAtMs !== null) {
          closeInterval(p, now);
          await this.persistAttendance(s.id, p);
        }
      }
    }

    // Board snapshot va yozib olish holati endi HAR IKKALA turdagi
    // sessiya uchun ham saqlanadi (erkin sessiyalar endi createFreeSession
    // orqali class_sessions qatoriga ega).
    const boardSnapshot = this.buildBoardSnapshot(s);
    // boardAudio'da chizmalarning bosqichma-bosqich tarixi kerak emas:
    // yakuniy vektor holati boardSnapshot'da saqlanadi. Faqat o'qituvchi
    // navigatsiyasi va kursori audio timeline bilan birga qayta ijro etiladi.
    const historyEvents = s.recordingMode === 'boardAudio'
      ? (s.historyEvents ?? []).filter((event) =>
        event.type === 'pointer:move' ||
        event.type === 'scroll:set' ||
        event.type === 'zoom:set' ||
        event.type === 'splitRatio:set' ||
        event.type === 'page:set')
      : (s.historyEvents ?? []);
    const dbRow = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
    const existingRecordings = (dbRow?.recordings as unknown as any[]) ?? [];
    const recordingAttendance = Array.from(s.participants.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
      status: p.status ?? 'present',
    }));
    const recUrl = s.recordingUrl ?? dbRow?.recordingUrl ?? null;
    const recStatus = (s.recordingStatus && s.recordingStatus !== 'none') ? s.recordingStatus : (dbRow?.recordingStatus ?? 'none');
    const recStartedAtMs = s.recordingStartedAtMs ?? dbRow?.recordingStartedAtMs ?? null;
    const recEgressId = s.egressId ?? dbRow?.egressId ?? null;

    const newRecordingEntry = {
      id: randomUUID(),
      partNumber: existingRecordings.length + 1,
      createdAt: new Date().toISOString(),
      title: s.title ?? dbRow?.title ?? null,
      historyEvents,
      recordingUrl: recUrl,
      recordingStatus: recStatus,
      recordingStartedAtMs: recStartedAtMs,
      recordingMode: s.recordingMode ?? dbRow?.recordingMode ?? null,
      boardSnapshot,
      egressId: recEgressId,
      attendance: recordingAttendance,
    };
    const updatedRecordings = [...existingRecordings, newRecordingEntry];

    // Jonli darsga mavjud persistent doska biriktirilgan bo'lsa, yakuniy
    // holatni dars turidan (guruh/erkin, recording bor/yo'q) qat'i nazar
    // asl doskaga yozamiz. Debounced autosave hali ishlashga ulgurmasdan
    // session o'chirilsa timer endi sessionni topa olmaydi; shu sabab end
    // oqimida bu write majburiy bo'lishi kerak.
    if (s.attachedBoardId) {
      await db.update(classSessions)
        .set({
          boardSnapshot,
          pdfName: s.pdfName,
          pdfPages: s.pdfPages,
        })
        .where(eq(classSessions.id, s.attachedBoardId));

      const attachedBoard = this.sessions.get(s.attachedBoardId);
      if (attachedBoard) {
        attachedBoard.pdfName = s.pdfName;
        attachedBoard.pdfPages = s.pdfPages;
        attachedBoard.boardMode = s.boardMode;
        attachedBoard.boardLayout = s.boardLayout;
        attachedBoard.leftBoardMode = s.leftBoardMode;
        attachedBoard.rightBoardMode = s.rightBoardMode;
        attachedBoard.strokesByPage = new Map(s.strokesByPage);
        if (s.strokesByMode) attachedBoard.strokesByMode = new Map(s.strokesByMode);
        attachedBoard.notebookPageCount = s.notebookPageCount;
        attachedBoard.notebookPageStyles = s.notebookPageStyles;
        attachedBoard.notebookPageOrientations = s.notebookPageOrientations;
      }
    }

    const lessonTitle = s.title?.trim() || s.courseName?.trim() || 'Jonli dars';
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    const endLessonLabel = `Dars yakunlangan holat (${lessonTitle}, ${dateStr} ${timeStr})`;

    // Persistent doska oddiy erkin dars emas: endSession tasodifan chaqirilsa
    // ham qatorni o'chirmaymiz, faqat oxirgi holatini saqlaymiz.
    if (s.isBoard || dbRow?.isBoard === true) {
      await this.createBoardVersionCheckpoint(sessionId, `Doska seansi yakuni (${dateStr} ${timeStr})`);
      await db.update(classSessions)
        .set({
          boardSnapshot,
          pdfName: s.pdfName,
          pdfPages: s.pdfPages,
          historyEvents: s.historyEvents ?? [],
        })
        .where(eq(classSessions.id, sessionId));
      this.sessions.delete(sessionId);
      return;
    }

    if (s.attachedBoardId) {
      await this.createBoardVersionCheckpoint(s.attachedBoardId, endLessonLabel);
    }
    await this.createBoardVersionCheckpoint(sessionId, endLessonLabel);

    const hasRecording = s.recordingMode != null;

    if (s.isFree && !hasRecording) {
      // Erkin dars + yozib olish yo'q → sessiyani o'chir
      await db.delete(classSessions)
        // Defense-in-depth: runtime flag noto'g'ri yoki eski Redis state bo'lsa
        // ham persistent board qatori SQL darajasida o'chirilmaydi.
        .where(and(eq(classSessions.id, sessionId), eq(classSessions.isBoard, false)));
    } else {
      // Recording bor yoki guruh darsi → saqla
      await db.update(classSessions)
        .set({
          status: 'ended',
          endedAt: new Date(),
          historyEvents,
          recordingMode: s.recordingMode ?? null,
          boardSnapshot,
          recordings: updatedRecordings,
        })
        .where(eq(classSessions.id, sessionId));
    }

    if (s.recordingMode === 'full' || s.recordingMode === 'boardAudio') {
      void this.recording.stopRecording(s.id);
    }

    this.broadcaster.toRoom(sessionId, 'session:ended', {});
    // Sessiyaga hali qo'shilmagan (masalan boshqa sahifada turgan) talabalar
    // uchun ham — "jonli dars boshlandi" bildirishnomasi endi eskirganini
    // bildirish uchun global signal (liveSession:started bilan bir xil
    // user:<userId> infratuzilmasi orqali).
    this.notifications.notifyUsers([...s.participants.keys()], 'liveSession:ended', { sessionId });
    const pendingPersist = this.persistDebounceTimers.get(sessionId);
    if (pendingPersist) {
      clearTimeout(pendingPersist);
      this.persistDebounceTimers.delete(sessionId);
    }
    this.sessions.delete(sessionId);
  }

  // ---------- Socket: join / holat ----------

  hostJoin(sessionId: string, userId: string, socketId: string): ClassroomSnapshot {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== userId) throw new Error('FORBIDDEN');
    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    s.hostSocketId = socketId;
    this.broadcaster.toRoom(sessionId, 'host:online', {});
    return buildSnapshot(s);
  }

  async hostJoinRestored(sessionId: string, userId: string, socketId: string, role?: string): Promise<ClassroomSnapshot> {
    const s = await this.getOrRestoreSession(sessionId, userId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    if (s.hostUserId !== userId && role !== 'super') throw new Error('FORBIDDEN');
    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    s.hostSocketId = socketId;
    await this.indexSocket(socketId, sessionId);
    this.broadcaster.toRoom(sessionId, 'host:online', {});
    return buildSnapshot(s);
  }

  // guestName faqat erkin (isFree) sessiyalarda ishlatiladi — login qilmagan
  // mehmon o'zi kiritgan ism. Login qilgan foydalanuvchi uchun esa haqiqiy
  // ismi (displayName) ishlatiladi, guestName e'tiborsiz qoldiriladi.
  async studentJoin(
    sessionId: string, userId: string, socketId: string, guestName?: string, displayName?: string,
  ): Promise<ClassroomSnapshot> {
    const s = await this.requireSessionAsync(sessionId);
    let p = s.participants.get(userId);
    if (!p) {
      if (s.isFree) {
        // Erkin dars: guruh/enrollment tekshiruvi yo'q — istalgan kishi
        // (anonim yoki login qilgan) kira oladi. Faqat login qilgan
        // (guest: prefiksisiz) foydalanuvchilar free_session_participants'ga
        // yoziladi — bu orqali keyinroq o'quvchining "Jonli darslar"
        // ro'yxatida shu darsni topish mumkin bo'ladi.
        p = {
          userId,
          name: displayName ?? guestName ?? 'Mehmon',
          enrollmentId: null,
          socketId: null,
          joinedAtMs: null,
          totalSeconds: 0,
          status: 'absent',
        };
        s.participants.set(userId, p);
        if (!userId.startsWith('guest:')) {
          await db.insert(freeSessionParticipants)
            .values({ sessionId: s.id, userId })
            .onConflictDoNothing();
        }
      } else {
        // Sessiya ochilganidan keyin kursning biror guruhiga qo'shilgan bo'lishi mumkin
        const rows = await this.loadCourseEnrollments(s.courseId!);
        const enrollment = rows.find(
          (r) => (r.schoolMember as unknown as { studentId: string }).studentId === userId,
        );
        if (!enrollment) throw new Error('NOT_ENROLLED');
        const member = enrollment.schoolMember as unknown as { studentId: string; student: { displayName: string } };
        p = {
          userId,
          name: member.student.displayName,
          enrollmentId: enrollment.id,
          socketId: null,
          joinedAtMs: null,
          totalSeconds: 0,
          status: 'absent',
        };
        s.participants.set(userId, p);
        await db.insert(attendanceRecords)
          .values({ sessionId: s.id, enrollmentId: enrollment.id })
          .onConflictDoNothing();
      }
    } else {
      if (userId.startsWith('guest:') && guestName?.trim()) {
        p.name = guestName.trim();
      } else if (displayName?.trim()) {
        p.name = displayName.trim();
      }
    }

    const now = Date.now();
    p.socketId = socketId;
    await this.indexSocket(socketId, sessionId);
    if (p.joinedAtMs === null) p.joinedAtMs = now;
    if (p.status === 'absent') {
      p.status = attendanceStatusOnJoin(s.startedAtMs, now);
      if (!s.isFree) {
        await db.update(attendanceRecords)
          .set({ firstJoinedAt: new Date(now), status: p.status })
          .where(and(eq(attendanceRecords.sessionId, s.id), eq(attendanceRecords.enrollmentId, p.enrollmentId!)));
      }
    }
    this.broadcastPresence(s);
    return buildSnapshot(s);
  }

  broadcastPresence(s: ClassroomSession) {
    this.broadcaster.toRoom(s.id, 'presence:update', {
      participants: [...s.participants.values()].map((p) => ({
        userId: p.userId, name: p.name, online: p.socketId !== null, status: p.status,
      })),
      hostOnline: s.hostSocketId !== null,
    });
  }

  private persistAttendance(sessionId: string, p: ClassroomParticipant): Promise<unknown> {
    if (p.enrollmentId === null) return Promise.resolve();
    return db.update(attendanceRecords)
      .set({ totalSeconds: p.totalSeconds, lastLeftAt: new Date() })
      .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.enrollmentId, p.enrollmentId)));
  }

  async handleDisconnect(socketId: string): Promise<void> {
    const indexedSessionId = this.redis?.enabled
      ? await this.redis.raw.get(`classroom:socket:${socketId}`)
      : null;
    const sessionIds = indexedSessionId ? [indexedSessionId] : [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.withSession(sessionId, async () => {
      const s = this.sessions.get(sessionId);
      if (!s) return;
      if (s.hostSocketId === socketId) {
        s.hostSocketId = null;
        this.broadcaster.toRoom(s.id, 'host:offline', {});
        this.broadcastPresence(s);
        // Joriy holatni darhol saqlaymiz (bu shunchaki "current" ustidan
        // yoziladi, versiya tarixini buzmaydi). Ammo yangi VERSIYA checkpoint
        // yaratishni bu yerda darhol qilmaymiz: host qisqa vaqtga (masalan
        // WebSocket qayta ulanishi paytida, hali chizish tugallanmagan holda)
        // uzilib qolsa, xotiradagi holat vaqtincha to'liq bo'lmasligi mumkin —
        // shu holatni versiya sifatida "muzlatib qo'yish" avvalgi to'liq
        // versiyani almashtirib, ma'lumot yo'qotadi. Shuning uchun versiya
        // checkpoint faqat HOST_GRACE_MS kutib, host haqiqatan qaytmasa
        // yaratiladi (pastda, timer ichida).
        void this.persistBoardSnapshot(s.id).catch(() => {});
        const persistentBoard = s.isBoard || !!(await db.query.classSessions.findFirst({
          where: and(eq(classSessions.id, s.id), eq(classSessions.isBoard, true)),
          columns: { id: true },
        }));
        if (persistentBoard) {
          s.isBoard = true;
          if (!s.hostDisconnectTimer) {
            s.hostDisconnectTimer = setTimeout(() => {
              s.hostDisconnectTimer = null;
              if (s.hostSocketId !== null) return;
              void this.createBoardVersionCheckpoint(s.id).catch(() => {});
            }, HOST_GRACE_MS);
          }
          return;
        }
        if (!s.hostDisconnectTimer) {
          s.hostDisconnectTimer = setTimeout(() => {
            void this.withSession(s.id, () => this.endSession(s.id, null)).catch(() => {});
          }, HOST_GRACE_MS);
        }
        return;
      }
      for (const p of s.participants.values()) {
        if (p.socketId === socketId) {
          p.socketId = null;
          closeInterval(p, Date.now());
          if (!s.isFree) await this.persistAttendance(s.id, p);
          this.broadcastPresence(s);
          return;
        }
      }
      });
    }
    if (this.redis?.enabled) await this.redis.raw.del(`classroom:socket:${socketId}`);
  }

  // ---------- Socket: host boshqaruvi ----------

  setPage(sessionId: string, userId: string, page: number): void {
    const s = this.requireHost(sessionId, userId);
    if (!setSessionPage(s, page)) throw new Error('INVALID_PAGE');
    const payload = { page };
    this.recordHistoryEvent(s, 'page:set', payload);
    this.broadcaster.toRoom(sessionId, 'page:set', payload);
  }

  setTheme(sessionId: string, userId: string, theme: 'light' | 'dark'): void {
    const s = this.requireHost(sessionId, userId);
    if (theme !== 'light' && theme !== 'dark') throw new Error('INVALID_THEME');
    s.classroomTheme = theme;
    const payload = { theme };
    this.recordHistoryEvent(s, 'theme:set', payload);
    this.broadcaster.toRoom(sessionId, 'theme:set', payload);
  }

  stroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const accepted = addStroke(s, page, stroke, strokeMapFor(s, mode));
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    if (stroke.tool !== 'laser') {
      pushUndoEntry(s, { type: 'stroke:add', mode, page, pane, before: null, after: { stroke }, groupId });
    }
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:add', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:add', payload);
    this.onBoardMutation(s);
  }

  private persistDebounceTimers = new Map<string, NodeJS.Timeout>();

  private onBoardMutation(s: ClassroomSession): void {
    s.activeVersionId = 'current';
    if (s.attachedBoardId) {
      const attached = this.sessions.get(s.attachedBoardId);
      if (attached) attached.activeVersionId = 'current';
    }
    const existing = this.persistDebounceTimers.get(s.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.persistDebounceTimers.delete(s.id);
      void this.persistBoardSnapshot(s.id).catch(() => {});
    }, 1500);
    this.persistDebounceTimers.set(s.id, timer);
  }

  async persistBoardSnapshot(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    await this.snapshotSvc.persistBoardSnapshot(s);

    if (s.attachedBoardId) {
      const attachedBoard = this.sessions.get(s.attachedBoardId);
      if (attachedBoard) {
        attachedBoard.pdfName = s.pdfName;
        attachedBoard.pdfPages = s.pdfPages;
        attachedBoard.boardMode = s.boardMode;
        attachedBoard.boardLayout = s.boardLayout;
        attachedBoard.leftBoardMode = s.leftBoardMode;
        attachedBoard.rightBoardMode = s.rightBoardMode;
        attachedBoard.strokesByPage = new Map(s.strokesByPage);
        if (s.strokesByMode) {
          attachedBoard.strokesByMode = new Map(s.strokesByMode);
        }
        attachedBoard.notebookPageCount = s.notebookPageCount;
        attachedBoard.notebookPageStyles = s.notebookPageStyles;
        attachedBoard.notebookPageOrientations = s.notebookPageOrientations;
      }
    }
  }

  moveStroke(sessionId: string, userId: string, page: number, strokeId: string, x: number, y: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === strokeId);
    const before = priorStroke ? { points: [...priorStroke.points], rotation: priorStroke.rotation, textBoxWidth: priorStroke.textBoxWidth, textBoxHeight: priorStroke.textBoxHeight } : null;
    const accepted = updateStrokePosition(s, page, strokeId, x, y, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    if (before) {
      const updated = map.get(page)!.find((item) => item.id === strokeId)!;
      const after = { points: [...updated.points], rotation: updated.rotation, textBoxWidth: updated.textBoxWidth, textBoxHeight: updated.textBoxHeight };
      pushUndoEntry(s, { type: 'stroke:transform', mode, page, pane, strokeId, before, after, groupId });
    }
    const payload = { page, strokeId, x, y, pane, mode };
    this.recordHistoryEvent(s, 'stroke:update', payload);
    // excludeSender=true: frontend moveStroke() drag paytida optimistic
    // ravishda local state'ni allaqachon yangilaydi (useClassroomSession.ts)
    // — server aks-sadosi hostga qaytsa, tarmoq kechikishi tufayli eskirgan
    // qiymat bilan yangi o'zgarishni bosib yuborishi mumkin edi.
    this.broadcaster.toRoom(sessionId, 'stroke:update', payload, true);
    this.onBoardMutation(s);
  }

  updateTextStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : null;
    const accepted = updateTextStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:text', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] }, groupId });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:textUpdate', payload);
    // excludeSender=true — commitText() ham frontend'da optimistic update
    // qiladi (bir xil sabab bilan yuqoridagi izohga qarang).
    this.broadcaster.toRoom(sessionId, 'stroke:textUpdate', payload, true);
    this.onBoardMutation(s);
  }

  updateShapeStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : {};
    const accepted = updateShapeStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:style', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] }, groupId });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:shapeUpdate', payload);
    // excludeSender=true — updateSelectedShape() (opacity/qalinlik/rang
    // slайderlari) ham frontend'da optimistic update qiladi.
    this.broadcaster.toRoom(sessionId, 'stroke:shapeUpdate', payload, true);
    this.onBoardMutation(s);
  }

  // Undo/redo: yagona, ikkala board mode uchun UMUMIY tarixdan eng
  // oxirgi (yoki keyingi) harakatni oladi va uning teskarisini (yoki
  // o'ziniki) qo'llaydi — sahifa/panel qaysi bo'lishidan qat'i nazar.
  undo(sessionId: string, userId: string): void {
    const s = this.requireHost(sessionId, userId);
    if (!s.undoStack || s.undoStack.length === 0) return;

    const firstEntry = s.undoStack.pop()!;
    const groupId = firstEntry.groupId;
    const batch: ClassroomUndoEntry[] = [firstEntry];

    if (groupId) {
      while (s.undoStack.length > 0 && s.undoStack[s.undoStack.length - 1].groupId === groupId) {
        batch.push(s.undoStack.pop()!);
      }
    }

    for (const entry of batch) {
      this.applyUndoEntry(s, entry, 'undo');
    }
    if (!s.redoStack) s.redoStack = [];
    s.redoStack.push(...batch);

    s.currentPage = firstEntry.page;
    s.boardMode = firstEntry.mode;

    const entriesPayload = batch.map((entry) => ({
      mode: entry.mode,
      page: entry.page,
      entryType: entry.type,
      strokeId: entry.strokeId,
      pane: entry.pane,
      before: entry.before,
      after: entry.after,
    }));

    const payload = {
      mode: firstEntry.mode,
      page: firstEntry.page,
      entryType: firstEntry.type,
      strokeId: firstEntry.strokeId,
      pane: firstEntry.pane,
      before: firstEntry.before,
      after: firstEntry.after,
      entries: entriesPayload,
    };
    this.recordHistoryEvent(s, 'board:undo', payload);
    this.broadcaster.toRoom(s.id, 'board:undo', payload);
    this.onBoardMutation(s);
  }

  redo(sessionId: string, userId: string): void {
    const s = this.requireHost(sessionId, userId);
    if (!s.redoStack || s.redoStack.length === 0) return;

    const firstEntry = s.redoStack.pop()!;
    const groupId = firstEntry.groupId;
    const batch: ClassroomUndoEntry[] = [firstEntry];

    if (groupId) {
      while (s.redoStack.length > 0 && s.redoStack[s.redoStack.length - 1].groupId === groupId) {
        batch.push(s.redoStack.pop()!);
      }
    }

    for (const entry of batch) {
      this.applyUndoEntry(s, entry, 'redo');
    }
    if (!s.undoStack) s.undoStack = [];
    s.undoStack.push(...batch);

    s.currentPage = firstEntry.page;
    s.boardMode = firstEntry.mode;

    const entriesPayload = batch.map((entry) => ({
      mode: entry.mode,
      page: entry.page,
      entryType: entry.type,
      strokeId: entry.strokeId,
      pane: entry.pane,
      before: entry.before,
      after: entry.after,
    }));

    const payload = {
      mode: firstEntry.mode,
      page: firstEntry.page,
      entryType: firstEntry.type,
      strokeId: firstEntry.strokeId,
      pane: firstEntry.pane,
      before: firstEntry.before,
      after: firstEntry.after,
      entries: entriesPayload,
    };
    this.recordHistoryEvent(s, 'board:redo', payload);
    this.broadcaster.toRoom(s.id, 'board:redo', payload);
    this.onBoardMutation(s);
  }

  private applyUndoEntry(s: ClassroomSession, entry: ClassroomUndoEntry, direction: 'undo' | 'redo'): void {
    switch (entry.type) {
      case 'stroke:add':
        applyStrokeAddInverse(s, entry.mode, entry.page, entry.after as { stroke: ClassroomStroke }, direction);
        break;
      case 'stroke:erase':
        applyStrokeEraseInverse(s, entry.mode, entry.page, entry.before as { stroke: ClassroomStroke; index: number }, direction);
        break;
      case 'stroke:split':
        applyStrokeSplitInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as { stroke: ClassroomStroke; index: number },
          after: entry.after as { replacements: ClassroomStroke[] },
        }, direction);
        break;
      case 'stroke:transform':
        applyStrokeTransformInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number },
          after: entry.after as { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number },
        }, direction);
        break;
      case 'stroke:style':
        applyStrokeStyleInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as Partial<ClassroomStroke>,
          after: entry.after as Partial<ClassroomStroke>,
        }, direction);
        break;
      case 'stroke:text':
        applyStrokeTextInverse(s, entry.mode, entry.page, {
          strokeId: entry.strokeId!,
          before: entry.before as ClassroomStroke | null,
          after: entry.after as ClassroomStroke,
        }, direction);
        break;
      case 'stroke:reorder':
        applyStrokeReorderInverse(s, entry.mode, entry.page, {
          before: entry.before as { order: string[] },
          after: entry.after as { order: string[] },
        }, direction);
        break;
      case 'page:clear':
        applyPageClearInverse(s, entry.mode, entry.page, entry.before as { strokes: ClassroomStroke[] }, direction);
        break;
      case 'notebook:pageStyle':
        applyNotebookPageStyleInverse(s, entry.page, {
          before: entry.before as { style: ClassroomNotebookStyle },
          after: entry.after as { style: ClassroomNotebookStyle },
        }, direction);
        break;
      case 'page:remove':
        applyPageRemoveInverse(s, entry.mode, entry.before as { pageIndex: number; page: ClassroomPageSnapshot }, direction);
        break;
      case 'page:insert':
        applyPageInsertInverse(s, entry.mode, entry.after as { afterPageIndex: number; pages?: string[]; style?: ClassroomNotebookStyle }, direction);
        break;
    }
  }

  // Stroke-eraser asbobi: sichqoncha ustidan o'tgan chizmani ID bo'yicha
  // to'g'ridan-to'g'ri o'chiradi (undo kabi faqat oxirgisini emas).
  eraseStroke(sessionId: string, userId: string, page: number, strokeId: string, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const list = map.get(page) ?? [];
    const index = list.findIndex((item) => item.id === strokeId);
    const strokeBeforeErase = index !== -1 ? list[index] : undefined;
    const erased = eraseStrokeById(s, page, strokeId, map);
    s.boardMode = previousMode;
    if (erased) {
      if (index !== -1) pushUndoEntry(s, { type: 'stroke:erase', mode, page, pane, before: { stroke: strokeBeforeErase, index }, after: null, groupId });
      const payload = { page, strokeId, pane, mode };
      this.recordHistoryEvent(s, 'stroke:undo', payload);
      this.broadcaster.toRoom(sessionId, 'stroke:undo', payload);
      this.onBoardMutation(s);
    }
  }

  // Layer tartibini o'zgartirish: send-to-back/send-backward/bring-forward/
  // bring-to-front. Guruh (lasso) uchun bir nechta strokeIds birga keladi.
  reorderStroke(
    sessionId: string, userId: string, page: number, strokeIds: string[],
    op: 'front' | 'back' | 'forward' | 'backward',
    mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const beforeOrder = (map.get(page) ?? []).map((item) => item.id);
    const accepted = reorderStrokesInSession(s, page, strokeIds, op, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    const afterOrder = (map.get(page) ?? []).map((item) => item.id);
    pushUndoEntry(s, { type: 'stroke:reorder', mode, page, pane, before: { order: beforeOrder }, after: { order: afterOrder } });
    const payload = { page, strokeIds, op, pane, mode };
    this.recordHistoryEvent(s, 'stroke:reorder', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:reorder', payload);
    this.onBoardMutation(s);
  }

  // Pixel-eraser: bitta chizmaning faqat teginilgan qismini "kesib"
  // o'chiradi — qolgan uzluksiz bo'laklari yangi alohida chizmalar bo'lib qoladi.
  splitStroke(
    sessionId: string, userId: string, page: number, strokeId: string, replacements: ClassroomStroke[],
    mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string,
  ): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const list = map.get(page) ?? [];
    const index = list.findIndex((item) => item.id === strokeId);
    const strokeBeforeSplit = index !== -1 ? list[index] : undefined;

    const accepted = splitStrokeInSession(s, page, strokeId, replacements, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    if (strokeBeforeSplit) {
      pushUndoEntry(s, {
        type: 'stroke:split',
        mode,
        page,
        pane,
        strokeId,
        before: { stroke: strokeBeforeSplit, index },
        after: { replacements },
        groupId,
      });
    }
    const payload = { page, strokeId, replacements, pane, mode };
    this.recordHistoryEvent(s, 'stroke:split', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:split', payload);
    this.onBoardMutation(s);
  }

  clearPage(sessionId: string, userId: string, page: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left', groupId?: string): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const strokesBeforeClear = [...(map.get(page) ?? [])];

    const modeLabel = mode === 'notebook' ? 'Daftar' : 'PDF';

    // 1. Tozalashdan oldingi holatni DARXOL sinxron snapshot qilib olamiz:
    if (strokesBeforeClear.length > 0) {
      const snapshotBeforeClear = this.buildBoardSnapshot(s);
      void this.createBoardVersionCheckpoint(
        s.id,
        `Tozalashdan oldin (${modeLabel}, ${page}-sahifa)`,
        snapshotBeforeClear,
      ).catch(() => {});
    }

    clearPageStrokes(s, page, map);
    s.boardMode = previousMode;

    if (strokesBeforeClear.length > 0) {
      pushUndoEntry(s, {
        type: 'page:clear',
        mode,
        page,
        pane,
        before: { strokes: strokesBeforeClear },
        after: null,
        groupId,
      });
    }

    const payload = { page, pane, mode };
    this.recordHistoryEvent(s, 'page:clear', payload);
    this.broadcaster.toRoom(sessionId, 'page:clear', payload);
    this.onBoardMutation(s);
  }

  clearBoard(sessionId: string, userId: string): void {
    const s = this.requireHost(sessionId, userId);

    // 1. Tozalashdan oldingi holatni DARXOL sinxron snapshot qilib olamiz:
    const snapshotBeforeClear = this.buildBoardSnapshot(s);

    let totalStrokes = 0;
    if (s.strokesByMode) {
      for (const map of s.strokesByMode.values()) {
        for (const list of map.values()) totalStrokes += list?.length ?? 0;
      }
    }
    if (totalStrokes === 0) {
      for (const list of s.strokesByPage.values()) totalStrokes += list?.length ?? 0;
    }

    // Agar doskada chizmalar bo'lsa, tozalashdan oldingi versiyani saqlaymiz:
    if (totalStrokes > 0) {
      void this.createBoardVersionCheckpoint(
        s.id,
        'Tozalashdan oldin (Butun doska)',
        snapshotBeforeClear,
      ).catch(() => {});
    }

    // 2. Barcha rejimlardagi barcha sahifalar chizmalarini tozalaymiz:
    s.strokesByPage.clear();
    if (!s.strokesByMode) {
      s.strokesByMode = new Map();
    }
    s.strokesByMode.set('pdf', new Map());
    s.strokesByMode.set('notebook', new Map());
    s.undoStack = [];
    s.redoStack = [];

    const payload = {};
    this.recordHistoryEvent(s, 'board:clear', payload);
    this.broadcaster.toRoom(sessionId, 'board:clear', payload);
    this.onBoardMutation(s);
  }

  pointer(sessionId: string, userId: string, page: number, x: number, y: number, active: boolean, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const payload = { page, x, y, active, pane };
    this.recordHistoryEvent(s, 'pointer:move', payload);
    this.broadcaster.toRoom(s.id, 'pointer:move', payload);
  }

  // Ustozning zoom darajasi — kech kirgan o'quvchiga snapshot orqali,
  // hozir ulangan o'quvchilarga esa broadcast orqali yetkaziladi.
  setZoom(sessionId: string, userId: string, zoom: number, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const clamped = Math.min(4, Math.max(0.5, zoom));
    if (pane === 'left') s.zoom = clamped;
    else s.rightZoom = clamped;
    const payload = { zoom: clamped, pane };
    this.recordHistoryEvent(s, 'zoom:set', payload);
    this.broadcaster.toRoom(s.id, 'zoom:set', payload);
  }

  // Split panel kengligi — ustozning belgilagan nisbati (chap panel
  // ulushi). Kech kirganlarga snapshot orqali, hozir ulanganlarga
  // broadcast orqali yetkaziladi.
  setSplitRatio(sessionId: string, userId: string, ratio: number): void {
    const s = this.requireHost(sessionId, userId);
    const clamped = Number.isFinite(ratio) ? Math.min(0.8, Math.max(0.2, ratio)) : 0.5;
    s.splitRatio = clamped;
    const payload = { ratio: clamped };
    this.recordHistoryEvent(s, 'splitRatio:set', payload);
    this.broadcaster.toRoom(s.id, 'splitRatio:set', payload);
  }

  // Bitta sahifani (PDF yoki daftar) darsdan olib tashlaydi — undan
  // keyingi sahifalar va ularning chizmalari bittaga siljiydi.
  removePage(sessionId: string, userId: string, mode: 'pdf' | 'notebook', pageIndex: number, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const map = strokeMapFor(s, mode);
    const pageStrokes = map.get(pageIndex) ?? [];
    const pageSnapshot: ClassroomPageSnapshot = {
      url: mode === 'pdf' ? s.pdfPages[pageIndex - 1] : undefined,
      notebookStyle: mode === 'notebook' ? resolveNotebookPageStyle(s, pageIndex) : undefined,
      notebookOrientation: mode === 'notebook' ? resolveNotebookPageOrientation(s, pageIndex) : undefined,
      strokes: pageStrokes,
    };

    // Agar o'chirilayotgan sahifada chizmalar bo'lsa, o'chirishdan oldin versiya saqlaymiz:
    if (pageStrokes.length > 0) {
      const snapshotBeforeRemove = this.buildBoardSnapshot(s);
      const modeLabel = mode === 'notebook' ? 'Daftar' : 'PDF';
      void this.createBoardVersionCheckpoint(
        s.id,
        `Sahifa o'chirishdan oldin (${modeLabel}, ${pageIndex}-sahifa)`,
        snapshotBeforeRemove,
      ).catch(() => {});
    }

    const ok = removePageFromSession(s, mode, pageIndex);
    if (!ok) throw new Error('INVALID_PAGE_REMOVAL');
    pushUndoEntry(s, { type: 'page:remove', mode, page: pageIndex, pane, before: { pageIndex, page: pageSnapshot }, after: null });
    const payload = { mode, pageIndex, pane };
    this.recordHistoryEvent(s, 'page:remove', payload);
    this.broadcaster.toRoom(s.id, 'page:remove', payload);
    this.onBoardMutation(s);
  }

  // Daftarga yangi (bo'sh) sahifa qo'shadi — afterPageIndex'dan keyingi
  // sahifalar va ularning chizmalari/naqshlari bittaga yuqoriga siljiydi.
  insertNotebookPage(
    sessionId: string,
    userId: string,
    afterPageIndex: number,
    style: ClassroomNotebookStyle,
    orientation: ClassroomNotebookOrientation = 'portrait',
    pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    const ok = insertNotebookPageIntoSession(s, afterPageIndex, style, orientation);
    if (!ok) throw new Error('INVALID_PAGE_INSERT');
    pushUndoEntry(s, { type: 'page:insert', mode: 'notebook', page: afterPageIndex + 1, pane, before: null, after: { afterPageIndex, style, orientation } });
    const payload = { mode: 'notebook' as const, afterPageIndex, style, orientation, pane };
    this.recordHistoryEvent(s, 'page:insert', payload);
    this.broadcaster.toRoom(s.id, 'page:insert', payload);
    this.onBoardMutation(s);
  }

  pastePage(
    sessionId: string,
    userId: string,
    mode: 'pdf' | 'notebook',
    afterPageIndex: number,
    pageUrl: string | undefined,
    style: ClassroomNotebookStyle,
    orientation: ClassroomNotebookOrientation,
    strokes: ClassroomStroke[],
    pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    if (
      !Array.isArray(strokes) ||
      strokes.length > 5000 ||
      strokes.some((stroke) =>
        !stroke ||
        typeof stroke.tool !== 'string' ||
        !Array.isArray(stroke.points) ||
        stroke.points.some((point) => typeof point !== 'number' || !Number.isFinite(point)),
      )
    ) throw new Error('INVALID_PAGE_CLIPBOARD');

    if (mode === 'pdf') {
      if (!pageUrl || pageUrl.length > 5000) throw new Error('INVALID_PAGE_URL');
      if (!insertPdfPagesIntoSession(s, [pageUrl], afterPageIndex)) throw new Error('INVALID_PAGE_INSERT');
    } else if (!insertNotebookPageIntoSession(s, afterPageIndex, style, orientation)) {
      throw new Error('INVALID_PAGE_INSERT');
    }

    const page = afterPageIndex + 1;
    // Connectorlar (startBinding, endBinding) nusxalangan shakllarning yangi
    // ID lariga to'g'ri bog'lanib qolishi uchun barcha ID larni remap qilamiz.
    const idMap = new Map<string, string>();
    for (const stroke of strokes) {
      if (stroke?.id) {
        idMap.set(stroke.id, crypto.randomUUID());
      }
    }

    const copiedStrokes = strokes.map((stroke) => {
      const newId = idMap.get(stroke.id) ?? crypto.randomUUID();
      const startBinding = stroke.startBinding
        ? {
            ...stroke.startBinding,
            strokeId: idMap.get(stroke.startBinding.strokeId) ?? stroke.startBinding.strokeId,
          }
        : undefined;
      const endBinding = stroke.endBinding
        ? {
            ...stroke.endBinding,
            strokeId: idMap.get(stroke.endBinding.strokeId) ?? stroke.endBinding.strokeId,
          }
        : undefined;

      return {
        ...stroke,
        id: newId,
        points: [...stroke.points],
        startBinding,
        endBinding,
      };
    });
    strokeMapFor(s, mode).set(page, copiedStrokes);

    if (mode === 'pdf') {
      pushUndoEntry(s, { type: 'page:insert', mode, page, pane, before: null, after: { afterPageIndex, pages: [pageUrl] } });
      const payload = { pages: [pageUrl], afterPageIndex };
      this.recordHistoryEvent(s, 'page:insert', { mode, ...payload, pane });
      this.broadcaster.toRoom(s.id, 'pdf:insert', payload);
    } else {
      pushUndoEntry(s, { type: 'page:insert', mode, page, pane, before: null, after: { afterPageIndex, style, orientation } });
      const payload = { mode, afterPageIndex, style, orientation, pane };
      this.recordHistoryEvent(s, 'page:insert', payload);
      this.broadcaster.toRoom(s.id, 'page:insert', payload);
    }
    for (const stroke of copiedStrokes) {
      this.broadcaster.toRoom(s.id, 'stroke:add', { page, stroke, mode, pane });
    }
    this.onBoardMutation(s);
  }

  setNotebookPageStyle(sessionId: string, userId: string, page: number, style: ClassroomNotebookStyle): void {
    const s = this.requireHost(sessionId, userId);
    const count = s.notebookPageCount ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > count) throw new Error('INVALID_NOTEBOOK_PAGE');
    const oldStyle = resolveNotebookPageStyle(s, page);
    s.notebookPageStyles = { ...(s.notebookPageStyles ?? {}), [page]: style };
    if (page === 1) {
      s.notebookStyle = style;
    }
    pushUndoEntry(s, {
      type: 'notebook:pageStyle',
      mode: 'notebook',
      page,
      pane: 'left',
      before: { style: oldStyle },
      after: { style },
    });
    const payload = { page, style };
    this.recordHistoryEvent(s, 'notebook:pageStyle', payload);
    this.broadcaster.toRoom(s.id, 'notebook:pageStyle', payload);
    this.onBoardMutation(s);
  }

  // Ustozning scroll pozitsiyasi — sahifa raqami + o'sha sahifa balandligi
  // ichidagi nisbiy joy (0..1). Session holatiga saqlanadi (kech kirgan
  // o'quvchi snapshot orqali darhol to'g'ri joyni oladi), va hozir
  // ulanganlarga live broadcast qilinadi.
  scroll(sessionId: string, userId: string, page: number, yRatio: number, pane: 'left' | 'right' = 'left', xRatio = 0): void {
    const s = this.requireHost(sessionId, userId);
    if (!isValidPage(s, page)) throw new Error('INVALID_PAGE');
    const cy = Math.min(1, Math.max(0, yRatio));
    const cx = Math.min(1, Math.max(0, Number.isFinite(xRatio) ? xRatio : 0));
    const position = { page, yRatio: cy, xRatio: cx };
    if (pane === 'left') s.scroll = position;
    else s.rightScroll = position;
    const payload = { ...position, pane };
    this.recordHistoryEvent(s, 'scroll:set', payload);
    this.broadcaster.toRoom(s.id, 'scroll:set', payload);
  }

  // ---------- REST: ro'yxatlar / davomat ----------

  async listActiveForUser(userId: string, role: string) {
    return this.lifecycleSvc.listActiveForUser(userId, role, this.sessions);
  }

  async getSessionWithAttendance(sessionId: string, callerId: string, role: string) {
    return this.lifecycleSvc.getSessionWithAttendance(sessionId, callerId, role, this.sessions);
  }

  async getReplay(sessionId: string, callerId: string, recordingId?: string) {
    return this.replaySvc.getReplay(sessionId, callerId, recordingId);
  }

  async autoTranscribeReplayAudio(sessionId: string, audioUrl: string, recordingId?: string) {
    return this.replaySvc.autoTranscribeReplayAudio(sessionId, audioUrl, recordingId);
  }

  async deleteSession(sessionId: string, callerId: string, callerRole = 'teacher'): Promise<void> {
    return this.lifecycleSvc.deleteSession(sessionId, callerId, callerRole);
  }

  // ---------- REST: ro'yxatlar / davomat (Delegated to ClassroomAttendanceService) ----------

  async courseHistory(courseId: string, callerId: string, role: string) {
    return this.attendanceSvc.courseHistory(courseId, callerId, role);
  }

  async myFreeSessionHistory(teacherId: string) {
    return this.attendanceSvc.myFreeSessionHistory(teacherId);
  }

  async myClassSessions(studentId: string) {
    return this.attendanceSvc.myClassSessions(studentId);
  }

  async overrideAttendance(recordId: string, adminId: string, role: string, status: string) {
    return this.attendanceSvc.overrideAttendance(recordId, adminId, role, status);
  }

  // ---------- Ovoz (LiveKit) ----------

  async startSessionRecording(sessionId: string, userId: string, mode: ClassroomRecordingMode): Promise<void> {
    const session = this.requireSessionHttp(sessionId);
    if (session.hostUserId !== userId) throw new ForbiddenException();
    session.recordingMode = mode;
    // 'boardSilent' rejimida ovoz umuman yozilmaydi — LiveKit egress
    // ishga tushirilmaydi, sessiya tugaganda faqat board_snapshot yoziladi.
    if (mode === 'full' || mode === 'boardAudio') {
      await this.recording.startRecording(sessionId, session.startedAtMs);
    }
  }

  // Sessiya tugagan ondagi doskaning yakuniy holatini "faqat chizma"
  // rejimlari uchun jsonb'ga saqlanadigan shaklga keltiradi — buildSnapshot
  // bilan bir xil manba (jonli sinxronizatsiyada ham ishlatiladi), faqat
  // participants/zoom/scroll kabi replay uchun keraksiz maydonlar olib
  // tashlanadi.
  buildBoardSnapshot(s: ClassroomSession): ClassroomBoardSnapshot {
    return this.snapshotSvc.buildBoardSnapshot(s);
  }

  async voiceToken(sessionId: string, userId: string, displayName: string): Promise<{ token: string; url: string }> {
    const s = this.requireSessionHttp(sessionId);
    return this.voiceSvc.createVoiceToken(s, userId, displayName);
  }

  async muteParticipant(sessionId: string, teacherId: string, targetUserId: string): Promise<void> {
    const s = this.requireSessionHttp(sessionId);
    return this.voiceSvc.muteParticipant(s, teacherId, targetUserId);
  }

  private recordHistoryEvent(s: ClassroomSession, type: string, payload: unknown): void {
    if (!s.historyEvents) s.historyEvents = [];
    if (type === 'scroll:set' || type === 'zoom:set' || type === 'pointer:move') {
      const last = s.historyEvents[s.historyEvents.length - 1];
      const nowMs = Date.now() - s.startedAtMs;
      if (last && last.type === type && (nowMs - last.atMs < 200)) {
        last.payload = payload;
        last.atMs = nowMs;
        return;
      }
    }
    s.historyEvents.push({ type, payload, atMs: Date.now() - s.startedAtMs });
  }

  recordReaction(sessionId: string, userId: string, userName: string, emoji: string, id?: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.recordHistoryEvent(s, 'reaction', { id: id ?? randomUUID(), userId, userName, emoji });
  }

  handToggle(sessionId: string, userId: string, userName: string): ClassroomRaisedHand[] {
    const s = this.requireSession(sessionId);
    if (!s.raisedHands) s.raisedHands = [];
    const idx = s.raisedHands.findIndex((h) => h.userId === userId);
    if (idx >= 0) {
      s.raisedHands.splice(idx, 1);
      this.recordHistoryEvent(s, 'hand_lower', { userId, userName });
    } else {
      s.raisedHands.push({ userId, userName, raisedAt: Date.now() });
      this.recordHistoryEvent(s, 'hand_raise', { userId, userName });
    }
    return s.raisedHands;
  }

  handLowerAll(sessionId: string): ClassroomRaisedHand[] {
    const s = this.requireSession(sessionId);
    s.raisedHands = [];
    this.recordHistoryEvent(s, 'hand_lower_all', {});
    return [];
  }

  handLowerUser(sessionId: string, userId: string): ClassroomRaisedHand[] {
    const s = this.requireSession(sessionId);
    if (!s.raisedHands) s.raisedHands = [];
    s.raisedHands = s.raisedHands.filter((h) => h.userId !== userId);
    this.recordHistoryEvent(s, 'hand_lower', { userId });
    return s.raisedHands;
  }

  // Faqat testlar uchun — xotiradagi tarix massivini to'g'ridan-to'g'ri o'qiydi.
  getHistoryEventsForTests(sessionId: string): ClassroomHistoryEvent[] {
    return this.sessions.get(sessionId)?.historyEvents ?? [];
  }

  // Faqat testlar uchun — xotiradagi undo/redo steklarini to'g'ridan-to'g'ri o'qiydi.
  getUndoStackForTests(sessionId: string): ClassroomUndoEntry[] {
    return this.sessions.get(sessionId)?.undoStack ?? [];
  }

  getRedoStackForTests(sessionId: string): ClassroomUndoEntry[] {
    return this.sessions.get(sessionId)?.redoStack ?? [];
  }

  // ---------- Yordamchilar ----------

  private async getOrRestoreSession(sessionId: string, restoringHostId?: string): Promise<ClassroomSession | null> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: {
          with: { owner: true },
        },
        teacher: true,
      },
    });
    if (!row) {
      this.logger.warn(`getOrRestoreSession(${sessionId}): DB'da qator topilmadi`);
      return null;
    }
    {
      const snap = row.boardSnapshot as any;
      let strokeCount = 0;
      if (snap?.strokesByMode) {
        for (const m of Object.values(snap.strokesByMode as Record<string, Record<string, any[]>>)) {
          for (const list of Object.values(m)) strokeCount += list?.length ?? 0;
        }
      }
      this.logger.log(
        `getOrRestoreSession(${sessionId}): DB'dan tiklanmoqda, status=${row.status}, isBoard=${row.isBoard}, strokeCount=${strokeCount}, savedVersions=${(snap?.savedVersions ?? []).length}`,
      );
    }
    if (row.status !== 'active') {
      const isBoard = row.isBoard === true || (row.courseId === null && row.title !== null);
      const isOwner = restoringHostId && (row.teacherId === restoringHostId || row.course?.adminId === restoringHostId);
      const isFreeSession = row.courseId === null;

      // Doska (isBoard) har doim qayta ochiladi (hujjat).
      // Erkin dars (isFreeSession) egasi kirganda qayta ochiladi.
      const canRestore = isBoard || (isFreeSession && isOwner);
      if (!canRestore) return null;
      await db.update(classSessions)
        .set({ status: 'active', endedAt: null })
        .where(eq(classSessions.id, sessionId));
    }

    const isStandaloneBoard = row.isBoard === true || (row.courseId === null && !row.pdfName);
    const defaultMode: ClassroomBoardMode = isStandaloneBoard ? 'notebook' : 'pdf';

    const snapshot = (row.boardSnapshot as unknown as ClassroomBoardSnapshot) ?? {
      pdfName: row.pdfName ?? null,
      pages: row.pdfPages ?? [],
      strokesByPage: {},
      rightStrokesByPage: {},
      boardMode: defaultMode,
      boardLayout: 'single',
      notebookPageCount: 1,
    };

    const strokesByMode = new Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>>([
      ['pdf', new Map()],
      ['notebook', new Map()],
    ]);

    const snapshotStrokesByMode = (snapshot as any).strokesByMode as Record<ClassroomBoardMode, Record<number, ClassroomStroke[]>> | undefined;
    if (snapshotStrokesByMode) {
      if (snapshotStrokesByMode.pdf) {
        strokesByMode.set('pdf', new Map(Object.entries(snapshotStrokesByMode.pdf).map(([p, s]) => [Number(p), s])));
      }
      if (snapshotStrokesByMode.notebook) {
        strokesByMode.set('notebook', new Map(Object.entries(snapshotStrokesByMode.notebook).map(([p, s]) => [Number(p), s])));
      }
    } else {
      strokesByMode.set(snapshot.boardMode ?? 'pdf', new Map(
        Object.entries(snapshot.strokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
      ));
      if (snapshot.rightBoardMode && snapshot.rightBoardMode !== snapshot.boardMode) {
        strokesByMode.set(snapshot.rightBoardMode, new Map(
          Object.entries(snapshot.rightStrokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
        ));
      }
    }
    const boardMode = snapshot.boardMode ?? 'pdf';
    const primaryStrokes = strokesByMode.get(boardMode) ?? new Map();

    const isFree = row.courseId === null;
    const session: ClassroomSession = {
      id: row.id,
      courseId: row.courseId,
      courseName: row.course?.title ?? null,
      title: row.title ?? null,
      attachedBoardId: row.attachedBoardId ?? null,
      isFree,
      isBoard: row.isBoard === true,
      hostUserId: row.teacherId ?? row.course?.adminId ?? '',
      hostSocketId: null,
      hostName: row.teacher?.displayName ?? row.course?.owner?.displayName ?? "Ustoz",
      pdfName: snapshot.pdfName ?? row.pdfName ?? null,
      pdfPages: snapshot.pages ?? row.pdfPages ?? [],
      currentPage: 1,
      strokesByPage: primaryStrokes,
      boardMode,
      boardLayout: snapshot.boardLayout ?? 'single',
      leftBoardMode: snapshot.leftBoardMode ?? boardMode,
      rightBoardMode: snapshot.rightBoardMode ?? boardMode,
      classroomTheme: 'light',
      notebookStyle: snapshot.notebookStyle ?? 'grid',
      notebookPageCount: snapshot.notebookPageCount ?? 1,
      notebookPageStyles: snapshot.notebookPageStyles ?? {},
      notebookPageOrientations: snapshot.notebookPageOrientations ?? {},
      strokesByMode,
      participants: new Map(),
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  private async requireSessionAsync(sessionId: string): Promise<ClassroomSession> {
    const s = await this.getOrRestoreSession(sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    return s;
  }

  private async requireSessionHttpAsync(sessionId: string): Promise<ClassroomSession> {
    const s = await this.getOrRestoreSession(sessionId);
    if (!s) throw new NotFoundException('Jonli dars topilmadi yoki tugagan');
    return s;
  }

  private requireSession(sessionId: string): ClassroomSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    return s;
  }

  // REST yo'llari uchun HTTP-xatoli variant
  private requireSessionHttp(sessionId: string): ClassroomSession {
    const s = this.sessions.get(sessionId);
    if (!s) throw new NotFoundException('Jonli dars topilmadi yoki tugagan');
    return s;
  }

  private requireHost(sessionId: string, userId: string): ClassroomSession {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== userId) throw new Error('FORBIDDEN');
    return s;
  }

  private deserializeStrokesByMode(
    snapshot: ClassroomBoardSnapshot,
  ): Map<ClassroomBoardMode, Map<number, ClassroomStroke[]>> {
    return this.snapshotSvc.deserializeStrokesByMode(snapshot);
  }
}
