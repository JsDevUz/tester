import { Controller, Get, Post, Param, Body, Headers, HttpCode } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeliveryService } from './delivery.service';
import { StartSubmissionDto } from './dto/start-submission.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Controller('public')
export class DeliveryController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string) {
    return this.deliveryService.getTestBySlug(slug);
  }

  @Post('submissions')
  startSubmission(@Body() dto: StartSubmissionDto, @Headers('authorization') authorization?: string) {
    return this.deliveryService.startSubmission(dto.slug, dto.studentName, this.getOptionalUserId(authorization));
  }

  @Get('submissions/:id')
  getSubmission(@Param('id') id: string) {
    return this.deliveryService.getSubmission(id);
  }

  @Get('submissions/:id/result')
  getSubmissionResult(@Param('id') id: string) {
    return this.deliveryService.getSubmissionResult(id);
  }

  @Post('submissions/:id/submit')
  @HttpCode(200)
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto) {
    return this.deliveryService.submitAnswers(id, dto.answers);
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
