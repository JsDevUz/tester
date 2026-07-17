import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
  OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '../db';
import { attendanceRecords, classSessions, groupEnrollments, groups } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import {
  addStroke, attendanceStatusOnJoin, buildSnapshot, clearPage as clearPageStrokes,
  closeInterval, HOST_GRACE_MS, setPage as setSessionPage, undoStroke,
} from './classroom.logic';
import { convertPdfToPageImages, PdfConversionError } from './pdf-converter';
import {
  AttendanceStatus, ClassroomBroadcaster, ClassroomParticipant, ClassroomSession,
  ClassroomSnapshot, ClassroomStroke,
} from './classroom.types';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['absent', 'present', 'late'];

@Injectable()
export class ClassroomService implements OnModuleInit {
  private sessions = new Map<string, ClassroomSession>();
  private broadcaster: ClassroomBroadcaster = { toRoom: () => {}, toSocket: () => {} };

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
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

  async createSession(groupId: string, teacherId: string, role: string): Promise<{ id: string }> {
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, groupId),
      with: { course: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const course = group.course as unknown as { adminId: string };
    if (role !== 'super' && course.adminId !== teacherId) {
      throw new ForbiddenException('Bu guruh sizga tegishli emas');
    }

    for (const s of this.sessions.values()) {
      if (s.groupId === groupId) throw new ConflictException('Bu guruhda jonli dars allaqachon ochiq');
    }
    // Restartdan qolgan stale row bo'lsa yopib qo'yamiz
    const staleRow = await db.query.classSessions.findFirst({
      where: and(eq(classSessions.groupId, groupId), eq(classSessions.status, 'active')),
    });
    if (staleRow) {
      await db.update(classSessions)
        .set({ status: 'ended', endedAt: new Date() })
        .where(eq(classSessions.id, staleRow.id));
    }

    const [row] = await db.insert(classSessions).values({ groupId, teacherId }).returning();

    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.groupId, groupId), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: { with: { student: true } } },
    });

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
      groupId,
      groupName: group.name,
      hostUserId: teacherId,
      hostSocketId: null,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      participants,
      startedAtMs: Date.now(),
      hostDisconnectTimer: null,
    });

    return { id: row.id };
  }

  async attachPdf(sessionId: string, teacherId: string, file: Express.Multer.File): Promise<{ pdfName: string; pages: string[] }> {
    const s = this.requireSession(sessionId);
    if (s.hostUserId !== teacherId) throw new ForbiddenException('Faqat dars ustozi PDF yuklay oladi');

    let images: Buffer[];
    try {
      images = await convertPdfToPageImages(file.buffer);
    } catch (e) {
      if (e instanceof PdfConversionError) {
        const msg = e.message === 'PDF_TOO_MANY_PAGES'
          ? 'PDF juda katta (60 sahifadan oshmasin)'
          : "PDF faylni o'qib bo'lmadi";
        throw new ConflictException(msg);
      }
      throw e;
    }

    const prefix = `classroom/${sessionId}/${crypto.randomUUID()}`;
    const pages: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const key = `${prefix}/page-${i + 1}.webp`;
      await this.storage.uploadBuffer(key, images[i], 'image/webp', 'public, max-age=31536000, immutable');
      pages.push(this.storage.getPublicUrl(key));
    }

    await db.update(classSessions)
      .set({ pdfName: file.originalname, pdfPages: pages })
      .where(eq(classSessions.id, sessionId));

    this.applyPdf(s, file.originalname, pages);
    this.broadcaster.toRoom(sessionId, 'pdf:set', { pdfName: s.pdfName, pages, currentPage: 1 });
    return { pdfName: file.originalname, pages };
  }

  private applyPdf(s: ClassroomSession, pdfName: string, pages: string[]) {
    s.pdfName = pdfName;
    s.pdfPages = pages;
    s.currentPage = 1;
    s.strokesByPage = new Map();
  }

  // Testlar uchun to'g'ridan-to'g'ri holat o'rnatish (S3/konvertatsiyasiz)
  setPdfForTests(sessionId: string, pdfName: string, pages: string[]) {
    this.applyPdf(this.requireSession(sessionId), pdfName, pages);
  }

  async endSession(sessionId: string, byUserId: string | null): Promise<void> {
    const s = this.requireSession(sessionId);
    if (byUserId !== null && s.hostUserId !== byUserId) throw new ForbiddenException('Faqat dars ustozi yakunlay oladi');

    if (s.hostDisconnectTimer) { clearTimeout(s.hostDisconnectTimer); s.hostDisconnectTimer = null; }
    const now = Date.now();
    for (const p of s.participants.values()) {
      if (p.joinedAtMs !== null) {
        closeInterval(p, now);
        await this.persistAttendance(s.id, p);
      }
    }
    await db.update(classSessions)
      .set({ status: 'ended', endedAt: new Date() })
      .where(eq(classSessions.id, sessionId));
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

  async studentJoin(sessionId: string, userId: string, socketId: string): Promise<ClassroomSnapshot> {
    const s = this.requireSession(sessionId);
    let p = s.participants.get(userId);
    if (!p) {
      // Sessiya ochilganidan keyin guruhga qo'shilgan bo'lishi mumkin
      const rows = await db.query.groupEnrollments.findMany({
        where: and(eq(groupEnrollments.groupId, s.groupId), isNull(groupEnrollments.removedAt)),
        with: { schoolMember: { with: { student: true } } },
      });
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

    const now = Date.now();
    p.socketId = socketId;
    if (p.joinedAtMs === null) p.joinedAtMs = now;
    if (p.status === 'absent') {
      p.status = attendanceStatusOnJoin(s.startedAtMs, now);
      await db.update(attendanceRecords)
        .set({ firstJoinedAt: new Date(now), status: p.status })
        .where(and(eq(attendanceRecords.sessionId, s.id), eq(attendanceRecords.enrollmentId, p.enrollmentId)));
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
          await this.persistAttendance(s.id, p);
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
    this.broadcaster.toRoom(sessionId, 'page:set', { page });
  }

  stroke(sessionId: string, userId: string, page: number, stroke: ClassroomStroke): void {
    const s = this.requireHost(sessionId, userId);
    if (!addStroke(s, page, stroke)) throw new Error('INVALID_STROKE');
    this.broadcaster.toRoom(sessionId, 'stroke:add', { page, stroke });
  }

  undo(sessionId: string, userId: string, page: number): void {
    const s = this.requireHost(sessionId, userId);
    const strokeId = undoStroke(s, page);
    if (strokeId) this.broadcaster.toRoom(sessionId, 'stroke:undo', { page, strokeId });
  }

  clearPage(sessionId: string, userId: string, page: number): void {
    const s = this.requireHost(sessionId, userId);
    clearPageStrokes(s, page);
    this.broadcaster.toRoom(sessionId, 'page:clear', { page });
  }

  pointer(sessionId: string, userId: string, page: number, x: number, y: number, active: boolean): void {
    const s = this.requireHost(sessionId, userId);
    this.broadcaster.toRoom(s.id, 'pointer:move', { page, x, y, active });
  }

  // ---------- REST: ro'yxatlar / davomat ----------

  async listActiveForUser(userId: string, role: string) {
    const result: Array<{ id: string; groupId: string; groupName: string; startedAt: number }> = [];
    for (const s of this.sessions.values()) {
      const isHost = s.hostUserId === userId && (role === 'teacher' || role === 'super');
      const isMember = role === 'student' && s.participants.has(userId);
      if (isHost || isMember) {
        result.push({ id: s.id, groupId: s.groupId, groupName: s.groupName, startedAt: s.startedAtMs });
      }
    }
    return result;
  }

  async getSessionWithAttendance(sessionId: string, callerId: string, role: string) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        group: { with: { course: true } },
        attendance: { with: { enrollment: { with: { schoolMember: { with: { student: true } } } } } },
      },
    });
    if (!row) throw new NotFoundException('Sessiya topilmadi');
    const course = (row.group as unknown as { course: { adminId: string } }).course;
    if (role !== 'super' && course.adminId !== callerId) throw new ForbiddenException();
    const live = this.sessions.get(sessionId);
    return {
      id: row.id,
      groupId: row.groupId,
      groupName: (row.group as unknown as { name: string }).name,
      status: row.status,
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
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

  async groupHistory(groupId: string, callerId: string, role: string) {
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, groupId),
      with: { course: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const course = group.course as unknown as { adminId: string };
    if (role !== 'super' && course.adminId !== callerId) throw new ForbiddenException();

    const rows = await db.query.classSessions.findMany({
      where: eq(classSessions.groupId, groupId),
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

  async overrideAttendance(recordId: string, adminId: string, role: string, status: string) {
    if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
      throw new ConflictException("Noto'g'ri davomat holati");
    }
    const record = await db.query.attendanceRecords.findFirst({
      where: eq(attendanceRecords.id, recordId),
      with: {
        session: { with: { group: { with: { course: true } } } },
        enrollment: { with: { schoolMember: true } },
      },
    });
    if (!record) throw new NotFoundException('Davomat yozuvi topilmadi');
    const session = record.session as unknown as { id: string; group: { course: { adminId: string } } };
    if (role !== 'super' && session.group.course.adminId !== adminId) throw new ForbiddenException();

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
