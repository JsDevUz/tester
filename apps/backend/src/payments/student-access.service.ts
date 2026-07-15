import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupEnrollments, groups, monthlyPayments, schoolMembers } from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

export type StudentLessonAccessResult =
  | { allowed: true; reason: null }
  | { allowed: false; reason: 'not_enrolled' | 'forced_closed' | 'payment_required' };

@Injectable()
export class StudentAccessService {
  async getStudentLessonAccess(courseId: string, studentId: string): Promise<StudentLessonAccessResult> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return { allowed: false, reason: 'not_enrolled' };
    const groupIds = courseGroups.map((g) => g.id);

    const schoolMemberRows = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = schoolMemberRows.map((m) => m.id);
    if (schoolMemberIds.length === 0) return { allowed: false, reason: 'not_enrolled' };

    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(
        inArray(groupEnrollments.schoolMemberId, schoolMemberIds),
        inArray(groupEnrollments.groupId, groupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (enrollments.length === 0) return { allowed: false, reason: 'not_enrolled' };

    const openEnrollments = enrollments.filter((enrollment) => !enrollment.forcedClosed);
    if (openEnrollments.length === 0) return { allowed: false, reason: 'forced_closed' };

    const eligibleEnrollments = openEnrollments.filter((enrollment) => enrollment.selectedPlanId);
    if (eligibleEnrollments.length === 0) return { allowed: false, reason: 'payment_required' };
    const enrollmentIds = eligibleEnrollments.map((enrollment) => enrollment.id);

    const payments = await db.query.monthlyPayments.findMany({
      where: inArray(monthlyPayments.enrollmentId, enrollmentIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });

    const hasValidPayment = eligibleEnrollments.some((enrollment) => {
      const latestPayment = payments.find((payment) => payment.enrollmentId === enrollment.id);
      return latestPayment ? latestPayment.status !== 'debt' : false;
    });

    return hasValidPayment
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'payment_required' };
  }

  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    return (await this.getStudentLessonAccess(courseId, studentId)).allowed;
  }
}
