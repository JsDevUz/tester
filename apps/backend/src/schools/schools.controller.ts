import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}

class AddStaffDto {
  @IsUUID() studentId: string;
  @IsIn(['curator', 'teacher_staff']) role: string;
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
  findStaff(@Req() req: any) {
    return this.schoolsService.findStaff(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students')
  async listAllStudents(@Req() req: any) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listAllStudents(schoolAdminId, req.admin.id, req.admin.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super', 'curator')
  @Get('school/students/enrollments')
  async listEnrollments(@Req() req: any) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    return this.schoolsService.listEnrollments(schoolAdminId, req.admin.id, req.admin.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('school/students/:studentId/courses/:courseId/progress')
  getStudentCourseProgress(
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.schoolsService.getStudentCourseProgress(req.admin.id, studentId, courseId);
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
