import { randomUUID } from 'crypto';
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
  addStroke, applyPageInsertInverse, applyPageRemoveInverse, applyStrokeAddInverse, applyStrokeEraseInverse,
  applyStrokeReorderInverse, applyStrokeStyleInverse, applyStrokeTextInverse, applyStrokeTransformInverse,
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
  ClassroomPageSnapshot, ClassroomParticipant, ClassroomRaisedHand, ClassroomRecordingMode, ClassroomSession, ClassroomSnapshot, ClassroomStroke, ClassroomSubtitleCue, ClassroomUndoEntry,
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

    // Aktiv darslar doska holatini har 15 soniyada DB ga avtomatik saqlaydi —
    // ustoz to'satdan brauzerni yopib yuborsa ham saqlanmay qolib ketmaydi.
    setInterval(() => {
      for (const s of this.sessions.values()) {
        void this.persistBoardSnapshot(s.id).catch(() => {});
      }
    }, 15000);
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

  async createSession(courseId: string, teacherId: string, role: string, title?: string): Promise<{ id: string }> {
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

    const cleanTitle = title?.trim() ? title.trim() : null;
    const [row] = await db.insert(classSessions).values({ courseId, teacherId, title: cleanTitle }).returning();

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
      title: cleanTitle,
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
  // emas. DB'ga yozuv qilinadi — title va saqlanadigan ma'lumotlar bilan.
  // Istalgan kishi (login qilgan yoki anonim mehmon) havola orqali kira oladi.
  async createFreeSession(teacherId: string, title?: string): Promise<{ id: string }> {
    const cleanTitle = title?.trim() ? title.trim() : null;
    const [row] = await db.insert(classSessions).values({ courseId: null, teacherId, title: cleanTitle }).returning();
    this.sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      title: cleanTitle,
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

  // Eski (tugagan yoki hali jonli) erkin darsning oxirgi saqlangan
  // taxta holatidan (board_snapshot) YANGI erkin dars yaratadi — haqiqiy
  // "davom ettirish" emas (eski sessiya xotirada allaqachon yo'q bo'lishi
  // mumkin), balki createFreeSession bilan bir xil, faqat bo'sh o'rniga
  // snapshot'dagi PDF/daftar/chizmalarni boshlang'ich holat qilib beradi.
  async createFreeSessionFromSnapshot(teacherId: string, sourceSessionId: string): Promise<{ id: string }> {
    const sourceRow = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sourceSessionId) });
    if (!sourceRow) throw new NotFoundException('Dars topilmadi');
    if (sourceRow.teacherId !== teacherId) throw new ForbiddenException('Bu dars sizga tegishli emas');
    if (!sourceRow.boardSnapshot) throw new ConflictException("Bu darsda saqlangan taxta holati yo'q");

    const snapshot = sourceRow.boardSnapshot as unknown as ClassroomBoardSnapshot;

    const [row] = await db.insert(classSessions).values({ courseId: null, teacherId }).returning();

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
      strokesByMode.set(snapshot.boardMode, new Map(
        Object.entries(snapshot.strokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
      ));
      if (snapshot.rightBoardMode && snapshot.rightBoardMode !== snapshot.boardMode) {
        strokesByMode.set(snapshot.rightBoardMode, new Map(
          Object.entries(snapshot.rightStrokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
        ));
      }
    }
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    this.sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: snapshot.pdfName,
      pdfPages: snapshot.pages,
      currentPage: 1,
      strokesByPage: primaryStrokes,
      boardMode: snapshot.boardMode,
      boardLayout: snapshot.boardLayout,
      leftBoardMode: snapshot.leftBoardMode,
      rightBoardMode: snapshot.rightBoardMode,
      classroomTheme: 'light',
      notebookStyle: snapshot.notebookStyle,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      notebookPageOrientations: snapshot.notebookPageOrientations ?? {},
      strokesByMode,
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

  // Kurs jonli darsini oxirgi saqlangan taxta holati (boardSnapshot) bilan YANGI dars qilib boshlaydi.
  async createClassSessionFromSnapshot(sourceSessionId: string, teacherId: string, role: string, title?: string): Promise<{ id: string }> {
    const sourceRow = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sourceSessionId),
      with: { course: true },
    });
    if (!sourceRow) throw new NotFoundException('Dars topilmadi');
    const courseId = sourceRow.courseId;
    if (!courseId) {
      return this.createFreeSessionFromSnapshot(teacherId, sourceSessionId);
    }
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    if (!course) throw new NotFoundException('Kurs topilmadi');
    if (role !== 'super' && course.adminId !== teacherId) {
      throw new ForbiddenException('Bu kurs sizga tegishli emas');
    }
    if (!sourceRow.boardSnapshot) throw new ConflictException("Bu darsda saqlangan taxta holati yo'q");

    const staleRow = await db.query.classSessions.findFirst({
      where: and(eq(classSessions.courseId, courseId), eq(classSessions.status, 'active')),
    });
    if (staleRow) {
      await db.update(classSessions)
        .set({ status: 'ended', endedAt: new Date() })
        .where(eq(classSessions.id, staleRow.id));
    }

    const cleanTitle = title?.trim() ? title.trim() : (sourceRow.title ?? null);
    const [row] = await db.insert(classSessions).values({
      courseId,
      teacherId,
      title: cleanTitle,
      pdfName: sourceRow.pdfName,
      pdfPages: sourceRow.pdfPages,
    }).returning();

    const snapshot = sourceRow.boardSnapshot as unknown as ClassroomBoardSnapshot;

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
      strokesByMode.set(snapshot.boardMode, new Map(
        Object.entries(snapshot.strokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
      ));
      if (snapshot.rightBoardMode && snapshot.rightBoardMode !== snapshot.boardMode) {
        strokesByMode.set(snapshot.rightBoardMode, new Map(
          Object.entries(snapshot.rightStrokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
        ));
      }
    }
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    this.sessions.set(row.id, {
      id: row.id,
      courseId,
      courseName: course.title,
      title: cleanTitle,
      isFree: false,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: snapshot.pdfName,
      pdfPages: snapshot.pages,
      currentPage: 1,
      strokesByPage: primaryStrokes,
      boardMode: snapshot.boardMode,
      boardLayout: snapshot.boardLayout,
      leftBoardMode: snapshot.leftBoardMode,
      rightBoardMode: snapshot.rightBoardMode,
      classroomTheme: 'light',
      notebookStyle: snapshot.notebookStyle,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      notebookPageOrientations: snapshot.notebookPageOrientations ?? {},
      strokesByMode,
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

  // Tugallangan erkin darsni o'SHA ID bilan davom ettiradi — yangi sessiya
  // yaratmasdan, DB'dagi boardSnapshot'ni xotiraga qayta yuklaydi va
  // status'ni 'active' ga o'zgartiradi. Foydalanuvchi URL ham o'zgarmaydi.
  async reopenFreeSession(teacherId: string, sessionId: string, title?: string): Promise<void> {
    // Allaqachon jonli bo'lsa va RAM'da bor bo'lsa — s.title yangilab o'tamiz (idempotent)
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (title?.trim()) existing.title = title.trim();
      return;
    }

    const row = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
    if (!row) throw new NotFoundException('Dars topilmadi');
    if (row.teacherId !== teacherId) throw new ForbiddenException('Bu dars sizga tegishli emas');
    if (!row.boardSnapshot) throw new ConflictException("Bu darsda saqlangan taxta holati yo'q — davom ettirib bo'lmaydi");

    const newTitle = title?.trim() ? title.trim() : row.title;
    const snapshot = row.boardSnapshot as unknown as ClassroomBoardSnapshot;

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
      strokesByMode.set(snapshot.boardMode, new Map(
        Object.entries(snapshot.strokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
      ));
      if (snapshot.rightBoardMode && snapshot.rightBoardMode !== snapshot.boardMode) {
        strokesByMode.set(snapshot.rightBoardMode, new Map(
          Object.entries(snapshot.rightStrokesByPage ?? {}).map(([page, strokes]) => [Number(page), strokes]),
        ));
      }
    }
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    // Xuddi o'sha ID bilan RAM'ga yuklaymiz
    this.sessions.set(sessionId, {
      id: sessionId,
      courseId: null,
      courseName: null,
      title: newTitle,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: snapshot.pdfName,
      pdfPages: snapshot.pages,
      currentPage: 1,
      strokesByPage: primaryStrokes,
      boardMode: snapshot.boardMode,
      boardLayout: snapshot.boardLayout,
      leftBoardMode: snapshot.leftBoardMode,
      rightBoardMode: snapshot.rightBoardMode,
      classroomTheme: 'light',
      notebookStyle: snapshot.notebookStyle,
      notebookPageCount: snapshot.notebookPageCount,
      notebookPageStyles: snapshot.notebookPageStyles,
      notebookPageOrientations: snapshot.notebookPageOrientations ?? {},
      strokesByMode,
      participants: new Map(),
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
    });

    // DB'da status'ni qayta 'active' ga o'tkazamiz (asosiy dars nomini saqlagan holda)
    await db.update(classSessions)
      .set({ status: 'active', endedAt: null, title: row.title ?? newTitle })
      .where(eq(classSessions.id, sessionId));
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
    // Yangi PDF faqat PDF taxtasini almashtiradi. Daftar chizmalari alohida
    // mode map'da saqlanadi va PDF yuklashda yo'qolmasligi kerak.
    if (!s.strokesByMode) {
      s.strokesByMode = new Map([[s.boardMode ?? 'pdf', s.strokesByPage]]);
    }
    const pdfStrokes = new Map<number, ClassroomStroke[]>();
    s.strokesByMode.set('pdf', pdfStrokes);
    s.pdfName = pdfName;
    s.pdfPages = pages;
    s.currentPage = 1;
    s.boardMode = 'pdf';
    s.boardLayout = 'single'; s.leftBoardMode = 'pdf'; s.rightBoardMode = 'pdf';
    s.strokesByPage = pdfStrokes;
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
        // Ustoz kutilmaganda (call off bosmay) chiqib ketsa ham doskani DARHOL DB ga saqlaymiz:
        void this.persistBoardSnapshot(s.id).catch(() => {});
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

  async persistBoardSnapshot(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    const boardSnapshot = this.buildBoardSnapshot(s);
    await db.update(classSessions)
      .set({
        boardSnapshot,
        pdfName: s.pdfName,
        pdfPages: s.pdfPages,
      })
      .where(eq(classSessions.id, sessionId));
  }

  addSubtitleCue(sessionId: string, cue: ClassroomSubtitleCue): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (!s.subtitles) s.subtitles = [];
    s.subtitles.push(cue);
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
    this.broadcaster.toRoom(sessionId, 'stroke:update', payload);
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
    this.broadcaster.toRoom(sessionId, 'stroke:textUpdate', payload);
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
    this.broadcaster.toRoom(sessionId, 'stroke:shapeUpdate', payload);
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
  }

  private applyUndoEntry(s: ClassroomSession, entry: ClassroomUndoEntry, direction: 'undo' | 'redo'): void {
    switch (entry.type) {
      case 'stroke:add':
        applyStrokeAddInverse(s, entry.mode, entry.page, entry.after as { stroke: ClassroomStroke }, direction);
        break;
      case 'stroke:erase':
        applyStrokeEraseInverse(s, entry.mode, entry.page, entry.before as { stroke: ClassroomStroke; index: number }, direction);
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
      notebookOrientation: mode === 'notebook' ? resolveNotebookPageOrientation(s, pageIndex) : undefined,
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
    const copiedStrokes = strokes.map((stroke) => ({
      ...stroke,
      id: crypto.randomUUID(),
      points: [...stroke.points],
    }));
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
  }

  setNotebookPageStyle(sessionId: string, userId: string, page: number, style: ClassroomNotebookStyle): void {
    const s = this.requireHost(sessionId, userId);
    const count = s.notebookPageCount ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > count) throw new Error('INVALID_NOTEBOOK_PAGE');
    s.notebookPageStyles = { ...(s.notebookPageStyles ?? {}), [page]: style };
    const payload = { page, style };
    this.recordHistoryEvent(s, 'notebook:pageStyle', payload);
    this.broadcaster.toRoom(s.id, 'notebook:pageStyle', payload);
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
      title: row.title ?? row.pdfName ?? null,
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
  async getReplay(sessionId: string, callerId: string, recordingId?: string) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: true,
        attendance: { with: { enrollment: { with: { schoolMember: { with: { student: true } } } } } },
      },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
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

    const freeParticipants = !course
      ? await db.query.freeSessionParticipants.findMany({
          where: eq(freeSessionParticipants.sessionId, sessionId),
          with: { user: true },
        })
      : [];

    const rawRecordings = (row.recordings as unknown as any[]) ?? [];
    const formattedRecordings = rawRecordings.map((r) => ({
      id: r.id,
      partNumber: r.partNumber,
      createdAt: r.createdAt,
      title: r.title ?? null,
      recordingStatus: r.recordingStatus ?? 'none',
      recordingMode: r.recordingMode ?? null,
      recordingUrl: r.recordingUrl ? this.storage.getPublicUrl(r.recordingUrl) : null,
    }));

    let selectedEntry: any = null;
    if (recordingId) {
      selectedEntry = rawRecordings.find((r) => r.id === recordingId);
    }
    if (!selectedEntry && rawRecordings.length > 0) {
      selectedEntry = rawRecordings[rawRecordings.length - 1];
    }

    let recordingUrl = (selectedEntry && selectedEntry.recordingUrl) ? selectedEntry.recordingUrl : row.recordingUrl;
    let recordingStatus = (selectedEntry && selectedEntry.recordingStatus && selectedEntry.recordingStatus !== 'none')
      ? selectedEntry.recordingStatus
      : row.recordingStatus;
    if (recordingStatus === 'pending') {
      await this.recording.refreshRecording(sessionId);
      const refreshed = await db.query.classSessions.findFirst({ where: eq(classSessions.id, sessionId) });
      if (refreshed) {
        recordingUrl = refreshed.recordingUrl;
        recordingStatus = refreshed.recordingStatus;
      }
    }

    const historyEvents = selectedEntry
      ? (selectedEntry.historyEvents ?? [])
      : ((row.historyEvents as unknown as ClassroomHistoryEvent[]) ?? []);
    const recordingStartedAtMs = selectedEntry ? selectedEntry.recordingStartedAtMs : row.recordingStartedAtMs;
    const recordingMode = selectedEntry ? selectedEntry.recordingMode : (row.recordingMode as ClassroomRecordingMode | null);
    const boardSnapshot = selectedEntry ? selectedEntry.boardSnapshot : (row.boardSnapshot as unknown as ClassroomBoardSnapshot | null);

    return {
      isTeacher,
      title: selectedEntry?.title ?? row.title ?? row.pdfName ?? null,
      pdfName: row.pdfName,
      pdfPages: (row.pdfPages as string[]) ?? [],
      historyEvents,
      recordingUrl: recordingUrl ? this.storage.getPublicUrl(recordingUrl) : null,
      recordingStatus,
      recordingStartedAtMs,
      recordingMode: (recordingMode as ClassroomRecordingMode | null) ?? null,
      boardSnapshot: (boardSnapshot as unknown as ClassroomBoardSnapshot | null) ?? null,
      recordings: formattedRecordings,
      attendance: selectedEntry && Array.isArray(selectedEntry.attendance)
        ? selectedEntry.attendance
        : (course
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
              }))),
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
    const course = row.course as unknown as { adminId: string } | null;
    const isOwner = course ? course.adminId === callerId : row.teacherId === callerId;
    if (callerRole !== 'super' && !isOwner) throw new ForbiddenException('Bu dars sizga tegishli emas');
    if (row.status !== 'ended') throw new ConflictException("Faqat yakunlangan darsni o'chirish mumkin");

    if (row.recordingUrl) {
      const ext = row.recordingUrl.endsWith('.mp4') ? 'mp4' : 'ogg';
      await this.storage.deleteFile(`classroom-recordings/${sessionId}.${ext}`);
    }
    const rawRecordings = (row.recordings as unknown as any[]) ?? [];
    for (const r of rawRecordings) {
      if (r.recordingUrl) {
        const key = r.recordingUrl.split('/').pop();
        if (key) {
          await this.storage.deleteFile(`classroom-recordings/${key}`);
        }
      }
    }

    if (!row.course && !row.courseId) {
      await db.delete(freeSessionParticipants).where(eq(freeSessionParticipants.sessionId, sessionId));
    }
    await db.delete(contentBlocks).where(eq(contentBlocks.classSessionId, sessionId));
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
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
      const rawRecordings = (r.recordings as unknown as any[]) ?? [];
      const recordings = rawRecordings.map((rec) => ({
        id: rec.id,
        partNumber: rec.partNumber,
        createdAt: rec.createdAt,
        title: rec.title ?? null,
      }));
      return {
        id: r.id,
        status: r.status,
        title: r.title ?? r.pdfName ?? "Jonli dars",
        pdfName: r.pdfName,
        startedAt: r.startedAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        recordings,
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
    return rows.map((row) => {
      const rawRecordings = (row.recordings as unknown as any[]) ?? [];
      const recordings = rawRecordings.map((r) => ({
        id: r.id,
        partNumber: r.partNumber,
        createdAt: r.createdAt,
        title: r.title ?? null,
        recordingStatus: r.recordingStatus ?? 'none',
        recordingMode: r.recordingMode ?? null,
      }));
      return {
        id: row.id,
        status: row.status as 'active' | 'ended',
        title: row.title ?? row.pdfName ?? "Erkin dars",
        pdfName: row.pdfName,
        startedAt: row.startedAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
        hasBoardSnapshot: row.boardSnapshot !== null,
        recordings,
      };
    });
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
    const pdfStrokes: Record<number, ClassroomStroke[]> = {};
    const notebookStrokes: Record<number, ClassroomStroke[]> = {};

    if (s.strokesByMode) {
      const pdfMap = s.strokesByMode.get('pdf');
      if (pdfMap) {
        for (const [p, strokes] of pdfMap) {
          if (strokes.length > 0) pdfStrokes[p] = strokes;
        }
      }
      const notebookMap = s.strokesByMode.get('notebook');
      if (notebookMap) {
        for (const [p, strokes] of notebookMap) {
          if (strokes.length > 0) notebookStrokes[p] = strokes;
        }
      }
    }

    return {
      pdfName: full.pdfName,
      pages: full.pages,
      strokesByPage: full.strokesByPage,
      rightStrokesByPage: full.rightStrokesByPage,
      strokesByMode: {
        pdf: pdfStrokes,
        notebook: notebookStrokes,
      },
      boardMode: full.boardMode,
      boardLayout: full.boardLayout,
      leftBoardMode: full.leftBoardMode,
      rightBoardMode: full.rightBoardMode,
      notebookStyle: full.notebookStyle,
      notebookPageCount: full.notebookPageCount ?? 1,
      notebookPageStyles: full.notebookPageStyles,
      notebookPageOrientations: full.notebookPageOrientations,
      subtitles: s.subtitles ?? [],
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
    const isGuest = userId.startsWith('guest_');
    if (!isHost && !isGuest && !s.participants.has(userId)) throw new ForbiddenException('Siz bu darsning ishtirokchisi emassiz');

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
    if (s.isFree && !s.recordingMode) return;
    if (!s.historyEvents) s.historyEvents = [];
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

  private async getOrRestoreSession(sessionId: string): Promise<ClassroomSession | null> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: { course: true },
    });
    if (!row || row.status !== 'active') return null;

    const snapshot = (row.boardSnapshot as unknown as ClassroomBoardSnapshot) ?? {
      pdfName: row.pdfName ?? null,
      pages: row.pdfPages ?? [],
      strokesByPage: {},
      rightStrokesByPage: {},
      boardMode: 'pdf',
      boardLayout: 'single',
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
      isFree,
      hostUserId: row.teacherId ?? row.course?.adminId ?? '',
      hostSocketId: null,
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
}
