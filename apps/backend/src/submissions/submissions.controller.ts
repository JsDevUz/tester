import { Controller, Delete, Get, HttpCode, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SubmissionsService, type SubmissionSortDir, type SubmissionSortField } from './submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('me/submissions')
  findMine(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '') || 10));
    const o = Math.max(0, parseInt(offset ?? '') || 0);
    return this.submissionsService.findMine(req.user.id, l, o);
  }

  @Get('me/submissions/:id')
  findMineOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.findMineOne(id, req.user.id);
  }

  @Get('tests/:testId/submissions')
  @Roles('teacher', 'super')
  findByTest(
    @Param('testId') testId: string,
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
  ) {
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '') || 10));
    const o = Math.max(0, parseInt(offset ?? '') || 0);
    const s: SubmissionSortField = sort === 'score' ? 'score' : 'submittedAt';
    const d: SubmissionSortDir = dir === 'asc' ? 'asc' : 'desc';
    return this.submissionsService.findByTest(testId, req.admin.id, l, o, s, d);
  }

  @Get('submissions/:id')
  @Roles('teacher', 'super', 'curator')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.findOne(id, req.admin.id, req.admin.role);
  }

  @Delete('submissions/:id')
  @Roles('teacher', 'super')
  @HttpCode(204)
  deleteOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.deleteOne(id, req.admin.id);
  }
}
