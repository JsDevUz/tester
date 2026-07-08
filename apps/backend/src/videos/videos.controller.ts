import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { VideoPlaybackService } from './video-playback.service';
import { VideoUploadService } from './video-upload.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VideosController {
  constructor(
    private readonly videoUploadService: VideoUploadService,
    private readonly videoPlaybackService: VideoPlaybackService,
  ) {}

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

  @Post('videos/:blockId/play')
  @Roles('student')
  startPlayback(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoPlaybackService.startPlayback(blockId, req.user.id);
  }

  @Get('videos/:blockId/manifest.m3u8')
  @Roles('student')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  getManifest(@Param('blockId') blockId: string, @Query('token') token: string) {
    return this.videoPlaybackService.getManifest(blockId, token);
  }

  @Get('videos/:blockId/key')
  @Roles('student')
  async getKey(@Param('blockId') blockId: string, @Query('token') token: string, @Res() res: Response) {
    const key = await this.videoPlaybackService.getKey(blockId, token);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(key);
  }

  @Get('videos/:blockId/segments/:fileName')
  @Roles('student')
  @Header('Content-Type', 'video/mp2t')
  getSegment(
    @Param('blockId') blockId: string,
    @Param('fileName') fileName: string,
    @Query('token') token: string,
  ) {
    return this.videoPlaybackService.getSegment(blockId, fileName, token);
  }
}
