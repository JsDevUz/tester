import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { GroqModule } from '../groq/groq.module';
import { PracticeMessengerModule } from '../practice-messenger/practice-messenger.module';
import 'dotenv/config';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! }), GroqModule, PracticeMessengerModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
