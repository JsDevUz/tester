import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { VideoUploadService } from './video-upload.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VideosController {
  constructor(private readonly videoUploadService: VideoUploadService) {}

  @Post('lessons/:lessonId/videos')
  @Roles('teacher', 'super')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) cb(null, true);
        else cb(new BadRequestException('Faqat video fayllar qabul qilinadi'), false);
      },
    }),
  )
  upload(
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label: string | undefined,
    @Req() req: any,
  ) {
    return this.videoUploadService.uploadVideo(lessonId, req.admin.id, file, label);
  }

  @Post('blocks/:blockId/videos/retry')
  @Roles('teacher', 'super')
  retry(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoUploadService.retry(blockId, req.admin.id);
  }
}
