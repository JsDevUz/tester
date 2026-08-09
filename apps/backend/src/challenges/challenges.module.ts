import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { StudentChallengesController } from './student-challenges.controller';
import { ChallengesService } from './challenges.service';
import { StudentChallengesService } from './student-challenges.service';

@Module({
  controllers: [ChallengesController, StudentChallengesController],
  providers: [ChallengesService, StudentChallengesService],
})
export class ChallengesModule {}
