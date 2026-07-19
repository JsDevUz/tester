import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons, contentBlocks, classSessions } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { StorageService } from '../storage/storage.service';
import { extname } from 'path';
import { randomUUID } from 'crypto';

const CONTENT_BLOCK_LIMIT = 7;
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

@Injectable()
export class ContentBlocksService {
  constructor(private readonly storageService: StorageService) {}

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

  async uploadFileBlock(lessonId: string, adminId: string, file: Express.Multer.File, label?: string) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const ext = extname(file.originalname).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      throw new BadRequestException('Faqat PDF, Word, PowerPoint yoki Excel fayllar qabul qilinadi');
    }

    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }

    const [block] = await db
      .insert(contentBlocks)
      .values({
        lessonId,
        type: 'file',
        orderIndex: existing.length,
        fileName: file.originalname,
        label: label?.trim() || file.originalname,
      })
      .returning();

    const key = `lesson-files/${lessonId}/${block.id}/${randomUUID()}${ext}`;
    await this.storageService.uploadBuffer(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
      'public, max-age=31536000, immutable',
    );
    const [updated] = await db
      .update(contentBlocks)
      .set({ previewUrl: this.storageService.getPublicUrl(key) })
      .where(eq(contentBlocks.id, block.id))
      .returning();
    return updated;
  }

  async createFileBlockFromLibrary(lessonId: string, adminId: string, url: string, fileName: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }

    const [block] = await db
      .insert(contentBlocks)
      .values({
        lessonId,
        type: 'file',
        orderIndex: existing.length,
        fileName,
        label: fileName,
        previewUrl: url,
      })
      .returning();
    return block;
  }

  async createLiveClassBlock(lessonId: string, adminId: string, classSessionId: string) {
    await this.assertLessonOwnership(lessonId, adminId);
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    const module = lesson ? await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) }) : null;
    if (!module) throw new NotFoundException('Lesson not found');

    // classSessionId shu darsning kursiga tegishli EKANI tekshiriladi —
    // aks holda ustoz boshqa kursning (yoki boshqa ustozning) jonli
    // darsini bog'lab qo'yishi mumkin bo'lardi.
    const session = await db.query.classSessions.findFirst({ where: eq(classSessions.id, classSessionId) });
    if (!session || session.courseId !== module.courseId || session.status !== 'ended') {
      throw new BadRequestException('Yaroqsiz jonli dars');
    }

    const existing = await db.query.contentBlocks.findMany({ where: eq(contentBlocks.lessonId, lessonId) });
    if (existing.length >= CONTENT_BLOCK_LIMIT) {
      throw new BadRequestException(`A lesson can have at most ${CONTENT_BLOCK_LIMIT} blocks`);
    }

    const [block] = await db
      .insert(contentBlocks)
      .values({ lessonId, type: 'live_class', orderIndex: existing.length, classSessionId })
      .returning();
    return block;
  }

  async update(id: string, adminId: string, data: { html?: string; label?: string; embedUrl?: string }) {
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
    if (block.type === 'video') {
      await this.storageService.deletePrefix(`videos/${block.lessonId}/${block.id}/`);
    } else if (block.type === 'file' && block.previewUrl) {
      await this.storageService.deleteFile(block.previewUrl);
    }
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
