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

    const enrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        inArray(groupEnrollments.schoolMemberId, schoolMemberIds),
        inArray(groupEnrollments.groupId, groupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!enrollment || !enrollment.selectedPlanId) return false;
    if (enrollment.forcedClosed) return false;

    const latestPayment = await db.query.monthlyPayments.findFirst({
      where: eq(monthlyPayments.enrollmentId, enrollment.id),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    if (!latestPayment) return false;
    return latestPayment.status !== 'debt';
  }
}
