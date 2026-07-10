import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, practiceBlocks } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

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
}
