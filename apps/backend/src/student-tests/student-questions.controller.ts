import { Controller, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { StudentQuestionsService } from './student-questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsIn, MinLength, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

const QUESTION_TYPES = ['single', 'multi', 'open', 'arrange', 'truefalse', 'reorder', 'matching', 'fillblank', 'slider', 'droppin'];

class StudentOptionDto {
  @IsString() @MinLength(1) text: string;
  @IsBoolean() isCorrect: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

class CreateStudentQuestionDto {
  @IsString() @MinLength(1) text: string;
  @IsIn(QUESTION_TYPES) type!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StudentOptionDto) options: StudentOptionDto[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
  @IsOptional() @IsString() correctAnswer?: string;
}

class UpdateStudentQuestionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsIn(QUESTION_TYPES) type?: string;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
  @IsOptional() @IsString() correctAnswer?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller()
export class StudentQuestionsController {
  constructor(private studentQuestionsService: StudentQuestionsService) {}

  @Post('me/tests/:testId/questions')
  addQuestion(@Param('testId') testId: string, @Body() dto: CreateStudentQuestionDto, @Req() req: any) {
    return this.studentQuestionsService.addQuestion(testId, req.user.id, dto);
  }

  @Patch('me/questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateStudentQuestionDto, @Req() req: any) {
    return this.studentQuestionsService.updateQuestion(id, req.user.id, dto);
  }

  @Delete('me/questions/:id')
  @HttpCode(204)
  removeQuestion(@Param('id') id: string, @Req() req: any) {
    return this.studentQuestionsService.removeQuestion(id, req.user.id);
  }
}
