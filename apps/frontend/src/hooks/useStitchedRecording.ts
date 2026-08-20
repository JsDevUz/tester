export interface RecordingPart {
  recordingUrl?: string | null;
  recordingStatus?: string;
  partNumber?: number;
  recordingStartedAtMs?: number | null;
}

export interface StitchedPart {
  url: string;
  /** Where this part starts on the combined timeline, in ms. */
  startMs: number;
  /** Length of this part in ms, once its metadata has loaded. */
  durationMs: number;
}

/**
 * Lays several recording parts end to end on one timeline.
 *
 * A lesson can end up with more than one audio file: LiveKit egress sometimes drops
 * mid-lesson, and the teacher restarts recording. Playing only the first (or last) would lose
 * the rest, so the parts are treated as one continuous track -- each starting where the
 * previous one ended.
 *
 * Durations are filled in as each file's metadata loads, so `startMs` for later parts is only
 * final once every earlier part is known. Until then a part sits at the end of what has been
 * measured, which is the best estimate available and self-corrects.
 */
export function buildStitchedParts(
  parts: RecordingPart[] | undefined,
  durationsByUrl: Record<string, number>,
): StitchedPart[] {
  if (!parts?.length) return [];

  const playable = parts
    .filter((p): p is RecordingPart & { recordingUrl: string } =>
      Boolean(p.recordingUrl) && p.recordingStatus !== "failed",
    )
    .sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0));

  let cursor = 0;
  return playable.map((part) => {
    const durationMs = durationsByUrl[part.recordingUrl] ?? 0;
    const stitched: StitchedPart = {
      url: part.recordingUrl,
      startMs: cursor,
      durationMs,
    };
    cursor += durationMs;
    return stitched;
  });
}

/** Total length of the stitched timeline. */
export function stitchedDurationMs(parts: StitchedPart[]): number {
  if (parts.length === 0) return 0;
  const last = parts[parts.length - 1];
  return last.startMs + last.durationMs;
}

/**
 * Which part covers `timeMs`, and how far into that part it falls.
 *
 * Returns null past the end of the last part, which is how the caller knows playback has
 * finished rather than needing to load another file.
 */
export function locateInStitched(
  parts: StitchedPart[],
  timeMs: number,
): { part: StitchedPart; index: number; offsetMs: number } | null {
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const end = part.startMs + part.durationMs;
    // The last part owns anything at or past its start, so a timeline that has not finished
    // measuring still resolves rather than falling through to null.
    if (timeMs < end || index === parts.length - 1) {
      return { part, index, offsetMs: Math.max(0, timeMs - part.startMs) };
    }
  }
  return null;
}
