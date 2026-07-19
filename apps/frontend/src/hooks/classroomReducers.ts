import type { CsBoardLayout, CsBoardMode, CsStroke } from "../api/classroom";
import type { ClassroomState } from "./useClassroomSession";

export function moveStrokePoints(stroke: CsStroke, x: number, y: number): number[] {
  const dx = x - stroke.points[0];
  const dy = y - stroke.points[1];
  return stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
}

export function reorderStrokeList(list: CsStroke[], strokeIds: string[], op: "front" | "back" | "forward" | "backward"): CsStroke[] {
  const idSet = new Set(strokeIds);
  if (op === "front" || op === "back") {
    const selected = list.filter((s) => idSet.has(s.id));
    const rest = list.filter((s) => !idSet.has(s.id));
    return op === "front" ? [...rest, ...selected] : [...selected, ...rest];
  }
  const next = [...list];
  const step = op === "forward" ? 1 : -1;
  const indices = op === "forward"
    ? [...next.keys()].filter((i) => idSet.has(next[i].id)).reverse()
    : [...next.keys()].filter((i) => idSet.has(next[i].id));
  for (const i of indices) {
    const j = i + step;
    if (j < 0 || j >= next.length || idSet.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function applyPdfSet(s: ClassroomState, p: { pdfName: string; pages: string[]; currentPage: number }): ClassroomState {
  return { ...s, pdfName: p.pdfName, pages: p.pages, currentPage: p.currentPage, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf", strokesByPage: {}, rightStrokesByPage: {}, pointer: null };
}

export function applyBoardSet(s: ClassroomState, p: { mode: CsBoardMode; layout?: CsBoardLayout; leftMode?: CsBoardMode; rightMode?: CsBoardMode; currentPage: number; strokesByPage?: Record<number, CsStroke[]>; rightStrokesByPage?: Record<number, CsStroke[]> }): ClassroomState {
  return { ...s, boardMode: p.mode, boardLayout: p.layout ?? "single", leftBoardMode: p.leftMode ?? p.mode, rightBoardMode: p.rightMode ?? p.mode, currentPage: p.currentPage, strokesByPage: p.strokesByPage ?? {}, rightStrokesByPage: p.rightStrokesByPage ?? {}, pointer: null, scroll: null };
}

export function applyPageSet(s: ClassroomState, p: { page: number }): ClassroomState {
  return { ...s, currentPage: p.page, pointer: null };
}

export function applyStrokeAdd(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  if (p.pane === "right") {
    if (p.mode && p.mode !== s.rightBoardMode) return s;
    const existing = s.rightStrokesByPage[p.page] ?? [];
    if (existing.some((x) => x.id === p.stroke.id)) return s;
    return { ...s, rightStrokesByPage: { ...s.rightStrokesByPage, [p.page]: [...existing, p.stroke] } };
  }
  if (p.mode && p.mode !== s.leftBoardMode) return s;
  const existing = s.strokesByPage[p.page] ?? [];
  // Optimistik qo'shilgan (o'zimiz chizgan) stroke server javobida
  // qaytib kelganda dublikat bo'lib qo'shilib qolmasin.
  if (existing.some((x) => x.id === p.stroke.id)) return s;
  return { ...s, strokesByPage: { ...s.strokesByPage, [p.page]: [...existing, p.stroke] } };
}

export function applyStrokeUpdate(s: ClassroomState, p: { page: number; strokeId: string; x: number; y: number; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const source = right ? s.rightStrokesByPage : s.strokesByPage;
  const list = source[p.page] ?? [];
  const next = list.map((stroke) => stroke.id === p.strokeId ? { ...stroke, points: moveStrokePoints(stroke, p.x, p.y) } : stroke);
  return right
    ? { ...s, rightStrokesByPage: { ...s.rightStrokesByPage, [p.page]: next } }
    : { ...s, strokesByPage: { ...s.strokesByPage, [p.page]: next } };
}

export function applyStrokeTextUpdate(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const list = source[p.page] ?? [];
  const next = list.some((stroke) => stroke.id === p.stroke.id)
    ? list.map((stroke) => stroke.id === p.stroke.id ? p.stroke : stroke)
    : [...list, p.stroke];
  return { ...s, [key]: { ...source, [p.page]: next } };
}

export function applyStrokeShapeUpdate(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const list = source[p.page] ?? [];
  const next = list.some((stroke) => stroke.id === p.stroke.id)
    ? list.map((stroke) => stroke.id === p.stroke.id ? p.stroke : stroke)
    : [...list, p.stroke];
  return { ...s, [key]: { ...source, [p.page]: next } };
}

export function applyStrokeReorder(s: ClassroomState, p: { page: number; strokeIds: string[]; op: "front" | "back" | "forward" | "backward"; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const list = source[p.page] ?? [];
  return { ...s, [key]: { ...source, [p.page]: reorderStrokeList(list, p.strokeIds, p.op) } };
}

export function applyStrokeUndo(s: ClassroomState, p: { page: number; strokeId: string; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  return { ...s, [key]: { ...source, [p.page]: (source[p.page] ?? []).filter((x) => x.id !== p.strokeId) } };
}

export function applyStrokeSplit(s: ClassroomState, p: { page: number; strokeId: string; replacements: CsStroke[]; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const existing = source[p.page] ?? [];
  const idx = existing.findIndex((x) => x.id === p.strokeId);
  // O'zimiz optimistik split qilgan bo'lsak, eski ID allaqachon yo'q —
  // shu holatda o'rniga qo'shishning o'rniga dublikatni tekshirib qo'shamiz.
  if (idx === -1) {
    const news = p.replacements.filter((r) => !existing.some((x) => x.id === r.id));
    if (news.length === 0) return s;
    return { ...s, [key]: { ...source, [p.page]: [...existing, ...news] } };
  }
  const next = [...existing];
  next.splice(idx, 1, ...p.replacements);
  return { ...s, [key]: { ...source, [p.page]: next } };
}

export function applyPageClear(s: ClassroomState, p: { page: number; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;
  const key = right ? "rightStrokesByPage" : "strokesByPage";
  return { ...s, [key]: { ...s[key], [p.page]: [] } };
}
