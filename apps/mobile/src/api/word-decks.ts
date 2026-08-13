import {api} from '../lib/api';

export interface WordDeck {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
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
  name: string;
  words: Array<{id: string; word: string; translation: string}>;
}

export async function apiFetchWordDecks(): Promise<WordDeck[]> {
  return (await api.get('/me/word-decks')).data;
}

export async function apiCreateWordDeck(name: string): Promise<WordDeck> {
  return (await api.post('/me/word-decks', {name})).data;
}

export async function apiUpdateWordDeck(id: string, name: string): Promise<WordDeck> {
  return (await api.patch(`/me/word-decks/${id}`, {name})).data;
}

export async function apiDeleteWordDeck(id: string): Promise<void> {
  await api.delete(`/me/word-decks/${id}`);
}

export async function apiListDeckWords(deckId: string): Promise<DeckWord[]> {
  return (await api.get(`/me/word-decks/${deckId}/words`)).data;
}

export async function apiAddDeckWord(deckId: string, data: {word: string; translation: string}): Promise<DeckWord> {
  return (await api.post(`/me/word-decks/${deckId}/words`, data)).data;
}

export async function apiBulkImportDeckWords(deckId: string, text: string): Promise<{added: number; skipped: number}> {
  return (await api.post(`/me/word-decks/${deckId}/words/bulk`, {text})).data;
}

export async function apiDeleteDeckWord(deckId: string, wordId: string): Promise<void> {
  await api.delete(`/me/word-decks/${deckId}/words/${wordId}`);
}

export async function apiGetDeckBySlug(slug: string): Promise<DeckView> {
  return (await api.get(`/decks/${slug}`)).data;
}
