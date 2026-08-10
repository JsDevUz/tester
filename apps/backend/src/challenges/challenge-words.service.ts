import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { challengeWords, challenges } from '../db/schema';

@Injectable()
export class ChallengeWordsService {
  private async assertChallengeOwnership(challengeId: string, adminId: string) {
    const challenge = await db.query.challenges.findFirst({
      where: and(eq(challenges.id, challengeId), eq(challenges.adminId, adminId)),
    });
    if (!challenge || challenge.type !== 'soz_yodlash') {
      throw new NotFoundException('Challenge not found');
    }
    return challenge;
  }

  private async assertWordOwnership(challengeId: string, wordId: string, adminId: string) {
    await this.assertChallengeOwnership(challengeId, adminId);
    const word = await db.query.challengeWords.findFirst({
      where: and(eq(challengeWords.id, wordId), eq(challengeWords.challengeId, challengeId)),
    });
    if (!word) throw new NotFoundException('Word not found');
    return word;
  }

  async list(challengeId: string, adminId: string) {
    await this.assertChallengeOwnership(challengeId, adminId);
    return db.query.challengeWords.findMany({
      where: eq(challengeWords.challengeId, challengeId),
      orderBy: (word, { asc }) => [asc(word.orderIndex)],
    });
  }

  async addWord(challengeId: string, adminId: string, data: { word: string; translation: string }) {
    await this.assertChallengeOwnership(challengeId, adminId);
    const existing = await db.query.challengeWords.findMany({ where: eq(challengeWords.challengeId, challengeId) });
    const [word] = await db.insert(challengeWords).values({
      challengeId,
      word: data.word.trim(),
      translation: data.translation.trim(),
      orderIndex: existing.length,
    }).returning();
    return word;
  }

  async bulkImport(challengeId: string, adminId: string, text: string) {
    await this.assertChallengeOwnership(challengeId, adminId);
    const existing = await db.query.challengeWords.findMany({ where: eq(challengeWords.challengeId, challengeId) });
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const values: Array<{ challengeId: string; word: string; translation: string; orderIndex: number }> = [];
    let skipped = 0;

    for (const line of lines) {
      const separatorIndex = line.indexOf(' - ');
      const word = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : '';
      const translation = separatorIndex >= 0 ? line.slice(separatorIndex + 3).trim() : '';
      if (!word || !translation) {
        skipped += 1;
        continue;
      }
      values.push({ challengeId, word, translation, orderIndex: existing.length + values.length });
    }

    if (values.length > 0) await db.insert(challengeWords).values(values);
    return { added: values.length, skipped };
  }

  async updateWord(challengeId: string, wordId: string, adminId: string, data: Partial<{ word: string; translation: string }>) {
    await this.assertWordOwnership(challengeId, wordId, adminId);
    const update: Partial<{ word: string; translation: string }> = {};
    if (data.word !== undefined) update.word = data.word.trim();
    if (data.translation !== undefined) update.translation = data.translation.trim();
    if (Object.keys(update).length === 0) throw new BadRequestException('No fields to update');
    const [word] = await db.update(challengeWords).set(update).where(eq(challengeWords.id, wordId)).returning();
    return word;
  }

  async removeWord(challengeId: string, wordId: string, adminId: string) {
    await this.assertWordOwnership(challengeId, wordId, adminId);
    await db.delete(challengeWords).where(eq(challengeWords.id, wordId));
  }
}
