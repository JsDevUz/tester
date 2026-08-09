import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { challengeBooks, challengeBookTests, challenges, courses, tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

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
    if (!book || book.challenge.adminId !== adminId) throw new NotFoundException('Book not found');
    return book;
  }

  async addBook(challengeId: string, adminId: string, data: { title: string; totalPages: number }) {
    const challenge = await db.query.challenges.findFirst({ where: and(eq(challenges.id, challengeId), eq(challenges.adminId, adminId)) });
    if (!challenge) throw new NotFoundException('Challenge not found');

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
}
