import { Module } from '@nestjs/common';
import { WordDecksController } from './word-decks.controller';
import { DeckViewController } from './deck-view.controller';
import { WordDecksService } from './word-decks.service';

@Module({
  controllers: [WordDecksController, DeckViewController],
  providers: [WordDecksService],
})
export class WordDecksModule {}
