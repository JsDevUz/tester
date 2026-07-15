import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PracticeMessengerController } from './practice-messenger.controller';
import { PracticeMessengerGateway } from './practice-messenger.gateway';
import { PracticeMessengerService } from './practice-messenger.service';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! })],
  controllers: [PracticeMessengerController],
  providers: [PracticeMessengerService, PracticeMessengerGateway],
  exports: [PracticeMessengerService],
})
export class PracticeMessengerModule {}
