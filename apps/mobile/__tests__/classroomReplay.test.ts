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
    expect(result).toEqual({
      zoom: 1,
      rightZoom: 1,
      scroll: null,
      rightScroll: null,
      pointer: null,
      currentPage: 1,
      strokesByPage: {},
      hasHistory: true,
    });
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

  it('keeps overlay state independent of stroke events', () => {
    const result = computeReplayOverlayAt(events, 5000);
    expect(result.zoom).toBe(1.5);
    expect(result.rightZoom).toBe(2);
  });

  it('ignores events after the given time', () => {
    const result = computeReplayOverlayAt(events, 500);
    expect(result.zoom).toBe(1);
  });

  describe('stroke playback', () => {
    // The point of the change: a recording should show the board being drawn, not the finished
    // board from the first second.
    it('adds strokes as their events are reached', () => {
      const strokeEvents = [
        {type: 'stroke:add', atMs: 1000, payload: {page: 1, stroke: {id: 'a'}}},
        {type: 'stroke:add', atMs: 3000, payload: {page: 1, stroke: {id: 'b'}}},
      ] as any;

      expect(computeReplayOverlayAt(strokeEvents, 500).strokesByPage).toEqual({});
      expect(computeReplayOverlayAt(strokeEvents, 1500).strokesByPage[1]).toHaveLength(1);
      expect(computeReplayOverlayAt(strokeEvents, 3500).strokesByPage[1]).toHaveLength(2);
    });

    it('removes a stroke that was erased', () => {
      const strokeEvents = [
        {type: 'stroke:add', atMs: 1000, payload: {page: 1, stroke: {id: 'a'}}},
        {type: 'stroke:erase', atMs: 2000, payload: {page: 1, strokeId: 'a'}},
      ] as any;

      expect(computeReplayOverlayAt(strokeEvents, 1500).strokesByPage[1]).toHaveLength(1);
      expect(computeReplayOverlayAt(strokeEvents, 2500).strokesByPage).toEqual({});
    });

    it('clears a page', () => {
      const strokeEvents = [
        {type: 'stroke:add', atMs: 1000, payload: {page: 2, stroke: {id: 'a'}}},
        {type: 'page:clear', atMs: 2000, payload: {page: 2}},
      ] as any;

      expect(computeReplayOverlayAt(strokeEvents, 2500).strokesByPage).toEqual({});
    });

    it('follows the teacher to another page', () => {
      const pageEvents = [{type: 'page:set', atMs: 1000, payload: {page: 4}}] as any;

      expect(computeReplayOverlayAt(pageEvents, 500).currentPage).toBe(1);
      expect(computeReplayOverlayAt(pageEvents, 1500).currentPage).toBe(4);
    });

    it('reports no history for an empty recording, so the caller can use the snapshot', () => {
      expect(computeReplayOverlayAt([], 1000).hasHistory).toBe(false);
    });
  });
});
