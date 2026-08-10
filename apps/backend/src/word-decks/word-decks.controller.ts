import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { WordDecksService } from './word-decks.service';

class CreateDeckDto {
  @IsString() @MinLength(1) name: string;
}

class UpdateDeckDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
}

class AddWordDto {
  @IsString() @MinLength(1) word: string;
  @IsString() @MinLength(1) translation: string;
}

class UpdateWordDto {
  @IsOptional() @IsString() @MinLength(1) word?: string;
  @IsOptional() @IsString() @MinLength(1) translation?: string;
}

class BulkImportDto {
  @IsString() @MaxLength(100_000) text: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('student')
@Controller('me/word-decks')
export class WordDecksController {
  constructor(private readonly wordDecksService: WordDecksService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.wordDecksService.findAll(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateDeckDto) {
    return this.wordDecksService.create(req.user.id, dto.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateDeckDto) {
    return this.wordDecksService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.wordDecksService.remove(id, req.user.id);
  }

  @Get(':id/words')
  listWords(@Param('id') id: string, @Req() req: any) {
    return this.wordDecksService.listWords(id, req.user.id);
  }

  @Post(':id/words')
  addWord(@Param('id') id: string, @Req() req: any, @Body() dto: AddWordDto) {
    return this.wordDecksService.addWord(id, req.user.id, dto);
  }

  @Post(':id/words/bulk')
  bulkImport(@Param('id') id: string, @Req() req: any, @Body() dto: BulkImportDto) {
    return this.wordDecksService.bulkImport(id, req.user.id, dto.text);
  }

  @Patch(':id/words/:wordId')
  updateWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any, @Body() dto: UpdateWordDto) {
    return this.wordDecksService.updateWord(id, wordId, req.user.id, dto);
  }

  @Delete(':id/words/:wordId')
  @HttpCode(204)
  removeWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any) {
    return this.wordDecksService.removeWord(id, wordId, req.user.id);
  }
}
