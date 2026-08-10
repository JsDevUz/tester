import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { StudentChallengesController } from './student-challenges.controller';
import { ChallengesService } from './challenges.service';
import { StudentChallengesService } from './student-challenges.service';
import { ChallengeWordsController } from './challenge-words.controller';
import { ChallengeWordsService } from './challenge-words.service';
import { StudentChallengeWordsController } from './student-challenge-words.controller';
import { StudentChallengeWordsService } from './student-challenge-words.service';

@Module({
  controllers: [ChallengesController, StudentChallengesController, ChallengeWordsController, StudentChallengeWordsController],
  providers: [ChallengesService, StudentChallengesService, ChallengeWordsService, StudentChallengeWordsService],
})
export class ChallengesModule {}
