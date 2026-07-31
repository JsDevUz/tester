import {
  ClassroomBoardMode, ClassroomFontFamily, ClassroomNotebookOrientation, ClassroomNotebookStyle, ClassroomParticipant, ClassroomSession, ClassroomSnapshot, ClassroomStroke,
  ClassroomUndoEntry, ClassroomPageSnapshot,
} from './classroom.types';

const FONT_FAMILIES: ClassroomFontFamily[] = ['Inter', 'Arial', 'Georgia', 'Comic Sans MS', 'Nunito'];

export const LATE_AFTER_MS = 10 * 60 * 1000;
export const HOST_GRACE_MS = 90_000;
export const MAX_STROKE_POINTS = 2000;
// Amaliy foydalanishdan ancha yuqori — asosiy himoya kutubxonaning umumiy
// hajm/fayl-soni cheklovi (media-library.service.ts), bu faqat DoS'ga
// qarshi yakuniy chegara (juda ko'p sahifali PDF serverni band qilmasin).
export const MAX_PDF_PAGES = 300;
// Jonli doska va keyingi PDF eksportda mayda matnlar tiniq qolishi uchun.
// 2400px A4 sahifada taxminan 290 DPI beradi.
export const PDF_RENDER_WIDTH = 2400;

const MAX_UNDO_STACK = 100;

// Har bir tugallangan harakatni umumiy undoStack'ga qo'shadi va
// redoStack'ni to'liq tozalaydi (yangi harakat butun redo tarixini
// bekor qiladi — standart tahrirchi xatti-harakati). Stack 100 yozuvdan
// oshsa eng eskisi tashlanadi.
export function pushUndoEntry(session: ClassroomSession, entry: ClassroomUndoEntry): void {
  if (!session.undoStack) session.undoStack = [];
  session.undoStack.push(entry);
  if (session.undoStack.length > MAX_UNDO_STACK) session.undoStack.shift();
  session.redoStack = [];
}

// stroke:add'ning teskarisi — undo qo'shilgan chizmani ID bo'yicha
// o'chiradi, redo uni qayta qo'shadi.
export function applyStrokeAddInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { stroke: ClassroomStroke }, direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    map.set(page, list.filter((s) => s.id !== data.stroke.id));
  } else {
    map.set(page, [...list, data.stroke]);
  }
}

// stroke:erase'ning teskarisi — undo o'chirilgan chizmani ASL joyiga
// (index) qaytaradi (qatlam tartibi saqlanishi uchun), redo uni yana
// o'chiradi.
export function applyStrokeEraseInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { stroke: ClassroomStroke; index: number }, direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    const next = [...list];
    next.splice(data.index, 0, data.stroke);
    map.set(page, next);
  } else {
    map.set(page, list.filter((s) => s.id !== data.stroke.id));
  }
}

// stroke:transform'ning teskarisi — bitta sudrab-ko'chirish/resize/
// aylantirish gesture'ining oldingi/keyingi points+rotation+textBox
// o'lchamlarini ID bo'yicha qayta o'rnatadi.
export function applyStrokeTransformInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: {
    strokeId: string;
    before: { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number };
    after: { points: number[]; rotation?: number; textBoxWidth?: number; textBoxHeight?: number };
  },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const idx = list.findIndex((s) => s.id === data.strokeId);
  if (idx === -1) return;
  const target = direction === 'undo' ? data.before : data.after;
  list[idx] = { ...list[idx], points: [...target.points], rotation: target.rotation, textBoxWidth: target.textBoxWidth, textBoxHeight: target.textBoxHeight };
}

// stroke:style'ning teskarisi — faqat o'zgargan maydonlarni (rang,
// shrift, shape uslubi va h.k.) qisman qo'llaydi, qolganlariga tegmaydi.
export function applyStrokeStyleInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { strokeId: string; before: Partial<ClassroomStroke>; after: Partial<ClassroomStroke> },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const idx = list.findIndex((s) => s.id === data.strokeId);
  if (idx === -1) return;
  const patch = direction === 'undo' ? data.before : data.after;
  list[idx] = { ...list[idx], ...patch };
}

// stroke:text'ning teskarisi — bitta matn-tahrirlash seansining
// (ochilib-yopilishi) to'liq oldingi/keyingi holatini qo'llaydi. before
// null bo'lsa (yangi matn yaratilgan edi), undo shu chizmani butunlay
// o'chiradi.
export function applyStrokeTextInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { strokeId: string; before: ClassroomStroke | null; after: ClassroomStroke },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page) ?? [];
  if (direction === 'undo') {
    if (data.before === null) {
      map.set(page, list.filter((s) => s.id !== data.strokeId));
    } else {
      map.set(page, list.map((s) => s.id === data.strokeId ? data.before! : s));
    }
  } else {
    const exists = list.some((s) => s.id === data.strokeId);
    map.set(page, exists ? list.map((s) => s.id === data.strokeId ? data.after : s) : [...list, data.after]);
  }
}

// stroke:reorder'ning teskarisi — sahifadagi chizmalar massivini
// belgilangan ID tartibiga qayta quradi (front/back/forward/backward
// amalining oldingi/keyingi to'liq tartibi saqlangan).
export function applyStrokeReorderInverse(
  session: ClassroomSession, mode: ClassroomBoardMode, page: number,
  data: { before: { order: string[] }; after: { order: string[] } },
  direction: 'undo' | 'redo',
): void {
  const map = strokeMapFor(session, mode);
  const list = map.get(page);
  if (!list) return;
  const targetOrder = direction === 'undo' ? data.before.order : data.after.order;
  const byId = new Map(list.map((s) => [s.id, s]));
  const reordered = targetOrder.map((id) => byId.get(id)).filter((s): s is ClassroomStroke => s !== undefined);
  map.set(page, reordered);
}

export function activeStrokeMap(session: ClassroomSession): Map<number, ClassroomStroke[]> {
  const mode = session.boardMode ?? 'pdf';
  if (!session.strokesByMode) session.strokesByMode = new Map([['pdf', session.strokesByPage]]);
  let map = session.strokesByMode.get(mode);
  if (!map) {
    map = new Map();
    session.strokesByMode.set(mode, map);
  }
  session.strokesByPage = map;
  return map;
}

// MUHIM: chizmalar MODE (pdf/notebook) bo'yicha saqlanadi, PANE (chap/o'ng)
// bo'yicha EMAS — `pane` parametri faqat activeStrokeMap'ning yon
// ta'sirlaridan (session.boardMode/session.strokesByPage) himoyalanish uchun
// ishlatiladi, lekin ikkala pane bir xil session.strokesByMode havuzidan
// o'qiydi/yozadi. Avval 'right' pane uchun butunlay alohida
// (session.rightStrokesByMode) havuz ishlatilardi — shu sabab split
// taxtalarni almashtirish (swap) tugmasi bosilganda daftarga chapda
// chizilgan chizmalar o'ngga o'tganda "yo'qolib qolar", chunki ular hali
// ham eski (endi hech kim o'qimaydigan) chap havuzda qolib ketardi.
export function strokeMapFor(
  session: ClassroomSession,
  mode: ClassroomBoardMode,
): Map<number, ClassroomStroke[]> {
  const previousMode = session.boardMode;
  session.boardMode = mode;
  const map = activeStrokeMap(session);
  session.boardMode = previousMode;
  return map;
}

export function switchBoardMode(session: ClassroomSession, mode: ClassroomBoardMode): void {
  activeStrokeMap(session);
  session.boardMode = mode;
  activeStrokeMap(session);
  session.currentPage = 1;
  session.scroll = null;
}

export function isValidPage(session: ClassroomSession, page: number): boolean {
  const pageCount = (session.boardMode ?? 'pdf') === 'notebook'
    ? (session.notebookPageCount ?? 1)
    : session.pdfPages.length;
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

// Bitta daftar sahifasining amaldagi naqshini aniqlaydi: avval shu
// sahifaga tegishli alohida qiymat, bo'lmasa eski umumiy notebookStyle,
// u ham bo'lmasa 'grid'.
export function resolveNotebookPageStyle(session: ClassroomSession, page: number): ClassroomNotebookStyle {
  return session.notebookPageStyles?.[page] ?? session.notebookStyle ?? 'grid';
}

export function resolveNotebookPageOrientation(session: ClassroomSession, page: number): ClassroomNotebookOrientation {
  return session.notebookPageOrientations?.[page] ?? 'portrait';
}

// Bitta sahifani (PDF yoki daftar) olib tashlaydi va undan keyingi barcha
// sahifalar (hamda ularning chizmalari) raqamini bittaga kamaytiradi.
// Kamida 1 ta sahifa doim qolishi shart — false qaytarilsa hech narsa
// o'zgarmagan bo'ladi.
export function removePageFromSession(
  session: ClassroomSession,
  mode: 'pdf' | 'notebook',
  pageIndex: number,
): boolean {
  const previousMode = session.boardMode;
  session.boardMode = mode;
  const currentCount = mode === 'notebook' ? (session.notebookPageCount ?? 1) : session.pdfPages.length;
  if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > currentCount) {
    session.boardMode = previousMode;
    return false;
  }
  if (currentCount <= 1) {
    session.boardMode = previousMode;
    return false;
  }

  if (mode === 'pdf') {
    session.pdfPages.splice(pageIndex - 1, 1);
  } else {
    session.notebookPageCount = currentCount - 1;
    const rebuiltStyles: Record<number, ClassroomNotebookStyle> = {};
    for (const [pageStr, style] of Object.entries(session.notebookPageStyles ?? {})) {
      const page = Number(pageStr);
      if (page < pageIndex) rebuiltStyles[page] = style;
      else if (page > pageIndex) rebuiltStyles[page - 1] = style;
    }
    session.notebookPageStyles = rebuiltStyles;
    const rebuiltOrientations: Record<number, ClassroomNotebookOrientation> = {};
    for (const [pageStr, orientation] of Object.entries(session.notebookPageOrientations ?? {})) {
      const page = Number(pageStr);
      if (page < pageIndex) rebuiltOrientations[page] = orientation;
      else if (page > pageIndex) rebuiltOrientations[page - 1] = orientation;
    }
    session.notebookPageOrientations = rebuiltOrientations;
  }

  const map = strokeMapFor(session, mode);
  const rebuilt = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key < pageIndex) rebuilt.set(key, strokes);
    else if (key > pageIndex) rebuilt.set(key - 1, strokes);
    // key === pageIndex: dropped (that page's strokes are gone)
  }
  session.strokesByMode?.set(mode, rebuilt);
  if (previousMode === mode) session.strokesByPage = rebuilt;

  if (session.currentPage > pageIndex) {
    session.currentPage -= 1;
  } else if (session.currentPage === pageIndex) {
    const newCount = currentCount - 1;
    if (session.currentPage > newCount) session.currentPage = newCount;
  }

  session.boardMode = previousMode;
  return true;
}

// Daftarga yangi (bo'sh) sahifa qo'shadi — afterPageIndex'dan keyingi
// barcha sahifalar (naqsh + chizmalar) bittaga yuqoriga siljiydi.
// afterPageIndex 0-indexed qo'yish nuqtasi: 0 = birinchi sahifadan oldin,
// N = N-sahifadan keyin (removePageFromSession'ning 1-indexed pageIndex'idan farqli).
export function insertNotebookPageIntoSession(
  session: ClassroomSession,
  afterPageIndex: number,
  style: ClassroomNotebookStyle,
  orientation: ClassroomNotebookOrientation = 'portrait',
): boolean {
  if (!['grid', 'lined', 'plain'].includes(style)) return false;
  if (!['portrait', 'landscape'].includes(orientation)) return false;
  const previousMode = session.boardMode;
  session.boardMode = 'notebook';
  const currentCount = session.notebookPageCount ?? 1;
  if (!Number.isInteger(afterPageIndex) || afterPageIndex < 0 || afterPageIndex > currentCount) {
    session.boardMode = previousMode;
    return false;
  }

  session.notebookPageCount = currentCount + 1;

  const previousStyles = session.notebookPageStyles ?? {};
  const rebuiltStyles: Record<number, ClassroomNotebookStyle> = {};
  for (const [key, value] of Object.entries(previousStyles)) {
    const pageNum = Number(key);
    if (pageNum <= afterPageIndex) rebuiltStyles[pageNum] = value;
    else rebuiltStyles[pageNum + 1] = value;
  }
  rebuiltStyles[afterPageIndex + 1] = style;
  session.notebookPageStyles = rebuiltStyles;

  const previousOrientations = session.notebookPageOrientations ?? {};
  const rebuiltOrientations: Record<number, ClassroomNotebookOrientation> = {};
  for (const [key, value] of Object.entries(previousOrientations)) {
    const pageNum = Number(key);
    if (pageNum <= afterPageIndex) rebuiltOrientations[pageNum] = value;
    else rebuiltOrientations[pageNum + 1] = value;
  }
  rebuiltOrientations[afterPageIndex + 1] = orientation;
  session.notebookPageOrientations = rebuiltOrientations;

  const map = strokeMapFor(session, 'notebook');
  const rebuiltStrokes = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key <= afterPageIndex) rebuiltStrokes.set(key, strokes);
    else rebuiltStrokes.set(key + 1, strokes);
  }
  session.strokesByMode?.set('notebook', rebuiltStrokes);
  if (previousMode === 'notebook') session.strokesByPage = rebuiltStrokes;

  if (session.currentPage > afterPageIndex) session.currentPage += 1;

  session.boardMode = previousMode;
  return true;
}

// PDF'ga bir yoki bir nechta yangi sahifa qo'shadi (kutubxonaning istalgan
// faylidan bo'lishi mumkin) — afterPageIndex'dan keyingi barcha sahifalar
// (va ularning chizmalari) qo'shilgan sahifalar soniga qarab yuqoriga
// siljiydi. afterPageIndex 0-indexed (Array.splice semantikasi bilan bir xil).
export function insertPdfPagesIntoSession(
  session: ClassroomSession,
  newPages: string[],
  afterPageIndex: number,
): boolean {
  if (newPages.length === 0) return false;
  if (!Number.isInteger(afterPageIndex) || afterPageIndex < 0 || afterPageIndex > session.pdfPages.length) return false;

  session.pdfPages.splice(afterPageIndex, 0, ...newPages);

  const shiftBy = newPages.length;
  const map = strokeMapFor(session, 'pdf');
  const rebuilt = new Map<number, ClassroomStroke[]>();
  for (const [key, strokes] of map) {
    if (key <= afterPageIndex) rebuilt.set(key, strokes);
    else rebuilt.set(key + shiftBy, strokes);
  }
  session.strokesByMode?.set('pdf', rebuilt);
  if ((session.boardMode ?? 'pdf') === 'pdf') session.strokesByPage = rebuilt;

  if (session.currentPage > afterPageIndex) session.currentPage += shiftBy;

  return true;
}

// page:remove'ning teskarisi. undo — o'chirilgan sahifani (URL/naqsh +
// chizmalari bilan) removePageFromSession'ning teskari yo'nalishida
// aynan o'sha 1-indexed pageIndex'ga qayta qo'yadi (keyingi sahifalar
// yuqoriga siljiydi, insertPdfPagesIntoSession/
// insertNotebookPageIntoSession bilan bir xil reindex mantiqi). redo —
// sahifani removePageFromSession orqali yana olib tashlaydi.
export function applyPageRemoveInverse(
  session: ClassroomSession, mode: ClassroomBoardMode,
  data: { pageIndex: number; page: ClassroomPageSnapshot }, direction: 'undo' | 'redo',
): void {
  if (direction === 'redo') {
    removePageFromSession(session, mode, data.pageIndex);
    return;
  }
  // undo: pageIndex (1-indexed) o'rniga qo'yish — insert funksiyalari
  // 0-indexed afterPageIndex kutadi, shuning uchun pageIndex - 1 = "shu
  // sahifadan OLDIN qo'yish nuqtasi" (Array.splice semantikasi bilan bir xil).
  const afterPageIndex = data.pageIndex - 1;
  if (mode === 'pdf') {
    insertPdfPagesIntoSession(session, [data.page.url!], afterPageIndex);
  } else {
    insertNotebookPageIntoSession(session, afterPageIndex, data.page.notebookStyle ?? 'grid', data.page.notebookOrientation ?? 'portrait');
  }
  // Qo'yilgan (bo'sh) sahifaga o'chirishdan oldingi chizmalarni qaytaramiz.
  const map = strokeMapFor(session, mode);
  map.set(data.pageIndex, data.page.strokes);
}

// page:insert'ning teskarisi. undo — qo'shilgan sahifani
// removePageFromSession orqali olib tashlaydi. redo — sahifani xuddi
// o'sha joyga (afterPageIndex) qayta qo'yadi — pdf uchun aynan o'sha
// URL(lar), notebook uchun aynan o'sha naqsh bilan (yangidan
// kutubxonadan olib bo'lmaydi, shuning uchun URL'lar entry'ning o'zida
// saqlanadi).
export function applyPageInsertInverse(
  session: ClassroomSession, mode: ClassroomBoardMode,
  data: { afterPageIndex: number; pages?: string[]; style?: ClassroomNotebookStyle; orientation?: ClassroomNotebookOrientation }, direction: 'undo' | 'redo',
): void {
  if (direction === 'undo') {
    removePageFromSession(session, mode, data.afterPageIndex + 1);
    return;
  }
  if (mode === 'pdf') {
    insertPdfPagesIntoSession(session, data.pages ?? [], data.afterPageIndex);
  } else {
    insertNotebookPageIntoSession(session, data.afterPageIndex, data.style ?? 'grid', data.orientation ?? 'portrait');
  }
}

function validateShapeFields(stroke: ClassroomStroke): boolean {
  if (stroke.backgroundColor !== undefined && (typeof stroke.backgroundColor !== 'string' || stroke.backgroundColor.length > 32)) return false;
  if (stroke.fillStyle !== undefined && !['hachure', 'cross-hatch', 'solid'].includes(stroke.fillStyle)) return false;
  if (stroke.strokeStyle !== undefined && !['none', 'solid', 'dashed', 'dotted'].includes(stroke.strokeStyle)) return false;
  if (stroke.sloppiness !== undefined && ![0, 1, 2].includes(stroke.sloppiness)) return false;
  if (stroke.edges !== undefined && !['sharp', 'round'].includes(stroke.edges)) return false;
  if (stroke.opacity !== undefined && (!Number.isFinite(stroke.opacity) || stroke.opacity < 0 || stroke.opacity > 100)) return false;
  return true;
}

export function addStroke(session: ClassroomSession, page: number, stroke: ClassroomStroke, targetMap?: Map<number, ClassroomStroke[]>): boolean {
  if (!isValidPage(session, page)) return false;
  const { points } = stroke;
  if (!Array.isArray(points) || points.length === 0 || points.length % 2 !== 0) return false;
  if (stroke.tool === 'text') {
    if (points.length !== 2 || typeof stroke.text !== 'string' || stroke.text.trim().length === 0 || stroke.text.length > 500) return false;
    if (stroke.fontSize !== undefined && (!Number.isFinite(stroke.fontSize) || stroke.fontSize < 1 || stroke.fontSize > 96)) return false;
    if (stroke.fontWeight !== undefined && ![400, 500, 600, 700].includes(stroke.fontWeight)) return false;
    if (stroke.fontFamily !== undefined && !FONT_FAMILIES.includes(stroke.fontFamily)) return false;
    if (stroke.textAlign !== undefined && !['left', 'center', 'right'].includes(stroke.textAlign)) return false;
    if (stroke.textBoxWidth !== undefined && (!Number.isFinite(stroke.textBoxWidth) || stroke.textBoxWidth < 4 || stroke.textBoxWidth > 1000)) return false;
    if (stroke.textBoxHeight !== undefined && (!Number.isFinite(stroke.textBoxHeight) || stroke.textBoxHeight < 1 || stroke.textBoxHeight > 2000)) return false;
    if (stroke.rotation !== undefined && (!Number.isFinite(stroke.rotation) || stroke.rotation < -360 || stroke.rotation > 360)) return false;
  }
  if (stroke.tool === 'rectangle' || stroke.tool === 'ellipse') {
    if (points.length !== 4) return false;
    if (!validateShapeFields(stroke)) return false;
    if (stroke.rotation !== undefined && (!Number.isFinite(stroke.rotation) || stroke.rotation < -360 || stroke.rotation > 360)) return false;
  }
  if (points.length > MAX_STROKE_POINTS * 2) return false;
  if (points.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return false;
  const map = targetMap ?? activeStrokeMap(session);
  const list = map.get(page) ?? [];
  list.push(stroke);
  map.set(page, list);
  return true;
}

/** Tanlangan text stroke sozlamalarini (font, o'lcham, rang, burilish va
 * o'lcham) ID bo'yicha atomik ravishda yangilaydi. */
export function updateTextStroke(
  session: ClassroomSession, page: number, updated: ClassroomStroke,
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  if (updated.tool !== 'text' || !isValidPage(session, page)) return false;
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const index = list.findIndex((item) => item.id === updated.id);
  if (index === -1) return false;
  const candidate = { ...updated, points: [...updated.points] };
  if (!addStrokeValidation(candidate)) return false;
  list[index] = candidate;
  return true;
}

function addStrokeValidation(stroke: ClassroomStroke): boolean {
  const points = stroke.points;
  if (!Array.isArray(points) || points.length !== 2 || points.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return false;
  if (typeof stroke.text !== 'string' || stroke.text.trim().length === 0 || stroke.text.length > 500) return false;
  if (stroke.fontSize !== undefined && (!Number.isFinite(stroke.fontSize) || stroke.fontSize < 1 || stroke.fontSize > 96)) return false;
  if (stroke.fontWeight !== undefined && ![400, 500, 600, 700].includes(stroke.fontWeight)) return false;
  if (stroke.fontFamily !== undefined && !FONT_FAMILIES.includes(stroke.fontFamily)) return false;
  if (stroke.textAlign !== undefined && !['left', 'center', 'right'].includes(stroke.textAlign)) return false;
  if (stroke.textBoxWidth !== undefined && (!Number.isFinite(stroke.textBoxWidth) || stroke.textBoxWidth < 4 || stroke.textBoxWidth > 1000)) return false;
  if (stroke.textBoxHeight !== undefined && (!Number.isFinite(stroke.textBoxHeight) || stroke.textBoxHeight < 1 || stroke.textBoxHeight > 2000)) return false;
  return stroke.rotation === undefined || (Number.isFinite(stroke.rotation) && stroke.rotation >= -360 && stroke.rotation <= 360);
}

/** Tanlangan shape (rectangle/ellipse) stroke sozlamalarini (rang, fon,
 * fill/stroke uslubi, sloppiness, burchak, shaffoflik, o'lcham) ID bo'yicha
 * atomik ravishda yangilaydi. */
export function updateShapeStroke(
  session: ClassroomSession, page: number, updated: ClassroomStroke,
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  if (updated.tool === 'text' || !isValidPage(session, page)) return false;
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const index = list.findIndex((item) => item.id === updated.id);
  if (index === -1) return false;
  const candidate = { ...updated, points: [...updated.points] };
  if (candidate.points.length === 0 || candidate.points.length % 2 !== 0 || candidate.points.length > MAX_STROKE_POINTS * 2) return false;
  if (candidate.points.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return false;
  if ((candidate.tool === 'rectangle' || candidate.tool === 'ellipse') && candidate.points.length !== 4) return false;
  if (!validateShapeFields(candidate)) return false;
  if (candidate.rotation !== undefined && (!Number.isFinite(candidate.rotation) || candidate.rotation < -360 || candidate.rotation > 360)) return false;
  list[index] = candidate;
  return true;
}

export function updateStrokePosition(
  session: ClassroomSession, page: number, strokeId: string, x: number, y: number,
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  const stroke = list?.find((item) => item.id === strokeId);
  if (!stroke || stroke.points.length < 2) return false;
  const dx = x - stroke.points[0];
  const dy = y - stroke.points[1];
  const moved = stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
  if (moved.some((value) => value < 0 || value > 1)) return false;
  stroke.points = moved;
  return true;
}

export function undoStroke(session: ClassroomSession, page: number, targetMap?: Map<number, ClassroomStroke[]>): string | null {
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list || list.length === 0) return null;
  return list.pop()!.id;
}

// Stroke-eraser asbobi uchun — ID bo'yicha aniq bitta chizmani (oxirgisi
// bo'lmasa ham) o'chiradi. targetMap berilmasa, joriy session.boardMode'ga
// mos xarita ishlatiladi (split rejimida noto'g'ri natija berishi mumkin,
// shuning uchun chaqiruvchi tomon har doim aniq mode/pane orqali strokeMapFor
// natijasini berishi kerak).
export function eraseStroke(session: ClassroomSession, page: number, strokeId: string, targetMap?: Map<number, ClassroomStroke[]>): boolean {
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const idx = list.findIndex((s) => s.id === strokeId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// Layer tartibini o'zgartirish: massiv tartibi = render tartibi (z-order),
// shuning uchun alohida zIndex maydoni shart emas — faqat massivda
// ko'chirish kifoya. Guruh (bir nechta strokeIds) uchun ularning o'zaro
// nisbiy tartibi saqlanadi.
export function reorderStrokes(
  session: ClassroomSession, page: number, strokeIds: string[],
  op: 'front' | 'back' | 'forward' | 'backward',
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  if (!isValidPage(session, page) || strokeIds.length === 0) return false;
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const idSet = new Set(strokeIds);
  if (![...idSet].every((id) => list.some((s) => s.id === id))) return false;

  if (op === 'front' || op === 'back') {
    const selected = list.filter((s) => idSet.has(s.id));
    const rest = list.filter((s) => !idSet.has(s.id));
    const next = op === 'front' ? [...rest, ...selected] : [...selected, ...rest];
    list.splice(0, list.length, ...next);
    return true;
  }

  // forward: har bir tanlangan elementni undan keyingi (tanlanmagan)
  // qo'shni bilan almashtiradi; backward — oldingisi bilan. Eng chetdagi
  // (front/back'da allaqachon turgan) elementlar o'tkazib yuboriladi.
  const step = op === 'forward' ? 1 : -1;
  const indices = op === 'forward'
    ? [...list.keys()].filter((i) => idSet.has(list[i].id)).reverse()
    : [...list.keys()].filter((i) => idSet.has(list[i].id));
  for (const i of indices) {
    const j = i + step;
    if (j < 0 || j >= list.length || idSet.has(list[j].id)) continue;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return true;
}

// Pixel-eraser (segment-darajasida): bitta eski chizmani o'sha o'rniga
// (bir xil tartibda) bir nechta yangi kesim-chizmalar bilan almashtiradi —
// masalan uzun chiziqning o'rtasi o'chirilganda ikki bo'lakka bo'linadi.
export function splitStroke(
  session: ClassroomSession, page: number, strokeId: string, replacements: ClassroomStroke[],
  targetMap?: Map<number, ClassroomStroke[]>,
): boolean {
  const list = (targetMap ?? activeStrokeMap(session)).get(page);
  if (!list) return false;
  const idx = list.findIndex((s) => s.id === strokeId);
  if (idx === -1) return false;
  for (const r of replacements) {
    if (!Array.isArray(r.points) || r.points.length < 4 || r.points.length % 2 !== 0) return false;
    if (r.points.length > MAX_STROKE_POINTS * 2) return false;
    if (r.points.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return false;
  }
  list.splice(idx, 1, ...replacements);
  return true;
}

export function clearPage(session: ClassroomSession, page: number, targetMap?: Map<number, ClassroomStroke[]>): void {
  (targetMap ?? activeStrokeMap(session)).set(page, []);
}

export function setPage(session: ClassroomSession, page: number): boolean {
  if (!isValidPage(session, page)) return false;
  session.currentPage = page;
  return true;
}

export function attendanceStatusOnJoin(startedAtMs: number, nowMs: number): 'present' | 'late' {
  return nowMs - startedAtMs > LATE_AFTER_MS ? 'late' : 'present';
}

export function closeInterval(participant: ClassroomParticipant, nowMs: number): number {
  if (participant.joinedAtMs === null) return 0;
  const added = Math.max(0, Math.round((nowMs - participant.joinedAtMs) / 1000));
  participant.totalSeconds += added;
  participant.joinedAtMs = null;
  return added;
}

export function buildSnapshot(session: ClassroomSession): ClassroomSnapshot {
  const strokesByPage: Record<number, ClassroomStroke[]> = {};
  for (const [page, strokes] of activeStrokeMap(session)) strokesByPage[page] = strokes;
  const rightStrokesByPage: Record<number, ClassroomStroke[]> = {};
  const rightMode = session.rightBoardMode ?? session.boardMode ?? 'pdf';
  for (const [page, strokes] of strokeMapFor(session, rightMode)) rightStrokesByPage[page] = strokes;
  return {
    sessionId: session.id,
    pdfName: session.pdfName,
    pages: session.pdfPages,
    currentPage: session.currentPage,
    strokesByPage,
    rightStrokesByPage,
    participants: [...session.participants.values()].map((p) => ({
      userId: p.userId, name: p.name, online: p.socketId !== null, status: p.status,
    })),
    startedAt: session.startedAtMs,
    hostOnline: session.hostSocketId !== null,
    zoom: session.zoom,
    rightZoom: session.rightZoom ?? session.zoom,
    splitRatio: session.splitRatio ?? 0.5,
    notebookPageCount: session.notebookPageCount ?? 1,
    notebookPageStyles: session.notebookPageStyles ?? {},
    notebookPageOrientations: session.notebookPageOrientations ?? {},
    scroll: session.scroll,
    rightScroll: session.rightScroll ?? null,
    isFree: session.isFree,
    boardMode: session.boardMode ?? 'pdf',
    boardLayout: session.boardLayout ?? 'single',
    leftBoardMode: session.leftBoardMode ?? session.boardMode ?? 'pdf',
    rightBoardMode: session.rightBoardMode ?? session.boardMode ?? 'pdf',
    classroomTheme: session.classroomTheme ?? 'light',
    notebookStyle: session.notebookStyle ?? 'grid',
  };
}
