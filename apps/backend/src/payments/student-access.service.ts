import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupEnrollments, groups, monthlyPayments, schoolMembers } from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class StudentAccessService {
  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return false;
    const groupIds = courseGroups.map((g) => g.id);

    const schoolMemberRows = await db.query.schoolMembers.findMany({ where: eq(schoolMembers.studentId, studentId) });
    const schoolMemberIds = schoolMemberRows.map((m) => m.id);
    if (schoolMemberIds.length === 0) return false;

    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(
        inArray(groupEnrollments.schoolMemberId, schoolMemberIds),
        inArray(groupEnrollments.groupId, groupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    const eligibleEnrollments = enrollments.filter(
      (enrollment) => enrollment.selectedPlanId && !enrollment.forcedClosed,
    );
    if (eligibleEnrollments.length === 0) return false;
    const enrollmentIds = eligibleEnrollments.map((enrollment) => enrollment.id);

    const payments = await db.query.monthlyPayments.findMany({
      where: inArray(monthlyPayments.enrollmentId, enrollmentIds),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });

    return eligibleEnrollments.some((enrollment) => {
      const latestPayment = payments.find((payment) => payment.enrollmentId === enrollment.id);
      return latestPayment ? latestPayment.status !== 'debt' : false;
    });
  }
}
