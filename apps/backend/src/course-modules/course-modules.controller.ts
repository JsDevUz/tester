import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { CourseModulesService } from './course-modules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

class CreateModuleDto {
  @IsString() @MinLength(1) title: string;
}

class UpdateModuleDto {
  @IsString() @MinLength(1) title: string;
}

class ReorderModulesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) moduleIds: string[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class CourseModulesController {
  constructor(private courseModulesService: CourseModulesService) {}

  @Get('courses/:courseId/modules')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.courseModulesService.findAll(courseId, req.admin.id);
  }

  @Post('courses/:courseId/modules')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateModuleDto) {
    return this.courseModulesService.create(courseId, req.admin.id, dto.title);
  }

  @Patch('modules/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateModuleDto) {
    return this.courseModulesService.update(id, req.admin.id, dto.title);
  }

  @Delete('modules/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.courseModulesService.remove(id, req.admin.id);
  }

  @Post('courses/:courseId/modules/reorder')
  @HttpCode(204)
  reorder(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: ReorderModulesDto) {
    return this.courseModulesService.reorder(courseId, req.admin.id, dto.moduleIds);
  }
}
