import { Module } from '@nestjs/common';
import { PracticeBlocksController } from './practice-blocks.controller';
import { PracticeBlocksService } from './practice-blocks.service';

@Module({
  controllers: [PracticeBlocksController],
  providers: [PracticeBlocksService],
})
export class PracticeBlocksModule {}
