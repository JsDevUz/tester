import { Controller, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsIn, MinLength, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OptionDto {
  @IsString() @MinLength(1) text: string;
  @IsBoolean() isCorrect: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

class CreateQuestionDto {
  @IsString() @MinLength(1) text: string;
  @IsIn(['single', 'multi', 'open', 'arrange']) type: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options: OptionDto[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
}

class UpdateQuestionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsIn(['single', 'multi', 'open', 'arrange']) type?: string;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() audioUrl?: string;
}

class BulkImportDto {
  @IsString() @MinLength(1) text: string;
}

class UpdateOptionDto {
  @IsOptional() @IsString() @MinLength(1) text?: string;
  @IsOptional() @IsBoolean() isCorrect?: boolean;
  @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class QuestionsController {
  constructor(private questionsService: QuestionsService) {}

  @Post('tests/:testId/questions')
  addQuestion(@Param('testId') testId: string, @Body() dto: CreateQuestionDto, @Req() req: any) {
    return this.questionsService.addQuestion(testId, req.admin.id, dto);
  }

  @Post('tests/:testId/questions/bulk')
  bulkImport(@Param('testId') testId: string, @Body() dto: BulkImportDto, @Req() req: any) {
    return this.questionsService.bulkImport(testId, req.admin.id, dto.text);
  }

  @Patch('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateQuestionDto, @Req() req: any) {
    return this.questionsService.updateQuestion(id, req.admin.id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  removeQuestion(@Param('id') id: string, @Req() req: any) {
    return this.questionsService.removeQuestion(id, req.admin.id);
  }

  @Patch('options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto, @Req() req: any) {
    return this.questionsService.updateOption(id, req.admin.id, dto);
  }

  @Delete('options/:id')
  @HttpCode(204)
  removeOption(@Param('id') id: string, @Req() req: any) {
    return this.questionsService.removeOption(id, req.admin.id);
  }
}
