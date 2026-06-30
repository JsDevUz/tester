import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { folders } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class FoldersService {
  findAll(adminId: string) {
    return db.query.folders.findMany({
      where: eq(folders.adminId, adminId),
      orderBy: (f, { asc }) => [asc(f.createdAt)],
    });
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
