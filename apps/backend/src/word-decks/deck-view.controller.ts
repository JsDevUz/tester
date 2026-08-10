import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WordDecksService } from './word-decks.service';

@UseGuards(JwtAuthGuard)
@Controller('decks')
export class DeckViewController {
  constructor(private readonly wordDecksService: WordDecksService) {}

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.wordDecksService.findBySlug(slug);
  }
}
