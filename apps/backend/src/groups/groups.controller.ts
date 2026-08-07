import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

class CreateGroupDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() @Min(1) @Max(28) paymentDay?: number;
}

class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() groupChatEnabled?: boolean;
  @IsOptional() @IsBoolean() groupChannelEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(28) paymentDay?: number;
}

class UpdateMemberDto {
  @IsOptional() @IsUUID() selectedPlanId?: string | null;
}

class ForceCloseDto {
  @IsBoolean() forcedClosed: boolean;
}

class AssignCuratorDto {
  @IsUUID() studentId: string;
}

class EnrollStudentDto {
  @IsUUID() studentId: string;
}

@Controller()
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('courses/:courseId/groups')
  findAll(@Param('courseId') courseId: string, @Req() req: any) {
    return this.groupsService.findAll(courseId, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('courses/:courseId/groups')
  create(@Param('courseId') courseId: string, @Req() req: any, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(courseId, req.admin.id, dto.name, dto.paymentDay ?? 1);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('groups/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.remove(id, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('groups/:id/members')
  findMembers(@Param('id') id: string, @Req() req: any) {
    return this.groupsService.findMembers(id, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id/members/:memberId')
  updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.groupsService.updateMember(id, memberId, req.admin.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Patch('groups/:id/members/:memberId/force-close')
  setForcedClosed(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
    @Body() dto: ForceCloseDto,
  ) {
    return this.groupsService.setForcedClosed(id, memberId, req.admin.id, dto.forcedClosed);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Delete('groups/:id/members/:memberId')
  removeMember(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.groupsService.removeMember(id, memberId, req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('groups/:id/curators')
  assignCurator(@Param('id') id: string, @Req() req: any, @Body() dto: AssignCuratorDto) {
    return this.groupsService.assignCuratorFromStaff(id, req.admin.id, dto.studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('groups/:id/curators/:memberId/demote')
  demoteCurator(@Param('id') id: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.groupsService.demoteCuratorFromStaff(id, req.admin.id, memberId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Post('groups/:id/enroll')
  enrollStudent(@Param('id') id: string, @Req() req: any, @Body() dto: EnrollStudentDto) {
    return this.groupsService.enrollStudent(id, req.admin.id, dto.studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('teacher', 'super')
  @Get('groups/pending-plan-assignment')
  findPendingPlanAssignment(@Req() req: any) {
    return this.groupsService.findPendingPlanAssignment(req.admin.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses')
  getMyCourses(@Req() req: any, @Query('schoolId') schoolId?: string) {
    return this.groupsService.getMyCourses(req.user.id, schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/schools')
  getMySchools(@Req() req: any) {
    return this.groupsService.getMySchools(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses/:courseId/leaderboard')
  getMyCourseLeaderboard(@Param('courseId') courseId: string, @Req() req: any) {
    return this.groupsService.getMyCourseLeaderboard(courseId, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('my/courses/:courseId')
  getMyCourseDetail(@Param('courseId') courseId: string, @Req() req: any) {
    return this.groupsService.getMyCourseDetail(courseId, req.user.id);
  }
}
