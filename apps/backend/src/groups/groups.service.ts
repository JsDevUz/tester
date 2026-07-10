import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { contentBlocks, courses, groups, groupEnrollments, lessons, modules, monthlyPayments, pricingPlans, schoolMembers, schools } from '../db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { StudentAccessService } from '../payments/student-access.service';

@Injectable()
export class GroupsService {
  constructor(private studentAccessService: StudentAccessService) {}

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
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    return this.findOrCreateEnrollment(groupId, schoolMember.id);
  }

  async assignCuratorFromStaff(groupId: string, adminId: string, studentId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const schoolMember = await this.findOrCreateSchoolMember(adminId, studentId);
    if (schoolMember.role !== 'curator') {
      await db.update(schoolMembers).set({ role: 'curator' }).where(eq(schoolMembers.id, schoolMember.id));
    }
    return this.findOrCreateEnrollment(groupId, schoolMember.id);
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
          studentName: e.schoolMember.student.name,
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
        return {
          courseId: e.group.courseId,
          courseTitle: e.group.course.title,
          groupName: e.group.name,
          selectedPlanName: e.selectedPlan?.name ?? null,
          latestPaymentStatus: latestPayment?.status ?? null,
          hasAccess,
        };
      }),
    );
  }

  async getMyCourseDetail(courseId: string, studentId: string) {
    const hasAccess = await this.studentAccessService.assertStudentLessonAccess(courseId, studentId);
    if (!hasAccess) throw new BadRequestException("To'lov muddati kelgan, lekin to'lanmagan");

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
      curatorEnrollment?.schoolMember.student.name ?? null;

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
