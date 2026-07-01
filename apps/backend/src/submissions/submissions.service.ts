import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { submissions, tests } from '../db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

@Injectable()
export class SubmissionsService {
  async findByTest(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');

    return db.query.submissions.findMany({
      where: and(eq(submissions.testId, testId), isNotNull(submissions.submittedAt)),
      orderBy: (s, { desc }) => [desc(s.submittedAt)],
    });
  }

  async findMine(userId: string) {
    const rows = await db.query.submissions.findMany({
      where: and(eq(submissions.userId, userId), isNotNull(submissions.submittedAt)),
      with: { test: true },
      orderBy: (s, { desc }) => [desc(s.submittedAt)],
    });

    return rows.map((submission) => ({
      id: submission.id,
      testId: submission.testId,
      testName: submission.test.name,
      studentName: submission.studentName,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      score: submission.score,
      total: submission.total,
    }));
  }

  async deleteOne(submissionId: string, adminId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: { test: true },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.test.adminId !== adminId) throw new NotFoundException('Submission not found');
    await db.delete(submissions).where(eq(submissions.id, submissionId));
  }

  async findOne(submissionId: string, adminId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        test: true,
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.test.adminId !== adminId) throw new NotFoundException('Submission not found');

    return {
      id: submission.id,
      studentName: submission.studentName,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      score: submission.score,
      total: submission.total,
      testId: submission.testId,
      answers: submission.answers.map((a) => ({
        questionId: a.questionId,
        questionText: a.question.text,
        questionType: a.question.type,
        selectedOptionIds: a.selectedOptionIds,
        textAnswer: a.textAnswer,
        isCorrect: a.isCorrect,
        correctOptionIds: a.question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id),
        options: a.question.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
      })),
    };
  }
}
