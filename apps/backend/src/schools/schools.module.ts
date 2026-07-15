import { Module } from '@nestjs/common';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';
import { PracticeBlocksModule } from '../practice-blocks/practice-blocks.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PracticeBlocksModule, StorageModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
