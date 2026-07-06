import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, submissions, answers, questions, options } from '../db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { GroqService } from '../groq/groq.service';
import { gradeAnswer, evaluateObjectiveAnswer } from '../grading/grading';

export { evaluateObjectiveAnswer };

export function normalizeSubmissionMode(mode?: string | null) {
  return mode === 'violation' || mode === 'live' ? mode : 'normal';
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function orderSubmissionAnswersForDisplay<T extends { questionId: string }>(
  answerItems: T[],
  questions: Array<{ id: string; orderIndex: number }>,
  submissionId: string,
  shuffleQuestions: boolean,
) {
  const questionOrder = [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
  const displayOrder = shuffleQuestions ? seededShuffle(questionOrder, submissionId) : questionOrder;
  const orderIndex = new Map(displayOrder.map((q, index) => [q.id, index]));
  return [...answerItems].sort((a, b) =>
    (orderIndex.get(a.questionId) ?? Number.MAX_SAFE_INTEGER) -
    (orderIndex.get(b.questionId) ?? Number.MAX_SAFE_INTEGER),
  );
}

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
        mode: normalizeSubmissionMode(submission.mode),
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

    const test = await db.query.tests.findFirst({
      where: eq(tests.id, submission.testId),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    const showAnswers = test?.showResults === 'immediately' || test?.showResults === 'per_question';
    const questionMap = new Map((test?.questions ?? []).map((q) => [q.id, q]));

    const safeAnswers = showAnswers
      ? orderSubmissionAnswersForDisplay((submission as any).answers, test?.questions ?? [], submissionId, !!test?.shuffleQuestions)
        .map((a: any) => {
          const question = questionMap.get(a.questionId) ?? a.question;
          const options = question?.options ?? [];
          const displayOptions = test?.shuffleOptions ? seededShuffle(options, submissionId + a.questionId) : options;
          return {
            questionId: a.questionId,
            questionText: question?.text ?? '',
            questionType: question?.type ?? '',
            isCorrect: a.isCorrect,
            selectedOptionIds: a.selectedOptionIds ?? [],
            textAnswer: a.textAnswer ?? null,
            correctAnswer: question?.correctAnswer ?? null,
            imageUrl: question?.imageUrl ?? null,
            options: displayOptions.map((o: any) => ({
              id: o.id,
              text: o.text,
              isCorrectOption: !!o.isCorrect,
            })),
          };
        })
      : [];

    return {
      submissionId,
      score: submission.score,
      total: submission.total,
      mode: normalizeSubmissionMode(submission.mode),
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
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
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
  }>, mode?: string) {
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
        mode: normalizeSubmissionMode(submission.mode),
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
    type SafeAnswer = {
      questionId: string;
      questionText: string;
      questionType: string;
      isCorrect: boolean | null;
      selectedOptionIds: string[];
      textAnswer: string | null;
      correctAnswer: string | null;
      imageUrl?: string | null;
      options?: Array<{ id: string; text: string; isCorrectOption: boolean }>;
    };

    const gradedRows = await Promise.all(answerItems.map(async (item) => {
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

      const displayOptions = test.shuffleOptions ? seededShuffle(question.options, submissionId + item.questionId) : question.options;
      const safeAnswer: SafeAnswer = {
        questionId: item.questionId,
        questionText: question.text,
        questionType: question.type,
        isCorrect,
        selectedOptionIds: item.selectedOptionIds,
        textAnswer: item.textAnswer ?? null,
        correctAnswer: question.correctAnswer ?? null,
        imageUrl: question.imageUrl ?? null,
        options: displayOptions.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrectOption: !!o.isCorrect,
        })),
      };

      return {
        answerRow: {
          submissionId,
          questionId: item.questionId,
          selectedOptionIds: item.selectedOptionIds,
          textAnswer: item.textAnswer ?? null,
          isCorrect,
        },
        safeAnswer,
      };
    })).then(rows => rows.filter(Boolean)) as Array<{ answerRow: any; safeAnswer: SafeAnswer }>;

    const answerRows = gradedRows.map((row) => row.answerRow);
    const safeAnswers = orderSubmissionAnswersForDisplay(
      gradedRows.map((row) => row.safeAnswer),
      test.questions,
      submissionId,
      test.shuffleQuestions,
    );

    // Atomik compare-and-swap: faqat submittedAt hali null bo'lsa yozamiz. Bu ikkita
    // parallel submit so'rovi (masalan tab yopilganda beacon va foydalanuvchi tugmasi
    // bir vaqtda) bir xil savol uchun ikkita answers qatori yaratib qo'yishining oldini oladi.
    const [updatedSubmission] = await db.update(submissions)
      .set({ submittedAt: new Date(), score, total, mode: normalizeSubmissionMode(mode) })
      .where(and(eq(submissions.id, submissionId), isNull(submissions.submittedAt)))
      .returning();

    if (!updatedSubmission) {
      // Boshqa so'rov ulgurib submit qilgan — o'sha natijani qaytaramiz, qayta yozmaymiz.
      const already = await db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
      return {
        submissionId,
        score: already?.score ?? score,
        total: already?.total ?? total,
        mode: normalizeSubmissionMode(already?.mode ?? mode),
        showResults: test.showResults,
        deadline: test.deadline,
        answers: [],
      };
    }

    if (answerRows.length > 0) {
      await db.insert(answers).values(answerRows);
    }

    // Only return answer breakdown if showResults === 'immediately' or 'per_question'
    // For other modes, never send per-question correctness to client
    const showAnswers = test.showResults === 'immediately' || test.showResults === 'per_question';

    return {
      submissionId,
      score,
      total,
      mode: normalizeSubmissionMode(mode),
      showResults: test.showResults,
      deadline: test.deadline,
      answers: showAnswers ? safeAnswers : [],
    };
  }
}
