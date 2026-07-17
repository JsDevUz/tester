import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Move, Plus, RotateCcw as ResetZoom } from "lucide-react";
import type { CsPointer, CsStroke, CsTool } from "../../api/classroom";
import { useAutoHideOverlay } from "../../hooks/useAutoHideOverlay";

// Chizish uchun reference kenglik — stroke.width shu kenglikdagi px deb saqlanadi
const REF_WIDTH = 1000;
const MAX_DPR = 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export type DrawTool = CsTool | "laser" | "arrow" | "eraser-pixel" | "eraser-stroke";

interface Props {
  // Ustoz hozirgacha ochgan barcha sahifalar (1-indexed ko'rinishda tartiblangan)
  pageUrls: string[];
  // 1-indexed — ustozning joriy sahifasi. Sinxron rejimda shu yerga scroll qilinadi.
  currentPage: number;
  strokesByPage: Record<number, CsStroke[]>;
  pointer: CsPointer | null;
  editable: boolean;
  // Ustoz uchun erkin/sinxron toggle ko'rsatilmaydi — u har doim o'zi boshqaradi.
  isHost: boolean;
  // Ustozning serverga saqlangan zoom darajasi — o'quvchi sinxron rejimda
  // shunga moslashadi. Ustoz uchun bu boshlang'ich qiymat, keyin local
  // boshqariladi (onZoomChange orqali serverga yuboriladi).
  hostZoom: number;
  onZoomChange?: (zoom: number) => void;
  // Ustozning aniq scroll pozitsiyasi — content balandligi/kengligiga
  // nisbatan foiz (0..1), device/ekran o'lchamidan qat'i nazar bir xil
  // nisbiy joyni bildiradi. O'quvchi shu foizga scroll qiladi.
  hostScroll: { xRatio: number; yRatio: number } | null;
  onScrollChange?: (xRatio: number, yRatio: number) => void;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onStrokeComplete?: (page: number, stroke: CsStroke) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
  onEraseStroke?: (page: number, strokeId: string) => void;
  // Pixel-eraser: bitta chizmani (strokeId) bir nechta yangi kesim-chizmalar
  // bilan almashtiradi (segment-darajasida o'chirish natijasi).
  onSplitStroke?: (page: number, strokeId: string, replacements: CsStroke[]) => void;
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
}

// O'q boshi (arrowhead) REF_WIDTH'ga nisbiy o'lchamda chiziladi (xuddi
// strokeWidth kabi) — shunda ekran/qurilma o'lchamidan (mobil/desktop)
// qat'i nazar sahifaga nisbatan bir xil ko'rinishda bo'ladi. Chiziq
// qanchalik uzun bo'lmasin, uchi kattalashib ketmaydi.
const ARROW_HEAD_LEN_REF = 22;
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
  // Chiziqni o'q boshi uzunligicha oldinroq to'xtatamiz — aks holda
  // asosiy chiziqning uchi ochiq "V" bosh ichidan chiqib qolib, to'g'ri
  // chiziq ko'rinishida bo'lib qoladi.
  const arrowHeadLen = ARROW_HEAD_LEN_REF * (w / REF_WIDTH);
  const headLen = arrowHeadLen * Math.min(1, ctx.lineWidth / 3 + 0.6);
  const lineEndX = x1 - headLen * 0.6 * Math.cos(angle);
  const lineEndY = y1 - headLen * 0.6 * Math.sin(angle);

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(lineEndX, lineEndY);
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

function drawStroke(ctx: CanvasRenderingContext2D, s: CsStroke, w: number, h: number, dimmed?: boolean) {
  if (s.points.length < 2) return;
  if (s.tool === "arrow") {
    if (s.points.length >= 4) drawArrow(ctx, s, w, h, dimmed);
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

function findStrokeAt(strokes: CsStroke[], x: number, y: number, hitRadius: number): CsStroke | null {
  // Oxirgi chizilgandan boshlab tekshiramiz — ustma-ust chizmalarda eng
  // "tepadagi" (oxirgi chizilgan) ni topish tabiiyroq.
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    const pts = s.points;
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
  if (pts.length < 4 || stroke.tool === "arrow") return null;

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
  onEraseStroke?: (page: number, strokeId: string) => void;
  onSplitStroke?: (page: number, strokeId: string, replacements: CsStroke[]) => void;
  registerEl: (page: number, el: HTMLDivElement | null) => void;
}

// Bitta sahifa: rasm + chizish canvas. Ko'rinish oynasiga yaqinlashguncha
// <img src> qo'yilmaydi (lazy) — ko'p sahifali darsda hammasi birdan
// yuklanib xotira/tarmoqni og'irlashtirmasin.
function ClassroomPdfPage({
  pageNumber, url, strokes, pointer, showPointer, editable, tool, color, strokeWidth,
  onStrokeComplete, onPointerMove, onEraseStroke, onSplitStroke, registerEl,
}: PageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  // Stroke-eraser rejimida sichqoncha ustidan o'tgan chizma shu ID bilan
  // xiralashtirib ko'rsatiladi (o'chirilmasdan oldin preview).
  const [hoveredStrokeId, setHoveredStrokeId] = useState<string | null>(null);
  const erasedThisDragRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const draftRef = useRef<number[] | null>(null);
  // O'chirg'ich rejimida sichqoncha ostida qancha joy o'chishini ko'rsatadigan
  // opacity-doira uchun joriy kursor pozitsiyasi (normalized).
  const eraserCursorRef = useRef<[number, number] | null>(null);
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
    for (const s of strokes) drawStroke(ctx, s, size.w, size.h, s.id === hoveredStrokeId);
    if (draftRef.current && draftRef.current.length >= 2 && tool !== "eraser-pixel" && tool !== "eraser-stroke") {
      drawStroke(ctx, { id: "__draft__", tool: tool === "laser" ? "pen" : tool, color, width: strokeWidth, points: draftRef.current }, size.w, size.h);
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

  // Pixel-eraser: nuqta atrofidagi segmentni chizmadan kesib oladi. Agar
  // hech nima qolmasa butunlay o'chiradi, aks holda qolgan bo'lak(lar)ni
  // yangi chizmalar sifatida yuboradi.
  const erasePixelAt = useCallback((x: number, y: number) => {
    const hitRadius = eraseHitRadius(strokeWidth);
    const hit = findStrokeAt(strokes, x, y, hitRadius);
    if (!hit || erasedThisDragRef.current.has(hit.id)) return;
    erasedThisDragRef.current.add(hit.id);
    // Strelka segmentlarga bo'linmaydi (faqat 2 nuqtali chiziq+bosh) —
    // teginilsa butunlay o'chadi.
    if (hit.tool === "arrow") {
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
    const p = normPoint(e);
    if (!p) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onPointerMove?.(pageNumber, p[0], p[1], true);
    if (tool === "laser") return;
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
    draftRef.current = tool === "arrow" ? [p[0], p[1], p[0], p[1]] : [...p];
    forceRedraw((n) => n + 1);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    onPointerMove?.(pageNumber, p[0], p[1], true);
    if (tool === "laser") return;
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
    const draft = draftRef.current;
    if (!draft) return;
    if (tool === "arrow") {
      // Strelka uchun faqat boshlanish + hozirgi nuqta saqlanadi (freehand emas)
      draft[2] = p[0];
      draft[3] = p[1];
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
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft && draft.length >= 2) {
      onStrokeComplete?.(pageNumber, {
        id: crypto.randomUUID(), tool: tool as CsTool, color, width: strokeWidth, points: draft,
      });
    }
    forceRedraw((n) => n + 1);
  };

  const handlePointerLeave = () => {
    setHoveredStrokeId(null);
    eraserCursorRef.current = null;
    finishStroke();
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
              cursor: editable ? (isEraser ? "cell" : "crosshair") : "default",
              pointerEvents: editable ? "auto" : "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={handlePointerLeave}
          />
        </div>
      ) : (
        <div className="w-full aspect-3/4 max-w-3xl bg-gray-200 animate-pulse rounded-xl" />
      )}
    </div>
  );
}

export function ClassroomPdfViewer({
  pageUrls, currentPage, strokesByPage, pointer, editable, isHost, hostZoom, onZoomChange,
  hostScroll, onScrollChange, tool, color, strokeWidth, onStrokeComplete, onPointerMove,
  onEraseStroke, onSplitStroke, onPageChange, toolbar, toolbarActions,
}: Props) {
  // Auto-hide faqat o'quvchi uchun (ekranni band qilmaslik uchun) — ustoz
  // toolbar/o'quvchilar/yakunlash barlariga doim tezkor kirishi kerak,
  // shuning uchun ular hech qachon yashirilmaydi.
  const { visible: autoHideVisible } = useAutoHideOverlay();
  const overlayVisible = isHost || autoHideVisible;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  // Ustoz uchun: local zoom, o'zgarganda serverga yuboriladi (onZoomChange).
  // O'quvchi uchun: sinxron rejimda hostZoom'ga ko'r-ko'rona ergashadi,
  // erkin rejimda esa o'zining local zoom'i ishlaydi.
  const [localZoom, setLocalZoom] = useState(hostZoom);
  // O'quvchi uchun: yoqilgan = sinxron (ustoz bilan birga, hech narsa
  // qimirlatib bo'lmaydi); o'chirilgan = erkin scroll/zoom. Ustoz doim
  // o'zi navigatsiya qiladi, shu toggle unga tegishli emas.
  const [synced, setSynced] = useState(true);
  const suppressScrollDetectRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const zoom = isHost ? localZoom : (synced ? hostZoom : localZoom);

  // Ustoz zoom'i o'zgarganda: sinxron o'quvchida darhol qo'llanadi.
  // Ustozning o'zida esa bu prop faqat boshlang'ich qiymat (keyin local).
  // Scroll konteynerining markazini anchor sifatida olamiz — chunki
  // o'quvchining sichqonchasi ustozning zoom nuqtasida emas.
  useEffect(() => {
    if (isHost) return;
    const scrollEl = scrollRef.current;
    setLocalZoom((prevZoom) => {
      if (scrollEl && hostZoom !== prevZoom) {
        const rect = scrollEl.getBoundingClientRect();
        const localX = rect.width / 2;
        const localY = rect.height / 2;
        const contentX = scrollEl.scrollLeft + localX;
        const contentY = scrollEl.scrollTop + localY;
        const ratio = hostZoom / prevZoom;
        const newScrollLeft = contentX * ratio - localX;
        const newScrollTop = contentY * ratio - localY;
        requestAnimationFrame(() => {
          suppressScrollDetectRef.current = true;
          scrollEl.scrollLeft = newScrollLeft;
          scrollEl.scrollTop = newScrollTop;
          window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
        });
      }
      return hostZoom;
    });
  }, [isHost, hostZoom]);

  // Sinxron rejimga qaytilganda zoom ham ustoznikiga tenglashadi.
  useEffect(() => {
    if (!isHost && synced) setLocalZoom(hostZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced]);

  const registerEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(page, el);
    else pageElsRef.current.delete(page);
  }, []);

  const scrollToPage = useCallback((page: number, smooth: boolean) => {
    // requestAnimationFrame: sahifa lazy-render bo'lgan bo'lsa (visible
    // endigina true bo'lgan), DOM layout hali hisoblanmagan bo'lishi
    // mumkin — bir frame kutib, keyin haqiqiy offsetTop'ni o'qiymiz.
    requestAnimationFrame(() => {
      const el = pageElsRef.current.get(page);
      const scrollEl = scrollRef.current;
      if (!el || !scrollEl) return;
      suppressScrollDetectRef.current = true;
      // offsetTop eng yaqin position:relative ota-elementga nisbatan
      // hisoblanadi, bu scroll konteynerning o'zi bo'lmasligi mumkin
      // (oralarida zoom-wide-div bor) — shuning uchun getBoundingClientRect
      // farqidan foydalanamiz, bu har doim to'g'ri natija beradi.
      const elRect = el.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const top = scrollEl.scrollTop + (elRect.top - scrollRect.top);
      scrollEl.scrollTo({ top, behavior: smooth ? "smooth" : "instant" });
      window.setTimeout(() => { suppressScrollDetectRef.current = false; }, smooth ? 500 : 50);
    });
  }, []);

  // Ustozning scroll pozitsiyasini piksel-aniq qayta tiklaydi: xRatio/yRatio
  // — scrollLeft/scrollTop ning umumiy scrollWidth/scrollHeight'ga nisbati
  // (0..1). Bu qurilma/ekran o'lchamidan qat'i nazar bir xil nisbiy joyni
  // bildiradi, shuning uchun student ekrani host bilan piksel darajasida mos keladi.
  const applyScrollRatio = useCallback((xRatio: number, yRatio: number, smooth: boolean) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    suppressScrollDetectRef.current = true;
    const maxLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
    const maxTop = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTo({
      left: Math.max(0, maxLeft) * xRatio,
      top: Math.max(0, maxTop) * yRatio,
      behavior: smooth ? "smooth" : "instant",
    });
    window.setTimeout(() => { suppressScrollDetectRef.current = false; }, smooth ? 500 : 50);
  }, []);

  // Ustoz uchun currentPage/hostScroll manba emas, natija: u qo'lda scroll
  // qiladi, biz shuni kuzatib chiqarib beramiz (pastda handleScroll).
  // O'quvchi uchun esa bular ustozdan kelgan manba — faqat "synced" yoqiq
  // bo'lsa avtomatik shu pozitsiyaga scroll qilinadi. "instant" ishlatamiz
  // (smooth emas): ustoz tez-tez scroll qilsa, ketma-ket smooth-animatsiyalar
  // bir-birini kesib, oxirgi pozitsiya ustozning haqiqiy joyidan orqada
  // qolib "sinxron chalkashish"ga olib kelardi.
  useLayoutEffect(() => {
    if (isHost || !synced) return;
    if (hostScroll) applyScrollRatio(hostScroll.xRatio, hostScroll.yRatio, false);
    else scrollToPage(currentPage, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, hostScroll, isHost, synced, scrollToPage, applyScrollRatio]);

  // Ustoz qo'lda scroll qilganda: ko'rinadigan oyna markaziga eng yaqin
  // sahifani "joriy sahifa" deb hisoblaymiz (toolbar uchun) va aniq
  // scroll foizini (xRatio/yRatio) tashqariga chiqarib beramiz.
  const scrollDetectRaf = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (!isHost) return;
    if (suppressScrollDetectRef.current) return;
    if (scrollDetectRaf.current) cancelAnimationFrame(scrollDetectRaf.current);
    scrollDetectRaf.current = requestAnimationFrame(() => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      if (onPageChange) {
        const viewportMid = scrollEl.getBoundingClientRect().top + scrollEl.clientHeight / 2;
        let closestPage = currentPageRef.current;
        let closestDist = Infinity;
        for (const [page, el] of pageElsRef.current) {
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const dist = Math.abs(mid - viewportMid);
          if (dist < closestDist) { closestDist = dist; closestPage = page; }
        }
        if (closestPage !== currentPageRef.current) onPageChange(closestPage);
      }
      if (onScrollChange) {
        const maxLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
        const maxTop = scrollEl.scrollHeight - scrollEl.clientHeight;
        const xRatio = maxLeft > 0 ? scrollEl.scrollLeft / maxLeft : 0;
        const yRatio = maxTop > 0 ? scrollEl.scrollTop / maxTop : 0;
        onScrollChange(xRatio, yRatio);
      }
    });
  }, [isHost, onPageChange, onScrollChange]);

  const toggleSynced = useCallback(() => {
    setSynced((prev) => {
      const next = !prev;
      if (next) {
        // Sinxron rejimga qaytilganda ustoz zoomiga va pozitsiyasiga tenglashadi
        setLocalZoom(hostZoom);
        if (hostScroll) applyScrollRatio(hostScroll.xRatio, hostScroll.yRatio, true);
        else scrollToPage(currentPageRef.current, true);
      } else {
        // Erkin rejimga o'tilganda 100% dan boshlanadi
        setLocalZoom(1);
      }
      return next;
    });
  }, [scrollToPage, applyScrollRatio, hostScroll, hostZoom]);

  // Zoom o'zgarganda sichqoncha/pinch markazi ekranda bir joyda qolishi
  // uchun: eski va yangi zoom nisbatiga qarab scroll pozitsiyasini
  // qayta hisoblaymiz (anchor — konteyner ichidagi piksel nuqta).
  const applyZoomAnchored = useCallback((next: number, anchorClientX: number, anchorClientY: number) => {
    const clamped = clampZoom(next);
    const scrollEl = scrollRef.current;
    setLocalZoom((prevZoom) => {
      if (scrollEl && clamped !== prevZoom) {
        const rect = scrollEl.getBoundingClientRect();
        const localX = anchorClientX - rect.left;
        const localY = anchorClientY - rect.top;
        const contentX = scrollEl.scrollLeft + localX;
        const contentY = scrollEl.scrollTop + localY;
        const ratio = clamped / prevZoom;
        const newScrollLeft = contentX * ratio - localX;
        const newScrollTop = contentY * ratio - localY;
        requestAnimationFrame(() => {
          suppressScrollDetectRef.current = true;
          scrollEl.scrollLeft = newScrollLeft;
          scrollEl.scrollTop = newScrollTop;
          window.setTimeout(() => { suppressScrollDetectRef.current = false; }, 50);
        });
      }
      return clamped;
    });
    if (isHost) onZoomChange?.(clamped);
  }, [isHost, onZoomChange]);

  // Tugmalar (+/-/reset) uchun: aniq anchor nuqta yo'q, shuning uchun
  // ko'rinadigan oyna markazini anchor sifatida olamiz.
  const applyZoom = useCallback((next: number) => {
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      applyZoomAnchored(next, rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
    const clamped = clampZoom(next);
    setLocalZoom(clamped);
    if (isHost) onZoomChange?.(clamped);
  }, [isHost, onZoomChange, applyZoomAnchored]);

  const freeToMove = isHost || !synced;

  // React'ning onWheel'i sintetik va ba'zi brauzerlarda passive bo'lib
  // qolishi mumkin — bu holda preventDefault() e'tiborsiz qoldiriladi va
  // trackpad pinch/Ctrl+wheel butun sahifani (body) zoom qilib yuboradi.
  // Shuning uchun native, passive:false listener bilan qo'shimcha
  // to'siq qo'yamiz — bu har doim ishonchli ishlaydi.
  const freeToMoveRef = useRef(freeToMove);
  freeToMoveRef.current = freeToMove;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const applyZoomAnchoredRef = useRef(applyZoomAnchored);
  applyZoomAnchoredRef.current = applyZoomAnchored;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        if (!freeToMoveRef.current) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!freeToMoveRef.current) return;
      applyZoomAnchoredRef.current(zoomRef.current - e.deltaY * 0.01, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Asosiy ish native listenerda bajariladi — bu yerda faqat React'ga
    // event allaqachon boshqarilganini bildiramiz.
    e.preventDefault();
  }, []);

  const pinchStartRef = useRef<{ distance: number; zoom: number; cx: number; cy: number } | null>(null);

  // React'ning sintetik touch handlerlari ba'zi brauzerlarda passive bo'lib
  // qolib preventDefault()ni e'tiborsiz qoldirishi mumkin — shu sabab
  // ikki barmoq bilan pinch qilinganda butun brauzer sahifasi (body) zoom
  // bo'lib ketardi. Native, passive:false listener bilan bu to'liq bloklanadi.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!freeToMoveRef.current) { e.preventDefault(); return; }
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      pinchStartRef.current = { distance, zoom: zoomRef.current, cx, cy };
    };
    const onNativeTouchMove = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      if (!freeToMoveRef.current) { e.preventDefault(); return; }
      if (!pinchStartRef.current) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const { distance: startDistance, zoom: startZoom, cx, cy } = pinchStartRef.current;
      applyZoomAnchoredRef.current(startZoom * (distance / startDistance), cx, cy);
    };
    const onNativeTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartRef.current = null;
    };

    el.addEventListener("touchstart", onNativeTouchStart, { passive: false });
    el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
    el.addEventListener("touchend", onNativeTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onNativeTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onNativeTouchStart);
      el.removeEventListener("touchmove", onNativeTouchMove);
      el.removeEventListener("touchend", onNativeTouchEnd);
      el.removeEventListener("touchcancel", onNativeTouchEnd);
    };
  }, []);

  const toolbarRow = (toolbar || toolbarActions) && (
    <div
      className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 transition-transform duration-300 ease-in-out"
      style={{ transform: overlayVisible ? "translateY(0)" : "translateY(-150%)" }}
    >
      <div>{toolbar}</div>
      <div className="flex items-center gap-2">{toolbarActions}</div>
    </div>
  );

  if (pageUrls.length === 0) {
    return (
      <div className="relative flex-1 flex items-center justify-center bg-gray-100 rounded-2xl min-h-75">
        {toolbarRow}
        <p className="text-gray-400 text-sm">PDF hali yuklanmagan</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-gray-100 rounded-2xl overflow-hidden">
      {toolbarRow}
      <div
        ref={scrollRef}
        className="w-full h-full overflow-auto overscroll-contain"
        style={{
          // "pinch-zoom" atayin qo'shilmagan: bu qiymat brauzerning NATIVE
          // pinch-zoom xatti-harakatini yoqib, bizning custom JS-zoom bilan
          // to'qnashib, butun sahifani (body) zoom qilib yuborardi.
          touchAction: freeToMove ? "pan-x pan-y" : "none",
          overflow: freeToMove ? "auto" : "hidden",
        }}
        onWheel={handleWheel}
        onScroll={handleScroll}
      >
        <div
          className="flex flex-col items-center gap-3 py-3"
          style={{
            width: `${zoom * 100}%`,
            minWidth: "100%",
          }}
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
                onEraseStroke={onEraseStroke}
                onSplitStroke={onSplitStroke}
                registerEl={registerEl}
              />
            );
          })}
        </div>
      </div>

      {(() => {
        const zoomPanel = (
          <div className="flex items-center gap-0.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md px-1 py-0.5">
            <span className="px-1.5 text-[11px] font-medium text-gray-500 tabular-nums select-none">
              {currentPage} / {pageUrls.length}
            </span>

            <div className="w-px h-4 bg-gray-200" />

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

        const moveButton = !isHost && (
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

        // Ustoz uchun: page-info+zoom+move birga, bottom-left'da.
        // O'quvchi uchun: page-info+zoom top-left'ga (toolbar qatoridan
        // pastroq), move esa bottom-left'da alohida qoladi.
        if (isHost) {
          return (
            <div
              className="absolute bottom-3 left-3 flex items-center gap-1.5 transition-transform duration-300 ease-in-out"
              style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
            >
              {zoomPanel}
              {moveButton}
            </div>
          );
        }

        return (
          <>
            <div
              className="absolute top-3 left-3 z-10 transition-transform duration-300 ease-in-out"
              style={{ transform: overlayVisible ? "translateY(0)" : "translateY(-150%)" }}
            >
              {zoomPanel}
            </div>
            <div
              className="absolute bottom-3 left-3 transition-transform duration-300 ease-in-out"
              style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
            >
              {moveButton}
            </div>
          </>
        );
      })()}
    </div>
  );
}
