import { StudentFoldersService } from './student-folders.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      folders: { findMany: jest.fn(), findFirst: jest.fn() },
      tests: { findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentFoldersService', () => {
  const service = new StudentFoldersService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a folder owned by the given student id', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'folder-1', adminId: 'student-1', name: 'Fizika', color: '#6366f1', icon: 'folder' }]);
    const values = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });

    const folder = await service.create('student-1', 'Fizika');

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'student-1', name: 'Fizika' }));
    expect(folder.id).toBe('folder-1');
  });

  it('does not return a folder owned by a different user on update', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });

    await expect(service.update('folder-1', 'student-1', { name: 'Yangi nom' })).rejects.toThrow('Folder not found');
  });
});
