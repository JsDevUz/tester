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
  @IsIn(['test']) type: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PracticeBlocksController {
  constructor(private practiceBlocksService: PracticeBlocksService) {}

  @Get('lessons/:lessonId/practice-blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.practiceBlocksService.findAll(lessonId, req.admin.id);
  }

  @Post('lessons/:lessonId/practice-blocks')
  create(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: CreatePracticeBlockDto) {
    return this.practiceBlocksService.create(lessonId, req.admin.id);
  }

  @Patch('practice-blocks/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdatePracticeBlockDto) {
    return this.practiceBlocksService.update(id, req.admin.id, dto);
  }

  @Delete('practice-blocks/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.practiceBlocksService.remove(id, req.admin.id);
  }

  @Post('lessons/:lessonId/practice-blocks/reorder')
  @HttpCode(204)
  reorder(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: ReorderPracticeBlocksDto) {
    return this.practiceBlocksService.reorder(lessonId, req.admin.id, dto.blockIds);
  }
}
