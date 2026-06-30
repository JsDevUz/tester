import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, submissions, answers } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class DeliveryService {
  async getTestBySlug(slug: string) {
    const test = await db.query.tests.findFirst({
      where: eq(tests.slug, slug),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      timeLimit: test.timeLimit,
      showResults: test.showResults,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      oneByOne: test.oneByOne,
      deadline: test.deadline,
      questions: test.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        orderIndex: q.orderIndex,
        imageUrl: q.imageUrl,
        audioUrl: q.audioUrl,
        // For arrange questions expose all options (correct+distractors) without revealing isCorrect
        options: q.options.map((o) => ({ id: o.id, text: o.text, orderIndex: o.orderIndex })),
      })),
    };
  }

  async startSubmission(slug: string, studentName: string) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      studentName,
    }).returning();

    return { submissionId: submission.id };
  }

  async submitAnswers(submissionId: string, answerItems: Array<{
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string | null;
  }>) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.submittedAt) {
      throw new BadRequestException('Submission already submitted');
    }

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: {
        questions: {
          with: { options: {} },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');

    const questionMap = new Map(test.questions.map((q) => [q.id, q]));

    let score = 0;
    let total = 0;
    const answerResults: Array<{
      questionId: string;
      questionText: string;
      questionType: string;
      isCorrect: boolean | null;
      correctOptionIds: string[];
      options: Array<{ id: string; text: string }>;
      selectedOptionIds: string[];
      textAnswer: string | null;
    }> = [];

    const answerRows = answerItems.map((item) => {
      const question = questionMap.get(item.questionId);
      if (!question) return null;

      let isCorrect: boolean | null = null;

      if (question.type === 'single' || question.type === 'multi') {
        total++;
        const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
        const selectedIds = new Set(item.selectedOptionIds);
        isCorrect =
          correctIds.size === selectedIds.size &&
          [...correctIds].every((id) => selectedIds.has(id));
        if (isCorrect) score++;
      } else if (question.type === 'arrange') {
        total++;
        // Correct order: options with isCorrect=true sorted by orderIndex
        const correctOrder = question.options
          .filter((o) => o.isCorrect)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => o.id);
        isCorrect =
          correctOrder.length === item.selectedOptionIds.length &&
          correctOrder.every((id, i) => id === item.selectedOptionIds[i]);
        if (isCorrect) score++;
      }

      answerResults.push({
        questionId: item.questionId,
        questionText: question.text,
        questionType: question.type,
        isCorrect,
        correctOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
        options: question.options.map((o) => ({ id: o.id, text: o.text })),
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
      });

      return {
        submissionId,
        questionId: item.questionId,
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
        isCorrect,
      };
    }).filter(Boolean) as any[];

    if (answerRows.length > 0) {
      await db.insert(answers).values(answerRows);
    }

    await db.update(submissions)
      .set({ submittedAt: new Date(), score, total })
      .where(eq(submissions.id, submissionId));

    return {
      submissionId,
      score,
      total,
      showResults: test.showResults,
      deadline: test.deadline,
      answers: answerResults,
    };
  }
}
