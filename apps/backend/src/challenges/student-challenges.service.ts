import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import {
  challengeBookProgress, challengeBooks, challengeBookTests, challengeEvents,
  challengeParticipants, challenges, groupEnrollments, groups, submissions, tests,
} from '../db/schema';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { computeLeaderboard } from './challenges.logic';

@Injectable()
export class StudentChallengesService {
  private async findEnrolledStudentIds(courseId: string): Promise<Set<string>> {
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, courseId) });
    const groupIds = courseGroups.map((g) => g.id);
    if (groupIds.length === 0) return new Set();
    const enrollments = await db.query.groupEnrollments.findMany({
      where: and(inArray(groupEnrollments.groupId, groupIds), isNull(groupEnrollments.removedAt)),
      with: { schoolMember: true },
    });
    return new Set(enrollments.map((e) => e.schoolMember.studentId));
  }

  private async assertEnrolled(challengeId: string, studentId: string) {
    const challenge = await db.query.challenges.findFirst({ where: eq(challenges.id, challengeId) });
    if (!challenge) throw new NotFoundException('Challenge not found');
    const enrolledIds = await this.findEnrolledStudentIds(challenge.courseId);
    if (!enrolledIds.has(studentId)) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  private async findOrCreateParticipant(challengeId: string, studentId: string) {
    const participant = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (!participant) throw new NotFoundException('Siz bu challenge-ga qo\'shilmagansiz');
    return participant;
  }

  async findAllForStudent(studentId: string) {
    const enrollments = await db.query.groupEnrollments.findMany({
      where: isNull(groupEnrollments.removedAt),
      with: { schoolMember: true, group: true },
    });
    const myCourseIds = [...new Set(
      enrollments.filter((e) => e.schoolMember.studentId === studentId).map((e) => e.group.courseId),
    )];
    if (myCourseIds.length === 0) return [];

    const allChallenges = await db.query.challenges.findMany({
      where: inArray(challenges.courseId, myCourseIds),
      with: { course: true },
      orderBy: (c, { desc: descOrder }) => [descOrder(c.createdAt)],
    });
    const myParticipations = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.studentId, studentId),
    });
    const joinedChallengeIds = new Set(myParticipations.map((p) => p.challengeId));

    return allChallenges.map((challenge) => ({
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      imageUrl: challenge.imageUrl,
      type: challenge.type,
      courseId: challenge.courseId,
      courseTitle: challenge.course.title,
      joined: joinedChallengeIds.has(challenge.id),
    }));
  }

  async join(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const existing = await db.query.challengeParticipants.findFirst({
      where: and(eq(challengeParticipants.challengeId, challengeId), eq(challengeParticipants.studentId, studentId)),
    });
    if (existing) return existing;

    const [participant] = await db.insert(challengeParticipants).values({ challengeId, studentId }).returning();
    return participant;
  }

  async findOneForStudent(challengeId: string, studentId: string) {
    const challenge = await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);

    const books = await db.query.challengeBooks.findMany({
      where: eq(challengeBooks.challengeId, challengeId),
      with: { test: { with: { test: true } } },
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });

    const results = await Promise.all(books.map(async (book) => {
      const progress = await db.query.challengeBookProgress.findFirst({
        where: and(eq(challengeBookProgress.challengeParticipantId, participant.id), eq(challengeBookProgress.challengeBookId, book.id)),
      });
      const lastPageRead = progress?.lastPageRead ?? 0;

      let pendingTest: { testId: string; slug: string | null; name: string } | null = null;
      if (book.test && (book.test.forceNow || (book.test.triggerPage !== null && lastPageRead >= book.test.triggerPage))) {
        const submission = await db.query.submissions.findFirst({
          where: and(eq(submissions.testId, book.test.testId), eq(submissions.userId, studentId)),
        });
        if (!submission?.submittedAt) {
          pendingTest = { testId: book.test.testId, slug: book.test.test.slug, name: book.test.test.name };
        }
      }

      return {
        id: book.id,
        title: book.title,
        totalPages: book.totalPages,
        lastPageRead,
        completed: lastPageRead >= book.totalPages,
        pendingTest,
      };
    }));

    return { id: challenge.id, name: challenge.name, description: challenge.description, imageUrl: challenge.imageUrl, books: results };
  }

  async addEvent(challengeId: string, bookId: string, studentId: string, data: { endPage: number; newWordsCount: number }) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);

    const book = await db.query.challengeBooks.findFirst({ where: and(eq(challengeBooks.id, bookId), eq(challengeBooks.challengeId, challengeId)) });
    if (!book) throw new NotFoundException('Book not found');

    const progress = await db.query.challengeBookProgress.findFirst({
      where: and(eq(challengeBookProgress.challengeParticipantId, participant.id), eq(challengeBookProgress.challengeBookId, bookId)),
    });
    const startPage = progress?.lastPageRead ?? 0;

    if (data.endPage <= startPage) {
      throw new BadRequestException('Tugagan bet boshlagan betdan katta bo\'lishi kerak');
    }

    const bookTest = await db.query.challengeBookTests.findFirst({ where: eq(challengeBookTests.challengeBookId, bookId) });
    if (bookTest && (bookTest.forceNow || (bookTest.triggerPage !== null && startPage >= bookTest.triggerPage))) {
      const submission = await db.query.submissions.findFirst({
        where: and(eq(submissions.testId, bookTest.testId), eq(submissions.userId, studentId)),
      });
      if (!submission?.submittedAt) {
        const test = await db.query.tests.findFirst({ where: eq(tests.id, bookTest.testId) });
        throw new BadRequestException({
          message: 'Avval majburiy testni yakunlang',
          requiredTestSlug: test?.slug,
          requiredTestName: test?.name,
        });
      }
    }

    const [event] = await db.insert(challengeEvents).values({
      challengeParticipantId: participant.id,
      challengeBookId: bookId,
      startPage,
      endPage: data.endPage,
      newWordsCount: data.newWordsCount ?? 0,
    }).returning();

    if (progress) {
      await db.update(challengeBookProgress)
        .set({ lastPageRead: data.endPage })
        .where(eq(challengeBookProgress.id, progress.id))
        .returning();
    } else {
      await db.insert(challengeBookProgress).values({
        challengeParticipantId: participant.id,
        challengeBookId: bookId,
        lastPageRead: data.endPage,
      }).onConflictDoNothing();
    }

    return event;
  }

  async history(challengeId: string, studentId: string) {
    await this.assertEnrolled(challengeId, studentId);
    const participant = await this.findOrCreateParticipant(challengeId, studentId);
    return db.query.challengeEvents.findMany({
      where: eq(challengeEvents.challengeParticipantId, participant.id),
      with: { book: true },
      orderBy: [desc(challengeEvents.createdAt)],
    });
  }

  async leaderboard(challengeId: string, studentId: string, metric: 'overall' | 'books' | 'words' | 'speed', bookId?: string) {
    await this.assertEnrolled(challengeId, studentId);

    const participants = await db.query.challengeParticipants.findMany({
      where: eq(challengeParticipants.challengeId, challengeId),
      with: { student: true },
    });
    if (participants.length === 0) return { entries: [] };

    const participantIds = participants.map((p) => p.id);
    const events = await db.query.challengeEvents.findMany({
      where: inArray(challengeEvents.challengeParticipantId, participantIds),
    });

    const books = metric === 'books' && !bookId
      ? await db.query.challengeBooks.findMany({ where: eq(challengeBooks.challengeId, challengeId) })
      : [];

    return computeLeaderboard(participants, events, books, metric, bookId, studentId);
  }
}
