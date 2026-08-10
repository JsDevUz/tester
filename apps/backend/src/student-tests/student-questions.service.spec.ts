import { StudentQuestionsService } from './student-questions.service';
import { db } from '../db';

jest.mock('../db', () => {
  const mockDb: any = {
    query: {
      tests: { findFirst: jest.fn() },
      questions: { findFirst: jest.fn(), findMany: jest.fn() },
    },
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return { db: mockDb };
});

describe('StudentQuestionsService', () => {
  const service = new StudentQuestionsService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects adding a question to a test not owned by the student', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(undefined);

    await expect(
      service.addQuestion('test-1', 'student-1', { text: 'Q?', type: 'single', options: [{ text: 'A', isCorrect: true }] }),
    ).rejects.toThrow('Test not found');
  });

  it('adds a question when the test is owned by the student', async () => {
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue({ id: 'test-1', adminId: 'student-1' });
    (db.query.questions.findMany as jest.Mock).mockResolvedValue([]);
    const questionReturning = jest.fn().mockResolvedValue([{ id: 'q-1', testId: 'test-1', text: 'Q?', type: 'single', orderIndex: 0 }]);
    const optionsReturning = jest.fn().mockResolvedValue([{ id: 'o-1', questionId: 'q-1', text: 'A', isCorrect: true, orderIndex: 0 }]);
    (db.insert as jest.Mock)
      .mockReturnValueOnce({ values: jest.fn(() => ({ returning: questionReturning })) })
      .mockReturnValueOnce({ values: jest.fn(() => ({ returning: optionsReturning })) });

    const question = await service.addQuestion('test-1', 'student-1', {
      text: 'Q?', type: 'single', options: [{ text: 'A', isCorrect: true }],
    });

    expect(question.id).toBe('q-1');
  });
});
