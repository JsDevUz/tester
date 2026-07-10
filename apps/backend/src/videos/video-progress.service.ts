export interface WatchSegment {
  startSec: number;
  endSec: number;
}

export function mergeWatchSegments(
  existing: WatchSegment[],
  incoming: WatchSegment,
  gapToleranceSec: number,
): WatchSegment[] {
  const all = [...existing, incoming].sort((a, b) => a.startSec - b.startSec);
  const merged: WatchSegment[] = [];

  for (const segment of all) {
    const last = merged[merged.length - 1];
    if (last && segment.startSec <= last.endSec + gapToleranceSec) {
      last.endSec = Math.max(last.endSec, segment.endSec);
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

export function computeWatchedPercent(segments: WatchSegment[], durationSec: number | null): number | null {
  if (durationSec === null) return null;
  const totalCovered = segments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const percent = (totalCovered / durationSec) * 100;
  return Math.min(100, Math.round(percent));
}
