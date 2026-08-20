import { clampHistoryToRecording } from './replay-history';
import type { ClassroomHistoryEvent } from './classroom.types';

function event(type: string, atMs: number): ClassroomHistoryEvent {
  return { type, payload: { at: atMs }, atMs } as ClassroomHistoryEvent;
}

describe('clampHistoryToRecording', () => {
  it('drops everything drawn before recording started', () => {
    const events = [event('stroke:add', 0), event('stroke:add', 5_000), event('stroke:add', 12_000)];

    const clamped = clampHistoryToRecording(events, 10_000);

    expect(clamped).toHaveLength(1);
    expect(clamped[0].atMs).toBe(2_000);
  });

  it('rebases the survivors so recording begins at t=0', () => {
    const events = [event('a', 10_000), event('b', 15_500), event('c', 30_000)];

    const clamped = clampHistoryToRecording(events, 10_000);

    expect(clamped.map((e) => e.atMs)).toEqual([0, 5_500, 20_000]);
  });

  it('keeps an event that lands exactly on the recording start', () => {
    const clamped = clampHistoryToRecording([event('a', 8_000)], 8_000);
    expect(clamped.map((e) => e.atMs)).toEqual([0]);
  });

  it('leaves history untouched when there is no recording offset', () => {
    const events = [event('a', 0), event('b', 4_000)];

    expect(clampHistoryToRecording(events, null)).toBe(events);
    expect(clampHistoryToRecording(events, undefined)).toBe(events);
    expect(clampHistoryToRecording(events, 0)).toBe(events);
  });

  it('does not mutate the events it was given', () => {
    const events = [event('a', 10_000)];

    clampHistoryToRecording(events, 5_000);

    expect(events[0].atMs).toBe(10_000);
  });

  it('returns nothing when recording started after the last event', () => {
    const events = [event('a', 1_000), event('b', 2_000)];

    expect(clampHistoryToRecording(events, 60_000)).toEqual([]);
  });

  it('handles an empty history', () => {
    expect(clampHistoryToRecording([], 5_000)).toEqual([]);
  });
});
