import { StudentTestsService } from './student-tests.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      tests: { findMany: jest.fn(), findFirst: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentTestsService', () => {
  const service = new StudentTestsService();

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);
  });

  it('forces requireAuth=true, onceOnly=false, deadline=undefined on create regardless of caller intent', async () => {
    const returning = jest.fn().mockResolvedValue([{ id: 'test-1', adminId: 'student-1', requireAuth: true, onceOnly: false, deadline: null }]);
    const values = jest.fn(() => ({ returning }));
    (db.insert as jest.Mock).mockReturnValue({ values });

    await service.create('student-1', { folderId: 'folder-1', name: 'Mening testim' });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'student-1',
      requireAuth: true,
      onceOnly: false,
      deadline: undefined,
    }));
  });

  it('throws NotFoundException when updating a test not owned by the student', async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    (db.update as jest.Mock).mockReturnValue({ set });

    await expect(service.update('test-1', 'student-1', { name: 'X' })).rejects.toThrow('Test not found');
  });
});
