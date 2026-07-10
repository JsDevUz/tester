import { mergeWatchSegments, computeWatchedPercent, type WatchSegment } from './video-progress.service';

describe('mergeWatchSegments', () => {
  it('keeps a new segment separate when it does not overlap or touch any existing one', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 50, endSec: 60 }, 2);
    expect(result).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 60 },
    ]);
  });

  it('merges an incoming segment that exactly overlaps an existing one into a no-op (same range)', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 0, endSec: 10 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 10 }]);
  });

  it('merges an incoming segment that partially overlaps an existing one, extending its range', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    const result = mergeWatchSegments(existing, { startSec: 8, endSec: 20 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 20 }]);
  });

  it('merges an incoming segment that is within the gap tolerance of an existing one (adjacent)', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    // gap between 10 and 11 is 1 second, tolerance is 2 -> should merge
    const result = mergeWatchSegments(existing, { startSec: 11, endSec: 15 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 15 }]);
  });

  it('does not merge an incoming segment whose gap exceeds the tolerance', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 10 }];
    // gap between 10 and 13 is 3 seconds, tolerance is 2 -> stays separate
    const result = mergeWatchSegments(existing, { startSec: 13, endSec: 15 }, 2);
    expect(result).toEqual([
      { startSec: 0, endSec: 10 },
      { startSec: 13, endSec: 15 },
    ]);
  });

  it('is a no-op when the incoming segment is fully inside an existing one', () => {
    const existing: WatchSegment[] = [{ startSec: 0, endSec: 100 }];
    const result = mergeWatchSegments(existing, { startSec: 20, endSec: 30 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 100 }]);
  });

  it('merges a segment that bridges two existing separate segments into one', () => {
    const existing: WatchSegment[] = [
      { startSec: 0, endSec: 10 },
      { startSec: 30, endSec: 40 },
    ];
    const result = mergeWatchSegments(existing, { startSec: 9, endSec: 31 }, 2);
    expect(result).toEqual([{ startSec: 0, endSec: 40 }]);
  });

  it('starts from an empty existing list', () => {
    const result = mergeWatchSegments([], { startSec: 5, endSec: 15 }, 2);
    expect(result).toEqual([{ startSec: 5, endSec: 15 }]);
  });
});

describe('computeWatchedPercent', () => {
  it('returns null when durationSec is null', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 10 }], null)).toBeNull();
  });

  it('returns 0 for no watched segments', () => {
    expect(computeWatchedPercent([], 100)).toBe(0);
  });

  it('computes the percentage from total covered seconds', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 25 }], 100)).toBe(25);
  });

  it('sums multiple non-overlapping segments', () => {
    const segments: WatchSegment[] = [
      { startSec: 0, endSec: 10 },
      { startSec: 50, endSec: 70 },
    ];
    expect(computeWatchedPercent(segments, 100)).toBe(30);
  });

  it('caps the result at 100', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 150 }], 100)).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(computeWatchedPercent([{ startSec: 0, endSec: 33 }], 100)).toBe(33);
    expect(computeWatchedPercent([{ startSec: 0, endSec: 1 }], 3)).toBe(33); // 0.333 -> 33
  });
});
