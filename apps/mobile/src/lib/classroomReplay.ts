import type {ClassReplayEvent, CsPointer, CsScrollPosition, CsStroke} from '../types/classroom';

export interface ReplayOverlayState {
  zoom: number;
  rightZoom: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  pointer: CsPointer | null;
  /** Page being shown, so replay follows the teacher through the lesson. */
  currentPage: number;
  /** Strokes as they stood at this moment, keyed by page. */
  strokesByPage: Record<number, CsStroke[]>;
  /** False when there was no history to replay, so the caller can fall back to the snapshot. */
  hasHistory: boolean;
}

const INITIAL: ReplayOverlayState = {
  zoom: 1,
  rightZoom: 1,
  scroll: null,
  rightScroll: null,
  pointer: null,
  currentPage: 1,
  strokesByPage: {},
  hasHistory: false,
};

/**
 * Rebuilds what the board looked like `timeMs` into the recording.
 *
 * Mobile used to replay only zoom, scroll and the pointer, taking the strokes straight from
 * the final snapshot -- so a recording showed the finished board from the first second instead
 * of the teacher drawing it. Stroke events are applied here as well, which is what makes the
 * playback progressive.
 */
export function computeReplayOverlayAt(
  events: ClassReplayEvent[],
  timeMs: number,
): ReplayOverlayState {
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  let state = INITIAL;
  // Strokes are rebuilt in a local mutable map and only frozen into state at the end: copying
  // the whole map per event would be needlessly expensive over a long recording.
  const strokes = new Map<number, CsStroke[]>();

  for (const event of sorted) {
    if (event.atMs > timeMs) break;

    if (event.type === 'zoom:set') {
      const p = event.payload as {zoom: number; pane?: 'left' | 'right'};
      state = p.pane === 'right' ? {...state, rightZoom: p.zoom} : {...state, zoom: p.zoom};
      continue;
    }

    if (event.type === 'scroll:set') {
      const p = event.payload as CsScrollPosition & {pane?: 'left' | 'right'};
      state = p.pane === 'right' ? {...state, rightScroll: p} : {...state, scroll: p};
      continue;
    }

    if (event.type === 'pointer:move') {
      const p = event.payload as CsPointer;
      state = {...state, pointer: p.active ? p : null};
      continue;
    }

    if (event.type === 'page:set') {
      const p = event.payload as {page: number};
      if (typeof p?.page === 'number') state = {...state, currentPage: p.page};
      continue;
    }

    if (event.type === 'stroke:add') {
      const p = event.payload as {page: number; stroke: CsStroke};
      if (!p?.stroke) continue;
      strokes.set(p.page, [...(strokes.get(p.page) ?? []), p.stroke]);
      continue;
    }

    if (event.type === 'stroke:erase') {
      const p = event.payload as {page: number; strokeId: string};
      const list = strokes.get(p?.page);
      if (list) strokes.set(p.page, list.filter((s) => s.id !== p.strokeId));
      continue;
    }

    if (event.type === 'stroke:transform' || event.type === 'stroke:style' || event.type === 'stroke:text') {
      // These carry the stroke's new state under `after`; replacing by id keeps the drawing
      // in step with edits the teacher made after drawing it.
      const p = event.payload as {page: number; strokeId?: string; after?: CsStroke};
      const list = strokes.get(p?.page);
      if (!list || !p.after) continue;
      const targetId = p.strokeId ?? p.after.id;
      strokes.set(
        p.page,
        list.map((s) => (s.id === targetId ? {...s, ...p.after} : s)),
      );
      continue;
    }

    if (event.type === 'page:clear') {
      const p = event.payload as {page: number};
      strokes.set(p?.page, []);
      continue;
    }
  }

  const strokesByPage: Record<number, CsStroke[]> = {};
  for (const [page, list] of strokes) {
    if (list.length > 0) strokesByPage[page] = list;
  }

  return {...state, strokesByPage, hasHistory: events.length > 0};
}
