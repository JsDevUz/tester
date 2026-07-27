import { PgDialect } from 'drizzle-orm/pg-core';
import { inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import { groupEnrollments } from '../db/schema';
import { SubmissionsService } from './submissions.service';

jest.mock('../db', () => ({
  db: {
    query: {
      schoolMembers: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      testPins: { findMany: jest.fn() },
    },
  },
}));

describe('SubmissionsService.listActivePinsForStudent', () => {
  const service = new SubmissionsService();
  const dialect = new PgDialect();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not query enrollments or pins when the student has no school membership', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([]);

    await expect(service.listActivePinsForStudent('student-1')).resolves.toEqual([]);

    expect(db.query.groupEnrollments.findMany).not.toHaveBeenCalled();
    expect(db.query.testPins.findMany).not.toHaveBeenCalled();
  });

  it('does not query pins when the student has no active enrollment', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([]);

    await expect(service.listActivePinsForStudent('student-1')).resolves.toEqual([]);

    expect(db.query.testPins.findMany).not.toHaveBeenCalled();
  });

  it('queries only active enrollments and scopes active pins to unique enrolled courses', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { groupId: 'group-1', group: { courseId: 'course-1' } },
      { groupId: 'group-2', group: { courseId: 'course-1' } },
      { groupId: 'group-3', group: { courseId: 'course-2' } },
    ]);
    (db.query.testPins.findMany as jest.Mock).mockResolvedValue([]);

    await service.listActivePinsForStudent('student-1');

    const enrollmentConfig = (db.query.groupEnrollments.findMany as jest.Mock).mock.calls[0][0];
    const enrollmentWhere = enrollmentConfig.where(groupEnrollments, { inArray, isNull });
    const enrollmentQuery = dialect.sqlToQuery(enrollmentWhere);
    expect(enrollmentQuery.sql).toContain('"group_enrollments"."removed_at" is null');

    const pinConfig = (db.query.testPins.findMany as jest.Mock).mock.calls[0][0];
    const pinQuery = dialect.sqlToQuery(pinConfig.where);
    expect(pinQuery.sql).toContain('"test_pins"."course_id" in ($3, $4)');
    expect(pinQuery.params.slice(2)).toEqual(['course-1', 'course-2']);
    expect(pinQuery.sql).toContain('"test_pins"."starts_at" <= $1');
    expect(pinQuery.sql).toContain('"test_pins"."ends_at" >= $2');
    expect(Date.parse(pinQuery.params[0] as string)).not.toBeNaN();
    expect(pinQuery.params[1]).toBe(pinQuery.params[0]);
  });

  it('matches an empty pin group list to any enrollment in its course', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { groupId: 'group-1', group: { courseId: 'course-1' } },
    ]);
    (db.query.testPins.findMany as jest.Mock).mockResolvedValue([
      {
        testId: 'test-1',
        courseId: 'course-1',
        groupIds: [],
        test: { name: 'Test 1', slug: 'slug0001' },
      },
    ]);

    await expect(service.listActivePinsForStudent('student-1')).resolves.toEqual([
      { testId: 'test-1', testName: 'Test 1', slug: 'slug0001' },
    ]);
  });

  it('matches a specific pin group only when the student is enrolled in it', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { groupId: 'group-1', group: { courseId: 'course-1' } },
    ]);
    (db.query.testPins.findMany as jest.Mock).mockResolvedValue([
      {
        testId: 'test-1',
        courseId: 'course-1',
        groupIds: ['group-2'],
        test: { name: 'Wrong group', slug: 'slug0001' },
      },
      {
        testId: 'test-2',
        courseId: 'course-1',
        groupIds: ['group-1'],
        test: { name: 'Right group', slug: 'slug0002' },
      },
    ]);

    await expect(service.listActivePinsForStudent('student-1')).resolves.toEqual([
      { testId: 'test-2', testName: 'Right group', slug: 'slug0002' },
    ]);
  });

  it('returns each matching test only once across duplicate enrollments', async () => {
    (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
      { groupId: 'group-1', group: { courseId: 'course-1' } },
      { groupId: 'group-2', group: { courseId: 'course-1' } },
    ]);
    (db.query.testPins.findMany as jest.Mock).mockResolvedValue([
      {
        testId: 'test-1',
        courseId: 'course-1',
        groupIds: [],
        test: { name: 'Test 1', slug: 'slug0001' },
      },
      {
        testId: 'test-1',
        courseId: 'course-1',
        groupIds: ['group-2'],
        test: { name: 'Test 1', slug: 'slug0001' },
      },
    ]);

    await expect(service.listActivePinsForStudent('student-1')).resolves.toEqual([
      { testId: 'test-1', testName: 'Test 1', slug: 'slug0001' },
    ]);
  });
});
