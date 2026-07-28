import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '../db';
import { attendanceRecords, classSessions, contentBlocks, courses, freeSessionParticipants, groupEnrollments, groups, mediaAssets, schoolMembers, users } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { MediaLibraryService } from '../upload/media-library.service';
import { ClassroomRecordingService } from './classroom-recording.service';
import {
  addStroke, attendanceStatusOnJoin, buildSnapshot, clearPage as clearPageStrokes,
  closeInterval, eraseStroke as eraseStrokeById, HOST_GRACE_MS, insertNotebookPageIntoSession, insertPdfPagesIntoSession, isValidPage,
  pushUndoEntry, removePageFromSession,
  reorderStrokes as reorderStrokesInSession, resolveNotebookPageStyle,
  setPage as setSessionPage, splitStroke as splitStrokeInSession, strokeMapFor, switchBoardMode, undoStroke,
  updateShapeStroke as updateShapeStrokeInSession,
  updateStrokePosition, updateTextStroke as updateTextStrokeInSession,
} from './classroom.logic';
import {
  AttendanceStatus, ClassroomBoardMode, ClassroomBoardSnapshot, ClassroomBroadcaster, ClassroomHistoryEvent, ClassroomNotebookStyle,
  ClassroomPageSnapshot, ClassroomParticipant, ClassroomRecordingMode, ClassroomSession, ClassroomSnapshot, ClassroomStroke, ClassroomUndoEntry,
} from './classroom.types';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['absent', 'present', 'late'];

@Injectable()
export class ClassroomService implements OnModuleInit {
  private sessions = new Map<string, ClassroomSession>();
  private broadcaster: ClassroomBroadcaster = { toRoom: () => {}, toSocket: () => {} };

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly mediaLibrary: MediaLibraryService,
    private readonly recording: ClassroomRecordingService,
  ) {}

  setBroadcaster(b: ClassroomBroadcaster) {
    this.broadcaster = b;
  }

  // Server restartda xotira holati yo'qoladi — osilib qolgan sessiyalarni yopamiz
  async onModuleInit() {
    await db.update(classSessions)
      .set({ status: 'ended', endedAt: new Date() })
      .where(eq(classSessions.status, 'active'));
  }

  // ---------- REST: lifecycle ----------

  // Kursning barcha guruhlaridagi aktiv enrollmentlari — bitta darsni butun
  // kursga o'tish mumkin bo'lishi kerak, guruhga cheklab bo'lmaydi.
  private async loadCourseEnrollments(courseId: string) {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return [];
    const groupIds = courseGroups.map((g) => g.id);
    return db.query.groupEnrollments.findMany({
      where: and(inArray(groupEnrollments.groupId, groupIds), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: { with: { student: true } } },
    });
  }

  async createSession(courseId: string, teacherId: string, role: string): Promise<{ id: string }> {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    if (!course) throw new NotFoundException('Kurs topilmadi');
    if (role !== 'super' && course.adminId !== teacherId) {
      throw new ForbiddenException('Bu kurs sizga tegishli emas');
    }

    for (const s of this.sessions.values()) {
      if (s.courseId === courseId) throw new ConflictException('Bu kursda jonli dars allaqachon ochiq');
    }
    // Restartdan qolgan stale row bo'lsa yopib qo'yamiz
    const staleRow = await db.query.classSessions.findFirst({
      where: and(eq(classSessions.courseId, courseId), eq(classSessions.status, 'active')),
    });
    if (staleRow) {
      await db.update(classSessions)
        .set({ status: 'ended', endedAt: new Date() })
        .where(eq(classSessions.id, staleRow.id));
    }

    const [row] = await db.insert(classSessions).values({ courseId, teacherId }).returning();

    const enrollments = await this.loadCourseEnrollments(courseId);

    if (enrollments.length > 0) {
      await db.insert(attendanceRecords)
        .values(enrollments.map((e) => ({ sessionId: row.id, enrollmentId: e.id })))
        .onConflictDoNothing();
    }

    const participants = new Map<string, ClassroomParticipant>();
    for (const e of enrollments) {
      const member = e.schoolMember as unknown as { studentId: string; student: { displayName: string } };
      participants.set(member.studentId, {
        userId: member.studentId,
        name: member.student.displayName,
        enrollmentId: e.id,
        socketId: null,
        joinedAtMs: null,
        totalSeconds: 0,
        status: 'absent',
      });
    }

    this.sessions.set(row.id, {
      id: row.id,
      courseId,
      courseName: course.title,
      isFree: false,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      boardMode: 'pdf',
      boardLayout: 'single', leftBoardMode: 'pdf', rightBoardMode: 'pdf',
      classroomTheme: 'light',
      notebookStyle: 'grid',
      strokesByMode: new Map([['pdf', new Map()]]),
      participants,
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    });

    return { id: row.id };
  }

  // Erkin (guruhsiz) dars: kursga, guruhga, enrollmentga umuman bog'liq
  // emas. DB'ga hech qanday yozuv qilinmaydi — session faqat xotirada
  // yashaydi, server qayta ishga tushsa yoki dars tugasa butunlay yo'qoladi.
  // Istalgan kishi (login qilgan yoki anonim mehmon) havola orqali kira oladi.
  async createFreeSession(teacherId: string): Promise<{ id: string }> {
    const [row] = await db.insert(classSessions).values({ courseId: null, teacherId }).returning();
    this.sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      boardMode: 'pdf',
      boardLayout: 'single', leftBoardMode: 'pdf', rightBoardMode: 'pdf',
      classroomTheme: 'light',
      notebookStyle: 'grid',
      strokesByMode: new Map([['pdf', new Map()]]),
      participants: new Map(),
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    });
    return { id: row.id };
  }

  // Kutubxonadagi (allaqachon WebP'ga konvertatsiya qilingan) PDF'dan
  // ustoz tanlagan sahifalarni jonli darsga qo'shadi. Konvertatsiya bu
  // yerda sodir bo'lmaydi — u kutubxonaga yuklashda bir marta bajarilgan.
  async attachPdfFromLibrary(
    sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[],
  ): Promise<{ pdfName: string; pages: string[] }> {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== teacherId) throw new ForbiddenException('Faqat dars ustozi PDF yuklay oladi');

    const { pages: allPages, status } = await this.mediaLibrary.getPdfPages(mediaAssetId, teacherId, teacherRole);
    if (status !== 'ready') {
      throw new ConflictException("PDF hali tayyor emas — konvertatsiya tugashini kuting");
    }
    if (allPages.length === 0) {
      throw new ConflictException('PDF sahifalari topilmadi');
    }

    const uniqueSorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (uniqueSorted.some((n) => !Number.isInteger(n) || n < 1 || n > allPages.length)) {
      throw new ConflictException("Noto'g'ri sahifa raqami tanlangan");
    }
    const selectedPages = uniqueSorted.map((n) => allPages[n - 1]);

    const asset = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, mediaAssetId) });
    const pdfName = asset?.originalName ?? 'dars.pdf';

    await db.update(classSessions)
      .set({ pdfName, pdfPages: selectedPages })
      .where(eq(classSessions.id, sessionId));

    this.applyPdf(s, pdfName, selectedPages);
    const payload = { pdfName: s.pdfName, pages: selectedPages, currentPage: 1 };
    this.recordHistoryEvent(s, 'pdf:set', payload);
    this.broadcaster.toRoom(sessionId, 'pdf:set', payload);
    return { pdfName, pages: selectedPages };
  }

  // Kutubxonadagi (istalgan, hozirgi darsga biriktirilganidan farqli
  // bo'lishi ham mumkin) PDF'dan tanlangan sahifalarni mavjud darsga
  // QO'SHADI (attachPdfFromLibrary'dan farqli — u butun sessiyani
  // almashtiradi, bu faqat append/insert qiladi, eski sahifa/chizmalarga
  // tegmaydi). pdfName o'zgarmaydi — endi faqat ko'rgazmali (advisory)
  // yorliq, chunki sahifalar turli fayllardan aralash bo'lishi mumkin.
  async insertPdfPagesFromLibrary(
    sessionId: string, teacherId: string, teacherRole: string, mediaAssetId: string, pageNumbers: number[], afterPageIndex: number,
  ): Promise<{ pages: string[] }> {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== teacherId) throw new ForbiddenException('Faqat dars ustozi sahifa qo\'sha oladi');

    const { pages: allPages, status } = await this.mediaLibrary.getPdfPages(mediaAssetId, teacherId, teacherRole);
    if (status !== 'ready') {
      throw new ConflictException("PDF hali tayyor emas — konvertatsiya tugashini kuting");
    }
    if (allPages.length === 0) {
      throw new ConflictException('PDF sahifalari topilmadi');
    }

    const uniqueSorted = [...new Set(pageNumbers)].sort((a, b) => a - b);
    if (uniqueSorted.some((n) => !Number.isInteger(n) || n < 1 || n > allPages.length)) {
      throw new ConflictException("Noto'g'ri sahifa raqami tanlangan");
    }
    const newPages = uniqueSorted.map((n) => allPages[n - 1]);

    const ok = insertPdfPagesIntoSession(s, newPages, afterPageIndex);
    if (!ok) throw new ConflictException("Noto'g'ri qo'yish joyi");
    pushUndoEntry(s, { type: 'page:insert', mode: 'pdf', page: afterPageIndex + 1, pane: 'left', before: null, after: { afterPageIndex, pages: newPages } });

    await db.update(classSessions)
      .set({ pdfPages: s.pdfPages })
      .where(eq(classSessions.id, sessionId));

    const payload = { pages: newPages, afterPageIndex };
    this.recordHistoryEvent(s, 'pdf:insert', payload);
    this.broadcaster.toRoom(sessionId, 'pdf:insert', payload);
    return { pages: newPages };
  }

  private applyPdf(s: ClassroomSession, pdfName: string, pages: string[]) {
    s.pdfName = pdfName;
    s.pdfPages = pages;
    s.currentPage = 1;
    s.boardMode = 'pdf';
    s.boardLayout = 'single'; s.leftBoardMode = 'pdf'; s.rightBoardMode = 'pdf';
    s.strokesByPage = new Map();
    s.strokesByMode = new Map([['pdf', s.strokesByPage]]);
    s.scroll = null;
    s.rightScroll = null;
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
    };
    this.recordHistoryEvent(s, 'board:set', payload);
    this.broadcaster.toRoom(sessionId, 'board:set', payload);
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
    const historyEvents = s.recordingMode === 'full'
      ? (s.historyEvents ?? [])
      : s.recordingMode === 'boardAudio'
        ? (s.historyEvents ?? []).filter((event) =>
          event.type === 'pointer:move' ||
          event.type === 'scroll:set' ||
          event.type === 'zoom:set' ||
          event.type === 'splitRatio:set' ||
          event.type === 'page:set')
        : [];
    await db.update(classSessions)
      .set({
        status: 'ended',
        endedAt: new Date(),
        historyEvents,
        recordingMode: s.recordingMode ?? null,
        boardSnapshot,
      })
      .where(eq(classSessions.id, sessionId));
    if (s.recordingMode === 'full' || s.recordingMode === 'boardAudio') {
      void this.recording.stopRecording(s.id);
    }

    this.broadcaster.toRoom(sessionId, 'session:ended', {});
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

  // guestName faqat erkin (isFree) sessiyalarda ishlatiladi — login qilmagan
  // mehmon o'zi kiritgan ism. Login qilgan foydalanuvchi uchun esa haqiqiy
  // ismi (displayName) ishlatiladi, guestName e'tiborsiz qoldiriladi.
  async studentJoin(
    sessionId: string, userId: string, socketId: string, guestName?: string, displayName?: string,
  ): Promise<ClassroomSnapshot> {
    const s = this.requireSession(sessionId);
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
    }

    const now = Date.now();
    p.socketId = socketId;
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

  private broadcastPresence(s: ClassroomSession) {
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
    for (const s of this.sessions.values()) {
      if (s.hostSocketId === socketId) {
        s.hostSocketId = null;
        this.broadcaster.toRoom(s.id, 'host:offline', {});
        this.broadcastPresence(s);
        if (!s.hostDisconnectTimer) {
          s.hostDisconnectTimer = setTimeout(() => {
            void this.endSession(s.id, null).catch(() => {});
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
    }
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

  stroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const accepted = addStroke(s, page, stroke, strokeMapFor(s, mode));
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:add', mode, page, pane, before: null, after: { stroke } });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:add', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:add', payload);
  }

  moveStroke(sessionId: string, userId: string, page: number, strokeId: string, x: number, y: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
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
      pushUndoEntry(s, { type: 'stroke:transform', mode, page, pane, strokeId, before, after });
    }
    const payload = { page, strokeId, x, y, pane, mode };
    this.recordHistoryEvent(s, 'stroke:update', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:update', payload);
  }

  updateTextStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : null;
    const accepted = updateTextStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:text', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] } });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:textUpdate', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:textUpdate', payload);
  }

  updateShapeStroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const map = strokeMapFor(s, mode);
    const priorStroke = map.get(page)?.find((item) => item.id === stroke.id);
    const before = priorStroke ? { ...priorStroke, points: [...priorStroke.points] } : {};
    const accepted = updateShapeStrokeInSession(s, page, stroke, map);
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    pushUndoEntry(s, { type: 'stroke:style', mode, page, pane, strokeId: stroke.id, before, after: { ...stroke, points: [...stroke.points] } });
    const payload = { page, stroke, pane, mode };
    this.recordHistoryEvent(s, 'stroke:shapeUpdate', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:shapeUpdate', payload);
  }

  undo(sessionId: string, userId: string, page: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const strokeId = undoStroke(s, page, strokeMapFor(s, mode));
    s.boardMode = previousMode;
    if (strokeId) {
      const payload = { page, strokeId, pane, mode };
      this.recordHistoryEvent(s, 'stroke:undo', payload);
      this.broadcaster.toRoom(sessionId, 'stroke:undo', payload);
    }
  }

  // Stroke-eraser asbobi: sichqoncha ustidan o'tgan chizmani ID bo'yicha
  // to'g'ridan-to'g'ri o'chiradi (undo kabi faqat oxirgisini emas).
  eraseStroke(sessionId: string, userId: string, page: number, strokeId: string, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
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
      if (index !== -1) pushUndoEntry(s, { type: 'stroke:erase', mode, page, pane, before: { stroke: strokeBeforeErase, index }, after: null });
      const payload = { page, strokeId, pane, mode };
      this.recordHistoryEvent(s, 'stroke:undo', payload);
      this.broadcaster.toRoom(sessionId, 'stroke:undo', payload);
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
  }

  // Pixel-eraser: bitta chizmaning faqat teginilgan qismini "kesib"
  // o'chiradi — qolgan uzluksiz bo'laklari yangi alohida chizmalar bo'lib qoladi.
  splitStroke(
    sessionId: string, userId: string, page: number, strokeId: string, replacements: ClassroomStroke[],
    mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left',
  ): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    const accepted = splitStrokeInSession(s, page, strokeId, replacements, strokeMapFor(s, mode));
    s.boardMode = previousMode;
    if (!accepted) throw new Error('INVALID_STROKE');
    const payload = { page, strokeId, replacements, pane, mode };
    this.recordHistoryEvent(s, 'stroke:split', payload);
    this.broadcaster.toRoom(sessionId, 'stroke:split', payload);
  }

  clearPage(sessionId: string, userId: string, page: number, mode: 'pdf' | 'notebook' = 'pdf', pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const previousMode = s.boardMode;
    s.boardMode = mode;
    clearPageStrokes(s, page, strokeMapFor(s, mode));
    s.boardMode = previousMode;
    const payload = { page, pane, mode };
    this.recordHistoryEvent(s, 'page:clear', payload);
    this.broadcaster.toRoom(sessionId, 'page:clear', payload);
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
    const pageSnapshot: ClassroomPageSnapshot = {
      url: mode === 'pdf' ? s.pdfPages[pageIndex - 1] : undefined,
      notebookStyle: mode === 'notebook' ? resolveNotebookPageStyle(s, pageIndex) : undefined,
      strokes: map.get(pageIndex) ?? [],
    };
    const ok = removePageFromSession(s, mode, pageIndex);
    if (!ok) throw new Error('INVALID_PAGE_REMOVAL');
    pushUndoEntry(s, { type: 'page:remove', mode, page: pageIndex, pane, before: { pageIndex, page: pageSnapshot }, after: null });
    const payload = { mode, pageIndex, pane };
    this.recordHistoryEvent(s, 'page:remove', payload);
    this.broadcaster.toRoom(s.id, 'page:remove', payload);
  }

  // Daftarga yangi (bo'sh) sahifa qo'shadi — afterPageIndex'dan keyingi
  // sahifalar va ularning chizmalari/naqshlari bittaga yuqoriga siljiydi.
  insertNotebookPage(sessionId: string, userId: string, afterPageIndex: number, style: ClassroomNotebookStyle, pane: 'left' | 'right' = 'left'): void {
    const s = this.requireHost(sessionId, userId);
    const ok = insertNotebookPageIntoSession(s, afterPageIndex, style);
    if (!ok) throw new Error('INVALID_PAGE_INSERT');
    pushUndoEntry(s, { type: 'page:insert', mode: 'notebook', page: afterPageIndex + 1, pane, before: null, after: { afterPageIndex, style } });
    const payload = { mode: 'notebook' as const, afterPageIndex, style, pane };
    this.recordHistoryEvent(s, 'page:insert', payload);
    this.broadcaster.toRoom(s.id, 'page:insert', payload);
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
    const result: Array<{ id: string; courseId: string; courseName: string; startedAt: number }> = [];
    for (const s of this.sessions.values()) {
      // Erkin darslar bu ro'yxatda ko'rinmaydi — ularga faqat to'g'ridan-to'g'ri
      // havola orqali kirish mumkin, "faol darslarim" ro'yxatiga chiqmaydi.
      if (s.isFree) continue;
      const isHost = s.hostUserId === userId && (role === 'teacher' || role === 'super');
      const isMember = role === 'student' && s.participants.has(userId);
      if (isHost || isMember) {
        result.push({ id: s.id, courseId: s.courseId!, courseName: s.courseName!, startedAt: s.startedAtMs });
      }
    }
    return result;
  }

  async getSessionWithAttendance(sessionId: string, callerId: string, role: string) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: true,
        attendance: { with: { enrollment: { with: { schoolMember: { with: { student: true } } } } } },
      },
    });
    if (!row) throw new NotFoundException('Sessiya topilmadi');
    const course = row.course as unknown as { adminId: string; title: string };
    if (role !== 'super' && course.adminId !== callerId) throw new ForbiddenException();
    const live = this.sessions.get(sessionId);
    return {
      id: row.id,
      courseId: row.courseId,
      courseName: course.title,
      status: row.status,
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
      hasBoardSnapshot: row.boardSnapshot !== null,
      attendance: (row.attendance as unknown as Array<{
        id: string; status: string; firstJoinedAt: Date | null; lastLeftAt: Date | null;
        totalSeconds: number; overriddenByAdminId: string | null;
        enrollment: { schoolMember: { studentId: string; student: { displayName: string } } };
      }>).map((a) => {
        const memberUserId = a.enrollment.schoolMember.studentId;
        const liveParticipant = live?.participants.get(memberUserId);
        return {
          id: a.id,
          userId: memberUserId,
          name: a.enrollment.schoolMember.student.displayName,
          status: liveParticipant?.status ?? a.status,
          firstJoinedAt: a.firstJoinedAt?.toISOString() ?? null,
          lastLeftAt: a.lastLeftAt?.toISOString() ?? null,
          totalSeconds: liveParticipant
            ? liveParticipant.totalSeconds + (liveParticipant.joinedAtMs ? Math.round((Date.now() - liveParticipant.joinedAtMs) / 1000) : 0)
            : a.totalSeconds,
          overridden: a.overriddenByAdminId !== null,
        };
      }),
    };
  }

  // Bitta darsning to'liq replay ma'lumoti — chizma tarixi + audio +
  // davomat. Talaba (shu kursga yozilgan, attendance_records orqali) yoki
  // o'qituvchi (shu kurs egasi) kira oladi.
  async getReplay(sessionId: string, callerId: string) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: true,
        attendance: { with: { enrollment: { with: { schoolMember: { with: { student: true } } } } } },
      },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    // Erkin sessiyada course null bo'ladi — egalik tekshiruvi teacherId
    // orqali, guruhli sessiyada esa course.adminId orqali.
    const course = row.course as unknown as { adminId: string; id: string } | null;
    const isTeacher = course ? course.adminId === callerId : row.teacherId === callerId;
    let hasAccess = isTeacher;
    if (!hasAccess && course) {
      const attendanceRows = row.attendance as unknown as Array<{ enrollment?: { schoolMember?: { studentId?: string } } }>;
      hasAccess = attendanceRows.some((a) => a.enrollment?.schoolMember?.studentId === callerId);
    }
    if (!hasAccess && !course) {
      const participation = await db.query.freeSessionParticipants.findFirst({
        where: and(eq(freeSessionParticipants.sessionId, sessionId), eq(freeSessionParticipants.userId, callerId)),
      });
      hasAccess = !!participation;
    }
    if (!hasAccess) throw new ForbiddenException();

    // Erkin darsda guruh/enrollment yo'q — attendanceRecords bo'sh qoladi.
    // Kim qatnashgani free_session_participants'dan olinadi (faqat login
    // qilgan foydalanuvchilar; anonim mehmonlar hech qayerda saqlanmaydi).
    const freeParticipants = !course
      ? await db.query.freeSessionParticipants.findMany({
          where: eq(freeSessionParticipants.sessionId, sessionId),
          with: { user: true },
        })
      : [];

    let recordingUrl = row.recordingUrl;
    let recordingStatus = row.recordingStatus;
    if (recordingStatus === 'pending') {
      await this.recording.refreshRecording(sessionId);
      const refreshed = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
      if (refreshed) {
        recordingUrl = refreshed.recordingUrl;
        recordingStatus = refreshed.recordingStatus;
      }
    }

    return {
      // O'quvchi (isTeacher=false) — hatto 'full' yozib olingan bo'lsa ham
      // faqat statik oxirgi chizma holatini ko'rishi kerak, to'liq audio
      // replay emas. Frontend shu bayroqqa qarab ko'rinishni majburlaydi.
      isTeacher,
      pdfName: row.pdfName,
      pdfPages: (row.pdfPages as string[]) ?? [],
      historyEvents: (row.historyEvents as unknown as ClassroomHistoryEvent[]) ?? [],
      // Older webhook versions stored only the S3 key (or an s3:// URL).
      // Normalize on read as well so already-finished lessons become playable.
      recordingUrl: recordingUrl ? this.storage.getPublicUrl(recordingUrl) : null,
      recordingStatus,
      // Chizma tarixidagi atMs bilan bir xil birlik — audio yozib olish
      // sessiya boshlanishidan necha ms keyin ishga tushgani, replay
      // sahifasi audio elementiga shu siljishni qo'llash uchun.
      recordingStartedAtMs: row.recordingStartedAtMs,
      // Ustoz "faqat chizma" rejimini tanlagan bo'lsa — to'liq harakat
      // tarixi o'rniga faqat yakuniy doska holati (statik ko'rinish uchun).
      recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
      boardSnapshot: (row.boardSnapshot as unknown as ClassroomBoardSnapshot | null) ?? null,
      attendance: course
        ? (row.attendance as unknown as Array<{
            enrollment?: { schoolMember?: { studentId?: string; student?: { displayName: string } } };
            status: string;
          }>)
            .filter((a) => a.enrollment?.schoolMember?.studentId)
            .map((a) => ({
              userId: a.enrollment!.schoolMember!.studentId as string,
              name: a.enrollment!.schoolMember!.student?.displayName ?? '—',
              status: a.status,
            }))
        : freeParticipants.map((p) => ({
            userId: p.userId,
            name: p.user.displayName,
            status: 'present' as const,
          })),
    };
  }

  // Yakunlangan sessiyani butunlay ochiradi: DB yozuvi, audio yozuv fayli
  // (agar bo'lsa) va unga bog'langan "Jonli dars" content_blocks. PDF
  // sahifalari (pdfPages) HECH QACHON ochirilmaydi — ular media-kutubxona
  // resursi, boshqa darslar/kurslarda ham ishlatilgan bo'lishi mumkin.
  async deleteSession(sessionId: string, callerId: string, callerRole = 'teacher'): Promise<void> {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: { course: true },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    const course = row.course as unknown as { adminId: string };
    if (callerRole !== 'super' && course.adminId !== callerId) throw new ForbiddenException();
    if (row.status !== 'ended') throw new ConflictException("Faqat yakunlangan darsni o'chirish mumkin");

    // deleteFile hech qachon otmaydi (Promise<boolean> qaytaradi) — fayl
    // topilmasa yoki storage sozlanmagan bo'lsa false qaytaradi, bu
    // qolgan o'chirish jarayonini to'xtatmaydi.
    if (row.recordingStatus === 'ready' && row.recordingUrl) {
      await this.storage.deleteFile(`classroom-recordings/${sessionId}.ogg`);
    }

    await db.delete(contentBlocks).where(eq(contentBlocks.classSessionId, sessionId));
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
    // attendanceRecords o'zi cascade-delete bo'ladi (sessionId FK'ida
    // onDelete: 'cascade') — alohida so'rov kerak emas.
  }

  async courseHistory(courseId: string, callerId: string, role: string) {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    if (!course) throw new NotFoundException('Kurs topilmadi');
    if (role !== 'super' && course.adminId !== callerId) throw new ForbiddenException();

    const rows = await db.query.classSessions.findMany({
      where: eq(classSessions.courseId, courseId),
      orderBy: [desc(classSessions.startedAt)],
      limit: 100,
      with: { attendance: true },
    });
    return rows.map((r) => {
      const attendance = r.attendance as unknown as Array<{ status: string }>;
      return {
        id: r.id,
        status: r.status,
        pdfName: r.pdfName,
        startedAt: r.startedAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        total: attendance.length,
        presentCount: attendance.filter((a) => a.status === 'present').length,
        lateCount: attendance.filter((a) => a.status === 'late').length,
        absentCount: attendance.filter((a) => a.status === 'absent').length,
      };
    });
  }

  // Ustozning barcha (kursga bog'liq bo'lmagan) erkin darslari tarixi.
  // Faqat tugagan va boardSnapshot mavjud sessiyalar qaytariladi — chunki
  // hech qanday amal (masalan, replay tugmasi) hozircha faqat shu holat uchun
  // ko'rsatiladi (frontend: FreeClassHistoryPage.tsx). Bu, jumladan, server
  // qayta ishga tushganda onModuleInit orqali boardSnapshot'siz majburan
  // yopilgan "phantom" qatorlarni ham chiqarib tashlaydi (myClassSessions
  // bilan bir xil status filtri uchun izchillik).
  async myFreeSessionHistory(teacherId: string) {
    const rows = await db.query.classSessions.findMany({
      where: and(
        isNull(classSessions.courseId),
        eq(classSessions.teacherId, teacherId),
        eq(classSessions.status, 'ended'),
        isNotNull(classSessions.boardSnapshot),
      ),
      orderBy: desc(classSessions.startedAt),
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status as 'active' | 'ended',
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
      hasBoardSnapshot: row.boardSnapshot !== null,
    }));
  }

  // O'quvchining barcha jonli darslar tarixi — guruhli (attendanceRecords
  // orqali) va erkin (freeSessionParticipants orqali) bitta ro'yxatga
  // birlashtirilib qaytariladi, sana bo'yicha kamayish tartibida.
  async myClassSessions(studentId: string) {
    const groupRows = await db
      .select({
        id: classSessions.id,
        startedAt: classSessions.startedAt,
        pdfName: classSessions.pdfName,
        boardSnapshot: classSessions.boardSnapshot,
        teacherId: classSessions.teacherId,
      })
      .from(attendanceRecords)
      .innerJoin(groupEnrollments, eq(attendanceRecords.enrollmentId, groupEnrollments.id))
      .innerJoin(schoolMembers, eq(groupEnrollments.schoolMemberId, schoolMembers.id))
      .innerJoin(classSessions, eq(attendanceRecords.sessionId, classSessions.id))
      .where(and(
        eq(schoolMembers.studentId, studentId),
        eq(classSessions.status, 'ended'),
        isNotNull(classSessions.boardSnapshot),
      ));

    const freeRows = await db
      .select({
        id: classSessions.id,
        startedAt: classSessions.startedAt,
        pdfName: classSessions.pdfName,
        boardSnapshot: classSessions.boardSnapshot,
        teacherId: classSessions.teacherId,
      })
      .from(freeSessionParticipants)
      .innerJoin(classSessions, eq(freeSessionParticipants.sessionId, classSessions.id))
      .where(and(
        eq(freeSessionParticipants.userId, studentId),
        eq(classSessions.status, 'ended'),
        isNotNull(classSessions.boardSnapshot),
      ));

    const combined = [
      ...groupRows.map((r) => ({ ...r, isFree: false })),
      ...freeRows.map((r) => ({ ...r, isFree: true })),
    ];
    // Dublikatni olib tashlash (nazariy jihatdan bir xil sessionId ikkala
    // yo'ldan ham kelmasligi kerak, chunki bitta sessiya yoki erkin yoki
    // guruhli bo'ladi — lekin xavfsizlik uchun id bo'yicha unique qilinadi).
    const uniqueById = new Map(combined.map((r) => [r.id, r]));
    const teacherIds = [...new Set([...uniqueById.values()].map((r) => r.teacherId).filter((id): id is string => !!id))];
    const teachers = teacherIds.length > 0
      ? await db.query.users.findMany({ where: inArray(users.id, teacherIds) })
      : [];
    const teacherNameById = new Map(teachers.map((t) => [t.id, t.displayName]));

    return [...uniqueById.values()]
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))
      .map((r) => ({
        id: r.id,
        startedAt: r.startedAt?.toISOString() ?? null,
        teacherName: (r.teacherId && teacherNameById.get(r.teacherId)) ?? "O'qituvchi",
        pdfName: r.pdfName,
        hasBoardSnapshot: r.boardSnapshot !== null,
        isFree: r.isFree,
      }));
  }

  async overrideAttendance(recordId: string, adminId: string, role: string, status: string) {
    if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
      throw new ConflictException("Noto'g'ri davomat holati");
    }
    const record = await db.query.attendanceRecords.findFirst({
      where: eq(attendanceRecords.id, recordId),
      with: {
        session: { with: { course: true } },
        enrollment: { with: { schoolMember: true } },
      },
    });
    if (!record) throw new NotFoundException('Davomat yozuvi topilmadi');
    const session = record.session as unknown as { id: string; course: { adminId: string } };
    if (role !== 'super' && session.course.adminId !== adminId) throw new ForbiddenException();

    await db.update(attendanceRecords)
      .set({ status, overriddenByAdminId: adminId })
      .where(eq(attendanceRecords.id, recordId));

    // Aktiv sessiya bo'lsa xotiradagi holatni ham yangilaymiz
    const live = this.sessions.get(session.id);
    if (live) {
      const member = (record.enrollment as unknown as { schoolMember: { studentId: string } }).schoolMember;
      const p = live.participants.get(member.studentId);
      if (p) {
        p.status = status as AttendanceStatus;
        this.broadcastPresence(live);
      }
    }
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
  private buildBoardSnapshot(s: ClassroomSession): ClassroomBoardSnapshot {
    const full = buildSnapshot(s);
    return {
      pdfName: full.pdfName,
      pages: full.pages,
      strokesByPage: full.strokesByPage,
      rightStrokesByPage: full.rightStrokesByPage,
      boardMode: full.boardMode,
      boardLayout: full.boardLayout,
      leftBoardMode: full.leftBoardMode,
      rightBoardMode: full.rightBoardMode,
      notebookStyle: full.notebookStyle,
      notebookPageCount: full.notebookPageCount ?? 4,
      notebookPageStyles: full.notebookPageStyles,
    };
  }


  private livekitConfig(): { url: string; apiKey: string; apiSecret: string } | null {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) return null;
    return { url, apiKey, apiSecret };
  }

  async voiceToken(sessionId: string, userId: string, displayName: string): Promise<{ token: string; url: string }> {
    const s = this.requireSessionHttp(sessionId);
    const isHost = s.hostUserId === userId;
    if (!isHost && !s.participants.has(userId)) throw new ForbiddenException('Siz bu darsning ishtirokchisi emassiz');

    const cfg = this.livekitConfig();
    if (!cfg) throw new ServiceUnavailableException('VOICE_DISABLED');

    const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
      identity: userId,
      name: displayName,
      ttl: '10h',
    });
    at.addGrant({
      roomJoin: true,
      room: `cs-${sessionId}`,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isHost,
    });
    return { token: await at.toJwt(), url: cfg.url };
  }

  async muteParticipant(sessionId: string, teacherId: string, targetUserId: string): Promise<void> {
    const s = this.requireSessionHttp(sessionId);
    if (s.hostUserId !== teacherId) throw new ForbiddenException();
    const cfg = this.livekitConfig();
    if (!cfg) throw new ServiceUnavailableException('VOICE_DISABLED');

    const httpUrl = cfg.url.replace(/^ws/, 'http');
    const client = new RoomServiceClient(httpUrl, cfg.apiKey, cfg.apiSecret);
    const room = `cs-${sessionId}`;
    const participants = await client.listParticipants(room);
    const target = participants.find((p) => p.identity === targetUserId);
    if (!target) throw new NotFoundException("O'quvchi ovoz xonasida emas");
    for (const track of target.tracks) {
      if (track.type === 1 /* AUDIO */ && !track.muted) {
        await client.mutePublishedTrack(room, targetUserId, track.sid, true);
      }
    }
  }

  private recordHistoryEvent(s: ClassroomSession, type: string, payload: unknown): void {
    if (s.isFree) return;
    if (!s.historyEvents) s.historyEvents = [];
    s.historyEvents.push({ type, payload, atMs: Date.now() - s.startedAtMs });
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
}
