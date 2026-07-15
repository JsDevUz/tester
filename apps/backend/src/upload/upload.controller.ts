import {
  Controller, Post, Get, UseInterceptors, UploadedFile, Body, Query,
  BadRequestException, UseGuards, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StorageService } from '../storage/storage.service';
import { SchoolsService } from '../schools/schools.service';
import { db } from '../db';
import { mediaAssets } from '../db/schema';
import { and, desc, eq } from 'drizzle-orm';

const ALLOWED_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a'];
const ALLOWED_FILE = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.txt'];
const ALLOWED_FOLDERS = ['lessons', 'questions', 'payments', 'practice-submissions'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MEDIA_TYPES = ['image', 'audio', 'file'];

function resolveType(ext: string): 'image' | 'audio' | 'file' {
  if (ALLOWED_IMAGE.includes(ext)) return 'image';
  if (ALLOWED_AUDIO.includes(ext)) return 'audio';
  return 'file';
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('upload')
export class UploadController {
  constructor(
    private storageService: StorageService,
    private schoolsService: SchoolsService,
  ) {}

  @Post()
  @Roles('teacher', 'super', 'curator', 'student')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if ([...ALLOWED_IMAGE, ...ALLOWED_AUDIO, ...ALLOWED_FILE].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Ushbu fayl turi qabul qilinmaydi'), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: any, @Body('folder') folder?: string) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const targetFolder = ALLOWED_FOLDERS.includes(folder || '') ? (folder as string) : 'questions';
    const ext = extname(file.originalname).toLowerCase();
    const type = resolveType(ext);
    const uploaded = await this.storageService.uploadFile(file, targetFolder);

    // The receipt/practice-submission uploaders are students and have no
    // school of their own to resolve a library entry against — skip
    // library tracking for those callers, they only ever upload one-off
    // files that don't belong in a reusable library anyway.
    if (req.admin.role === 'teacher' || req.admin.role === 'super' || req.admin.role === 'curator') {
      const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
      await db.insert(mediaAssets).values({
        schoolAdminId,
        uploaderId: req.admin.id,
        url: uploaded,
        key: this.storageService.getKeyFromUrlOrKey(uploaded),
        type,
        originalName: file.originalname,
        folder: targetFolder,
      });
    }

    return { url: uploaded, type };
  }

  @Get('library')
  @Roles('teacher', 'super', 'curator')
  async listLibrary(@Req() req: any, @Query('type') type?: string) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    const normalizedType = MEDIA_TYPES.includes(type || '') ? type : undefined;
    const assets = await db.query.mediaAssets.findMany({
      where: normalizedType
        ? and(eq(mediaAssets.schoolAdminId, schoolAdminId), eq(mediaAssets.type, normalizedType))
        : eq(mediaAssets.schoolAdminId, schoolAdminId),
      orderBy: [desc(mediaAssets.createdAt)],
      limit: 100,
      with: { uploader: true },
    });
    return assets.map((asset) => ({
      id: asset.id,
      url: asset.url,
      type: asset.type,
      originalName: asset.originalName,
      uploaderName: (asset.uploader as unknown as { name: string }).name,
      createdAt: asset.createdAt!.toISOString(),
    }));
  }
}
