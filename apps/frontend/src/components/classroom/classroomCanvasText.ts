// ClassroomPdfViewer uchun umumiy canvas primitivlari: shakl uslubi,
// matn o'lchash va o'rash. Bu modul sof (React'ga bog'liq emas) —
// chizish (classroomCanvasDraw) va geometriya (classroomCanvasGeometry)
// modullari ham, komponentning o'zi ham shu yerdan foydalanadi.
import type {
  CsEdges,
  CsFillStyle,
  CsFontFamily,
  CsStrokeStyle,
} from "../../api/classroom";

// Chizish uchun reference kenglik — stroke.width shu kenglikdagi px deb saqlanadi
export const REF_WIDTH = 1000;

export interface ShapeStyle {
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeStyle: CsStrokeStyle;
  edges: CsEdges;
  opacity: number;
  lineShape?: "straight" | "curved" | "elbow";
  startArrowHead?: string;
  endArrowHead?: string;
}

// endArrowHead/startArrowHead ataylab berilmagan: ular asbobga qarab
// (arrow → "arrow", line → "none") stroke saqlanayotganda to'ldiriladi.
// Bu yerda "arrow" deb qat'iy belgilansa, "line" asbobi ham shu qiymatni
// meros qilib olib, to'g'ri chiziq o'q bo'lib chizilardi.
export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeStyle: "solid",
  edges: "round",
  opacity: 100,
  lineShape: "straight",
};

let measureCtx: CanvasRenderingContext2D | null = null;
export function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx)
    measureCtx = document.createElement("canvas").getContext("2d")!;
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
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
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
export function getFontFamilyString(family?: CsFontFamily): string {
  switch (family) {
    case "Comic Sans MS":
      return '"Comic Neue", "Comic Sans MS", cursive, sans-serif';
    case "Nunito":
      return '"Nunito", sans-serif';
    case "Georgia":
      return '"Georgia", serif';
    case "Arial":
      return '"Arial", sans-serif';
    default:
      return '"Inter", sans-serif';
  }
}

/** Gap kept between a shape's edge and the text inside it. */
export const SHAPE_TEXT_PADDING = 8;

/** Smallest the text is allowed to shrink to before it simply overflows. */
const MIN_SHAPE_FONT_SIZE = 8;

/**
 * Works out how a shape and the text inside it should accommodate each other.
 *
 * The order matters, and it is what a person expects while typing: the text wraps to the
 * shape's width first, the shape grows taller to take the extra lines, and only when it is
 * against its own maximum does the font start shrinking. The font never grows -- widening a
 * shape gives the text more room, not bigger letters.
 *
 * Returns the font size to render at and the height the shape needs. Width is never changed:
 * the user set it by dragging, and wrapping is what adapts to it.
 */
export function fitTextInShape(params: {
  text: string;
  fontFamily: CsFontFamily;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  shapeWidth: number;
  shapeHeight: number;
  /** Cap on automatic growth; past this the font shrinks instead. */
  maxShapeHeight?: number;
}): { fontSize: number; shapeHeight: number } {
  const { text, fontFamily, fontWeight, shapeWidth, shapeHeight } = params;
  const innerWidth = Math.max(1, shapeWidth - SHAPE_TEXT_PADDING * 2);
  const maxHeight = params.maxShapeHeight ?? shapeHeight * 3;

  if (!text.trim()) return { fontSize: params.fontSize, shapeHeight };

  const ctx = getMeasureCtx();
  const measureAt = (size: number) => {
    ctx.font = `${fontWeight} ${size}px ${getFontFamilyString(fontFamily)}`;
    const lines = wrapTextLines(ctx, text, innerWidth);
    return lines.length * size * 1.25 + SHAPE_TEXT_PADDING * 2;
  };

  // Step 1: at the requested size, does the shape just need to be taller?
  const neededAtCurrentSize = measureAt(params.fontSize);
  if (neededAtCurrentSize <= maxHeight) {
    return {
      fontSize: params.fontSize,
      shapeHeight: Math.max(shapeHeight, Math.ceil(neededAtCurrentSize)),
    };
  }

  // Step 2: the shape has grown as far as it may, so shrink the text to fit that height.
  let size = params.fontSize;
  while (size > MIN_SHAPE_FONT_SIZE && measureAt(size) > maxHeight) size -= 1;

  return { fontSize: Math.max(MIN_SHAPE_FONT_SIZE, size), shapeHeight: Math.ceil(maxHeight) };
}

export function measureTextBox(
  text: string,
  fontFamily: CsFontFamily,
  fontSize: number,
  fontWeight: 400 | 500 | 600 | 700,
  maxWrapWidth?: number,
): { width: number; height: number } {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSize}px ${getFontFamilyString(fontFamily)}`;
  const lines = maxWrapWidth
    ? wrapTextLines(ctx, text, maxWrapWidth)
    : text.split("\n");
  let max = 0;
  for (const line of lines) max = Math.max(max, ctx.measureText(line).width);
  const lineHeight = fontSize * 1.25;
  return {
    width: Math.max(20, Math.ceil(max)),
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

