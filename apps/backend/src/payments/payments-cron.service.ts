import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { db } from '../db';
import { groups, groupEnrollments } from '../db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsCronService {
  private readonly logger = new Logger(PaymentsCronService.name);

  constructor(private paymentsService: PaymentsService) {}

  @Cron('0 1 * * *')
  async generateMonthlyPayments() {
    const today = new Date();
    const todayDay = today.getUTCDate();

    const dueGroups = await db.query.groups.findMany({ where: eq(groups.paymentDay, todayDay) });

    for (const group of dueGroups) {
      const enrollments = await db.query.groupEnrollments.findMany({
        where: and(eq(groupEnrollments.groupId, group.id), isNotNull(groupEnrollments.selectedPlanId)),
      });

      for (const enrollment of enrollments) {
        await this.paymentsService.ensureCurrentMonthPayment(enrollment.id);
      }
    }

    this.logger.log(`Monthly payment generation run for ${dueGroups.length} due group(s) on day ${todayDay}`);
  }
}
