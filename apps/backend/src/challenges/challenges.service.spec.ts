import { NotFoundException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      courses: { findFirst: jest.fn() },
      challenges: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeBooks: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeParticipants: { findMany: jest.fn() },
      challengeEvents: { findMany: jest.fn() },
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

  describe('leaderboard', () => {
    it('ranks all participants by total pages read for the "overall" metric, scoped to a challenge the admin owns', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', adminId: 'admin-1', books: [] });
      (db.query.challengeParticipants.findMany as jest.Mock).mockResolvedValue([
        { id: 'participant-1', studentId: 'student-1', student: { id: 'student-1', displayName: 'Aziz', displayAvatarUrl: null } },
        { id: 'participant-2', studentId: 'student-2', student: { id: 'student-2', displayName: 'Vali', displayAvatarUrl: null } },
      ]);
      (db.query.challengeEvents.findMany as jest.Mock).mockResolvedValue([
        { challengeParticipantId: 'participant-1', startPage: 0, endPage: 30, newWordsCount: 2, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
        { challengeParticipantId: 'participant-2', startPage: 0, endPage: 10, newWordsCount: 5, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
      ]);

      const result = await service.leaderboard('challenge-1', 'admin-1', 'overall');

      expect(result.entries[0]).toEqual(expect.objectContaining({ studentId: 'student-1', value: 30, rank: 1, isCurrentStudent: false }));
      expect(result.entries[1]).toEqual(expect.objectContaining({ studentId: 'student-2', value: 10, rank: 2, isCurrentStudent: false }));
    });

    it('throws NotFoundException when the requesting admin does not own the challenge', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(service.leaderboard('challenge-1', 'admin-2', 'overall')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an empty entries array when the challenge has no participants', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', adminId: 'admin-1', books: [] });
      (db.query.challengeParticipants.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.leaderboard('challenge-1', 'admin-1', 'overall');

      expect(result).toEqual({ entries: [] });
    });
  });
});
