import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { mediaAssets } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { SchoolsService } from '../schools/schools.service';
import { convertPdfToPageImages, PdfConversionError } from '../classroom/pdf-converter';

// Maktab kutubxonasi uchun umumiy chegara — bitta faylning hajmi emas,
// butun kutubxonaning yig'indisi. Shu ikkalasidan biriga yetilsa yangi
// yuklash rad etiladi, eski fayllarni o'chirish so'raladi.
export const LIBRARY_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const LIBRARY_MAX_FILE_COUNT = 40;

@Injectable()
export class MediaLibraryService {
  constructor(
    private readonly storage: StorageService,
    private readonly schoolsService: SchoolsService,
  ) {}

  private async usage(schoolAdminId: string): Promise<{ totalBytes: number; fileCount: number }> {
    const [row] = await db
      .select({
        totalBytes: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
        fileCount: sql<number>`count(*)`,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.schoolAdminId, schoolAdminId));
    return { totalBytes: Number(row?.totalBytes ?? 0), fileCount: Number(row?.fileCount ?? 0) };
  }

  // Yangi fayl kutubxonaga sig'ishini oldindan tekshiradi. Sig'masa, chaqiruvchi
  // (controller) foydalanuvchiga "eski fayllarni o'chiring" deb ko'rsatishi uchun
  // ConflictException + joriy holatni otadi.
  async assertCanAdd(schoolAdminId: string, incomingBytes: number): Promise<void> {
    const { totalBytes, fileCount } = await this.usage(schoolAdminId);
    if (fileCount + 1 > LIBRARY_MAX_FILE_COUNT) {
      throw new ConflictException({
        code: 'LIBRARY_FILE_LIMIT',
        message: `Kutubxonada eng ko'pi bilan ${LIBRARY_MAX_FILE_COUNT} ta fayl bo'lishi mumkin. Yangi fayl qo'shishdan oldin eskilarini o'chiring.`,
      });
    }
    if (totalBytes + incomingBytes > LIBRARY_MAX_TOTAL_BYTES) {
      throw new ConflictException({
        code: 'LIBRARY_SIZE_LIMIT',
        message: "Kutubxona hajmi 500 MB chegarasiga yetdi. Yangi fayl qo'shishdan oldin eskilarini o'chiring.",
      });
    }
  }

  // PDF kutubxonaga tushgandan keyin sahifalarini bir marta WebP'ga
  // aylantirib keshlaydi — jonli darsga qo'shishda qayta konvertatsiya
  // qilinmaydi. Xato bo'lsa asset 'failed' holatida qoladi, qayta urinish
  // uchun shu funksiya alohida chaqirilishi mumkin.
  async processPdfPages(assetId: string): Promise<void> {
    const asset = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, assetId) });
    if (!asset || asset.type !== 'file') return;

    await db.update(mediaAssets).set({ pdfProcessingStatus: 'processing' }).where(eq(mediaAssets.id, assetId));
    try {
      const buffer = await this.storage.getObjectBuffer(asset.key);
      const images = await convertPdfToPageImages(buffer);
      const prefix = `classroom-pdf-pages/${assetId}`;
      const pages: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const key = `${prefix}/page-${i + 1}.webp`;
        await this.storage.uploadBuffer(key, images[i], 'image/webp', 'public, max-age=31536000, immutable');
        pages.push(this.storage.getPublicUrl(key));
      }
      await db.update(mediaAssets)
        .set({ pdfPages: pages, pdfProcessingStatus: 'ready' })
        .where(eq(mediaAssets.id, assetId));
    } catch (e) {
      const code = e instanceof PdfConversionError ? e.message : 'UNKNOWN';
      await db.update(mediaAssets)
        .set({ pdfProcessingStatus: `failed:${code}` })
        .where(eq(mediaAssets.id, assetId));
    }
  }

  async listLibrary(callerId: string, callerRole: string, type?: string) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(callerId, callerRole);
    const normalizedType = ['image', 'audio', 'file'].includes(type ?? '') ? type : undefined;
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
      uploaderName: (asset.uploader as unknown as { displayName: string }).displayName,
      sizeBytes: asset.sizeBytes,
      pdfPageCount: Array.isArray(asset.pdfPages) ? (asset.pdfPages as string[]).length : null,
      pdfProcessingStatus: asset.pdfProcessingStatus,
      createdAt: asset.createdAt!.toISOString(),
    }));
  }

  async getPdfPages(assetId: string, callerId: string, callerRole: string): Promise<{ pages: string[]; status: string | null }> {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(callerId, callerRole);
    const asset = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, assetId) });
    if (!asset || asset.schoolAdminId !== schoolAdminId) throw new NotFoundException('Fayl topilmadi');
    if (asset.type !== 'file') throw new BadRequestException('Bu fayl PDF emas');
    return { pages: Array.isArray(asset.pdfPages) ? (asset.pdfPages as string[]) : [], status: asset.pdfProcessingStatus };
  }

  async usageSummary(callerId: string, callerRole: string) {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(callerId, callerRole);
    const { totalBytes, fileCount } = await this.usage(schoolAdminId);
    return {
      totalBytes, fileCount,
      maxTotalBytes: LIBRARY_MAX_TOTAL_BYTES, maxFileCount: LIBRARY_MAX_FILE_COUNT,
    };
  }

  async deleteAsset(assetId: string, callerId: string, callerRole: string): Promise<void> {
    const schoolAdminId = await this.schoolsService.resolveSchoolAdminIdForCaller(callerId, callerRole);
    const asset = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, assetId) });
    if (!asset) throw new NotFoundException('Fayl topilmadi');
    if (asset.schoolAdminId !== schoolAdminId) throw new ForbiddenException('Bu fayl sizga tegishli emas');

    await this.storage.deleteFile(asset.key);
    if (Array.isArray(asset.pdfPages) && asset.pdfPages.length > 0) {
      await this.storage.deletePrefix(`classroom-pdf-pages/${assetId}`);
    }
    await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
  }
}
