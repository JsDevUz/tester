import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ContentBlocksService } from './content-blocks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

class CreateBlockDto {
  @IsIn(['editor']) type: string;
}

class UpdateBlockDto {
  @IsOptional() @IsString() html?: string;
  @IsOptional() @IsString() @MinLength(0) label?: string;
  @IsOptional() @IsString() embedUrl?: string;
  @IsOptional() @IsString() buttonUrl?: string;
  @IsOptional() @IsString() buttonColor?: string;
  @IsOptional() @IsString() buttonTextColor?: string;
  @IsOptional() @IsBoolean() openInNewTab?: boolean;
}

class UpdateMessageLineDto {
  @IsString() @MinLength(0) text: string;
}

class ReorderMessageLinesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) lineIds: string[];
}

class ReorderBlocksDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) blockIds: string[];
}

class CreateFileBlockFromLibraryDto {
  @IsString() @MinLength(1) url: string;
  @IsString() @MinLength(1) fileName: string;
}

class CreateLiveClassBlockDto {
  @IsString() @MinLength(1) classSessionId: string;
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

  @Post('lessons/:lessonId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (DOCUMENT_EXTENSIONS.includes(ext)) cb(null, true);
        else cb(new BadRequestException('Faqat PDF, Word, PowerPoint yoki Excel fayllar qabul qilinadi'), false);
      },
    }),
  )
  uploadFileBlock(
    @Param('lessonId') lessonId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('label') label: string | undefined,
    @Req() req: any,
  ) {
    return this.contentBlocksService.uploadFileBlock(lessonId, req.admin.id, file, label);
  }

  @Post('lessons/:lessonId/files/from-library')
  createFileBlockFromLibrary(
    @Param('lessonId') lessonId: string,
    @Req() req: any,
    @Body() dto: CreateFileBlockFromLibraryDto,
  ) {
    return this.contentBlocksService.createFileBlockFromLibrary(lessonId, req.admin.id, dto.url, dto.fileName);
  }

  @Post('lessons/:lessonId/blocks/live-class')
  createLiveClassBlock(
    @Param('lessonId') lessonId: string,
    @Req() req: any,
    @Body() dto: CreateLiveClassBlockDto,
  ) {
    return this.contentBlocksService.createLiveClassBlock(lessonId, req.admin.id, dto.classSessionId);
  }

  @Post('lessons/:lessonId/blocks/button')
  createButtonBlock(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.contentBlocksService.createButtonBlock(lessonId, req.admin.id);
  }

  @Post('lessons/:lessonId/blocks/message')
  createMessageBlock(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.contentBlocksService.createMessageBlock(lessonId, req.admin.id);
  }

  @Post('blocks/:blockId/message-lines')
  addMessageLine(@Param('blockId') blockId: string, @Req() req: any) {
    return this.contentBlocksService.addMessageLine(blockId, req.admin.id);
  }

  @Patch('message-lines/:id')
  updateMessageLine(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateMessageLineDto) {
    return this.contentBlocksService.updateMessageLine(id, req.admin.id, dto.text);
  }

  @Delete('message-lines/:id')
  @HttpCode(204)
  removeMessageLine(@Param('id') id: string, @Req() req: any) {
    return this.contentBlocksService.removeMessageLine(id, req.admin.id);
  }

  @Post('blocks/:blockId/message-lines/reorder')
  @HttpCode(204)
  reorderMessageLines(@Param('blockId') blockId: string, @Req() req: any, @Body() dto: ReorderMessageLinesDto) {
    return this.contentBlocksService.reorderMessageLines(blockId, req.admin.id, dto.lineIds);
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
