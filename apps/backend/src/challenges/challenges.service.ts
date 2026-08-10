import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import {
  challengeBookProgress, challengeBooks, challengeBookTests, challengeEvents, challengeParticipants, challengeWordProgress,
  challenges, courses, submissions, tests,
} from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { computeLeaderboard, type ChallengeLeaderboardMetric } from './challenges.logic';

@Injectable()
export class ChallengesService {
  async findAllForCourse(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)) });
    if (!course) throw new NotFoundException('Course not found');
    return db.query.challenges.findMany({
      where: eq(challenges.courseId, courseId),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    });
  }

  async create(courseId: string, adminId: string, data: { name: string; description?: string; imageUrl?: string; type?: string }) {
    const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)) });
    if (!course) throw new NotFoundException('Course not found');

    const [challenge] = await db.insert(challenges).values({
      courseId,
      adminId,
      name: data.name,
      description: data.description ?? '',
      imageUrl: data.imageUrl,
      type: data.type ?? 'kitobxonlik',
    }).returning();
    return challenge;
  }

  async update(id: string, adminId: string, data: Partial<{ name: string; description: string; imageUrl: string; type: string }>) {
    const [challenge] = await db.update(challenges)
      .set(data)
      .where(and(eq(challenges.id, id), eq(challenges.adminId, adminId)))
      .returning();
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  async remove(id: string, adminId: string) {
    const result = await db.delete(challenges)
      .where(and(eq(challenges.id, id), eq(challenges.adminId, adminId)))
      .returning({ id: challenges.id });
    if (!result.length) throw new NotFoundException('Challenge not found');
  }

  async findOneOwned(id: string, adminId: string) {
    const challenge = await db.query.challenges.findFirst({
      where: and(eq(challenges.id, id), eq(challenges.adminId, adminId)),
      with: { books: { with: { test: true }, orderBy: (b, { asc }) => [asc(b.orderIndex)] } },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  private async assertBookOwnership(bookId: string, adminId: string) {
    const book = await db.query.challengeBooks.findFirst({
      where: eq(challengeBooks.id, bookId),
      with: { challenge: true },
    });
    if (!book || book.challenge.adminId !== adminId || book.challenge.type !== 'kitobxonlik') throw new NotFoundException('Book not found');
    return book;
  }

  async addBook(challengeId: string, adminId: string, data: { title: string; totalPages: number }) {
    const challenge = await db.query.challenges.findFirst({ where: and(eq(challenges.id, challengeId), eq(challenges.adminId, adminId)) });
    if (!challenge || challenge.type !== 'kitobxonlik') throw new NotFoundException('Challenge not found');

    const existing = await db.query.challengeBooks.findMany({ where: eq(challengeBooks.challengeId, challengeId) });
    const [book] = await db.insert(challengeBooks).values({
      challengeId,
      title: data.title,
      totalPages: data.totalPages,
      orderIndex: existing.length,
    }).returning();
    return book;
  }

  async updateBook(bookId: string, adminId: string, data: Partial<{ title: string; totalPages: number }>) {
    await this.assertBookOwnership(bookId, adminId);
    const [book] = await db.update(challengeBooks).set(data).where(eq(challengeBooks.id, bookId)).returning();
    return book;
  }

  async removeBook(bookId: string, adminId: string) {
    await this.assertBookOwnership(bookId, adminId);
    await db.delete(challengeBooks).where(eq(challengeBooks.id, bookId));
  }

  async setBookTest(bookId: string, adminId: string, data: { testId: string; triggerPage?: number | null; forceNow?: boolean }) {
    await this.assertBookOwnership(bookId, adminId);
    const test = await db.query.tests.findFirst({ where: and(eq(tests.id, data.testId), eq(tests.adminId, adminId)) });
    if (!test) throw new NotFoundException('Test not found');

    const [bookTest] = await db.insert(challengeBookTests).values({
      challengeBookId: bookId,
      testId: data.testId,
      triggerPage: data.triggerPage ?? null,
      forceNow: data.forceNow ?? false,
    }).onConflictDoUpdate({
      target: challengeBookTests.challengeBookId,
      set: { testId: data.testId, triggerPage: data.triggerPage ?? null, forceNow: data.forceNow ?? false },
    }).returning();
    return bookTest;
  }

  async removeBookTest(bookId: string, adminId: string) {
    await this.assertBookOwnership(bookId, adminId);
    await db.delete(challengeBookTests).where(eq(challengeBookTests.challengeBookId, bookId));
  }

  async stats(challengeId: string, adminId: string) {
    const challenge = await this.findOneOwned(challengeId, adminId);

    const participants = await db.query.challengeParticipants.findMany({ where: eq(challengeParticipants.challengeId, challengeId) });

    const bookStats = await Promise.all(challenge.books.map(async (book) => {
      const progressRows = await db.query.challengeBookProgress.findMany({ where: eq(challengeBookProgress.challengeBookId, book.id) });
      const completedCount = progressRows.filter((p) => p.lastPageRead >= book.totalPages).length;

      let testSubmittedCount: number | null = null;
      let testName: string | null = null;
      if (book.test) {
        const testRow = await db.query.tests.findFirst({ where: eq(tests.id, book.test.testId) });
        testName = testRow?.name ?? null;
        const submissionRows = await db.query.submissions.findMany({ where: eq(submissions.testId, book.test.testId) });
        testSubmittedCount = new Set(
          submissionRows.filter((s) => s.submittedAt !== null).map((s) => s.userId),
        ).size;
      }

      return {
        bookId: book.id,
        title: book.title,
        testName,
        completedCount,
        testSubmittedCount,
      };
    }));

    return { participantCount: participants.length, bookStats };
  }

  async leaderboard(challengeId: string, adminId: string, metric: ChallengeLeaderboardMetric, bookId?: string) {
    const challenge = await this.findOneOwned(challengeId, adminId);

    const participants = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.challengeId, challengeId),
      with: { student: true },
    });
    if (participants.length === 0) return { entries: [] };

    const participantIds = participants.map((p) => p.id);
    if (challenge.type === 'soz_yodlash') {
      const progress = await db.query.challengeWordProgress.findMany({
        where: inArray(challengeWordProgress.challengeParticipantId, participantIds),
      });
      const counts = new Map<string, number>();
      for (const row of progress) if (row.known) counts.set(row.challengeParticipantId, (counts.get(row.challengeParticipantId) ?? 0) + 1);
      return {
        entries: participants.map((participant) => ({
          studentId: participant.studentId,
          studentName: participant.student.displayName,
          studentAvatarUrl: participant.student.displayAvatarUrl,
          value: counts.get(participant.id) ?? 0,
          isCurrentStudent: false,
        })).sort((a, b) => b.value - a.value || a.studentName.localeCompare(b.studentName, 'uz'))
          .map((entry, index) => ({ ...entry, rank: index + 1 })),
      };
    }
    const events = await db.query.challengeEvents.findMany({
      where: inArray(challengeEvents.challengeParticipantId, participantIds),
    });

    const books = metric === 'books'
      ? await db.query.challengeBooks.findMany({ where: eq(challengeBooks.challengeId, challengeId) })
      : [];

    return computeLeaderboard(participants, events, books, metric, bookId, null);
  }
}
