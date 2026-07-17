import {
  BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post,
  Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClassroomService } from './classroom.service';

const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25 MB

class CreateClassSessionDto {
  @IsString() groupId!: string;
}

class OverrideAttendanceDto {
  @IsIn(['absent', 'present', 'late']) status!: 'absent' | 'present' | 'late';
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post('sessions')
  @Roles('teacher', 'super')
  createSession(@Body() dto: CreateClassSessionDto, @Req() req: any) {
    return this.classroomService.createSession(dto.groupId, req.admin.id, req.admin.role);
  }

  @Post('sessions/:id/pdf')
  @Roles('teacher', 'super')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PDF_SIZE },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
        else cb(new BadRequestException('Faqat PDF fayl qabul qilinadi'), false);
      },
    }),
  )
  async uploadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    return this.classroomService.attachPdf(id, req.admin.id, file);
  }

  @Post('sessions/:id/end')
  @Roles('teacher', 'super')
  async endSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.classroomService.endSession(id, req.admin.id);
    return { ok: true };
  }

  @Get('sessions/active')
  @Roles('teacher', 'super', 'student', 'curator')
  listActive(@Req() req: any) {
    return this.classroomService.listActiveForUser(req.admin.id, req.admin.role);
  }

  @Get('sessions/:id')
  @Roles('teacher', 'super')
  getSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.classroomService.getSessionWithAttendance(id, req.admin.id, req.admin.role);
  }

  @Get('groups/:groupId/history')
  @Roles('teacher', 'super')
  groupHistory(@Param('groupId', ParseUUIDPipe) groupId: string, @Req() req: any) {
    return this.classroomService.groupHistory(groupId, req.admin.id, req.admin.role);
  }

  @Patch('attendance/:recordId')
  @Roles('teacher', 'super')
  async overrideAttendance(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() dto: OverrideAttendanceDto,
    @Req() req: any,
  ) {
    await this.classroomService.overrideAttendance(recordId, req.admin.id, req.admin.role, dto.status);
    return { ok: true };
  }

  @Post('sessions/:id/voice-token')
  @Roles('teacher', 'super', 'student', 'curator')
  voiceToken(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.classroomService.voiceToken(id, req.admin.id, req.admin.name ?? '');
  }

  @Post('sessions/:id/participants/:userId/mute')
  @Roles('teacher', 'super')
  async mute(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: any,
  ) {
    await this.classroomService.muteParticipant(id, req.admin.id, userId);
    return { ok: true };
  }
}
