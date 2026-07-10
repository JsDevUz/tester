import { Module } from '@nestjs/common';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { PracticeBlocksModule } from '../practice-blocks/practice-blocks.module';

@Module({
  imports: [PracticeBlocksModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
