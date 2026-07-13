import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, groupEnrollments, monthlyPayments, paymentCancellations } from '../db/schema';
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
    const enrollments = await db.query.groupEnrollments.findMany({ where: eq(groupEnrollments.groupId, groupId) });
    const enrollmentIds = enrollments.map((e) => e.id);
    if (enrollmentIds.length === 0) return [];
    const payments = await db.query.monthlyPayments.findMany({
      where: (table, { inArray }) => inArray(table.enrollmentId, enrollmentIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    return payments.map((p) => ({ ...p, groupMemberId: p.enrollmentId }));
  }

  private async assertPaymentOwnership(paymentId: string, adminId: string) {
    const payment = await db.query.monthlyPayments.findFirst({ where: eq(monthlyPayments.id, paymentId) });
    if (!payment) throw new NotFoundException('Payment not found');
    const enrollment = await db.query.groupEnrollments.findFirst({ where: eq(groupEnrollments.id, payment.enrollmentId) });
    if (!enrollment) throw new NotFoundException('Payment not found');
    await this.assertGroupOwnership(enrollment.groupId, adminId);
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
    if (payment.status === 'cancelled') {
      throw new BadRequestException('Bekor qilingan to\'lovga pul kiritib bo\'lmaydi');
    }
    const nextPaidAmount = payment.paidAmount + amount;
    const nextDiscountAmount = discount ?? payment.discountAmount;
    const due = payment.expectedAmount - nextDiscountAmount;
    if (nextPaidAmount > due) {
      throw new BadRequestException(
        `Kiritilgan summa kutilayotgan to'lovdan (${due}) oshib ketmasligi kerak`,
      );
    }
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

  async cancelPayment(paymentId: string, adminId: string) {
    const payment = await this.assertPaymentOwnership(paymentId, adminId);
    if (payment.status === 'pending' && payment.paidAmount === 0) return payment;

    await db.insert(paymentCancellations).values({
      paymentId,
      cancelledByAdminId: adminId,
      cancelledPaidAmount: payment.paidAmount,
    });

    const [updated] = await db
      .update(monthlyPayments)
      .set({
        paidAmount: 0,
        discountAmount: 0,
        status: 'pending',
        paymentMethod: null,
        note: null,
        receiptUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(monthlyPayments.id, paymentId))
      .returning();

    const previousPeriod = new Date(
      Date.UTC(payment.periodMonth.getUTCFullYear(), payment.periodMonth.getUTCMonth() - 1, 1),
    );
    const previousPayment = await db.query.monthlyPayments.findFirst({
      where: and(eq(monthlyPayments.enrollmentId, payment.enrollmentId), eq(monthlyPayments.periodMonth, previousPeriod)),
    });
    if (previousPayment && (previousPayment.status === 'pending' || previousPayment.status === 'partial')) {
      await db
        .update(monthlyPayments)
        .set({ status: 'debt', updatedAt: new Date() })
        .where(eq(monthlyPayments.id, previousPayment.id));
    }

    return updated;
  }

  async listCancellations(paymentId: string, adminId: string) {
    await this.assertPaymentOwnership(paymentId, adminId);
    return db.query.paymentCancellations.findMany({
      where: eq(paymentCancellations.paymentId, paymentId),
      orderBy: [desc(paymentCancellations.cancelledAt)],
    });
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

    const enrollments = await db.query.groupEnrollments.findMany({
      where: (table, { inArray }) => inArray(table.groupId, groupIds),
      with: { schoolMember: { with: { student: true } }, selectedPlan: true },
    });
    const enrollmentIds = enrollments.map((e) => e.id);
    if (enrollmentIds.length === 0) return [];

    const payments = await db.query.monthlyPayments.findMany({
      where: (table, { inArray }) => inArray(table.enrollmentId, enrollmentIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });

    const groupById = new Map(courseGroups.map((g) => [g.id, g]));
    const courseById = new Map(adminCourses.map((c) => [c.id, c]));
    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

    return payments.map((p) => {
      const enrollment = enrollmentById.get(p.enrollmentId)!;
      const group = groupById.get(enrollment.groupId)!;
      const course = courseById.get(group.courseId)!;
      return {
        id: p.id,
        groupMemberId: p.enrollmentId,
        periodMonth: p.periodMonth,
        expectedAmount: p.expectedAmount,
        discountAmount: p.discountAmount,
        paidAmount: p.paidAmount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        note: p.note,
        receiptUrl: p.receiptUrl,
        updatedAt: p.updatedAt,
        studentName: enrollment.schoolMember.student.name,
        studentPhone: enrollment.schoolMember.student.phone,
        courseTitle: course.title,
        groupName: group.name,
        planName: enrollment.selectedPlan?.name ?? null,
      };
    });
  }
}
