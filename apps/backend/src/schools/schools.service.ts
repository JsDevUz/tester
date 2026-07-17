import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { schools, schoolMembers, users, courses, groups, groupEnrollments, monthlyPayments, modules, lessons, lessonCompletions, contentBlocks, videoWatchSegments } from '../db/schema';
import { and, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PracticeBlocksService, computeCombinedPercent } from '../practice-blocks/practice-blocks.service';
import { StorageService } from '../storage/storage.service';
import { TelegramService } from '../telegram/telegram.service';

export function resolveVisibleGroupIds(
  callerRole: string,
  adminOwnedGroups: Array<{ id: string; courseId: string }>,
  curatorGroupIds: string[],
): string[] {
  if (callerRole === 'curator') {
    const ownedIds = new Set(adminOwnedGroups.map((g) => g.id));
    return curatorGroupIds.filter((id) => ownedIds.has(id));
  }
  return adminOwnedGroups.map((g) => g.id);
}

@Injectable()
export class SchoolsService {
  constructor(
    private practiceBlocksService: PracticeBlocksService,
    private storageService: StorageService,
    private telegramService: TelegramService,
  ) {}

  private async resolveVideoDuration(block: { id: string; hlsMasterKey: string | null; durationSec: number | null }) {
    if (block.durationSec) return block.durationSec;
    if (!block.hlsMasterKey) return null;
    try {
      const manifest = await this.storageService.getObjectText(block.hlsMasterKey);
      const durationSec = Math.ceil(
        [...manifest.matchAll(/#EXTINF:([0-9.]+)/g)].reduce((total, match) => total + Number(match[1]), 0),
      );
      if (durationSec > 0) {
        await db.update(contentBlocks).set({ durationSec }).where(eq(contentBlocks.id, block.id));
        return durationSec;
      }
    } catch {
      return null;
    }
    return null;
  }

  private async getOrCreateSchool(adminId: string) {
    let school = await db.query.schools.findFirst({ where: eq(schools.adminId, adminId) });
    if (!school) {
      [school] = await db.insert(schools).values({ adminId, inviteToken: randomUUID() }).returning();
    }
    return school;
  }

  private paginate<T>(rows: T[], limit = 7, offset = 0) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safeOffset = Math.max(0, offset);
    return {
      items: rows.slice(safeOffset, safeOffset + safeLimit),
      total: rows.length,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private withInviteRateLimit(school: typeof schools.$inferSelect) {
    const windowStartedAt = school.inviteRegenerationWindowStartedAt;
    const windowExpired = !windowStartedAt || Date.now() - windowStartedAt.getTime() >= 24 * 60 * 60 * 1000;
    const used = windowExpired ? 0 : school.inviteRegenerationCount;
    return {
      ...school,
      inviteRegenerationsRemaining: Math.max(0, 2 - used),
      inviteRegenerationResetAt: windowExpired || !windowStartedAt
        ? null
        : new Date(windowStartedAt.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  async getSchool(adminId: string) {
    return this.withInviteRateLimit(await this.getOrCreateSchool(adminId));
  }

  async updateSchool(adminId: string, data: { name?: string; description?: string }) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db.update(schools).set(data).where(eq(schools.id, school.id)).returning();
    return updated;
  }

  async regenerateInviteToken(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select ${schools.id} from ${schools} where ${schools.id} = ${school.id} for update`);
      const current = await tx.query.schools.findFirst({ where: eq(schools.id, school.id) });
      if (!current) throw new NotFoundException('School not found');

      const now = new Date();
      const windowExpired = !current.inviteRegenerationWindowStartedAt
        || now.getTime() - current.inviteRegenerationWindowStartedAt.getTime() >= 24 * 60 * 60 * 1000;
      const used = windowExpired ? 0 : current.inviteRegenerationCount;
      if (used >= 2) {
        throw new HttpException(
          "Maktab havolasini 24 soat ichida faqat 2 marta yangilash mumkin.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const [updated] = await tx
        .update(schools)
        .set({
          inviteToken: randomUUID(),
          inviteRegenerationCount: used + 1,
          inviteRegenerationWindowStartedAt: windowExpired ? now : current.inviteRegenerationWindowStartedAt,
        })
        .where(eq(schools.id, school.id))
        .returning();
      return this.withInviteRateLimit(updated);
    });
  }

  async getJoinPreview(token: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');
    return { schoolName: school.name };
  }

  async joinByToken(token: string, studentId: string) {
    const school = await db.query.schools.findFirst({ where: eq(schools.inviteToken, token) });
    if (!school) throw new NotFoundException('Invite link not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) throw new ConflictException('Already a member of this school');

    const [member] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role: 'student' })
      .returning();
    return member;
  }

  async createStudent(adminId: string, input: { name: string; phone: string; email: string; password: string }) {
    const school = await this.getOrCreateSchool(adminId);
    const phone = this.telegramService.normalizePhone(input.phone).replace(/^\+/, '');
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!/^\+?998\d{9}$/.test(phone)) {
      throw new BadRequestException("Telefon raqami +998 XX XXX XX XX formatida bo'lishi kerak.");
    }

    const existing = await db.query.users.findFirst({
      where: or(eq(users.email, email), eq(users.phone, phone), eq(users.phone, `+${phone}`)),
    });
    if (existing) throw new ConflictException('Bu email yoki telefon allaqachon ishlatilgan.');

    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      return await db.transaction(async (tx) => {
        const [student] = await tx
          .insert(users)
          .values({ email, phone, name, passwordHash, role: 'student' })
          .returning({
            id: users.id,
            email: users.email,
            name: users.displayName,
            phone: users.phone,
            role: users.role,
            avatarUrl: users.displayAvatarUrl,
          });
        const [member] = await tx
          .insert(schoolMembers)
          .values({ schoolId: school.id, studentId: student.id, role: 'student' })
          .returning({ id: schoolMembers.id, joinedAt: schoolMembers.joinedAt });
        return { student, membership: member };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ConflictException('O\'quvchini yaratib bo\'lmadi: email yoki telefon band.');
    }
  }

  async findStaff(adminId: string, limit = 7, offset = 0) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), ne(schoolMembers.role, 'student')),
      with: { student: true },
    });
    const rows = members.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      name: m.student.displayName,
      email: m.student.email,
      avatarUrl: m.student.displayAvatarUrl,
      role: m.role,
    }));
    return this.paginate(rows, limit, offset);
  }

  private async findCuratorGroupIds(callerId: string) {
    const memberships = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.studentId, callerId), eq(schoolMembers.role, 'curator')),
      with: { enrollments: true },
    });
    return memberships.flatMap((m) => m.enrollments.filter((e) => !e.removedAt).map((e) => e.groupId));
  }

  async resolveSchoolAdminIdForCaller(callerId: string, callerRole: string): Promise<string> {
    if (callerRole !== 'curator') return callerId;
    const membership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, callerId), eq(schoolMembers.role, 'curator')),
      with: { school: true },
    });
    if (!membership) throw new NotFoundException('Curator has no school membership');
    return membership.school.adminId;
  }

  async listAllStudents(adminId: string, callerId: string, callerRole: string, limit = 7, offset = 0, query = '') {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    const adminGroups = courseIds.length
      ? await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) })
      : [];
    const curatorGroupIds = callerRole === 'curator' ? await this.findCuratorGroupIds(callerId) : [];
    const groupIds = resolveVisibleGroupIds(callerRole, adminGroups, curatorGroupIds);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));

    const rows = await Promise.all(
      members.map(async (m) => {
        if (groupIds.length === 0) {
          return callerRole === 'curator'
            ? null
            : {
                id: m.studentId,
                name: m.student.displayName,
                telegramName: m.student.customName && m.student.customName !== m.student.name ? m.student.name : null,
                phone: m.student.phone,
                avatarUrl: m.student.displayAvatarUrl,
                productsCount: 0,
                totalPaid: 0,
              };
        }
        const memberships = await db.query.groupEnrollments.findMany({
          where: (e, { inArray }) =>
            and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        });
        if (memberships.length === 0 && callerRole === 'curator') return null;
        const uniqueCourseIds = new Set(
          memberships
            .map((e) => groupById.get(e.groupId)?.courseId)
            .filter((courseId): courseId is string => Boolean(courseId)),
        );
        const enrollmentIds = memberships.map((e) => e.id);
        let totalPaid = 0;
        if (enrollmentIds.length > 0) {
          const payments = await db.query.monthlyPayments.findMany({
            where: (mp, { inArray }) => inArray(mp.enrollmentId, enrollmentIds),
          });
          totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        }
        return {
          id: m.studentId,
          name: m.student.displayName,
          telegramName: m.student.customName && m.student.customName !== m.student.name ? m.student.name : null,
          phone: m.student.phone,
          avatarUrl: m.student.displayAvatarUrl,
          productsCount: uniqueCourseIds.size,
          totalPaid,
        };
      }),
    ).then((rows) => rows.filter((row): row is NonNullable<typeof row> => row !== null));
    const normalizedQuery = query.trim().toLowerCase();
    const filteredRows = normalizedQuery
      ? rows.filter((row) => row.name.toLowerCase().includes(normalizedQuery) || (row.phone ?? '').toLowerCase().includes(normalizedQuery))
      : rows;
    return this.paginate(filteredRows, limit, offset);
  }

  async listEnrollments(adminId: string, callerId: string, callerRole: string, limit = 7, offset = 0, query = '', courseFilter = '') {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return this.paginate([], limit, offset);
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    const adminGroups = await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) });
    const curatorGroupIds = callerRole === 'curator' ? await this.findCuratorGroupIds(callerId) : [];
    const groupIds = resolveVisibleGroupIds(callerRole, adminGroups, curatorGroupIds);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    if (groupIds.length === 0) return this.paginate([], limit, offset);

    const rows: Array<{
      studentId: string;
      studentName: string;
      studentTelegramName: string | null;
      studentPhone: string | null;
      studentAvatarUrl: string | null;
      active: boolean;
      courseId: string;
      courseTitle: string;
      groupName: string;
      planName: string | null;
      joinedAt: string | null;
      lessonsCompleted: number;
      lessonsTotal: number;
      progressPercent: number;
      starsEarned: number;
      starsMax: number;
    }> = [];

    const seenStudentCourses = new Set<string>();
    for (const m of members) {
      const memberships = await db.query.groupEnrollments.findMany({
        where: (e, { inArray }) => and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        with: { selectedPlan: true },
      });

      for (const enrollment of memberships) {
        const group = groupById.get(enrollment.groupId);
        if (!group) continue;
        const course = courseById.get(group.courseId);
        if (!course) continue;
        const studentCourseKey = `${m.studentId}:${course.id}`;
        if (seenStudentCourses.has(studentCourseKey)) continue;
        seenStudentCourses.add(studentCourseKey);

        const courseModules = await db.query.modules.findMany({ where: eq(modules.courseId, course.id) });
        const moduleIds = courseModules.map((mod) => mod.id);
        const courseLessons = moduleIds.length
          ? await db.query.lessons.findMany({
              where: (l, { inArray }) => and(inArray(l.moduleId, moduleIds), eq(l.status, 'published')),
            })
          : [];

        let starsEarned = 0;
        let starsMax = 0;
        let lessonsCompleted = 0;
        for (const lesson of courseLessons) {
          const completion = await db.query.lessonCompletions.findFirst({
            where: and(eq(lessonCompletions.lessonId, lesson.id), eq(lessonCompletions.studentId, m.studentId)),
          });
          if (completion) lessonsCompleted += 1;
          if (lesson.completionScore !== null) {
            starsMax += lesson.completionScore;
            if (completion) starsEarned += lesson.completionScore;
          }
          const studentPracticeBlocks = await this.practiceBlocksService.findForStudent(lesson.id, m.studentId);
          for (const block of studentPracticeBlocks) {
            starsMax += block.maxScore ?? 0;
            starsEarned += block.earnedScore ?? 0;
          }
        }

        rows.push({
          studentId: m.studentId,
          studentName: m.student.displayName,
          studentTelegramName: m.student.customName && m.student.customName !== m.student.name ? m.student.name : null,
          studentPhone: m.student.phone,
          studentAvatarUrl: m.student.displayAvatarUrl,
          active: !enrollment.forcedClosed,
          courseId: course.id,
          courseTitle: course.title,
          groupName: group.name,
          planName: enrollment.selectedPlan?.name ?? null,
          joinedAt: enrollment.joinedAt?.toISOString() ?? null,
          lessonsCompleted,
          lessonsTotal: courseLessons.length,
          progressPercent: courseLessons.length > 0 ? Math.round((lessonsCompleted / courseLessons.length) * 100) : 0,
          starsEarned,
          starsMax,
        });
      }
    }

    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCourse = courseFilter.trim().toLowerCase();
    const filteredRows = normalizedQuery
      ? rows.filter((row) =>
          row.studentName.toLowerCase().includes(normalizedQuery)
          || (row.studentTelegramName ?? '').toLowerCase().includes(normalizedQuery)
          || (row.studentPhone ?? '').toLowerCase().includes(normalizedQuery)
          || row.courseTitle.toLowerCase().includes(normalizedQuery),
        )
      : rows;
    return this.paginate(
      normalizedCourse ? filteredRows.filter((row) => row.courseTitle.toLowerCase() === normalizedCourse) : filteredRows,
      limit,
      offset,
    );
  }

  async getStudentCourseProgress(
    adminId: string,
    studentId: string,
    courseId: string,
    callerId: string,
    callerRole: string,
  ) {
    const school = await this.getOrCreateSchool(adminId);
    const member = await db.query.schoolMembers.findFirst({
      where: and(
        eq(schoolMembers.schoolId, school.id),
        eq(schoolMembers.studentId, studentId),
        eq(schoolMembers.role, 'student'),
      ),
      with: { student: true },
    });
    if (!member) throw new NotFoundException("O'quvchi topilmadi");

    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Kurs topilmadi');

    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, course.id) });
    const groupIds = courseGroups.map((group) => group.id);
    const enrollment = groupIds.length
      ? await db.query.groupEnrollments.findFirst({
          where: and(
            eq(groupEnrollments.schoolMemberId, member.id),
            inArray(groupEnrollments.groupId, groupIds),
            isNull(groupEnrollments.removedAt),
          ),
        })
      : null;
    if (!enrollment) throw new NotFoundException("O'quvchi bu kursga biriktirilmagan");

    if (callerRole === 'curator') {
      const curatorGroupIds = await this.findCuratorGroupIds(callerId);
      if (!curatorGroupIds.includes(enrollment.groupId)) {
        throw new NotFoundException("O'quvchi topilmadi");
      }
    }

    const group = courseGroups.find((item) => item.id === enrollment.groupId);
    const courseModules = (await db.query.modules.findMany({ where: eq(modules.courseId, course.id) }))
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const moduleIds = courseModules.map((module) => module.id);
    const publishedLessons = moduleIds.length
      ? await db.query.lessons.findMany({
          where: and(inArray(lessons.moduleId, moduleIds), eq(lessons.status, 'published')),
        })
      : [];
    const moduleOrder = new Map(courseModules.map((module) => [module.id, module.orderIndex]));
    const orderedLessons = publishedLessons.sort(
      (a, b) => (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0) || a.orderIndex - b.orderIndex,
    );
    const lessonIds = orderedLessons.map((lesson) => lesson.id);

    const completions = lessonIds.length
      ? await db.query.lessonCompletions.findMany({
          where: and(eq(lessonCompletions.studentId, studentId), inArray(lessonCompletions.lessonId, lessonIds)),
        })
      : [];
    const completionByLessonId = new Map(completions.map((completion) => [completion.lessonId, completion]));

    const blocks = lessonIds.length
      ? await db.query.contentBlocks.findMany({
          where: and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, 'video')),
        })
      : [];
    const blockIds = blocks.map((block) => block.id);
    const segments = blockIds.length
      ? await db.query.videoWatchSegments.findMany({
          where: and(eq(videoWatchSegments.studentId, studentId), inArray(videoWatchSegments.contentBlockId, blockIds)),
        })
      : [];
    const durationByBlockId = new Map(
      await Promise.all(blocks.map(async (block) => [block.id, await this.resolveVideoDuration(block)] as const)),
    );
    const segmentsByBlockId = new Map<string, typeof segments>();
    for (const segment of segments) {
      const current = segmentsByBlockId.get(segment.contentBlockId) ?? [];
      current.push(segment);
      segmentsByBlockId.set(segment.contentBlockId, current);
    }
    const blocksByLessonId = new Map<string, typeof blocks>();
    for (const block of blocks) {
      const current = blocksByLessonId.get(block.lessonId) ?? [];
      current.push(block);
      blocksByLessonId.set(block.lessonId, current);
    }

    const moduleById = new Map(courseModules.map((module) => [module.id, module]));
    const lessonActivity = new Map<string, Date>();
    for (const completion of completions) {
      if (completion.completedAt) lessonActivity.set(completion.lessonId, completion.completedAt);
    }
    for (const block of blocks) {
      const lastSegment = (segmentsByBlockId.get(block.id) ?? []).reduce<Date | null>(
        (latest, segment) => !latest || (segment.updatedAt && segment.updatedAt > latest) ? segment.updatedAt : latest,
        null,
      );
      if (lastSegment && (!lessonActivity.get(block.lessonId) || lastSegment > lessonActivity.get(block.lessonId)!)) {
        lessonActivity.set(block.lessonId, lastSegment);
      }
    }

    const practiceBlocksByLessonId = new Map(
      await Promise.all(orderedLessons.map(async (lesson) => [
        lesson.id,
        await this.practiceBlocksService.findForStudent(lesson.id, studentId),
      ] as const)),
    );
    for (const [lessonId, practiceBlocks] of practiceBlocksByLessonId) {
      for (const practiceBlock of practiceBlocks) {
        const activityTimes = [
          ...practiceBlock.submissions.map((submission) => new Date(submission.submittedAt)),
          ...practiceBlock.imageSubmissions.map((submission) => new Date(submission.submittedAt)),
        ];
        for (const activityTime of activityTimes) {
          if (!lessonActivity.get(lessonId) || activityTime > lessonActivity.get(lessonId)!) {
            lessonActivity.set(lessonId, activityTime);
          }
        }
      }
    }

    const incompleteLessons = orderedLessons.filter((lesson) => !completionByLessonId.has(lesson.id));
    const currentLesson = [...incompleteLessons]
      .filter((lesson) => lessonActivity.has(lesson.id))
      .sort((a, b) => (lessonActivity.get(b.id)?.getTime() ?? 0) - (lessonActivity.get(a.id)?.getTime() ?? 0))[0]
      ?? incompleteLessons[0]
      ?? null;
    const lastActivityAt = [...lessonActivity.values()]
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?? null;

    return {
      student: { id: member.studentId, name: member.student.displayName, phone: member.student.phone, avatarUrl: member.student.displayAvatarUrl },
      course: { id: course.id, title: course.title, groupName: group?.name ?? '—', joinedAt: enrollment.joinedAt?.toISOString() ?? null },
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      lessonsCompleted: completions.length,
      lessonsTotal: orderedLessons.length,
      progressPercent: orderedLessons.length ? Math.round((completions.length / orderedLessons.length) * 100) : 0,
      currentLessonId: currentLesson?.id ?? null,
      lessons: orderedLessons.map((lesson) => {
        const completion = completionByLessonId.get(lesson.id);
        const videoBlocks = (blocksByLessonId.get(lesson.id) ?? [])
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((block) => {
            const durationSec = durationByBlockId.get(block.id) ?? null;
            const watchedSegments = (segmentsByBlockId.get(block.id) ?? [])
              .sort((a, b) => a.startSec - b.startSec)
              .map((segment) => ({ startSec: segment.startSec, endSec: segment.endSec }));
            const watchedSec = watchedSegments.reduce((total, segment) => total + Math.max(0, segment.endSec - segment.startSec), 0);
            return {
              id: block.id,
              label: block.label || block.fileName || 'Video',
              durationSec,
              watchedPercent: durationSec ? Math.min(100, Math.round((watchedSec / durationSec) * 100)) : null,
              lastWatchedAt: (segmentsByBlockId.get(block.id) ?? [])
                .reduce<Date | null>((latest, segment) => !latest || (segment.updatedAt && segment.updatedAt > latest) ? segment.updatedAt : latest, null)
                ?.toISOString() ?? null,
              segments: watchedSegments,
            };
          });
        return {
          id: lesson.id,
          moduleTitle: moduleById.get(lesson.moduleId)?.title ?? 'Modul',
          title: lesson.title,
          completedAt: completion?.completedAt?.toISOString() ?? null,
          completionScore: lesson.completionScore,
          earnedCompletionScore: completion ? lesson.completionScore : 0,
          status: completion ? 'completed' : lesson.id === currentLesson?.id ? 'current' : 'not_started',
          videoBlocks,
          practiceBlocks: (practiceBlocksByLessonId.get(lesson.id) ?? []).map((block) => ({
            id: block.id,
            type: block.type,
            title: block.testName || (block.type === 'image' ? 'Rasmli topshiriq' : block.type === 'oral' ? 'Jonli savol-javob' : 'Test topshirig‘i'),
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: block.earnedScore,
            submissions: block.submissions,
            imageSubmissions: block.imageSubmissions,
            oralGrade: block.oralGrade,
          })),
        };
      }),
    };
  }

  async updateStudentName(adminId: string, studentId: string, name: string) {
    const school = await this.getOrCreateSchool(adminId);
    const member = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    if (!member) throw new NotFoundException('Student not found in this school');
    const trimmedName = name.trim();
    if (!trimmedName) throw new BadRequestException("O'quvchi ismi bo'sh bo'lishi mumkin emas.");
    const [updated] = await db.update(users).set({ customName: trimmedName }).where(eq(users.id, studentId)).returning();
    return { id: updated.id, name: updated.displayName, telegramName: updated.name, phone: updated.phone, avatarUrl: updated.displayAvatarUrl };
  }

  async findStudentsWithoutGroup(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    const adminGroups = courseIds.length
      ? await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) })
      : [];
    const groupIds = adminGroups.map((g) => g.id);

    const result: { id: string; name: string; phone: string | null; avatarUrl: string | null; joinedAt: Date | null }[] = [];
    for (const m of members) {
      if (groupIds.length === 0) {
        result.push({ id: m.studentId, name: m.student.displayName, phone: m.student.phone, avatarUrl: m.student.displayAvatarUrl, joinedAt: m.joinedAt });
        continue;
      }
      const activeEnrollment = await db.query.groupEnrollments.findFirst({
        where: (e, { inArray }) => and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
      });
      if (!activeEnrollment) {
        result.push({ id: m.studentId, name: m.student.displayName, phone: m.student.phone, avatarUrl: m.student.displayAvatarUrl, joinedAt: m.joinedAt });
      }
    }
    return result;
  }

  async searchStudents(adminId: string, query: string) {
    await this.getOrCreateSchool(adminId);
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const rows = await db.query.users.findMany({
      where: and(eq(users.role, 'student'), or(ilike(users.displayName, q), ilike(users.phone, q))),
      limit: 20,
    });
    return rows.map((u) => ({ id: u.id, name: u.displayName, phone: u.phone, email: u.email, avatarUrl: u.displayAvatarUrl }));
  }

  async addStaff(adminId: string, studentId: string, role: string) {
    const school = await this.getOrCreateSchool(adminId);
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!student) throw new BadRequestException('Student not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    const existingIsStaff = existing?.role === 'curator' || existing?.role === 'teacher_staff';
    if (!existingIsStaff) {
      const staffMembers = await db.query.schoolMembers.findMany({
        where: and(
          eq(schoolMembers.schoolId, school.id),
          inArray(schoolMembers.role, ['curator', 'teacher_staff']),
        ),
        columns: { id: true },
      });
      if (staffMembers.length >= 30) {
        throw new BadRequestException("Bitta maktabga maksimal 30 ta xodim qo'shish mumkin.");
      }
    }
    if (existing) {
      const [updated] = await db
        .update(schoolMembers)
        .set({ role })
        .where(eq(schoolMembers.id, existing.id))
        .returning();
      return { ...updated, name: student.displayName, email: student.email, avatarUrl: student.displayAvatarUrl };
    }

    const [created] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role })
      .returning();
    return { ...created, name: student.displayName, email: student.email, avatarUrl: student.displayAvatarUrl };
  }

  private async assertStaffOwnership(memberId: string, adminId: string) {
    const member = await db.query.schoolMembers.findFirst({ where: eq(schoolMembers.id, memberId) });
    if (!member) throw new NotFoundException('Staff member not found');
    const school = await db.query.schools.findFirst({
      where: and(eq(schools.id, member.schoolId), eq(schools.adminId, adminId)),
    });
    if (!school) throw new NotFoundException('Staff member not found');
  }

  async removeStaff(memberId: string, adminId: string) {
    await this.assertStaffOwnership(memberId, adminId);
    await db.delete(schoolMembers).where(eq(schoolMembers.id, memberId));
  }
}
