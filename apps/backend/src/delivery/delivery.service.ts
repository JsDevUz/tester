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

export function normalizeViolationReason(reason?: string | null) {
  const text = reason?.trim();
  return text ? text.slice(0, 300) : null;
}

export function applyPracticeOverride<T extends { showResults: string; oneByOne: boolean; requireAuth: boolean; deadline: Date | string | null }>(
  config: T,
  practiceMode: boolean,
): T {
  if (!practiceMode) return config;
  return { ...config, showResults: 'immediately', oneByOne: false, requireAuth: true, deadline: null };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  async getTestBySlug(slug: string, practiceMode = false) {
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

    const overridden = applyPracticeOverride(
      {
        showResults: test.showResults,
        oneByOne: test.oneByOne,
        requireAuth: test.requireAuth,
        deadline: test.deadline,
      },
      practiceMode,
    );

    return {
      id: test.id,
      name: test.name,
      description: test.description,
      timeLimit: test.timeLimit,
      showResults: overridden.showResults,
      shuffleQuestions: test.shuffleQuestions,
      shuffleOptions: test.shuffleOptions,
      oneByOne: overridden.oneByOne,
      requireAuth: overridden.requireAuth,
      deadline: overridden.deadline,
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

  async startSubmission(slug: string, studentName: string, userId?: string, practiceMode = false) {
    const test = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!test) throw new NotFoundException('Test not found');
    const requireAuth = practiceMode ? true : test.requireAuth;
    if (requireAuth && !userId) throw new BadRequestException('AUTH_REQUIRED');

    const [submission] = await db.insert(submissions).values({
      testId: test.id,
      userId,
      studentName,
    }).returning();

    return { submissionId: submission.id };
  }

  // Resume: return submission state if not yet submitted
  async getSubmission(submissionId: string, practiceMode = false) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Already submitted — return result (respecting showResults)
    if (submission.submittedAt) {
      const test = await db.query.tests.findFirst({ where: eq(tests.id, submission.testId) });
      const overridden = applyPracticeOverride(
        { showResults: test?.showResults ?? 'hidden', oneByOne: test?.oneByOne ?? false, requireAuth: test?.requireAuth ?? false, deadline: test?.deadline ?? null },
        practiceMode,
      );
      return {
        status: 'submitted' as const,
        score: submission.score,
        total: submission.total,
        showResults: overridden.showResults,
        deadline: overridden.deadline,
        mode: normalizeSubmissionMode(submission.mode),
        violationReason: normalizeViolationReason(submission.violationReason),
      };
    }

    // Not submitted — return in-progress state so frontend can resume
    return {
      status: 'in_progress' as const,
      testId: submission.testId,
      studentName: submission.studentName,
    };
  }

  async getSubmissionResult(submissionId: string, practiceMode = false) {
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
    const effectiveShowResults = practiceMode ? 'immediately' : (test?.showResults ?? 'hidden');
    const effectiveDeadline = practiceMode ? null : (test?.deadline ?? null);
    const showAnswers = effectiveShowResults === 'immediately' || effectiveShowResults === 'per_question';
    const questionMap = new Map((test?.questions ?? []).map((q) => [q.id, q]));

    const safeAnswers = showAnswers
      ? orderSubmissionAnswersForDisplay((submission as any).answers, test?.questions ?? [], submissionId, !!test?.shuffleQuestions)
        .map((a: any) => {
          const question = questionMap.get(a.questionId) ?? a.question;
          const options = question?.options ?? [];
          const displayOptions = test?.shuffleOptions && question?.type !== 'matching'
            ? seededShuffle(options, submissionId + a.questionId)
            : options;
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
      violationReason: normalizeViolationReason(submission.violationReason),
      showResults: effectiveShowResults,
      deadline: effectiveDeadline,
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
      (correctAnswer, studentAnswer) => this.groqService.checkFillBlankAnswer(correctAnswer, studentAnswer),
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
  }>, mode?: string, violationReason?: string | null, practiceMode = false) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.submittedAt) {
      // Already submitted — return full persisted result (beacon may fire multiple times).
      return this.getSubmissionResult(submissionId, practiceMode);
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
      const checkFillBlankAnswer = (correctAnswer: string, studentAnswer: string) =>
        this.groqService.checkFillBlankAnswer(correctAnswer, studentAnswer);

      if (question.type === 'single' || question.type === 'multi') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'open') {
        if (item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'arrange' || question.type === 'reorder') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'truefalse') {
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'matching') {
        // options: pairs saved as orderIndex=pairIndex, isCorrect=true(left)/false(right)
        // student sends selectedOptionIds: [leftId, rightId, leftId, rightId, ...]
        total++;
        isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
        if (isCorrect) score++;
      } else if (question.type === 'fillblank') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'slider') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
          if (isCorrect) score++;
        }
      } else if (question.type === 'droppin') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          isCorrect = await gradeAnswer(gradableQuestion, gradeInput, checkOpenAnswer, checkFillBlankAnswer);
          if (isCorrect) score++;
        }
      }

      const displayOptions = test.shuffleOptions && question.type !== 'matching'
        ? seededShuffle(question.options, submissionId + item.questionId)
        : question.options;
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
      .set({
        submittedAt: new Date(),
        score,
        total,
        mode: normalizeSubmissionMode(mode),
        violationReason: normalizeSubmissionMode(mode) === 'violation'
          ? normalizeViolationReason(violationReason) ?? 'Taqiqlangan harakat aniqlanganligi sababli yakunlandi.'
          : null,
      })
      .where(and(eq(submissions.id, submissionId), isNull(submissions.submittedAt)))
      .returning();

    if (!updatedSubmission) {
      // Boshqa so'rov ulgurib submit qilgan. Answers insert tugashini kutib,
      // to'liq persisted natijani qaytaramiz.
      await sleep(120);
      return this.getSubmissionResult(submissionId, practiceMode);
    }

    if (answerRows.length > 0) {
      await db.insert(answers).values(answerRows);
    }

    // Only return answer breakdown if showResults === 'immediately' or 'per_question'
    // For other modes, never send per-question correctness to client
    const effectiveShowResults = practiceMode ? 'immediately' : test.showResults;
    const effectiveDeadline = practiceMode ? null : test.deadline;
    const showAnswers = effectiveShowResults === 'immediately' || effectiveShowResults === 'per_question';

    return {
      submissionId,
      score,
      total,
      mode: normalizeSubmissionMode(mode),
      violationReason: normalizeSubmissionMode(mode) === 'violation'
        ? normalizeViolationReason(violationReason) ?? 'Taqiqlangan harakat aniqlanganligi sababli yakunlandi.'
        : null,
      showResults: effectiveShowResults,
      deadline: effectiveDeadline,
      answers: showAnswers ? safeAnswers : [],
    };
  }
}
