import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groups, tests, testPins } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

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
    oneByOne?: boolean; requireAuth?: boolean; autoCompleteOnLeave?: boolean; onceOnly?: boolean; deadline?: string;
  }) {
    const slug = await uniqueSlug();
    const onceOnly = data.onceOnly ?? false;
    const [test] = await db.insert(tests).values({
      adminId, folderId: data.folderId, name: data.name,
      description: data.description, timeLimit: data.timeLimit,
      showResults: data.showResults ?? 'immediately',
      shuffleQuestions: data.shuffleQuestions ?? false,
      shuffleOptions: data.shuffleOptions ?? false,
      oneByOne: data.oneByOne ?? false,
      // "Bir martta" rejimida talabani userId orqali aniqlash kerak —
      // shuning uchun requireAuth majburiy yoqiladi, aks holda anonim
      // talabalarni bir-biridan ajratib bo'lmaydi.
      requireAuth: onceOnly ? true : (data.requireAuth ?? false),
      autoCompleteOnLeave: data.autoCompleteOnLeave ?? true,
      onceOnly,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      slug,
    }).returning();
    return test;
  }

  async update(id: string, adminId: string, data: {
    name?: string; description?: string; timeLimit?: number | null;
    showResults?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    oneByOne?: boolean; requireAuth?: boolean; autoCompleteOnLeave?: boolean; onceOnly?: boolean; deadline?: string | null;
  }) {
    const updateData: any = { ...data };
    if ('deadline' in data) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }
    if (data.onceOnly) {
      updateData.requireAuth = true;
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

  async getPin(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({ where: and(eq(tests.id, testId), eq(tests.adminId, adminId)) });
    if (!test) throw new NotFoundException('Test not found');
    const pin = await db.query.testPins.findFirst({ where: eq(testPins.testId, testId) });
    return pin ?? null;
  }

  async upsertPin(testId: string, adminId: string, data: {
    courseId: string; groupIds: string[]; startsAt: string; endsAt: string;
  }) {
    const test = await db.query.tests.findFirst({ where: and(eq(tests.id, testId), eq(tests.adminId, adminId)) });
    if (!test) throw new NotFoundException('Test not found');

    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, data.courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');

    const groupIds = [...new Set(data.groupIds)];
    if (groupIds.length > 0) {
      const ownedGroups = await db.query.groups.findMany({
        where: and(eq(groups.courseId, data.courseId), inArray(groups.id, groupIds)),
      });
      if (ownedGroups.length !== groupIds.length) {
        throw new BadRequestException('One or more groups do not belong to the selected course');
      }
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('The PIN end time must be after its start time');
    }

    const [pin] = await db
      .insert(testPins)
      .values({
        testId,
        courseId: data.courseId,
        groupIds,
        startsAt,
        endsAt,
      })
      .onConflictDoUpdate({
        target: testPins.testId,
        set: {
          courseId: data.courseId,
          groupIds,
          startsAt,
          endsAt,
        },
      })
      .returning();
    return pin;
  }

  async removePin(testId: string, adminId: string) {
    const test = await db.query.tests.findFirst({ where: and(eq(tests.id, testId), eq(tests.adminId, adminId)) });
    if (!test) throw new NotFoundException('Test not found');
    await db.delete(testPins).where(eq(testPins.testId, testId));
  }
}
