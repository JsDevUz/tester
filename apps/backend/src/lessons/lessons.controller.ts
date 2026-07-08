import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

class CreateLessonDto {
  @IsString() @MinLength(1) title: string;
}

class UpdateLessonDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsIn(['draft', 'published']) status?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class LessonsController {
  constructor(private lessonsService: LessonsService) {}

  @Get('modules/:moduleId/lessons')
  findAll(@Param('moduleId') moduleId: string, @Req() req: any) {
    return this.lessonsService.findAll(moduleId, req.admin.id);
  }

  @Post('modules/:moduleId/lessons')
  create(@Param('moduleId') moduleId: string, @Req() req: any, @Body() dto: CreateLessonDto) {
    return this.lessonsService.create(moduleId, req.admin.id, dto.title);
  }

  @Patch('lessons/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateLessonDto) {
    return this.lessonsService.update(id, req.admin.id, dto);
  }

  @Delete('lessons/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.lessonsService.remove(id, req.admin.id);
  }
}
