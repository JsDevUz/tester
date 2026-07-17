import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

class AddStaffDto {
  @IsUUID() studentId: string;
  @IsIn(['curator', 'teacher_staff']) role: string;
}

class UpdateStudentNameDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
}

@Controller()
export class SchoolsController {
  constructor(private schoolsService: SchoolsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school')
  getSchool(@Req() req: any) {
    return this.schoolsService.getSchool(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('school')
  updateSchool(@Req() req: any, @Body() dto: UpdateSchoolDto) {
    return this.schoolsService.updateSchool(req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('school/invite/regenerate')
  regenerateInviteToken(@Req() req: any) {
    return this.schoolsService.regenerateInviteToken(req.admin.id);
  }

  @Get('school-invite/:token')
  getJoinPreview(@Param('token') token: string) {
    return this.schoolsService.getJoinPreview(token);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('school-invite/:token')
  join(@Param('token') token: string, @Req() req: any) {
    return this.schoolsService.joinByToken(token, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/staff')
  findStaff(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.schoolsService.findStaff(req.admin.id, Number(limit) || 7, Number(offset) || 0);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students')
  async listAllStudents(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') query?: string) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listAllStudents(schoolAdminId, req.admin.id, req.admin.role, Number(limit) || 7, Number(offset) || 0, query || '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students/enrollments')
  async listEnrollments(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') query?: string, @Query('course') course?: string) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listEnrollments(schoolAdminId, req.admin.id, req.admin.role, Number(limit) || 7, Number(offset) || 0, query || '', course || '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students/:studentId/courses/:courseId/progress')
  async getStudentCourseProgress(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
  ) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.getStudentCourseProgress(
      schoolAdminId,
      studentId,
      courseId,
      req.admin.id,
      req.admin.role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('school/students/:studentId/name')
  updateStudentName(@Req() req: any, @Param('studentId') studentId: string, @Body() dto: UpdateStudentNameDto) {
    return this.schoolsService.updateStudentName(req.admin.id, studentId, dto.name);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/without-group')
  findStudentsWithoutGroup(@Req() req: any) {
    return this.schoolsService.findStudentsWithoutGroup(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/search')
  searchStudents(@Req() req: any, @Query('q') q: string) {
    return this.schoolsService.searchStudents(req.admin.id, q || '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('school/staff')
  addStaff(@Req() req: any, @Body() dto: AddStaffDto) {
    return this.schoolsService.addStaff(req.admin.id, dto.studentId, dto.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('school/staff/:memberId')
  removeStaff(@Param('memberId') memberId: string, @Req() req: any) {
    return this.schoolsService.removeStaff(memberId, req.admin.id);
  }
}
