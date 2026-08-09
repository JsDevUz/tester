import { NotFoundException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      courses: { findFirst: jest.fn() },
      challenges: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeBooks: { findFirst: jest.fn() },
      tests: { findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

function mockInsertReturning(value: unknown) {
  const returning = jest.fn().mockResolvedValue([value]);
  const values = jest.fn(() => ({ returning }));
  (db.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

function mockUpdateReturning(value: unknown[]) {
  const returning = jest.fn().mockResolvedValue(value);
  const where = jest.fn(() => ({ returning }));
  const set = jest.fn(() => ({ where }));
  (db.update as jest.Mock).mockReturnValue({ set });
  return { set, where, returning };
}

describe('ChallengesService', () => {
  const service = new ChallengesService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a challenge for a course the admin owns', async () => {
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue({ id: 'course-1', adminId: 'admin-1' });
    mockInsertReturning({ id: 'challenge-1', courseId: 'course-1', adminId: 'admin-1', name: 'Yoz mutolaasi' });

    const result = await service.create('course-1', 'admin-1', { name: 'Yoz mutolaasi' });

    expect(result).toEqual(expect.objectContaining({ id: 'challenge-1', name: 'Yoz mutolaasi' }));
  });

  it('throws NotFoundException when creating a challenge for a course the admin does not own', async () => {
    (db.query.courses.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.create('course-1', 'admin-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when updating a challenge the admin does not own', async () => {
    mockUpdateReturning([]);

    await expect(service.update('challenge-1', 'admin-1', { name: 'Y' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
