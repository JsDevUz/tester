import { useLayoutEffect, useRef } from "react";
import type { CsPointer, CsStroke, CsTool } from "../../api/classroom";
import type { ShapeStyle } from "./classroomCanvasText";
import { drawStroke } from "./classroomCanvasDraw";
import { resolveConnector } from "./classroomShapeBindings";
import { eraseHitRadius } from "./classroomCanvasGeometry";

const MAX_DPR = 3.5;
const MAX_CANVAS_PX = 8192;

/**
 * The board minus its lasers, painted once and reused while lasers animate.
 *
 * Laser marks fade over three seconds, and the renderer redraws every frame for as long as one
 * is alive. Repainting the entire board 60 times a second is expensive -- every stroke goes
 * back through perfect-freehand -- and it happens on every viewer at once, so one teacher
 * waving a laser stutters the whole class. Caching the settled layer means those frames only
 * pay for the lasers.
 */
let settledLayer: { canvas: HTMLCanvasElement; signature: string } | null = null;

/** Invalidates the cache; exported for tests and for surface teardown. */
export function resetSettledLayerCache(): void {
  settledLayer = null;
}

interface RenderClassroomCanvasParams {
  canvas: HTMLCanvasElement;
  size: { w: number; h: number };
  strokes: CsStroke[];
  editingTextId: string | null;
  textEditor: any;
  hoveredStrokeId: string | null;
  strokeWidth: number;
  draftPoints: number[] | null;
  draftPressures: number[] | null;
  tool: string;
  color: string;
  shapeStyle: ShapeStyle;
  connectorDraftPoints: number[] | null;
  showPointer: boolean;
  pointer: CsPointer | null;
  lassoDraftPoints: number[] | null;
  eraserCursor: [number, number] | null;
}

// Canvas'ni bevosita ctx orqali chizadigan sof funksiya — React render
// tsiklidan MUSTAQIL chaqirilishi mumkin. Drag paytida (pointermove, ~60-
// 120fps) har freymda butun React komponent daraxtini qayta render qilish
// (forceRedraw orqali) reconciliation xarajati tufayli sekinlashib, "qaltirash"
// (dropped frame) hissini beradi — buning o'rniga pointerMove handler shu
// funksiyani TO'G'RIDAN-TO'G'RI chaqiradi (bir marta chaqirilgan
// requestAnimationFrame callback ichida), canvas darhol, React render'ni
// kutmasdan yangilanadi. useLayoutEffect esa boshqa barcha holatlarda
// (stroke qo'shilishi, o'chirilishi, style o'zgarishi va h.k.) canvas'ni
// odatdagidek qayta chizadi.
export function renderClassroomCanvas({
  canvas,
  size,
  strokes,
  editingTextId,
  textEditor,
  hoveredStrokeId,
  strokeWidth,
  draftPoints,
  draftPressures,
  tool,
  color,
  shapeStyle,
  connectorDraftPoints,
  showPointer,
  pointer,
  lassoDraftPoints,
  eraserCursor,
}: RenderClassroomCanvasParams): boolean {
  if (size.w === 0) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const bitmapW = Math.round(size.w * dpr);
  const bitmapH = Math.round(size.h * dpr);
  const scale = Math.min(1, MAX_CANVAS_PX / Math.max(bitmapW, bitmapH));
  const nextWidth = Math.round(bitmapW * scale);
  const nextHeight = Math.round(bitmapH * scale);
  // Assigning width/height reallocates the whole backing bitmap, even when the value is
  // unchanged -- doing it on every frame is what made drawing stutter. Only resize when the
  // dimensions actually differ; clearRect below handles the per-frame wipe.
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const drawScale = dpr * scale;
  ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);

  // Lasers are the only strokes that animate. When one is alive the settled layer beneath is
  // identical frame to frame, so it is painted once into an offscreen canvas and blitted from
  // there; only the lasers are re-tessellated per frame.
  const hasLaserStroke = strokes.some((stroke) => stroke.tool === 'laser');
  const settledStrokes = hasLaserStroke
    ? strokes.filter((stroke) => stroke.tool !== 'laser')
    : strokes;

  // Anything that changes the settled layer's appearance has to appear here, or a stale
  // bitmap keeps being shown. Stroke ids cover additions, removals and reordering; the
  // editor fields cover edits made in place to a stroke that keeps its id.
  const layerSignature = hasLaserStroke
    ? [
        Math.round(size.w),
        Math.round(size.h),
        drawScale.toFixed(3),
        settledStrokes.map((stroke) => `${stroke.id}:${stroke.points.length}`).join(','),
        editingTextId ?? '',
        hoveredStrokeId ?? '',
        textEditor ? JSON.stringify(textEditor) : '',
      ].join('|')
    : null;

  const cachedLayer =
    layerSignature && settledLayer?.signature === layerSignature ? settledLayer.canvas : null;

  if (cachedLayer) {
    ctx.drawImage(cachedLayer, 0, 0, size.w, size.h);
  }

  const strokesToPaint = cachedLayer
    ? strokes.filter((stroke) => stroke.tool === 'laser')
    : settledStrokes;

  for (const s of strokesToPaint) {
    const rendered = resolveConnector(s, strokes, size.w, size.h);
    const isEditing = s.id === editingTextId && Boolean(textEditor);
    const strokeToDraw =
      isEditing && textEditor
        ? {
            ...rendered,
            text: textEditor.text,
            fontFamily: textEditor.fontFamily,
            fontSize: textEditor.fontSize,
            fontWeight: textEditor.fontWeight,
            textAlign: textEditor.textAlign,
            // Oddiy matn (tool:"text") tahrirlanayotganda har doim "top"dan
            // chiziladi — box bosilgan nuqtadan pastga o'sadi, nuqtaning
            // o'zi qo'zg'almaydi. middle/bottom qo'llansa, box balandligi
            // matn kontentiga qarab o'sganda matn MARKAZI bosilgan nuqtada
            // qolib, nuqtaning o'zi vizual ravishda "suriladi" (ClassroomPage
            // TextEditor'dagi <textarea> ham xuddi shu sababdan tahrirlash
            // paytida har doim top-align). Shape ichidagi matn buning
            // aksi — box statik (foydalanuvchi belgilagan), shuning uchun
            // haqiqiy verticalAlign xavfsiz.
            verticalAlign:
              s.tool === "text"
                ? "top"
                : (textEditor.verticalAlign ?? rendered.verticalAlign ?? "middle"),
            // "text" strokelarda color matnning o'zi rangi, shuning uchun
            // to'g'ridan-to'g'ri yangilanadi. rectangle/ellipse'da color
            // shape BORDER'i — matn rangi alohida textColor maydonida
            // saqlanadi (commitText'dagi kabi), aks holda tahrirlash
            // paytida matn rangini o'zgartirish shape border'ini ham
            // o'sha rangga bo'yab qo'yadi.
            ...(s.tool === "text"
              ? {
                  color: textEditor.color,
                  points: [textEditor.x, textEditor.y],
                  textBoxWidth: textEditor.textBoxWidth,
                  textBoxHeight: textEditor.textBoxHeight,
                }
              : { textColor: textEditor.color }),
          }
        : rendered;
    drawStroke(
      ctx,
      strokeToDraw,
      size.w,
      size.h,
      !isEditing && s.id === hoveredStrokeId,
    );
  }

  // Capture the settled layer the first time a laser appears, before drafts and cursors are
  // drawn over it -- those change every frame and must not be baked in.
  if (layerSignature && !cachedLayer) {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offscreenCtx = offscreen.getContext('2d');
    if (offscreenCtx) {
      offscreenCtx.drawImage(canvas, 0, 0);
      settledLayer = { canvas: offscreen, signature: layerSignature };
    }

    // The lasers were held back so they would not be baked into the cache; draw them now.
    for (const laser of strokes) {
      if (laser.tool !== 'laser') continue;
      drawStroke(ctx, resolveConnector(laser, strokes, size.w, size.h), size.w, size.h, false);
    }
  } else if (!hasLaserStroke) {
    // No laser on screen means no animation loop, so holding a bitmap only wastes memory.
    settledLayer = null;
  }

  if (textEditor && !editingTextId && textEditor.text) {
    drawStroke(
      ctx,
      {
        id: "__text_editor_draft__",
        tool: "text",
        color: textEditor.color,
        width: strokeWidth,
        points: [textEditor.x, textEditor.y],
        text: textEditor.text,
        fontFamily: textEditor.fontFamily,
        fontSize: textEditor.fontSize,
        fontWeight: textEditor.fontWeight,
        textAlign: textEditor.textAlign,
        // Yozilayotgan yangi matn ham tahrirlash paytida har doim top-align
        // — sabab yuqoridagi isEditing blokidagi izohda.
        verticalAlign: "top",
        textBoxWidth: textEditor.textBoxWidth,
        textBoxHeight: textEditor.textBoxHeight,
      },
      size.w,
      size.h,
    );
  }

  if (
    draftPoints &&
    draftPoints.length >= 2 &&
    tool !== "eraser-pixel" &&
    tool !== "eraser-stroke" &&
    tool !== "select" &&
    tool !== "text" &&
    tool !== "lasso"
  ) {
    const isShape = tool === "rectangle" || tool === "ellipse";
    drawStroke(
      ctx,
      {
        id: "__draft__",
        tool: tool as CsTool,
        color,
        width: strokeWidth,
        points: draftPoints,
        ...(tool === "pen" && draftPressures
          ? { pressures: draftPressures }
          : {}),
        ...(isShape ? { ...shapeStyle } : {}),
      },
      size.w,
      size.h,
    );
  }

  if (connectorDraftPoints) {
    drawStroke(
      ctx,
      {
        id: "__connector_draft__",
        tool: "arrow",
        color,
        points: connectorDraftPoints,
        ...shapeStyle,
        width: 2,
        lineShape: "curved",
        startArrowHead: "none",
        endArrowHead: "arrow",
      },
      size.w,
      size.h,
    );
  }

  if (showPointer && pointer && pointer.active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pointer.x * size.w, pointer.y * size.h, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59,130,246,0.3)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(59,130,246,0.7)";
    ctx.stroke();
    ctx.restore();
  }

  if (lassoDraftPoints && lassoDraftPoints.length >= 4) {
    const path = lassoDraftPoints;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(path[0] * size.w, path[1] * size.h);
    for (let i = 2; i < path.length; i += 2)
      ctx.lineTo(path[i] * size.w, path[i + 1] * size.h);
    ctx.closePath();
    ctx.strokeStyle = "rgba(99,102,241,0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.fillStyle = "rgba(99,102,241,0.08)";
    ctx.fill();
    ctx.restore();
  }

  if (
    (tool === "eraser-pixel" || tool === "eraser-stroke") &&
    eraserCursor
  ) {
    const [cx, cy] = eraserCursor;
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

  let hasActiveLaser = false;
  const now = Date.now();
  for (const s of strokes) {
    if (s.tool === "laser") {
      const startTime = s.createdAt || now;
      if (now - startTime < 3000) {
        hasActiveLaser = true;
        break;
      }
    }
  }
  if (draftPoints && (tool as string) === "laser") {
    hasActiveLaser = true;
  }

  return hasActiveLaser;
}

interface UseClassroomCanvasRendererParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  size: { w: number; h: number };
  strokes: CsStroke[];
  editingTextId: string | null;
  textEditor: any;
  hoveredStrokeId: string | null;
  strokeWidth: number;
  draftRef: React.RefObject<number[] | null>;
  draftPressuresRef: React.RefObject<number[] | null>;
  tool: string;
  color: string;
  shapeStyle: ShapeStyle;
  connectorDraftRef: React.RefObject<{ points: number[] } | null>;
  showPointer: boolean;
  pointer: CsPointer | null;
  lassoDraftRef: React.RefObject<number[] | null>;
  eraserCursorRef: React.RefObject<[number, number] | null>;
  forceRedraw: React.Dispatch<React.SetStateAction<number>>;
}

export function useClassroomCanvasRenderer({
  canvasRef,
  size,
  strokes,
  editingTextId,
  textEditor,
  hoveredStrokeId,
  strokeWidth,
  draftRef,
  draftPressuresRef,
  tool,
  color,
  shapeStyle,
  connectorDraftRef,
  showPointer,
  pointer,
  lassoDraftRef,
  eraserCursorRef,
  forceRedraw,
}: UseClassroomCanvasRendererParams) {
  // pointerMove handlerlar renderClassroomCanvas()ni to'g'ridan-to'g'ri
  // chaqirganda ham eng so'nggi parametrlarni ko'rishi uchun — closure'da
  // eskirgan qiymat qolib ketmasligi kerak.
  const latestParamsRef = useRef<Omit<RenderClassroomCanvasParams, "canvas"> | undefined>(undefined);
  latestParamsRef.current = {
    size,
    strokes,
    editingTextId,
    textEditor,
    hoveredStrokeId,
    strokeWidth,
    draftPoints: draftRef.current,
    draftPressures: draftPressuresRef.current,
    tool,
    color,
    shapeStyle,
    connectorDraftPoints: connectorDraftRef.current?.points ?? null,
    showPointer,
    pointer,
    lassoDraftPoints: lassoDraftRef.current,
    eraserCursor: eraserCursorRef.current,
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !latestParamsRef.current) return;
    const hasActiveLaser = renderClassroomCanvas({
      canvas,
      ...latestParamsRef.current,
    });
    if (hasActiveLaser) {
      requestAnimationFrame(() => {
        forceRedraw((n) => n + 1);
      });
    }
  });
}
