import { Module } from '@nestjs/common';
import { PracticeBlocksController } from './practice-blocks.controller';
import { PracticeBlocksService } from './practice-blocks.service';
import { PracticeMessengerModule } from '../practice-messenger/practice-messenger.module';

@Module({
  imports: [PracticeMessengerModule],
  controllers: [PracticeBlocksController],
  providers: [PracticeBlocksService],
  exports: [PracticeBlocksService],
})
export class PracticeBlocksModule {}
