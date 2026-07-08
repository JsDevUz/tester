import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules, lessons } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class LessonsService {
  private async assertModuleOwnership(moduleId: string, adminId: string) {
    const module = await db.query.modules.findFirst({ where: eq(modules.id, moduleId) });
    if (!module) throw new NotFoundException('Module not found');
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, module.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Module not found');
  }

  async findAll(moduleId: string, adminId: string) {
    await this.assertModuleOwnership(moduleId, adminId);
    return db.query.lessons.findMany({
      where: eq(lessons.moduleId, moduleId),
      orderBy: (l, { asc }) => [asc(l.orderIndex)],
    });
  }

  async create(moduleId: string, adminId: string, title: string) {
    await this.assertModuleOwnership(moduleId, adminId);
    const existing = await db.query.lessons.findMany({ where: eq(lessons.moduleId, moduleId) });
    const [lesson] = await db
      .insert(lessons)
      .values({ moduleId, title, orderIndex: existing.length })
      .returning();
    return lesson;
  }

  async update(id: string, adminId: string, data: { title?: string; status?: string }) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, id) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertModuleOwnership(lesson.moduleId, adminId);
    const [updated] = await db.update(lessons).set(data).where(eq(lessons.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, id) });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertModuleOwnership(lesson.moduleId, adminId);
    await db.delete(lessons).where(eq(lessons.id, id));
  }
}
