import { Controller, Get, Post, Param, Body, Headers, HttpCode, Query } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeliveryService } from './delivery.service';
import { StartSubmissionDto } from './dto/start-submission.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

function isPracticeMode(value?: string) {
  return value === '1' || value === 'true';
}

@Controller('public')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string, @Query('practice') practice?: string) {
    return this.deliveryService.getTestBySlug(slug, isPracticeMode(practice));
  }

  @Post('submissions')
  startSubmission(
    @Body() dto: StartSubmissionDto,
    @Query('practice') practice: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    return this.deliveryService.startSubmission(
      dto.slug,
      dto.studentName,
      this.getOptionalUserId(authorization),
      isPracticeMode(practice),
    );
  }

  @Get('submissions/:id')
  getSubmission(@Param('id') id: string, @Query('practice') practice?: string) {
    return this.deliveryService.getSubmission(id, isPracticeMode(practice));
  }

  @Get('submissions/:id/result')
  getSubmissionResult(@Param('id') id: string, @Query('practice') practice?: string) {
    return this.deliveryService.getSubmissionResult(id, isPracticeMode(practice));
  }

  @Post('submissions/:id/submit')
  @HttpCode(200)
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto, @Query('practice') practice?: string) {
    return this.deliveryService.submitAnswers(id, dto.answers, dto.mode, dto.violationReason, isPracticeMode(practice));
  }

  @Post('submissions/:id/check')
  @HttpCode(200)
  checkAnswer(@Param('id') id: string, @Body() body: { questionId: string; selectedOptionIds: string[]; textAnswer: string | null }) {
    return this.deliveryService.checkAnswer(id, body);
  }

  private getOptionalUserId(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return undefined;

    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      return payload.sub;
    } catch {
      return undefined;
    }
  }
}
