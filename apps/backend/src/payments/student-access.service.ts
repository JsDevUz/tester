import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupMembers, groups, monthlyPayments } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

@Injectable()
export class StudentAccessService {
  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    if (courseGroups.length === 0) return false;
    const groupIds = courseGroups.map((g) => g.id);

    const membership = await db.query.groupMembers.findFirst({
      where: and(eq(groupMembers.studentId, studentId), inArray(groupMembers.groupId, groupIds)),
    });
    if (!membership || !membership.selectedPlanId) return false;
    if (membership.forcedClosed) return false;

    const latestPayment = await db.query.monthlyPayments.findFirst({
      where: eq(monthlyPayments.groupMemberId, membership.id),
      orderBy: [desc(monthlyPayments.periodMonth)],
    });
    if (!latestPayment) return false;
    return latestPayment.status !== 'debt';
  }
}
