import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { contentBlocks, courses, lessons, modules, videoWatchSegments } from '../db/schema';
import { StudentAccessService } from '../payments/student-access.service';

export interface WatchSegment {
  startSec: number;
  endSec: number;
}

export function mergeWatchSegments(
  existing: WatchSegment[],
  incoming: WatchSegment,
  gapToleranceSec: number,
): WatchSegment[] {
  const all = [...existing, incoming].sort((a, b) => a.startSec - b.startSec);
  const merged: WatchSegment[] = [];

  for (const segment of all) {
    const last = merged[merged.length - 1];
    if (last && segment.startSec <= last.endSec + gapToleranceSec) {
      last.endSec = Math.max(last.endSec, segment.endSec);
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

export function computeWatchedPercent(segments: WatchSegment[], durationSec: number | null): number | null {
  if (durationSec === null) return null;
  const totalCovered = segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const percent = (totalCovered / durationSec) * 100;
  return Math.min(100, Math.round(percent));
}

const GAP_TOLERANCE_SEC = 2;

@Injectable()
export class VideoProgressService {
  constructor(private readonly studentAccessService: StudentAccessService) {}

  private async assertAccess(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, blockId) });
    if (!block || block.type !== 'video') throw new NotFoundException('Video not found');
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
    if (!lesson) throw new NotFoundException('Video not found');
    const module = await db.query.modules.findFirst({ where: eq(modules.id, lesson.moduleId) });
    if (!module) throw new NotFoundException('Video not found');
    const course = await db.query.courses.findFirst({ where: eq(courses.id, module.courseId) });
    if (!course) throw new NotFoundException('Video not found');

    if (viewer.role === 'student') {
      const hasAccess = await this.studentAccessService.assertStudentLessonAccess(course.id, viewer.id);
      if (!hasAccess) throw new ForbiddenException('Video access denied');
    } else if (viewer.role === 'teacher') {
      const ownedCourse = await db.query.courses.findFirst({
        where: and(eq(courses.id, course.id), eq(courses.adminId, viewer.id)),
      });
      if (!ownedCourse) throw new ForbiddenException('Video access denied');
    }

    return { block };
  }

  async saveProgress(
    blockId: string,
    viewer: { id: string; role: 'student' | 'teacher' | 'super' },
    range: WatchSegment,
    durationSec?: number,
  ) {
    const { block } = await this.assertAccess(blockId, viewer);

    let effectiveDuration = block.durationSec;
    if (durationSec && durationSec > 0 && (!block.durationSec || block.durationSec !== durationSec)) {
      await db.update(contentBlocks).set({ durationSec }).where(eq(contentBlocks.id, blockId));
      effectiveDuration = durationSec;
    }

    const existingRows = await db.query.videoWatchSegments.findMany({
      where: and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    });
    const existing: WatchSegment[] = existingRows.map((r) => ({ startSec: r.startSec, endSec: r.endSec }));
    const merged = mergeWatchSegments(existing, range, GAP_TOLERANCE_SEC);

    await db.delete(videoWatchSegments).where(
      and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    );
    if (merged.length > 0) {
      await db.insert(videoWatchSegments).values(
        merged.map((s) => ({ contentBlockId: blockId, studentId: viewer.id, startSec: s.startSec, endSec: s.endSec })),
      );
    }

    return { segments: merged, watchedPercent: computeWatchedPercent(merged, effectiveDuration) };
  }

  async getProgress(blockId: string, viewer: { id: string; role: 'student' | 'teacher' | 'super' }) {
    const { block } = await this.assertAccess(blockId, viewer);

    const rows = await db.query.videoWatchSegments.findMany({
      where: and(eq(videoWatchSegments.contentBlockId, blockId), eq(videoWatchSegments.studentId, viewer.id)),
    });
    const segments: WatchSegment[] = rows.map((r) => ({ startSec: r.startSec, endSec: r.endSec }));

    return { segments, watchedPercent: computeWatchedPercent(segments, block.durationSec) };
  }
}
