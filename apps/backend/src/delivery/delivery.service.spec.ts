import { BadRequestException } from '@nestjs/common';
import {
  applyPracticeOverride,
  DeliveryService,
  evaluateObjectiveAnswer,
  normalizeSubmissionMode,
  orderSubmissionAnswersForDisplay,
  seededShuffle,
} from './delivery.service';
import { db } from '../db';

jest.mock('../db', () => ({
  db: {
    query: {
      tests: { findFirst: jest.fn() },
      submissions: { findFirst: jest.fn(), findMany: jest.fn() },
      testPins: { findFirst: jest.fn() },
      schoolMembers: { findMany: jest.fn() },
      groupEnrollments: { findMany: jest.fn() },
    },
    insert: jest.fn(),
  },
}));

describe('evaluateObjectiveAnswer', () => {
  it('does not mark unanswered single-choice questions as correct when no correct option is configured', () => {
    const result = evaluateObjectiveAnswer('single', [], []);

    expect(result).toBe(false);
  });

  it('does not mark unanswered multi-choice questions as correct when no correct options are configured', () => {
    const result = evaluateObjectiveAnswer('multi', [], []);

    expect(result).toBe(false);
  });

  it('does not mark unanswered arrange questions as correct when no correct order is configured', () => {
    const result = evaluateObjectiveAnswer('arrange', [], []);

    expect(result).toBe(false);
  });
});

describe('normalizeSubmissionMode', () => {
  it('keeps violation mode for prohibited-action submissions', () => {
    expect(normalizeSubmissionMode('violation')).toBe('violation');
  });

  it('falls back to normal for unknown modes', () => {
    expect(normalizeSubmissionMode('weird')).toBe('normal');
  });
});

describe('orderSubmissionAnswersForDisplay', () => {
  const questions = [
    { id: 'q1', orderIndex: 0 },
    { id: 'q2', orderIndex: 1 },
    { id: 'q3', orderIndex: 2 },
    { id: 'q4', orderIndex: 3 },
  ];
  const answers = [
    { questionId: 'q1' },
    { questionId: 'q2' },
    { questionId: 'q3' },
    { questionId: 'q4' },
  ];

  it('uses native question order when shuffle is disabled', () => {
    const shuffledRows = [answers[2], answers[0], answers[3], answers[1]];

    expect(orderSubmissionAnswersForDisplay(shuffledRows, questions, 'sid-1', false).map((a) => a.questionId))
      .toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('uses the same seeded order as the student saw when shuffle is enabled', () => {
    const expectedQuestionIds = seededShuffle(questions, 'sid-1').map((q) => q.id);

    expect(orderSubmissionAnswersForDisplay(answers, questions, 'sid-1', true).map((a) => a.questionId))
      .toEqual(expectedQuestionIds);
  });
});

describe('applyPracticeOverride', () => {
  it('returns the config unchanged when not in practice mode', () => {
    const config = { showResults: 'hidden', oneByOne: true, requireAuth: false, deadline: new Date('2026-01-01') };
    expect(applyPracticeOverride(config, false)).toEqual(config);
  });

  it('forces immediate results, all-at-once, required auth, and no deadline in practice mode', () => {
    const config = { showResults: 'hidden', oneByOne: true, requireAuth: false, deadline: new Date('2026-01-01') };
    expect(applyPracticeOverride(config, true)).toEqual({
      showResults: 'immediately',
      oneByOne: false,
      requireAuth: true,
      deadline: null,
    });
  });

  it('does not mutate the original config object', () => {
    const config = { showResults: 'per_question', oneByOne: true, requireAuth: false, deadline: null };
    const original = { ...config };
    applyPracticeOverride(config, true);
    expect(config).toEqual(original);
  });
});

describe('DeliveryService pin access control', () => {
  const service = new DeliveryService({} as any, {} as any);

  const baseTest = {
    id: 'test-1',
    slug: 'abc123',
    name: 'Test',
    description: null,
    timeLimit: null,
    showResults: 'immediately',
    shuffleQuestions: false,
    shuffleOptions: false,
    oneByOne: false,
    requireAuth: false,
    autoCompleteOnLeave: true,
    onceOnly: false,
    deadline: null,
    questions: [],
  };

  const activePin = {
    id: 'pin-1',
    testId: 'test-1',
    courseId: 'course-1',
    groupIds: [] as string[],
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60_000),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (db.query.tests.findFirst as jest.Mock).mockResolvedValue(baseTest);
    (db.query.submissions.findFirst as jest.Mock).mockResolvedValue(undefined);
    (db.query.submissions.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('getTestBySlug', () => {
    it('throws AUTH_REQUIRED when a pin is active and no userId is provided', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);

      await expect(service.getTestBySlug('abc123')).rejects.toMatchObject({
        message: 'AUTH_REQUIRED',
      });
      await expect(service.getTestBySlug('abc123')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NOT_ASSIGNED when a pin is active, a userId is provided, but there is no matching enrollment', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);
      (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { schoolMemberId: 'member-1', groupId: 'group-x', group: { courseId: 'course-other' } },
      ]);

      await expect(service.getTestBySlug('abc123', false, 'user-1')).rejects.toMatchObject({
        message: 'NOT_ASSIGNED',
      });
    });

    it('succeeds when a pin is active and the caller has a matching enrollment', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);
      (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { schoolMemberId: 'member-1', groupId: 'group-x', group: { courseId: 'course-1' } },
      ]);

      const result = await service.getTestBySlug('abc123', false, 'user-1');

      expect(result.id).toBe('test-1');
    });

    it('behaves exactly as before when there is no pin at all', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(undefined);

      const result = await service.getTestBySlug('abc123');

      expect(result.id).toBe('test-1');
      expect(db.query.schoolMembers.findMany).not.toHaveBeenCalled();
      expect(db.query.groupEnrollments.findMany).not.toHaveBeenCalled();
    });
  });

  describe('startSubmission', () => {
    beforeEach(() => {
      const returning = jest.fn().mockResolvedValue([{ id: 'submission-1' }]);
      const values = jest.fn(() => ({ returning }));
      (db.insert as jest.Mock).mockReturnValue({ values });
    });

    it('throws AUTH_REQUIRED when a pin is active and no userId is provided', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);

      await expect(service.startSubmission('abc123', 'Student')).rejects.toMatchObject({
        message: 'AUTH_REQUIRED',
      });
    });

    it('throws NOT_ASSIGNED when a pin is active, a userId is provided, but there is no matching enrollment', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);
      (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.startSubmission('abc123', 'Student', 'user-1')).rejects.toMatchObject({
        message: 'NOT_ASSIGNED',
      });
    });

    it('succeeds when a pin is active and the caller has a matching enrollment', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(activePin);
      (db.query.schoolMembers.findMany as jest.Mock).mockResolvedValue([{ id: 'member-1' }]);
      (db.query.groupEnrollments.findMany as jest.Mock).mockResolvedValue([
        { schoolMemberId: 'member-1', groupId: 'group-x', group: { courseId: 'course-1' } },
      ]);

      const result = await service.startSubmission('abc123', 'Student', 'user-1');

      expect(result.submissionId).toBe('submission-1');
    });

    it('behaves exactly as before when there is no pin at all', async () => {
      (db.query.testPins.findFirst as jest.Mock).mockResolvedValue(undefined);

      const result = await service.startSubmission('abc123', 'Student');

      expect(result.submissionId).toBe('submission-1');
      expect(db.query.schoolMembers.findMany).not.toHaveBeenCalled();
    });
  });
});
