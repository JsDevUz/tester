import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../db';
import { ContentBlocksService } from './content-blocks.service';
import { StorageService } from '../storage/storage.service';

jest.mock('../db', () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: async () => [{ id: 'block-1', type: 'live_class', classSessionId: 'cs-1' }],
      })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ returning: async () => [{}] })) })) })),
    query: {
      lessons: { findFirst: jest.fn() },
      modules: { findFirst: jest.fn() },
      courses: { findFirst: jest.fn() },
      classSessions: { findFirst: jest.fn() },
      contentBlocks: { findMany: jest.fn().mockResolvedValue([]) },
    },
  },
}));

const mockedDb = db as any;

describe('ContentBlocksService.createLiveClassBlock', () => {
  let service: ContentBlocksService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.query.contentBlocks.findMany.mockResolvedValue([]);
    service = new ContentBlocksService({} as StorageService);

    mockedDb.query.lessons.findFirst.mockResolvedValue({ id: 'lesson-1', moduleId: 'module-1' });
    mockedDb.query.modules.findFirst.mockResolvedValue({ id: 'module-1', courseId: 'course-1' });
    mockedDb.query.courses.findFirst.mockResolvedValue({ id: 'course-1', adminId: 'teacher-1' });
  });

  it('createLiveClassBlock kursga tegishli bolmagan class session uchun rad etadi', async () => {
    mockedDb.query.classSessions.findFirst.mockResolvedValue({
      id: 'cs-1',
      courseId: 'other-course',
      status: 'ended',
    });

    await expect(
      service.createLiveClassBlock('lesson-1', 'teacher-1', 'cs-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('createLiveClassBlock sessiya topilmasa rad etadi', async () => {
    mockedDb.query.classSessions.findFirst.mockResolvedValue(undefined);

    await expect(
      service.createLiveClassBlock('lesson-1', 'teacher-1', 'missing-session'),
    ).rejects.toThrow(BadRequestException);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('createLiveClassBlock hali tugamagan (active) session uchun rad etadi', async () => {
    mockedDb.query.classSessions.findFirst.mockResolvedValue({
      id: 'cs-1',
      courseId: 'course-1',
      status: 'active',
    });

    await expect(
      service.createLiveClassBlock('lesson-1', 'teacher-1', 'cs-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('createLiveClassBlock togri classSessionId bilan type=live_class blok yaratadi', async () => {
    mockedDb.query.classSessions.findFirst.mockResolvedValue({
      id: 'cs-1',
      courseId: 'course-1',
      status: 'ended',
    });

    const valuesMock = jest.fn(() => ({
      returning: async () => [{ id: 'block-1', type: 'live_class', classSessionId: 'cs-1', lessonId: 'lesson-1' }],
    }));
    mockedDb.insert.mockReturnValue({ values: valuesMock });

    const result = await service.createLiveClassBlock('lesson-1', 'teacher-1', 'cs-1');

    expect(mockedDb.insert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
        type: 'live_class',
        classSessionId: 'cs-1',
      }),
    );
    expect(result).toEqual({ id: 'block-1', type: 'live_class', classSessionId: 'cs-1', lessonId: 'lesson-1' });
  });
});
