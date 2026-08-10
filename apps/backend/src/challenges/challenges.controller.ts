import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class CreateChallengeDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsIn(['kitobxonlik', 'soz_yodlash']) type?: string;
}

class UpdateChallengeDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsIn(['kitobxonlik', 'soz_yodlash']) type?: string;
}

class AddBookDto {
  @IsString() @MinLength(1) title: string;
  @IsInt() @Min(1) totalPages: number;
}

class UpdateBookDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsInt() @Min(1) totalPages?: number;
}

class SetBookTestDto {
  @IsUUID() testId: string;
  @IsOptional() @IsInt() @Min(1) triggerPage?: number;
  @IsOptional() @IsBoolean() forceNow?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class ChallengesController {
  constructor(private challengesService: ChallengesService) {}

  @Get('courses/:courseId/challenges')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.challengesService.findAllForCourse(courseId, req.admin.id);
  }

  @Post('courses/:courseId/challenges')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateChallengeDto) {
    return this.challengesService.create(courseId, req.admin.id, dto);
  }

  @Get('challenges/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.challengesService.findOneOwned(id, req.admin.id);
  }

  @Get('challenges/:id/stats')
  stats(@Param('id') id: string, @Req() req: any) {
    return this.challengesService.stats(id, req.admin.id);
  }

  @Get('challenges/:id/leaderboard')
  leaderboard(
    @Param('id') id: string,
    @Req() req: any,
    @Query('metric') metric: 'overall' | 'books' | 'words' | 'speed' = 'overall',
    @Query('bookId') bookId?: string,
  ) {
    return this.challengesService.leaderboard(id, req.admin.id, metric, bookId);
  }

  @Patch('challenges/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateChallengeDto) {
    return this.challengesService.update(id, req.admin.id, dto);
  }

  @Delete('challenges/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.challengesService.remove(id, req.admin.id);
  }

  @Post('challenges/:id/books')
  addBook(@Param('id') id: string, @Req() req: any, @Body() dto: AddBookDto) {
    return this.challengesService.addBook(id, req.admin.id, dto);
  }

  @Patch('challenges/books/:bookId')
  updateBook(@Param('bookId') bookId: string, @Req() req: any, @Body() dto: UpdateBookDto) {
    return this.challengesService.updateBook(bookId, req.admin.id, dto);
  }

  @Delete('challenges/books/:bookId')
  @HttpCode(204)
  removeBook(@Param('bookId') bookId: string, @Req() req: any) {
    return this.challengesService.removeBook(bookId, req.admin.id);
  }

  @Put('challenges/books/:bookId/test')
  setBookTest(@Param('bookId') bookId: string, @Req() req: any, @Body() dto: SetBookTestDto) {
    return this.challengesService.setBookTest(bookId, req.admin.id, dto);
  }

  @Delete('challenges/books/:bookId/test')
  @HttpCode(204)
  removeBookTest(@Param('bookId') bookId: string, @Req() req: any) {
    return this.challengesService.removeBookTest(bookId, req.admin.id);
  }
}
