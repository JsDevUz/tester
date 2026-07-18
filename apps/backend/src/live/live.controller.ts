import { Controller, Post, Get, Body, Param, Query, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsInt, IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LiveService } from './live.service';

class CreateLiveSessionDto {
  @IsString() testId!: string;
  @IsInt() @IsIn([10, 20, 30, 60]) questionTimeSec!: number;
  @IsOptional() @IsIn(['individual', 'team']) mode?: 'individual' | 'team';
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('live')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Get('tests')
  listTests(@Req() req: any) {
    return this.liveService.listTests(req.admin.id);
  }

  @Get('sessions')
  listSessions(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const o = Math.max(0, parseInt(offset ?? '0', 10) || 0);
    return this.liveService.listSessionHistory(req.admin.id, l, o);
  }

  @Post('sessions')
  async create(@Body() dto: CreateLiveSessionDto, @Req() req: any) {
    try {
      return await this.liveService.createSession(req.admin.id, dto.testId, dto.questionTimeSec, dto.mode ?? 'individual');
    } catch (e: any) {
      if (e?.message === 'NOT_FOUND') throw new NotFoundException('Test not found');
      if (e?.message === 'NO_LIVE_QUESTIONS') throw new BadRequestException('NO_LIVE_QUESTIONS');
      if (e?.message === 'INVALID_TIME') throw new BadRequestException('INVALID_TIME');
      throw e;
    }
  }

  @Post('sessions/:pin/voice-token')
  @Roles('teacher', 'super', 'student', 'curator')
  voiceToken(@Param('pin') pin: string, @Req() req: any) {
    return this.liveService.voiceToken(pin, req.admin.id, req.admin.name ?? '');
  }

  @Post('sessions/:pin/participants/:userId/mute')
  @Roles('teacher', 'super')
  async mute(@Param('pin') pin: string, @Param('userId') userId: string, @Req() req: any) {
    await this.liveService.muteParticipant(pin, req.admin.id, userId);
    return { ok: true };
  }
}
