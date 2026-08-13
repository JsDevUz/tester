import type {ClassReplayEvent, CsPointer, CsScrollPosition} from '../types/classroom';

export interface ReplayOverlayState {
  zoom: number;
  rightZoom: number;
  scroll: CsScrollPosition | null;
  rightScroll: CsScrollPosition | null;
  pointer: CsPointer | null;
}

const INITIAL: ReplayOverlayState = {zoom: 1, rightZoom: 1, scroll: null, rightScroll: null, pointer: null};

export function computeReplayOverlayAt(events: ClassReplayEvent[], timeMs: number): ReplayOverlayState {
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  let state = INITIAL;

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
  }

  return state;
}
