import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, BringToFront, ChevronsDown, ChevronsUp, Columns2, Copy, Grid3x3, Minus, Move, Plus, Repeat2, RotateCcw as ResetZoom, RotateCw, SendToBack, Square, Trash2 } from "lucide-react";
import type {
  CsBoardLayout, CsBoardMode, CsEdges, CsFillStyle, CsFontFamily, CsNotebookStyle, CsPointer, CsScrollPosition,
  CsStroke, CsStrokeStyle, CsTool,
} from "../../api/classroom";
import { useAutoHideOverlay } from "../../hooks/useAutoHideOverlay";
import { useClassroomScrollSync } from "../../hooks/useClassroomScrollSync";
import { useClassroomZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from "../../hooks/useClassroomZoom";
import { getStroke } from "perfect-freehand";

// Chizish uchun reference kenglik — stroke.width shu kenglikdagi px deb saqlanadi
const REF_WIDTH = 1000;
// PDF 100% holatda daftar bilan bir xilroq masofada ko'rinishi uchun
// viewport kengligining biroz kichikroq qismi ishlatiladi. Toolbar'dagi
// ko'rsatiladigan zoom foizi esa foydalanuvchi uchun baribir 100% bo'lib qoladi.
const PDF_BASE_SCALE = 0.78;
const MAX_DPR = 2;

// To'rtburchak/doira asboblari uchun joriy uslub — Excalidraw'dagi
// "current item style" ga o'xshash: yangi shape shu qiymatlar bilan
// yaratiladi, tanlangan shape esa buni sidebar orqali o'zgartirishi mumkin.
export interface ShapeStyle {
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeStyle: CsStrokeStyle;
  edges: CsEdges;
  opacity: number;
}

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  backgroundColor: "transparent", fillStyle: "hachure", strokeStyle: "solid", edges: "sharp", opacity: 100,
};

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

// <textarea> bo'shliqsiz uzun so'zni ham (masalan tasodifiy bosilgan
// klaviatura ketma-ketligi) o'z eni bo'yicha harf-harf sindirib ko'rsatadi —
// canvas'dagi so'z-darajasidagi wrap esa bunday so'zni sindirmay bitta
// qatorda qoldirib, saqlangandan keyin matn qutidan chiqib ketishiga (yoki
// bitta cheksiz uzun qatorga aylanishiga) olib kelardi. Shu funksiya har
// ikkala joyda (o'lchashda ham, chizishda ham) BIR XIL qatorlarga bo'lish
// natijasini beradi: so'zlar orasida, va agar bitta so'zning o'zi qutidan
// kengroq bo'lsa — harflar orasida ham sindiriladi.
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      let candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = "";
        candidate = word;
      }
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      // Bitta so'zning o'zi ham qutidan kengroq — harf-harf sindiramiz.
      let chunk = line;
      for (const ch of candidate.slice(line.length)) {
        const next = chunk + ch;
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

// Matn qutisi Excalidraw'dagidek AYNAN matn o'lchamiga mos (tight-fit)
// bo'lishi uchun — textarea/eski stroke qanday o'lchamda saqlangan bo'lishidan
// qat'i nazar, har safar font/matn o'zgarganda kenglik+balandlik haqiqiy
// render qilingan qatorlar asosida qayta hisoblanadi (stored qiymatga
// ishonilmaydi — aks holda masalan shrift o'lchami kattalashtirilganda matn
// eski (kichik) qutidan tashqariga chiqib ketardi). maxWrapWidth berilsa
// (masalan textarea joriy eni) undan kengroq bo'lmaydi — aks holda bo'shliqsiz
// uzun matn hech qachon sindirilmay bitta cheksiz qator bo'lib qolardi.
function measureTextBox(
  text: string, fontFamily: CsFontFamily, fontSize: number, fontWeight: 400 | 500 | 600 | 700,
  maxWrapWidth?: number,
): { width: number; height: number } {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const lines = maxWrapWidth ? wrapTextLines(ctx, text, maxWrapWidth) : text.split("\n");
  let max = 0;
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width);
  const lineHeight = fontSize * 1.25;
  return {
    width: Math.max(20, Math.ceil(max)),
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

export type DrawTool = CsTool | "laser" | "arrow" | "select" | "eraser-pixel" | "eraser-stroke" | "lasso";

interface Props {
  // Ustoz hozirgacha ochgan barcha sahifalar (1-indexed ko'rinishda tartiblangan)
  pageUrls: string[];
  // 1-indexed — ustozning joriy sahifasi. Sinxron rejimda shu yerga scroll qilinadi.
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  rightStrokesByPage?: Record<number, CsStroke[]>;
  pointer: CsPointer | null;
  editable: boolean;
  // Ustoz uchun erkin/sinxron toggle ko'rsatilmaydi — u har doim o'zi boshqaradi.
  isHost: boolean;
  // Ustozning serverga saqlangan zoom darajasi — o'quvchi sinxron rejimda
  // shunga moslashadi. Ustoz uchun bu boshlang'ich qiymat, keyin local
  // boshqariladi (onZoomChange orqali serverga yuboriladi).
  hostZoom: number;
  rightHostZoom?: number;
  // Split panel chap qismining umumiy kenglikka nisbati (0.2-0.8). Ustoz
  // uchun boshlang'ich qiymat, keyin local boshqariladi (onSetSplitRatio
  // orqali serverga yuboriladi). Berilmasa 0.5 (teng) ishlatiladi.
  hostSplitRatio?: number;
  onSetSplitRatio?: (ratio: number) => void;
  onZoomChange?: (zoom: number) => void;
  onPaneZoomChange?: (pane: "left" | "right", zoom: number) => void;
  // Ustozning aniq scroll pozitsiyasi — sahifa raqami + o'sha sahifa
  // balandligi ichidagi nisbiy joy. Device/ekran o'lchamidan qat'i nazar
  // bir xil joyni bildiradi (umumiy scrollHeight'ga bog'liq emas).
  hostScroll: CsScrollPosition | null;
  rightHostScroll?: CsScrollPosition | null;
  onScrollChange?: (page: number, yRatio: number, xRatio: number) => void;
  onPaneScrollChange?: (pane: "left" | "right", page: number, yRatio: number, xRatio: number) => void;
  tool: DrawTool;
  // Matn yozib bo'lib saqlagach avtomatik "select" asboziga o'tish uchun —
  // Excalidraw/Miro kabi, matn yozib bo'lgach darhol qayta tanlash/tahrirlash
  // mumkin bo'lishi kerak, "text" asbobi bilan yana bosib yangi matn
  // boshlanib qolmasin.
  onToolChange?: (tool: DrawTool) => void;
  color: string;
  onColorChange?: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange?: (width: number) => void;
  // To'rtburchak/doira asboblari uchun joriy uslub — yangi shape shu
  // qiymatlar bilan yaratiladi. onShapeStyleChange — hali hech narsa
  // chizilmagan, faqat asbob tanlangan holatda ham (Excalidraw kabi)
  // sozlamalar panelini ko'rsatish uchun.
  shapeStyle?: ShapeStyle;
  onShapeStyleChange?: (style: ShapeStyle) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke) => void;
  onPaneUpdateShapeStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, stroke: CsStroke) => void;
  onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
  onPaneReorderStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
  onStrokeComplete?: (page: number, stroke: CsStroke) => void;
  onMoveStroke?: (page: number, strokeId: string, x: number, y: number) => void;
  onPaneMoveStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeId: string, x: number, y: number) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke) => void;
  onPaneUpdateTextStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, stroke: CsStroke) => void;
  onPaneStrokeComplete?: (pane: "left" | "right", mode: CsBoardMode, page: number, stroke: CsStroke) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean, pane: "left" | "right") => void;
  onEraseStroke?: (page: number, strokeId: string) => void;
  onPaneEraseStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeId: string) => void;
  // Pixel-eraser: bitta chizmani (strokeId) bir nechta yangi kesim-chizmalar
  // bilan almashtiradi (segment-darajasida o'chirish natijasi).
  onSplitStroke?: (page: number, strokeId: string, replacements: CsStroke[]) => void;
  onPaneSplitStroke?: (pane: "left" | "right", mode: CsBoardMode, page: number, strokeId: string, replacements: CsStroke[]) => void;
  // Ustoz qo'lda scroll qilib sahifa almashtirganda chaqiriladi (faqat isHost=true'da) —
  // shu orqali toolbar'dagi sahifa raqami va serverga yuboriladigan currentPage yangilanadi.
  onPageChange?: (page: number) => void;
  // PDF konteyner ustiga (absolute) chizish asboblari panelini joylashtirish
  // uchun — shu konteyner ichida bo'lishi kerak, aks holda uning DOM
  // balandligi PDF konteyner balandligini o'zgartirib scroll-ratio
  // hisoblarini (xRatio/yRatio) buzadi.
  toolbar?: ReactNode;
  // Toolbar qatorining o'ng tomoni — mikrofon, o'quvchilar, darsni
  // yakunlash kabi tugmalar uchun (faqat isHost holatida beriladi).
  toolbarActions?: ReactNode;
  // Split rejimda foydalanuvchi oxirgi marta qaysi panelda (chizma/matn
  // ustiga bosib) faol bo'lganini ota komponentga xabar beradi — toolbar
  // (Undo/Clear) ota tomonda tuzilgani uchun, u qaysi panelni nishonlashni
  // bilishi kerak. Har doim "left"/"right" qiymati bilan chaqiriladi,
  // hatto single (split bo'lmagan) rejimda ham har doim "left".
  onActivePaneChange?: (pane: "left" | "right") => void;
  boardMode: CsBoardMode;
  onBoardModeChange?: (mode: CsBoardMode) => void;
  boardLayout?: CsBoardLayout;
  leftBoardMode?: CsBoardMode;
  rightBoardMode?: CsBoardMode;
  onBoardViewChange?: (layout: CsBoardLayout, left: CsBoardMode, right: CsBoardMode) => void;
  // Har bir daftar sahifasining o'z naqshi (sahifa raqami -> naqsh).
  notebookPageStyles?: Record<number, CsNotebookStyle>;
  // Statik replay/snapshot ko'rinishi uchun — hech qanday jonli host yo'q,
  // shuning uchun "ustoz bilan sinxronlash" tugmasi ma'nosiz (sinxronlanadigan
  // harakat umuman saqlanmagan). Bunday holatda foydalanuvchi har doim
  // erkin scroll/zoom qila oladi, tugma esa butunlay yashiriladi.
  noSync?: boolean;
  // Daftar sahifalari soni (server-boshqaruvli, o'zgaruvchan) — endi
  // qattiq 4 emas, session.notebookPageCount'dan keladi.
  notebookPageCount?: number;
  onRemovePage?: (mode: CsBoardMode, pageIndex: number, pane: "left" | "right") => void;
  // Faqat ustoz uchun: "+" bosilganda PDF rejimida chaqiriladi (kutubxona
  // tanlash oqimini ochish uchun) — afterPageIndex shu sahifadan keyin
  // qo'yish nuqtasi (0-indexed).
  onInsertPdfPage?: (afterPageIndex: number, pane: "left" | "right") => void;
  onInsertNotebookPage?: (afterPageIndex: number, style: CsNotebookStyle, pane: "left" | "right") => void;
}

// O'q boshi (arrowhead) REF_WIDTH'ga nisbiy o'lchamda chiziladi (xuddi
// strokeWidth kabi) — shunda ekran/qurilma o'lchamidan (mobil/desktop)
// qat'i nazar sahifaga nisbatan bir xil ko'rinishda bo'ladi. Chiziq
// qanchalik uzun bo'lmasin, uchi kattalashib ketmaydi.
const ARROW_HEAD_LEN_REF = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

function drawArrow(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number, dimmed?: boolean) {
  const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.globalAlpha = dimmed ? 0.25 : 1;
  ctx.lineWidth = Math.max(1, s.width * (w / REF_WIDTH));

  const angle = Math.atan2(y1 - y0, x1 - x0);
  const dist = Math.hypot(x1 - x0, y1 - y0);
  // O'q boshi REF_WIDTH'ga nisbiy sobit uzunlikda — Excalidraw'dagi kabi
  // qalinlik oshsa juda sekin (chiziqli emas) kattalashadi va qattiq
  // maksimal chegaraga ega, shuning uchun chiziq qanchalik qalin yoki
  // uzun bo'lmasin, boshi hech qachon nomutanosib katta bo'lib ketmaydi.
  // Qisqa chiziqlarda esa boshi butun chiziqdan uzun chiqmasin deb
  // dist/3 bilan ham cheklanadi.
  // headLen endi bevosita stroke.width (REF_WIDTH'ga nisbiy chiziq
  // qalinligi)ga proporsional — lasso bilan butun o'q strelkasi
  // kichraytirilganda (stroke.width ham shu bilan proporsional kamayadi)
  // o'q boshi ham HAQIQIY ravishda kichrayadi, faqat ctx.lineWidth'ning
  // (piksel darajasidagi) o'zi orqali emas. REF_WIDTH'dagi odatiy
  // qalinlik (~4) uchun ARROW_HEAD_LEN_REF chiqadigan qilib normallashtirilgan.
  const arrowHeadLen = ARROW_HEAD_LEN_REF * (w / REF_WIDTH) * Math.max(0.35, Math.min(1.4, s.width / 4));
  const headLen = Math.min(arrowHeadLen, dist / 3);

  // Shaft to'g'ridan-to'g'ri o'q uchigacha (x1,y1) chiziladi — headLen
  // masofasida oldinroq to'xtatilmaydi, aks holda shaft uchi va "V" boshining
  // orqa uchlari turli burchakda bo'lgani uchun ular orasida bo'shliq
  // (uzilish) hosil bo'lardi. Head endi shaft ustidan chiziladi va ikkovi
  // doim x1,y1 nuqtasida ustma-ust tegib turadi.
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  // Ochiq "V" (>) shaklidagi o'q boshi — closePath yo'q, ikkita alohida
  // qiya chiziq, shuning uchun orqa tomoni yopiq uchburchak bo'lmaydi.
  ctx.beginPath();
  ctx.moveTo(x1 - headLen * Math.cos(angle - ARROW_HEAD_ANGLE), y1 - headLen * Math.sin(angle - ARROW_HEAD_ANGLE));
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - headLen * Math.cos(angle + ARROW_HEAD_ANGLE), y1 - headLen * Math.sin(angle + ARROW_HEAD_ANGLE));
  ctx.stroke();
  ctx.restore();
}

// Oddiy to'g'ri chiziq — arrow bilan bir xil bounding-box draft/hit-test
// yo'lini ishlatadi, faqat o'q boshi chizilmaydi.
function drawLine(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number, dimmed?: boolean) {
  const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.globalAlpha = dimmed ? 0.25 : 1;
  ctx.lineWidth = Math.max(1, s.width * (w / REF_WIDTH));
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawRoundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// Hachure/cross-hatch fill: shape yo'lini clip qilib, ichiga parallel
// chiziqlar (cross-hatch uchun ikki yo'nalishda) chiziladi — Excalidraw'ning
// "qo'lda chizilgan shtrix" fon uslubiga o'xshash, "solid" dan farqli.
function paintHachureFill(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number,
  color: string, crossHatch: boolean, scale: number,
) {
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  const gap = Math.max(4, 7 * scale);
  const diag = Math.hypot(width, height);
  const draw45 = (sign: 1 | -1) => {
    ctx.beginPath();
    for (let offset = -diag; offset < diag; offset += gap) {
      const x0 = x + offset;
      const y0 = y;
      const x1 = x + offset + sign * height;
      const y1 = y + height;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };
  draw45(1);
  if (crossHatch) draw45(-1);
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number, dimmed?: boolean) {
  const [x0raw, y0raw, x1raw, y1raw] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const x = Math.min(x0raw, x1raw);
  const y = Math.min(y0raw, y1raw);
  const width = Math.abs(x1raw - x0raw);
  const height = Math.abs(y1raw - y0raw);
  if (width < 1 || height < 1) return;

  ctx.save();
  if (s.rotation) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(s.rotation * Math.PI / 180);
    ctx.translate(-centerX, -centerY);
  }
  const strokeAlpha = dimmed ? 0.25 : 1;
  const fillAlpha = strokeAlpha * ((s.opacity ?? 100) / 100);
  ctx.globalAlpha = strokeAlpha;
  const scale = w / REF_WIDTH;
  const lineWidth = Math.max(1, s.width * scale);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokeStyle = s.strokeStyle ?? "solid";
  if (strokeStyle === "dashed") ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
  else if (strokeStyle === "dotted") ctx.setLineDash([lineWidth, lineWidth * 1.5]);
  else ctx.setLineDash([]);

  const radius = s.edges === "round" ? Math.min(width, height) * 0.12 : 0;

  const buildPath = () => {
    if (s.tool === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else {
      drawRoundRectPath(ctx, x, y, width, height, radius);
    }
  };

  const background = s.backgroundColor;
  if (background && background !== "transparent") {
    const fillStyle = s.fillStyle ?? "hachure";
    buildPath();
    ctx.globalAlpha = fillAlpha;
    if (fillStyle === "solid") {
      ctx.fillStyle = background;
      ctx.fill();
    } else {
      paintHachureFill(ctx, x, y, width, height, background, fillStyle === "cross-hatch", scale);
    }
  }

  ctx.globalAlpha = strokeAlpha;
  if (strokeStyle !== "none") {
    buildPath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number, dimmed?: boolean) {
  if (s.points.length < 2) return;
  if (s.tool === "text") {
    if (!s.text) return;
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.globalAlpha = dimmed ? 0.25 : 1;
    const referenceFontSize = s.fontSize ?? Math.max(14, s.width * 6);
    const renderedFontSize = Math.max(1, referenceFontSize * (w / REF_WIDTH));
    ctx.font = `${s.fontWeight ?? 600} ${renderedFontSize}px ${s.fontFamily ?? "Inter"}`;
    ctx.textBaseline = "alphabetic";
    const lineHeight = renderedFontSize * 1.25;
    const boxWidth = (s.textBoxWidth ?? 320) * (w / REF_WIDTH);
    const lines = wrapTextLines(ctx, s.text, boxWidth);
    const originX = s.points[0] * w;
    const originY = s.points[1] * h;
    const boxHeight = (s.textBoxHeight ?? Math.max(lineHeight, lines.length * lineHeight)) * (w / REF_WIDTH);
    // textBaseline:"top" shrift ustidagi taxminiy "leading/2" masofasi bilan
    // ishlaydi — bu haqiqiy shriftga qarab (Georgia, Comic Sans va h.k. turli
    // ascent nisbatiga ega) farq qilib, matn tahrirlashda ko'ringan joydan
    // saqlangandan keyin bir oz yuqoriroqqa chiqib qolardi. Shrift metrikasi
    // (actualBoundingBoxAscent) bilan har bir qatorning haqiqiy tepasini
    // aniq hisoblab, "alphabetic" baseline'ga moslab chizamiz — bu <textarea>
    // ichida ko'ringan qator boshlanish nuqtasi bilan har qanday shrift/
    // o'lchamda bir xil natija beradi.
    const measureLine = lines.find((line) => line.trim().length > 0) ?? "M";
    const ascent = ctx.measureText(measureLine).actualBoundingBoxAscent || renderedFontSize * 0.8;
    const lineTopOffset = (lineHeight - renderedFontSize) / 2 + ascent;
    const align = s.textAlign ?? "left";
    const lineX = (line: string) => {
      if (align === "left") return 0;
      const lineWidth = ctx.measureText(line).width;
      return align === "center" ? (boxWidth - lineWidth) / 2 : boxWidth - lineWidth;
    };
    if (s.rotation) {
      ctx.translate(originX + boxWidth / 2, originY + boxHeight / 2);
      ctx.rotate(s.rotation * Math.PI / 180);
      lines.forEach((line, index) => ctx.fillText(line, -boxWidth / 2 + lineX(line), -boxHeight / 2 + lineTopOffset + index * lineHeight));
    } else {
      lines.forEach((line, index) => ctx.fillText(line, originX + lineX(line), originY + lineTopOffset + index * lineHeight));
    }
    ctx.restore();
    return;
  }
  if (s.tool === "arrow") {
    if (s.points.length >= 4) drawArrow(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "line") {
    if (s.points.length >= 4) drawLine(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "rectangle" || s.tool === "ellipse") {
    if (s.points.length >= 4) drawShape(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "pen") {
    const pointCount = Math.floor(s.points.length / 2);
    const hasRealPressure = s.pressures?.length === pointCount;
    const input: number[][] = Array.from({ length: pointCount }, (_, index) =>
      hasRealPressure
        ? [s.points[index * 2] * w, s.points[index * 2 + 1] * h, s.pressures![index]]
        : [s.points[index * 2] * w, s.points[index * 2 + 1] * h],
    );
    const size = Math.max(1, s.width * (w / REF_WIDTH));
    const outline = getStroke(input, {
      size,
      thinning: 0.58,
      smoothing: 0.62,
      streamline: 0.48,
      simulatePressure: !hasRealPressure,
      easing: (pressure) => pressure,
      start: { taper: size * 0.65, cap: true },
      end: { taper: size * 1.8, cap: true },
    });
    if (outline.length > 0) {
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let index = 1; index < outline.length; index += 1) {
        const current = outline[index];
        const next = outline[(index + 1) % outline.length];
        ctx.quadraticCurveTo(
          current[0],
          current[1],
          (current[0] + next[0]) / 2,
          (current[1] + next[1]) / 2,
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(1, s.width * (w / REF_WIDTH));
  const baseAlpha = s.tool === "highlighter" ? 0.35 : 1;
  // Stroke-eraser hover-preview: o'chirilishi mumkin bo'lgan chizma
  // xiralashib ko'rsatiladi, foydalanuvchi nima o'chishini oldindan ko'radi.
  ctx.globalAlpha = dimmed ? baseAlpha * 0.25 : baseAlpha;
  ctx.beginPath();
  if (s.points.length === 2) {
    ctx.moveTo(s.points[0] * w, s.points[1] * h);
    ctx.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
  } else if (s.points.length === 4) {
    ctx.moveTo(s.points[0] * w, s.points[1] * h);
    ctx.lineTo(s.points[2] * w, s.points[3] * h);
  } else {
    // Nuqtalar orasidagi burchaklarni silliqlash uchun har juft nuqtaning
    // o'rta nuqtasiga quadratic curve tortiladi (Catmull-Rom emas, lekin
    // tez harakatda siyraklashgan nuqtalarni ham silliq ko'rsatadi).
    ctx.moveTo(s.points[0] * w, s.points[1] * h);
    let prevX = s.points[0] * w;
    let prevY = s.points[1] * h;
    for (let i = 2; i + 1 < s.points.length; i += 2) {
      const curX = s.points[i] * w;
      const curY = s.points[i + 1] * h;
      const midX = (prevX + curX) / 2;
      const midY = (prevY + curY) / 2;
      ctx.quadraticCurveTo(prevX, prevY, midX, midY);
      prevX = curX;
      prevY = curY;
    }
    ctx.lineTo(prevX, prevY);
  }
  ctx.stroke();
  ctx.restore();
}

// Nuqta stroke chizig'iga (yoki uning segmentiga) shu masofadan (normalized,
// 0..1) yaqin bo'lsa "tegdi" deb hisoblanadi. Chiziq qalinligi (strokeWidth,
// REF_WIDTH=1000 birligida) ga proportsional — qalinroq chiziq bilan ishlaganda
// o'chirg'ich radiusi ham kattaroq bo'ladi, foydalanuvchi ko'rgan doiraga mos keladi.
const ERASE_HIT_BASE = 0.0025;
function eraseHitRadius(strokeWidth: number): number {
  return ERASE_HIT_BASE + (strokeWidth / REF_WIDTH) * 1;
}

function distToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx;
  const cy = y0 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// To'rtburchak/doira uchun: chegara yaqinida (border) yoki fon rangi
// bo'lsa ichida ham "tegdi" deb hisoblanadi — Excalidraw'da shaklning
// to'ldirilgan ichi ham bosilganda tanlanadi/o'chadi, faqat chegarasi emas.
function hitTestShape(stroke: CsStroke, x: number, y: number, hitRadius: number, includeInterior = false): boolean {
  const [x0, y0, x1, y1] = stroke.points;
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  let localX = x;
  let localY = y;
  if (stroke.rotation) {
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const angle = -stroke.rotation * Math.PI / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    localX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
    localY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  const hasFill = Boolean(stroke.backgroundColor) && stroke.backgroundColor !== "transparent";
  if (hasFill || includeInterior) {
    if (stroke.tool === "ellipse") {
      const radiusX = Math.max((right - left) / 2, hitRadius);
      const radiusY = Math.max((bottom - top) / 2, hitRadius);
      const nx = (localX - (left + right) / 2) / (radiusX + hitRadius);
      const ny = (localY - (top + bottom) / 2) / (radiusY + hitRadius);
      return nx * nx + ny * ny <= 1;
    }
    return localX >= left - hitRadius && localX <= right + hitRadius && localY >= top - hitRadius && localY <= bottom + hitRadius;
  }
  const nearVerticalEdge = (localX >= left - hitRadius && localX <= left + hitRadius) || (localX >= right - hitRadius && localX <= right + hitRadius);
  const nearHorizontalEdge = (localY >= top - hitRadius && localY <= top + hitRadius) || (localY >= bottom - hitRadius && localY <= bottom + hitRadius);
  const withinVerticalSpan = localY >= top - hitRadius && localY <= bottom + hitRadius;
  const withinHorizontalSpan = localX >= left - hitRadius && localX <= right + hitRadius;
  return (nearVerticalEdge && withinVerticalSpan) || (nearHorizontalEdge && withinHorizontalSpan);
}

function findSelectableShapeAt(strokes: CsStroke[], x: number, y: number, hitRadius: number): CsStroke | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index];
    if ((stroke.tool === "rectangle" || stroke.tool === "ellipse") && stroke.points.length === 4
      && hitTestShape(stroke, x, y, hitRadius, true)) return stroke;
  }
  return null;
}

function findStrokeAt(strokes: CsStroke[], x: number, y: number, hitRadius: number): CsStroke | null {
  // Oxirgi chizilgandan boshlab tekshiramiz — ustma-ust chizmalarda eng
  // "tepadagi" (oxirgi chizilgan) ni topish tabiiyroq.
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    const pts = s.points;
    if (s.tool === "rectangle" || s.tool === "ellipse") {
      if (pts.length === 4 && hitTestShape(s, x, y, hitRadius)) return s;
      continue;
    }
    if (pts.length < 4) {
      if (pts.length === 2 && Math.hypot(x - pts[0], y - pts[1]) <= hitRadius) return s;
      continue;
    }
    for (let j = 0; j + 3 < pts.length; j += 2) {
      if (distToSegment(x, y, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <= hitRadius) return s;
    }
  }
  return null;
}

// Pixel-eraser: berilgan nuqtaga tegib turgan segment(lar)ni chizmadan
// "kesib" olib tashlaydi. Qolgan uzluksiz bo'laklar alohida yangi
// chizmalar sifatida qaytariladi (kamida 2 nuqtali bo'laklar saqlanadi).
function eraseNearPoint(stroke: CsStroke, x: number, y: number, hitRadius: number): CsStroke[] | null {
  const pts = stroke.points;
  if (pts.length < 4 || stroke.tool === "arrow" || stroke.tool === "line" || stroke.tool === "rectangle" || stroke.tool === "ellipse") return null;

  const keptRuns: number[][] = [[pts[0], pts[1]]];
  let hitAny = false;
  for (let j = 0; j + 3 < pts.length; j += 2) {
    const [x0, y0, x1, y1] = [pts[j], pts[j + 1], pts[j + 2], pts[j + 3]];
    if (distToSegment(x, y, x0, y0, x1, y1) <= hitRadius) {
      hitAny = true;
      keptRuns.push([]); // yangi bo'lak boshlanadi
    } else {
      keptRuns[keptRuns.length - 1].push(x1, y1);
    }
  }
  if (!hitAny) return null;

  return keptRuns
    .filter((run) => run.length >= 4)
    .map((run) => ({ id: crypto.randomUUID(), tool: stroke.tool, color: stroke.color, width: stroke.width, points: run }));
}

// Har qanday turdagi stroke (qalam/marker/strelka/shape/matn) uchun
// normalizatsiyalangan (0..1) bounding box — lasso tanlovi va guruh
// ko'chirish/o'lchamini o'zgartirish uchun bir xil interfeys kerak.
function strokeBoundingBox(stroke: CsStroke): { left: number; top: number; right: number; bottom: number } {
  if (stroke.tool === "text") {
    const w = (stroke.textBoxWidth ?? 320) / REF_WIDTH;
    const h = (stroke.textBoxHeight ?? 120) / REF_WIDTH;
    return { left: stroke.points[0], top: stroke.points[1], right: stroke.points[0] + w, bottom: stroke.points[1] + h };
  }
  const xs = stroke.points.filter((_, i) => i % 2 === 0);
  const ys = stroke.points.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function strokeCentroid(stroke: CsStroke): [number, number] {
  const box = strokeBoundingBox(stroke);
  return [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
}

// Ray-casting: nuqta yopiq ko'pburchak (lasso yo'li) ichidami tekshiradi.
function pointInPolygon(x: number, y: number, polygon: number[]): boolean {
  let inside = false;
  const n = polygon.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2], yi = polygon[i * 2 + 1];
    const xj = polygon[j * 2], yj = polygon[j * 2 + 1];
    const intersects = (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Lasso yo'li ichida markazi (yoki bounding box ustma-ust tushishi) bo'lgan
// barcha strokelarni topadi — Miro/Excalidraw'dagi "erkin tanlash" kabi.
function findStrokesInLasso(strokes: CsStroke[], polygon: number[]): string[] {
  if (polygon.length < 6) return [];
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  const polyLeft = Math.min(...xs), polyRight = Math.max(...xs);
  const polyTop = Math.min(...ys), polyBottom = Math.max(...ys);
  const ids: string[] = [];
  for (const stroke of strokes) {
    const box = strokeBoundingBox(stroke);
    // Tezkor rad etish: bounding box lasso'ning umumiy bounding box'i bilan
    // umuman kesishmasa, batafsil tekshirish shart emas.
    if (box.right < polyLeft || box.left > polyRight || box.bottom < polyTop || box.top > polyBottom) continue;
    const [cx, cy] = strokeCentroid(stroke);
    if (pointInPolygon(cx, cy, polygon)) ids.push(stroke.id);
  }
  return ids;
}

const TEXT_COLORS = ["#ffffff", "#000000", "#ef4444", "#3b82f6", "#22c55e", "#f97316"];
const FONT_FAMILY_OPTIONS: CsFontFamily[] = ["Inter", "Arial", "Georgia", "Comic Sans MS", "Nunito"];
const FONT_SIZE_PRESETS: Array<{ label: string; size: number }> = [
  { label: "S", size: 16 },
  { label: "M", size: 24 },
  { label: "L", size: 36 },
  { label: "XL", size: 56 },
];
const TEXT_ALIGN_OPTIONS: Array<{ value: "left" | "center" | "right"; icon: typeof AlignLeft }> = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
];

const LAYER_OPTIONS: Array<{ value: "back" | "backward" | "forward" | "front"; label: string; icon: typeof SendToBack }> = [
  { value: "back", label: "Eng orqaga", icon: SendToBack },
  { value: "backward", label: "Orqaga", icon: ChevronsDown },
  { value: "forward", label: "Oldinga", icon: ChevronsUp },
  { value: "front", label: "Eng oldinga", icon: BringToFront },
];

// TextStylePanel va ShapeStylePanel'da baravar ishlatiladigan qatlam
// (z-order) tugmalari — 4 ta amal: eng orqaga/bir pog'ona orqaga/bir
// pog'ona oldinga/eng oldinga.
function LayersSection({ onReorder }: { onReorder: (op: "front" | "back" | "forward" | "backward") => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium text-gray-400">Qatlamlar</p>
      <div className="grid grid-cols-4 gap-1">
        {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onReorder(value)}
            className="flex items-center justify-center rounded-lg bg-gray-100 py-1.5 text-gray-600 transition-colors hover:bg-gray-200"
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

interface TextStylePanelProps {
  color: string;
  fontFamily: CsFontFamily;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  textAlign: "left" | "center" | "right";
  onColorChange: (color: string) => void;
  onFontFamilyChange: (fontFamily: CsFontFamily) => void;
  onFontSizeChange: (fontSize: number) => void;
  onFontWeightChange: (fontWeight: 400 | 500 | 600 | 700) => void;
  onTextAlignChange: (textAlign: "left" | "center" | "right") => void;
  onReorder: (op: "front" | "back" | "forward" | "backward") => void;
  // Faqat allaqachon saqlangan (tanlangan) matn uchun beriladi — yozilayotgan
  // (hali commit qilinmagan) matnda o'chirish tugmasi ko'rsatilmaydi, chunki
  // Escape orqali bekor qilish allaqachon mavjud.
  onDelete?: () => void;
}

// Excalidraw'ning chap tomondagi to'liq balandlikdagi sozlamalar paneliga
// o'xshash — matn ustida yoki yonida emas, ekranning chap chekkasida fixed
// holda turadi, shu bilan matn/tanlangan chizma ustiga chiqib to'sib
// qo'ymaydi.
function TextStylePanel({
  color, fontFamily, fontSize, fontWeight, textAlign,
  onColorChange, onFontFamilyChange, onFontSizeChange, onFontWeightChange, onTextAlignChange, onReorder, onDelete,
}: TextStylePanelProps) {
  return (
    <div
      className="pointer-events-auto fixed left-3 top-1/2 z-40 flex max-h-[calc(100vh-24px)] w-44 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 text-gray-700 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Rang</p>
        <div className="flex items-center gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Rang ${c}`}
              onClick={() => onColorChange(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-indigo-500" : "border-gray-200"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shrift</p>
        <select
          aria-label="Font family"
          value={fontFamily}
          onChange={(event) => onFontFamilyChange(event.target.value as CsFontFamily)}
          className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-400"
        >
          {FONT_FAMILY_OPTIONS.map((font) => (
            <option key={font} value={font}>{font === "Comic Sans MS" ? "Comic Sans" : font}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shrift o'lchami</p>
        <div className="grid grid-cols-4 gap-1">
          {FONT_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onFontSizeChange(preset.size)}
              className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                fontSize === preset.size ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Matn joylashuvi</p>
        <div className="grid grid-cols-3 gap-1">
          {TEXT_ALIGN_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-label={`Matn joylashuvi ${value}`}
              onClick={() => onTextAlignChange(value)}
              className={`flex items-center justify-center rounded-lg py-1.5 transition-colors ${
                textAlign === value ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Qalinlik</p>
        <select
          aria-label="Font weight"
          value={fontWeight}
          onChange={(event) => onFontWeightChange(Number(event.target.value) as 400 | 500 | 600 | 700)}
          className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs outline-none focus:border-indigo-400"
        >
          <option value={400}>Regular</option>
          <option value={500}>Medium</option>
          <option value={600}>Semi bold</option>
          <option value={700}>Bold</option>
        </select>
      </div>

      <LayersSection onReorder={onReorder} />

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
        >
          <Trash2 size={13} />
          O'chirish
        </button>
      )}
    </div>
  );
}

const SHAPE_STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const SHAPE_BACKGROUND_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];
const FILL_STYLE_OPTIONS: Array<{ value: CsFillStyle; label: string }> = [
  { value: "hachure", label: "Shtrix" },
  { value: "cross-hatch", label: "Katak" },
  { value: "solid", label: "To'liq" },
];

function FillStyleIcon({ style }: { style: CsFillStyle }) {
  if (style === "solid") return <span aria-hidden="true" className="h-4 w-4 rounded-sm bg-current" />;
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      {style === "hachure" ? (
        <path d="M2 14 14 2M5 17 17 5M1 9 9 1" />
      ) : (
        <><path d="M2 6h14M2 12h14M6 2v14M12 2v14" /></>
      )}
    </svg>
  );
}
const STROKE_WIDTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2, label: "S" }, { value: 4, label: "M" }, { value: 7, label: "L" },
];
const STROKE_STYLE_OPTIONS: Array<{ value: CsStrokeStyle; label: string }> = [
  { value: "none", label: "Kontursiz" }, { value: "solid", label: "Solid" }, { value: "dashed", label: "Dash" },
];

function StrokeStyleIcon({ style }: { style: CsStrokeStyle }) {
  if (style === "none") {
    return <span aria-hidden="true" className="text-base leading-none">∅</span>;
  }
  return (
    <svg aria-hidden="true" width="24" height="14" viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {style === "dashed" ? <path d="M2 7h4M10 7h4M18 7h4" /> : <path d="M2 7h20" />}
    </svg>
  );
}
const EDGES_OPTIONS: Array<{ value: CsEdges; label: string }> = [
  { value: "sharp", label: "Keskin" }, { value: "round", label: "Yumaloq" },
];

function EdgeIcon({ rounded }: { rounded: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {rounded ? <rect x="4" y="4" width="16" height="16" rx="4" /> : <rect x="4" y="4" width="16" height="16" />}
    </svg>
  );
}

interface ShapeStylePanelProps {
  color: string;
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeWidth: number;
  strokeStyle: CsStrokeStyle;
  edges: CsEdges;
  opacity: number;
  onColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onFillStyleChange: (fillStyle: CsFillStyle) => void;
  onStrokeWidthChange: (width: number) => void;
  onStrokeStyleChange: (strokeStyle: CsStrokeStyle) => void;
  onEdgesChange: (edges: CsEdges) => void;
  onOpacityChange: (opacity: number) => void;
  onReorder: (op: "front" | "back" | "forward" | "backward") => void;
}

// To'rtburchak/doira uchun Excalidraw'ga to'liq mos sozlamalar paneli —
// TextStylePanel bilan bir xil joyga (chap-markaz, fixed) chiqadi.
function ShapeStylePanel({
  color, backgroundColor, fillStyle, strokeWidth, strokeStyle, edges, opacity,
  onColorChange, onBackgroundColorChange, onFillStyleChange, onStrokeWidthChange,
  onStrokeStyleChange, onEdgesChange, onOpacityChange, onReorder,
}: ShapeStylePanelProps) {
  const hasBackground = backgroundColor !== "transparent";
  return (
    <div
      className="pointer-events-auto fixed left-3 top-1/2 z-40 flex max-h-[calc(100vh-24px)] w-44 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 text-gray-700 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Kontur</p>
        <div className="flex items-center gap-1.5">
          {SHAPE_STROKE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Kontur rangi ${c}`}
              onClick={() => onColorChange(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-indigo-500" : "border-gray-200"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Fon</p>
        <div className="flex items-center gap-1.5">
          {SHAPE_BACKGROUND_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Fon rangi ${c}`}
              onClick={() => onBackgroundColorChange(c)}
              className={`h-6 w-6 rounded-full border-2 ${backgroundColor === c ? "border-indigo-500" : "border-gray-200"}`}
              style={c === "transparent"
                ? { backgroundImage: "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0" }
                : { backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {hasBackground && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-gray-400">To‘ldirish</p>
          <div className="grid grid-cols-3 gap-1">
            {FILL_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
              type="button"
              onClick={() => onFillStyleChange(option.value)}
              aria-label={option.label}
              title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
                  fillStyle === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <FillStyleIcon style={option.value} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Kontur qalinligi</p>
        <div className="grid grid-cols-3 gap-1">
          {STROKE_WIDTH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStrokeWidthChange(option.value)}
              className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                strokeWidth === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Kontur uslubi</p>
        <div className="grid grid-cols-3 gap-1">
          {STROKE_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStrokeStyleChange(option.value)}
              aria-label={option.label}
              title={option.label}
              className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                strokeStyle === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <StrokeStyleIcon style={option.value} />
            </button>
          ))}
        </div>
      </div>

      {(
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-gray-400">Burchaklar</p>
          <div className="grid grid-cols-2 gap-1">
            {EDGES_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onEdgesChange(option.value)}
                aria-label={option.label}
                title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  edges === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <EdgeIcon rounded={option.value === "round"} />
              </button>
            ))}
          </div>
        </div>
      )}

      {hasBackground && <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shaffoflik</p>
        <input
          aria-label="Shaffoflik"
          type="range"
          min={0}
          max={100}
          step={10}
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          className="classroom-opacity-slider w-full"
        />
      </div>}

      <LayersSection onReorder={onReorder} />
    </div>
  );
}

interface ShapeStyleOnlyPanelProps {
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeStyle: CsStrokeStyle;
  edges: CsEdges;
  opacity: number;
  onBackgroundColorChange: (color: string) => void;
  onFillStyleChange: (fillStyle: CsFillStyle) => void;
  onStrokeStyleChange: (strokeStyle: CsStrokeStyle) => void;
  onEdgesChange: (edges: CsEdges) => void;
  onOpacityChange: (opacity: number) => void;
}

// ShapeStylePanel'ning Stroke rang/qalinliksiz varianti — asbob hali
// hech narsa chizilmasdan oldin tanlanganda ko'rinadi. Stroke rang/qalinlik
// asosiy toolbar orqali (pen/highlighter bilan bir xil) boshqariladi,
// shuning uchun bu yerda takrorlanmaydi.
export function ShapeStyleOnlyPanel({
  backgroundColor, fillStyle, strokeStyle, edges, opacity,
  onBackgroundColorChange, onFillStyleChange, onStrokeStyleChange, onEdgesChange, onOpacityChange,
}: ShapeStyleOnlyPanelProps) {
  const hasBackground = backgroundColor !== "transparent";
  return (
    <div
      className="pointer-events-auto fixed left-3 top-1/2 z-40 flex max-h-[calc(100vh-24px)] w-44 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 text-gray-700 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Fon</p>
        <div className="flex items-center gap-1.5">
          {SHAPE_BACKGROUND_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Fon rangi ${c}`}
              onClick={() => onBackgroundColorChange(c)}
              className={`h-6 w-6 rounded-full border-2 ${backgroundColor === c ? "border-indigo-500" : "border-gray-200"}`}
              style={c === "transparent"
                ? { backgroundImage: "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0" }
                : { backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {hasBackground && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-gray-400">To‘ldirish</p>
          <div className="grid grid-cols-3 gap-1">
            {FILL_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
              type="button"
              onClick={() => onFillStyleChange(option.value)}
              aria-label={option.label}
              title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
                  fillStyle === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <FillStyleIcon style={option.value} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Kontur uslubi</p>
        <div className="grid grid-cols-3 gap-1">
          {STROKE_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStrokeStyleChange(option.value)}
              aria-label={option.label}
              title={option.label}
              className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                strokeStyle === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <StrokeStyleIcon style={option.value} />
            </button>
          ))}
        </div>
      </div>

      {(
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-gray-400">Burchaklar</p>
          <div className="grid grid-cols-2 gap-1">
            {EDGES_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onEdgesChange(option.value)}
                aria-label={option.label}
                title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  edges === option.value ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <EdgeIcon rounded={option.value === "round"} />
              </button>
            ))}
          </div>
        </div>
      )}

      {hasBackground && <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-gray-400">Shaffoflik</p>
        <input
          aria-label="Shaffoflik"
          type="range"
          min={0}
          max={100}
          step={10}
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          className="classroom-opacity-slider w-full"
        />
      </div>}
    </div>
  );
}

interface PageProps {
  pageNumber: number;
  url?: string;
  notebook?: boolean;
  notebookStyle?: CsNotebookStyle;
  strokes: CsStroke[];
  pointer: CsPointer | null;
  showPointer: boolean;
  editable: boolean;
  tool: DrawTool;
  showStylePanel: boolean;
  onActivate: () => void;
  onToolChange?: (tool: DrawTool) => void;
  color: string;
  onColorChange?: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange?: (width: number) => void;
  shapeStyle?: ShapeStyle;
  onShapeStyleChange?: (style: ShapeStyle) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke) => void;
  onReorderStroke?: (page: number, strokeIds: string[], op: "front" | "back" | "forward" | "backward") => void;
  onStrokeComplete?: (page: number, stroke: CsStroke) => void;
  onMoveStroke?: (page: number, strokeId: string, x: number, y: number) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
  onEraseStroke?: (page: number, strokeId: string) => void;
  onSplitStroke?: (page: number, strokeId: string, replacements: CsStroke[]) => void;
  registerEl: (page: number, el: HTMLDivElement | null) => void;
  // Ota konteynerning joriy zoom darajasi — faqat canvas o'lchamini
  // ResizeObserver'ning ASINXRON qayta chaqirilishini kutmasdan, zoom
  // o'zgargan HAR BIR commit'da SINXRON (useLayoutEffect) qayta o'lchash
  // uchun ishlatiladi. Aks holda ResizeObserver hali ishga tushmagan
  // qisqa vaqt oralig'ida canvas eski o'lchamda qolib, ustidagi chizmalar
  // PDF/daftar sahifasidan orqada qolib ketganday (siljib) ko'rinardi.
  zoomVersion: number;
  // Faqat ustoz uchun: sahifani darsdan o'chirish. canRemove false bo'lsa
  // (masalan shu mode'da faqat 1 ta sahifa qolgan bo'lsa) trash tugmasi
  // ko'rsatilmaydi.
  isHost?: boolean;
  canRemove?: boolean;
  onRemovePage?: (pageNumber: number) => void;
  // style bo'lsa (daftar rejimida naqsh tanlanganda) — style bilan birga
  // yuboriladi. PDF rejimida style yo'q (undefined) — bosilganda darhol
  // kutubxona tanlash oqimi ochiladi, popup ko'rsatilmaydi.
  onInsertPage?: (pageNumber: number, style?: CsNotebookStyle) => void;
}

// Bitta sahifa: rasm + chizish canvas. Ko'rinish oynasiga yaqinlashguncha
// <img src> qo'yilmaydi (lazy) — ko'p sahifali darsda hammasi birdan
// yuklanib xotira/tarmoqni og'irlashtirmasin.
function ClassroomPdfPage({
  pageNumber, url, notebook = false, notebookStyle = "grid", strokes, pointer, showPointer, editable, tool, showStylePanel, onActivate, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange,
  shapeStyle = DEFAULT_SHAPE_STYLE, onShapeStyleChange, onUpdateShapeStroke,
  onStrokeComplete, onMoveStroke, onUpdateTextStroke, onPointerMove, onEraseStroke, onSplitStroke, onReorderStroke, registerEl, zoomVersion,
  isHost = false, canRemove = true, onRemovePage, onInsertPage,
}: PageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showStylePopup, setShowStylePopup] = useState(false);
  // Stroke-eraser rejimida sichqoncha ustidan o'tgan chizma shu ID bilan
  // xiralashtirib ko'rsatiladi (o'chirilmasdan oldin preview).
  const [hoveredStrokeId, setHoveredStrokeId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  // Lasso bilan tanlangan guruh — bir nechta chizma/shape/matnni birga
  // ko'chirish/o'lchamini o'zgartirish/o'chirish uchun.
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const lassoDraftRef = useRef<number[] | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const erasedThisDragRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const draftRef = useRef<number[] | null>(null);
  const draftPressuresRef = useRef<number[] | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const lastTextStyleRef = useRef<{ fontFamily: CsFontFamily; fontSize: number; fontWeight: 400 | 500 | 600 | 700; textAlign: "left" | "center" | "right" }>({
    fontFamily: "Inter", fontSize: 24, fontWeight: 600, textAlign: "left",
  });
  const [textEditor, setTextEditor] = useState<{
    x: number; y: number; text: string; color: string;
    fontFamily: CsFontFamily;
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    textAlign: "left" | "center" | "right";
    textBoxWidth: number;
    textBoxHeight: number;
  } | null>(null);
  // O'chirg'ich rejimida sichqoncha ostida qancha joy o'chishini ko'rsatadigan
  // opacity-doira uchun joriy kursor pozitsiyasi (normalized).
  const eraserCursorRef = useRef<[number, number] | null>(null);
  const [, forceRedraw] = useState(0);
  // PointerEvent.detail ko'p brauzerlarda (xususan Safari) ikki marta
  // bosishni hisoblamaydi (faqat MouseEvent/click uchun ishonchli) — shu
  // sabab "select" asbobida matn ustiga ikki marta bosilganda tahrirlash
  // rejimi ochilmasdi. O'rniga vaqt+ID asosida qo'lda aniqlanadi.
  const lastClickRef = useRef<{ id: string; atMs: number } | null>(null);
  const DOUBLE_CLICK_MS = 400;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    registerEl(pageNumber, wrapRef.current);
    return () => registerEl(pageNumber, null);
  }, [pageNumber, registerEl]);

  const syncSize = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(surface);
    return () => ro.disconnect();
  }, [syncSize, visible]);

  // MUHIM: zoom o'zgarganda ResizeObserver'ning asinxron (keyingi freym)
  // qayta chaqirilishini kutmasdan, canvas o'lchami shu yerda SINXRON
  // (useLayoutEffect, paintdan oldin) qayta o'lchanadi — aks holda qisqa
  // vaqt davomida canvas eski o'lchamda qolib, ustidagi chizmalar
  // PDF/daftar rasmidan orqada qolib ketganday (siljib) ko'rinardi.
  useLayoutEffect(() => {
    syncSize();
  }, [zoomVersion, syncSize]);

  useEffect(() => {
    if (!textEditor) return;
    window.requestAnimationFrame(() => {
      const el = textInputRef.current;
      if (!el) return;
      el.focus();
      // Caret paydo bo'lganda brauzer uni ko'rinadigan qilish uchun
      // textarea'ni avtomatik ichki scroll qilib qo'yishi mumkin — agar
      // qutining balandligi caret uchun kerakli to'liq qator balandligidan
      // (font ascent/descent) ozgina kichikroq bo'lsa. Bu matnning
      // tahrirlash rejimida haqiqiy joyidan pastroq/kattaroq ko'rinishiga
      // olib kelardi. Fokusdan keyin scrollTop'ni majburan 0'ga qaytarish
      // bu siljishni yo'q qiladi.
      el.scrollTop = 0;
    });
  }, [textEditor]);

  // Matn yozilgan sari textarea balandligini mazmuniga moslab kengaytiramiz.
  // Shu bilan matn ichida scroll ochilmaydi va editor Excalidraw/Miro kabi
  // chegarasiz yozish maydoniga aylanadi.
  useEffect(() => {
    if (!textEditor) return;
    const input = textInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const nextHeight = Math.max(1, Math.min(2000, input.scrollHeight));
    input.style.height = `${nextHeight}px`;
    if (size.w > 0) {
      // MUHIM: box balandligi yozish paytida (text o'zgarganda) har doim
      // matnning aniq tabiiy balandligiga TENGLASHTIRILADI (faqat o'sish
      // emas) — aks holda: matn 2 qatorga o'tib box kattalashadi, keyin
      // qayta 1 qatorga tushirilsa ham box katta qolib ketardi. Bunday
      // holatda wrapper flex (justify-center) matnni box o'rtasida
      // ko'rsatardi, top-anchor esa box yuqorisida qolardi — saqlash
      // paytida (commitText) box qayta tor o'lchamga qaytganda matn
      // "yozayotgandagi joyidan tepaga sakrab ketganday" ko'rinardi.
      // Box faqat qo'lda resize-handle orqali kattalashtirilganda
      // (finishTextTransform/finishGroupResize) katta qoladi — bu yerga
      // tegishli emas.
      const normalizedHeight = Math.max(1, Math.min(2000, nextHeight / size.w * REF_WIDTH));
      setTextEditor((current) => current && Math.abs(normalizedHeight - current.textBoxHeight) > 0.5
        ? { ...current, textBoxHeight: normalizedHeight }
        : current);
    }
  }, [textEditor?.text, textEditor?.fontFamily, textEditor?.fontSize, textEditor?.fontWeight, textEditor, size.w]);

  const commitText = () => {
    if (!textEditor?.text.trim()) {
      setTextEditor(null);
      return;
    }
    // x/y allaqachon sahifaga normalizatsiya qilingan. DOM rect'ini zoom va
    // sub-pixel roundingdan keyin qayta hisoblash har save'da ozgina surardi.
    const anchorX = textEditor.x;
    const anchorY = textEditor.y;
    // Qutini textarea'ning render qilingan o'lchamiga (inputRect) emas,
    // matnning haqiqiy o'lchangan kengligi/balandligiga moslaymiz — aks
    // holda shrift kattalashtirilganda yoki qator qisqa bo'lganda qutining
    // o'zi eski (mos kelmaydigan) o'lchamda qolib ketardi.
    const measured = measureTextBox(textEditor.text.trim(), textEditor.fontFamily, textEditor.fontSize, textEditor.fontWeight);
    // Backend ham text box uchun shu minimumlarni validatsiya qiladi
    // (classroom.logic.ts) — shu qiymatlar bilan mos kelishi shart, aks
    // holda server INVALID_STROKE deb rad etadi.
    const textBoxWidth = Math.max(4, Math.min(1000, measured.width + 8));
    const textBoxHeight = Math.max(1, Math.min(2000, measured.height));
    const style = {
      fontFamily: textEditor.fontFamily,
      fontSize: textEditor.fontSize,
      fontWeight: textEditor.fontWeight,
      textAlign: textEditor.textAlign,
      textBoxWidth,
      textBoxHeight,
    };
    lastTextStyleRef.current = { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, textAlign: style.textAlign };
    const edited = editingTextId ? strokes.find((stroke) => stroke.id === editingTextId && stroke.tool === "text") : null;
    const savedId = edited ? edited.id : crypto.randomUUID();
    if (edited) {
      onUpdateTextStroke?.(pageNumber, {
        ...edited,
        color: textEditor.color,
        points: [anchorX, anchorY],
        text: textEditor.text.trim(),
        ...style,
      });
    } else {
      onStrokeComplete?.(pageNumber, {
        id: savedId, tool: "text", color: textEditor.color, width: strokeWidth,
        points: [anchorX, anchorY], text: textEditor.text.trim(), ...style,
      });
    }
    setEditingTextId(null);
    setTextEditor(null);
    // Matn saqlangach avtomatik "select" asboziga o'tadi — Excalidraw kabi,
    // darhol qayta tanlab tahrirlash/joylashtirish mumkin bo'lishi kerak.
    if (tool === "text") {
      onToolChange?.("select");
      setSelectedTextId(savedId);
    }
  };

  const selectedText = selectedTextId ? strokes.find((stroke) => stroke.id === selectedTextId && stroke.tool === "text") : null;
  const updateSelectedText = (changes: Partial<CsStroke>) => {
    if (!selectedText) return;
    const next = { ...selectedText, ...changes };
    // Shrift/matn o'zgarganda qutini ("blue border") qayta o'lchamaymiz —
    // eski (odatda kichikroq) textBoxWidth/Height saqlanib qolib, katta
    // shriftda matn qutidan tashqariga chiqib ketardi. Har safar rang emas,
    // balki matn ko'rinishiga (shrift, o'lcham, qalinlik, matn) ta'sir
    // qiluvchi maydon o'zgarganda haqiqiy o'lchamga moslab qayta hisoblanadi.
    const affectsLayout = "fontFamily" in changes || "fontSize" in changes || "fontWeight" in changes || "text" in changes;
    if (affectsLayout && next.text) {
      const measured = measureTextBox(next.text, next.fontFamily ?? "Inter", next.fontSize ?? 24, next.fontWeight ?? 600);
      next.textBoxWidth = Math.max(80, Math.min(1000, measured.width + 8));
      next.textBoxHeight = Math.max(40, Math.min(2000, measured.height));
    }
    onUpdateTextStroke?.(pageNumber, next);
  };

  const selectedShape = selectedShapeId
    ? strokes.find((stroke) => stroke.id === selectedShapeId && (stroke.tool === "rectangle" || stroke.tool === "ellipse"))
    : null;
  const updateSelectedShape = (changes: Partial<CsStroke>) => {
    if (!selectedShape) return;
    onUpdateShapeStroke?.(pageNumber, { ...selectedShape, ...changes });
  };

  const selectedGroupStrokes = selectedGroupIds.size > 0
    ? strokes.filter((stroke) => selectedGroupIds.has(stroke.id))
    : [];
  const selectedGroupBounds = selectedGroupStrokes.length > 0
    ? selectedGroupStrokes.reduce(
        (acc, stroke) => {
          const box = strokeBoundingBox(stroke);
          return {
            left: Math.min(acc.left, box.left), top: Math.min(acc.top, box.top),
            right: Math.max(acc.right, box.right), bottom: Math.max(acc.bottom, box.bottom),
          };
        },
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
      )
    : null;

  const commitGroupStroke = useCallback((stroke: CsStroke) => {
    if (stroke.tool === "text") onUpdateTextStroke?.(pageNumber, stroke);
    // Lasso resize barcha nuqtalarni va stroke.width'ni o'zgartiradi. Faqat
    // birinchi nuqtani moveStroke orqali yuborish pen/highlighter/arrow'ning
    // serverdagi eski geometriyasini saqlab qolardi; hostda esa lokal mutation
    // sabab vaqtincha to'g'ri ko'rinardi. To'liq stroke'ni atomik yangilaymiz.
    else onUpdateShapeStroke?.(pageNumber, stroke);
  }, [pageNumber, onUpdateTextStroke, onUpdateShapeStroke]);

  const deleteSelectedGroup = () => {
    for (const id of selectedGroupIds) onEraseStroke?.(pageNumber, id);
    setSelectedGroupIds(new Set());
  };

  // Tanlangan guruhni asl nusxadan bir oz pastroq/o'ngroq siljigan holda
  // klonlaydi (Figma/Miro'dagi odatiy paste-offset xatti-harakati), so'ng
  // yangi nusxalarni tanlangan holatga o'tkazadi — asl obyektlar
  // tanlanmagan qoladi. Yangi socket event kerak emas: onStrokeComplete
  // allaqachon istalgan yangi strokeni yaratish uchun ishlatiladi (2106-qator).
  const DUPLICATE_OFFSET = 0.02;
  const duplicateSelectedGroup = () => {
    if (selectedGroupStrokes.length === 0) return;
    const newIds = new Set<string>();
    for (const stroke of selectedGroupStrokes) {
      const newId = crypto.randomUUID();
      const offsetPoints = stroke.points.map((value) => value + DUPLICATE_OFFSET);
      onStrokeComplete?.(pageNumber, { ...stroke, id: newId, points: offsetPoints });
      newIds.add(newId);
    }
    setSelectedGroupIds(newIds);
  };

  const draggingGroupRef = useRef<{ ids: Set<string>; startX: number; startY: number } | null>(null);
  const resizingGroupRef = useRef<{
    corner: "nw" | "ne" | "sw" | "se";
    startBounds: { left: number; top: number; right: number; bottom: number };
    startClientX: number; startClientY: number;
    startStrokes: Map<string, CsStroke>;
  } | null>(null);
  const rotatingGroupRef = useRef<{
    centerX: number; centerY: number; // normalized (0..1), aspect-corrected
    startAngle: number;
    startStrokes: Map<string, CsStroke>;
  } | null>(null);

  const beginGroupResize = (event: React.PointerEvent<HTMLButtonElement>, corner: "nw" | "ne" | "sw" | "se") => {
    if (!selectedGroupBounds) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingGroupRef.current = {
      corner, startBounds: selectedGroupBounds,
      startClientX: event.clientX, startClientY: event.clientY,
      startStrokes: new Map(selectedGroupStrokes.map((s) => [s.id, { ...s, points: [...s.points] }])),
    };
  };

  const transformGroupResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = resizingGroupRef.current;
    if (!current || size.w <= 0) return;
    event.preventDefault(); event.stopPropagation();
    let dx = (event.clientX - current.startClientX) / size.w;
    let dy = (event.clientY - current.startClientY) / size.h;
    const left = current.corner.includes("w");
    const top = current.corner.includes("n");
    // Shift bosib turilsa, guruhning umumiy bounding-box'i kvadrat
    // (eni=bo'yi) bo'lib qoladi — piksel (aspect-corrected) o'lchamda
    // kattaroq tomonga moslashtiriladi, guruh ichidagi barcha strokelar
    // shu umumiy scale bilan proporsional o'zgaradi.
    if (event.shiftKey && size.w > 0 && size.h > 0) {
      const dxPx = dx * size.w;
      const dyPx = dy * size.h;
      const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
      dx = ((Math.sign(dxPx) || 1) * side) / size.w;
      dy = ((Math.sign(dyPx) || 1) * side) / size.h;
    }
    const { startBounds } = current;
    const nextLeft = left ? Math.max(0, Math.min(startBounds.right - 0.01, startBounds.left + dx)) : startBounds.left;
    const nextTop = top ? Math.max(0, Math.min(startBounds.bottom - 0.01, startBounds.top + dy)) : startBounds.top;
    const nextRight = !left ? Math.max(startBounds.left + 0.01, Math.min(1, startBounds.right + dx)) : startBounds.right;
    const nextBottom = !top ? Math.max(startBounds.top + 0.01, Math.min(1, startBounds.bottom + dy)) : startBounds.bottom;
    const startW = startBounds.right - startBounds.left || 1;
    const startH = startBounds.bottom - startBounds.top || 1;
    const scaleX = (nextRight - nextLeft) / startW;
    const scaleY = (nextBottom - nextTop) / startH;
    const fontScale = Math.min(scaleX, scaleY);
    for (const stroke of selectedGroupStrokes) {
      const original = current.startStrokes.get(stroke.id);
      if (!original) continue;
      const remap = (px: number, py: number): [number, number] => [
        nextLeft + (px - startBounds.left) * scaleX,
        nextTop + (py - startBounds.top) * scaleY,
      ];
      if (original.tool === "text") {
        const [x, y] = remap(original.points[0], original.points[1]);
        stroke.points = [x, y];
        const originalFont = original.fontSize ?? 24;
        const clampedFont = Math.round(Math.max(1, Math.min(96, originalFont * fontScale)));
        stroke.fontSize = clampedFont;
        // Qutini fontScale bilan emas, haqiqiy (klemplangan) shrift nisbati
        // bilan kichraytiramiz — aks holda fontSize 10px'da to'xtab qolgach
        // ham qutining o'zi kichrayishda davom etib, matn endi sig'maydigan
        // torroq qutida qoladi va wrap bo'lib ko'rinadi.
        const effectiveScale = clampedFont / originalFont;
        stroke.textBoxWidth = (original.textBoxWidth ?? 320) * effectiveScale;
        stroke.textBoxHeight = (original.textBoxHeight ?? 120) * effectiveScale;
      } else {
        const nextPoints: number[] = [];
        for (let i = 0; i < original.points.length; i += 2) {
          const [x, y] = remap(original.points[i], original.points[i + 1]);
          nextPoints.push(x, y);
        }
        stroke.points = nextPoints;
        // Chiziq qalinligi (stroke.width) avval geometriya bilan birga
        // o'zgarmasdi — natijada shape/arrow/pen kichraytirilganda chiziq
        // avvalgi (endi nomutanosib qalin) yo'g'onligicha qolib ketardi.
        // fontScale bilan bir xil (kichikroq o'q — non-uniform resize'da
        // ham chiziq juda ingichka/yo'g'on bo'lib ketmasin) nisbatda
        // proporsional o'zgartiramiz.
        stroke.width = Math.max(1, Math.round((original.width ?? 4) * fontScale));
      }
    }
    forceRedraw((v) => v + 1);
  };

  const finishGroupResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = resizingGroupRef.current;
    if (!current) return;
    event.preventDefault(); event.stopPropagation();
    resizingGroupRef.current = null;
    for (const stroke of selectedGroupStrokes) {
      // Lasso-resize ham boxni faqat scale qilgani uchun matndan katta
      // bo'sh joy qolishi mumkin — tugagach tekis moslashtiramiz (yakka
      // handle resize'dagi finishTextTransform bilan bir xil mantiq).
      if (stroke.tool === "text" && stroke.text) {
        const measured = measureTextBox(stroke.text, stroke.fontFamily ?? "Inter", stroke.fontSize ?? 24, stroke.fontWeight ?? 400);
        stroke.textBoxWidth = measured.width + 8;
        stroke.textBoxHeight = measured.height;
      }
      commitGroupStroke({ ...stroke, points: [...stroke.points] });
    }
  };

  const beginGroupRotate = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!selectedGroupBounds || !surfaceRef.current || size.w <= 0) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centerX = (selectedGroupBounds.left + selectedGroupBounds.right) / 2;
    const centerY = (selectedGroupBounds.top + selectedGroupBounds.bottom) / 2;
    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + centerX * size.w;
    const centerClientY = rect.top + centerY * size.h;
    rotatingGroupRef.current = {
      centerX, centerY,
      startAngle: Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX),
      startStrokes: new Map(selectedGroupStrokes.map((s) => [s.id, { ...s, points: [...s.points] }])),
    };
  };

  const transformGroupRotate = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = rotatingGroupRef.current;
    if (!current || !surfaceRef.current || size.w <= 0) return;
    event.preventDefault(); event.stopPropagation();
    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + current.centerX * size.w;
    const centerClientY = rect.top + current.centerY * size.h;
    const angle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX);
    const deltaRad = angle - current.startAngle;
    const deltaDeg = deltaRad * 180 / Math.PI;
    const cos = Math.cos(deltaRad);
    const sin = Math.sin(deltaRad);
    // Nuqtalarni piksel koordinatasida aylantiramiz (normalized 0..1
    // koordinatada to'g'ridan-to'g'ri aylantirish, canvas kvadrat
    // bo'lmaganda — masalan A4 varaq — burchakni buzib qo'yardi), so'ng
    // qaytadan normalize qilamiz.
    const rotatePoint = (nx: number, ny: number): [number, number] => {
      const px = nx * size.w;
      const py = ny * size.h;
      const cx = current.centerX * size.w;
      const cy = current.centerY * size.h;
      const dx = px - cx;
      const dy = py - cy;
      const rx = cx + dx * cos - dy * sin;
      const ry = cy + dx * sin + dy * cos;
      return [rx / size.w, ry / size.h];
    };
    for (const stroke of selectedGroupStrokes) {
      const original = current.startStrokes.get(stroke.id);
      if (!original) continue;
      if (original.tool === "text" || original.tool === "rectangle" || original.tool === "ellipse") {
        // Bounding-box asosli obyektlar: markazini guruh markazi atrofida
        // aylantiramiz, o'lchamini saqlaymiz, va o'zining rotation
        // maydonini ham guruh burchagiga oshiramiz (chizish kodi shu
        // maydon orqali o'z markazi atrofida qo'shimcha aylanadi).
        const box = strokeBoundingBox(original);
        const [newCx, newCy] = rotatePoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
        const boxW = box.right - box.left;
        const boxH = box.bottom - box.top;
        stroke.rotation = Math.round(((original.rotation ?? 0) + deltaDeg) * 10) / 10;
        if (original.tool === "text") {
          stroke.points = [newCx - boxW / 2, newCy - boxH / 2];
        } else {
          stroke.points = [newCx - boxW / 2, newCy - boxH / 2, newCx + boxW / 2, newCy + boxH / 2];
        }
      } else {
        // Erkin chizilgan strokelar (pen/highlighter/arrow) — alohida
        // rotation maydoni yo'q, shakli to'g'ridan-to'g'ri nuqtalar bilan
        // belgilanadi, shuning uchun har bir nuqtani aylantiramiz.
        const nextPoints: number[] = [];
        for (let i = 0; i < original.points.length; i += 2) {
          const [x, y] = rotatePoint(original.points[i], original.points[i + 1]);
          nextPoints.push(x, y);
        }
        stroke.points = nextPoints;
      }
    }
    forceRedraw((v) => v + 1);
  };

  const finishGroupRotate = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = rotatingGroupRef.current;
    if (!current) return;
    event.preventDefault(); event.stopPropagation();
    rotatingGroupRef.current = null;
    for (const stroke of selectedGroupStrokes) {
      commitGroupStroke({ ...stroke, points: [...stroke.points] });
    }
  };

  // MUHIM: useLayoutEffect (useEffect emas) — canvas'ni brauzer paint
  // qilishidan OLDIN qayta chizadi. Oddiy useEffect paintdan KEYIN ishga
  // tushadi, shuning uchun zoom (yoki har qanday size.w/h) o'zgarganda
  // brauzer bir freym davomida canvas'ning ESKI bitmap tarkibini yangi
  // CSS o'lchamida chizib qo'yardi — bu chizma "eski holatga qaytib
  // yangilanayotganday" ko'rinishga (flash) olib kelardi.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    for (const s of strokes) {
      // Tahrirlash paytida o'sha matn textarea ichida ko'rinadi. Canvasdagi
      // nusxani ham chizish ikkita matn ustma-ust ko'rinishiga olib keladi.
      if (s.id !== editingTextId) drawStroke(ctx, s, size.w, size.h, s.id === hoveredStrokeId);
    }
    if (draftRef.current && draftRef.current.length >= 2 && tool !== "eraser-pixel" && tool !== "eraser-stroke" && tool !== "select" && tool !== "text" && tool !== "lasso") {
      const isShape = tool === "rectangle" || tool === "ellipse";
      drawStroke(ctx, {
        id: "__draft__", tool: tool === "laser" ? "pen" : tool, color, width: strokeWidth, points: draftRef.current,
        ...(tool === "pen" && draftPressuresRef.current ? { pressures: draftPressuresRef.current } : {}),
        ...(isShape ? { ...shapeStyle } : {}),
      }, size.w, size.h);
    }
    if (showPointer && pointer && pointer.active) {
      // Ustoz kursori: faqat yarim shaffof doira (border/markaz nuqtasiz) —
      // ostidagi matn ko'rinib tursin.
      ctx.save();
      ctx.beginPath();
      ctx.arc(pointer.x * size.w, pointer.y * size.h, 12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59,130,246,0.25)";
      ctx.fill();
      ctx.restore();
    }
    if (lassoDraftRef.current && lassoDraftRef.current.length >= 4) {
      const path = lassoDraftRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(path[0] * size.w, path[1] * size.h);
      for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i] * size.w, path[i + 1] * size.h);
      ctx.closePath();
      ctx.strokeStyle = "rgba(99,102,241,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      ctx.fill();
      ctx.restore();
    }
    if ((tool === "eraser-pixel" || tool === "eraser-stroke") && eraserCursorRef.current) {
      // O'chirg'ich qancha joyni qamrab olishini ko'rsatuvchi opacity-doira —
      // chiziq qalinligiga (strokeWidth) qarab o'lchami o'zgaradi.
      const [cx, cy] = eraserCursorRef.current;
      const r = eraseHitRadius(strokeWidth) * size.w;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx * size.w, cy * size.h, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(107,114,128,0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(107,114,128,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  });

  const normPoint = (e: React.PointerEvent): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  const isEraser = tool === "eraser-pixel" || tool === "eraser-stroke";
  const draggingEraserRef = useRef(false);
  const draggingTextRef = useRef<{ stroke: CsStroke; dx: number; dy: number } | null>(null);
  const draggingShapeRef = useRef<{ stroke: CsStroke; dx: number; dy: number } | null>(null);
  const draggingStrokeRef = useRef<{ stroke: CsStroke; dx: number; dy: number } | null>(null);
  const transformingShapeRef = useRef<{
    type: "resize" | "rotate"; stroke: CsStroke;
    startClientX: number; startClientY: number;
    startX0: number; startY0: number; startX1: number; startY1: number;
    corner?: "nw" | "ne" | "sw" | "se";
    centerX?: number; centerY?: number; startAngle?: number; startRotation?: number;
  } | null>(null);

  const beginShapeResize = (event: React.PointerEvent<HTMLButtonElement>, corner: "nw" | "ne" | "sw" | "se") => {
    if (!selectedShape) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    transformingShapeRef.current = {
      type: "resize", stroke: selectedShape, corner,
      startClientX: event.clientX, startClientY: event.clientY,
      startX0: selectedShape.points[0], startY0: selectedShape.points[1],
      startX1: selectedShape.points[2], startY1: selectedShape.points[3],
    };
  };

  const beginShapeRotate = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!selectedShape || !surfaceRef.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const [x0, y0, x1, y1] = selectedShape.points;
    const centerX = rect.left + ((x0 + x1) / 2) * size.w;
    const centerY = rect.top + ((y0 + y1) / 2) * size.h;
    transformingShapeRef.current = {
      type: "rotate", stroke: selectedShape,
      startClientX: event.clientX, startClientY: event.clientY,
      startX0: x0, startY0: y0, startX1: x1, startY1: y1,
      centerX, centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: selectedShape.rotation ?? 0,
    };
  };

  const transformShape = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = transformingShapeRef.current;
    if (!current || size.w <= 0) return;
    event.preventDefault(); event.stopPropagation();
    if (current.type === "rotate") {
      const angle = Math.atan2(event.clientY - (current.centerY ?? 0), event.clientX - (current.centerX ?? 0));
      current.stroke.rotation = Math.round(((current.startRotation ?? 0) + (angle - (current.startAngle ?? 0)) * 180 / Math.PI) * 10) / 10;
      forceRedraw((value) => value + 1);
      return;
    }
    let dx = (event.clientX - current.startClientX) / size.w;
    let dy = (event.clientY - current.startClientY) / size.h;
    const left = current.corner?.includes("w") ?? false;
    const top = current.corner?.includes("n") ?? false;
    // Shift bosib turilsa, shakl kvadrat (eni=bo'yi) bo'lib qoladi —
    // piksel (aspect-corrected) o'lchamda kattaroq tomonga moslashtiriladi,
    // ikkala o'q ham shu umumiy o'lchamga tenglanadi, faqat siljish
    // yo'nalishi (ishora) saqlanadi.
    if (event.shiftKey && size.w > 0 && size.h > 0) {
      const dxPx = dx * size.w;
      const dyPx = dy * size.h;
      const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
      dx = ((Math.sign(dxPx) || 1) * side) / size.w;
      dy = ((Math.sign(dyPx) || 1) * side) / size.h;
    }
    // Chapdan/tepadan tortilsa mos burchak (x0/y0), o'ngdan/pastdan
    // tortilsa qarama-qarshi burchak (x1/y1) siljiydi — oddiy bounding-box
    // resize, aspekt-nisbat qulflanmaydi (Excalidraw'da ham shift bosilmasa
    // erkin resize bo'ladi).
    const nextX0 = left ? Math.max(0, Math.min(1, current.startX0 + dx)) : current.startX0;
    const nextY0 = top ? Math.max(0, Math.min(1, current.startY0 + dy)) : current.startY0;
    const nextX1 = !left ? Math.max(0, Math.min(1, current.startX1 + dx)) : current.startX1;
    const nextY1 = !top ? Math.max(0, Math.min(1, current.startY1 + dy)) : current.startY1;
    current.stroke.points = [nextX0, nextY0, nextX1, nextY1];
    forceRedraw((value) => value + 1);
  };

  const finishShapeTransform = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = transformingShapeRef.current;
    if (!current) return;
    event.preventDefault(); event.stopPropagation();
    transformingShapeRef.current = null;
    onUpdateShapeStroke?.(pageNumber, { ...current.stroke, points: [...current.stroke.points] });
  };
  const transformingTextRef = useRef<{
    type: "resize" | "rotate"; stroke: CsStroke;
    startClientX: number; startClientY: number;
    startX: number; startY: number;
    startWidth: number; startHeight: number; startFontSize: number;
    corner?: "nw" | "ne" | "sw" | "se";
    centerX?: number; centerY?: number; startAngle?: number; startRotation?: number;
  } | null>(null);

  const beginTextResize = (event: React.PointerEvent<HTMLButtonElement>, corner: "nw" | "ne" | "sw" | "se") => {
    if (!selectedText) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    transformingTextRef.current = {
      type: "resize", stroke: selectedText, corner,
      startClientX: event.clientX, startClientY: event.clientY,
      startX: selectedText.points[0], startY: selectedText.points[1],
      startWidth: selectedText.textBoxWidth ?? 320,
      startHeight: selectedText.textBoxHeight ?? 120,
      startFontSize: selectedText.fontSize ?? 24,
    };
  };

  const beginTextRotate = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!selectedText || !surfaceRef.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const boxWidth = (selectedText.textBoxWidth ?? 320) * (size.w / REF_WIDTH);
    const boxHeight = (selectedText.textBoxHeight ?? 120) * (size.w / REF_WIDTH);
    const centerX = rect.left + selectedText.points[0] * size.w + boxWidth / 2;
    const centerY = rect.top + selectedText.points[1] * size.h + boxHeight / 2;
    transformingTextRef.current = {
      type: "rotate", stroke: selectedText,
      startClientX: event.clientX, startClientY: event.clientY,
      startX: selectedText.points[0], startY: selectedText.points[1],
      startWidth: selectedText.textBoxWidth ?? 320,
      startHeight: selectedText.textBoxHeight ?? 120,
      startFontSize: selectedText.fontSize ?? 24,
      centerX, centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: selectedText.rotation ?? 0,
    };
  };

  const transformText = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = transformingTextRef.current;
    if (!current || size.w <= 0) return;
    event.preventDefault(); event.stopPropagation();
    if (current.type === "rotate") {
      const angle = Math.atan2(event.clientY - (current.centerY ?? 0), event.clientX - (current.centerX ?? 0));
      current.stroke.rotation = Math.round(((current.startRotation ?? 0) + (angle - (current.startAngle ?? 0)) * 180 / Math.PI) * 10) / 10;
      forceRedraw((value) => value + 1);
      return;
    }
    const dx = (event.clientX - current.startClientX) / size.w * REF_WIDTH;
    const dy = (event.clientY - current.startClientY) / size.w * REF_WIDTH;
    const left = current.corner?.includes("w") ?? false;
    const top = current.corner?.includes("n") ?? false;
    // Burchakdan tortilganda x/y bir xil nisbatda (lock qilingan aspect
    // ratio) o'zgaradi — diagonal masofa bo'yicha bitta scale koeffitsienti
    // hisoblanadi, keyin shu koeffitsient ham kenglik, ham balandlikka
    // (va shrift o'lchamiga) baravar qo'llanadi.
    const rawDx = left ? -dx : dx;
    const rawDy = top ? -dy : dy;
    const startDiagonal = Math.hypot(current.startWidth, current.startHeight) || 1;
    const projected = (current.startWidth * rawDx + current.startHeight * rawDy) / startDiagonal;
    // Pastki chegara font 1px'ga yetguncha kichrayishga ruxsat beradi —
    // avval 80x40 ref-piksel floor bo'lgani uchun fontSize kerakli darajaga
    // hali yetmasdan box kichrayishi to'xtab qolardi.
    const minScale = Math.max(1 / current.startFontSize, 2 / current.startWidth, 1.2 / current.startHeight);
    const requestedScale = Math.max(minScale, 1 + projected / startDiagonal);
    // Font 96px ga yetgach faqat matn to'xtab qolmasin: frame ham shu
    // nuqtada to'xtaydi. Eni/bo'yi backend limitlari ham shu clamp'ga kiradi.
    const maxScale = Math.max(minScale, Math.min(
      1000 / current.startWidth,
      2000 / current.startHeight,
      96 / current.startFontSize,
    ));
    const scale = Math.min(maxScale, Math.max(minScale, requestedScale));
    const nextWidth = Math.min(1000, current.startWidth * scale);
    const nextHeight = Math.min(2000, current.startHeight * scale);
    current.stroke.textBoxWidth = nextWidth;
    current.stroke.textBoxHeight = nextHeight;
    // Shrift o'lchami har doim butun son bo'lishi kerak — resize paytida
    // scale koeffitsienti kasr bo'lgani uchun Math.round bilan yaxlitlanadi.
    current.stroke.fontSize = Math.round(Math.max(1, Math.min(96, current.startFontSize * scale)));
    if (left) current.stroke.points[0] = Math.max(0, Math.min(1, current.startX + (current.startWidth - nextWidth) / REF_WIDTH));
    if (top) current.stroke.points[1] = Math.max(0, Math.min(1, current.startY + (current.startHeight - nextHeight) * size.w / REF_WIDTH / Math.max(size.h, 1)));
    forceRedraw((value) => value + 1);
  };

  const finishTextTransform = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = transformingTextRef.current;
    if (!current) return;
    event.preventDefault(); event.stopPropagation();
    transformingTextRef.current = null;
    const stroke = current.stroke;
    // Resize paytida box shunchaki scale qilingani uchun matndan katta
    // ("bo'sh joy" bilan) qolib ketishi mumkin — tugagach, matnning haqiqiy
    // (natural, o'ralmagan) o'lchamiga qarab box'ni tekis moslashtiramiz.
    if (stroke.text) {
      const measured = measureTextBox(stroke.text, stroke.fontFamily ?? "Inter", stroke.fontSize ?? 24, stroke.fontWeight ?? 400);
      stroke.textBoxWidth = measured.width + 8;
      stroke.textBoxHeight = measured.height;
    }
    onUpdateTextStroke?.(pageNumber, { ...stroke, points: [...stroke.points] });
  };

  const findTextAt = (x: number, y: number): CsStroke | null => {
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const stroke = strokes[i];
      if (stroke.tool !== "text" || stroke.points.length < 2 || !stroke.text) continue;
      const fontSize = stroke.fontSize ?? Math.max(14, stroke.width * 6);
      const lines = stroke.text.split("\n");
      const width = Math.min(1, (stroke.textBoxWidth ?? Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.62) / REF_WIDTH);
      const renderedFontSize = fontSize * (size.w / REF_WIDTH);
      const height = stroke.textBoxHeight !== undefined
        ? stroke.textBoxHeight * (size.w / REF_WIDTH) / Math.max(size.h, 1)
        : (lines.length * renderedFontSize * 1.25) / Math.max(size.h, 1);
      if (x >= stroke.points[0] && x <= stroke.points[0] + width && y >= stroke.points[1] && y <= stroke.points[1] + height) return stroke;
    }
    return null;
  };

  // Pixel-eraser: nuqta atrofidagi segmentni chizmadan kesib oladi. Agar
  // hech nima qolmasa butunlay o'chiradi, aks holda qolgan bo'lak(lar)ni
  // yangi chizmalar sifatida yuboradi.
  const erasePixelAt = useCallback((x: number, y: number) => {
    const hitRadius = eraseHitRadius(strokeWidth);
    const hit = findStrokeAt(strokes, x, y, hitRadius);
    if (!hit || erasedThisDragRef.current.has(hit.id)) return;
    erasedThisDragRef.current.add(hit.id);
    // Strelka, chiziq va shape (rectangle/ellipse) segmentlarga bo'linmaydi —
    // teginilsa butunlay o'chadi.
    if (hit.tool === "arrow" || hit.tool === "line" || hit.tool === "rectangle" || hit.tool === "ellipse") {
      onEraseStroke?.(pageNumber, hit.id);
      return;
    }
    const remaining = eraseNearPoint(hit, x, y, hitRadius);
    if (remaining === null) return;
    if (remaining.length === 0) onEraseStroke?.(pageNumber, hit.id);
    else onSplitStroke?.(pageNumber, hit.id, remaining);
  }, [strokes, strokeWidth, pageNumber, onEraseStroke, onSplitStroke]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    onActivate();
    const p = normPoint(e);
    if (!p) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onPointerMove?.(pageNumber, p[0], p[1], true);
    // Alohida saqlash/bekor qilish tugmalari kerak emas: canvasga qayta
    // bosilganda joriy matn avtomatik saqlanadi.
    if (textEditor) {
      commitText();
      return;
    }
    if (tool === "laser") return;
    if (tool === "text") {
      setEditingTextId(null);
      setTextEditor({ x: p[0], y: p[1], text: "", color, textBoxWidth: 360, textBoxHeight: 120, ...lastTextStyleRef.current });
      return;
    }
    if (tool === "lasso") {
      // Guruh bounding box ichiga bosilsa — resize tutqichlari alohida
      // <button>lar orqali ishlaydi, shu yerga kelmaydi — bo'lmasa guruhni
      // ko'chirish uchun sudrash boshlanadi; bo'sh joyga bosilsa yangi
      // lasso yo'li chiziladi va eski tanlov bekor qilinadi.
      if (selectedGroupBounds && p[0] >= selectedGroupBounds.left && p[0] <= selectedGroupBounds.right
        && p[1] >= selectedGroupBounds.top && p[1] <= selectedGroupBounds.bottom) {
        draggingGroupRef.current = { ids: new Set(selectedGroupIds), startX: p[0], startY: p[1] };
        return;
      }
      setSelectedGroupIds(new Set());
      lassoDraftRef.current = [p[0], p[1]];
      forceRedraw((n) => n + 1);
      return;
    }
    if (tool === "select") {
      const existing = findTextAt(p[0], p[1]);
      setSelectedTextId(existing?.id ?? null);
      if (existing) {
        setSelectedShapeId(null);
        // Ikki marta bosish (yoki tanlangan matnni qayta bosish) workspace
        // ichida matnni bevosita tahrirlash rejimini ochadi. e.detail
        // PointerEvent uchun ba'zi brauzerlarda (Safari) ishonchli emas,
        // shuning uchun vaqt+ID asosida qo'lda tekshiriladi.
        const now = Date.now();
        const isDoubleClick = lastClickRef.current?.id === existing.id && now - lastClickRef.current.atMs < DOUBLE_CLICK_MS;
        lastClickRef.current = { id: existing.id, atMs: now };
        if (e.detail >= 2 || isDoubleClick) {
          lastClickRef.current = null;
          setEditingTextId(existing.id);
          const existingFontFamily = existing.fontFamily ?? "Inter";
          const existingFontSize = existing.fontSize ?? 24;
          const existingFontWeight = existing.fontWeight ?? 600;
          // Tahrirlashga kirishda box existing.textBoxHeight'ni AYNAN
          // ko'chirmasdan, matnning haqiqiy tabiiy o'lchamiga moslab
          // tekislanadi — aks holda avval resize qilib kattalashtirilgan
          // (yoki eski, hali tekislanmagan) box baland qolib ketib, editor
          // ichida matn markazga tortilib ancha pastda ko'rinardi, saqlash
          // (commitText) esa boxni tor o'lchamga qaytarganda matn tepaga
          // "sakrab" ketganday tuyular edi.
          const measured = measureTextBox(existing.text ?? "", existingFontFamily, existingFontSize, existingFontWeight);
          setTextEditor({
            x: existing.points[0], y: existing.points[1], text: existing.text ?? "", color: existing.color,
            fontFamily: existingFontFamily, fontSize: existingFontSize,
            fontWeight: existingFontWeight, textAlign: existing.textAlign ?? "left",
            textBoxWidth: Math.max(existing.textBoxWidth ?? 0, measured.width + 8), textBoxHeight: measured.height,
          });
        } else {
          draggingTextRef.current = { stroke: existing, dx: p[0] - existing.points[0], dy: p[1] - existing.points[1] };
        }
        return;
      }
      const existingShape = findSelectableShapeAt(
        strokes.filter((stroke) => stroke.tool === "rectangle" || stroke.tool === "ellipse"),
        p[0], p[1], eraseHitRadius(strokeWidth),
      );
      setSelectedShapeId(existingShape?.id ?? null);
      if (existingShape) {
        draggingShapeRef.current = {
          stroke: existingShape, dx: p[0] - existingShape.points[0], dy: p[1] - existingShape.points[1],
        };
      }
      if (!existing && !existingShape) {
        const existingStroke = findStrokeAt(
          strokes.filter((stroke) => stroke.tool !== "text" && stroke.tool !== "rectangle" && stroke.tool !== "ellipse"),
          p[0], p[1], eraseHitRadius(strokeWidth),
        );
        if (existingStroke) {
          draggingStrokeRef.current = {
            stroke: existingStroke,
            dx: p[0] - existingStroke.points[0],
            dy: p[1] - existingStroke.points[1],
          };
        }
      }
      return;
    }
    if (tool === "eraser-pixel") {
      draggingEraserRef.current = true;
      erasedThisDragRef.current = new Set();
      erasePixelAt(p[0], p[1]);
      return;
    }
    if (tool === "eraser-stroke") {
      draggingEraserRef.current = true;
      erasedThisDragRef.current = new Set();
      const hit = findStrokeAt(strokes, p[0], p[1], eraseHitRadius(strokeWidth));
      if (hit && !erasedThisDragRef.current.has(hit.id)) {
        erasedThisDragRef.current.add(hit.id);
        onEraseStroke?.(pageNumber, hit.id);
      }
      return;
    }
    draftRef.current = (tool === "arrow" || tool === "line" || tool === "rectangle" || tool === "ellipse") ? [p[0], p[1], p[0], p[1]] : [...p];
    draftPressuresRef.current = tool === "pen" && e.pointerType === "pen"
      ? [Math.max(0.01, Math.min(1, e.pressure || 0.5))]
      : null;
    forceRedraw((n) => n + 1);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    onPointerMove?.(pageNumber, p[0], p[1], true);
    if (tool === "laser") return;
    if (draggingGroupRef.current) {
      const { ids, startX, startY } = draggingGroupRef.current;
      const offsetX = p[0] - startX;
      const offsetY = p[1] - startY;
      draggingGroupRef.current = { ids, startX: p[0], startY: p[1] };
      for (const stroke of strokes) {
        if (!ids.has(stroke.id)) continue;
        for (let i = 0; i < stroke.points.length; i += 2) {
          stroke.points[i] += offsetX;
          stroke.points[i + 1] += offsetY;
        }
      }
      forceRedraw((n) => n + 1);
      return;
    }
    if (lassoDraftRef.current) {
      lassoDraftRef.current.push(p[0], p[1]);
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingTextRef.current) {
      const { stroke, dx, dy } = draggingTextRef.current;
      const nextX = Math.max(0, Math.min(1, p[0] - dx));
      const nextY = Math.max(0, Math.min(1, p[1] - dy));
      stroke.points[0] = nextX;
      stroke.points[1] = nextY;
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingShapeRef.current) {
      const { stroke, dx, dy } = draggingShapeRef.current;
      const width = stroke.points[2] - stroke.points[0];
      const height = stroke.points[3] - stroke.points[1];
      const nextX0 = Math.max(0, Math.min(1 - width, p[0] - dx));
      const nextY0 = Math.max(0, Math.min(1 - height, p[1] - dy));
      stroke.points = [nextX0, nextY0, nextX0 + width, nextY0 + height];
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingStrokeRef.current) {
      const { stroke, dx, dy } = draggingStrokeRef.current;
      const nextX = p[0] - dx;
      const nextY = p[1] - dy;
      const offsetX = nextX - stroke.points[0];
      const offsetY = nextY - stroke.points[1];
      const moved = stroke.points.map((value, index) => value + (index % 2 === 0 ? offsetX : offsetY));
      if (moved.every((value) => value >= 0 && value <= 1)) {
        stroke.points = moved;
        forceRedraw((n) => n + 1);
      }
      return;
    }
    if (tool === "eraser-pixel" || tool === "eraser-stroke") {
      eraserCursorRef.current = p;
      forceRedraw((n) => n + 1);
    }
    if (tool === "eraser-pixel") {
      // Drag paytida teginilgan har bir joyni darhol kesib o'chiradi —
      // hover-preview yo'q, oddiy o'chirg'ich xatti-harakati.
      if (draggingEraserRef.current) erasePixelAt(p[0], p[1]);
      return;
    }
    if (tool === "eraser-stroke") {
      const hit = findStrokeAt(strokes, p[0], p[1], eraseHitRadius(strokeWidth));
      if (draggingEraserRef.current) {
        if (hit && !erasedThisDragRef.current.has(hit.id)) {
          erasedThisDragRef.current.add(hit.id);
          onEraseStroke?.(pageNumber, hit.id);
        }
      } else {
        // Sichqoncha ustidan o'tayotgan chizma xiralashib ko'rsatiladi
        // (preview) — bosilganda butunlay o'chadi.
        setHoveredStrokeId(hit?.id ?? null);
      }
      return;
    }
    if (tool === "select") {
      // Select rejimida sichqoncha biror sudrab ko'chirsa bo'ladigan
      // obyekt (matn/shape/chiziq) ustida turganda — foydalanuvchiga uni
      // ushlab surish mumkinligini bildirish uchun xiralashtirib
      // ko'rsatiladi (eraser-stroke'dagi hover-preview bilan bir xil
      // mexanizm) va kursor "grab" ga o'zgaradi (pastdagi canvas style'da).
      // Hit-test tartibi handlePointerDown bilan bir xil: matn → shape →
      // oddiy chiziq.
      const hoveredText = findTextAt(p[0], p[1]);
      const hoveredShape = hoveredText ? null : findSelectableShapeAt(
        strokes.filter((stroke) => stroke.tool === "rectangle" || stroke.tool === "ellipse"),
        p[0], p[1], eraseHitRadius(strokeWidth),
      );
      const hoveredStroke = hoveredText || hoveredShape ? null : findStrokeAt(
        strokes.filter((stroke) => stroke.tool !== "text" && stroke.tool !== "rectangle" && stroke.tool !== "ellipse"),
        p[0], p[1], eraseHitRadius(strokeWidth),
      );
      const hit = hoveredText ?? hoveredShape ?? hoveredStroke;
      setHoveredStrokeId(hit?.id ?? null);
      return;
    }
    const draft = draftRef.current;
    if (!draft) return;
    if (tool === "arrow" || tool === "line" || tool === "rectangle" || tool === "ellipse") {
      // Strelka/chiziq/shape uchun faqat boshlanish + hozirgi nuqta
      // (bounding box burchaklari) saqlanadi — freehand emas.
      let nextX = p[0];
      let nextY = p[1];
      // Chiziq chizilayotganda Shift bosib turilsa, burchak 45 gradusning
      // karraliga (0/45/90/135/180/225/270/315) qulflanadi — Excalidraw'dagi
      // odatiy xatti-harakat. Burchak piksel (aspect-corrected) koordinatada
      // hisoblanadi, aks holda tахта kvadrat bo'lmaganda (masalan A4) burchak
      // buzilib ko'rinadi.
      if (tool === "line" && e.shiftKey && size.w > 0 && size.h > 0) {
        const dxPx = (nextX - draft[0]) * size.w;
        const dyPx = (nextY - draft[1]) * size.h;
        const distPx = Math.hypot(dxPx, dyPx);
        if (distPx > 0) {
          const angle = Math.atan2(dyPx, dxPx);
          const snapStep = Math.PI / 4;
          const snappedAngle = Math.round(angle / snapStep) * snapStep;
          nextX = draft[0] + (Math.cos(snappedAngle) * distPx) / size.w;
          nextY = draft[1] + (Math.sin(snappedAngle) * distPx) / size.h;
        }
      }
      // To'rtburchak/doira chizilayotganda Shift bosib turilsa, eni-bo'yi
      // teng (kvadrat/doira) bo'lib qoladi — piksel (aspect-corrected)
      // o'lchamlarda kattaroq tomonga moslashtiriladi, kichikroq tomon
      // shunga teng qilib qo'yiladi, yo'nalish (belgi) saqlanadi.
      if ((tool === "rectangle" || tool === "ellipse") && e.shiftKey && size.w > 0 && size.h > 0) {
        const widthPx = (nextX - draft[0]) * size.w;
        const heightPx = (nextY - draft[1]) * size.h;
        const side = Math.max(Math.abs(widthPx), Math.abs(heightPx));
        const signedWidthPx = Math.sign(widthPx) * side || side;
        const signedHeightPx = Math.sign(heightPx) * side || side;
        nextX = draft[0] + signedWidthPx / size.w;
        nextY = draft[1] + signedHeightPx / size.h;
      }
      draft[2] = nextX;
      draft[3] = nextY;
      forceRedraw((n) => n + 1);
      return;
    }
    const lastX = draft[draft.length - 2];
    const lastY = draft[draft.length - 1];
    // Juda-juda yaqin nuqtalarni (masalan bir xil pozitsiyada ikki marta
    // event kelishi) tashlab ketamiz — bundan ortiq filtrlash burchakli
    // chiziqqa olib keladi, chunki tez harakatda nuqtalar allaqachon siyrak.
    if (Math.abs(p[0] - lastX) + Math.abs(p[1] - lastY) < 0.0005) return;
    draft.push(p[0], p[1]);
    if (tool === "pen" && draftPressuresRef.current) {
      draftPressuresRef.current.push(Math.max(0.01, Math.min(1, e.pressure || 0.5)));
    }
    forceRedraw((n) => n + 1);
  };

  const finishStroke = () => {
    if (!editable) return;
    onPointerMove?.(pageNumber, 0, 0, false);
    if (tool === "laser") return;
    if (isEraser) {
      draggingEraserRef.current = false;
      return;
    }
    if (draggingGroupRef.current) {
      const { ids } = draggingGroupRef.current;
      draggingGroupRef.current = null;
      for (const stroke of strokes) {
        if (ids.has(stroke.id)) commitGroupStroke({ ...stroke, points: [...stroke.points] });
      }
      forceRedraw((n) => n + 1);
      return;
    }
    if (lassoDraftRef.current) {
      const path = lassoDraftRef.current;
      lassoDraftRef.current = null;
      if (path.length >= 6) {
        const enclosed = findStrokesInLasso(strokes, path);
        setSelectedGroupIds(new Set(enclosed));
      }
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingTextRef.current) {
      const { stroke } = draggingTextRef.current;
      onMoveStroke?.(pageNumber, stroke.id, stroke.points[0], stroke.points[1]);
      draggingTextRef.current = null;
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingShapeRef.current) {
      const { stroke } = draggingShapeRef.current;
      onUpdateShapeStroke?.(pageNumber, { ...stroke, points: [...stroke.points] });
      draggingShapeRef.current = null;
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingStrokeRef.current) {
      const { stroke } = draggingStrokeRef.current;
      onMoveStroke?.(pageNumber, stroke.id, stroke.points[0], stroke.points[1]);
      draggingStrokeRef.current = null;
      forceRedraw((n) => n + 1);
      return;
    }
    const draft = draftRef.current;
    draftRef.current = null;
    const draftPressures = draftPressuresRef.current;
    draftPressuresRef.current = null;
    if (draft && draft.length >= 2) {
      const isShape = tool === "rectangle" || tool === "ellipse";
      // Nuqta kabi bosilib qo'yilgan (drag qilinmagan) shape saqlanmaydi —
      // ko'rinmas 0x0 chizma qolib ketmasin.
      if (!isShape || Math.abs(draft[2] - draft[0]) > 0.003 || Math.abs(draft[3] - draft[1]) > 0.003) {
        const strokeId = crypto.randomUUID();
        onStrokeComplete?.(pageNumber, {
          id: strokeId, tool: tool as CsTool, color, width: strokeWidth, points: draft,
          ...(tool === "pen" && draftPressures?.length === draft.length / 2 ? { pressures: draftPressures } : {}),
          ...(isShape ? { ...shapeStyle } : {}),
        });
        if (isShape) {
          setSelectedShapeId(strokeId);
          onToolChange?.("select");
        }
      }
    }
    forceRedraw((n) => n + 1);
  };

  const handlePointerLeave = () => {
    setHoveredStrokeId(null);
    eraserCursorRef.current = null;
    finishStroke();
  };

  const editorFontSize = textEditor
    ? Math.max(1, textEditor.fontSize * (size.w / REF_WIDTH))
    : 16;
  const editorWidth = textEditor ? Math.max(40, textEditor.textBoxWidth * (size.w / REF_WIDTH)) : 140;
  const editorHeight = textEditor ? Math.max(24, textEditor.textBoxHeight * (size.w / REF_WIDTH)) : 48;

  return (
    <div ref={wrapRef} data-page={pageNumber} className="relative shrink-0 w-full flex justify-center">
      {visible ? (
        <div
          ref={(element) => { if (notebook) surfaceRef.current = element; }}
          className={`relative ${notebook ? "aspect-[210/297] w-full bg-white shadow-sm" : "w-full"}`}
          // Daftar 100% zoom'da viewport kengligini to'liq egallaydi. Zoom
          // konteynerning tashqi width'i orqali qo'llanadi; max-width bilan
          // yana 768px ga qisqartirish teacher/student nisbatini buzardi.
          // MUHIM: ResizeObserver shu TASHQI aspect-ratio box'ning o'ziga
          // ulanadi, ichki "absolute inset-0" bolaga emas — bola o'z
          // o'lchamini otadan meros qiladi, shuning uchun zoom paytida
          // avval ota kengligi o'zgarib, keyin aspect-ratio balandligi
          // hisoblanib, keyin bolaga uzatilishi kerak edi. Bu qo'shimcha
          // reflow bosqichi ResizeObserver'ni ikki marta (avval eski/oraliq,
          // keyin to'g'ri o'lcham bilan) ishga tushirar, natijada zoom
          // tugmasi bosilganda daftar bir lahza eski joyga sakrab qaytardi.
          style={notebook ? { width: "100%" } : undefined}
        >
          {notebook ? (
            <div
              aria-label={`Daftar sahifasi ${pageNumber}`}
              className="absolute inset-0 bg-white"
              style={
                notebookStyle === "plain"
                  ? undefined
                  : notebookStyle === "lined"
                    ? {
                        // Yo'l-yo'l (chiziqli) daftar — faqat gorizontal
                        // chiziqlar, katak/vertikal chiziqsiz. Real daftarda
                        // qatorlar orasi ~7mm — A4 kengligi (210mm) ga
                        // proporsional: 210/7 = 30 qator butun sahifa
                        // kengligida (piksel emas, mm asosida hisoblangan,
                        // shuning uchun ekran o'lchamidan qat'i nazar doim
                        // haqiqiy daftarga mos keladi).
                        backgroundImage: "linear-gradient(rgba(96,165,250,.28) 1px, transparent 1px)",
                        backgroundSize: `100% ${size.w > 0 ? size.w / 30 : 32}px`,
                      }
                    : {
                        // Kataklar qat'iy pikselda emas, A4 sahifa kengligiga
                        // proporsional. Real daftar katagi ~5mm — A4 kengligi
                        // (210mm) ga nisbatan 210/5 = 42 ta katak butun
                        // sahifa kengligida, katta-kichik ekran va split
                        // panelda ham doim bir xil (haqiqiy daftarga mos)
                        // ko'rinadi.
                        backgroundImage:
                          "linear-gradient(rgba(96,165,250,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,.22) 1px, transparent 1px)",
                        backgroundSize: `${size.w > 0 ? size.w / 42 : 24}px ${size.w > 0 ? size.w / 42 : 24}px`,
                      }
              }
            />
          ) : (
            <img
              ref={(element) => { surfaceRef.current = element; }}
              src={url}
              alt={`Sahifa ${pageNumber}`}
              className="block h-auto w-full select-none"
              draggable={false}
              onLoad={syncSize}
            />
          )}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{
              touchAction: editable ? "none" : "auto",
              // Select rejimida: bo'sh joy ustida oddiy "pointer" (qo'l),
              // sudrab ko'chirsa bo'ladigan obyekt (matn/shape/chiziq)
              // ustiga kelganda "grab" (ushlab olish mumkinligini
              // bildiradi) — hoveredStrokeId shu holatni kuzatadi.
              cursor: editable
                ? (isEraser ? "cell" : tool === "select" ? (hoveredStrokeId ? "grab" : "pointer") : (tool === "text" ? "move" : "crosshair"))
                : "default",
              pointerEvents: editable ? "auto" : "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={handlePointerLeave}
          />
          {textEditor && (
            <>
            <div
              className="absolute z-30 flex flex-col justify-center"
              style={{ left: `${textEditor.x * 100}%`, top: `${textEditor.y * 100}%`, width: editorWidth, height: editorHeight }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
            >
              <textarea
                ref={textInputRef}
                value={textEditor.text}
                onChange={(event) => setTextEditor((current) => current ? { ...current, text: event.target.value.slice(0, 500) } : current)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setTextEditor(null);
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commitText();
                }}
                onPointerUp={() => {
                  const rect = textInputRef.current?.getBoundingClientRect();
                  if (!rect || size.w <= 0) return;
                  setTextEditor((current) => current ? {
                    ...current,
                    textBoxWidth: Math.max(4, Math.min(1000, rect.width / size.w * REF_WIDTH)),
                    textBoxHeight: Math.max(1, Math.min(1600, rect.height / size.w * REF_WIDTH)),
                  } : current);
                }}
                className="classroom-text-editor block w-full shrink-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0"
                style={{
                  // MUHIM: height endi butun qutini (editorHeight) emas,
                  // faqat matnning o'zi egallaydigan tabiiy balandlikni
                  // to'ldiradi ("auto" + JS orqali scrollHeight'ga
                  // moslashtiriladi, pastdagi useEffect'ga qarang) — shunda
                  // atrofdagi flex konteyner (justify-center) qolgan bo'sh
                  // joyni tepa/pastga teng taqsimlab, matn qutida vertikal
                  // markazda ko'rinadi.
                  margin: 0,
                  backgroundColor: "transparent",
                  appearance: "none",
                  color: textEditor.color,
                  fontFamily: textEditor.fontFamily,
                  fontSize: editorFontSize,
                  fontWeight: textEditor.fontWeight,
                  textAlign: textEditor.textAlign,
                  lineHeight: 1.25,
                }}
              />
            </div>
            {showStylePanel && <TextStylePanel
              color={textEditor.color}
              fontFamily={textEditor.fontFamily}
              fontSize={textEditor.fontSize}
              fontWeight={textEditor.fontWeight}
              textAlign={textEditor.textAlign}
              onColorChange={(nextColor) => setTextEditor((current) => current ? { ...current, color: nextColor } : current)}
              onFontFamilyChange={(fontFamily) => setTextEditor((current) => current ? { ...current, fontFamily } : current)}
              onFontSizeChange={(fontSize) => setTextEditor((current) => current ? { ...current, fontSize } : current)}
              onFontWeightChange={(fontWeight) => setTextEditor((current) => current ? { ...current, fontWeight } : current)}
              onTextAlignChange={(textAlign) => setTextEditor((current) => current ? { ...current, textAlign } : current)}
              onReorder={() => {}}
            />}
            </>
          )}
          {tool === "select" && selectedText && selectedText.id !== editingTextId && (
            // Tahrirlash (textEditor) paytida shu chizma tanlangan holicha
            // qolishi mumkin — agar shart tekshirilmasa, tahrirlanayotgan
            // matn ustiga eski (endi noto'g'ri o'lchamdagi) ko'k ramka va
            // resize tutqichlari chizib qo'yiladi.
            // MUHIM: TextStylePanel shu divning TASHQARISIDA (pastda,
            // alohida) render qilinadi — bu div "transform: rotate(...)"
            // ishlatadi, va CSS spetsifikatsiyasiga ko'ra HAR QANDAY
            // transform (hatto rotate(0deg) ham) ichidagi position:fixed
            // elementlar uchun containing block bo'lib qoladi. Shu sabab
            // panel avval ekran chekkasi o'rniga aynan shu (ba'zan
            // markazdagi) chizma yonida chiqib qolardi.
            <>
            <div
              className="pointer-events-none absolute z-20 border border-indigo-500"
              style={{
                left: `${selectedText.points[0] * 100}%`,
                top: `${selectedText.points[1] * 100}%`,
                width: `${(selectedText.textBoxWidth ?? 320) * (size.w / REF_WIDTH)}px`,
                height: `${(selectedText.textBoxHeight ?? 120) * (size.w / REF_WIDTH)}px`,
                transform: `rotate(${selectedText.rotation ?? 0}deg)`,
                transformOrigin: "center",
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Matn o'lchamini ${corner} tomondan o'zgartirish`}
                  className={`pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-indigo-500 bg-white ${corner.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${corner.includes("w") ? "-left-1.5" : "-right-1.5"}`}
                  style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                  onPointerDown={(event) => beginTextResize(event, corner)}
                  onPointerMove={transformText}
                  onPointerUp={finishTextTransform}
                  onPointerCancel={finishTextTransform}
                />
              ))}
              <div className="pointer-events-none absolute left-1/2 -top-8 h-6 w-px -translate-x-1/2 bg-indigo-500" />
              <button
                type="button"
                aria-label="Matnni aylantirish"
                className="pointer-events-auto absolute left-1/2 -top-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-indigo-500 bg-white cursor-grab active:cursor-grabbing"
                onPointerDown={beginTextRotate}
                onPointerMove={transformText}
                onPointerUp={finishTextTransform}
                onPointerCancel={finishTextTransform}
              />
            </div>
            {showStylePanel && <TextStylePanel
              color={selectedText.color}
              fontFamily={selectedText.fontFamily ?? "Inter"}
              fontSize={selectedText.fontSize ?? 24}
              fontWeight={selectedText.fontWeight ?? 600}
              textAlign={selectedText.textAlign ?? "left"}
              onColorChange={(nextColor) => updateSelectedText({ color: nextColor })}
              onFontFamilyChange={(fontFamily) => updateSelectedText({ fontFamily })}
              onFontSizeChange={(fontSize) => updateSelectedText({ fontSize })}
              onFontWeightChange={(fontWeight) => updateSelectedText({ fontWeight })}
              onTextAlignChange={(textAlign) => updateSelectedText({ textAlign })}
              onReorder={(op) => selectedText && onReorderStroke?.(pageNumber, [selectedText.id], op)}
              onDelete={() => {
                onEraseStroke?.(pageNumber, selectedText.id);
                setSelectedTextId(null);
              }}
            />}
            </>
          )}
          {showStylePanel && (tool === "rectangle" || tool === "ellipse") && !selectedShape && onShapeStyleChange && (
            // Excalidraw'da bo'lgani kabi: hali hech narsa chizilmasdan
            // oldin ham (faqat asbob tanlanganda) sozlamalar paneli
            // ko'rinadi — keyingi yaratiladigan shape shu uslub bilan
            // chiqadi. Stroke rang va qalinligi ham shu panelda ko'rinadi.
            <ShapeStylePanel
              color={color}
              backgroundColor={shapeStyle.backgroundColor}
              fillStyle={shapeStyle.fillStyle}
              strokeWidth={strokeWidth}
              strokeStyle={shapeStyle.strokeStyle}
              edges={shapeStyle.edges}
              opacity={shapeStyle.opacity}
              onColorChange={(nextColor) => onColorChange?.(nextColor)}
              onBackgroundColorChange={(backgroundColor) => onShapeStyleChange({ ...shapeStyle, backgroundColor })}
              onFillStyleChange={(fillStyle) => onShapeStyleChange({ ...shapeStyle, fillStyle })}
              onStrokeWidthChange={(width) => onStrokeWidthChange?.(width)}
              onStrokeStyleChange={(strokeStyle) => onShapeStyleChange({ ...shapeStyle, strokeStyle })}
              onEdgesChange={(edges) => onShapeStyleChange({ ...shapeStyle, edges })}
              onOpacityChange={(opacity) => onShapeStyleChange({ ...shapeStyle, opacity })}
              onReorder={() => {}}
            />
          )}
          {tool === "select" && selectedShape && (
            // TextStylePanel'dagi kabi: ShapeStylePanel shu rotate()
            // transformli divning TASHQARISIDA render qilinadi.
            <>
            <div
              className="pointer-events-none absolute z-20 border border-indigo-500"
              style={{
                left: `${Math.min(selectedShape.points[0], selectedShape.points[2]) * 100}%`,
                top: `${Math.min(selectedShape.points[1], selectedShape.points[3]) * 100}%`,
                width: `${Math.abs(selectedShape.points[2] - selectedShape.points[0]) * 100}%`,
                height: `${Math.abs(selectedShape.points[3] - selectedShape.points[1]) * 100}%`,
                transform: `rotate(${selectedShape.rotation ?? 0}deg)`,
                transformOrigin: "center",
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Shape o'lchamini ${corner} tomondan o'zgartirish`}
                  className={`pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-indigo-500 bg-white ${corner.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${corner.includes("w") ? "-left-1.5" : "-right-1.5"}`}
                  style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                  onPointerDown={(event) => beginShapeResize(event, corner)}
                  onPointerMove={transformShape}
                  onPointerUp={finishShapeTransform}
                  onPointerCancel={finishShapeTransform}
                />
              ))}
              <div className="pointer-events-none absolute left-1/2 -top-8 h-6 w-px -translate-x-1/2 bg-indigo-500" />
              <button
                type="button"
                aria-label="Shape'ni aylantirish"
                className="pointer-events-auto absolute left-1/2 -top-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-indigo-500 bg-white cursor-grab active:cursor-grabbing"
                onPointerDown={beginShapeRotate}
                onPointerMove={transformShape}
                onPointerUp={finishShapeTransform}
                onPointerCancel={finishShapeTransform}
              />
            </div>
            {showStylePanel && <ShapeStylePanel
              color={selectedShape.color}
              backgroundColor={selectedShape.backgroundColor ?? "transparent"}
              fillStyle={selectedShape.fillStyle ?? "hachure"}
              strokeWidth={selectedShape.width}
              strokeStyle={selectedShape.strokeStyle ?? "solid"}
              edges={selectedShape.edges ?? "sharp"}
              opacity={selectedShape.opacity ?? 100}
              onColorChange={(nextColor) => updateSelectedShape({ color: nextColor })}
              onBackgroundColorChange={(backgroundColor) => updateSelectedShape({ backgroundColor })}
              onFillStyleChange={(fillStyle) => updateSelectedShape({ fillStyle })}
              onStrokeWidthChange={(width) => updateSelectedShape({ width })}
              onStrokeStyleChange={(strokeStyle) => updateSelectedShape({ strokeStyle })}
              onEdgesChange={(edges) => updateSelectedShape({ edges })}
              onOpacityChange={(opacity) => updateSelectedShape({ opacity })}
              onReorder={(op) => selectedShape && onReorderStroke?.(pageNumber, [selectedShape.id], op)}
            />}
            </>
          )}
          {tool === "lasso" && selectedGroupBounds && (
            <div
              className="pointer-events-none absolute z-20 border-2 border-dashed border-indigo-500 bg-indigo-500/5"
              style={{
                left: `${selectedGroupBounds.left * 100}%`,
                top: `${selectedGroupBounds.top * 100}%`,
                width: `${(selectedGroupBounds.right - selectedGroupBounds.left) * 100}%`,
                height: `${(selectedGroupBounds.bottom - selectedGroupBounds.top) * 100}%`,
              }}
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  aria-label={`Guruh o'lchamini ${corner} tomondan o'zgartirish`}
                  className={`pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-indigo-500 bg-white ${corner.includes("n") ? "-top-1.5" : "-bottom-1.5"} ${corner.includes("w") ? "-left-1.5" : "-right-1.5"}`}
                  style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                  onPointerDown={(event) => beginGroupResize(event, corner)}
                  onPointerMove={transformGroupResize}
                  onPointerUp={finishGroupResize}
                  onPointerCancel={finishGroupResize}
                />
              ))}
              <div className="pointer-events-auto absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1">
                {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={() => onReorderStroke?.(pageNumber, [...selectedGroupIds], value)}
                    className="rounded-full bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-100"
                  >
                    <Icon size={13} />
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Tanlangan guruhni nusxalash"
                  title="Nusxalash"
                  onClick={duplicateSelectedGroup}
                  className="rounded-full bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-100"
                >
                  <Copy size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Tanlangan guruhni o'chirish"
                  onClick={deleteSelectedGroup}
                  className="rounded-full bg-red-500 p-1.5 text-white shadow-md hover:bg-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="pointer-events-none absolute left-1/2 -bottom-8 h-6 w-px -translate-x-1/2 bg-indigo-500" />
              <button
                type="button"
                aria-label="Tanlangan guruhni aylantirish"
                title="Aylantirish"
                className="pointer-events-auto absolute left-1/2 -bottom-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-indigo-500 bg-white text-indigo-500 shadow-md cursor-grab active:cursor-grabbing"
                onPointerDown={beginGroupRotate}
                onPointerMove={transformGroupRotate}
                onPointerUp={finishGroupRotate}
                onPointerCancel={finishGroupRotate}
              >
                <RotateCw size={11} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-3/4 max-w-3xl bg-gray-200 animate-pulse rounded-xl" />
      )}
      {isHost && (
        <div className="absolute bottom-1 right-9 z-20">
          <button
            type="button"
            onClick={() => notebook ? setShowStylePopup((v) => !v) : onInsertPage?.(pageNumber)}
            title="Sahifa qo'shish"
            className="flex items-center justify-center rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm transition-colors hover:bg-indigo-50 hover:text-indigo-500"
          >
            <Plus size={12} />
          </button>
          {showStylePopup && notebook && (
            <div className="absolute bottom-8 right-0 flex flex-col gap-1 rounded-xl bg-white p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "grid"); }}
                title="Katakli"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Grid3x3 size={14} /> Katakli
              </button>
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "lined"); }}
                title="Yo'l-yo'l"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <AlignJustify size={14} /> Yo'l-yo'l
              </button>
              <button
                type="button"
                onClick={() => { setShowStylePopup(false); onInsertPage?.(pageNumber, "plain"); }}
                title="Naqshsiz"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Square size={14} /> Naqshsiz
              </button>
            </div>
          )}
        </div>
      )}
      {isHost && (
        <div className="absolute bottom-1 right-1 z-20">
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={!canRemove}
            title={canRemove ? "Sahifani o'chirish" : "Kamida bitta sahifa qolishi kerak"}
            className="flex items-center justify-center rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/90 disabled:hover:text-gray-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {confirmRemove && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setConfirmRemove(false)}
          />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm text-gray-700 mb-1 font-medium">
                Sahifani o'chirish
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {pageNumber}-sahifani darsdan o'chirasizmi? Bu amalni qaytarib bo'lmaydi.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => { setConfirmRemove(false); onRemovePage?.(pageNumber); }}
                  className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ClassroomPdfViewer({
  pageUrls, currentPage, strokesByPage, rightStrokesByPage = {}, pointer, editable, isHost, hostZoom, onZoomChange,
  hostScroll, rightHostScroll = null, onScrollChange, onPaneScrollChange, rightHostZoom = hostZoom, onPaneZoomChange, tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, shapeStyle, onShapeStyleChange, onUpdateShapeStroke, onPaneUpdateShapeStroke, onReorderStroke, onPaneReorderStroke, onStrokeComplete, onMoveStroke, onPaneMoveStroke, onPaneStrokeComplete, onPointerMove, hostSplitRatio = 0.5, onSetSplitRatio,
  onEraseStroke, onPaneEraseStroke, onSplitStroke, onPaneSplitStroke, onPageChange, toolbar, toolbarActions, boardMode, onBoardModeChange, onUpdateTextStroke, onPaneUpdateTextStroke, onActivePaneChange,
  boardLayout = "single", leftBoardMode = boardMode, rightBoardMode = boardMode, onBoardViewChange,
  notebookPageStyles = {},
  noSync = false,
  notebookPageCount = 4,
  onRemovePage,
  onInsertPdfPage, onInsertNotebookPage,
}: Props) {
  // Auto-hide faqat o'quvchi uchun (ekranni band qilmaslik uchun) — ustoz
  // toolbar/o'quvchilar/yakunlash barlariga doim tezkor kirishi kerak,
  // shuning uchun ular hech qachon yashirilmaydi.
  const { visible: autoHideVisible } = useAutoHideOverlay();
  const overlayVisible = isHost || autoHideVisible;
  const scrollRef = useRef<HTMLDivElement>(null);
  const paneScrollRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // O'ng panel (split rejimdagi ikkinchi taxta) uchun ham chap paneldagi
  // kabi ANIQ page+yRatio modeli ishlatiladi — avval faqat umumiy
  // scrollHeight foizi (viewport balandligiga bog'liq) ishlatilardi, bu
  // ustoz va talaba turli ekran o'lchamida (masalan mobil fullscreen) bo'lsa
  // pozitsiyani mos kelmasligiga olib kelardi. `rightScrollRef` — paneScrollRefs
  // Map'idagi element uchun useClassroomScrollSync talab qiladigan
  // RefObject ko'rinishidagi proksi.
  const rightPageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rightScrollRef = useRef<{ current: HTMLDivElement | null }>({
    get current() { return paneScrollRefs.current.get(1) ?? null; },
  }).current;
  // O'quvchi uchun: yoqilgan = sinxron (ustoz bilan birga, hech narsa
  // qimirlatib bo'lmaydi); o'chirilgan = erkin scroll/zoom. Ustoz doim
  // o'zi navigatsiya qiladi, shu toggle unga tegishli emas.
  const [synced, setSynced] = useState(!noSync);
  // Split panel kengligi: ustoz uchun hostSplitRatio to'g'ridan-to'g'ri
  // serverdan boshqariladi (onSetSplitRatio orqali). O'quvchi sinxron
  // (synced) bo'lsa ham hostSplitRatio'ga qarab ko'radi. O'quvchi erkin
  // harakatlanish (move) rejimida bo'lsa, localSplitRatio'ni mustaqil
  // sudraydi — bu qiymat serverga hech qachon yuborilmaydi.
  const [localSplitRatio, setLocalSplitRatio] = useState(hostSplitRatio);
  const effectiveSplitRatio = isHost || synced ? hostSplitRatio : localSplitRatio;
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const canDragSplit = !noSync && (isHost || !synced);

  const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDragSplit) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setIsDraggingSplit(true);
  };

  const handleSplitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const raw = (event.clientX - rect.left) / rect.width;
    const clamped = Math.min(0.8, Math.max(0.2, raw));
    if (isHost) onSetSplitRatio?.(clamped);
    else setLocalSplitRatio(clamped);
  };

  const handleSplitPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit) return;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    setIsDraggingSplit(false);
  };
  const [displayMode, setDisplayMode] = useState<CsBoardMode>(boardMode);
  const [displayLayout, setDisplayLayout] = useState<CsBoardLayout>(boardLayout);
  const [leftMode, setLeftMode] = useState<CsBoardMode>(leftBoardMode);
  const [rightMode, setRightMode] = useState<CsBoardMode>(rightBoardMode);
  // Har bir PDF/daftar sahifasi o'z style paneliga ega, lekin fixed panel
  // faqat oxirgi bosilgan surface uchun ko'rsatiladi. Aks holda splitdagi
  // ikki pane yoki yonma-yon visible sahifalar bir xil panelni ustma-ust
  // render qiladi.
  const [activeStyleSurface, setActiveStyleSurface] = useState({ paneIndex: 0, page: currentPage });
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => {
    setActiveStyleSurface((current) => ({
      paneIndex: displayLayout === "split" ? current.paneIndex : 0,
      page: currentPage,
    }));
  }, [currentPage, displayLayout]);

  useEffect(() => {
    onActivePaneChange?.(activeStyleSurface.paneIndex === 1 ? "right" : "left");
  }, [activeStyleSurface.paneIndex, onActivePaneChange]);

  useEffect(() => {
    if (isHost || synced) {
      setDisplayMode(boardMode); setDisplayLayout(boardLayout);
      setLeftMode(leftBoardMode); setRightMode(rightBoardMode);
    }
  }, [boardMode, boardLayout, leftBoardMode, rightBoardMode, isHost, synced]);

  useEffect(() => {
    if (isHost || synced) setLocalSplitRatio(hostSplitRatio);
  }, [isHost, synced, hostSplitRatio]);

  useEffect(() => {
    if (isHost || displayLayout !== "split" || !synced || !rightHostScroll) return;
    const rightPane = paneScrollRefs.current.get(1);
    if (!rightPane) return;
    rightPane.scrollLeft = (rightHostScroll.xRatio ?? 0) * Math.max(0, rightPane.scrollWidth - rightPane.clientWidth);
  }, [displayLayout, synced, rightHostScroll, isHost]);

  useEffect(() => {
    if (isHost || !synced || !hostScroll || !scrollRef.current) return;
    const leftPane = scrollRef.current;
    leftPane.scrollLeft = (hostScroll.xRatio ?? 0) * Math.max(0, leftPane.scrollWidth - leftPane.clientWidth);
  }, [isHost, synced, hostScroll]);

  const { suppressScrollDetectRef, scrollToPage, scrollToPagePosition, handleScroll } = useClassroomScrollSync({
    isHost, synced, currentPage, hostScroll, scrollRef, pageElsRef, onPageChange, onScrollChange,
  });

  // O'ng panel uchun ham xuddi shu aniq page+yRatio modeli — avvalgi
  // umumiy scrollHeight foizi o'rniga. onPageChange berilmaydi (o'ng
  // panelning "joriy sahifasi" alohida kuzatilmaydi, faqat currentPage
  // ishlatiladi — chap panel bilan bir xil sahifa nomerlanishi taxmin qilinadi).
  const {
    suppressScrollDetectRef: rightSuppressScrollDetectRef,
    scrollToPagePosition: scrollToRightPagePosition, handleScroll: handleRightScroll,
  } = useClassroomScrollSync({
    isHost, synced, currentPage, hostScroll: rightHostScroll, scrollRef: rightScrollRef, pageElsRef: rightPageElsRef,
    onScrollChange: onPaneScrollChange ? (page, yRatio, xRatio) => onPaneScrollChange("right", page, yRatio, xRatio) : undefined,
  });

  const { zoom, freeToMove, applyZoom, resetZoomTo1, syncZoomToHost, setZoomNode } = useClassroomZoom({
    isHost, synced, hostZoom, onZoomChange, scrollRef, suppressScrollDetectRef,
  });

  // Split rejimdagi O'NG panel avval o'zining pinch/wheel-zoom listenerlariga
  // ega emas edi — rightZoom faqat +/- tugmalari orqali (anchor'siz)
  // o'zgarardi, shu sabab shu panelda trackpad-pinch umuman ishlamas edi.
  // Chap panel bilan bir xil useClassroomZoom instansiyasi (o'z scroll
  // ref'i, o'z DOM node state'i bilan) shu yerga ham ulanadi.
  const {
    zoom: rightZoom, applyZoom: applyRightZoom, setZoomNode: setRightZoomNode,
  } = useClassroomZoom({
    isHost, synced, hostZoom: rightHostZoom, onZoomChange: onPaneZoomChange ? (z) => onPaneZoomChange("right", z) : undefined,
    scrollRef: rightScrollRef, suppressScrollDetectRef: rightSuppressScrollDetectRef,
  });


  const registerEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(page, el);
    else pageElsRef.current.delete(page);
  }, []);

  const registerRightEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) rightPageElsRef.current.set(page, el);
    else rightPageElsRef.current.delete(page);
  }, []);

  const toggleSynced = useCallback(() => {
    setSynced((prev) => {
      const next = !prev;
      if (next) {
        setDisplayMode(boardMode); setDisplayLayout(boardLayout); setLeftMode(leftBoardMode); setRightMode(rightBoardMode);
        // Sinxron rejimga qaytilganda ustoz zoomiga va pozitsiyasiga tenglashadi
        syncZoomToHost();
        if (hostScroll) scrollToPagePosition(hostScroll.page, hostScroll.yRatio, true);
        else scrollToPage(currentPageRef.current, true);
        if (rightHostScroll) scrollToRightPagePosition(rightHostScroll.page, rightHostScroll.yRatio, true);
      } else {
        // Erkin rejimga o'tilganda 100% dan boshlanadi
        resetZoomTo1();
      }
      return next;
    });
  }, [boardMode, boardLayout, leftBoardMode, rightBoardMode, scrollToPage, scrollToPagePosition, hostScroll, rightHostScroll, scrollToRightPagePosition, syncZoomToHost, resetZoomTo1]);

  const changeDisplayMode = (mode: CsBoardMode) => {
    if (isHost) onBoardModeChange?.(mode);
    else if (!synced) setDisplayMode(mode);
  };

  const toggleSplit = () => {
    const next = displayLayout === "split" ? "single" : "split" as const;
    if (isHost) {
      if (next === "split") onBoardViewChange?.("split", "pdf", "notebook");
      else onBoardViewChange?.("single", leftMode, rightMode);
    } else if (!synced) {
      if (next === "split") { setLeftMode("pdf"); setRightMode("notebook"); }
      setDisplayLayout(next);
    }
  };

  const swapSplitPanes = () => {
    if (displayLayout !== "split") return;
    if (isHost) onBoardViewChange?.("split", rightMode, leftMode);
    else if (!synced) { setLeftMode(rightMode); setRightMode(leftMode); }
  };

  const visiblePageCount = (mode: CsBoardMode) => mode === "notebook" ? notebookPageCount : pageUrls.length;

  const toolbarRow = (toolbar || toolbarActions) && (
    <div
      className="absolute top-[5px] left-[5px] right-3 z-10 flex items-center justify-between gap-2 transition-transform duration-300 ease-in-out"
      style={{ transform: overlayVisible ? "translateY(0)" : "translateY(-150%)" }}
    >
      <div className="min-w-0 flex-1">{toolbar}</div>
      <div className="flex shrink-0 items-center gap-2">{toolbarActions}</div>
    </div>
  );

  // PDF ↔ Daftar ikkita variantdan iborat — segmented-pill switch: ikkala
  // yorliq yonma-yon ko'rinadi, faol variant indigo fon bilan ajratiladi
  // (iOS-uslubidagi sirpanuvchi doira emas).
  const modeMenuFor = (selectedMode: CsBoardMode, pane?: "left" | "right") => {
    // Ustoz uchun har doim ko'rinadi. O'quvchi uchun faqat statik
    // replay/snapshot ko'rinishida (noSync) — jonli darsda o'quvchi
    // ustoz belgilagan rejimga bog'liq (sinxron), lekin replay'da hech
    // qanday jonli host yo'q, shuning uchun o'zi PDF/Daftar orasida
    // erkin almashtira oladi. Faqat PDF sahifalari mavjud bo'lsagina
    // ko'rsatiladi — aks holda "PDF" tugmasi bosilganda ko'rsatadigan
    // hech narsa yo'q.
    if (!isHost && !(noSync && pageUrls.length > 0)) return null;
    const disabled = !isHost && synced;
    const isNotebook = selectedMode === "notebook";
    return (
      <div className={`inline-flex items-center gap-0.5 rounded-full bg-white/90 p-0.5 shadow-md backdrop-blur-sm ${disabled ? "opacity-60" : ""}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { if (!pane) changeDisplayMode("pdf"); }}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
            !isNotebook ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          PDF
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { if (!pane) changeDisplayMode("notebook"); }}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
            isNotebook ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          Daftar
        </button>
      </div>
    );
  };
  const rightZoomPanel = (
    <div className="flex items-center gap-0.5 rounded-full bg-white/90 px-1 py-0.5 shadow-md backdrop-blur-sm">
      <button
        type="button"
        className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={rightZoom <= MIN_ZOOM || (!isHost && synced)}
        onClick={() => applyRightZoom(rightZoom - ZOOM_STEP)}
        title="Kichraytirish"
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        className="min-w-9 px-1 text-center text-[11px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-30 tabular-nums"
        disabled={!freeToMove}
        onClick={() => applyRightZoom(1)}
        title="Asl o'lchamga qaytarish"
      >
        {Math.round(rightZoom * 100)}%
      </button>
      <button
        type="button"
        className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        disabled={rightZoom >= MAX_ZOOM || (!isHost && synced)}
        onClick={() => applyRightZoom(rightZoom + ZOOM_STEP)}
        title="Kattalashtirish"
      >
        <Plus size={13} />
      </button>
    </div>
  );
  const splitButton = (
    isHost && pageUrls.length > 0 ?
    <button type="button" onClick={toggleSplit} disabled={!isHost && synced} title="Ekranni ikkiga bo‘lish"
      className={`rounded-full p-1.5 shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${displayLayout === "split" ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-white/90 text-indigo-600 backdrop-blur-sm hover:bg-indigo-50"}`}>
      <Columns2 size={15} />
    </button> : null
  );
  const swapButton = displayLayout === "split" ? (
    <button type="button" onClick={swapSplitPanes} disabled={!isHost && synced} title="PDF va daftar joyini almashtirish"
      className="rounded-full bg-white/90 p-1.5 text-indigo-600 shadow-md backdrop-blur-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60">
      <Repeat2 size={15} />
    </button>
  ) : null;

  if (displayMode === "pdf" && pageUrls.length === 0) {
    return (
      <div className="relative flex-1 flex items-center justify-center bg-gray-100 rounded-2xl min-h-75">
        {toolbarRow}
        <p className="text-gray-400 text-sm">PDF hali yuklanmagan</p>
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5">{modeMenuFor(displayMode)}</div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-gray-100 rounded-2xl overflow-hidden">
      {toolbarRow}
            <div
              ref={(element) => {
          splitContainerRef.current = element;
          // Splitdan monolitga qaytganda scrollRef eski chap pane'da
          // qolmasin: sync hook monolitdagi asosiy viewportni kuzatishi kerak.
          if (displayLayout !== "split") {
            scrollRef.current = element;
            // setZoomNode — wheel/touch-pinch listenerlarni HAQIQIY DOM
            // node'ga ulash uchun kerak (scrollRef.current shunchaki
            // o'zgarishi useClassroomZoom ichidagi effektlarni qayta
            // ishga tushirmaydi, chunki ref obyekti hech qachon
            // almashmaydi).
            setZoomNode(element);
          }
        }}
        className={`w-full h-full overscroll-contain ${displayLayout === "split" ? "overflow-hidden" : "overflow-auto"}`}
        style={{
          // MUHIM: "pinch-zoom" QO'SHILMAYDI. Bu qiymat aynan brauzerga
          // ikki-barmoq gesture'ni NATIVE document-zoom sifatida bajarishga
          // ruxsat beradi — shu sabab avval mobil'da pinch qilinganda butun
          // sahifa (html/body) kattalashib ketardi. "pan-x pan-y" (pinch-zoom
          // so'zisiz) qoldirilsa, brauzer ikki-barmoqni "zoom" deb umuman
          // belgilamaydi va bizning onNativeTouchStart/Move handler (pastda)
          // preventDefault() orqali to'liq nazorat qiladi — natijada faqat
          // PDF ichida custom zoom ishlaydi, browser darajasida hech narsa
          // kattalashmaydi.
          touchAction: freeToMove ? "pan-x pan-y" : "none",
          overflow: displayLayout === "split" ? "hidden" : (freeToMove ? "auto" : "hidden"),
        }}
        onScroll={handleScroll}
      >
        <div
          className={`flex h-full min-h-0 ${displayLayout === "split" ? "flex-row items-start gap-0" : "flex-col gap-1 sm:gap-3"} py-[50px]`}
          style={{
            width: "100%", minWidth: "100%",
            // "items-center" bola (PDF/daftar paneli) zoom bilan konteynerdan
            // kengroq bo'lib qolganda klassik flexbox xatosiga olib kelardi:
            // align-items: center bola chap chetini scroll konteyner
            // tashqarisiga chiqarib yuboradi, lekin scrollLeft manfiy
            // bo'lolmagani uchun brauzer o'sha chetga scroll qilishga
            // ruxsat bermaydi ("to'liq chekkagacha scroll qilinmaydi").
            // "safe center" xuddi shu holatda avtomatik "start"ga
            // qaytadi — kontent kichkina bo'lsa markazlashtiradi, katta
            // bo'lsa esa to'liq scroll qilib bo'ladigan qilib qoladi.
            alignItems: displayLayout === "split" ? undefined : "safe center",
          }}
        >
          {(displayLayout === "split" ? [leftMode, rightMode] : [displayMode]).map((paneMode, paneIndex) => (
            <Fragment key={`${paneMode}-${paneIndex}`}>
            <div
              ref={(element) => {
                if (displayLayout === "split" && element) {
                  paneScrollRefs.current.set(paneIndex, element);
                  if (paneIndex === 0) {
                    scrollRef.current = element;
                    setZoomNode(element);
                  } else {
                    // O'ng panel — o'zining pinch/wheel-zoom listenerlari
                    // shu DOM node'ga ulanishi uchun kerak (yuqoridagi
                    // izohga qarang: scrollRef kabi useRef o'zgarishi
                    // effektlarni qayta ishga tushirmaydi).
                    setRightZoomNode(element);
                  }
                } else if (displayLayout === "split") paneScrollRefs.current.delete(paneIndex);
              }}
              onScroll={displayLayout === "split" ? (paneIndex === 0 ? handleScroll : handleRightScroll) : undefined}
              className={displayLayout === "split"
                ? `flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col gap-1 sm:gap-3 ${freeToMove ? "overflow-x-auto overflow-y-auto overscroll-contain" : "overflow-hidden"}`
                : "flex w-full flex-col gap-1 sm:gap-3"}
              style={displayLayout === "split"
                ? {
                    // Split panellar hostSplitRatio (yoki move rejimida
                    // localSplitRatio)ga mos ravishda kenglashadi/torayadi —
                    // grow/shrink 0 qilib, faqat flex-basis orqali aniq
                    // nisbatni belgilaymiz.
                    flex: `0 0 ${(paneIndex === 0 ? effectiveSplitRatio : 1 - effectiveSplitRatio) * 100}%`,
                    touchAction: freeToMove ? "pan-x pan-y" : "none",
                    // items-center bola (PDF/daftar paneli) zoomda
                    // konteynerdan kengroq bo'lib qolganda flexbox
                    // scrollLeft'ni manfiy qila olmaydi va chap chekkaga
                    // scroll qilib bo'lmay qolardi — "safe center" kontent
                    // kichkina bo'lsa markazlaydi, katta bo'lsa "start"ga
                    // qaytib to'liq scroll imkonini beradi.
                    alignItems: "safe center",
                  }
                : {
                    // Daftar ham PDF kabi konteyner kengligiga NISBATAN (%)
                    // o'lchanadi — REF_WIDTH'ga bog'langan mutlaq piksel
                    // (masalan 1000px) tor mobil ekranda 100% zoom'da ham
                    // viewport'dan katta bo'lib, gorizontal scroll chiqarib
                    // yuborardi. Grid/stroke o'lchami baribir REF_WIDTH
                    // asosida hisoblanadi (canvas render'da), shuning uchun
                    // teacher/student o'rtasida nisbiy ko'rinish bir xil qoladi.
                    // PDF_BASE_SCALE daftarga ham qo'llaniladi — aks holda
                    // 100% zoom'da daftar butun viewport kengligini butunlay
                    // egallab, PDF'dan farqli, "chekkasiz" ko'rinardi.
                    width: `${zoom * PDF_BASE_SCALE * 100}%`,
                    alignItems: "safe center",
                  }}
            >
              <div
                className="flex shrink-0 flex-col items-center gap-1 sm:gap-3"
                style={{
                  // Split rejimida daftar ham PDF kabi panel kengligiga
                  // NISBATAN (%) o'lchanadi — REF_WIDTH'ga bog'langan mutlaq
                  // piksel (masalan 1000px) yarim ekranga sig'may, 100%
                  // zoom'da ham gorizontal scroll chiqarib yuborardi.
                  width: displayLayout === "split"
                    ? `${(paneIndex === 1 ? rightZoom : zoom) * 100}%`
                    : "100%",
                  minWidth: displayLayout === "split"
                    ? `${(paneIndex === 1 ? rightZoom : zoom) * 100}%`
                    : "100%",
                }}
              >
              {Array.from({ length: visiblePageCount(paneMode) }, (_, idx) => {
                const pageNumber = idx + 1;
                return (
          <ClassroomPdfPage
                    key={`${paneIndex}-${pageNumber}`}
                    pageNumber={pageNumber}
                    zoomVersion={paneIndex === 1 ? rightZoom : zoom}
                    isHost={isHost}
                    canRemove={visiblePageCount(paneMode) > 1}
                    onRemovePage={(pageNumber) => onRemovePage?.(paneMode, pageNumber, paneIndex === 1 ? "right" : "left")}
                    onInsertPage={(pageNumber, style) => {
                      const pane = paneIndex === 1 ? "right" : "left";
                      if (style) onInsertNotebookPage?.(pageNumber, style, pane);
                      else onInsertPdfPage?.(pageNumber, pane);
                    }}
                    url={paneMode === "pdf" ? pageUrls[idx] : undefined}
                    notebook={paneMode === "notebook"}
                    notebookStyle={notebookPageStyles[pageNumber] ?? "grid"}
                    strokes={displayLayout === "split" && paneIndex === 1 ? (rightStrokesByPage[pageNumber] ?? []) : (strokesByPage[pageNumber] ?? [])}
                    pointer={pointer}
                    showPointer={pointer?.page === pageNumber && (pointer?.pane ?? "left") === (paneIndex === 1 ? "right" : "left")}
                    editable={editable}
                    tool={tool}
                    showStylePanel={activeStyleSurface.paneIndex === paneIndex && activeStyleSurface.page === pageNumber}
                    onActivate={() => setActiveStyleSurface({ paneIndex, page: pageNumber })}
                    onToolChange={onToolChange}
                    color={color}
                    onColorChange={onColorChange}
                    strokeWidth={strokeWidth}
                    onStrokeWidthChange={onStrokeWidthChange}
                    shapeStyle={shapeStyle}
                    onShapeStyleChange={onShapeStyleChange}
                    onUpdateShapeStroke={(page, stroke) => {
                      if (displayLayout === "split") onPaneUpdateShapeStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, stroke);
                      else onUpdateShapeStroke?.(page, stroke);
                    }}
                    onReorderStroke={(page, strokeIds, op) => {
                      if (displayLayout === "split") onPaneReorderStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, strokeIds, op);
                      else onReorderStroke?.(page, strokeIds, op);
                    }}
                    onStrokeComplete={(page, stroke) => {
                      if (displayLayout === "split" && paneIndex === 1) {
                        onPaneStrokeComplete?.("right", paneMode, page, stroke);
                      } else {
                        if (displayLayout === "split") onPaneStrokeComplete?.("left", paneMode, page, stroke);
                        else if (onPaneStrokeComplete) onPaneStrokeComplete("left", displayMode, page, stroke);
                        else onStrokeComplete?.(page, stroke);
                      }
                    }}
            onMoveStroke={(page, strokeId, x, y) => {
                      if (displayLayout === "split") onPaneMoveStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, strokeId, x, y);
                      else onMoveStroke?.(page, strokeId, x, y);
            }}
            onUpdateTextStroke={(page, stroke) => {
              if (boardLayout === "split") {
                onPaneUpdateTextStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, stroke);
              } else {
                onUpdateTextStroke?.(page, stroke);
              }
            }}
                    onPointerMove={(page, x, y, active) => onPointerMove?.(page, x, y, active, paneIndex === 1 ? "right" : "left")}
                    onEraseStroke={(page, strokeId) => {
                      if (displayLayout === "split") onPaneEraseStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, strokeId);
                      else onEraseStroke?.(page, strokeId);
                    }}
                    onSplitStroke={(page, strokeId, replacements) => {
                      if (displayLayout === "split") onPaneSplitStroke?.(paneIndex === 1 ? "right" : "left", paneMode, page, strokeId, replacements);
                      else onSplitStroke?.(page, strokeId, replacements);
                    }}
                    registerEl={displayLayout === "split" && paneIndex === 1 ? registerRightEl : registerEl}
                  />
                );
              })}
              <div className="shrink-0 h-[50px]" aria-hidden />
              </div>
            </div>
            {displayLayout === "split" && paneIndex === 0 && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Split panellarni o'lchamini o'zgartirish"
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                onPointerCancel={handleSplitPointerUp}
                className={`h-full shrink-0 w-1.5 bg-gray-200/70 ${canDragSplit ? "cursor-col-resize" : "cursor-default"}`}
              />
            )}
            </Fragment>
          ))}
        </div>
      </div>

      {(() => {
        const zoomPanel = (
          <div className="flex items-center gap-0.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md px-1 py-0.5">
            <button
              type="button"
              onClick={() => applyZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM || !freeToMove}
              className="p-1 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Kichraytirish"
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              onClick={() => applyZoom(1)}
              disabled={!freeToMove}
              className="px-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 min-w-9 text-center disabled:opacity-30 tabular-nums"
              title="Asl o'lchamga qaytarish"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => applyZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM || !freeToMove}
              className="p-1 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Kattalashtirish"
            >
              <Plus size={13} />
            </button>
            {zoom !== 1 && (
              <button
                type="button"
                onClick={() => applyZoom(1)}
                disabled={!freeToMove}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                title="Reset"
              >
                <ResetZoom size={12} />
              </button>
            )}
          </div>
        );

        const pageInfoPanel = (
          <div className="rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 shadow-md backdrop-blur-sm tabular-nums">
            {currentPage} / {visiblePageCount(displayLayout === "split" ? leftMode : displayMode)}
          </div>
        );

        const moveButton = !isHost && !noSync && (
          <button
            type="button"
            onClick={toggleSynced}
            title={synced ? "Erkin harakatlanish (ustozdan mustaqil)" : "Ustoz bilan sinxronlash"}
            className={`rounded-xl p-1.5 shadow-md transition-colors ${
              synced ? "bg-white text-gray-400 hover:bg-gray-50" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            <Move size={14} />
          </button>
        );

        // Ustoz uchun: page-info+zoom/daftar switch bottom-left/right'da.
        // O'quvchi uchun: page-info+zoom top-left'ga (toolbar qatoridan
        // pastroq), move esa bottom-left'da alohida qoladi.
        if (isHost) {
          return (
            <>
              {displayLayout === "split" ? (
                <>
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">{moveButton}{pageInfoPanel}{zoomPanel}{splitButton}{swapButton}</div>
                  <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">{rightZoomPanel}</div>
                </>
              ) : (
                <>
                  <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">{moveButton}{pageInfoPanel}{zoomPanel}{splitButton}</div>
                  <div className="absolute bottom-3 right-3 z-20">{modeMenuFor(displayMode)}</div>
                </>
              )}
            </>
          );
        }

        return (
          <>
            <div
              className="absolute top-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
              style={{ transform: overlayVisible ? "translateY(0)" : "translateY(-150%)" }}
            >
              {moveButton}
              {pageInfoPanel}
              {displayLayout !== "split" && <span className="sm:hidden">{zoomPanel}</span>}
            </div>
            {displayLayout === "split" ? (
              <>
                <div
                  className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
                >{zoomPanel}{splitButton}{swapButton}</div>
                <div
                  className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
                >
                  {rightZoomPanel}
                </div>
              </>
            ) : (
              <>
                <div
                  className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
                  style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
                >
                  <span className="hidden sm:flex sm:items-center sm:gap-1.5">{zoomPanel}</span>
                  {splitButton}
                </div>
                <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 transition-transform duration-300 ease-in-out" style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}>
                  {modeMenuFor(displayMode)}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
