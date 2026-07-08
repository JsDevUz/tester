import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { StorageModule } from '../storage/storage.module';
import { VideoJobService } from './video-job.service';
import { VideoPlaybackService } from './video-playback.service';
import { VideoTranscodeService } from './video-transcode.service';
import { VideoUploadService } from './video-upload.service';
import { VideosController } from './videos.controller';

@Module({
  imports: [StorageModule, PaymentsModule],
  controllers: [VideosController],
  providers: [VideoUploadService, VideoJobService, VideoTranscodeService, VideoPlaybackService],
})
export class VideosModule {}
