import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentChallengesService } from './student-challenges.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      challenges: { findFirst: jest.fn() },
      groups: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      challengeParticipants: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeBooks: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeBookTests: { findFirst: jest.fn() },
      challengeBookProgress: { findFirst: jest.fn() },
      challengeEvents: { findMany: jest.fn() },
      submissions: { findFirst: jest.fn() },
      tests: { findFirst: jest.fn() },
      users: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  };
  return { db: mockDb };
});

function mockInsertReturning(value: unknown) {
  const returning = jest.fn().mockResolvedValue([value]);
  const onConflictDoNothing = jest.fn(() => ({ returning }));
  const onConflictDoUpdate = jest.fn(() => ({ returning }));
  const values = jest.fn(() => ({ returning, onConflictDoNothing, onConflictDoUpdate }));
  (db.insert as jest.Mock).mockReturnValue({ values });
  return { values, returning };
}

/** Mocks db.transaction(cb) to invoke cb with a tx object whose `.select().from().where().for('update')`
 *  chain resolves to `progressRows`, and whose `.query`/`.insert`/`.update` mirror the outer db mock. */
function mockTransaction(progressRows: unknown[]) {
  const forUpdate = jest.fn().mockResolvedValue(progressRows);
  const where = jest.fn(() => ({ for: forUpdate }));
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));

  const tx: any = {
    query: (db as any).query,
    select,
    insert: jest.fn(),
    update: jest.fn(),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: any) => Promise<unknown>) => cb(tx));
  return tx;
}

describe('StudentChallengesService', () => {
  const service = new StudentChallengesService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('join', () => {
    it('throws NotFoundException when the student is not enrolled in the challenge course', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.join('challenge-1', 'student-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a participant when the student is enrolled', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
      ]);
      mockInsertReturning({ id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' });

      const result = await service.join('challenge-1', 'student-1');

      expect(result).toEqual(expect.objectContaining({ id: 'participant-1' }));
    });
  });

  describe('addEvent', () => {
    const participant = { id: 'participant-1', challengeId: 'challenge-1', studentId: 'student-1' };
    const book = { id: 'book-1', challengeId: 'challenge-1', totalPages: 200 };

    it('blocks a new event when a triggered mandatory test is not yet submitted', async () => {
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(participant);
      (db.query.challengeBooks.findFirst as jest.Mock).mockResolvedValue(book);
      const tx = mockTransaction([{ id: 'progress-1', lastPageRead: 50 }]);
      (tx.query.challengeBookTests.findFirst as jest.Mock).mockResolvedValue({
        testId: 'test-1', triggerPage: 50, forceNow: false,
      });
      (tx.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', slug: 'ABC123', name: 'Bob 1-bob testi' });
      (tx.query.submissions.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.addEvent('challenge-1', 'book-1', 'student-1', { endPage: 60, newWordsCount: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks a new event that jumps past the trigger page in one submission, even though startPage is below it', async () => {
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(participant);
      (db.query.challengeBooks.findFirst as jest.Mock).mockResolvedValue(book);
      const tx = mockTransaction([]);
      (tx.query.challengeBookTests.findFirst as jest.Mock).mockResolvedValue({
        testId: 'test-1', triggerPage: 50, forceNow: false,
      });
      (tx.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', slug: 'ABC123', name: 'Bob 1-bob testi' });
      (tx.query.submissions.findFirst as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.addEvent('challenge-1', 'book-1', 'student-1', { endPage: 200, newWordsCount: 3 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a new event when the mandatory test has been submitted', async () => {
      (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue(participant);
      (db.query.challengeBooks.findFirst as jest.Mock).mockResolvedValue(book);
      const tx = mockTransaction([{ id: 'progress-1', lastPageRead: 50 }]);
      (tx.query.challengeBookTests.findFirst as jest.Mock).mockResolvedValue({
        testId: 'test-1', triggerPage: 50, forceNow: false,
      });
      (tx.query.submissions.findFirst as jest.Mock).mockResolvedValue({ id: 'sub-1', submittedAt: new Date() });
      const returning = jest.fn().mockResolvedValue([{ id: 'event-1', startPage: 50, endPage: 60, newWordsCount: 3 }]);
      const values = jest.fn(() => ({ returning }));
      (tx.insert as jest.Mock).mockReturnValue({ values });
      const updateWhere = jest.fn().mockResolvedValue(undefined);
      const updateSet = jest.fn(() => ({ where: updateWhere }));
      (tx.update as jest.Mock).mockReturnValue({ set: updateSet });

      const result = await service.addEvent('challenge-1', 'book-1', 'student-1', { endPage: 60, newWordsCount: 3 });

      expect(result).toEqual(expect.objectContaining({ id: 'event-1', startPage: 50, endPage: 60 }));
    });
  });

  describe('leaderboard', () => {
    it('ranks students by total pages read for the "overall" metric', async () => {
      (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1' });
      (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1', courseId: 'course-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-1' } },
        { groupId: 'group-1', removedAt: null, schoolMember: { studentId: 'student-2' } },
      ]);
      (db.query.challengeParticipants.findMany as jest.Mock).mockResolvedValue([
        { id: 'participant-1', studentId: 'student-1', student: { id: 'student-1', displayName: 'Aziz', displayAvatarUrl: null } },
        { id: 'participant-2', studentId: 'student-2', student: { id: 'student-2', displayName: 'Vali', displayAvatarUrl: null } },
      ]);
      (db.query.challengeEvents.findMany as jest.Mock).mockResolvedValue([
        { challengeParticipantId: 'participant-1', startPage: 0, endPage: 30, newWordsCount: 2, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
        { challengeParticipantId: 'participant-2', startPage: 0, endPage: 10, newWordsCount: 5, challengeBookId: 'book-1', createdAt: new Date('2026-08-01') },
      ]);

      const result = await service.leaderboard('challenge-1', 'student-1', 'overall');

      expect(result.entries[0]).toEqual(expect.objectContaining({ studentId: 'student-1', value: 30, rank: 1 }));
      expect(result.entries[1]).toEqual(expect.objectContaining({ studentId: 'student-2', value: 10, rank: 2 }));
    });
  });
});
