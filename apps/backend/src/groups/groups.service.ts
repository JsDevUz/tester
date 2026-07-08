import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupMembers, pricingPlans, monthlyPayments } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';
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
    const members = await db.query.groupMembers.findMany({
      where: eq(groupMembers.groupId, groupId),
      with: { student: true, selectedPlan: true },
    });
    const withLatestPayment = await Promise.all(
      members.map(async (member) => {
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.groupMemberId, member.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return { ...member, latestPayment: latestPayment ?? null };
      }),
    );
    return withLatestPayment;
  }

  async updateMember(
    groupId: string,
    memberId: string,
    adminId: string,
    data: { role?: string; selectedPlanId?: string | null },
  ) {
    await this.assertGroupOwnership(groupId, adminId);
    const member = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)),
    });
    if (!member) throw new NotFoundException('Member not found');
    if (data.selectedPlanId) {
      const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, data.selectedPlanId) });
      if (!plan) throw new BadRequestException('Pricing plan not found');
    }
    const [updated] = await db.update(groupMembers).set(data).where(eq(groupMembers.id, memberId)).returning();
    return updated;
  }

  async setForcedClosed(groupId: string, memberId: string, adminId: string, forcedClosed: boolean) {
    await this.assertGroupOwnership(groupId, adminId);
    const member = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)),
    });
    if (!member) throw new NotFoundException('Member not found');
    const [updated] = await db
      .update(groupMembers)
      .set({ forcedClosed })
      .where(eq(groupMembers.id, memberId))
      .returning();
    return updated;
  }

  async removeMember(groupId: string, memberId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId)));
  }

  async getJoinPreview(token: string) {
    const group = await db.query.groups.findFirst({
      where: eq(groups.inviteToken, token),
      with: { course: true },
    });
    if (!group) throw new NotFoundException('Invite link not found');
    return { groupName: group.name, courseTitle: group.course.title };
  }

  async joinByToken(token: string, studentId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.inviteToken, token) });
    if (!group) throw new NotFoundException('Invite link not found');

    const existing = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.groupId, group.id), eq(groupMembers.studentId, studentId)),
    });
    if (existing) throw new ConflictException('Already a member of this group');

    const [member] = await db
      .insert(groupMembers)
      .values({ groupId: group.id, studentId, role: 'student', selectedPlanId: null })
      .returning();
    return member;
  }

  async getMyCourses(studentId: string) {
    const memberships = await db.query.groupMembers.findMany({
      where: eq(groupMembers.studentId, studentId),
      with: { group: { with: { course: true } }, selectedPlan: true },
    });

    return Promise.all(
      memberships.map(async (m) => {
        const hasAccess = await this.studentAccessService.assertStudentLessonAccess(
          m.group.courseId,
          studentId,
        );
        const latestPayment = await db.query.monthlyPayments.findFirst({
          where: eq(monthlyPayments.groupMemberId, m.id),
          orderBy: [desc(monthlyPayments.periodMonth)],
        });
        return {
          courseId: m.group.courseId,
          courseTitle: m.group.course.title,
          groupName: m.group.name,
          selectedPlanName: m.selectedPlan?.name ?? null,
          latestPaymentStatus: latestPayment?.status ?? null,
          hasAccess,
        };
      }),
    );
  }
}
