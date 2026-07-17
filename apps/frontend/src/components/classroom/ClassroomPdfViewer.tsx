import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw as ResetZoom, ArrowDownToLine } from "lucide-react";
import type { CsPointer, CsStroke, CsTool } from "../../api/classroom";

// Chizish uchun reference kenglik — stroke.width shu kenglikdagi px deb saqlanadi
const REF_WIDTH = 1000;
const MAX_DPR = 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export type DrawTool = CsTool | "laser";

interface Props {
  // Ustoz hozirgacha ochgan barcha sahifalar (1-indexed ko'rinishda tartiblangan)
  pageUrls: string[];
  // 1-indexed — ustozning joriy sahifasi. Kuzatish yoqilganda shu yerga scroll qilinadi.
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  pointer: CsPointer | null;
  editable: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onStrokeComplete?: (page: number, stroke: CsStroke) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
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
    ctx.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
  }
  for (let i = 2; i < s.points.length; i += 2) {
    ctx.lineTo(s.points[i] * w, s.points[i + 1] * h);
  }
  ctx.stroke();
  ctx.restore();
}

interface PageProps {
  pageNumber: number;
  url: string;
  strokes: CsStroke[];
  pointer: CsPointer | null;
  showPointer: boolean;
  editable: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onStrokeComplete?: (page: number, stroke: CsStroke) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
  registerEl: (page: number, el: HTMLDivElement | null) => void;
}

// Bitta sahifa: rasm + chizish canvas. Ko'rinish oynasiga yaqinlashguncha
// <img src> qo'yilmaydi (lazy) — ko'p sahifali darsda hammasi birdan
// yuklanib xotira/tarmoqni og'irlashtirmasin.
function ClassroomPdfPage({
  pageNumber, url, strokes, pointer, showPointer, editable, tool, color, strokeWidth,
  onStrokeComplete, onPointerMove, registerEl,
}: PageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const draftRef = useRef<number[] | null>(null);
  const [, forceRedraw] = useState(0);

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
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(img);
    return () => ro.disconnect();
  }, [syncSize, visible]);

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
    if (showPointer && pointer && pointer.active) {
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
    onPointerMove?.(pageNumber, p[0], p[1], true);
    if (tool === "laser") return;
    draftRef.current = [...p];
    forceRedraw((n) => n + 1);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    onPointerMove?.(pageNumber, p[0], p[1], true);
    if (tool === "laser") return;
    const draft = draftRef.current;
    if (!draft) return;
    const lastX = draft[draft.length - 2];
    const lastY = draft[draft.length - 1];
    if (Math.abs(p[0] - lastX) + Math.abs(p[1] - lastY) < 0.002) return;
    draft.push(p[0], p[1]);
    forceRedraw((n) => n + 1);
  };

  const finishStroke = () => {
    if (!editable) return;
    onPointerMove?.(pageNumber, 0, 0, false);
    if (tool === "laser") return;
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft && draft.length >= 2) {
      onStrokeComplete?.(pageNumber, {
        id: crypto.randomUUID(), tool: tool as CsTool, color, width: strokeWidth, points: draft,
      });
    }
    forceRedraw((n) => n + 1);
  };

  return (
    <div ref={wrapRef} data-page={pageNumber} className="relative shrink-0 w-full flex justify-center">
      {visible ? (
        <div className="relative">
          <img
            ref={imgRef}
            src={url}
            alt={`Sahifa ${pageNumber}`}
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
      ) : (
        <div className="w-full aspect-3/4 max-w-3xl bg-gray-200 animate-pulse rounded-xl" />
      )}
    </div>
  );
}

export function ClassroomPdfViewer({
  pageUrls, currentPage, strokesByPage, pointer, editable, tool, color, strokeWidth,
  onStrokeComplete, onPointerMove,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const [zoom, setZoom] = useState(1);
  // Foydalanuvchi qo'lda scroll qilsa o'chadi; ustoz sahifasiga qaytarish
  // tugmasi bosilsa yoki ustoz o'zi yangi sahifaga o'tsa qayta yoqiladi.
  const [following, setFollowing] = useState(true);
  const suppressScrollDetectRef = useRef(false);

  const registerEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(page, el);
    else pageElsRef.current.delete(page);
  }, []);

  const scrollToPage = useCallback((page: number, smooth: boolean) => {
    const el = pageElsRef.current.get(page);
    const scrollEl = scrollRef.current;
    if (!el || !scrollEl) return;
    suppressScrollDetectRef.current = true;
    const top = el.offsetTop - scrollEl.offsetTop;
    scrollEl.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
    window.setTimeout(() => { suppressScrollDetectRef.current = false; }, smooth ? 500 : 50);
  }, []);

  // Ustoz sahifa o'zgartirganda — kuzatish yoqiq bo'lsa avtomatik scroll
  useLayoutEffect(() => {
    if (!following) return;
    scrollToPage(currentPage, true);
  }, [currentPage, following, scrollToPage]);

  // Foydalanuvchi qo'lda scroll qilsa kuzatishni o'chiramiz — avtomatik
  // scroll paytida esa suppressScrollDetectRef bloklaydi.
  const handleScroll = useCallback(() => {
    if (suppressScrollDetectRef.current) return;
    setFollowing(false);
  }, []);

  const resumeFollowing = useCallback(() => {
    setFollowing(true);
    scrollToPage(currentPage, true);
  }, [currentPage, scrollToPage]);

  const applyZoom = useCallback((next: number) => setZoom(clampZoom(next)), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    applyZoom(zoom - e.deltaY * 0.01);
  }, [zoom, applyZoom]);

  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchStartRef.current = { distance, zoom };
  }, [zoom]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchStartRef.current) return;
    e.preventDefault();
    const [a, b] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const { distance: startDistance, zoom: startZoom } = pinchStartRef.current;
    applyZoom(startZoom * (distance / startDistance));
  }, [applyZoom]);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartRef.current = null;
  }, []);

  if (pageUrls.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 rounded-2xl min-h-75">
        <p className="text-gray-400 text-sm">PDF hali yuklanmagan</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-gray-100 rounded-2xl overflow-hidden">
      <div
        ref={scrollRef}
        className="w-full h-full overflow-y-auto overflow-x-hidden overscroll-contain"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={handleScroll}
      >
        <div
          ref={zoomLayerRef}
          className="flex flex-col items-center gap-3 py-3"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          {pageUrls.map((url, idx) => {
            const pageNumber = idx + 1;
            return (
              <ClassroomPdfPage
                key={pageNumber}
                pageNumber={pageNumber}
                url={url}
                strokes={strokesByPage[pageNumber] ?? []}
                pointer={pointer}
                showPointer={pointer?.page === pageNumber}
                editable={editable}
                tool={tool}
                color={color}
                strokeWidth={strokeWidth}
                onStrokeComplete={onStrokeComplete}
                onPointerMove={onPointerMove}
                registerEl={registerEl}
              />
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-xl bg-white shadow-md p-1">
        <button
          type="button"
          onClick={() => applyZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Kichraytirish"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => applyZoom(1)}
          className="px-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 min-w-11 text-center"
          title="Asl o'lchamga qaytarish"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Kattalashtirish"
        >
          <Plus size={16} />
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => applyZoom(1)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Reset"
          >
            <ResetZoom size={14} />
          </button>
        )}
      </div>

      {!following && (
        <button
          type="button"
          onClick={resumeFollowing}
          className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-indigo-600 text-white shadow-md px-3 py-2 text-xs font-semibold hover:bg-indigo-700"
        >
          <ArrowDownToLine size={14} />
          Ustozga qaytish
        </button>
      )}
    </div>
  );
}
