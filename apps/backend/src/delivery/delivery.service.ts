import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, submissions, answers, questions, options } from '../db/schema';
import { eq } from 'drizzle-orm';
import { GroqService } from '../groq/groq.service';
import { gradeAnswer, evaluateObjectiveAnswer } from '../grading/grading';

export { evaluateObjectiveAnswer };

@Injectable()
export class DeliveryService {
  constructor(private readonly groqService: GroqService) {}

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
      requireAuth: test.requireAuth,
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

  async startSubmission(slug: string, studentName: string, userId?: string) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');
    if (test.requireAuth && !userId) throw new BadRequestException('AUTH_REQUIRED');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      userId,
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

  async getSubmissionResult(submissionId: string) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      with: {
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!submission.submittedAt) throw new BadRequestException('Submission not yet submitted');

    const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
    const showAnswers = test?.showResults === 'immediately' || test?.showResults === 'per_question';

    const safeAnswers = showAnswers
      ? (submission as any).answers.map((a: any) => ({
          questionId: a.questionId,
          questionText: a.question?.text ?? '',
          questionType: a.question?.type ?? '',
          isCorrect: a.isCorrect,
          selectedOptionIds: a.selectedOptionIds ?? [],
          textAnswer: a.textAnswer ?? null,
          correctAnswer: a.question?.correctAnswer ?? null,
          imageUrl: a.question?.imageUrl ?? null,
          options: (a.question?.options ?? []).map((o: any) => ({
            id: o.id,
            text: o.text,
            isCorrectOption: !!o.isCorrect,
          })),
        }))
      : [];

    return {
      submissionId,
      score: submission.score,
      total: submission.total,
      showResults: test?.showResults ?? 'hidden',
      deadline: test?.deadline ?? null,
      answers: safeAnswers,
    };
  }

  async checkAnswer(submissionId: string, item: {
    questionId: string;
    selectedOptionIds: string[];
    textAnswer: string | null;
  }) {
    const submission = await db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
    if (!submission) throw new NotFoundException('Submission not found');

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: { questions: { with: { options: {} } } },
    });
    if (!test) throw new NotFoundException('Test not found');

    const question = test.questions.find((q) => q.id === item.questionId);
    if (!question) throw new NotFoundException('Question not found');

    // Javob umuman berilmagan bo'lsa — noto'g'ri deb baholanadi
    const hasAnswer = (item.selectedOptionIds?.length ?? 0) > 0 || !!item.textAnswer?.trim();
    if (!hasAnswer) {
      return { isCorrect: false, correctAnswer: this.correctAnswerText(question) };
    }

    const isCorrect = await gradeAnswer(
      { type: question.type, correctAnswer: question.correctAnswer, options: question.options, text: question.text },
      { selectedOptionIds: item.selectedOptionIds, textAnswer: item.textAnswer },
      (qText, hint, studentAnswer) => this.groqService.checkOpenAnswer(qText, hint, studentAnswer),
    );

    return { isCorrect, correctAnswer: this.correctAnswerText(question) };
  }

  // Feedback uchun to'g'ri javob matni: correctAnswer bo'lmasa to'g'ri variant matnlari
  private correctAnswerText(question: { correctAnswer: string | null; type: string; options: Array<{ text: string; isCorrect: boolean }> }): string | null {
    if (question.correctAnswer) return question.correctAnswer;
    if (question.type === 'droppin') return null;
    const correctTexts = question.options.filter((o) => o.isCorrect).map((o) => o.text);
    return correctTexts.length > 0 ? correctTexts.join(', ') : null;
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

    // Safe answer results — options included only when showResults='immediately',
    // marked with isCorrectOption boolean (never raw correctOptionIds)
    const safeAnswers: Array<{
      questionId: string;
      questionText: string;
      questionType: string;
      isCorrect: boolean | null;
      selectedOptionIds: string[];
      textAnswer: string | null;
      correctAnswer: string | null;
      imageUrl?: string | null;
      options?: Array<{ id: string; text: string; isCorrectOption: boolean }>;
    }> = [];

    const answerRows = await Promise.all(answerItems.map(async (item) => {
      const question = questionMap.get(item.questionId);
      if (!question) return null;

      let isCorrect: boolean | null = null;

      const gradeInput = { selectedOptionIds: item.selectedOptionIds, textAnswer: item.textAnswer };
      const gradableQuestion = { type: question.type, correctAnswer: question.correctAnswer, options: question.options, text: question.text };
      const checkOpenAnswer = (qText: string, hint: string, studentAnswer: string) =>
        this.groqService.checkOpenAnswer(qText, hint, studentAnswer);

      if (question.type === 'single' || question.type === 'multi') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'open') {
        if (item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'arrange' || question.type === 'reorder') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'truefalse') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'matching') {
        // options: pairs saved as orderIndex=pairIndex, isCorrect=true(left)/false(right)
        // student sends selectedOptionIds: [leftId, rightId, leftId, rightId, ...]
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'fillblank') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'slider') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'droppin') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer);
          if (isCorrect) score++;
        }
      }

      safeAnswers.push({
        questionId: item.questionId,
        questionText: question.text,
        questionType: question.type,
        isCorrect,
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
        correctAnswer: question.correctAnswer ?? null,
        imageUrl: question.imageUrl ?? null,
        options: question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrectOption: !!o.isCorrect,
        })),
      });

      return {
        submissionId,
        questionId: item.questionId,
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
        isCorrect,
      };
    })).then(rows => rows.filter(Boolean)) as any[];

    if (answerRows.length > 0) {
      await db.insert(answers).values(answerRows);
    }

    await db.update(submissions)
      .set({ submittedAt: new Date(), score, total })
      .where(eq(submissions.id, submissionId));

    // Only return answer breakdown if showResults === 'immediately' or 'per_question'
    // For other modes, never send per-question correctness to client
    const showAnswers = test.showResults === 'immediately' || test.showResults === 'per_question';

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
