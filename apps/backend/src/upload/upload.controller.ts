import {
  Controller, Post, UseInterceptors, UploadedFile,
  BadRequestException, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const ext = extname(file.originalname).toLowerCase();
    const type = ALLOWED_IMAGE.includes(ext) ? 'image' : 'audio';
    return { url: `/uploads/${file.filename}`, type };
  }
}
