import { NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { StudentChallengeWordsService } from './student-challenge-words.service';

jest.mock('../db', () => ({
  db: {
    query: {
      challenges: { findFirst: jest.fn() },
      groups: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
      challengeParticipants: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeWords: { findFirst: jest.fn(), findMany: jest.fn() },
      challengeWordProgress: { findMany: jest.fn() },
    },
    insert: jest.fn(),
  },
}));

const enrolled = () => {
  (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', courseId: 'course-1', type: 'soz_yodlash' });
  (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
  (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
    { schoolMember: { studentId: 'student-1' } },
  ]);
};

describe('StudentChallengeWordsService', () => {
  const service = new StudentChallengeWordsService();
  beforeEach(() => jest.clearAllMocks());

  it('rejects a student not enrolled in the challenge course', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ courseId: 'course-1', type: 'soz_yodlash' });
    (db.query.groups.findMany as jest.Mock).mockResolvedValue([{ id: 'group-1' }]);
    (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([]);
    await expect(service.listWords('challenge-1', 'student-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns words with shared known state', async () => {
    enrolled();
    (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1' });
    (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([
      { id: 'word-1', word: 'apple', translation: 'olma' },
      { id: 'word-2', word: 'book', translation: 'kitob' },
    ]);
    (db.query.challengeWordProgress.findMany as jest.Mock).mockResolvedValue([{ challengeWordId: 'word-1', known: true }]);
    await expect(service.listWords('challenge-1', 'student-1')).resolves.toEqual([
      { id: 'word-1', word: 'apple', translation: 'olma', known: true },
      { id: 'word-2', word: 'book', translation: 'kitob', known: false },
    ]);
  });

  it('upserts progress only for a word in this challenge', async () => {
    enrolled();
    (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1' });
    (db.query.challengeWords.findFirst as jest.Mock).mockResolvedValue({ id: 'word-1' });
    const returning = jest.fn().mockResolvedValue([{ challengeWordId: 'word-1', known: true }]);
    const onConflictDoUpdate = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values: jest.fn(() => ({ onConflictDoUpdate })) });
    await expect(service.setProgress('challenge-1', 'word-1', 'student-1', true))
      .resolves.toEqual({ wordId: 'word-1', known: true });
  });

  it('overwrites a previously known word back to unknown on a wrong answer or left swipe', async () => {
    enrolled();
    (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1' });
    (db.query.challengeWords.findFirst as jest.Mock).mockResolvedValue({ id: 'word-1' });
    const returning = jest.fn().mockResolvedValue([{ challengeWordId: 'word-1', known: false }]);
    const onConflictDoUpdate = jest.fn(() => ({ returning }));
    const values = jest.fn(() => ({ onConflictDoUpdate }));
    (db.insert as jest.Mock).mockReturnValue({ values });

    await expect(service.setProgress('challenge-1', 'word-1', 'student-1', false))
      .resolves.toEqual({ wordId: 'word-1', known: false });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ known: false }));
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ known: false }) }),
    );
  });

  it('rejects setting progress for a word that does not belong to this challenge', async () => {
    enrolled();
    (db.query.challengeParticipants.findFirst as jest.Mock).mockResolvedValue({ id: 'participant-1' });
    (db.query.challengeWords.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.setProgress('challenge-1', 'word-from-other-challenge', 'student-1', true))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(db.insert as jest.Mock).not.toHaveBeenCalled();
  });

  it('ranks participants by known word count', async () => {
    enrolled();
    (db.query.challengeParticipants.findMany as jest.Mock).mockResolvedValue([
      { id: 'p1', studentId: 'student-1', student: { displayName: 'Aziz', displayAvatarUrl: null } },
      { id: 'p2', studentId: 'student-2', student: { displayName: 'Vali', displayAvatarUrl: null } },
    ]);
    (db.query.challengeWordProgress.findMany as jest.Mock).mockResolvedValue([
      { challengeParticipantId: 'p1', known: true },
      { challengeParticipantId: 'p1', known: true },
      { challengeParticipantId: 'p2', known: true },
      { challengeParticipantId: 'p2', known: false },
    ]);
    const result = await service.leaderboard('challenge-1', 'student-1');
    expect(result.entries).toEqual([
      expect.objectContaining({ studentId: 'student-1', value: 2, rank: 1, isCurrentStudent: true }),
      expect.objectContaining({ studentId: 'student-2', value: 1, rank: 2 }),
    ]);
  });
});
