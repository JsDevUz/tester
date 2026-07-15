import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { courses, groupEnrollments, launches, pricingPlans } from '../db/schema';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class LaunchesService {
  private async assertCourseOwnership(courseId: string, adminId: string) {
    const course = await db.query.courses.findFirst({
      where: and(eq(courses.id, courseId), eq(courses.adminId, adminId)),
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  private async assertLaunchOwnership(launchId: string, adminId: string) {
    const launch = await db.query.launches.findFirst({ where: eq(launches.id, launchId) });
    if (!launch) throw new NotFoundException('Launch not found');
    await this.assertCourseOwnership(launch.courseId, adminId);
    return launch;
  }

  async findAll(courseId: string, adminId: string) {
    await this.assertCourseOwnership(courseId, adminId);
    return db.query.launches.findMany({
      where: eq(launches.courseId, courseId),
      with: { plans: true },
    });
  }

  async create(courseId: string, adminId: string, name: string) {
    await this.assertCourseOwnership(courseId, adminId);
    const [launch] = await db.insert(launches).values({ courseId, name }).returning();
    return { ...launch, plans: [] };
  }

  async update(id: string, adminId: string, data: { name?: string; active?: boolean }) {
    await this.assertLaunchOwnership(id, adminId);
    const [updated] = await db.update(launches).set(data).where(eq(launches.id, id)).returning();
    return updated;
  }

  async remove(id: string, adminId: string) {
    await this.assertLaunchOwnership(id, adminId);
    await db.delete(launches).where(eq(launches.id, id));
  }

  async createPlan(
    launchId: string,
    adminId: string,
    data: {
      name: string;
      description?: string;
      price: number;
      originalPrice?: number | null;
      groupId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) {
    await this.assertLaunchOwnership(launchId, adminId);
    const [plan] = await db
      .insert(pricingPlans)
      .values({
        launchId,
        name: data.name,
        description: data.description ?? '',
        price: data.price,
        originalPrice: data.originalPrice ?? null,
        groupId: data.groupId ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      })
      .returning();
    return plan;
  }

  private async assertPlanOwnership(planId: string, adminId: string) {
    const plan = await db.query.pricingPlans.findFirst({ where: eq(pricingPlans.id, planId) });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.assertLaunchOwnership(plan.launchId, adminId);
    return plan;
  }

  async updatePlan(
    id: string,
    adminId: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      originalPrice: number | null;
      groupId: string | null;
      startDate: string | null;
      endDate: string | null;
    }>,
  ) {
    await this.assertPlanOwnership(id, adminId);
    const { startDate, endDate, ...rest } = data;
    const [updated] = await db
      .update(pricingPlans)
      .set({
        ...rest,
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      })
      .where(eq(pricingPlans.id, id))
      .returning();
    return updated;
  }

  async removePlan(id: string, adminId: string) {
    await this.assertPlanOwnership(id, adminId);

    const assignedEnrollment = await db.query.groupEnrollments.findFirst({
      where: eq(groupEnrollments.selectedPlanId, id),
      columns: { id: true },
    });
    if (assignedEnrollment) {
      throw new BadRequestException(
        "Bu tarif o'quvchiga biriktirilgan. Avval o'quvchini boshqa tarifga o'tkazing yoki tarifsiz qoldiring.",
      );
    }

    await db.delete(pricingPlans).where(eq(pricingPlans.id, id));
  }
}
