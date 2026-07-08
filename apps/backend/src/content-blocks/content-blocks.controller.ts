import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { ContentBlocksService } from './content-blocks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

class CreateBlockDto {
  @IsIn(['editor']) type: string;
}

class UpdateBlockDto {
  @IsOptional() @IsString() html?: string;
  @IsOptional() @IsString() @MinLength(0) label?: string;
  @IsOptional() @IsString() embedUrl?: string;
}

class ReorderBlocksDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blockIds: string[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'super')
@Controller()
export class ContentBlocksController {
  constructor(private contentBlocksService: ContentBlocksService) {}

  @Get('lessons/:lessonId/blocks')
  findAll(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.contentBlocksService.findAll(lessonId, req.admin.id);
  }

  @Post('lessons/:lessonId/blocks')
  create(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: CreateBlockDto) {
    return this.contentBlocksService.create(lessonId, req.admin.id, dto.type);
  }

  @Patch('blocks/:id')
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateBlockDto) {
    return this.contentBlocksService.update(id, req.admin.id, dto);
  }

  @Delete('blocks/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.contentBlocksService.remove(id, req.admin.id);
  }

  @Post('lessons/:lessonId/blocks/reorder')
  @HttpCode(204)
  reorder(@Param('lessonId') lessonId: string, @Req() req: any, @Body() dto: ReorderBlocksDto) {
    return this.contentBlocksService.reorder(lessonId, req.admin.id, dto.blockIds);
  }
}
