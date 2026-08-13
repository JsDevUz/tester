import {computeMaxUnlockedIndex, isLessonPassing, computeCourseStars} from '../src/lib/lessons';

describe('computeMaxUnlockedIndex', () => {
  it('unlocks only the first lesson when nothing is completed', () => {
    expect(computeMaxUnlockedIndex([{completed: false}, {completed: false}])).toBe(0);
  });

  it('unlocks up to one past the last consecutive completed lesson', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: true}, {completed: false}]),
    ).toBe(2);
  });

  it('stops at the first incomplete lesson even if later ones are complete', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: false}, {completed: true}]),
    ).toBe(1);
  });

  it('returns -1 for an empty lesson list', () => {
    expect(computeMaxUnlockedIndex([])).toBe(-1);
  });

  it('unlocks everything when all lessons are completed', () => {
    expect(
      computeMaxUnlockedIndex([{completed: true}, {completed: true}]),
    ).toBe(1);
  });
});

describe('isLessonPassing', () => {
  it('fails when a test practice block has no submissions yet', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: []}],
        passThresholdEnabled: true,
        combinedPracticePercent: 90,
        passThresholdPercent: 50,
      }),
    ).toBe(false);
  });

  it('passes when threshold is disabled regardless of score', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [],
        passThresholdEnabled: false,
        combinedPracticePercent: null,
        passThresholdPercent: null,
      }),
    ).toBe(true);
  });

  it('fails when combined percent is below the threshold', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: [{}]}],
        passThresholdEnabled: true,
        combinedPracticePercent: 40,
        passThresholdPercent: 50,
      }),
    ).toBe(false);
  });

  it('passes when combined percent meets the threshold', () => {
    expect(
      isLessonPassing({
        practiceBlocks: [{type: 'test', submissions: [{}]}],
        passThresholdEnabled: true,
        combinedPracticePercent: 50,
        passThresholdPercent: 50,
      }),
    ).toBe(true);
  });
});

describe('computeCourseStars', () => {
  it('sums earned and max across practice blocks and completion scores', () => {
    const result = computeCourseStars([
      {
        lesson: {
          practiceBlocks: [{maxScore: 5, earnedScore: 3}],
          completionScore: 2,
          completed: true,
        },
      },
      {
        lesson: {
          practiceBlocks: [{maxScore: 4, earnedScore: null}],
          completionScore: 1,
          completed: false,
        },
      },
    ]);
    expect(result).toEqual({earned: 5, max: 12});
  });
});
