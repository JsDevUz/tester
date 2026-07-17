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
import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { VideoPlaybackService } from './video-playback.service';
import { VideoProgressService } from './video-progress.service';
import { VideoUploadService } from './video-upload.service';

class SaveWatchProgressDto {
  @IsInt() @Min(0) startSec: number;
  @IsInt() @Min(0) endSec: number;
}

class InitiateVideoUploadDto {
  @IsString() @MinLength(1) fileName: string;
  @IsString() @IsIn(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-matroska'])
  mimeType: string;
  label?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VideosController {
  constructor(
    private readonly videoUploadService: VideoUploadService,
    private readonly videoPlaybackService: VideoPlaybackService,
    private readonly videoProgressService: VideoProgressService,
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

  @Post('lessons/:lessonId/videos/initiate')
  @Roles('teacher', 'super')
  initiateUpload(
    @Param('lessonId') lessonId: string,
    @Body() dto: InitiateVideoUploadDto,
    @Req() req: any,
  ) {
    return this.videoUploadService.initiateUpload(lessonId, req.admin.id, dto.fileName, dto.mimeType, dto.label);
  }

  @Post('blocks/:blockId/videos/complete')
  @Roles('teacher', 'super')
  completeUpload(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoUploadService.completeUpload(blockId, req.admin.id);
  }

  @Post('blocks/:blockId/videos/retry')
  @Roles('teacher', 'super')
  retry(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoUploadService.retry(blockId, req.admin.id);
  }

  @Post('videos/:blockId/play')
  @Roles('student', 'teacher', 'super')
  startPlayback(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoPlaybackService.startPlayback(blockId, {
      id: req.user.id,
      role: req.user.role,
    });
  }

  @Get('videos/:blockId/manifest.m3u8')
  @Roles('student', 'teacher', 'super')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  getManifest(@Param('blockId') blockId: string, @Query('token') token: string) {
    return this.videoPlaybackService.getManifest(blockId, token);
  }

  @Get('videos/:blockId/key')
  @Roles('student', 'teacher', 'super')
  async getKey(@Param('blockId') blockId: string, @Query('token') token: string, @Res() res: Response) {
    const key = await this.videoPlaybackService.getKey(blockId, token);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(key);
  }

  @Get('videos/:blockId/segments/:fileName')
  @Roles('student', 'teacher', 'super')
  @Header('Content-Type', 'video/mp2t')
  getSegment(
    @Param('blockId') blockId: string,
    @Param('fileName') fileName: string,
    @Query('token') token: string,
  ) {
    return this.videoPlaybackService.getSegment(blockId, fileName, token);
  }

  @Post('videos/:blockId/watch-progress')
  @Roles('student', 'teacher', 'super')
  saveWatchProgress(@Param('blockId') blockId: string, @Body() dto: SaveWatchProgressDto, @Req() req: any) {
    if (dto.endSec <= dto.startSec) throw new BadRequestException('endSec must be greater than startSec');
    return this.videoProgressService.saveProgress(
      blockId,
      { id: req.user.id, role: req.user.role },
      { startSec: dto.startSec, endSec: dto.endSec },
    );
  }

  @Get('videos/:blockId/watch-progress')
  @Roles('student', 'teacher', 'super')
  getWatchProgress(@Param('blockId') blockId: string, @Req() req: any) {
    return this.videoProgressService.getProgress(blockId, { id: req.user.id, role: req.user.role });
  }
}
