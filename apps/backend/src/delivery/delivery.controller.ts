import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { StartSubmissionDto } from './dto/start-submission.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Controller('public')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('tests/:slug')
  getTest(@Param('slug') slug: string) {
    return this.deliveryService.getTestBySlug(slug);
  }

  @Post('submissions')
  startSubmission(@Body() dto: StartSubmissionDto) {
    return this.deliveryService.startSubmission(dto.slug, dto.studentName);
  }

  @Get('submissions/:id')
  getSubmission(@Param('id') id: string) {
    return this.deliveryService.getSubmission(id);
  }

  @Post('submissions/:id/submit')
  @HttpCode(200)
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto) {
    return this.deliveryService.submitAnswers(id, dto.answers);
  }
}
