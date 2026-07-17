import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ClassroomPdfLibraryController } from './classroom-pdf-library.controller';
import { MediaLibraryService } from './media-library.service';
import { StorageModule } from '../storage/storage.module';
import { SchoolsModule } from '../schools/schools.module';

@Module({
  imports: [StorageModule, SchoolsModule],
  controllers: [UploadController, ClassroomPdfLibraryController],
  providers: [MediaLibraryService],
  exports: [MediaLibraryService],
})
export class UploadModule {}
