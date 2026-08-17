import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

class RecordPaymentDto {
  @IsInt() @Min(0) amount: number;
  @IsOptional() @IsInt() @Min(0) discount?: number;
  @IsOptional() @IsIn(['cash', 'click', 'payme', 'card', 'other']) method?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() receiptUrl?: string;
  @IsOptional() @IsDateString() paymentDate?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('payments')
  findAll(@Req() req: any) {
    return this.paymentsService.findAllForAdmin(req.admin.id);
  }

  @Get('groups/:id/payments')
  findByGroup(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.findByGroup(id, req.admin.id);
  }

  @Post('payments/:id/pay')
  recordPayment(@Param('id') id: string, @Req() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.recordPayment(
      id,
      req.admin.id,
      dto.amount,
      dto.discount,
      dto.method,
      dto.note,
      dto.receiptUrl,
      dto.paymentDate,
    );
  }

  @Post('payments/:id/cancel')
  cancelPayment(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.cancelPayment(id, req.admin.id);
  }

  @Get('payments/:id/cancellations')
  listCancellations(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.listCancellations(id, req.admin.id);
  }
}
