import type { CsBoardLayout, CsBoardMode, CsNotebookStyle, CsStroke } from "../api/classroom";
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

// Sahifa o'chirilganda undan keyingi barcha sahifalarning chizmalari
// (shu pane uchun) bittaga siljiydi — backend'dagi removePageFromSession
// bilan bir xil mantiq, lekin frontend strokesByPage/rightStrokesByPage
// PANE bo'yicha (mode bo'yicha emas) saqlangani uchun shu obyektni
// qayta quradi.
export function applyPageRemove(
  s: ClassroomState,
  p: { mode: CsBoardMode; pageIndex: number; pane?: "left" | "right" },
): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;

  // Backend'dagi removePageFromSession bilan bir xil himoya: mode uchun
  // joriy sahifalar soni <= 1 bo'lsa, o'chirish rad etiladi (holat
  // o'zgarishsiz qaytadi). Jonli socket yo'lida bu deyarli erishib
  // bo'lmaydi (backend broadcast qilishdan oldin tashlaydi), lekin
  // useClassroomReplay saqlangan historyEvents'ni backend qayta
  // tekshiruvisiz to'g'ridan-to'g'ri shu reducer orqali qayta ijro etadi.
  const isPdf = p.mode === "pdf";
  const currentCount = isPdf ? s.pages.length : s.notebookPageCount;
  if (currentCount <= 1) return s;

  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(source)) {
    const pageNum = Number(pageStr);
    if (pageNum < p.pageIndex) rebuilt[pageNum] = strokes;
    else if (pageNum > p.pageIndex) rebuilt[pageNum - 1] = strokes;
    // pageNum === p.pageIndex: dropped
  }

  const pages = isPdf ? s.pages.filter((_, idx) => idx !== p.pageIndex - 1) : s.pages;
  const notebookPageCount = isPdf ? s.notebookPageCount : Math.max(1, s.notebookPageCount - 1);

  let currentPage = s.currentPage;
  if (currentPage > p.pageIndex) currentPage -= 1;
  else if (currentPage === p.pageIndex) {
    const newCount = isPdf ? pages.length : notebookPageCount;
    if (currentPage > newCount) currentPage = newCount;
  }

  return { ...s, [key]: rebuilt, pages, notebookPageCount, currentPage };
}

// PDF'ga qo'shilgan yangi sahifa(lar) — afterPageIndex'dan keyingi barcha
// sahifalarning chizmalari (chap panel, chunki PDF qo'shish hozircha
// faqat asosiy/chap panelga tegishli) qo'shilgan son bo'yicha yuqoriga
// siljiydi.
export function applyPdfInsert(
  s: ClassroomState,
  p: { pages: string[]; afterPageIndex: number },
): ClassroomState {
  const shiftBy = p.pages.length;
  const pages = [...s.pages];
  pages.splice(p.afterPageIndex, 0, ...p.pages);

  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(s.strokesByPage)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuilt[pageNum] = strokes;
    else rebuilt[pageNum + shiftBy] = strokes;
  }

  const currentPage = s.currentPage > p.afterPageIndex ? s.currentPage + shiftBy : s.currentPage;

  return { ...s, pages, strokesByPage: rebuilt, currentPage };
}

// Daftarga qo'shilgan yangi sahifa — afterPageIndex'dan keyingi barcha
// sahifalarning naqshi/chizmalari (shu pane uchun) bittaga yuqoriga
// siljiydi, yangi sahifaning o'zi tanlangan naqshni oladi.
export function applyNotebookPageInsert(
  s: ClassroomState,
  p: { mode: CsBoardMode; afterPageIndex: number; style: CsNotebookStyle; pane?: "left" | "right" },
): ClassroomState {
  const right = p.pane === "right";
  if (p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;

  const key = right ? "rightStrokesByPage" : "strokesByPage";
  const source = s[key];
  const rebuilt: Record<number, CsStroke[]> = {};
  for (const [pageStr, strokes] of Object.entries(source)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuilt[pageNum] = strokes;
    else rebuilt[pageNum + 1] = strokes;
  }

  const rebuiltStyles: Record<number, CsNotebookStyle> = {};
  for (const [pageStr, style] of Object.entries(s.notebookPageStyles)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuiltStyles[pageNum] = style;
    else rebuiltStyles[pageNum + 1] = style;
  }
  rebuiltStyles[p.afterPageIndex + 1] = p.style;

  const notebookPageCount = s.notebookPageCount + 1;
  const currentPage = s.currentPage > p.afterPageIndex ? s.currentPage + 1 : s.currentPage;

  return { ...s, [key]: rebuilt, notebookPageStyles: rebuiltStyles, notebookPageCount, currentPage };
}
