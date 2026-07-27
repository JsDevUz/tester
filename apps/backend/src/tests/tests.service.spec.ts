import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TestsService } from './tests.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      tests: { findFirst: jest.fn() },
      testPins: { findFirst: jest.fn() },
      courses: { findFirst: jest.fn() },
      groups: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('TestsService pin management', () => {
  const service = new TestsService();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue({ id: 'course-1', adminId: 'admin-1' });
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
  });

  function mockInsertOnConflict(value: unknown) {
    const returning = jest.fn().mockResolvedValue([value]);
    const doUpdateSet = jest.fn(() => ({ returning }));
    const onConflictDoUpdate = jest.fn(() => ({ returning }));
    const target = jest.fn();
    const values = jest.fn(() => ({ onConflictDoUpdate, returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });
    return { values, onConflictDoUpdate, returning, target, doUpdateSet };
  }

  it('returns null when the test has no pin', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });
    (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(undefined);

    const result = await service.getPin('test-1', 'admin-1');

    expect(result).toBeNull();
  });

  it('throws NotFoundException when getting a pin for a test the admin does not own', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.getPin('test-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts a pin for an owned test', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });
    const insert = mockInsertOnConflict({
      id: 'pin-1',
      testId: 'test-1',
      courseId: 'course-1',
      groupIds: ['group-1'],
      startsAt: new Date('2026-08-01T09:00:00Z'),
      endsAt: new Date('2026-08-01T11:00:00Z'),
    });

    const result = await service.upsertPin('test-1', 'admin-1', {
      courseId: 'course-1',
      groupIds: ['group-1'],
      startsAt: '2026-08-01T09:00:00Z',
      endsAt: '2026-08-01T11:00:00Z',
    });

    expect(result.testId).toBe('test-1');
    expect(db.query.courses.findFirst).toHaveBeenCalled();
    expect(db.query.groups.findMany).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({
      groupIds: ['group-1'],
      startsAt: new Date('2026-08-01T09:00:00Z'),
      endsAt: new Date('2026-08-01T11:00:00Z'),
    }));
  });

  it('does not query groups for an all-groups pin', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });
    mockInsertOnConflict({ id: 'pin-1', testId: 'test-1' });

    await service.upsertPin('test-1', 'admin-1', {
      courseId: 'course-1',
      groupIds: [],
      startsAt: '2026-08-01T09:00:00Z',
      endsAt: '2026-08-01T11:00:00Z',
    });

    expect(db.query.groups.findMany).not.toHaveBeenCalled();
  });

  it('rejects a course the admin does not own', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.upsertPin('test-1', 'admin-1', {
      courseId: 'course-2',
      groupIds: [],
      startsAt: '2026-08-01T09:00:00Z',
      endsAt: '2026-08-01T11:00:00Z',
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects group IDs when any group does not belong to the selected course', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);

    await expect(service.upsertPin('test-1', 'admin-1', {
      courseId: 'course-1',
      groupIds: ['group-1', 'group-from-another-course'],
      startsAt: '2026-08-01T09:00:00Z',
      endsAt: '2026-08-01T11:00:00Z',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['an invalid start date', 'not-a-date', '2026-08-01T11:00:00Z'],
    ['an invalid end date', '2026-08-01T09:00:00Z', 'not-a-date'],
    ['equal dates', '2026-08-01T09:00:00Z', '2026-08-01T09:00:00Z'],
    ['an end before the start', '2026-08-01T11:00:00Z', '2026-08-01T09:00:00Z'],
  ])('rejects %s', async (_case, startsAt, endsAt) => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'admin-1' });

    await expect(service.upsertPin('test-1', 'admin-1', {
      courseId: 'course-1',
      groupIds: [],
      startsAt,
      endsAt,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when removing a pin for a test the admin does not own', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.removePin('test-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
