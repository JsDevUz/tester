import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { folders, tests } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';

@Injectable()
export class FoldersService {
  async findAll(adminId: string) {
    const rows = await db.query.folders.findMany({
      where: eq(folders.adminId, adminId),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
    });

    const counts = await db
      .select({ folderId: tests.folderId, count: sql<number>`count(*)::int` })
      .from(tests)
      .where(eq(tests.adminId, adminId))
      .groupBy(tests.folderId);

    const countMap = new Map(counts.map((c) => [c.folderId, c.count]));
    return rows.map((f) => ({ ...f, testCount: countMap.get(f.id) ?? 0 }));
  }

  async create(adminId: string, name: string, color?: string, icon?: string) {
    const [folder] = await db
      .insert(folders)
      .values({ adminId, name, color: color ?? '#6366f1', icon: icon ?? 'folder' })
      .returning();
    return folder;
  }

  async update(id: string, adminId: string, data: { name?: string; color?: string; icon?: string }) {
    const [folder] = await db
      .update(folders)
      .set(data)
      .where(and(eq(folders.id, id), eq(folders.adminId, adminId)))
      .returning();
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async remove(id: string, adminId: string) {
    const result = await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.adminId, adminId)))
      .returning({ id: folders.id });
    if (!result.length) throw new NotFoundException('Folder not found');
  }
}
