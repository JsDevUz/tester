import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { StudentChallengesService } from './student-challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class AddEventDto {
  @IsInt() @Min(1) endPage: number;
  @IsInt() @Min(0) newWordsCount: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/challenges')
export class StudentChallengesController {
  constructor(private studentChallengesService: StudentChallengesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.studentChallengesService.findAllForStudent(req.user.id);
  }

  @Post(':id/join')
  join(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.join(id, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.findOneForStudent(id, req.user.id);
  }

  @Post(':id/books/:bookId/events')
  addEvent(@Param('id') id: string, @Param('bookId') bookId: string, @Req() req: any, @Body() dto: AddEventDto) {
    return this.studentChallengesService.addEvent(id, bookId, req.user.id, dto);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @Req() req: any) {
    return this.studentChallengesService.history(id, req.user.id);
  }

  @Get(':id/leaderboard')
  leaderboard(
    @Param('id') id: string,
    @Req() req: any,
    @Query('metric') metric: 'overall' | 'books' | 'words' | 'speed' = 'overall',
    @Query('bookId') bookId?: string,
  ) {
    return this.studentChallengesService.leaderboard(id, req.user.id, metric, bookId);
  }
}
