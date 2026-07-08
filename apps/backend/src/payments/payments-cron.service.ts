import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { db } from '../db';
import { groups, groupMembers, monthlyPayments } from '../db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function previousMonthStart(periodMonth: Date): Date {
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() - 1, 1));
}

@Injectable()
export class PaymentsCronService {
  private readonly logger = new Logger(PaymentsCronService.name);

  @Cron('0 1 * * *')
  async generateMonthlyPayments() {
    const today = new Date();
    const todayDay = today.getUTCDate();
    const currentPeriod = startOfMonthUtc(today);

    const dueGroups = await db.query.groups.findMany({ where: eq(groups.paymentDay, todayDay) });

    for (const group of dueGroups) {
      const members = await db.query.groupMembers.findMany({
        where: and(eq(groupMembers.groupId, group.id), isNotNull(groupMembers.selectedPlanId)),
        with: { selectedPlan: true },
      });

      for (const member of members) {
        if (!member.selectedPlan) continue;

        const existing = await db.query.monthlyPayments.findFirst({
          where: and(
            eq(monthlyPayments.groupMemberId, member.id),
            eq(monthlyPayments.periodMonth, currentPeriod),
          ),
        });
        if (existing) continue;

        const previousPeriod = previousMonthStart(currentPeriod);
        const previousPayment = await db.query.monthlyPayments.findFirst({
          where: and(
            eq(monthlyPayments.groupMemberId, member.id),
            eq(monthlyPayments.periodMonth, previousPeriod),
          ),
        });
        if (previousPayment && (previousPayment.status === 'pending' || previousPayment.status === 'partial')) {
          await db
            .update(monthlyPayments)
            .set({ status: 'debt', updatedAt: new Date() })
            .where(eq(monthlyPayments.id, previousPayment.id));
        }

        await db.insert(monthlyPayments).values({
          groupMemberId: member.id,
          periodMonth: currentPeriod,
          expectedAmount: member.selectedPlan.price,
          discountAmount: 0,
          paidAmount: 0,
          status: 'pending',
        });
      }
    }

    this.logger.log(`Monthly payment generation run for ${dueGroups.length} due group(s) on day ${todayDay}`);
  }
}
