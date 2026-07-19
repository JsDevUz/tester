import { useCallback, useMemo, useRef, useState } from "react";
import type { ClassroomState } from "./useClassroomSession";
import {
  applyBoardSet, applyPageClear, applyPageSet, applyStrokeAdd, applyStrokeReorder,
  applyStrokeShapeUpdate, applyStrokeSplit, applyStrokeTextUpdate, applyStrokeUndo, applyStrokeUpdate,
} from "./classroomReducers";

export interface ReplayHistoryEvent {
  type: string;
  payload: unknown;
  atMs: number;
}

const REDUCERS: Record<string, (s: ClassroomState, p: any) => ClassroomState> = {
  "board:set": applyBoardSet,
  "page:set": applyPageSet,
  "stroke:add": applyStrokeAdd,
  "stroke:update": applyStrokeUpdate,
  "stroke:textUpdate": applyStrokeTextUpdate,
  "stroke:shapeUpdate": applyStrokeShapeUpdate,
  "stroke:reorder": applyStrokeReorder,
  "stroke:undo": applyStrokeUndo,
  "stroke:split": applyStrokeSplit,
  "page:clear": applyPageClear,
};

function baseState(pdfName: string | null, pdfPages: string[]): ClassroomState {
  return {
    joined: true, error: null, ended: true,
    pdfName, pages: pdfPages, currentPage: 1,
    strokesByPage: {}, rightStrokesByPage: {}, participants: [], hostOnline: false, pointer: null,
    zoom: 1, rightZoom: 1, scroll: null, rightScroll: null,
    isFree: false, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf",
    classroomTheme: "light", notebookStyle: "grid",
  };
}

// Berilgan vaqtgacha (inclusive) bo'lgan barcha eventlarni boshidan qayta
// qo'llab, o'sha lahzadagi holatni hisoblaydi — playback "scrub" qilinganda
// har safar noldan qayta hisoblanadi (event soni kichik, bu arzon).
function computeStateAt(events: ReplayHistoryEvent[], timeMs: number, pdfName: string | null, pdfPages: string[]): ClassroomState {
  let state = baseState(pdfName, pdfPages);
  for (const event of events) {
    if (event.atMs > timeMs) break;
    const reducer = REDUCERS[event.type];
    if (reducer) state = reducer(state, event.payload);
  }
  return state;
}

export function useClassroomReplay(historyEvents: ReplayHistoryEvent[], pdfName: string | null, pdfPages: string[]) {
  const sorted = useMemo(() => [...historyEvents].sort((a, b) => a.atMs - b.atMs), [historyEvents]);
  const durationMs = sorted.length > 0 ? sorted[sorted.length - 1].atMs : 0;
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const playStartWallMs = useRef(0);
  const playStartTimeMs = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPlaying(false);
  }, []);

  const tick = useCallback(() => {
    const elapsed = performance.now() - playStartWallMs.current;
    const next = playStartTimeMs.current + elapsed;
    if (next >= durationMs) {
      setCurrentTimeMs(durationMs);
      stop();
      return;
    }
    setCurrentTimeMs(next);
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, stop]);

  const play = useCallback(() => {
    if (durationMs <= 0) return;
    playStartWallMs.current = performance.now();
    playStartTimeMs.current = currentTimeMs >= durationMs ? 0 : currentTimeMs;
    if (currentTimeMs >= durationMs) setCurrentTimeMs(0);
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [currentTimeMs, durationMs, tick]);

  const pause = useCallback(() => stop(), [stop]);

  const seek = useCallback((ms: number) => {
    const clamped = Math.max(0, Math.min(durationMs, ms));
    setCurrentTimeMs(clamped);
    if (isPlaying) {
      playStartWallMs.current = performance.now();
      playStartTimeMs.current = clamped;
    }
  }, [durationMs, isPlaying]);

  const state = useMemo(() => computeStateAt(sorted, currentTimeMs, pdfName, pdfPages), [sorted, currentTimeMs, pdfName, pdfPages]);

  return { state, currentTimeMs, isPlaying, durationMs, play, pause, seek };
}
