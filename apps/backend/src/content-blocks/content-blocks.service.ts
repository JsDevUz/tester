import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, contentBlocks } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

const CONTENT_BLOCK_LIMIT = 7;

@Injectable()
export class ContentBlocksService {
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
    return db.query.contentBlocks.findMany({
      where: eq(contentBlocks.lessonId, lessonId),
      orderBy: (b, { asc }) => [asc(b.orderIndex)],
    });
  }

  async create(lessonId: string, adminId: string, type: string) {
    if (type !== 'editor') {
      throw new BadRequestException('Only editor blocks can be created via this endpoint');
    }
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }
    const [block] = await db
      .insert(contentBlocks)
      .values({ lessonId, type: 'editor', orderIndex: existing.length, html: '' })
      .returning();
    return block;
  }

  async update(id: string, adminId: string, data: { html?: string; label?: string }) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id) });
    if (!block) throw new NotFoundException('Block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    const [updated] = await db.update(contentBlocks).set(data).where(eq(contentBlocks.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id) });
    if (!block) throw new NotFoundException('Block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);
    await db.delete(contentBlocks).where(eq(contentBlocks.id, id));
  }

  async reorder(lessonId: string, adminId: string, blockIds: string[]) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({
      where: and(eq(contentBlocks.lessonId, lessonId), inArray(contentBlocks.id, blockIds)),
    });
    if (existing.length !== blockIds.length) {
      throw new BadRequestException('blockIds must match the lesson\'s existing blocks');
    }
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(contentBlocks).set({ orderIndex: i }).where(eq(contentBlocks.id, blockIds[i]));
    }
  }
}
