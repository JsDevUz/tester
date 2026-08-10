import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { wordDecks, deckWords } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateSlug(): string {
  return Array.from({ length: 8 }, () => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]).join('');
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    const existing = await db.query.wordDecks.findFirst({ where: eq(wordDecks.slug, slug) });
    if (!existing) return slug;
  }
  throw new Error('Could not generate unique slug');
}

@Injectable()
export class WordDecksService {
  private async assertDeckOwnership(deckId: string, ownerId: string) {
    const deck = await db.query.wordDecks.findFirst({
      where: and(eq(wordDecks.id, deckId), eq(wordDecks.ownerId, ownerId)),
    });
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  private async assertWordOwnership(deckId: string, wordId: string, ownerId: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    const word = await db.query.deckWords.findFirst({
      where: and(eq(deckWords.id, wordId), eq(deckWords.deckId, deckId)),
    });
    if (!word) throw new NotFoundException('Word not found');
    return word;
  }

  async findAll(ownerId: string) {
    return db.query.wordDecks.findMany({
      where: eq(wordDecks.ownerId, ownerId),
      orderBy: (d, { asc }) => [asc(d.createdAt)],
    });
  }

  async create(ownerId: string, name: string) {
    const slug = await uniqueSlug();
    const [deck] = await db.insert(wordDecks).values({ ownerId, name, slug }).returning();
    return deck;
  }

  async update(id: string, ownerId: string, data: { name?: string }) {
    const [deck] = await db.update(wordDecks)
      .set(data)
      .where(and(eq(wordDecks.id, id), eq(wordDecks.ownerId, ownerId)))
      .returning();
    if (!deck) throw new NotFoundException('Deck not found');
    return deck;
  }

  async remove(id: string, ownerId: string) {
    const result = await db.delete(wordDecks)
      .where(and(eq(wordDecks.id, id), eq(wordDecks.ownerId, ownerId)))
      .returning({ id: wordDecks.id });
    if (!result.length) throw new NotFoundException('Deck not found');
  }

  async listWords(deckId: string, ownerId: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    return db.query.deckWords.findMany({
      where: eq(deckWords.deckId, deckId),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
  }

  async addWord(deckId: string, ownerId: string, data: { word: string; translation: string }) {
    await this.assertDeckOwnership(deckId, ownerId);
    const existing = await db.query.deckWords.findMany({ where: eq(deckWords.deckId, deckId) });
    const [word] = await db.insert(deckWords).values({
      deckId,
      word: data.word.trim(),
      translation: data.translation.trim(),
      orderIndex: existing.length,
    }).returning();
    return word;
  }

  async bulkImport(deckId: string, ownerId: string, text: string) {
    await this.assertDeckOwnership(deckId, ownerId);
    const existing = await db.query.deckWords.findMany({ where: eq(deckWords.deckId, deckId) });
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const values: Array<{ deckId: string; word: string; translation: string; orderIndex: number }> = [];
    let skipped = 0;

    for (const line of lines) {
      const separatorIndex = line.indexOf(' - ');
      const word = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : '';
      const translation = separatorIndex >= 0 ? line.slice(separatorIndex + 3).trim() : '';
      if (!word || !translation) {
        skipped += 1;
        continue;
      }
      values.push({ deckId, word, translation, orderIndex: existing.length + values.length });
    }

    if (values.length > 0) await db.insert(deckWords).values(values);
    return { added: values.length, skipped };
  }

  async updateWord(deckId: string, wordId: string, ownerId: string, data: Partial<{ word: string; translation: string }>) {
    await this.assertWordOwnership(deckId, wordId, ownerId);
    const update: Partial<{ word: string; translation: string }> = {};
    if (data.word !== undefined) update.word = data.word.trim();
    if (data.translation !== undefined) update.translation = data.translation.trim();
    if (Object.keys(update).length === 0) throw new BadRequestException('No fields to update');
    const [word] = await db.update(deckWords).set(update).where(eq(deckWords.id, wordId)).returning();
    return word;
  }

  async removeWord(deckId: string, wordId: string, ownerId: string) {
    await this.assertWordOwnership(deckId, wordId, ownerId);
    await db.delete(deckWords).where(eq(deckWords.id, wordId));
  }

  async findBySlug(slug: string) {
    const deck = await db.query.wordDecks.findFirst({ where: eq(wordDecks.slug, slug) });
    if (!deck) throw new NotFoundException('Deck not found');
    const words = await db.query.deckWords.findMany({
      where: eq(deckWords.deckId, deck.id),
      orderBy: (w, { asc }) => [asc(w.orderIndex)],
    });
    return {
      id: deck.id,
      name: deck.name,
      words: words.map((w) => ({ id: w.id, word: w.word, translation: w.translation })),
    };
  }
}
