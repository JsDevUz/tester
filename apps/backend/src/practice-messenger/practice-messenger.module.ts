import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PracticeMessengerController } from './practice-messenger.controller';
import { PracticeMessengerGateway } from './practice-messenger.gateway';
import { PracticeMessengerService } from './practice-messenger.service';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET! })],
  controllers: [PracticeMessengerController],
  providers: [PracticeMessengerService, PracticeMessengerGateway],
  // PracticeMessengerGateway'ning user:<userId> xona-infratuzilmasi
  // (handleConnection'da avtomatik join, join-siz global bildirishnoma)
  // boshqa modullar uchun ham qayta ishlatiladi — masalan ClassroomModule
  // "jonli dars boshlandi" bildirishnomasini shu orqali yuboradi.
  exports: [PracticeMessengerService, PracticeMessengerGateway],
})
export class PracticeMessengerModule {}
