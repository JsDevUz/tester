import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { PracticeBlocksService } from './practice-blocks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

class UpdatePracticeBlockDto {
  @IsOptional() @IsUUID() testId?: string | null;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) maxScore?: number | null;
}

class ReorderPracticeBlocksDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blockIds: string[];
}

class CreatePracticeBlockDto {
  @IsIn(['test', 'image', 'oral']) type: 'test' | 'image' | 'oral';
}

class SubmitImageDto {
  @IsString() imageUrl: string;
}

class GradeImageDto {
  @IsInt() @Min(0) score: number;
}

class GradeOralPracticeDto {
  @IsInt() @Min(0) score: number;
}

class GradeTestPracticeDto {
  @IsInt() @Min(0) score: number;
}

@Controller()
export class PracticeBlocksController {
  constructor(private practiceBlocksService: PracticeBlocksService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('lessons/:lessonId/complete')
  markComplete(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.markLessonComplete(lessonId, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('lessons/:lessonId/practice-blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.findAll(lessonId, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('lessons/:lessonId/practice-blocks')
  create(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: CreatePracticeBlockDto) {
    return this.practiceBlocksService.create(lessonId, req.admin.id, dto.type);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('practice-blocks/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdatePracticeBlockDto) {
    return this.practiceBlocksService.update(id, req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('practice-blocks/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.practiceBlocksService.remove(id, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('lessons/:lessonId/practice-blocks/reorder')
  @HttpCode(204)
  reorder(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: ReorderPracticeBlocksDto) {
    return this.practiceBlocksService.reorder(lessonId, req.admin.id, dto.blockIds);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('practice-blocks/:id/image-submissions')
  submitImage(@Param('id') id: string, @Req() req: any, @Body() dto: SubmitImageDto) {
    return this.practiceBlocksService.submitImage(id, req.user.id, dto.imageUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Delete('image-submissions/:id')
  @HttpCode(204)
  removeImageSubmission(@Param('id') id: string, @Req() req: any) {
    return this.practiceBlocksService.removeImageSubmission(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'curator', 'teacher', 'super')
  @Patch('image-submissions/:id/grade')
  gradeImage(@Param('id') id: string, @Req() req: any, @Body() dto: GradeImageDto) {
    return this.practiceBlocksService.gradeImage(id, req.admin.id, dto.score);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student', 'curator', 'teacher', 'super')
  @Patch('practice-blocks/:id/oral-grades/:studentId')
  gradeOralPractice(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Body() dto: GradeOralPracticeDto,
  ) {
    return this.practiceBlocksService.gradeOralPractice(id, studentId, req.admin.id, dto.score);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('curator', 'teacher', 'super')
  @Patch('test-practice-submissions/:id/grade')
  gradeTestPractice(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: GradeTestPracticeDto,
  ) {
    return this.practiceBlocksService.gradeTestPractice(id, req.admin.id, dto.score);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('lessons/:lessonId/image-submissions')
  listImageSubmissionsForGrading(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.listImageSubmissionsForGrading(lessonId, req.admin.id);
  }
}
