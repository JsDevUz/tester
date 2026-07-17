import {
  BadRequestException, Controller, Delete, Get, Param, ParseUUIDPipe, Post,
  Req, UploadedFile, UseGuards, UseInterceptors,
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
import { MediaLibraryService } from './media-library.service';

// Umumiy media-kutubxonadan ataylab ajratilgan: jonli darsda kerak bo'lgan
// narsa PDF faylning o'zi emas, uning sahifalarga aylantirilgan rasmlari —
// shu sababli alohida (kattaroq hajm limitli, avto-konvertatsiyali) yo'l.
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('classroom/pdf-library')
export class ClassroomPdfLibraryController {
  constructor(
    private readonly storage: StorageService,
    private readonly schoolsService: SchoolsService,
    private readonly mediaLibraryService: MediaLibraryService,
  ) {}

  @Get()
  @Roles('teacher', 'super', 'curator')
  async list(@Req() req: any) {
    return this.mediaLibraryService.listLibrary(req.admin.id, req.admin.role, 'file');
  }

  @Get('usage')
  @Roles('teacher', 'super', 'curator')
  async usage(@Req() req: any) {
    return this.mediaLibraryService.usageSummary(req.admin.id, req.admin.role);
  }

  @Get(':assetId/pages')
  @Roles('teacher', 'super', 'curator')
  async pages(@Param('assetId', ParseUUIDPipe) assetId: string, @Req() req: any) {
    return this.mediaLibraryService.getPdfPages(assetId, req.admin.id, req.admin.role);
  }

  @Post()
  @Roles('teacher', 'super')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PDF_SIZE },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
        else cb(new BadRequestException('Faqat PDF fayl qabul qilinadi'), false);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Fayl topilmadi');
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(req.admin.id, req.admin.role);
    await this.mediaLibraryService.assertCanAdd(schoolAdminId, file.size);

    const key = `classroom-pdf-source/${crypto.randomUUID()}.pdf`;
    await this.storage.uploadBuffer(key, file.buffer, 'application/pdf', 'private, max-age=0, no-store');
    const url = this.storage.getPublicUrl(key);

    const [asset] = await db.insert(mediaAssets).values({
      schoolAdminId,
      uploaderId: req.admin.id,
      url,
      key,
      type: 'file',
      originalName: file.originalname,
      folder: 'classroom-pdf',
      sizeBytes: file.size,
      pdfProcessingStatus: 'pending',
    }).returning();

    // Konvertatsiya orqa fonda — upload so'rovi darhol qaytadi, frontend
    // pollingCli/socket bilan pdfProcessingStatus='ready' bo'lishini kutadi.
    setImmediate(() => {
      void this.mediaLibraryService.processPdfPages(asset.id);
    });

    return { id: asset.id, originalName: asset.originalName, pdfProcessingStatus: asset.pdfProcessingStatus };
  }

  @Post(':assetId/retry')
  @Roles('teacher', 'super')
  async retry(@Param('assetId', ParseUUIDPipe) assetId: string) {
    setImmediate(() => {
      void this.mediaLibraryService.processPdfPages(assetId);
    });
    return { ok: true };
  }

  @Delete(':assetId')
  @Roles('teacher', 'super')
  async remove(@Param('assetId', ParseUUIDPipe) assetId: string, @Req() req: any) {
    await this.mediaLibraryService.deleteAsset(assetId, req.admin.id, req.admin.role);
    return { ok: true };
  }
}
