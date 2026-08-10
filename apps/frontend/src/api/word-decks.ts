import client from './client';

export interface WordDeck {
  id: string;
  name: string;
  slug: string;
  wordCount?: number;
  createdAt: string;
}

export interface DeckWord {
  id: string;
  deckId: string;
  word: string;
  translation: string;
  orderIndex: number;
}

export interface DeckView {
  id: string;
  ownerId: string;
  name: string;
  words: Array<{ id: string; word: string; translation: string }>;
}

export async function apiFetchWordDecks(): Promise<WordDeck[]> {
  const res = await client.get('/me/word-decks');
  return res.data;
}

export async function apiCreateWordDeck(name: string): Promise<WordDeck> {
  const res = await client.post('/me/word-decks', { name });
  return res.data;
}

export async function apiUpdateWordDeck(id: string, name: string): Promise<WordDeck> {
  const res = await client.patch(`/me/word-decks/${id}`, { name });
  return res.data;
}

export async function apiDeleteWordDeck(id: string): Promise<void> {
  await client.delete(`/me/word-decks/${id}`);
}

export async function apiListDeckWords(deckId: string): Promise<DeckWord[]> {
  const res = await client.get(`/me/word-decks/${deckId}/words`);
  return res.data;
}

export async function apiAddDeckWord(deckId: string, data: { word: string; translation: string }): Promise<DeckWord> {
  const res = await client.post(`/me/word-decks/${deckId}/words`, data);
  return res.data;
}

export async function apiBulkImportDeckWords(deckId: string, text: string): Promise<{ added: number; skipped: number }> {
  const res = await client.post(`/me/word-decks/${deckId}/words/bulk`, { text });
  return res.data;
}

export async function apiDeleteDeckWord(deckId: string, wordId: string): Promise<void> {
  await client.delete(`/me/word-decks/${deckId}/words/${wordId}`);
}

export async function apiGetDeckBySlug(slug: string): Promise<DeckView> {
  const res = await client.get(`/decks/${slug}`);
  return res.data;
}
