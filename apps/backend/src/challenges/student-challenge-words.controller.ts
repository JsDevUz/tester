import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { StudentChallengeWordsService } from './student-challenge-words.service';

class SetProgressDto {
  @IsBoolean() known: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/challenges/:id/words')
export class StudentChallengeWordsController {
  constructor(private readonly studentChallengeWordsService: StudentChallengeWordsService) {}

  @Get()
  listWords(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengeWordsService.listWords(id, req.user.id);
  }

  @Get('leaderboard')
  leaderboard(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengeWordsService.leaderboard(id, req.user.id);
  }

  @Post(':wordId/progress')
  setProgress(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any, @Body() dto: SetProgressDto) {
    return this.studentChallengeWordsService.setProgress(id, wordId, req.user.id, dto.known);
  }
}
