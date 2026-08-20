import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { VideoJobService } from './video-job.service';
import { srtToVtt } from './srt-to-vtt';
import { decodeUploadFilename } from '../upload/upload-filename';

const CONTENT_BLOCK_LIMIT = 7;
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
const VIDEO_MIME_PREFIX = 'video/';
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

@Injectable()
export class VideoUploadService {
  constructor(
    private readonly storageService: StorageService,
    private readonly videoJobService: VideoJobService,
  ) {}

  private async assertLessonOwnership(lessonId: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Lesson not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Lesson not found');
    return { lesson, module, course };
  }

  async uploadVideo(lessonId: string, adminId: string, file: Express.Multer.File, label?: string) {
    if (!file) throw new BadRequestException('Video fayl topilmadi');
    const ext = extname(file.originalname).toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(ext) || !file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Faqat video fayllar qabul qilinadi');
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
        type: 'video',
        orderIndex: existing.length,
        fileName: decodeUploadFilename(file.originalname),
        label: label?.trim() || decodeUploadFilename(file.originalname),
        processingStatus: 'pending',
      })
      .returning();

    const sourceKey = `videos/${lessonId}/${block.id}/source/${randomUUID()}${ext}`;
    await this.storageService.uploadBuffer(sourceKey, file.buffer, file.mimetype, 'private, max-age=0, no-store');

    const [updated] = await db
      .update(contentBlocks)
      .set({ sourceKey, processingStatus: 'pending' })
      .where(eq(contentBlocks.id, block.id))
      .returning();

    this.videoJobService.enqueue(block.id);
    return updated;
  }

  // 1-bosqich: client fayl yubormasdan oldin — bo'sh content-block yaratamiz
  // va S3'ga to'g'ridan-to'g'ri yuklash uchun muddati qisqa havola qaytaramiz.
  // Bu backend orqali proxy qilishning o'rnini bosadi (katta videolarda tez).
  async initiateUpload(
    lessonId: string,
    adminId: string,
    fileName: string,
    mimeType: string,
    label?: string,
  ) {
    const ext = extname(fileName).toLowerCase();
    if (!VIDEO_EXTENSIONS.includes(ext) || !mimeType.startsWith(VIDEO_MIME_PREFIX)) {
      throw new BadRequestException('Faqat video fayllar qabul qilinadi');
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
        type: 'video',
        orderIndex: existing.length,
        fileName,
        label: label?.trim() || fileName,
        processingStatus: 'pending',
      })
      .returning();

    const sourceKey = `videos/${lessonId}/${block.id}/source/${randomUUID()}${ext}`;
    const uploadUrl = await this.storageService.createPresignedUploadUrl(sourceKey, mimeType);

    await db.update(contentBlocks).set({ sourceKey }).where(eq(contentBlocks.id, block.id));

    return { blockId: block.id, uploadUrl, sourceKey };
  }

  // 2-bosqich: client S3'ga yuklashni tugatgach chaqiradi. Client "tugadi"
  // deganiga ishonmaymiz — S3'dan faylning haqiqatan borligini va hajmini
  // o'zimiz tekshiramiz, shundan keyingina transcode job ishga tushadi.
  async completeUpload(blockId: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video' || !block.sourceKey) {
      throw new NotFoundException('Video block not found');
    }
    await this.assertLessonOwnership(block.lessonId, adminId);

    const info = await this.storageService.headObject(block.sourceKey);
    if (!info) {
      throw new BadRequestException("Fayl S3'da topilmadi — yuklash yakunlanmagan bo'lishi mumkin");
    }
    if (info.sizeBytes > MAX_VIDEO_BYTES) {
      throw new BadRequestException('Video hajmi 500 MB dan oshmasligi kerak');
    }
    if (info.sizeBytes === 0) {
      throw new BadRequestException("Yuklangan fayl bo'sh");
    }

    const [updated] = await db
      .update(contentBlocks)
      .set({ processingStatus: 'pending', errorMessage: null })
      .where(eq(contentBlocks.id, blockId))
      .returning();

    this.videoJobService.enqueue(blockId);
    return updated;
  }

  async retry(blockId: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    // Qayta urinishdan oldin manba fayl S3'da haqiqatan borligini tekshiramiz —
    // aks holda dastlabki yuklash muvaffaqiyatsiz tugagan bo'lsa, transcode job
    // "Key not found" bilan cheksiz qulab tushaveradi va foydalanuvchi nima
    // qilishni bilmay qoladi.
    if (block.sourceKey) {
      const info = await this.storageService.headObject(block.sourceKey);
      if (!info) {
        throw new BadRequestException(
          "Manba video fayl topilmadi — dastlabki yuklash yakunlanmagan. Videoni qaytadan yuklang.",
        );
      }
    }

    await db
      .update(contentBlocks)
      .set({ processingStatus: 'pending', errorMessage: null })
      .where(eq(contentBlocks.id, blockId));
    this.videoJobService.enqueue(blockId);
    return db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
  }

  async uploadSubtitle(blockId: string, adminId: string, file: Express.Multer.File) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    let vttText: string;
    try {
      vttText = srtToVtt(file.buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException("SRT fayl noto'g'ri formatda");
    }

    const subtitleKey = `videos/${block.lessonId}/${block.id}/subtitles/subtitle.vtt`;
    await this.storageService.uploadBuffer(subtitleKey, Buffer.from(vttText, 'utf-8'), 'text/vtt');

    const [updated] = await db
      .update(contentBlocks)
      .set({ subtitleKey, subtitleFileName: file.originalname })
      .where(eq(contentBlocks.id, blockId))
      .returning();
    return updated;
  }

  async removeSubtitle(blockId: string, adminId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video block not found');
    await this.assertLessonOwnership(block.lessonId, adminId);

    if (block.subtitleKey) {
      await this.storageService.deleteFile(block.subtitleKey);
    }

    const [updated] = await db
      .update(contentBlocks)
      .set({ subtitleKey: null, subtitleFileName: null })
      .where(eq(contentBlocks.id, blockId))
      .returning();
    return updated;
  }
}
