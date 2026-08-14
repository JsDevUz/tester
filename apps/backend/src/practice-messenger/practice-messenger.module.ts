import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PracticeMessengerController } from './practice-messenger.controller';
import { PracticeMessengerGateway } from './practice-messenger.gateway';
import { PracticeMessengerService } from './practice-messenger.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PracticeMessengerController],
  providers: [PracticeMessengerService, PracticeMessengerGateway],
  // PracticeMessengerGateway'ning user:<userId> xona-infratuzilmasi
  // (handleConnection'da avtomatik join, join-siz global bildirishnoma)
  // boshqa modullar uchun ham qayta ishlatiladi — masalan ClassroomModule
  // "jonli dars boshlandi" bildirishnomasini shu orqali yuboradi.
  exports: [PracticeMessengerService, PracticeMessengerGateway],
})
export class PracticeMessengerModule {}
