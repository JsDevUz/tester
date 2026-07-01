import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { tests } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const SLUG_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generateSlug(): string {
  return Array.from({ length: 8 }, () => SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]).join('');
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    const existing = await db.query.tests.findFirst({ where: eq(tests.slug, slug) });
    if (!existing) return slug;
  }
  throw new Error('Could not generate unique slug');
}

@Injectable()
export class TestsService {
  async findAll(folderId: string, adminId: string) {
    return db.query.tests.findMany({
      where: and(eq(tests.folderId, folderId), eq(tests.adminId, adminId)),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    });
  }

  async findOne(id: string, adminId: string) {
    const test = await db.query.tests.findFirst({
      where: and(eq(tests.id, id), eq(tests.adminId, adminId)),
      with: {
        questions: {
          orderBy: (q, { asc }) => [asc(q.orderIndex)],
          with: { options: { orderBy: (o, { asc }) => [asc(o.orderIndex)] } },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async create(adminId: string, data: {
    folderId: string; name: string; description?: string; timeLimit?: number;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; requireAuth?: boolean; deadline?: string;
  }) {
    const slug = await uniqueSlug();
    const [test] = await db.insert(tests).values({
      adminId, folderId: data.folderId, name: data.name,
      description: data.description, timeLimit: data.timeLimit,
      showResults: data.showResults ?? 'immediately',
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      oneByOne: data.oneByOne ?? false,
      requireAuth: data.requireAuth ?? false,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      slug,
    }).returning();
    return test;
  }

  async update(id: string, adminId: string, data: {
    name?: string; description?: string; timeLimit?: number | null;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; requireAuth?: boolean; deadline?: string | null;
  }) {
    const updateData: any = { ...data };
    if ('deadline' in data) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }
    const [test] = await db.update(tests)
      .set(updateData)
      .where(and(eq(tests.id, id), eq(tests.adminId, adminId)))
      .returning();
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  async remove(id: string, adminId: string) {
    const result = await db.delete(tests)
      .where(and(eq(tests.id, id), eq(tests.adminId, adminId)))
      .returning({ id: tests.id });
    if (!result.length) throw new NotFoundException('Test not found');
  }
}
