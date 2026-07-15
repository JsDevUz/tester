import { computeCombinedPercent, computeEarnedScore, computeEffectiveTestPracticeScore, computeTestPracticePercent } from './practice-blocks.service';

describe('computeEarnedScore', () => {
  it('returns null when maxScore is null (unscored block)', () => {
    expect(computeEarnedScore({ score: 8, total: 10 }, null)).toBeNull();
  });

  it('returns 0 when there is no submission yet', () => {
    expect(computeEarnedScore(null, 38)).toBe(0);
  });

  it('returns the proportional score rounded to the nearest integer', () => {
    expect(computeEarnedScore({ score: 8, total: 10 }, 38)).toBe(30); // 0.8 * 38 = 30.4 -> 30
  });

  it('returns 0 when the latest submission has total 0 (avoids divide by zero)', () => {
    expect(computeEarnedScore({ score: 0, total: 0 }, 38)).toBe(0);
  });

  it('returns full maxScore for a perfect submission', () => {
    expect(computeEarnedScore({ score: 10, total: 10 }, 38)).toBe(38);
  });
});

describe('computeEffectiveTestPracticeScore', () => {
  it('uses the manual star override without changing the raw test result', () => {
    const submission = { score: 6, total: 17, practiceScoreOverride: 9 };
    expect(computeEffectiveTestPracticeScore(submission, 10)).toBe(9);
    expect(submission.score).toBe(6);
    expect(submission.total).toBe(17);
  });

  it('falls back to the automatically calculated star when there is no override', () => {
    expect(
      computeEffectiveTestPracticeScore(
        { score: 6, total: 10, practiceScoreOverride: null },
        10,
      ),
    ).toBe(6);
  });
});

describe('computeCombinedPercent', () => {
  it('returns null when all blocks are unscored (total max is 0)', () => {
    expect(computeCombinedPercent([{ maxScore: null, earnedScore: null }])).toBeNull();
  });

  it('returns null for an empty block list', () => {
    expect(computeCombinedPercent([])).toBeNull();
  });

  it('computes the combined percentage across multiple scored blocks', () => {
    // 30/38 + 10/28 combined = 40/66 = ~60.6%
    const result = computeCombinedPercent([
      { maxScore: 38, earnedScore: 30 },
      { maxScore: 28, earnedScore: 10 },
    ]);
    expect(result).toBeCloseTo(60.606, 2);
  });

  it('ignores unscored blocks (null maxScore) when mixed with scored ones', () => {
    const result = computeCombinedPercent([
      { maxScore: 38, earnedScore: 19 },
      { maxScore: null, earnedScore: null },
    ]);
    expect(result).toBe(50);
  });
});

describe('computeTestPracticePercent', () => {
  it('uses only test blocks and ignores image/oral grades', () => {
    const result = computeTestPracticePercent([
      { type: 'test', maxScore: 10, earnedScore: 4 },
      { type: 'image', maxScore: 10, earnedScore: 10 },
      { type: 'oral', maxScore: 20, earnedScore: 20 },
    ]);

    expect(result).toBe(40);
  });

  it('returns null when there are no scored test blocks', () => {
    expect(
      computeTestPracticePercent([
        { type: 'image', maxScore: 10, earnedScore: 10 },
        { type: 'oral', maxScore: 20, earnedScore: null },
      ]),
    ).toBeNull();
  });
});
