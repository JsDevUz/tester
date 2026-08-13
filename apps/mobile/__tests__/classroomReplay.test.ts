import {computeReplayOverlayAt} from '../src/lib/classroomReplay';
import type {ClassReplayEvent} from '../src/types/classroom';

const events: ClassReplayEvent[] = [
  {type: 'zoom:set', payload: {zoom: 1.5}, atMs: 1000},
  {type: 'zoom:set', payload: {zoom: 2, pane: 'right'}, atMs: 2000},
  {type: 'scroll:set', payload: {page: 2, yRatio: 0.4}, atMs: 3000},
  {type: 'pointer:move', payload: {page: 2, x: 0.3, y: 0.6, active: true}, atMs: 4000},
  {type: 'pointer:move', payload: {page: 2, x: 0.3, y: 0.6, active: false}, atMs: 4500},
  {type: 'stroke:add', payload: {page: 1, stroke: {id: 'x'}}, atMs: 5000},
];

describe('computeReplayOverlayAt', () => {
  it('returns defaults before any event', () => {
    const result = computeReplayOverlayAt(events, 0);
    expect(result).toEqual({zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null});
  });

  it('applies zoom:set for the left pane by default', () => {
    const result = computeReplayOverlayAt(events, 1000);
    expect(result.zoom).toBe(1.5);
    expect(result.rightZoom).toBe(1);
  });

  it('applies zoom:set for the right pane when specified', () => {
    const result = computeReplayOverlayAt(events, 2000);
    expect(result.rightZoom).toBe(2);
  });

  it('applies the latest scroll:set at or before the given time', () => {
    const result = computeReplayOverlayAt(events, 3500);
    expect(result.scroll).toEqual({page: 2, yRatio: 0.4});
  });

  it('reflects an active pointer as non-null and an inactive one as null', () => {
    expect(computeReplayOverlayAt(events, 4000).pointer).toEqual({page: 2, x: 0.3, y: 0.6, active: true});
    expect(computeReplayOverlayAt(events, 4500).pointer).toBeNull();
  });

  it('ignores non-overlay event types like stroke:add', () => {
    const result = computeReplayOverlayAt(events, 5000);
    expect(result.zoom).toBe(1.5);
    expect(result.rightZoom).toBe(2);
  });

  it('ignores events after the given time', () => {
    const result = computeReplayOverlayAt(events, 500);
    expect(result.zoom).toBe(1);
  });
});
