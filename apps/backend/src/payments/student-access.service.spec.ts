import { db } from '../db';
import { StudentAccessService } from './student-access.service';

jest.mock('../db', () => ({
  db: {
    query: {
      groups: { findMany: jest.fn() },
      schoolMembers: { findMany: jest.fn() },
      groupEnrollments: { findFirst: jest.fn() },
      monthlyPayments: { findFirst: jest.fn() },
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
    (db.query.groupEnrollments.findFirst as jest.Mock).mockResolvedValue({
      id: 'enrollment-1',
      selectedPlanId: 'plan-1',
      forcedClosed: false,
    });
    (db.query.monthlyPayments.findFirst as jest.Mock).mockResolvedValue(payment);
  }

  it('blocks access when a plan is selected but no monthly payment has been generated yet', async () => {
    mockAccessibleEnrollment(null);

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });

  it('blocks access when the latest payment is debt', async () => {
    mockAccessibleEnrollment({ status: 'debt' });

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });

  it('blocks access when the enrollment has no selected plan', async () => {
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findFirst as jest.Mock).mockResolvedValue({
      id: 'enrollment-1',
      selectedPlanId: null,
      forcedClosed: false,
    });

    await expect(service.assertStudentLessonAccess('course-1', 'student-1')).resolves.toBe(false);
  });
});
