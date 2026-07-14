import { Module } from '@nestjs/common';
import { PracticeMessengerController } from './practice-messenger.controller';
import { PracticeMessengerService } from './practice-messenger.service';

@Module({
  controllers: [PracticeMessengerController],
  providers: [PracticeMessengerService],
  exports: [PracticeMessengerService],
})
export class PracticeMessengerModule {}
