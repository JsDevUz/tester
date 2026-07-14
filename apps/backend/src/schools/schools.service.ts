import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { schools, schoolMembers, users, courses, groups, groupEnrollments, monthlyPayments, modules, lessons, lessonCompletions, contentBlocks, videoWatchSegments } from '../db/schema';
import { and, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PracticeBlocksService, computeCombinedPercent } from '../practice-blocks/practice-blocks.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SchoolsService {
  constructor(
    private practiceBlocksService: PracticeBlocksService,
    private storageService: StorageService,
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

  async getSchool(adminId: string) {
    return this.getOrCreateSchool(adminId);
  }

  async updateSchool(adminId: string, data: { name?: string; description?: string }) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db.update(schools).set(data).where(eq(schools.id, school.id)).returning();
    return updated;
  }

  async regenerateInviteToken(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const [updated] = await db
      .update(schools)
      .set({ inviteToken: randomUUID() })
      .where(eq(schools.id, school.id))
      .returning();
    return updated;
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

  async findStaff(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), ne(schoolMembers.role, 'student')),
      with: { student: true },
    });
    return members.map((m) => ({
      id: m.id,
      studentId: m.studentId,
      name: m.student.name,
      email: m.student.email,
      role: m.role,
    }));
  }

  async listAllStudents(adminId: string) {
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
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));

    return Promise.all(
      members.map(async (m) => {
        if (groupIds.length === 0) {
          return {
            id: m.studentId,
            name: m.student.name,
            phone: m.student.phone,
            productsCount: 0,
            totalPaid: 0,
          };
        }
        const memberships = await db.query.groupEnrollments.findMany({
          where: (e, { inArray }) =>
            and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
        });
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
          name: m.student.name,
          phone: m.student.phone,
          productsCount: uniqueCourseIds.size,
          totalPaid,
        };
      }),
    );
  }

  async listEnrollments(adminId: string) {
    const school = await this.getOrCreateSchool(adminId);
    const members = await db.query.schoolMembers.findMany({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.role, 'student')),
      with: { student: true },
    });

    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    const adminGroups = await db.query.groups.findMany({ where: (g, { inArray }) => inArray(g.courseId, courseIds) });
    const groupIds = adminGroups.map((g) => g.id);
    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    if (groupIds.length === 0) return [];

    const rows: Array<{
      studentId: string;
      studentName: string;
      studentPhone: string | null;
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
          studentName: m.student.name,
          studentPhone: m.student.phone,
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

    return rows;
  }

  async getStudentCourseProgress(adminId: string, studentId: string, courseId: string) {
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
      student: { id: member.studentId, name: member.student.name, phone: member.student.phone },
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

    const result: { id: string; name: string; phone: string | null; joinedAt: Date | null }[] = [];
    for (const m of members) {
      if (groupIds.length === 0) {
        result.push({ id: m.studentId, name: m.student.name, phone: m.student.phone, joinedAt: m.joinedAt });
        continue;
      }
      const activeEnrollment = await db.query.groupEnrollments.findFirst({
        where: (e, { inArray }) => and(eq(e.schoolMemberId, m.id), inArray(e.groupId, groupIds), isNull(e.removedAt)),
      });
      if (!activeEnrollment) {
        result.push({ id: m.studentId, name: m.student.name, phone: m.student.phone, joinedAt: m.joinedAt });
      }
    }
    return result;
  }

  async searchStudents(adminId: string, query: string) {
    await this.getOrCreateSchool(adminId);
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const rows = await db.query.users.findMany({
      where: and(eq(users.role, 'student'), or(ilike(users.name, q), ilike(users.phone, q))),
      limit: 20,
    });
    return rows.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email }));
  }

  async addStaff(adminId: string, studentId: string, role: string) {
    const school = await this.getOrCreateSchool(adminId);
    const student = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!student) throw new BadRequestException('Student not found');

    const existing = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (existing) {
      const [updated] = await db
        .update(schoolMembers)
        .set({ role })
        .where(eq(schoolMembers.id, existing.id))
        .returning();
      return { ...updated, name: student.name, email: student.email };
    }

    const [created] = await db
      .insert(schoolMembers)
      .values({ schoolId: school.id, studentId, role })
      .returning();
    return { ...created, name: student.name, email: student.email };
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
