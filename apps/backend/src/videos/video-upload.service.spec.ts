import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VideoUploadService } from './video-upload.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    query: {
      lessons: { findFirst: jest.fn() },
      modules: { findFirst: jest.fn() },
      courses: { findFirst: jest.fn() },
      contentBlocks: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedDb = db as any;

function setupOwnership() {
  mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'mod-1' });
  mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'mod-1', courseId: 'course-1' });
  mockedDb.query.courses.findFirst.mockResolvedValue({ id: 'course-1', adminId: 'teacher-1' });
  mockedDb.query.contentBlocks.findMany.mockResolvedValue([]);
}

function makeStorage() {
  return {
    createPresignedUploadUrl: jest.fn().mockResolvedValue('https://signed.example/put'),
    headObject: jest.fn(),
    uploadBuffer: jest.fn(),
  };
}

function makeJobService() {
  return { enqueue: jest.fn() };
}

describe('VideoUploadService.initiateUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('yaratadi va presigned URL qaytaradi', async () => {
    setupOwnership();
    mockedDb.insert.mockReturnValue({
      values: () => ({ returning: async () => [{ id: 'block-1' }] }),
    });
    mockedDb.update.mockReturnValue({ set: () => ({ where: async () => {} }) });
    const storage = makeStorage();
    const service = new VideoUploadService(storage as any, makeJobService() as any);

    const result = await service.initiateUpload('lesson-1', 'teacher-1', 'dars.mp4', 'video/mp4');

    expect(result.blockId).toBe('block-1');
    expect(result.uploadUrl).toBe('https://signed.example/put');
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining('videos/lesson-1/block-1/source/'),
      'video/mp4',
    );
  });

  it('boshqa ustozning darsiga yuklashga ruxsat bermaydi', async () => {
    mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'mod-1' });
    mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'mod-1', courseId: 'course-1' });
    mockedDb.query.courses.findFirst.mockResolvedValue(undefined); // begona teacher uchun topilmaydi
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);

    await expect(
      service.initiateUpload('lesson-1', 'begona-teacher', 'dars.mp4', 'video/mp4'),
    ).rejects.toThrow(NotFoundException);
  });

  it('video bolmagan mime turini rad etadi', async () => {
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    await expect(
      service.initiateUpload('lesson-1', 'teacher-1', 'hujjat.pdf', 'application/pdf'),
    ).rejects.toThrow(BadRequestException);
  });

  it('blok limitidan oshsa rad etadi', async () => {
    setupOwnership();
    mockedDb.query.contentBlocks.findMany.mockResolvedValue(Array(7).fill({}));
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    await expect(
      service.initiateUpload('lesson-1', 'teacher-1', 'dars.mp4', 'video/mp4'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('VideoUploadService.completeUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('S3da fayl mavjud bolsa jobni ishga tushiradi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', sourceKey: 'videos/l1/block-1/source/x.mp4', lessonId: 'lesson-1',
    });
    setupOwnership();
    mockedDb.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [{ id: 'block-1', processingStatus: 'pending' }] }) }),
    });
    const storage = makeStorage();
    storage.headObject.mockResolvedValue({ sizeBytes: 1024, contentType: 'video/mp4' });
    const jobService = makeJobService();
    const service = new VideoUploadService(storage as any, jobService as any);

    const result = await service.completeUpload('block-1', 'teacher-1');

    expect(result.processingStatus).toBe('pending');
    expect(jobService.enqueue).toHaveBeenCalledWith('block-1');
  });

  it('S3da fayl topilmasa rad etadi va jobni ishga tushirmaydi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', sourceKey: 'videos/l1/block-1/source/x.mp4', lessonId: 'lesson-1',
    });
    setupOwnership();
    const storage = makeStorage();
    storage.headObject.mockResolvedValue(null);
    const jobService = makeJobService();
    const service = new VideoUploadService(storage as any, jobService as any);

    await expect(service.completeUpload('block-1', 'teacher-1')).rejects.toThrow(BadRequestException);
    expect(jobService.enqueue).not.toHaveBeenCalled();
  });

  it('500MB dan katta faylni rad etadi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', sourceKey: 'videos/l1/block-1/source/x.mp4', lessonId: 'lesson-1',
    });
    setupOwnership();
    const storage = makeStorage();
    storage.headObject.mockResolvedValue({ sizeBytes: 600 * 1024 * 1024, contentType: 'video/mp4' });
    const jobService = makeJobService();
    const service = new VideoUploadService(storage as any, jobService as any);

    await expect(service.completeUpload('block-1', 'teacher-1')).rejects.toThrow(BadRequestException);
    expect(jobService.enqueue).not.toHaveBeenCalled();
  });

  it('begona ustoz uchun taqiqlanadi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({
      id: 'block-1', type: 'video', sourceKey: 'videos/l1/block-1/source/x.mp4', lessonId: 'lesson-1',
    });
    mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'mod-1' });
    mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'mod-1', courseId: 'course-1' });
    mockedDb.query.courses.findFirst.mockResolvedValue(undefined);
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);

    await expect(service.completeUpload('block-1', 'begona-teacher')).rejects.toThrow(NotFoundException);
  });

  it('video bolmagan blok uchun topilmadi xatosi', async () => {
    mockedDb.query.contentBlocks.findFirst.mockResolvedValue({ id: 'block-1', type: 'editor', sourceKey: null });
    const service = new VideoUploadService(makeStorage() as any, makeJobService() as any);
    await expect(service.completeUpload('block-1', 'teacher-1')).rejects.toThrow(NotFoundException);
  });
});
