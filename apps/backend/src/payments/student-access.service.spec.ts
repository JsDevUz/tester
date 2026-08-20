import { db } from '../db';
import { StudentAccessService } from './student-access.service';

jest.mock('../db', () => ({
  db: {
    query: {
      groups: { findMany: jest.fn() },
      schoolMembers: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      monthlyPayments: { findMany: jest.fn() },
    },
  },
}));

describe('StudentAccessService', () => {
  const service = new StudentAccessService();

  beforeEach(() => {
    jest.clearAllMocks();
    // Decisions are cached for 30s; these cases reuse the same course/student pair, so a
    // result from the previous test would otherwise be served instead of the new mocks.
    service.invalidateAccessCache();
  });

  function mockAccessibleEnrollment(payment: unknown) {
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([{
      id: 'enrollment-1',
      selectedPlanId: 'plan-1',
      forcedClosed: false,
    }]);
    (db.query.monthlyPayments.findMany as jest.Mock).mockResolvedValue(
      payment ? [{ ...(payment as object), enrollmentId: 'enrollment-1' }] : [],
    );
  }

  it('blocks access when a plan is selected but no monthly payment has been generated yet', async () => {
    mockAccessibleEnrollment(null);

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });

  it('blocks access when the latest payment is debt', async () => {
    mockAccessibleEnrollment({ status: 'debt' });

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });

  it.each(['pending', 'partial'])('blocks access when the latest payment is %s', async (status) => {
    mockAccessibleEnrollment({ status });

    await expect(service.getStudentLessonAccess('course-1', 'student-1')).resolves.toEqual({
      allowed: false,
      reason: 'payment_required',
    });
  });

  it('blocks access when the enrollment has no selected plan', async () => {
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([{
      id: 'enrollment-1',
      selectedPlanId: null,
      forcedClosed: false,
    }]);

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });

  it('reports forced closure separately from a payment problem', async () => {
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([{
      id: 'enrollment-1',
      selectedPlanId: 'plan-1',
      forcedClosed: true,
    }]);

    await expect(service.getStudentLessonAccess('course-1', 'student-1')).resolves.toEqual({
      allowed: false,
      reason: 'forced_closed',
    });
    expect(db.query.monthlyPayments.findMany).not.toHaveBeenCalled();
  });

  it('grants access when any active enrollment in the course has a valid payment', async () => {
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }, { id: 'group-2' }]);
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { id: 'old-enrollment', selectedPlanId: null, forcedClosed: false },
      { id: 'paid-enrollment', selectedPlanId: 'plan-1', forcedClosed: false },
    ]);
    (db.query.monthlyPayments.findMany as jest.Mock).mockResolvedValue([
      { enrollmentId: 'paid-enrollment', status: 'paid', periodMonth: new Date('2026-07-01') },
    ]);

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(true);
  });

  describe('access decision caching', () => {
    it('reuses an allowed decision instead of re-querying', async () => {
      mockAccessibleEnrollment({ status: 'paid' });

      await service.getStudentLessonAccess('course-1', 'student-1');
      const callsAfterFirst = (db.query.groups.findMany as jest.Mock).mock.calls.length;
      await service.getStudentLessonAccess('course-1', 'student-1');

      expect((db.query.groups.findMany as jest.Mock).mock.calls.length).toBe(callsAfterFirst);
    });

    // A student who has just paid must not wait out a cached "no".
    it('re-checks after a denial', async () => {
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([]);

      await service.getStudentLessonAccess('course-1', 'student-2');
      const callsAfterFirst = (db.query.groups.findMany as jest.Mock).mock.calls.length;
      await service.getStudentLessonAccess('course-1', 'student-2');

      expect((db.query.groups.findMany as jest.Mock).mock.calls.length).toBeGreaterThan(
        callsAfterFirst,
      );
    });

    it('forgets a decision when the cache is invalidated', async () => {
      mockAccessibleEnrollment({ status: 'paid' });
      await service.getStudentLessonAccess('course-1', 'student-3');

      service.invalidateAccessCache('course-1', 'student-3');
      const callsBefore = (db.query.groups.findMany as jest.Mock).mock.calls.length;
      await service.getStudentLessonAccess('course-1', 'student-3');

      expect((db.query.groups.findMany as jest.Mock).mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });

    it('scopes invalidation to one course when no student is given', async () => {
      mockAccessibleEnrollment({ status: 'paid' });
      await service.getStudentLessonAccess('course-1', 'student-4');
      await service.getStudentLessonAccess('course-2', 'student-4');

      service.invalidateAccessCache('course-1');
      const callsBefore = (db.query.groups.findMany as jest.Mock).mock.calls.length;

      await service.getStudentLessonAccess('course-2', 'student-4');
      expect((db.query.groups.findMany as jest.Mock).mock.calls.length).toBe(callsBefore);

      await service.getStudentLessonAccess('course-1', 'student-4');
      expect((db.query.groups.findMany as jest.Mock).mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });
  });
});
