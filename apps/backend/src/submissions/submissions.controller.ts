import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('tests/:testId/submissions')
  findByTest(@Param('testId') testId: string, @Req() req: any) {
    return this.submissionsService.findByTest(testId, req.admin.id);
  }

  @Get('submissions/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.submissionsService.findOne(id, req.admin.id);
  }
}
