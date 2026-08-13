jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/lib/practiceMessengerSocket', () => ({
  closePracticeMessengerSocket: jest.fn(),
}));

import {api} from '../src/lib/api';
import {apiFetchWordDecks, apiGetDeckBySlug} from '../src/api/word-decks';

describe('word-decks API client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fetches word decks from /me/word-decks', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: [{id: 'd1', ownerId: 'u1', name: "Ingliz tili", slug: 'AbCd1234', createdAt: '2026-01-01'}],
    });

    const decks = await apiFetchWordDecks();

    expect(api.get).toHaveBeenCalledWith('/me/word-decks');
    expect(decks[0].name).toBe('Ingliz tili');
  });

  it('fetches a deck by slug from the public decks endpoint', async () => {
    jest.spyOn(api, 'get').mockResolvedValueOnce({
      data: {id: 'd1', name: "Ingliz tili", words: [{id: 'w1', word: 'apple', translation: 'olma'}]},
    });

    const deck = await apiGetDeckBySlug('AbCd1234');

    expect(api.get).toHaveBeenCalledWith('/decks/AbCd1234');
    expect(deck.words).toHaveLength(1);
  });
});
