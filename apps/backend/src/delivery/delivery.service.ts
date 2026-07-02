import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests, submissions, answers, questions, options } from '../db/schema';
import { eq } from 'drizzle-orm';
import { GroqService } from '../groq/groq.service';

export function evaluateObjectiveAnswer(
  questionType: string,
  correctOptionIds: string[],
  selectedOptionIds: string[],
) {
  if (correctOptionIds.length === 0) return false;
  if (questionType === 'arrange') {
    return correctOptionIds.length === selectedOptionIds.length &&
      correctOptionIds.every((id, i) => id === selectedOptionIds[i]);
  }

  const correctIds = new Set(correctOptionIds);
  const selectedIds = new Set(selectedOptionIds);
  return correctIds.size === selectedIds.size &&
    [...correctIds].every((id) => selectedIds.has(id));
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
    const showAnswers = test?.showResults === 'immediately';

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

    let isCorrect: boolean | null = null;

    if (question.type === 'single' || question.type === 'multi') {
      const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
      isCorrect = evaluateObjectiveAnswer(question.type, correctIds, item.selectedOptionIds);
    } else if (question.type === 'truefalse') {
      const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
      isCorrect = evaluateObjectiveAnswer('single', correctIds, item.selectedOptionIds);
    } else if (question.type === 'arrange' || question.type === 'reorder') {
      const correctOrder = question.options
        .filter((o) => o.isCorrect)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => o.id);
      isCorrect = evaluateObjectiveAnswer('arrange', correctOrder, item.selectedOptionIds);
    } else if (question.type === 'matching') {
      const lefts = question.options.filter((o) => o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
      const rights = question.options.filter((o) => !o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
      let allMatch = lefts.length > 0 && lefts.length === rights.length;
      for (let i = 0; i < lefts.length && allMatch; i++) {
        if (item.selectedOptionIds[i * 2] !== lefts[i].id || item.selectedOptionIds[i * 2 + 1] !== rights[i].id) allMatch = false;
      }
      isCorrect = allMatch;
    } else if (question.type === 'fillblank') {
      if (question.correctAnswer && item.textAnswer?.trim()) {
        isCorrect = question.correctAnswer.trim().toLowerCase() === item.textAnswer.trim().toLowerCase();
      }
    } else if (question.type === 'open') {
      if (item.textAnswer?.trim()) {
        const manualOptions = question.options.filter((o) => o.isCorrect);
        if (manualOptions.length > 0) {
          isCorrect = manualOptions.some((o) => o.text.trim().toLowerCase() === item.textAnswer!.trim().toLowerCase());
          if (!isCorrect && question.correctAnswer) {
            isCorrect = await this.groqService.checkOpenAnswer(question.text, question.correctAnswer, item.textAnswer);
          }
        } else if (question.correctAnswer) {
          isCorrect = await this.groqService.checkOpenAnswer(question.text, question.correctAnswer, item.textAnswer);
        }
      }
    } else if (question.type === 'slider') {
      if (question.correctAnswer && item.textAnswer?.trim()) {
        const correct = parseFloat(question.correctAnswer);
        const student = parseFloat(item.textAnswer.trim());
        const tolerance = question.options[2] ? parseFloat(question.options[2].text) : 1;
        isCorrect = !isNaN(student) && Math.abs(student - correct) <= tolerance;
      }
    } else if (question.type === 'droppin') {
      if (question.correctAnswer && item.textAnswer?.trim()) {
        const [cx, cy] = question.correctAnswer.split(',').map(Number);
        const [sx, sy] = item.textAnswer.trim().split(',').map(Number);
        const dist = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2);
        const radiusPct = question.options[0] ? parseFloat(question.options[0].text) / 100 : 0.08;
        isCorrect = dist <= radiusPct;
      }
    }

    const correctAnswer = question.correctAnswer ?? null;
    return { isCorrect, correctAnswer };
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

      if (question.type === 'single' || question.type === 'multi') {
        total++;
        const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
        isCorrect = evaluateObjectiveAnswer(question.type, correctIds, item.selectedOptionIds);
        if (isCorrect) score++;
      } else if (question.type === 'open') {
        if (item.textAnswer?.trim()) {
          total++;
          const studentLower = item.textAnswer.trim().toLowerCase();
          // First: check against manual correct options (exact match)
          const manualOptions = question.options.filter((o) => o.isCorrect);
          if (manualOptions.length > 0) {
            const exactMatch = manualOptions.some((o) => o.text.trim().toLowerCase() === studentLower);
            if (exactMatch) {
              isCorrect = true;
            } else if (question.correctAnswer) {
              // Fallback to AI only if correctAnswer hint provided
              isCorrect = await this.groqService.checkOpenAnswer(question.text, question.correctAnswer, item.textAnswer);
            } else {
              isCorrect = false;
            }
          } else if (question.correctAnswer) {
            isCorrect = await this.groqService.checkOpenAnswer(question.text, question.correctAnswer, item.textAnswer);
          }
          if (isCorrect) score++;
        }
      } else if (question.type === 'arrange' || question.type === 'reorder') {
        total++;
        const correctOrder = question.options
          .filter((o) => o.isCorrect)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => o.id);
        isCorrect = evaluateObjectiveAnswer('arrange', correctOrder, item.selectedOptionIds);
        if (isCorrect) score++;
      } else if (question.type === 'truefalse') {
        total++;
        const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);
        isCorrect = evaluateObjectiveAnswer('single', correctIds, item.selectedOptionIds);
        if (isCorrect) score++;
      } else if (question.type === 'matching') {
        // options: pairs saved as orderIndex=pairIndex, isCorrect=true(left)/false(right)
        // student sends selectedOptionIds: [leftId, rightId, leftId, rightId, ...]
        total++;
        const pairs = question.options;
        const lefts = pairs.filter((o) => o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
        const rights = pairs.filter((o) => !o.isCorrect).sort((a, b) => a.orderIndex - b.orderIndex);
        const studentIds = item.selectedOptionIds;
        let allMatch = lefts.length > 0 && lefts.length === rights.length;
        for (let i = 0; i < lefts.length && allMatch; i++) {
          if (studentIds[i * 2] !== lefts[i].id || studentIds[i * 2 + 1] !== rights[i].id) {
            allMatch = false;
          }
        }
        isCorrect = allMatch;
        if (isCorrect) score++;
      } else if (question.type === 'fillblank') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          const correct = question.correctAnswer.trim().toLowerCase();
          const student = item.textAnswer.trim().toLowerCase();
          isCorrect = correct === student;
          if (isCorrect) score++;
        }
      } else if (question.type === 'slider') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          const correct = parseFloat(question.correctAnswer);
          const student = parseFloat(item.textAnswer.trim());
          const tolerance = question.options[2] ? parseFloat(question.options[2].text) : 1;
          isCorrect = !isNaN(student) && Math.abs(student - correct) <= tolerance;
          if (isCorrect) score++;
        }
      } else if (question.type === 'droppin') {
        if (question.correctAnswer && item.textAnswer?.trim()) {
          total++;
          const [cx, cy] = question.correctAnswer.split(',').map(Number);
          const [sx, sy] = item.textAnswer.trim().split(',').map(Number);
          const dist = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2);
          const radiusPct = question.options[0] ? parseFloat(question.options[0].text) / 100 : 0.08;
          isCorrect = dist <= radiusPct;
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
