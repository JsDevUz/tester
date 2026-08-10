import { WordDecksService } from './word-decks.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      wordDecks: { findFirst: jest.fn(), findMany: jest.fn() },
      deckWords: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('WordDecksService.bulkImport', () => {
  const service = new WordDecksService();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue({ id: 'deck-1', ownerId: 'student-1' });
    (db.query.deckWords.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('parses "word - translation" lines and skips malformed ones', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    (db.insert as jest.Mock).mockReturnValue({ values });

    const result = await service.bulkImport('deck-1', 'student-1', 'apple - olma\nbook - kitob\nmalformed line\n\n');

    expect(result).toEqual({ added: 2, skipped: 1 });
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ deckId: 'deck-1', word: 'apple', translation: 'olma', orderIndex: 0 }),
      expect.objectContaining({ deckId: 'deck-1', word: 'book', translation: 'kitob', orderIndex: 1 }),
    ]);
  });

  it('rejects import into a deck not owned by the caller', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.bulkImport('deck-1', 'student-1', 'apple - olma')).rejects.toThrow('Deck not found');
  });
});

describe('WordDecksService.findBySlug', () => {
  const service = new WordDecksService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns deck words for any valid slug regardless of caller identity', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue({ id: 'deck-1', name: 'Ingliz tili', slug: 'AbCd1234' });
    (db.query.deckWords.findMany as jest.Mock).mockResolvedValue([
      { id: 'w-1', word: 'apple', translation: 'olma', orderIndex: 0 },
    ]);

    const result = await service.findBySlug('AbCd1234');

    expect(result.name).toBe('Ingliz tili');
    expect(result.words).toEqual([{ id: 'w-1', word: 'apple', translation: 'olma' }]);
  });

  it('throws NotFoundException for an unknown slug', async () => {
    (db.query.wordDecks.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(service.findBySlug('unknown0')).rejects.toThrow('Deck not found');
  });
});
