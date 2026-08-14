import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  attendanceRecords,
  classSessions,
  contentBlocks,
  courses,
  freeSessionParticipants,
  groupEnrollments,
  groups,
  users,
} from '../db/schema';
import { PracticeMessengerGateway } from '../practice-messenger/practice-messenger.gateway';
import { StorageService } from '../storage/storage.service';
import {
  ClassroomBoardSnapshot,
  ClassroomParticipant,
  ClassroomRecordingMode,
  ClassroomSession,
} from './classroom.types';
import { ClassroomSnapshotService } from './classroom-snapshot.service';

@Injectable()
export class ClassroomSessionLifecycleService {
  constructor(
    private readonly storage: StorageService,
    private readonly notifications: PracticeMessengerGateway,
    private readonly snapshotService: ClassroomSnapshotService,
  ) {}

  async loadCourseEnrollments(courseId: string) {
    const courseGroups = await db.query.groups.findMany({
      where: eq(groups.courseId, courseId),
    });
    if (courseGroups.length === 0) return [];
    const groupIds = courseGroups.map((g) => g.id);
    return db.query.groupEnrollments.findMany({
      where: and(
        inArray(groupEnrollments.groupId, groupIds),
        isNull(groupEnrollments.removedAt),
      ),
      with: { schoolMember: { with: { student: true } } },
    });
  }

  async createSession(
    courseId: string,
    teacherId: string,
    role: string,
    sessions: Map<string, ClassroomSession>,
    title?: string,
  ): Promise<{ id: string }> {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });
    if (!course) throw new NotFoundException('Kurs topilmadi');
    if (role !== 'super' && course.adminId !== teacherId) {
      throw new ForbiddenException('Bu kurs sizga tegishli emas');
    }

    for (const s of sessions.values()) {
      if (s.courseId === courseId) {
        throw new ConflictException('Bu kursda jonli dars allaqachon ochiq');
      }
    }
    const staleRow = await db.query.classSessions.findFirst({
      where: and(
        eq(classSessions.courseId, courseId),
        eq(classSessions.status, 'active'),
      ),
    });
    if (staleRow) {
      await db
        .update(classSessions)
        .set({ status: 'ended', endedAt: new Date() })
        .where(eq(classSessions.id, staleRow.id));
    }

    const cleanTitle = title?.trim() ? title.trim() : null;
    const [row] = await db
      .insert(classSessions)
      .values({ courseId, teacherId, title: cleanTitle })
      .returning();

    const enrollments = await this.loadCourseEnrollments(courseId);

    if (enrollments.length > 0) {
      await db
        .insert(attendanceRecords)
        .values(
          enrollments.map((e) => ({
            sessionId: row.id,
            enrollmentId: e.id,
          })),
        )
        .onConflictDoNothing();
    }

    const participants = new Map<string, ClassroomParticipant>();
    for (const e of enrollments) {
      const member = e.schoolMember as unknown as {
        studentId: string;
        student: { displayName: string };
      };
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

    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    sessions.set(row.id, {
      id: row.id,
      courseId,
      courseName: course.title,
      title: cleanTitle,
      isFree: false,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      boardMode: 'pdf',
      boardLayout: 'single',
      leftBoardMode: 'pdf',
      rightBoardMode: 'pdf',
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

    this.notifications.notifyUsers(
      [...participants.keys()],
      'liveSession:started',
      {
        sessionId: row.id,
        courseId,
        courseName: course.title,
      },
    );

    return { id: row.id };
  }

  async createFreeSession(
    teacherId: string,
    sessions: Map<string, ClassroomSession>,
    title?: string,
  ): Promise<{ id: string }> {
    const cleanTitle = title?.trim() ? title.trim() : null;
    const [row] = await db
      .insert(classSessions)
      .values({ courseId: null, teacherId, title: cleanTitle })
      .returning();
    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      title: cleanTitle,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
      pdfName: null,
      pdfPages: [],
      currentPage: 1,
      strokesByPage: new Map(),
      boardMode: 'pdf',
      boardLayout: 'single',
      leftBoardMode: 'pdf',
      rightBoardMode: 'pdf',
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

  async createFreeSessionFromSnapshot(
    teacherId: string,
    sourceSessionId: string,
    sessions: Map<string, ClassroomSession>,
  ): Promise<{ id: string }> {
    const sourceRow = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sourceSessionId),
    });
    if (!sourceRow) throw new NotFoundException('Dars topilmadi');
    if (sourceRow.teacherId !== teacherId) {
      throw new ForbiddenException('Bu dars sizga tegishli emas');
    }
    if (!sourceRow.boardSnapshot) {
      throw new ConflictException("Bu darsda saqlangan taxta holati yo'q");
    }

    const snapshot = sourceRow.boardSnapshot as unknown as ClassroomBoardSnapshot;
    const [row] = await db
      .insert(classSessions)
      .values({ courseId: null, teacherId })
      .returning();

    const strokesByMode = this.snapshotService.deserializeStrokesByMode(snapshot);
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    sessions.set(row.id, {
      id: row.id,
      courseId: null,
      courseName: null,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
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

  async createClassSessionFromSnapshot(
    sourceSessionId: string,
    teacherId: string,
    role: string,
    sessions: Map<string, ClassroomSession>,
    title?: string,
  ): Promise<{ id: string }> {
    const sourceRow = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sourceSessionId),
      with: { course: true },
    });
    if (!sourceRow) throw new NotFoundException('Dars topilmadi');
    const courseId = sourceRow.courseId;
    if (!courseId) {
      return this.createFreeSessionFromSnapshot(teacherId, sourceSessionId, sessions);
    }
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });
    if (!course) throw new NotFoundException('Kurs topilmadi');
    if (role !== 'super' && course.adminId !== teacherId) {
      throw new ForbiddenException('Bu kurs sizga tegishli emas');
    }
    if (!sourceRow.boardSnapshot) {
      throw new ConflictException("Bu darsda saqlangan taxta holati yo'q");
    }

    const staleRow = await db.query.classSessions.findFirst({
      where: and(
        eq(classSessions.courseId, courseId),
        eq(classSessions.status, 'active'),
      ),
    });
    if (staleRow) {
      await db
        .update(classSessions)
        .set({ status: 'ended', endedAt: new Date() })
        .where(eq(classSessions.id, staleRow.id));
    }

    const cleanTitle = title?.trim() ? title.trim() : (sourceRow.title ?? null);
    const [row] = await db
      .insert(classSessions)
      .values({
        courseId,
        teacherId,
        title: cleanTitle,
        pdfName: sourceRow.pdfName,
        pdfPages: sourceRow.pdfPages,
      })
      .returning();

    const snapshot = sourceRow.boardSnapshot as unknown as ClassroomBoardSnapshot;

    const enrollments = await this.loadCourseEnrollments(courseId);
    if (enrollments.length > 0) {
      await db
        .insert(attendanceRecords)
        .values(
          enrollments.map((e) => ({
            sessionId: row.id,
            enrollmentId: e.id,
          })),
        )
        .onConflictDoNothing();
    }

    const participants = new Map<string, ClassroomParticipant>();
    for (const e of enrollments) {
      const member = e.schoolMember as unknown as {
        studentId: string;
        student: { displayName: string };
      };
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

    const strokesByMode = this.snapshotService.deserializeStrokesByMode(snapshot);
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    sessions.set(row.id, {
      id: row.id,
      courseId,
      courseName: course.title,
      title: cleanTitle,
      isFree: false,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
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

    this.notifications.notifyUsers(
      [...participants.keys()],
      'liveSession:started',
      {
        sessionId: row.id,
        courseId,
        courseName: course.title,
      },
    );

    return { id: row.id };
  }

  async reopenFreeSession(
    teacherId: string,
    sessionId: string,
    sessions: Map<string, ClassroomSession>,
    title?: string,
  ): Promise<void> {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    if (row.teacherId !== teacherId) {
      throw new ForbiddenException('Bu dars sizga tegishli emas');
    }
    if (!row.boardSnapshot) {
      throw new ConflictException(
        "Bu darsda saqlangan taxta holati yo'q — davom ettirib bo'lmaydi",
      );
    }

    const newTitle = title?.trim() ? title.trim() : row.title;
    const snapshot = row.boardSnapshot as unknown as ClassroomBoardSnapshot;

    const strokesByMode = this.snapshotService.deserializeStrokesByMode(snapshot);
    const primaryStrokes = strokesByMode.get(snapshot.boardMode) ?? new Map();

    const hostUser = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
    });
    const hostName = hostUser?.displayName ?? 'Ustoz';

    sessions.set(sessionId, {
      id: sessionId,
      courseId: null,
      courseName: null,
      title: newTitle,
      isFree: true,
      hostUserId: teacherId,
      hostSocketId: null,
      hostName,
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
      savedVersions: snapshot.savedVersions ?? [],
    });

    await db
      .update(classSessions)
      .set({ status: 'active', endedAt: null, title: row.title ?? newTitle })
      .where(eq(classSessions.id, sessionId));
  }

  async deleteSession(
    sessionId: string,
    callerId: string,
    callerRole = 'teacher',
  ): Promise<void> {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: { course: true },
    });
    if (!row) throw new NotFoundException('Dars topilmadi');
    const course = row.course as unknown as { adminId: string } | null;
    const isOwner = course ? course.adminId === callerId : row.teacherId === callerId;
    if (callerRole !== 'super' && !isOwner) {
      throw new ForbiddenException('Bu dars sizga tegishli emas');
    }
    if (row.status !== 'ended') {
      throw new ConflictException("Faqat yakunlangan darsni o'chirish mumkin");
    }

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
      await db
        .delete(freeSessionParticipants)
        .where(eq(freeSessionParticipants.sessionId, sessionId));
    }
    await db
      .delete(contentBlocks)
      .where(eq(contentBlocks.classSessionId, sessionId));
    await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  }

  async listActiveForUser(
    userId: string,
    role: string,
    sessions: Map<string, ClassroomSession>,
  ) {
    const result: Array<{
      id: string;
      courseId: string;
      courseName: string;
      startedAt: number;
    }> = [];
    for (const s of sessions.values()) {
      if (s.isFree) continue;
      const isHost =
        s.hostUserId === userId && (role === 'teacher' || role === 'super');
      const isMember = role === 'student' && s.participants.has(userId);
      if (isHost || isMember) {
        result.push({
          id: s.id,
          courseId: s.courseId!,
          courseName: s.courseName!,
          startedAt: s.startedAtMs,
        });
      }
    }
    return result;
  }

  async getSessionWithAttendance(
    sessionId: string,
    callerId: string,
    role: string,
    sessions: Map<string, ClassroomSession>,
  ) {
    const row = await db.query.classSessions.findFirst({
      where: eq(classSessions.id, sessionId),
      with: {
        course: true,
        attendance: {
          with: {
            enrollment: {
              with: { schoolMember: { with: { student: true } } },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Sessiya topilmadi');
    const course = row.course as unknown as { adminId: string; title: string } | null;
    if (role !== 'super') {
      if (course) {
        if (course.adminId !== callerId) throw new ForbiddenException();
      } else if (row.teacherId !== callerId) {
        throw new ForbiddenException();
      }
    }
    const live = sessions.get(sessionId);
    return {
      id: row.id,
      courseId: row.courseId,
      courseName: course?.title ?? null,
      title: row.title ?? row.pdfName ?? null,
      status: row.status,
      pdfName: row.pdfName,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
      hasBoardSnapshot: row.boardSnapshot !== null,
      attendance: (
        row.attendance as unknown as Array<{
          id: string;
          status: string;
          firstJoinedAt: Date | null;
          lastLeftAt: Date | null;
          totalSeconds: number;
          overriddenByAdminId: string | null;
          enrollment: {
            schoolMember: { studentId: string; student: { displayName: string } };
          };
        }>
      ).map((a) => {
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
            ? liveParticipant.totalSeconds +
              (liveParticipant.joinedAtMs
                ? Math.round((Date.now() - liveParticipant.joinedAtMs) / 1000)
                : 0)
            : a.totalSeconds,
          overridden: a.overriddenByAdminId !== null,
        };
      }),
    };
  }
}
