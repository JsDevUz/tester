import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, submissions, answers, questions, options } from '../db/schema';
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

  // Resume: return submission state if not yet submitted
  async getSubmission(submissionId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Already submitted — return result (respecting showResults)
    if (submission.submittedAt) {
      const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
      return {
        status: 'submitted' as const,
        score: submission.score,
        total: submission.total,
        showResults: test?.showResults ?? 'hidden',
        deadline: test?.deadline ?? null,
      };
    }

    // Not submitted — return in-progress state so frontend can resume
    return {
      status: 'in_progress' as const,
      testId: submission.testId,
      studentName: submission.studentName,
    };
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
      // Already submitted — return cached result (beacon may fire multiple times)
      const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
      return {
        submissionId,
        score: submission.score,
        total: submission.total,
        showResults: test?.showResults ?? 'hidden',
        deadline: test?.deadline ?? null,
        answers: [],
      };
    }

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: { questions: { with: { options: {} } } },
    });
    if (!test) throw new NotFoundException('Test not found');

    const questionMap = new Map(test.questions.map((q) => [q.id, q]));

    let score = 0;
    let total = 0;

    // Safe answer results — never expose correct option IDs or option texts to client
    const safeAnswers: Array<{
      questionId: string;
      questionText: string;
      questionType: string;
      isCorrect: boolean | null;
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
        const correctOrder = question.options
          .filter((o) => o.isCorrect)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => o.id);
        isCorrect =
          correctOrder.length === item.selectedOptionIds.length &&
          correctOrder.every((id, i) => id === item.selectedOptionIds[i]);
        if (isCorrect) score++;
      }

      safeAnswers.push({
        questionId: item.questionId,
        questionText: question.text,
        questionType: question.type,
        isCorrect,
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

    // Only return answer breakdown if showResults === 'immediately'
    // For other modes, never send per-question correctness to client
    const showAnswers = test.showResults === 'immediately';

    return {
      submissionId,
      score,
      total,
      showResults: test.showResults,
      deadline: test.deadline,
      answers: showAnswers ? safeAnswers : [],
    };
  }
}
