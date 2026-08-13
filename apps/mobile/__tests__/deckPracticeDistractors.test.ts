jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../src/lib/practiceMessengerSocket', () => ({
  closePracticeMessengerSocket: jest.fn(),
}));

import { buildOptions, pickDistractors } from '../src/screens/DeckPracticeScreen';

describe('pickDistractors', () => {
  it('excludes the answer itself and dedupes the pool', () => {
    const result = pickDistractors(['olma', 'olma', 'nok', 'uzum'], 'olma', 'q1');
    expect(result).not.toContain('olma');
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns at most 3 distractors', () => {
    const result = pickDistractors(['a', 'b', 'c', 'd', 'e'], 'z', 'q1');
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic for the same seed key', () => {
    const pool = ['a', 'b', 'c', 'd'];
    expect(pickDistractors(pool, 'z', 'q1')).toEqual(pickDistractors(pool, 'z', 'q1'));
  });
});

describe('buildOptions', () => {
  it('always includes the answer among the options', () => {
    const options = buildOptions('olma', ['nok', 'uzum', 'shaftoli'], 'q1');
    expect(options).toContain('olma');
    expect(options).toHaveLength(4);
  });

  it('varies the answer position across different questions, not always slot A', () => {
    const questions: [string, string[]][] = [
      ['olma', ['nok', 'uzum', 'shaftoli']],
      ['kitob', ['stol', 'stul', 'deraza']],
      ['mushuk', ['it', 'sigir', 'ot']],
      ['osmon', ['yer', 'quyosh', 'oy']],
      ['non', ['sut', 'tuxum', 'yog']],
    ];
    const positions = questions.map(([answer, distractors]) => buildOptions(answer, distractors, 'seedX').indexOf(answer));
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBeGreaterThan(1);
    expect(positions.every((p) => p === 0)).toBe(false);
  });
});
