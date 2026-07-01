import { Controller, Delete, Get, HttpCode, Param, Req, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('me/submissions')
  findMine(@Req() req: any) {
    return this.submissionsService.findMine(req.user.id);
  }

  @Get('tests/:testId/submissions')
  @Roles('teacher', 'super')
  findByTest(@Param('testId') testId: string, @Req() req: any) {
    return this.submissionsService.findByTest(testId, req.admin.id);
  }

  @Get('submissions/:id')
  @Roles('teacher', 'super')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.findOne(id, req.admin.id);
  }

  @Delete('submissions/:id')
  @Roles('teacher', 'super')
  @HttpCode(204)
  deleteOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.deleteOne(id, req.admin.id);
  }
}
