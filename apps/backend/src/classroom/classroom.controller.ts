import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Public } from '../auth/roles.decorator';
import { ClassroomService } from './classroom.service';

class CreateClassSessionDto {
  @IsString() courseId!: string;
  @IsOptional() @IsString() title?: string;
}

class CreateFreeClassSessionDto {
  @IsOptional() @IsString() title?: string;
}

class ReopenFreeSessionDto {
  @IsOptional() @IsString() title?: string;
}

class OverrideAttendanceDto {
  @IsIn(['absent', 'present', 'late']) status!: 'absent' | 'present' | 'late';
}

class AttachPdfDto {
  @IsString() mediaAssetId!: string;
  @IsInt({ each: true }) @Min(1, { each: true }) @ArrayMinSize(1) pageNumbers!: number[];
}

class InsertPdfPagesDto {
  @IsString() mediaAssetId!: string;
  @IsInt({ each: true }) @Min(1, { each: true }) @ArrayMinSize(1) pageNumbers!: number[];
  @IsInt() @Min(0) afterPageIndex!: number;
}

class StartRecordingDto {
  @IsIn(['full', 'boardAudio', 'boardSilent']) mode!: 'full' | 'boardAudio' | 'boardSilent';
}

class GuestVoiceTokenDto {
  @IsString() guestName!: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post('sessions')
  @Roles('teacher', 'super')
  createSession(@Body() dto: CreateClassSessionDto, @Req() req: any) {
    return this.classroomService.createSession(dto.courseId, req.admin.id, req.admin.role, dto.title);
  }

  // Erkin (guruhsiz) dars — kursga, guruhga bog'liq emas, DB'ga yozuv qilinadi.
  @Post('sessions/free')
  @Roles('teacher', 'super')
  createFreeSession(@Body() dto: CreateFreeClassSessionDto, @Req() req: any) {
    return this.classroomService.createFreeSession(req.admin.id, dto?.title);
  }

  // Eski erkin darsning oxirgi saqlangan holatidan yangi jonli dars
  // boshlaydi — createFreeSessionFromSnapshot'ning REST qatlami.
  @Post('sessions/free/from/:sourceSessionId')
  @Roles('teacher', 'super')
  async createFreeSessionFromSnapshot(
    @Param('sourceSessionId', ParseUUIDPipe) sourceSessionId: string,
    @Req() req: any,
  ) {
    return this.classroomService.createFreeSessionFromSnapshot(req.admin.id, sourceSessionId);
  }

  // Darsni oxirgi saqlangan holatidan (boardSnapshot) yangi jonli dars qilib boshlaydi
  @Post('sessions/from/:sourceSessionId')
  @Roles('teacher', 'super')
  async createSessionFromSnapshot(
    @Param('sourceSessionId', ParseUUIDPipe) sourceSessionId: string,
    @Body() dto: { title?: string },
    @Req() req: any,
  ) {
    return this.classroomService.createClassSessionFromSnapshot(sourceSessionId, req.admin.id, req.admin.role, dto?.title);
  }

  // Tugallangan erkin darsni o'SHA ID bilan davom ettiradi.
  @Post('sessions/:id/reopen')
  @Roles('teacher', 'super')
  async reopenFreeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenFreeSessionDto,
    @Req() req: any,
  ) {
    await this.classroomService.reopenFreeSession(req.admin.id, id, dto?.title);
    return { id };
  }

  @Post('sessions/:id/pdf')
  @Roles('teacher', 'super')
  async attachPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachPdfDto,
    @Req() req: any,
  ) {
    return this.classroomService.attachPdfFromLibrary(id, req.admin.id, req.admin.role, dto.mediaAssetId, dto.pageNumbers);
  }

  @Post('sessions/:id/pdf/insert')
  @Roles('teacher', 'super')
  async insertPdfPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InsertPdfPagesDto,
    @Req() req: any,
  ) {
    return this.classroomService.insertPdfPagesFromLibrary(id, req.admin.id, req.admin.role, dto.mediaAssetId, dto.pageNumbers, dto.afterPageIndex);
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

  @Get('sessions/:id/replay')
  @Roles('teacher', 'super', 'student')
  getReplay(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Query('recordingId') recordingId?: string,
  ) {
    return this.classroomService.getReplay(id, req.admin.id, recordingId);
  }

  @Delete('sessions/:id')
  @Roles('teacher', 'super')
  deleteSession(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.classroomService.deleteSession(id, req.admin.id, req.admin.role);
  }

  @Get('courses/:courseId/history')
  @Roles('teacher', 'super')
  courseHistory(@Param('courseId', ParseUUIDPipe) courseId: string, @Req() req: any) {
    return this.classroomService.courseHistory(courseId, req.admin.id, req.admin.role);
  }

  @Get('my-free-sessions')
  @Roles('teacher', 'super')
  myFreeSessionHistory(@Req() req: any) {
    return this.classroomService.myFreeSessionHistory(req.admin.id);
  }

  @Get('my-sessions')
  @Roles('student')
  myClassSessions(@Req() req: any) {
    return this.classroomService.myClassSessions(req.admin.id);
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

  /** Guest (auth qilmagan) foydalanuvchi uchun voice token — JWT talab qilinmaydi.
   * Identity: "guest_<randomUUID prefix>" — boshqa ishtirokchilar bilan aralashmasligi uchun. */
  @Public()
  @Post('sessions/:id/voice-token/guest')
  guestVoiceToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestVoiceTokenDto,
  ) {
    const guestIdentity = `guest_${Math.random().toString(36).slice(2, 10)}`;
    return this.classroomService.voiceToken(id, guestIdentity, dto.guestName);
  }

  @Post('sessions/:id/recording/start')
  @Roles('teacher', 'super')
  async startRecording(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartRecordingDto,
    @Req() req: any,
  ) {
    await this.classroomService.startSessionRecording(id, req.admin.id, dto.mode);
    return { ok: true };
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
