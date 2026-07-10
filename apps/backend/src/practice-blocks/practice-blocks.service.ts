import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks, submissions, lessonCompletions } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

export function computeEarnedScore(
  latestSubmission: { score: number; total: number } | null,
  maxScore: number | null,
): number | null {
  if (maxScore === null) return null;
  if (!latestSubmission || latestSubmission.total === 0) return 0;
  return Math.round((latestSubmission.score / latestSubmission.total) * maxScore);
}

export function computeCombinedPercent(
  blocks: Array<{ maxScore: number | null; earnedScore: number | null }>,
): number | null {
  const totalMax = blocks.reduce((sum, b) => sum + (b.maxScore ?? 0), 0);
  if (totalMax === 0) return null;
  const totalEarned = blocks.reduce((sum, b) => sum + (b.earnedScore ?? 0), 0);
  return (totalEarned / totalMax) * 100;
}

const PRACTICE_BLOCK_LIMIT = 4;

@Injectable()
export class PracticeBlocksService {
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

  async findAll(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    return db.query.practiceBlocks.findMany({
      where: eq(practiceBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });
  }

  async create(lessonId: string, adminId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.practiceBlocks.findMany({ where: eq(practiceBlocks.lessonId, lessonId) });
    if (existing.length >= PRACTICE_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${PRACTICE_BLOCK_LIMIT} practice blocks`);
    }
    const [block] = await db
      .insert(practiceBlocks)
      .values({ lessonId, testId: null, orderIndex: existing.length, description: '' })
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
        if (!block.testId) {
          return {
            id: block.id,
            testId: null,
            testSlug: null,
            testName: null,
            description: block.description,
            maxScore: block.maxScore,
            earnedScore: null,
            submissions: [],
          };
        }

        const studentSubmissions = await db.query.submissions.findMany({
          where: and(eq(submissions.testId, block.testId), eq(submissions.userId, studentId)),
          orderBy: [desc(submissions.submittedAt)],
        });
        const completedSubmissions = studentSubmissions.filter((s) => s.submittedAt !== null);
        const latest = completedSubmissions[0] ?? null;
        const earnedScore = computeEarnedScore(
          latest && latest.score !== null && latest.total !== null ? { score: latest.score, total: latest.total } : null,
          block.maxScore,
        );

        return {
          id: block.id,
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
          })),
        };
      }),
    );
  }

  async markLessonComplete(lessonId: string, studentId: string) {
    const existing = await db.query.lessonCompletions.findFirst({
      where: and(eq(lessonCompletions.lessonId, lessonId), eq(lessonCompletions.studentId, studentId)),
    });
    if (existing) return { completedAt: existing.completedAt!.toISOString() };

    const [created] = await db.insert(lessonCompletions).values({ lessonId, studentId }).returning();
    return { completedAt: created.completedAt!.toISOString() };
  }
}
