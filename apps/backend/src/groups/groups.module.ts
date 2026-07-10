import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { PaymentsModule } from '../payments/payments.module';
import { PracticeBlocksModule } from '../practice-blocks/practice-blocks.module';

@Module({
  imports: [PaymentsModule, PracticeBlocksModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
