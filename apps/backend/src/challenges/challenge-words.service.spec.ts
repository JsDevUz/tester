import { NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { ChallengeWordsService } from './challenge-words.service';

jest.mock('../db', () => ({
  db: {
    query: {
      challenges: { findFirst: jest.fn() },
      challengeWords: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('ChallengeWordsService', () => {
  const service = new ChallengeWordsService();

  beforeEach(() => jest.clearAllMocks());

  it('adds a word to an owned word challenge', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', type: 'soz_yodlash' });
    (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([]);
    const returning = jest.fn().mockResolvedValue([{ id: 'word-1', word: 'apple', translation: 'olma' }]);
    (db.insert as jest.Mock).mockReturnValue({ values: jest.fn(() => ({ returning })) });
    await expect(service.addWord('challenge-1', 'admin-1', { word: 'apple', translation: 'olma' }))
      .resolves.toEqual(expect.objectContaining({ id: 'word-1' }));
  });

  it('rejects a challenge not owned by the admin', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue(undefined);
    await expect(service.list('challenge-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bulk imports valid lines and skips malformed lines', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', type: 'soz_yodlash' });
    (db.query.challengeWords.findMany as jest.Mock).mockResolvedValue([]);
    (db.insert as jest.Mock).mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) });
    await expect(service.bulkImport('challenge-1', 'admin-1', 'apple - olma\nbroken\nbook - kitob'))
      .resolves.toEqual({ added: 2, skipped: 1 });
  });

  it('rejects a word outside the route challenge', async () => {
    (db.query.challenges.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1', type: 'soz_yodlash' });
    (db.query.challengeWords.findFirst as jest.Mock).mockResolvedValue(undefined);
    await expect(service.removeWord('challenge-1', 'word-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
