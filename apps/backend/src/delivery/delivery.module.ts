import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import 'dotenv/config';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! })],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
