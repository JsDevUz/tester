import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks, submissions, lessonCompletions, imageSubmissions, oralPracticeGrades, groups, groupEnrollments, schoolMembers, practiceChatMessages } from '../db/schema';
import { PracticeMessengerService } from '../practice-messenger/practice-messenger.service';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

export function computeEarnedScore(
  latestSubmission: { score: number; total: number } | null,
  maxScore: number | null,
): number | null {
  if (maxScore === null) return null;
  if (!latestSubmission || latestSubmission.total === 0) return 0;
  return Math.round((latestSubmission.score / latestSubmission.total) * maxScore);
}

export function computeEffectiveTestPracticeScore(
  latestSubmission: {
    score: number;
    total: number;
    practiceScoreOverride: number | null;
  } | null,
  maxScore: number | null,
): number | null {
  if (latestSubmission?.practiceScoreOverride !== null && latestSubmission) {
    return latestSubmission.practiceScoreOverride;
  }
  return computeEarnedScore(latestSubmission, maxScore);
}

export function computeCombinedPercent(
  blocks: Array<{ maxScore: number | null; earnedScore: number | null }>,
): number | null {
  const totalMax = blocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
  if (totalMax === 0) return null;
  const totalEarned = blocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
  return (totalEarned / totalMax) * 100;
}

export function computeTestPracticePercent(
  blocks: Array<{
    type: 'test' | 'image' | 'oral';
    maxScore: number | null;
    earnedScore: number | null;
  }>,
): number | null {
  return computeCombinedPercent(blocks.filter((block) => block.type === 'test'));
}

const PRACTICE_BLOCK_LIMIT = 4;
export const PRACTICE_ATTEMPT_LIMIT = 3;

@Injectable()
export class PracticeBlocksService {
  constructor(private readonly practiceMessengerService: PracticeMessengerService) {}
  private async assertLessonOwnership(lessonId: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
  }

  private async assertCanGradeImage(block: { lessonId: string }, studentId: string, graderId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Submission not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Submission not found');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Submission not found');
    if (course.adminId === graderId) return;

    const studentMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    const curatorMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, graderId), eq(schoolMembers.role, 'curator')),
    });
    if (!studentMembership || !curatorMembership || studentMembership.schoolId !== curatorMembership.schoolId) {
      throw new NotFoundException('Submission not found');
    }
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, course.id) });
    const courseGroupIds = courseGroups.map((group) => group.id);
    if (courseGroupIds.length === 0) throw new NotFoundException('Submission not found');
    const studentEnrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, studentMembership.id),
        inArray(groupEnrollments.groupId, courseGroupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!studentEnrollment) throw new NotFoundException('Submission not found');
    const curatorEnrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, curatorMembership.id),
        eq(groupEnrollments.groupId, studentEnrollment.groupId),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!curatorEnrollment) throw new NotFoundException('Submission not found');
  }

  private async assertCanGradeOral(block: { lessonId: string }, studentId: string, graderId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    if (course.adminId === graderId) return;

    const studentMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, studentId), eq(schoolMembers.role, 'student')),
    });
    const curatorMembership = await db.query.schoolMembers.findFirst({
      where: and(eq(schoolMembers.studentId, graderId), eq(schoolMembers.role, 'curator')),
    });
    if (!studentMembership || !curatorMembership || studentMembership.schoolId !== curatorMembership.schoolId) {
      throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    }
    const courseGroups = await db.query.groups.findMany({ where: eq(groups.courseId, course.id) });
    const courseGroupIds = courseGroups.map((group) => group.id);
    if (courseGroupIds.length === 0) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    const studentEnrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, studentMembership.id),
        inArray(groupEnrollments.groupId, courseGroupIds),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!studentEnrollment) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    const curatorEnrollment = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.schoolMemberId, curatorMembership.id),
        eq(groupEnrollments.groupId, studentEnrollment.groupId),
        isNull(groupEnrollments.removedAt),
      ),
    });
    if (!curatorEnrollment) throw new NotFoundException('Jonli savol-javob bloki topilmadi');
  }

  async findAll(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    return db.query.practiceBlocks.findMany({
      where: eq(practiceBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });
  }

  async create(lessonId: string, adminId: string, type: 'test' | 'image' | 'oral' = 'test') {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.practiceBlocks.findMany({ where: eq(practiceBlocks.lessonId, lessonId) });
    if (existing.length >= PRACTICE_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${PRACTICE_BLOCK_LIMIT} practice blocks`);
    }
    const [block] = await db
      .insert(practiceBlocks)
      .values({ lessonId, type, testId: null, orderIndex: existing.length, description: '' })
      .returning();
    return block;
  }

  async update(id: string, adminId: string, data: { testId?: string | null; description?: string; maxScore?: number | null }) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, id) });
    if (!block) throw new NotFoundException('Practice block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    if (data.testId) {
      const duplicate = await db.query.practiceBlocks.findFirst({
        where: and(eq(practiceBlocks.lessonId, block.lessonId), eq(practiceBlocks.testId, data.testId)),
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException('This test is already attached to another practice block in this lesson');
      }
    }

    const [updated] = await db.update(practiceBlocks).set(data).where(eq(practiceBlocks.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, id) });
    if (!block) throw new NotFoundException('Practice block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    await db.delete(practiceBlocks).where(eq(practiceBlocks.id, id));
  }

  async reorder(lessonId: string, adminId: string, blockIds: string[]) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.practiceBlocks.findMany({
      where: and(eq(practiceBlocks.lessonId, lessonId), inArray(practiceBlocks.id, blockIds)),
    });
    if (existing.length !== blockIds.length) {
      throw new BadRequestException('blockIds must match the lesson\'s existing practice blocks');
    }
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(practiceBlocks).set({ orderIndex: i }).where(eq(practiceBlocks.id, blockIds[i]));
    }
  }

  async findForStudent(lessonId: string, studentId: string) {
    const blocks = await db.query.practiceBlocks.findMany({
      where: eq(practiceBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
      with: { test: true },
    });

    return Promise.all(
      blocks.map(async (block) => {
        if (block.type === 'oral') {
          const grade = await db.query.oralPracticeGrades.findFirst({
            where: and(eq(oralPracticeGrades.practiceBlockId, block.id), eq(oralPracticeGrades.studentId, studentId)),
          });
          return {
            id: block.id,
            type: 'oral' as const,
            testId: null,
            testSlug: null,
            testName: null,
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: grade?.score ?? null,
            submissions: [],
            attemptsRemaining: null,
            imageSubmissions: [],
            oralGrade: grade ? { score: grade.score, gradedAt: grade.gradedAt!.toISOString() } : null,
          };
        }
        if (block.type === 'image') {
          const imgSubmissions = await db.query.imageSubmissions.findMany({
            where: and(eq(imageSubmissions.practiceBlockId, block.id), eq(imageSubmissions.studentId, studentId)),
            orderBy: [desc(imageSubmissions.submittedAt)],
          });
          const latest = imgSubmissions[0] ?? null;
          return {
            id: block.id,
            type: 'image' as const,
            testId: null,
            testSlug: null,
            testName: null,
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: latest?.score ?? null,
            submissions: [],
            attemptsRemaining: null,
            imageSubmissions: imgSubmissions.map((s) => ({
              id: s.id,
              imageUrl: s.imageUrl,
              submittedAt: s.submittedAt!.toISOString(),
              score: s.score,
              graded: s.gradedAt !== null,
            })),
            oralGrade: null,
          };
        }

        if (!block.testId) {
          return {
            id: block.id,
            type: 'test' as const,
            testId: null,
            testSlug: null,
            testName: null,
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: null,
            submissions: [],
            attemptsRemaining: null,
            imageSubmissions: [],
            oralGrade: null,
          };
        }

        const studentSubmissions = await db.query.submissions.findMany({
          where: and(eq(submissions.testId, block.testId), eq(submissions.userId, studentId)),
          orderBy: [desc(submissions.submittedAt)],
        });
        const completedSubmissions = studentSubmissions.filter((s) => s.submittedAt !== null);
        const latest = completedSubmissions[0] ?? null;
        const earnedScore = computeEffectiveTestPracticeScore(
          latest && latest.score !== null && latest.total !== null
            ? {
                score: latest.score,
                total: latest.total,
                practiceScoreOverride: latest.practiceScoreOverride,
              }
            : null,
          block.maxScore,
        );

        return {
          id: block.id,
          type: 'test' as const,
          testId: block.testId,
          testSlug: block.test?.slug ?? null,
          testName: block.test?.name ?? null,
          description: block.description,
          maxScore: block.maxScore,
          earnedScore,
          submissions: completedSubmissions.map((s) => ({
            id: s.id,
            submittedAt: s.submittedAt!.toISOString(),
            score: s.score ?? 0,
            total: s.total ?? 0,
            earnedScore: computeEffectiveTestPracticeScore(
              s.score !== null && s.total !== null
                ? {
                    score: s.score,
                    total: s.total,
                    practiceScoreOverride: s.practiceScoreOverride,
                  }
                : null,
              block.maxScore,
            ),
            scoreOverridden: s.practiceScoreOverride !== null,
            scoreOverriddenAt:
              s.practiceScoreOverriddenAt?.toISOString() ?? null,
          })),
          attemptsRemaining: Math.max(0, PRACTICE_ATTEMPT_LIMIT - completedSubmissions.length),
          imageSubmissions: [],
          oralGrade: null,
        };
      }),
    );
  }

  async markLessonComplete(lessonId: string, studentId: string) {
    const existing = await db.query.lessonCompletions.findFirst({
      where: and(eq(lessonCompletions.lessonId, lessonId), eq(lessonCompletions.studentId, studentId)),
    });

    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Dars topilmadi');

    const studentPracticeBlocks = await this.findForStudent(lessonId, studentId);
    const allTestsAttempted = studentPracticeBlocks
      .filter((block) => block.type === 'test')
      .every((block) => block.submissions.length > 0);
    if (!allTestsAttempted) {
      throw new BadRequestException('Barcha test topshiriqlarini bajaring');
    }

    if (lesson.passThresholdEnabled) {
      const testPercent = computeTestPracticePercent(studentPracticeBlocks);
      if ((testPercent ?? 0) < (lesson.passThresholdPercent ?? 0)) {
        throw new BadRequestException('O\'tish balidan yetarlicha ball to\'planmagan');
      }
    }

    if (existing) return { completedAt: existing.completedAt!.toISOString() };

    const [created] = await db
      .insert(lessonCompletions)
      .values({ lessonId, studentId })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const current = await db.query.lessonCompletions.findFirst({
        where: and(eq(lessonCompletions.lessonId, lessonId), eq(lessonCompletions.studentId, studentId)),
      });
      return { completedAt: current?.completedAt?.toISOString() || new Date().toISOString() };
    }
    return { completedAt: created.completedAt!.toISOString() };
  }

  async submitImage(practiceBlockId: string, studentId: string, imageUrl: string) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, practiceBlockId) });
    if (!block || block.type !== 'image') throw new NotFoundException('Practice block not found');

    const existingSubmissions = await db.query.imageSubmissions.findMany({
      where: and(eq(imageSubmissions.practiceBlockId, practiceBlockId), eq(imageSubmissions.studentId, studentId)),
    });
    if (existingSubmissions.some((submission) => submission.gradedAt !== null)) {
      throw new BadRequestException('Baholangan topshiriqqa yangi rasm yuklab bo‘lmaydi');
    }
    if (existingSubmissions.length >= 5) {
      throw new BadRequestException('Bitta topshiriqqa maksimal 5 ta rasm yuklash mumkin');
    }

    const [created] = await db
      .insert(imageSubmissions)
      .values({ practiceBlockId, studentId, imageUrl })
      .returning();
    await this.practiceMessengerService.createImageSubmissionMessage(created.id);
    return created;
  }

  async removeImageSubmission(imageSubmissionId: string, studentId: string) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission || submission.studentId !== studentId) throw new NotFoundException('Rasm topilmadi');
    if (submission.gradedAt !== null) {
      throw new BadRequestException('Baholangan rasmni o‘chirib bo‘lmaydi');
    }
    await db.delete(imageSubmissions).where(eq(imageSubmissions.id, imageSubmissionId));
  }

  async gradeImage(imageSubmissionId: string, adminId: string, score: number) {
    const submission = await db.query.imageSubmissions.findFirst({ where: eq(imageSubmissions.id, imageSubmissionId) });
    if (!submission) throw new NotFoundException('Submission not found');
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, submission.practiceBlockId) });
    if (!block) throw new NotFoundException('Submission not found');
    await this.assertCanGradeImage(block, submission.studentId, adminId);
    if (block.maxScore === null || block.maxScore <= 0) {
      throw new BadRequestException('Baholashdan oldin maksimal yulduzni belgilang');
    }
    if (block.maxScore !== null && score > block.maxScore) {
      throw new BadRequestException(`Ball blokning maksimal ballidan (${block.maxScore}) oshmasligi kerak`);
    }

    const updated = await db
      .update(imageSubmissions)
      .set({ score, gradedAt: new Date(), gradedByAdminId: adminId })
      .where(and(
        eq(imageSubmissions.practiceBlockId, submission.practiceBlockId),
        eq(imageSubmissions.studentId, submission.studentId),
      ))
      .returning();
    const gradedSubmission = updated.find((item) => item.id === imageSubmissionId) ?? updated[0];
    await this.practiceMessengerService.createImageGradeMessage(imageSubmissionId, adminId, score);
    return gradedSubmission;
  }

  async gradeOralPractice(practiceBlockId: string, studentId: string, adminId: string, score: number) {
    const block = await db.query.practiceBlocks.findFirst({ where: eq(practiceBlocks.id, practiceBlockId) });
    if (!block || block.type !== 'oral') throw new NotFoundException('Jonli savol-javob bloki topilmadi');
    await this.assertCanGradeOral(block, studentId, adminId);
    if (block.maxScore !== null && score > block.maxScore) {
      throw new BadRequestException(`Ball blokning maksimal ballidan (${block.maxScore}) oshmasligi kerak`);
    }
    const [grade] = await db
      .insert(oralPracticeGrades)
      .values({ practiceBlockId, studentId, score, gradedAt: new Date(), gradedByAdminId: adminId })
      .onConflictDoUpdate({
        target: [oralPracticeGrades.practiceBlockId, oralPracticeGrades.studentId],
        set: { score, gradedAt: new Date(), gradedByAdminId: adminId },
      })
      .returning();
    await this.practiceMessengerService.createOralGradeMessage(practiceBlockId, studentId, adminId, score);
    return grade;
  }

  async gradeTestPractice(submissionId: string, adminId: string, score: number) {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
    });
    if (!submission?.userId || !submission.submittedAt) {
      throw new NotFoundException('Test amaliyoti topilmadi');
    }

    const sourceMessage = await db.query.practiceChatMessages.findFirst({
      where: and(
        eq(practiceChatMessages.testSubmissionId, submission.id),
        eq(practiceChatMessages.type, 'practice_test'),
      ),
    });
    if (!sourceMessage?.practiceBlockId) {
      throw new NotFoundException('Test amaliyoti topilmadi');
    }
    const block = await db.query.practiceBlocks.findFirst({
      where: and(
        eq(practiceBlocks.id, sourceMessage.practiceBlockId),
        eq(practiceBlocks.type, 'test'),
      ),
    });
    if (!block) throw new NotFoundException('Test amaliyoti topilmadi');
    await this.assertCanGradeImage(block, submission.userId, adminId);
    if (block.maxScore === null || block.maxScore <= 0) {
      throw new BadRequestException('Baholashdan oldin maksimal yulduzni belgilang');
    }
    if (score > block.maxScore) {
      throw new BadRequestException(
        `Yulduz blokning maksimal qiymatidan (${block.maxScore}) oshmasligi kerak`,
      );
    }

    const wasOverridden = submission.practiceScoreOverride !== null;
    const [updated] = await db
      .update(submissions)
      .set({
        practiceScoreOverride: score,
        practiceScoreOverriddenByAdminId: adminId,
        practiceScoreOverriddenAt: new Date(),
      })
      .where(eq(submissions.id, submission.id))
      .returning();
    await this.practiceMessengerService.createTestGradeMessage(
      submission.id,
      adminId,
      score,
      wasOverridden,
    );
    return {
      id: updated.id,
      earnedScore: updated.practiceScoreOverride,
      scoreOverridden: true,
      scoreOverriddenAt: updated.practiceScoreOverriddenAt!.toISOString(),
    };
  }

  async listImageSubmissionsForGrading(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    const blocks = await db.query.practiceBlocks.findMany({
      where: and(eq(practiceBlocks.lessonId, lessonId), eq(practiceBlocks.type, 'image')),
    });
    const blockIds = blocks.map((b) => b.id);
    if (blockIds.length === 0) return [];

    const allSubmissions = await db.query.imageSubmissions.findMany({
      where: inArray(imageSubmissions.practiceBlockId, blockIds),
      orderBy: [desc(imageSubmissions.submittedAt)],
      with: { student: true },
    });

    return allSubmissions.map((s) => ({
      id: s.id,
      practiceBlockId: s.practiceBlockId,
      studentId: s.studentId,
      studentName: s.student.displayName,
      imageUrl: s.imageUrl,
      submittedAt: s.submittedAt!.toISOString(),
      score: s.score,
      gradedAt: s.gradedAt?.toISOString() ?? null,
    }));
  }
}
