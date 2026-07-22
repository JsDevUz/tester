import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { answers, groupEnrollments, practiceChatMessages, schoolMembers, submissions, tests } from '../db/schema';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { normalizeViolationReason, orderSubmissionAnswersForDisplay, seededShuffle } from '../delivery/delivery.service';

export type SubmissionSortField = 'submittedAt' | 'score';
export type SubmissionSortDir = 'asc' | 'desc';

// selectedOptionIds orqali "tanlangan variant" tushunchasi faqat shu turlar
// uchun ma'noga ega (haqiqiy javob variantlari) — boshqa turlarda options
// qatorlari sozlama sifatida ishlatiladi (grading.ts'dagi izohga qarang),
// shuning uchun ular uchun faqat to'g'ri/noto'g'ri foizi ko'rsatiladi.
const OPTION_BASED_TYPES = new Set(['single', 'multi', 'truefalse']);

@Injectable()
export class SubmissionsService {
  async findByTest(
    testId: string,
    adminId: string,
    limit = 10,
    offset = 0,
    sort: SubmissionSortField = 'submittedAt',
    dir: SubmissionSortDir = 'desc',
  ) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');

    return db.query.submissions.findMany({
      where: and(eq(submissions.testId, testId), isNotNull(submissions.submittedAt)),
      orderBy: (s, { asc, desc }) => {
        const column = sort === 'score' ? s.score : s.submittedAt;
        return [dir === 'asc' ? asc(column) : desc(column)];
      },
      limit,
      offset,
    });
  }

  async findMine(userId: string, limit = 10, offset = 0) {
    const rows = await db.query.submissions.findMany({
      where: and(eq(submissions.userId, userId), isNotNull(submissions.submittedAt)),
      with: { test: true },
      orderBy: (s, { desc }) => [desc(s.submittedAt)],
      limit,
      offset,
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
      mode: submission.mode,
      violationReason: normalizeViolationReason(submission.violationReason),
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

  async findMineOne(submissionId: string, userId: string) {
    const submission = await db.query.submissions.findFirst({
      where: and(eq(submissions.id, submissionId), eq(submissions.userId, userId)),
      with: {
        test: true,
        answers: {
          with: { question: { with: { options: {} } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const practiceMessage = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.testSubmissionId, submission.id),
        eq(practiceChatMessages.type, 'practice_test'),
      ),
    });
    // Kurs amaliyotida o'quvchi o'z natijasini doim ko'ra oladi. Oddiy testlarda
    // esa testning showResults sozlamasi saqlanadi.
    const effectiveShowResults = practiceMessage
      ? 'immediately'
      : submission.test.showResults;
    const showAnswers = effectiveShowResults === 'immediately' || effectiveShowResults === 'per_question';
    const orderedAnswers = orderSubmissionAnswersForDisplay(
      submission.answers,
      submission.answers.map((a) => ({ id: a.questionId, orderIndex: a.question.orderIndex })),
      submissionId,
      submission.test.shuffleQuestions,
    );

    return {
      id: submission.id,
      testName: submission.test.name,
      studentName: submission.studentName,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      score: submission.score,
      total: submission.total,
      mode: submission.mode,
      violationReason: normalizeViolationReason(submission.violationReason),
      showResults: effectiveShowResults,
      answers: showAnswers ? orderedAnswers.map((a) => {
        const sortedOptions = [...a.question.options].sort((x, y) => x.orderIndex - y.orderIndex);
        const displayOptions = submission.test.shuffleOptions && a.question.type !== 'matching'
          ? seededShuffle(sortedOptions, submissionId + a.questionId)
          : sortedOptions;
        return {
          questionId: a.questionId,
          questionText: a.question.text,
          questionType: a.question.type,
          selectedOptionIds: a.selectedOptionIds,
          textAnswer: a.textAnswer,
          correctAnswer: a.question.correctAnswer ?? null,
          imageUrl: a.question.imageUrl ?? null,
          isCorrect: a.isCorrect,
          options: displayOptions.map((o) => ({ id: o.id, text: o.text, isCorrectOption: !!o.isCorrect })),
        };
      }) : [],
    };
  }

  private async isCuratorOfSubmissionStudent(studentId: string, curatorId: string) {
    if (!studentId) return false;
    const studentMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    const curatorMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, curatorId), eq(schoolMembers.role, 'curator')),
    });
    if (!studentMembership || !curatorMembership || studentMembership.schoolId !== curatorMembership.schoolId) {
      return false;
    }
    const studentEnrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.schoolMemberId, studentMembership.id), isNull(groupEnrollments.removedAt)),
    });
    const curatorEnrollments = await db.query.groupEnrollments.findMany({
      where: and(eq(groupEnrollments.schoolMemberId, curatorMembership.id), isNull(groupEnrollments.removedAt)),
    });
    const curatorGroupIds = new Set(curatorEnrollments.map((enrollment) => enrollment.groupId));
    return studentEnrollments.some((enrollment) => curatorGroupIds.has(enrollment.groupId));
  }

  async findOne(submissionId: string, callerId: string, callerRole: string) {
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

    const isOwner = submission.test.adminId === callerId;
    const isCurator =
      !isOwner &&
      callerRole === 'curator' &&
      submission.userId !== null &&
      (await this.isCuratorOfSubmissionStudent(submission.userId, callerId));
    if (!isOwner && !isCurator) throw new NotFoundException('Submission not found');
    const orderedAnswers = orderSubmissionAnswersForDisplay(
      submission.answers,
      submission.answers.map((a) => ({ id: a.questionId, orderIndex: a.question.orderIndex })),
      submissionId,
      submission.test.shuffleQuestions,
    );

    return {
      id: submission.id,
      studentName: submission.studentName,
      startedAt: submission.startedAt,
      submittedAt: submission.submittedAt,
      score: submission.score,
      total: submission.total,
      mode: submission.mode,
      violationReason: normalizeViolationReason(submission.violationReason),
      testId: submission.testId,
      testName: submission.test.name,
      answers: orderedAnswers.map((a) => {
        const sortedOptions = [...a.question.options].sort((x, y) => x.orderIndex - y.orderIndex);
        const displayOptions = submission.test.shuffleOptions && a.question.type !== 'matching'
          ? seededShuffle(sortedOptions, submissionId + a.questionId)
          : sortedOptions;
        return {
          questionId: a.questionId,
          questionText: a.question.text,
          questionType: a.question.type,
          selectedOptionIds: a.selectedOptionIds,
          textAnswer: a.textAnswer,
          correctAnswer: a.question.correctAnswer ?? null,
          imageUrl: a.question.imageUrl ?? null,
          isCorrect: a.isCorrect,
          correctOptionIds: displayOptions
            .filter((o) => o.isCorrect)
            .map((o) => o.id),
          options: displayOptions.map((o) => ({ id: o.id, text: o.text, isCorrectOption: !!o.isCorrect })),
        };
      }),
    };
  }

  // Test bo'yicha savol/variant statistikasi — har bir savolda har bir
  // variantni nechta talaba tanlagani, va savolning umumiy to'g'ri javob
  // foizi (eng ko'p xato/to'g'ri qilingan savollarni ajratib ko'rsatish uchun).
  async getStats(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    if (test.questions.length === 0) {
      return { questions: [] };
    }

    const questionIds = test.questions.map((q) => q.id);
    const submittedSubmissions = await db.query.submissions.findMany({
      where: and(eq(submissions.testId, testId), isNotNull(submissions.submittedAt)),
      columns: { id: true, studentName: true },
    });
    const submissionIds = submittedSubmissions.map((s) => s.id);
    const studentNameBySubmissionId = new Map(submittedSubmissions.map((s) => [s.id, s.studentName]));

    const answerRows = submissionIds.length === 0 ? [] : await db.query.answers.findMany({
      where: and(inArray(answers.questionId, questionIds), inArray(answers.submissionId, submissionIds)),
    });

    const answersByQuestion = new Map<string, typeof answerRows>();
    for (const a of answerRows) {
      const list = answersByQuestion.get(a.questionId) ?? [];
      list.push(a);
      answersByQuestion.set(a.questionId, list);
    }

    const questionStats = test.questions.map((q) => {
      const qAnswers = answersByQuestion.get(q.id) ?? [];
      const answeredCount = qAnswers.length;
      const correctCount = qAnswers.filter((a) => a.isCorrect === true).length;
      const correctRate = answeredCount > 0 ? correctCount / answeredCount : null;

      let optionCounts: Array<{ id: string; text: string; isCorrectOption: boolean; count: number; students: string[] }> | null = null;
      let textAnswerCounts: Array<{ text: string; count: number }> | null = null;

      if (OPTION_BASED_TYPES.has(q.type)) {
        const studentsByOption = new Map<string, string[]>();
        for (const a of qAnswers) {
          const studentName = studentNameBySubmissionId.get(a.submissionId) ?? '—';
          for (const optionId of a.selectedOptionIds) {
            const list = studentsByOption.get(optionId) ?? [];
            list.push(studentName);
            studentsByOption.set(optionId, list);
          }
        }
        optionCounts = q.options.map((o) => {
          const students = studentsByOption.get(o.id) ?? [];
          return {
            id: o.id,
            text: o.text,
            isCorrectOption: o.isCorrect,
            count: students.length,
            students,
          };
        });
      } else if (q.type === 'open' || q.type === 'fillblank') {
        const counts = new Map<string, number>();
        for (const a of qAnswers) {
          const text = a.textAnswer?.trim();
          if (!text) continue;
          counts.set(text, (counts.get(text) ?? 0) + 1);
        }
        textAnswerCounts = [...counts.entries()]
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      return {
        questionId: q.id,
        questionText: q.text,
        questionType: q.type,
        answeredCount,
        correctCount,
        correctRate,
        optionCounts,
        textAnswerCounts,
      };
    });

    // Eng ko'p to'g'ri va eng ko'p xato qilingan savollarni ajratib
    // ko'rsatish uchun — kamida bitta talaba javob bergan savollar orasidan.
    // Solishtirish uchun kamida 2 ta har xil natijali savol bo'lishi shart —
    // aks holda (masalan bitta savol, yoki barchasi 100% to'g'ri) "eng ko'p
    // xato" belgisi noto'g'ri (chalg'ituvchi) chiqib qolardi.
    const answeredQuestions = questionStats.filter((q) => q.answeredCount > 0 && q.correctRate !== null);
    const rates = new Set(answeredQuestions.map((q) => q.correctRate));
    const hasSpread = rates.size > 1;
    const hardestQuestionId = hasSpread
      ? answeredQuestions.reduce((worst, q) => (q.correctRate! < worst.correctRate! ? q : worst)).questionId
      : null;
    const easiestQuestionId = hasSpread
      ? answeredQuestions.reduce((best, q) => (q.correctRate! > best.correctRate! ? q : best)).questionId
      : null;

    return {
      totalSubmissions: submissionIds.length,
      hardestQuestionId,
      easiestQuestionId,
      questions: questionStats,
    };
  }
}
