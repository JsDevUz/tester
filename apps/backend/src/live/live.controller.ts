import { Controller, Post, Get, Body, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsInt, IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LiveService } from './live.service';

class CreateLiveSessionDto {
  @IsString() testId!: string;
  @IsInt() @IsIn([10, 20, 30, 60]) questionTimeSec!: number;
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

  @Post('sessions')
  async create(@Body() dto: CreateLiveSessionDto, @Req() req: any) {
    try {
      return await this.liveService.createSession(req.admin.id, dto.testId, dto.questionTimeSec);
    } catch (e: any) {
      if (e?.message === 'NOT_FOUND') throw new NotFoundException('Test not found');
      if (e?.message === 'NO_LIVE_QUESTIONS') throw new BadRequestException('NO_LIVE_QUESTIONS');
      if (e?.message === 'INVALID_TIME') throw new BadRequestException('INVALID_TIME');
      throw e;
    }
  }
}
