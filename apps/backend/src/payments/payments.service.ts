import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupMembers, monthlyPayments } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';

function computeStatus(expectedAmount: number, discountAmount: number, paidAmount: number): string {
  const due = expectedAmount - discountAmount;
  if (paidAmount >= due) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'pending';
}

@Injectable()
export class PaymentsService {
  private async assertGroupOwnership(groupId: string, adminId: string) {
    const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) throw new NotFoundException('Group not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, group.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Group not found');
  }

  async findByGroup(groupId: string, adminId: string) {
    await this.assertGroupOwnership(groupId, adminId);
    const members = await db.query.groupMembers.findMany({ where: eq(groupMembers.groupId, groupId) });
    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) return [];
    const payments = await db.query.monthlyPayments.findMany({
      where: (table, { inArray }) => inArray(table.groupMemberId, memberIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    return payments;
  }

  private async assertPaymentOwnership(paymentId: string, adminId: string) {
    const payment = await db.query.monthlyPayments.findFirst({ where: eq(monthlyPayments.id, paymentId) });
    if (!payment) throw new NotFoundException('Payment not found');
    const member = await db.query.groupMembers.findFirst({ where: eq(groupMembers.id, payment.groupMemberId) });
    if (!member) throw new NotFoundException('Payment not found');
    await this.assertGroupOwnership(member.groupId, adminId);
    return payment;
  }

  async recordPayment(
    paymentId: string,
    adminId: string,
    amount: number,
    discount?: number,
    method?: string,
    note?: string,
    receiptUrl?: string,
  ) {
    const payment = await this.assertPaymentOwnership(paymentId, adminId);
    const nextPaidAmount = payment.paidAmount + amount;
    const nextDiscountAmount = discount ?? payment.discountAmount;
    const nextStatus = computeStatus(payment.expectedAmount, nextDiscountAmount, nextPaidAmount);

    const [updated] = await db
      .update(monthlyPayments)
      .set({
        paidAmount: nextPaidAmount,
        discountAmount: nextDiscountAmount,
        status: nextStatus,
        ...(method !== undefined ? { paymentMethod: method } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(monthlyPayments.id, paymentId))
      .returning();
    return updated;
  }

  async findAllForAdmin(adminId: string) {
    const adminCourses = await db.query.courses.findMany({ where: eq(courses.adminId, adminId) });
    const courseIds = adminCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];

    const courseGroups = await db.query.groups.findMany({
      where: (table, { inArray }) => inArray(table.courseId, courseIds),
    });
    const groupIds = courseGroups.map((g) => g.id);
    if (groupIds.length === 0) return [];

    const members = await db.query.groupMembers.findMany({
      where: (table, { inArray }) => inArray(table.groupId, groupIds),
      with: { student: true, selectedPlan: true },
    });
    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) return [];

    const payments = await db.query.monthlyPayments.findMany({
      where: (table, { inArray }) => inArray(table.groupMemberId, memberIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });

    const groupById = new Map(courseGroups.map((g) => [g.id, g]));
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));
    const memberById = new Map(members.map((m) => [m.id, m]));

    return payments.map((p) => {
      const member = memberById.get(p.groupMemberId)!;
      const group = groupById.get(member.groupId)!;
      const course = courseById.get(group.courseId)!;
      return {
        id: p.id,
        groupMemberId: p.groupMemberId,
        periodMonth: p.periodMonth,
        expectedAmount: p.expectedAmount,
        discountAmount: p.discountAmount,
        paidAmount: p.paidAmount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        note: p.note,
        receiptUrl: p.receiptUrl,
        updatedAt: p.updatedAt,
        studentName: member.student.name,
        studentPhone: member.student.phone,
        courseTitle: course.title,
        groupName: group.name,
        planName: member.selectedPlan?.name ?? null,
      };
    });
  }
}
