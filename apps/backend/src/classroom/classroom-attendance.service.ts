import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  attendanceRecords,
  classSessions,
  courses,
  freeSessionParticipants,
  groupEnrollments,
  schoolMembers,
  users,
} from '../db/schema';
import {
  AttendanceStatus,
  ClassroomRecordingMode,
} from './classroom.types';
import { ClassroomService } from './classroom.service';

const ATTENDANCE_STATUSES: AttendanceStatus[] = ['absent', 'present', 'late'];

@Injectable()
export class ClassroomAttendanceService {
  constructor(
    @Inject(forwardRef(() => ClassroomService))
    private readonly classroomService: ClassroomService,
  ) {}

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
        title: r.title ?? r.pdfName ?? 'Jonli dars',
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
        title: row.title ?? row.pdfName ?? 'Erkin dars',
        pdfName: row.pdfName,
        startedAt: row.startedAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        recordingMode: (row.recordingMode as ClassroomRecordingMode | null) ?? null,
        hasBoardSnapshot: row.boardSnapshot !== null,
        recordings,
      };
    });
  }

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
      .where(
        and(
          eq(schoolMembers.studentId, studentId),
          eq(classSessions.status, 'ended'),
          isNotNull(classSessions.boardSnapshot),
        ),
      );

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
      .where(
        and(
          eq(freeSessionParticipants.userId, studentId),
          eq(classSessions.status, 'ended'),
          isNotNull(classSessions.boardSnapshot),
        ),
      );

    const combined = [
      ...groupRows.map((r) => ({ ...r, isFree: false })),
      ...freeRows.map((r) => ({ ...r, isFree: true })),
    ];
    const uniqueById = new Map(combined.map((r) => [r.id, r]));
    const teacherIds = [
      ...new Set(
        [...uniqueById.values()].map((r) => r.teacherId).filter((id): id is string => !!id),
      ),
    ];
    const teachers =
      teacherIds.length > 0
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

    await db
      .update(attendanceRecords)
      .set({ status, overriddenByAdminId: adminId })
      .where(eq(attendanceRecords.id, recordId));

    const live = this.classroomService.getSession(session.id);
    if (live) {
      const member = (record.enrollment as unknown as { schoolMember: { studentId: string } })
        .schoolMember;
      const p = live.participants.get(member.studentId);
      if (p) {
        p.status = status as AttendanceStatus;
        this.classroomService.broadcastPresence(live);
      }
    }
  }
}
