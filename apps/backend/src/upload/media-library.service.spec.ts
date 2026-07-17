import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaLibraryService, LIBRARY_MAX_FILE_COUNT, LIBRARY_MAX_TOTAL_BYTES } from './media-library.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    delete: jest.fn(() => ({ where: async () => {} })),
    update: jest.fn(() => ({ set: () => ({ where: async () => {} }) })),
    query: {
      mediaAssets: { findFirst: jest.fn(), findMany: jest.fn() },
    },
  },
}));

const mockedDb = db as any;

function mockUsageRow(totalBytes: number, fileCount: number) {
  mockedDb.select.mockReturnValue({
    from: () => ({
      where: async () => [{ totalBytes, fileCount }],
    }),
  });
}

function makeStorage() {
  return {
    getObjectBuffer: jest.fn(),
    uploadBuffer: jest.fn(),
    getPublicUrl: (k: string) => `https://cdn/${k}`,
    deleteFile: jest.fn().mockResolvedValue(true),
    deletePrefix: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSchools(schoolAdminId = 'school-admin-1') {
  return { resolveSchoolAdminIdForCaller: jest.fn().mockResolvedValue(schoolAdminId) };
}

afterEach(() => jest.clearAllMocks());

describe('assertCanAdd', () => {
  it('joy bolsa xato bermaydi', async () => {
    mockUsageRow(1000, 5);
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.assertCanAdd('school-admin-1', 500)).resolves.toBeUndefined();
  });

  it('fayl soni chegarasiga yetsa ConflictException', async () => {
    mockUsageRow(0, LIBRARY_MAX_FILE_COUNT);
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.assertCanAdd('school-admin-1', 100)).rejects.toThrow(ConflictException);
  });

  it('umumiy hajm chegarasiga yetsa ConflictException', async () => {
    mockUsageRow(LIBRARY_MAX_TOTAL_BYTES - 100, 1);
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.assertCanAdd('school-admin-1', 200)).rejects.toThrow(ConflictException);
  });
});

describe('getPdfPages', () => {
  it('tayyor PDF sahifalarini qaytaradi', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'school-admin-1', type: 'file',
      pdfPages: ['p1', 'p2'], pdfProcessingStatus: 'ready',
    });
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    const result = await service.getPdfPages('a1', 'teacher-1', 'teacher');
    expect(result).toEqual({ pages: ['p1', 'p2'], status: 'ready' });
  });

  it('boshqa maktabga tegishli faylni topilmadi deb qaytaradi', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'boshqa-maktab', type: 'file', pdfPages: [], pdfProcessingStatus: 'ready',
    });
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.getPdfPages('a1', 'teacher-1', 'teacher')).rejects.toThrow(NotFoundException);
  });

  it('PDF bolmagan fayl uchun xato', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'school-admin-1', type: 'image', pdfPages: null, pdfProcessingStatus: null,
    });
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.getPdfPages('a1', 'teacher-1', 'teacher')).rejects.toThrow();
  });
});

describe('deleteAsset', () => {
  it('S3 va DB dan ochiradi, PDF sahifalari prefiksini ham tozalaydi', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'school-admin-1', key: 'classroom-pdf-source/a1.pdf', pdfPages: ['p1', 'p2'],
    });
    const storage = makeStorage();
    const service = new MediaLibraryService(storage as any, makeSchools() as any);

    await service.deleteAsset('a1', 'teacher-1', 'teacher');

    expect(storage.deleteFile).toHaveBeenCalledWith('classroom-pdf-source/a1.pdf');
    expect(storage.deletePrefix).toHaveBeenCalledWith('classroom-pdf-pages/a1');
    expect(mockedDb.delete).toHaveBeenCalled();
  });

  it('PDF sahifasi bolmagan fayl uchun prefiks ochirilmaydi', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'school-admin-1', key: 'questions/img.png', pdfPages: null,
    });
    const storage = makeStorage();
    const service = new MediaLibraryService(storage as any, makeSchools() as any);

    await service.deleteAsset('a1', 'teacher-1', 'teacher');

    expect(storage.deletePrefix).not.toHaveBeenCalled();
  });

  it('begona maktab faylini ochira olmaydi', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue({
      id: 'a1', schoolAdminId: 'boshqa-maktab', key: 'x', pdfPages: null,
    });
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.deleteAsset('a1', 'teacher-1', 'teacher')).rejects.toThrow(ForbiddenException);
  });

  it('mavjud bolmagan fayl uchun NotFoundException', async () => {
    mockedDb.query.mediaAssets.findFirst.mockResolvedValue(undefined);
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    await expect(service.deleteAsset('a1', 'teacher-1', 'teacher')).rejects.toThrow(NotFoundException);
  });
});

describe('usageSummary', () => {
  it('joriy holat va chegaralarni qaytaradi', async () => {
    mockUsageRow(12345, 3);
    const service = new MediaLibraryService(makeStorage() as any, makeSchools() as any);
    const result = await service.usageSummary('teacher-1', 'teacher');
    expect(result).toEqual({
      totalBytes: 12345, fileCount: 3,
      maxTotalBytes: LIBRARY_MAX_TOTAL_BYTES, maxFileCount: LIBRARY_MAX_FILE_COUNT,
    });
  });
});
