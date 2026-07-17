import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { contentBlocks, courses, groups, groupEnrollments, lessonCompletions, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools, users } from '../db/schema';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { StudentAccessService } from '../payments/student-access.service';
import { PaymentsService } from '../payments/payments.service';
import { PracticeBlocksService, computeTestPracticePercent } from '../practice-blocks/practice-blocks.service';

export function shouldBeCuratorRole(
  activeCuratorMemberships: Array<{ role: string; removedAt: Date | null }>,
): boolean {
  return activeCuratorMemberships.some((m) => m.role === 'curator' && m.removedAt === null);
}

// teacher/super users keep their higher role even when also assigned as a
// curator (schoolMembers.role='curator' still grants curator-scoped access
// elsewhere) — only student<->curator transitions are ever applied here.
export function resolveUserRoleAfterCuratorChange(
  currentRole: string,
  shouldBeCurator: boolean,
): string | null {
  if (currentRole === 'teacher' || currentRole === 'super') return null;
  if (shouldBeCurator && currentRole !== 'curator') return 'curator';
  if (!shouldBeCurator && currentRole === 'curator') return 'student';
  return null;
}

@Injectable()
export class GroupsService {
  constructor(
    private studentAccessService: StudentAccessService,
    private practiceBlocksService: PracticeBlocksService,
    private paymentsService: PaymentsService,
  ) {}

  private async assertGroupOwnership(groupId: string, adminId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) throw new NotFoundException('Group not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, group.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Group not found');
    return group;
  }

  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  private async getOrCreateSchool(adminId: string) {
    let school = await db.query.schools.findFirst({ where: eq(schools.adminId, adminId) });
    if (!school) {
      [school] = await db.insert(schools).values({ adminId, inviteToken: randomUUID() }).returning();
    }
    return school;
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
  }

  async create(courseId: string, adminId: string, name: string, paymentDay: number) {
    await this.assertCourseOwnership(courseId, adminId);
    const existingGroups = await db.query.groups.findMany({
      where: eq(groups.courseId, courseId),
      columns: { id: true },
    });
    if (existingGroups.length >= 4) {
      throw new BadRequestException("Bitta kursga maksimal 4 ta guruh ochish mumkin.");
    }
    const [group] = await db
      .insert(groups)
      .values({ courseId, name, paymentDay, inviteToken: randomUUID() })
      .returning();
    return group;
  }

  async update(
    id: string,
    adminId: string,
    data: { name?: string; groupChatEnabled?: boolean; groupChannelEnabled?: boolean; paymentDay?: number },
  ) {
    await this.assertGroupOwnership(id, adminId);
    const [updated] = await db.update(groups).set(data).where(eq(groups.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    await this.assertGroupOwnership(id, adminId);
    await db.delete(groups).where(eq(groups.id, id));
  }

  async findMembers(groupId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.groupId, groupId), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: { with: { student: true } }, selectedPlan: true },
    });
    const withLatestPayment = await Promise.all(
      enrollments.map(async (e) => {
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.enrollmentId, e.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return {
          id: e.id,
          groupId: e.groupId,
          studentId: e.schoolMember.studentId,
          role: e.schoolMember.role,
          selectedPlanId: e.selectedPlanId,
          forcedClosed: e.forcedClosed,
          joinedAt: e.joinedAt,
          student: e.schoolMember.student,
          selectedPlan: e.selectedPlan,
          latestPayment: latestPayment ?? null,
        };
      }),
    );
    return withLatestPayment;
  }

  async updateMember(
    groupId: string,
    memberId: string,
    adminId: string,
    data: { selectedPlanId?: string | null },
  ) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    if (data.selectedPlanId) {
      const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, data.selectedPlanId) });
      if (!plan) throw new BadRequestException('Pricing plan not found');
    }
    const [updated] = await db
      .update(groupEnrollments)
      .set({ selectedPlanId: data.selectedPlanId })
      .where(eq(groupEnrollments.id, memberId))
      .returning();

    if (data.selectedPlanId) {
      await this.paymentsService.ensureCurrentMonthPayment(memberId);
    }

    return updated;
  }

  async setForcedClosed(groupId: string, memberId: string, adminId: string, forcedClosed: boolean) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    const [updated] = await db
      .update(groupEnrollments)
      .set({ forcedClosed })
      .where(eq(groupEnrollments.id, memberId))
      .returning();
    return updated;
  }

  async removeMember(groupId: string, memberId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    await db
      .update(groupEnrollments)
      .set({ removedAt: new Date() })
      .where(and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)));
  }

  private async findOrCreateSchoolMember(adminId: string, studentId: string) {
    const school = await this.getOrCreateSchool(adminId);
    let member = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.schoolId, school.id), eq(schoolMembers.studentId, studentId)),
    });
    if (!member) throw new NotFoundException('Student is not a member of this school');
    return member;
  }

  private async syncUserRoleAfterCuratorChange(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({
      where: eq(schoolMembers.studentId, studentId),
      with: { enrollments: true },
    });
    const activeCuratorMemberships = memberships.flatMap((member) =>
      member.enrollments.map((enrollment) => ({ role: member.role, removedAt: enrollment.removedAt })),
    );
    const shouldBeCurator = shouldBeCuratorRole(activeCuratorMemberships);

    const user = await db.query.users.findFirst({ where: eq(users.id, studentId) });
    if (!user) return;

    const nextRole = resolveUserRoleAfterCuratorChange(user.role, shouldBeCurator);
    if (nextRole) {
      await db.update(users).set({ role: nextRole }).where(eq(users.id, studentId));
    }
  }

  private async findOrCreateEnrollment(groupId: string, schoolMemberId: string) {
    const existing = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.groupId, groupId), eq(groupEnrollments.schoolMemberId, schoolMemberId)),
    });
    if (existing && !existing.removedAt) return existing;
    if (existing) {
      const [reactivated] = await db
        .update(groupEnrollments)
        .set({ removedAt: null, joinedAt: new Date() })
        .where(eq(groupEnrollments.id, existing.id))
        .returning();
      return reactivated;
    }
    const [created] = await db
      .insert(groupEnrollments)
      .values({ groupId, schoolMemberId, selectedPlanId: null })
      .returning();
    return created;
  }

  async enrollStudent(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const targetGroup = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!targetGroup) throw new NotFoundException('Group not found');
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);

    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, targetGroup.courseId) });
    const courseGroupIds = courseGroups.map((g) => g.id);
    const existingInCourse = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, schoolMember.id),
        isNull(groupEnrollments.removedAt),
        inArray(groupEnrollments.groupId, courseGroupIds),
      ),
    });
    if (existingInCourse) {
      const existingGroup = courseGroups.find((g) => g.id === existingInCourse.groupId);
      throw new BadRequestException(
        `Bu o'quvchi shu kursning "${existingGroup?.name ?? 'boshqa'}" guruhida allaqachon a'zo`,
      );
    }

    return this.findOrCreateEnrollment(groupId, schoolMember.id);
  }

  async assignCuratorFromStaff(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    if (schoolMember.role !== 'curator') {
      await db.update(schoolMembers).set({ role: 'curator' }).where(eq(schoolMembers.id, schoolMember.id));
    }
    const enrollment = await this.findOrCreateEnrollment(groupId, schoolMember.id);
    await this.syncUserRoleAfterCuratorChange(studentId);
    return enrollment;
  }

  async demoteCuratorFromStaff(groupId: string, adminId: string, memberId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(eq(groupEnrollments.id, memberId), eq(groupEnrollments.groupId, groupId)),
      with: { schoolMember: true },
    });
    if (!enrollment) throw new NotFoundException('Member not found');
    if (enrollment.schoolMember.role === 'curator') {
      await db.update(schoolMembers).set({ role: 'student' }).where(eq(schoolMembers.id, enrollment.schoolMemberId));
      await this.syncUserRoleAfterCuratorChange(enrollment.schoolMember.studentId);
    }
    return enrollment;
  }

  async findPendingPlanAssignment(adminId: string) {
    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];

    const adminGroups = await db.query.groups.findMany({
      where: (g, { inArray }) => inArray(g.courseId, courseIds),
    });
    const groupIds = adminGroups.map((g) => g.id);
    if (groupIds.length === 0) return [];

    const pending = await db.query.groupEnrollments.findMany({
      where: (e, { inArray }) => and(inArray(e.groupId, groupIds), isNull(e.removedAt), isNull(e.selectedPlanId)),
      with: { schoolMember: { with: { student: true } } },
    });

    const groupById = new Map(adminGroups.map((g) => [g.id, g]));
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));

    return pending
      .filter((e) => e.schoolMember.role === 'student')
      .map((e) => {
        const group = groupById.get(e.groupId);
        const course = group ? courseById.get(group.courseId) : undefined;
        return {
          id: e.id,
          studentName: e.schoolMember.student.displayName,
          studentAvatarUrl: e.schoolMember.student.displayAvatarUrl,
          studentPhone: e.schoolMember.student.phone,
          groupName: group?.name ?? '',
          courseTitle: course?.title ?? '',
          joinedAt: e.joinedAt,
        };
      });
  }

  async getMyCourses(studentId: string) {
    const memberships = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = memberships.map((m) => m.id);
    if (schoolMemberIds.length === 0) return [];

    const enrollments = await db.query.groupEnrollments.findMany({
      where: (e, { inArray }) => and(inArray(e.schoolMemberId, schoolMemberIds), isNull(e.removedAt)),
      with: { group: { with: { course: true } }, selectedPlan: true },
    });

    return Promise.all(
      enrollments.map(async (e) => {
        const hasAccess = await this.studentAccessService.assertStudentLessonAccess(
          e.group.courseId,
          studentId,
        );
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.enrollmentId, e.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });

        const courseModules = await db.query.modules.findMany({ where: eq(modules.courseId, e.group.courseId) });
        const moduleIds = courseModules.map((m) => m.id);
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
            where: and(eq(lessonCompletions.lessonId, lesson.id), eq(lessonCompletions.studentId, studentId)),
          });
          if (completion) lessonsCompleted += 1;
          if (lesson.completionScore !== null) {
            starsMax += lesson.completionScore;
            if (completion) starsEarned += lesson.completionScore;
          }
          const studentPracticeBlocks = await this.practiceBlocksService.findForStudent(lesson.id, studentId);
          for (const block of studentPracticeBlocks) {
            starsMax += block.maxScore ?? 0;
            starsEarned += block.earnedScore ?? 0;
          }
        }

        const groupIds = await db.query.groups.findMany({ where: eq(groups.courseId, e.group.courseId) });
        const allGroupEnrollments = await db.query.groupEnrollments.findMany({
          where: (ge, { inArray }) =>
            and(inArray(ge.groupId, groupIds.map((g) => g.id)), isNull(ge.removedAt)),
        });
        const studentCount = new Set(allGroupEnrollments.map((ge) => ge.schoolMemberId)).size;

        const lessonsTotal = courseLessons.length;
        const progressPercent = lessonsTotal > 0 ? Math.round((lessonsCompleted / lessonsTotal) * 100) : 0;

        return {
          courseId: e.group.courseId,
          courseTitle: e.group.course.title,
          groupName: e.group.name,
          selectedPlanName: e.selectedPlan?.name ?? null,
          latestPaymentStatus: latestPayment?.status ?? null,
          hasAccess,
          starsEarned,
          starsMax,
          studentCount,
          lessonsCompleted,
          lessonsTotal,
          progressPercent,
        };
      }),
    );
  }

  async getMyCourseLeaderboard(courseId: string, studentId: string) {
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    if (!course) throw new NotFoundException('Kurs topilmadi');

    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    const groupIds = courseGroups.map((group) => group.id);
    if (groupIds.length === 0) return { courseTitle: course.title, entries: [] };

    const enrollments = await db.query.groupEnrollments.findMany({
      where: (enrollment, { inArray }) => and(inArray(enrollment.groupId, groupIds), isNull(enrollment.removedAt)),
      with: { schoolMember: { with: { student: true } } },
    });
    const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.schoolMember.studentId))];
    if (!studentIds.includes(studentId)) throw new NotFoundException('Kurs topilmadi');

    const courseModules = await db.query.modules.findMany({ where: eq(modules.courseId, courseId) });
    const moduleIds = courseModules.map((module) => module.id);
    const courseLessons = moduleIds.length
      ? await db.query.lessons.findMany({
          where: (lesson, { inArray }) => and(inArray(lesson.moduleId, moduleIds), eq(lesson.status, 'published')),
        })
      : [];

    const members = new Map(
      enrollments.map((enrollment) => [enrollment.schoolMember.studentId, enrollment.schoolMember.student]),
    );
    const scored = await Promise.all(studentIds.map(async (memberStudentId) => {
      let starsEarned = 0;
      let lessonsCompleted = 0;
      for (const lesson of courseLessons) {
        const completion = await db.query.lessonCompletions.findFirst({
          where: and(eq(lessonCompletions.lessonId, lesson.id), eq(lessonCompletions.studentId, memberStudentId)),
        });
        if (completion) lessonsCompleted += 1;
        if (lesson.completionScore !== null && completion) starsEarned += lesson.completionScore;
        const practice = await this.practiceBlocksService.findForStudent(lesson.id, memberStudentId);
        starsEarned += practice.reduce((total, block) => total + (block.earnedScore ?? 0), 0);
      }
      const member = members.get(memberStudentId)!;
      return {
        studentId: memberStudentId,
        studentName: member.displayName,
        studentAvatarUrl: member.displayAvatarUrl,
        starsEarned,
        lessonsCompleted,
        lessonsTotal: courseLessons.length,
        isCurrentStudent: memberStudentId === studentId,
      };
    }));

    return {
      courseTitle: course.title,
      entries: scored
        .sort((first, second) => second.starsEarned - first.starsEarned || second.lessonsCompleted - first.lessonsCompleted || first.studentName.localeCompare(second.studentName, 'uz'))
        .map((entry, index) => ({ ...entry, rank: index + 1 })),
    };
  }

  async getMyCourseDetail(courseId: string, studentId: string) {
    const access = await this.studentAccessService.getStudentLessonAccess(courseId, studentId);
    if (!access.allowed) {
      if (access.reason === 'forced_closed') {
        throw new BadRequestException('Siz ushbu kursdan chetlatilgansiz');
      }
      throw new BadRequestException("To'lov muddati kelgan, lekin to'lanmagan");
    }

    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    if (!course) throw new NotFoundException('Course not found');

    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    const courseGroupIds = courseGroups.map((group) => group.id);
    const curatorEnrollments = courseGroupIds.length
      ? await db.query.groupEnrollments.findMany({
          where: (enrollment, { inArray }) =>
            and(inArray(enrollment.groupId, courseGroupIds), isNull(enrollment.removedAt)),
          with: { schoolMember: { with: { student: true } } },
        })
      : [];
    const curatorEnrollment = curatorEnrollments.find((enrollment) => enrollment.schoolMember.role === 'curator');
    const curatorName =
      curatorEnrollment?.schoolMember.student.displayName ?? null;

    const courseModules = await db.query.modules.findMany({
      where: eq(modules.courseId, courseId),
      orderBy: [asc(modules.orderIndex), asc(modules.createdAt)],
    });

    const moduleRows = await Promise.all(
      courseModules.map(async (module) => {
        const moduleLessons = await db.query.lessons.findMany({
          where: and(eq(lessons.moduleId, module.id), eq(lessons.status, 'published')),
          orderBy: [asc(lessons.orderIndex), asc(lessons.createdAt)],
        });

        const lessonRows = await Promise.all(
          moduleLessons.map(async (lesson) => {
            const blocks = await db.query.contentBlocks.findMany({
              where: eq(contentBlocks.lessonId, lesson.id),
              orderBy: [asc(contentBlocks.orderIndex), asc(contentBlocks.createdAt)],
            });
            const studentPracticeBlocks = await this.practiceBlocksService.findForStudent(lesson.id, studentId);
            const combinedPracticePercent = computeTestPracticePercent(studentPracticeBlocks);
            const completion = await db.query.lessonCompletions.findFirst({
              where: and(eq(lessonCompletions.lessonId, lesson.id), eq(lessonCompletions.studentId, studentId)),
            });
            const allTestsAttempted = studentPracticeBlocks
              .filter((block) => block.type === 'test')
              .every((block) => block.submissions.length > 0);
            const thresholdMet =
              !lesson.passThresholdEnabled ||
              (combinedPracticePercent ?? 0) >= (lesson.passThresholdPercent ?? 0);
            return {
              ...lesson,
              blocks: blocks.map((block) => ({
                id: block.id,
                lessonId: block.lessonId,
                type: block.type,
                orderIndex: block.orderIndex,
                html: block.html,
                fileName: block.fileName,
                previewUrl: block.previewUrl,
                embedUrl: block.embedUrl,
                label: block.label,
                processingStatus: block.processingStatus,
                sourceKey: null,
                hlsMasterKey: null,
                hlsBaseKey: null,
                aesKeyRef: null,
                durationSec: block.durationSec,
                errorMessage: null,
                processedAt: block.processedAt,
                createdAt: block.createdAt,
              })),
              practiceBlocks: studentPracticeBlocks,
              passThresholdEnabled: lesson.passThresholdEnabled,
              passThresholdPercent: lesson.passThresholdPercent,
              completionScore: lesson.completionScore,
              completed: !!completion && allTestsAttempted && thresholdMet,
              combinedPracticePercent,
            };
          }),
        );

        return { ...module, lessons: lessonRows };
      }),
    );

    return {
      id: course.id,
      title: course.title,
      curatorName,
      modules: moduleRows,
    };
  }
}
