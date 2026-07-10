import {
  applyPracticeOverride,
  evaluateObjectiveAnswer,
  normalizeSubmissionMode,
  orderSubmissionAnswersForDisplay,
  seededShuffle,
} from './delivery.service';

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
