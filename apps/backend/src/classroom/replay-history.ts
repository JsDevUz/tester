import { ClassroomHistoryEvent } from './classroom.types';

/**
 * Trims recorded history down to what happened after the teacher pressed Record.
 *
 * `historyEvents[].atMs` counts from when the SESSION opened, but recording usually starts
 * later -- often minutes later, after the teacher has already drawn on the board. Replaying
 * the whole history showed all of that preamble, which is not what pressing Record is
 * understood to capture.
 *
 * Events before the cut are dropped rather than kept: whatever they drew is already part of
 * boardSnapshot, so it still shows as the starting picture. Surviving events are rebased so
 * the recording begins at t=0, which is also the timeline the audio track uses.
 *
 * With no recording offset (an old session, or one saved before this field existed) the
 * history is returned untouched -- there is nothing to align to.
 */
export function clampHistoryToRecording(
  events: ClassroomHistoryEvent[],
  recordingStartedAtMs: number | null | undefined,
): ClassroomHistoryEvent[] {
  if (!recordingStartedAtMs || recordingStartedAtMs <= 0) return events;

  const clamped: ClassroomHistoryEvent[] = [];
  for (const event of events) {
    if (event.atMs < recordingStartedAtMs) continue;
    clamped.push({ ...event, atMs: event.atMs - recordingStartedAtMs });
  }
  return clamped;
}
