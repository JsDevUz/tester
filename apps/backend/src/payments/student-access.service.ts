import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { groupEnrollments, groups, monthlyPayments, schoolMembers } from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

export type StudentLessonAccessResult =
  | { allowed: true; reason: null }
  | { allowed: false; reason: 'not_enrolled' | 'forced_closed' | 'payment_required' };

/**
 * How long an access decision is trusted without re-checking.
 *
 * Kept short on purpose: this gates paid content, so a revoked enrolment or a lapsed payment
 * must take effect quickly. 30s is long enough to cover the burst of calls a single lesson
 * opening produces (every video block asks) without meaningfully delaying a revocation --
 * worst case a student keeps access for half a minute after it was withdrawn, and callers
 * that change enrolment or payment state can call invalidateAccessCache to cut even that.
 *
 * Only ALLOWED decisions are cached. A denial is not: a student who has just paid should see
 * the lesson open immediately, not after a timeout.
 */
const ACCESS_CACHE_TTL_SECONDS = 30;

@Injectable()
export class StudentAccessService {
  /**
   * In-process cache. Deliberately not Redis: the value is cheap to recompute, the window is
   * seconds, and keeping it local avoids a network hop on the very path being optimised.
   */
  private readonly cache = new Map<string, { result: StudentLessonAccessResult; expiresAt: number }>();

  async getStudentLessonAccess(courseId: string, studentId: string): Promise<StudentLessonAccessResult> {
    const cacheKey = `${courseId}:${studentId}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.result;

    const result = await this.computeStudentLessonAccess(courseId, studentId);
    if (result.allowed) {
      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + ACCESS_CACHE_TTL_SECONDS * 1000,
      });
    }
    // Bound the map so a long-running process cannot accumulate every student it has seen.
    if (this.cache.size > 5000) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return result;
  }

  /**
   * Drops cached decisions so a change takes effect immediately rather than after the TTL.
   * Call this whenever enrolment or payment state changes -- a student who has just paid
   * should not be told to wait.
   */
  invalidateAccessCache(courseId?: string, studentId?: string): void {
    if (!courseId) {
      this.cache.clear();
      return;
    }
    if (studentId) {
      this.cache.delete(`${courseId}:${studentId}`);
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${courseId}:`)) this.cache.delete(key);
    }
  }

  private async computeStudentLessonAccess(courseId: string, studentId: string): Promise<StudentLessonAccessResult> {
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
      return latestPayment?.status === 'paid';
    });

    return hasValidPayment
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'payment_required' };
  }

  async assertStudentLessonAccess(courseId: string, studentId: string): Promise<boolean> {
    return (await this.getStudentLessonAccess(courseId, studentId)).allowed;
  }
}
