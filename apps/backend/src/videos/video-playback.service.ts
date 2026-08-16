import { ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules } from '../db/schema';
import { StudentAccessService } from '../payments/student-access.service';
import { StorageService } from '../storage/storage.service';
import type { PlaybackTokenPayload } from './video.types';

@Injectable()
export class VideoPlaybackService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly studentAccessService: StudentAccessService,
  ) {}

  private secret() {
    return (
      this.configService.get<string>('VIDEO_PLAYBACK_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'change_me'
    );
  }

  private ttlSeconds() {
    return Number(this.configService.get<string>('VIDEO_PLAYBACK_TOKEN_TTL_SECONDS') || 7200);
  }

  private base64url(value: Buffer | string) {
    return Buffer.from(value).toString('base64url');
  }

  private signPayload(payload: PlaybackTokenPayload): string {
    const body = this.base64url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  verifyToken(token: string, blockId: string): PlaybackTokenPayload {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw new ForbiddenException('Invalid video token');
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid video token');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PlaybackTokenPayload;
    if (payload.blockId !== blockId || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Video token expired');
    }
    return payload;
  }

  private async getVideoContext(blockId: string) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video not found');
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Video not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Video not found');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Video not found');
    return { block, lesson, module, course };
  }

  async startPlayback(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const { block, course } = await this.getVideoContext(blockId);
    if (block.processingStatus !== 'ready' || !block.hlsMasterKey) {
      throw new NotFoundException('Video is not ready');
    }
    if (viewer.role === 'student') {
      const hasAccess = await this.studentAccessService.assertStudentLessonAccess(course.id, viewer.id);
      if (!hasAccess) throw new ForbiddenException('Video access denied');
    } else if (viewer.role === 'teacher') {
      const ownedCourse = await db.query.courses.findFirst({
        where: and(eq(courses.id, course.id), eq(courses.adminId, viewer.id)),
      });
      if (!ownedCourse) throw new ForbiddenException('Video access denied');
    }
    const exp = Math.floor(Date.now() / 1000) + this.ttlSeconds();
    const token = this.signPayload({ sub: viewer.id, role: viewer.role, blockId, courseId: course.id, exp });
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      manifestUrl: `/videos/${blockId}/manifest.m3u8?token=${encodeURIComponent(token)}`,
      subtitleUrl: block.subtitleKey ? this.storageService.getPublicUrl(block.subtitleKey) : null,
    };
  }

  async getManifest(blockId: string, token: string) {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.hlsMasterKey) throw new NotFoundException('Manifest not found');
    const manifest = await this.storageService.getObjectText(block.hlsMasterKey);
    return this.rewriteManifestUrls(manifest, token);
  }

  private rewriteManifestUrls(manifest: string, token: string) {
    return manifest
      .split('\n')
      .map((line) => {
        if (line.startsWith('#EXT-X-KEY')) {
          return line.replace(/URI="[^"]+"/, `URI="key?token=${encodeURIComponent(token)}"`);
        }
        if (line.trim().endsWith('.ts')) {
          return `segments/${line.trim()}?token=${encodeURIComponent(token)}`;
        }
        return line;
      })
      .join('\n');
  }

  async getKey(blockId: string, token: string): Promise<Buffer> {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.aesKeyRef) throw new NotFoundException('Video key not found');
    return this.storageService.getObjectBuffer(block.aesKeyRef);
  }

  async getSegment(blockId: string, fileName: string, token: string): Promise<StreamableFile> {
    this.verifyToken(token, blockId);
    const { block } = await this.getVideoContext(blockId);
    if (!block.hlsBaseKey) throw new NotFoundException('Video segment not found');
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '');
    const stream = await this.storageService.getObjectStream(`${block.hlsBaseKey}/${safeFileName}`);
    return new StreamableFile(stream);
  }
}
