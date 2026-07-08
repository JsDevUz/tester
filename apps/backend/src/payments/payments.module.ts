import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsCronService } from './payments-cron.service';
import { StudentAccessService } from './student-access.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsCronService, StudentAccessService],
  exports: [StudentAccessService],
})
export class PaymentsModule {}
