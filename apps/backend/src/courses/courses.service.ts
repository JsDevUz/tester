import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class CoursesService {
  async findAll(adminId: string) {
    return db.query.courses.findMany({
      where: eq(courses.adminId, adminId),
      orderBy: (c, { asc }) => [asc(c.createdAt)],
    });
  }

  async create(adminId: string, title: string) {
    const [course] = await db
      .insert(courses)
      .values({ adminId, title })
      .returning();
    return course;
  }

  async update(id: string, adminId: string, title: string) {
    const [course] = await db
      .update(courses)
      .set({ title })
      .where(and(eq(courses.id, id), eq(courses.adminId, adminId)))
      .returning();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async remove(id: string, adminId: string) {
    const result = await db
      .delete(courses)
      .where(and(eq(courses.id, id), eq(courses.adminId, adminId)))
      .returning({ id: courses.id });
    if (!result.length) throw new NotFoundException('Course not found');
  }
}
