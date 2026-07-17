import { useCallback, useEffect, useRef, useState } from "react";
import type { CsPointer, CsStroke, CsTool } from "../../api/classroom";

// Chizish uchun reference kenglik — stroke.width shu kenglikdagi px deb saqlanadi
const REF_WIDTH = 1000;
const MAX_DPR = 2;

export type DrawTool = CsTool | "laser";

interface Props {
  pageUrl: string | null;
  strokes: CsStroke[];
  pointer: CsPointer | null;
  editable: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onStrokeComplete?: (stroke: CsStroke) => void;
  onPointerMove?: (x: number, y: number, active: boolean) => void;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number) {
  if (s.points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(1, s.width * (w / REF_WIDTH)) * (s.tool === "highlighter" ? 3 : 1);
  ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
  ctx.beginPath();
  ctx.moveTo(s.points[0] * w, s.points[1] * h);
  if (s.points.length === 2) {
    // Bitta nuqta — kichik chiziqcha sifatida
    ctx.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
  }
  for (let i = 2; i < s.points.length; i += 2) {
    ctx.lineTo(s.points[i] * w, s.points[i + 1] * h);
  }
  ctx.stroke();
  ctx.restore();
}

export function ClassroomPdfViewer({
  pageUrl, strokes, pointer, editable, tool, color, strokeWidth,
  onStrokeComplete, onPointerMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const draftRef = useRef<number[] | null>(null);
  const [, forceRedraw] = useState(0);

  const syncSize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(img);
    return () => ro.disconnect();
  }, [syncSize, pageUrl]);

  // Qayta chizish
  useEffect(() => {
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
    for (const s of strokes) drawStroke(ctx, s, size.w, size.h);
    if (draftRef.current && draftRef.current.length >= 2) {
      drawStroke(ctx, { id: "__draft__", tool: tool === "laser" ? "pen" : tool, color, width: strokeWidth, points: draftRef.current }, size.w, size.h);
    }
    if (pointer && pointer.active) {
      ctx.save();
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "rgba(239,68,68,0.6)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pointer.x * size.w, pointer.y * size.h, 6, 0, Math.PI * 2);
      ctx.fill();
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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "laser") {
      onPointerMove?.(p[0], p[1], true);
      return;
    }
    draftRef.current = [...p];
    forceRedraw((n) => n + 1);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    if (tool === "laser") {
      if (e.buttons > 0) onPointerMove?.(p[0], p[1], true);
      return;
    }
    const draft = draftRef.current;
    if (!draft) return;
    const lastX = draft[draft.length - 2];
    const lastY = draft[draft.length - 1];
    // Juda zich nuqtalarni tashlab ketamiz
    if (Math.abs(p[0] - lastX) + Math.abs(p[1] - lastY) < 0.002) return;
    draft.push(p[0], p[1]);
    onPointerMove?.(p[0], p[1], true);
    forceRedraw((n) => n + 1);
  };

  const finishStroke = () => {
    if (!editable) return;
    if (tool === "laser") {
      onPointerMove?.(0, 0, false);
      return;
    }
    const draft = draftRef.current;
    draftRef.current = null;
    onPointerMove?.(0, 0, false);
    if (draft && draft.length >= 2) {
      onStrokeComplete?.({
        id: crypto.randomUUID(),
        tool: tool as CsTool,
        color,
        width: strokeWidth,
        points: draft,
      });
    }
    forceRedraw((n) => n + 1);
  };

  if (!pageUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-2xl min-h-75">
        <p className="text-gray-400 text-sm">PDF hali yuklanmagan</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full flex justify-center bg-gray-100 rounded-2xl overflow-hidden">
      <div className="relative max-w-full">
        <img
          ref={imgRef}
          src={pageUrl}
          alt="Dars sahifasi"
          className="max-w-full h-auto select-none block"
          draggable={false}
          onLoad={syncSize}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          style={{
            touchAction: editable ? "none" : "auto",
            cursor: editable ? "crosshair" : "default",
            pointerEvents: editable ? "auto" : "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
      </div>
    </div>
  );
}
