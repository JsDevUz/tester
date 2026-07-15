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
});
