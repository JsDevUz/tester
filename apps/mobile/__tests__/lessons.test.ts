import {computeUnlockedLessonIds, isLessonPassing, computeCourseStars} from '../src/lib/lessons';

describe('computeUnlockedLessonIds', () => {
  it('always unlocks the first lesson of every module, even with no progress', () => {
    const modules = [
      {lessons: [{id: 'm1l1', completed: false}, {id: 'm1l2', completed: false}]},
      {lessons: [{id: 'm2l1', completed: false}, {id: 'm2l2', completed: false}]},
    ];
    const unlocked = computeUnlockedLessonIds(modules);
    expect(unlocked.has('m1l1')).toBe(true);
    expect(unlocked.has('m2l1')).toBe(true);
    expect(unlocked.has('m1l2')).toBe(false);
    expect(unlocked.has('m2l2')).toBe(false);
  });

  it('unlocks a lesson once the previous lesson in the same module is completed', () => {
    const modules = [
      {lessons: [{id: 'm1l1', completed: true}, {id: 'm1l2', completed: false}]},
    ];
    const unlocked = computeUnlockedLessonIds(modules);
    expect(unlocked.has('m1l2')).toBe(true);
  });

  it('does not let completing module 1 skip unlocking module 2 lesson 1 (already unlocked by default)', () => {
    const modules = [
      {lessons: [{id: 'm1l1', completed: false}]},
      {lessons: [{id: 'm2l1', completed: false}]},
    ];
    const unlocked = computeUnlockedLessonIds(modules);
    expect(unlocked.has('m2l1')).toBe(true);
  });

  it('stops unlocking within a module after the first incomplete lesson', () => {
    const modules = [
      {
        lessons: [
          {id: 'l1', completed: true},
          {id: 'l2', completed: false},
          {id: 'l3', completed: true},
        ],
      },
    ];
    const unlocked = computeUnlockedLessonIds(modules);
    expect(Array.from(unlocked)).toEqual(['l1', 'l2']);
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
