import {
  Controller, Post, UseInterceptors, UploadedFile, Body,
  BadRequestException, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from '../storage/storage.service';

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_FOLDERS = ['lessons', 'questions', 'payments', 'practice-submissions'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('upload')
export class UploadController {
  constructor(private storageService: StorageService) {}

  @Post()
  @Roles('teacher', 'super', 'student')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if ([...ALLOWED_IMAGE, ...ALLOWED_AUDIO].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Faqat rasm yoki audio fayllar qabul qilinadi'), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('folder') folder?: string) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const targetFolder = ALLOWED_FOLDERS.includes(folder || '') ? (folder as string) : 'questions';
    const ext = extname(file.originalname).toLowerCase();
    const type = ALLOWED_IMAGE.includes(ext) ? 'image' : 'audio';
    const url = await this.storageService.uploadFile(file, targetFolder);
    return { url, type };
  }
}
