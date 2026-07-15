import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { groupEnrollments, schoolMembers, submissions, tests } from '../db/schema';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { normalizeViolationReason, orderSubmissionAnswersForDisplay, seededShuffle } from '../delivery/delivery.service';

@Injectable()
export class SubmissionsService {
  async findByTest(testId: string, adminId: string, limit = 10, offset = 0) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, testId), eq(tests.adminId, adminId)),
    });
    if (!test) throw new NotFoundException('Test not found');

    return db.query.submissions.findMany({
      where: and(eq(submissions.testId, testId), isNotNull(submissions.submittedAt)),
      orderBy: (s, { desc }) => [desc(s.submittedAt)],
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

    const showAnswers = submission.test.showResults === 'immediately' || submission.test.showResults === 'per_question';
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
      showResults: submission.test.showResults,
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
}
