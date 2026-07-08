import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { VideoJobService } from './video-job.service';
import { VideoTranscodeService } from './video-transcode.service';
import { VideoUploadService } from './video-upload.service';
import { VideosController } from './videos.controller';

@Module({
  imports: [StorageModule, PaymentsModule],
  controllers: [VideosController],
  providers: [VideoUploadService, VideoJobService, VideoTranscodeService],
})
export class VideosModule {}
