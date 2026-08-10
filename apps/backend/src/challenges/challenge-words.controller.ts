import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ChallengeWordsService } from './challenge-words.service';

class AddWordDto {
  @IsString() @MinLength(1) word: string;
  @IsString() @MinLength(1) translation: string;
}

class UpdateWordDto {
  @IsOptional() @IsString() @MinLength(1) word?: string;
  @IsOptional() @IsString() @MinLength(1) translation?: string;
}

class BulkImportDto {
  @IsString() text: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller('challenges/:id/words')
export class ChallengeWordsController {
  constructor(private readonly challengeWordsService: ChallengeWordsService) {}

  @Get()
  list(@Param('id') id: string, @Req() req: any) {
    return this.challengeWordsService.list(id, req.admin.id);
  }

  @Post()
  addWord(@Param('id') id: string, @Req() req: any, @Body() dto: AddWordDto) {
    return this.challengeWordsService.addWord(id, req.admin.id, dto);
  }

  @Post('bulk')
  bulkImport(@Param('id') id: string, @Req() req: any, @Body() dto: BulkImportDto) {
    return this.challengeWordsService.bulkImport(id, req.admin.id, dto.text);
  }

  @Patch(':wordId')
  updateWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any, @Body() dto: UpdateWordDto) {
    return this.challengeWordsService.updateWord(id, wordId, req.admin.id, dto);
  }

  @Delete(':wordId')
  @HttpCode(204)
  removeWord(@Param('id') id: string, @Param('wordId') wordId: string, @Req() req: any) {
    return this.challengeWordsService.removeWord(id, wordId, req.admin.id);
  }
}
