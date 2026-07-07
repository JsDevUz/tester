import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsString, MinLength } from 'class-validator';

class CreateCourseDto {
  @IsString() @MinLength(1) title: string;
}

class UpdateCourseDto {
  @IsString() @MinLength(1) title: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.coursesService.findAll(req.admin.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(req.admin.id, dto.title);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateCourseDto) {
    return this.coursesService.update(id, req.admin.id, dto.title);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.coursesService.remove(id, req.admin.id);
  }
}
