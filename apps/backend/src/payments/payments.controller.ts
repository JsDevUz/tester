import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsInt, IsOptional, Min } from 'class-validator';

class RecordPaymentDto {
  @IsInt() @Min(1) amount: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('groups/:id/payments')
  findByGroup(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.findByGroup(id, req.admin.id);
  }

  @Post('payments/:id/pay')
  recordPayment(@Param('id') id: string, @Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.recordPayment(id, req.admin.id, dto.amount, dto.discount);
  }
}
