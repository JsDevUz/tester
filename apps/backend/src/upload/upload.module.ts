import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { StorageModule } from '../storage/storage.module';
import { SchoolsModule } from '../schools/schools.module';

@Module({
  imports: [StorageModule, SchoolsModule],
  controllers: [UploadController],
})
export class UploadModule {}
