import { useLayoutEffect } from "react";
import type { CsPointer, CsStroke, CsTool } from "../../api/classroom";
import type { ShapeStyle } from "./classroomCanvasText";
import { drawStroke } from "./classroomCanvasDraw";
import { resolveConnector } from "./classroomShapeBindings";
import { eraseHitRadius } from "./classroomCanvasGeometry";

const MAX_DPR = 3.5;
const MAX_CANVAS_PX = 8192;

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
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const bitmapW = Math.round(size.w * dpr);
    const bitmapH = Math.round(size.h * dpr);
    const scale = Math.min(1, MAX_CANVAS_PX / Math.max(bitmapW, bitmapH));
    canvas.width = Math.round(bitmapW * scale);
    canvas.height = Math.round(bitmapH * scale);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const drawScale = dpr * scale;
    ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    for (const s of strokes) {
      const rendered = resolveConnector(s, strokes, size.w, size.h);
      const isEditing = s.id === editingTextId && Boolean(textEditor);
      const strokeToDraw =
        isEditing && textEditor
          ? {
              ...rendered,
              text: textEditor.text,
              color: textEditor.color,
              fontFamily: textEditor.fontFamily,
              fontSize: textEditor.fontSize,
              fontWeight: textEditor.fontWeight,
              textAlign: textEditor.textAlign,
              verticalAlign: textEditor.verticalAlign,
              ...(s.tool === "text"
                ? {
                    points: [textEditor.x, textEditor.y],
                    textBoxWidth: textEditor.textBoxWidth,
                    textBoxHeight: textEditor.textBoxHeight,
                  }
                : {}),
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
          verticalAlign: textEditor.verticalAlign,
          textBoxWidth: textEditor.textBoxWidth,
          textBoxHeight: textEditor.textBoxHeight,
        },
        size.w,
        size.h,
      );
    }

    if (
      draftRef.current &&
      draftRef.current.length >= 2 &&
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
          points: draftRef.current,
          ...(tool === "pen" && draftPressuresRef.current
            ? { pressures: draftPressuresRef.current }
            : {}),
          ...(isShape ? { ...shapeStyle } : {}),
        },
        size.w,
        size.h,
      );
    }

    if (connectorDraftRef.current) {
      drawStroke(
        ctx,
        {
          id: "__connector_draft__",
          tool: "arrow",
          color,
          points: connectorDraftRef.current.points,
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

    if (lassoDraftRef.current && lassoDraftRef.current.length >= 4) {
      const path = lassoDraftRef.current;
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
      eraserCursorRef.current
    ) {
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
    if (draftRef.current && (tool as string) === "laser") {
      hasActiveLaser = true;
    }

    if (hasActiveLaser) {
      requestAnimationFrame(() => {
        forceRedraw((n) => n + 1);
      });
    }
  });
}
