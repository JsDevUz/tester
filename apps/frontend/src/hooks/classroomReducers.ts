import type { CsBoardLayout, CsBoardMode, CsNotebookOrientation, CsNotebookStyle, CsStroke } from "../api/classroom";
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
  const byMode = s.strokesByMode ? { ...s.strokesByMode, pdf: {} } : undefined;
  return { ...s, pdfName: p.pdfName, pages: p.pages, currentPage: p.currentPage, boardMode: "pdf", boardLayout: "single", leftBoardMode: "pdf", rightBoardMode: "pdf", strokesByMode: byMode, strokesByPage: {}, rightStrokesByPage: {}, pointer: null };
}

export function applyBoardSet(s: ClassroomState, p: { mode: CsBoardMode; layout?: CsBoardLayout; leftMode?: CsBoardMode; rightMode?: CsBoardMode; currentPage: number; strokesByPage?: Record<number, CsStroke[]>; rightStrokesByPage?: Record<number, CsStroke[]>; notebookPageCount?: number; notebookPageStyles?: Record<number, CsNotebookStyle>; notebookPageOrientations?: Record<number, CsNotebookOrientation>; strokesByMode?: Record<string, Record<number, CsStroke[]>>; pdfName?: string | null; pages?: string[] }): ClassroomState {
  const leftMode = p.leftMode ?? p.mode;
  const rightMode = p.rightMode ?? p.mode;
  const pages = p.pages ?? s.pages;
  const targetPageCount = leftMode === "notebook" ? (p.notebookPageCount ?? s.notebookPageCount ?? 1) : (pages?.length || 1);
  const clampedCurrentPage = Math.min(Math.max(1, p.currentPage || s.currentPage || 1), Math.max(1, targetPageCount));

  const byMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    pdf: (p.strokesByMode?.pdf ?? s.strokesByMode?.pdf ?? {}) as Record<number, CsStroke[]>,
    notebook: (p.strokesByMode?.notebook ?? s.strokesByMode?.notebook ?? {}) as Record<number, CsStroke[]>,
  };
  if (p.strokesByPage) {
    byMode[leftMode] = p.strokesByPage;
  }
  if (p.rightStrokesByPage) {
    byMode[rightMode] = p.rightStrokesByPage;
  }

  return {
    ...s,
    pdfName: p.pdfName !== undefined ? p.pdfName : s.pdfName,
    pages: pages,
    boardMode: p.mode,
    boardLayout: p.layout ?? "single",
    leftBoardMode: leftMode,
    rightBoardMode: rightMode,
    currentPage: clampedCurrentPage,
    strokesByMode: byMode,
    strokesByPage: byMode[leftMode] ?? {},
    rightStrokesByPage: byMode[rightMode] ?? {},
    notebookPageCount: p.notebookPageCount ?? s.notebookPageCount,
    notebookPageStyles: p.notebookPageStyles ?? s.notebookPageStyles,
    notebookPageOrientations: p.notebookPageOrientations ?? s.notebookPageOrientations,
    pointer: null,
    scroll: null,
    isBoardOpen: true,
  };
}

export function applyBoardAttached(s: ClassroomState, p: {
  attachedBoardId?: string;
  pdfName?: string | null;
  pages?: string[];
  boardMode?: CsBoardMode;
  boardLayout?: CsBoardLayout;
  leftBoardMode?: CsBoardMode;
  rightBoardMode?: CsBoardMode;
  notebookStyle?: CsNotebookStyle;
  notebookPageCount?: number;
  notebookPageStyles?: Record<number, CsNotebookStyle>;
  notebookPageOrientations?: Record<number, CsNotebookOrientation>;
  strokesByMode?: Record<string, Record<number, CsStroke[]>>;
  strokesByPage?: Record<number, CsStroke[]>;
  rightStrokesByPage?: Record<number, CsStroke[]>;
  currentPage?: number;
}): ClassroomState {
  const mode = p.boardMode ?? s.boardMode ?? "pdf";
  const leftMode = p.leftBoardMode ?? mode;
  const rightMode = p.rightBoardMode ?? mode;
  const pages = p.pages ?? s.pages;
  const targetPageCount = leftMode === "notebook" ? (p.notebookPageCount ?? s.notebookPageCount ?? 1) : (pages?.length || 1);
  const clampedPage = Math.min(Math.max(1, p.currentPage ?? 1), Math.max(1, targetPageCount));

  const byMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    pdf: (p.strokesByMode?.pdf ?? s.strokesByMode?.pdf ?? {}) as Record<number, CsStroke[]>,
    notebook: (p.strokesByMode?.notebook ?? s.strokesByMode?.notebook ?? {}) as Record<number, CsStroke[]>,
  };
  if (p.strokesByPage) {
    byMode[leftMode] = p.strokesByPage;
  }
  if (p.rightStrokesByPage) {
    byMode[rightMode] = p.rightStrokesByPage;
  }

  return {
    ...s,
    attachedBoardId: p.attachedBoardId ?? s.attachedBoardId,
    pdfName: p.pdfName !== undefined ? p.pdfName : s.pdfName,
    pages: pages,
    boardMode: mode,
    boardLayout: p.boardLayout ?? "single",
    leftBoardMode: leftMode,
    rightBoardMode: rightMode,
    notebookStyle: p.notebookStyle ?? s.notebookStyle ?? "grid",
    notebookPageCount: p.notebookPageCount ?? s.notebookPageCount ?? 1,
    notebookPageStyles: p.notebookPageStyles ?? s.notebookPageStyles,
    notebookPageOrientations: p.notebookPageOrientations ?? s.notebookPageOrientations,
    currentPage: clampedPage,
    strokesByMode: byMode,
    strokesByPage: byMode[leftMode] ?? {},
    rightStrokesByPage: byMode[rightMode] ?? {},
    pointer: null,
    scroll: null,
    isBoardOpen: true,
  };
}

export function applyPageSet(s: ClassroomState, p: { page: number }): ClassroomState {
  return { ...s, currentPage: p.page, pointer: null };
}

function updateStrokeListInState(
  s: ClassroomState,
  p: { page: number; pane?: "left" | "right"; mode?: CsBoardMode },
  updateFn: (list: CsStroke[]) => CsStroke[]
): ClassroomState {
  const isRight = p.pane === "right";
  const activeLeftMode = s.leftBoardMode ?? s.boardMode ?? "pdf";
  const activeRightMode = s.rightBoardMode ?? s.boardMode ?? "pdf";
  const targetMode: CsBoardMode = p.mode ?? (isRight ? activeRightMode : activeLeftMode) ?? "pdf";

  const byMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    pdf: { ...(s.strokesByMode?.pdf ?? (s.boardMode === "pdf" ? s.strokesByPage : {})) } as Record<number, CsStroke[]>,
    notebook: { ...(s.strokesByMode?.notebook ?? (s.boardMode === "notebook" ? s.strokesByPage : {})) } as Record<number, CsStroke[]>,
  };

  const modeObj = byMode[targetMode] ?? {};
  const pageStrokes = modeObj[p.page] ?? [];
  const nextStrokes = updateFn(pageStrokes);

  const nextModeObj = { ...modeObj, [p.page]: nextStrokes };
  const nextByMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    ...byMode,
    [targetMode]: nextModeObj,
  };

  return {
    ...s,
    strokesByMode: nextByMode,
    strokesByPage: nextByMode[activeLeftMode] ?? {},
    rightStrokesByPage: nextByMode[activeRightMode] ?? {},
  };
}

export function applyStrokeAdd(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) => {
    if (list.some((x) => x.id === p.stroke.id)) return list;
    return [...list, p.stroke];
  });
}

export function applyStrokeUpdate(s: ClassroomState, p: { page: number; strokeId: string; x: number; y: number; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) =>
    list.map((stroke) => (stroke.id === p.strokeId ? { ...stroke, points: moveStrokePoints(stroke, p.x, p.y) } : stroke))
  );
}

export function applyStrokeTextUpdate(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) =>
    list.some((x) => x.id === p.stroke.id)
      ? list.map((x) => (x.id === p.stroke.id ? p.stroke : x))
      : [...list, p.stroke]
  );
}

export function applyStrokeShapeUpdate(s: ClassroomState, p: { page: number; stroke: CsStroke; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) =>
    list.some((x) => x.id === p.stroke.id)
      ? list.map((x) => (x.id === p.stroke.id ? p.stroke : x))
      : [...list, p.stroke]
  );
}

export function applyStrokeReorder(s: ClassroomState, p: { page: number; strokeIds: string[]; op: "front" | "back" | "forward" | "backward"; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) => reorderStrokeList(list, p.strokeIds, p.op));
}

export function applyStrokeUndo(s: ClassroomState, p: { page: number; strokeId: string; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) => list.filter((x) => x.id !== p.strokeId));
}

export function applyStrokeSplit(s: ClassroomState, p: { page: number; strokeId: string; replacements: CsStroke[]; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, (list) => {
    const idx = list.findIndex((x) => x.id === p.strokeId);
    if (idx === -1) {
      const news = p.replacements.filter((r) => !list.some((x) => x.id === r.id));
      return news.length === 0 ? list : [...list, ...news];
    }
    const next = [...list];
    next.splice(idx, 1, ...p.replacements);
    return next;
  });
}

export function applyPageClear(s: ClassroomState, p: { page: number; pane?: "left" | "right"; mode?: CsBoardMode }): ClassroomState {
  return updateStrokeListInState(s, p, () => []);
}

export function applyBoardClear(s: ClassroomState): ClassroomState {
  return {
    ...s,
    strokesByPage: {},
    rightStrokesByPage: {},
    strokesByMode: {
      pdf: {},
      notebook: {},
    },
  };
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
  let notebookPageStyles = s.notebookPageStyles;
  let notebookPageOrientations = s.notebookPageOrientations;
  if (!isPdf) {
    notebookPageStyles = {};
    for (const [pageStr, style] of Object.entries(s.notebookPageStyles)) {
      const pageNum = Number(pageStr);
      if (pageNum < p.pageIndex) notebookPageStyles[pageNum] = style;
      else if (pageNum > p.pageIndex) notebookPageStyles[pageNum - 1] = style;
    }
    notebookPageOrientations = {};
    for (const [pageStr, orientation] of Object.entries(s.notebookPageOrientations)) {
      const pageNum = Number(pageStr);
      if (pageNum < p.pageIndex) notebookPageOrientations[pageNum] = orientation;
      else if (pageNum > p.pageIndex) notebookPageOrientations[pageNum - 1] = orientation;
    }
  }

  let currentPage = s.currentPage;
  if (currentPage > p.pageIndex) currentPage -= 1;
  else if (currentPage === p.pageIndex) {
    const newCount = isPdf ? pages.length : notebookPageCount;
    if (currentPage > newCount) currentPage = newCount;
  }

  return { ...s, [key]: rebuilt, pages, notebookPageCount, notebookPageStyles, notebookPageOrientations, currentPage };
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
  p: { mode?: CsBoardMode; afterPageIndex: number; style: CsNotebookStyle; orientation?: CsNotebookOrientation; pane?: "left" | "right" },
): ClassroomState {
  const right = p.pane === "right";
  if (p.mode && p.mode !== (right ? s.rightBoardMode : s.leftBoardMode)) return s;

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

  const rebuiltOrientations: Record<number, CsNotebookOrientation> = {};
  for (const [pageStr, orientation] of Object.entries(s.notebookPageOrientations)) {
    const pageNum = Number(pageStr);
    if (pageNum <= p.afterPageIndex) rebuiltOrientations[pageNum] = orientation;
    else rebuiltOrientations[pageNum + 1] = orientation;
  }
  rebuiltOrientations[p.afterPageIndex + 1] = p.orientation ?? "portrait";

  const notebookPageCount = s.notebookPageCount + 1;
  const currentPage = s.currentPage > p.afterPageIndex ? s.currentPage + 1 : s.currentPage;

  return { ...s, [key]: rebuilt, notebookPageStyles: rebuiltStyles, notebookPageOrientations: rebuiltOrientations, notebookPageCount, currentPage };
}

export function applyNotebookPageStyle(
  s: ClassroomState,
  p: { page: number; style: CsNotebookStyle },
): ClassroomState {
  return {
    ...s,
    notebookPageStyles: { ...s.notebookPageStyles, [p.page]: p.style },
  };
}

// entry.mode qaysi pane'da ko'rsatilayotganini aniqlaydi — split
// rejimida DUPLICATE_SPLIT_MODE tufayli ikkala pane bir xil mode'da
// bo'la olmaydi, shuning uchun bu har doim aynan bitta pane'ni tanlaydi
// (yoki yakka rejimda "left"ni, chunki notSplit holatida faqat
// strokesByPage ishlatiladi).
function paneKeyForMode(s: ClassroomState, mode: CsBoardMode): "strokesByPage" | "rightStrokesByPage" {
  return s.rightBoardMode === mode && s.leftBoardMode !== mode ? "rightStrokesByPage" : "strokesByPage";
}

function applyStrokeAddInverseClient(source: Record<number, CsStroke[]>, page: number, data: { stroke: CsStroke }, direction: "undo" | "redo"): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  return {
    ...source,
    [page]: direction === "undo" ? list.filter((s) => s.id !== data.stroke.id) : [...list, data.stroke],
  };
}

function applyStrokeEraseInverseClient(source: Record<number, CsStroke[]>, page: number, data: { stroke: CsStroke; index: number }, direction: "undo" | "redo"): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  if (direction === "undo") {
    const next = [...list];
    next.splice(data.index, 0, data.stroke);
    return { ...source, [page]: next };
  }
  return { ...source, [page]: list.filter((s) => s.id !== data.stroke.id) };
}

function applyStrokeTransformInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { strokeId: string; before: Partial<CsStroke>; after: Partial<CsStroke> },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  const target = direction === "undo" ? data.before : data.after;
  return { ...source, [page]: list.map((s) => s.id === data.strokeId ? { ...s, ...target } : s) };
}

function applyStrokeReorderInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { before: { order: string[] }; after: { order: string[] } },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  const targetOrder = direction === "undo" ? data.before.order : data.after.order;
  const byId = new Map(list.map((s) => [s.id, s]));
  return { ...source, [page]: targetOrder.map((id) => byId.get(id)).filter((s): s is CsStroke => s !== undefined) };
}

function applyStrokeTextInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { strokeId: string; before: CsStroke | null; after: CsStroke },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  if (direction === "undo") {
    return data.before === null
      ? { ...source, [page]: list.filter((s) => s.id !== data.strokeId) }
      : { ...source, [page]: list.map((s) => s.id === data.strokeId ? data.before! : s) };
  }
  const exists = list.some((s) => s.id === data.strokeId);
  return { ...source, [page]: exists ? list.map((s) => s.id === data.strokeId ? data.after : s) : [...list, data.after] };
}

function applyStrokeSplitInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { strokeId: string; before: { stroke: CsStroke; index: number }; after: { replacements: CsStroke[] } },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  const list = source[page] ?? [];
  if (direction === "undo") {
    const replacementIds = new Set(data.after.replacements.map((r) => r.id));
    const filtered = list.filter((s) => !replacementIds.has(s.id));
    const next = [...filtered];
    const insertIdx = Math.min(next.length, Math.max(0, data.before.index));
    next.splice(insertIdx, 0, data.before.stroke);
    return { ...source, [page]: next };
  }
  const filtered = list.filter((s) => s.id !== data.before.stroke.id);
  const insertIdx = Math.min(filtered.length, Math.max(0, data.before.index));
  const next = [...filtered];
  next.splice(insertIdx, 0, ...data.after.replacements);
  return { ...source, [page]: next };
}

function applyPageClearInverseClient(
  source: Record<number, CsStroke[]>, page: number,
  data: { before: { strokes: CsStroke[] } },
  direction: "undo" | "redo",
): Record<number, CsStroke[]> {
  if (direction === "undo") {
    return { ...source, [page]: [...data.before.strokes] };
  }
  return { ...source, [page]: [] };
}

function applyNotebookPageStyleInverseClient(
  s: ClassroomState, page: number,
  data: { before: { style: CsNotebookStyle }; after: { style: CsNotebookStyle } },
  direction: "undo" | "redo",
): ClassroomState {
  const targetStyle = direction === "undo" ? data.before.style : data.after.style;
  const notebookPageStyles = { ...(s.notebookPageStyles ?? {}), [page]: targetStyle };
  return { ...s, notebookPageStyles };
}

function applyBoardUndoRedo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before?: unknown; after?: unknown },
  direction: "undo" | "redo",
): ClassroomState {
  const activeLeftMode = s.leftBoardMode ?? s.boardMode ?? "pdf";
  const activeRightMode = s.rightBoardMode ?? s.boardMode ?? "pdf";
  const targetMode = p.mode ?? activeLeftMode;

  const byMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    pdf: (s.strokesByMode?.pdf ?? (activeLeftMode === "pdf" ? s.strokesByPage : {})) as Record<number, CsStroke[]>,
    notebook: (s.strokesByMode?.notebook ?? (activeLeftMode === "notebook" ? s.strokesByPage : {})) as Record<number, CsStroke[]>,
  };
  const modeSource = byMode[targetMode] ?? {};

  if (p.entryType === "notebook:pageStyle") {
    return applyNotebookPageStyleInverseClient(s, p.page, {
      before: p.before as { style: CsNotebookStyle },
      after: p.after as { style: CsNotebookStyle },
    }, direction);
  }

  let nextSource: Record<number, CsStroke[]> | null = null;
  switch (p.entryType) {
    case "stroke:add":
      nextSource = applyStrokeAddInverseClient(modeSource, p.page, p.after as { stroke: CsStroke }, direction);
      break;
    case "stroke:erase":
      nextSource = applyStrokeEraseInverseClient(modeSource, p.page, p.before as { stroke: CsStroke; index: number }, direction);
      break;
    case "stroke:split":
      nextSource = applyStrokeSplitInverseClient(modeSource, p.page, {
        strokeId: p.strokeId!,
        before: p.before as { stroke: CsStroke; index: number },
        after: p.after as { replacements: CsStroke[] },
      }, direction);
      break;
    case "stroke:transform":
    case "stroke:style":
      nextSource = applyStrokeTransformInverseClient(modeSource, p.page, {
        strokeId: p.strokeId!,
        before: p.before as Partial<CsStroke>,
        after: p.after as Partial<CsStroke>,
      }, direction);
      break;
    case "stroke:text":
      nextSource = applyStrokeTextInverseClient(modeSource, p.page, {
        strokeId: p.strokeId!,
        before: p.before as CsStroke | null,
        after: p.after as CsStroke,
      }, direction);
      break;
    case "stroke:reorder":
      nextSource = applyStrokeReorderInverseClient(modeSource, p.page, { before: p.before as { order: string[] }, after: p.after as { order: string[] } }, direction);
      break;
    case "page:clear":
      nextSource = applyPageClearInverseClient(modeSource, p.page, { before: p.before as { strokes: CsStroke[] } }, direction);
      break;
    default:
      return s;
  }

  const nextByMode: Record<CsBoardMode, Record<number, CsStroke[]>> = {
    ...byMode,
    [targetMode]: nextSource ?? modeSource,
  };

  return {
    ...s,
    strokesByMode: nextByMode,
    strokesByPage: nextByMode[activeLeftMode] ?? {},
    rightStrokesByPage: nextByMode[activeRightMode] ?? {},
    currentPage: p.page,
    boardMode: p.mode,
  };
}

// page:remove/page:insert'ning teskarisi — bular sahifalar ro'yxati va
// notebookPageCount/Styles'ni ham o'zgartirgani uchun applyBoardUndoRedo'dan
// alohida, sahifa-darajasidagi mavjud reducer'larni (applyPageRemove/
// applyPdfInsert/applyNotebookPageInsert) qayta ishlatadi. Backend'dagi
// applyPageRemoveInverse/applyPageInsertInverse (Task 2) bilan bir xil
// naqsh: direction'ga qarab TO'RTTA holat (remove+undo, remove+redo,
// insert+undo, insert+redo), before/after ikkalasi ham har doim to'liq
// beriladi (faqat bittasi emas).
function applyPageUndoRedo(
  s: ClassroomState,
  p: {
    mode: CsBoardMode; entryType: string; pane?: "left" | "right";
    before: { pageIndex: number; page: { url?: string; notebookStyle?: CsNotebookStyle; strokes: CsStroke[] } } | null;
    after: { afterPageIndex: number; pages?: string[]; style?: CsNotebookStyle } | null;
  },
  direction: "undo" | "redo",
): ClassroomState {
  const pane: "left" | "right" = p.pane ?? (paneKeyForMode(s, p.mode) === "rightStrokesByPage" ? "right" : "left");

  if (p.entryType === "page:remove") {
    if (direction === "redo") {
      // redo: sahifani yana olib tashlaymiz.
      return applyPageRemove(s, { mode: p.mode, pageIndex: p.before!.pageIndex, pane });
    }
    // undo: sahifani o'zining oldingi joyiga (afterPageIndex = pageIndex - 1,
    // 0-indexed) qayta qo'yamiz, keyin qo'yilgan (bo'sh) sahifaga
    // o'chirishdan oldingi chizmalarini (va agar daftar bo'lsa naqshini)
    // qaytaramiz.
    const { pageIndex, page } = p.before!;
    const afterPageIndex = pageIndex - 1;
    const inserted = p.mode === "pdf"
      ? applyPdfInsert(s, { pages: [page.url!], afterPageIndex })
      : applyNotebookPageInsert(s, { mode: p.mode, afterPageIndex, style: page.notebookStyle ?? "grid", pane });
    const key = pane === "right" ? "rightStrokesByPage" : "strokesByPage";
    return { ...inserted, [key]: { ...inserted[key], [pageIndex]: page.strokes } };
  }

  // entryType === "page:insert"
  if (direction === "redo") {
    // redo: sahifani aynan o'sha joyga, o'sha manba bilan qayta qo'shamiz.
    const { afterPageIndex, pages, style } = p.after!;
    return p.mode === "pdf"
      ? applyPdfInsert(s, { pages: pages ?? [], afterPageIndex })
      : applyNotebookPageInsert(s, { mode: p.mode, afterPageIndex, style: style ?? "grid", pane });
  }
  // undo: qo'shilgan sahifani olib tashlaymiz (uning yangi 1-indexed
  // raqami afterPageIndex + 1).
  return applyPageRemove(s, { mode: p.mode, pageIndex: p.after!.afterPageIndex + 1, pane });
}

export function applyBoardUndo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before: unknown; after?: unknown; entries?: Array<{ mode?: CsBoardMode; page?: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before: unknown; after?: unknown }> },
): ClassroomState {
  if (p.entries && p.entries.length > 0) {
    let current = s;
    for (const item of p.entries) {
      current = applyBoardUndo(current, { ...item, mode: item.mode ?? p.mode, page: item.page ?? p.page });
    }
    return current;
  }
  if (p.entryType === "page:remove" || p.entryType === "page:insert") {
    return applyPageUndoRedo(s, { mode: p.mode, entryType: p.entryType, pane: p.pane, before: p.before as any, after: (p.after ?? null) as any }, "undo");
  }
  return applyBoardUndoRedo(s, p, "undo");
}

export function applyBoardRedo(
  s: ClassroomState,
  p: { mode: CsBoardMode; page: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before?: unknown; after?: unknown; entries?: Array<{ mode?: CsBoardMode; page?: number; entryType: string; strokeId?: string; pane?: "left" | "right"; before?: unknown; after?: unknown }> },
): ClassroomState {
  if (p.entries && p.entries.length > 0) {
    let current = s;
    for (const item of p.entries) {
      current = applyBoardRedo(current, { ...item, mode: item.mode ?? p.mode, page: item.page ?? p.page });
    }
    return current;
  }
  if (p.entryType === "page:remove" || p.entryType === "page:insert") {
    return applyPageUndoRedo(s, { mode: p.mode, entryType: p.entryType, pane: p.pane, before: (p.before ?? null) as any, after: p.after as any }, "redo");
  }
  return applyBoardUndoRedo(s, p, "redo");
}
