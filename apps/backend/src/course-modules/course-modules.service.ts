import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, modules } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class CourseModulesService {
  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.modules.findMany({
      where: eq(modules.courseId, courseId),
      orderBy: (m, { asc }) => [asc(m.orderIndex)],
    });
  }

  async create(courseId: string, adminId: string, title: string) {
    await this.assertCourseOwnership(courseId, adminId);
    const existing = await db.query.modules.findMany({ where: eq(modules.courseId, courseId) });
    const [module] = await db
      .insert(modules)
      .values({ courseId, title, orderIndex: existing.length })
      .returning();
    return module;
  }

  async update(id: string, adminId: string, title: string) {
    const module = await db.query.modules.findFirst({ where: eq(modules.id, id) });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertCourseOwnership(module.courseId, adminId);
    const [updated] = await db
      .update(modules)
      .set({ title })
      .where(eq(modules.id, id))
      .returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    const module = await db.query.modules.findFirst({ where: eq(modules.id, id) });
    if (!module) throw new NotFoundException('Module not found');
    await this.assertCourseOwnership(module.courseId, adminId);
    await db.delete(modules).where(eq(modules.id, id));
  }
}
