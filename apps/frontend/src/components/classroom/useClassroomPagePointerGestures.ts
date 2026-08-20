import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CsStroke, CsTool } from "../../api/classroom";
import { REF_WIDTH } from "./classroomCanvasText";
import { nearestShapeBinding, resolveConnector } from "./classroomShapeBindings";
import {
  eraseHitRadius,
  eraseNearPoint,
  findSelectableShapeAt,
  findStrokeAt,
  findStrokesInLasso,
} from "./classroomCanvasGeometry";
import { renderClassroomCanvas } from "./useClassroomCanvasRenderer";

const CONNECTOR_SNAP_DISTANCE_PX = 14;
const DOUBLE_CLICK_MS = 400;

interface UseClassroomPagePointerGesturesParams {
  editable: boolean;
  pageNumber: number;
  strokes: CsStroke[];
  size: { w: number; h: number };
  tool: string;
  color: string;
  strokeWidth: number;
  shapeStyle: any;
  notebook: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textEditor: any;
  editingTextId: string | null;
  lastTextStyleRef: React.RefObject<any>;
  selectedGroupIds: Set<string>;
  selectedGroupBounds: { left: number; top: number; right: number; bottom: number } | null;
  draggingGroupRef: React.RefObject<{ ids: Set<string>; startX: number; startY: number } | null>;
  connectorDraftRef: React.RefObject<any>;
  lineEndpointDragRef: React.RefObject<any>;
  onActivate: () => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onMoveStroke?: (page: number, strokeId: string, x: number, y: number, groupId?: string) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onSplitStroke?: (page: number, strokeId: string, replacements: CsStroke[], groupId?: string) => void;
  onToolChange?: (tool: any) => void;
  claimSelection: (key: string) => void;
  commitText: () => void;
  commitGroupStroke: (stroke: CsStroke, groupId?: string) => void;
  deleteStrokeAndAttachedConnectors: (strokeIdOrIds: string | string[], customGroupId?: string) => void;
  setSelectedTextId: (id: string | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  setSelectedGroupIds: (ids: Set<string>) => void;
  setEditingTextId: (id: string | null) => void;
  setTextEditor: React.Dispatch<React.SetStateAction<any>>;
  setConnectorTarget: (target: any) => void;
  forceRedraw: React.Dispatch<React.SetStateAction<number>>;
  lastPointerPosRef: React.RefObject<[number, number] | null>;
}

export function useClassroomPagePointerGestures({
  editable,
  pageNumber,
  strokes,
  size,
  tool,
  color,
  strokeWidth,
  shapeStyle,
  notebook,
  canvasRef,
  textEditor,
  editingTextId,
  lastTextStyleRef,
  selectedGroupIds,
  selectedGroupBounds,
  draggingGroupRef,
  connectorDraftRef,
  lineEndpointDragRef,
  onActivate,
  onPointerMove,
  onStrokeComplete,
  onMoveStroke,
  onUpdateShapeStroke,
  onSplitStroke,
  onToolChange,
  claimSelection,
  commitText,
  commitGroupStroke,
  deleteStrokeAndAttachedConnectors,
  setSelectedTextId,
  setSelectedShapeId,
  setSelectedGroupIds,
  setEditingTextId,
  setTextEditor,
  setConnectorTarget,
  forceRedraw,
  lastPointerPosRef,
}: UseClassroomPagePointerGesturesParams) {
  const [hoveredStrokeId, setHoveredStrokeId] = useState<string | null>(null);
  const draftRef = useRef<number[] | null>(null);
  const draftPressuresRef = useRef<number[] | null>(null);
  const lassoDraftRef = useRef<number[] | null>(null);
  const eraserCursorRef = useRef<[number, number] | null>(null);
  const erasedThisDragRef = useRef<Set<string>>(new Set());
  const eraserGroupIdRef = useRef<string | null>(null);
  const draggingEraserRef = useRef(false);
  const draggingTextRef = useRef<{
    stroke: CsStroke;
    dx: number;
    dy: number;
  } | null>(null);
  const draggingShapeRef = useRef<{
    stroke: CsStroke;
    dx: number;
    dy: number;
  } | null>(null);
  const draggingStrokeRef = useRef<{
    stroke: CsStroke;
    dx: number;
    dy: number;
  } | null>(null);
  const lastClickRef = useRef<{ id: string; atMs: number } | null>(null);

  // Drag paytida (matn/shape/pen ko'chirish) canvas'ni React render tsiklidan
  // MUSTAQIL, to'g'ridan-to'g'ri ctx orqali yangilaydi — forceRedraw()ni
  // (React state) har pointermove'da chaqirish butun sahifa daraxtini qayta
  // render qilib, reconciliation xarajati tufayli drag paytida "qaltirash"
  // (dropped frame) keltirib chiqargan edi. forceRedraw endi faqat drag
  // TUGAGACH (finishStroke) chaqiriladi — shu bilan boshqa overlay/panel
  // proplari (masalan selection box koordinatalari) bir marta yangilanadi.
  // Pointer events arrive faster than the display refreshes -- a 120Hz stylus fires roughly
  // twice per frame, and pointermove can also coalesce several samples into one burst. Drawing
  // on each of them repaints the whole canvas for frames nobody ever sees. Coalescing into
  // requestAnimationFrame renders once per frame with the latest state, which is what the
  // screen can actually show.
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const renderImmediate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderClassroomCanvas({
      canvas,
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
      showPointer: false,
      pointer: null,
      lassoDraftPoints: lassoDraftRef.current,
      eraserCursor: eraserCursorRef.current,
    });
  }, [
    canvasRef,
    size,
    strokes,
    editingTextId,
    textEditor,
    hoveredStrokeId,
    strokeWidth,
    tool,
    color,
    shapeStyle,
    connectorDraftRef,
  ]);

  const renderNow = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderImmediate();
    });
  }, [renderImmediate]);

  // Drag paytida boshqa foydalanuvchilarga (yoki ikkinchi pane'ga) ham
  // real-time ko'rinishi uchun onMoveStroke/onUpdateShapeStroke'ni chaqirish
  // kerak, lekin buni har pointermove'da (60-120fps) qilish backend'dagi
  // setState orqali butun sahifa daraxtini shu chastotada qayta render
  // qilib, hostning o'zida "qaltirash"ni qaytarardi. requestAnimationFrame
  // bilan freymga bittadan cheklab — mahalliy canvas (renderNow) darhol,
  // tarmoq-broadcast esa ekran yangilanish chastotasida (kamroq) yuboriladi.
  const broadcastMoveFrameRef = useRef<number | null>(null);
  const scheduleMoveBroadcast = useCallback((fn: () => void) => {
    if (broadcastMoveFrameRef.current !== null) return;
    broadcastMoveFrameRef.current = window.requestAnimationFrame(() => {
      broadcastMoveFrameRef.current = null;
      fn();
    });
  }, []);

  const isEraser = tool === "eraser-pixel" || tool === "eraser-stroke";

  const normPoint = (e: ReactPointerEvent): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;
    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  const findTextAt = (x: number, y: number): CsStroke | null => {
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const stroke = strokes[i];
      if (stroke.tool !== "text" || stroke.points.length < 2 || !stroke.text)
        continue;
      const fontSize = stroke.fontSize ?? Math.max(14, stroke.width * 6);
      const lines = stroke.text.split("\n");
      const width = Math.min(
        1,
        (stroke.textBoxWidth ??
          Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.62) /
          REF_WIDTH,
      );
      const renderedFontSize = fontSize * (size.w / REF_WIDTH);
      const height =
        stroke.textBoxHeight !== undefined
          ? (stroke.textBoxHeight * (size.w / REF_WIDTH)) / Math.max(size.h, 1)
          : (lines.length * renderedFontSize * 1.25) / Math.max(size.h, 1);
      if (
        x >= stroke.points[0] &&
        x <= stroke.points[0] + width &&
        y >= stroke.points[1] &&
        y <= stroke.points[1] + height
      )
        return stroke;
    }
    return null;
  };

  const erasePixelAt = useCallback(
    (x: number, y: number) => {
      const hitRadius = eraseHitRadius(strokeWidth);
      const hit = findStrokeAt(strokes, x, y, hitRadius);
      if (!hit || erasedThisDragRef.current.has(hit.id)) return;
      erasedThisDragRef.current.add(hit.id);
      const groupId = eraserGroupIdRef.current || undefined;
      if (
        hit.tool === "arrow" ||
        hit.tool === "line" ||
        hit.tool === "rectangle" ||
        hit.tool === "ellipse"
      ) {
        deleteStrokeAndAttachedConnectors(hit.id, groupId);
        return;
      }
      const remaining = eraseNearPoint(hit, x, y, hitRadius);
      if (remaining === null) return;
      if (remaining.length === 0)
        deleteStrokeAndAttachedConnectors(hit.id, groupId);
      else onSplitStroke?.(pageNumber, hit.id, remaining, groupId);
    },
    [
      strokes,
      strokeWidth,
      pageNumber,
      deleteStrokeAndAttachedConnectors,
      onSplitStroke,
    ],
  );

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (!editable) return;
    onActivate();
    const p = normPoint(e);
    if (!p) return;
    if (lastPointerPosRef) lastPointerPosRef.current = p;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onPointerMove?.(pageNumber, p[0], p[1], true);

    if (textEditor) {
      commitText();
      return;
    }
    if (tool === "text") {
      setEditingTextId(null);
      setSelectedShapeId(null);
      setSelectedGroupIds(new Set());
      setTextEditor({
        x: p[0],
        y: p[1],
        text: "",
        color,
        verticalAlign: "middle",
        textBoxWidth: 4,
        textBoxHeight: Math.max(
          1,
          (lastTextStyleRef.current?.fontSize ?? 24) * 1.25,
        ),
        ...lastTextStyleRef.current,
      });
      return;
    }
    if (tool === "lasso") {
      if (
        selectedGroupBounds &&
        p[0] >= selectedGroupBounds.left &&
        p[0] <= selectedGroupBounds.right &&
        p[1] >= selectedGroupBounds.top &&
        p[1] <= selectedGroupBounds.bottom
      ) {
        draggingGroupRef.current = {
          ids: new Set(selectedGroupIds),
          startX: p[0],
          startY: p[1],
        };
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
        setSelectedGroupIds(new Set());
        claimSelection(
          `${notebook ? "nb" : "pdf"}-${pageNumber}-text-${existing.id}`,
        );
        const now = Date.now();
        const isDoubleClick =
          lastClickRef.current?.id === existing.id &&
          now - lastClickRef.current.atMs < DOUBLE_CLICK_MS;
        lastClickRef.current = { id: existing.id, atMs: now };
        if (e.detail >= 2 || isDoubleClick) {
          lastClickRef.current = null;
          setEditingTextId(existing.id);
          const existingFontFamily = existing.fontFamily ?? "Inter";
          const existingFontSize = existing.fontSize ?? 24;
          const existingFontWeight = existing.fontWeight ?? 600;
          setTextEditor({
            x: existing.points[0],
            y: existing.points[1],
            text: existing.text ?? "",
            color: existing.color,
            fontFamily: existingFontFamily,
            fontSize: existingFontSize,
            fontWeight: existingFontWeight,
            textAlign: existing.textAlign ?? "left",
            verticalAlign: existing.verticalAlign ?? "middle",
            textBoxWidth:
              existing.textBoxWidth ??
              Math.max(4, (existing.text?.length ?? 1) * existingFontSize * 0.6),
            textBoxHeight:
              existing.textBoxHeight ?? Math.max(1, existingFontSize * 1.25),
          });
        } else {
          draggingTextRef.current = {
            stroke: existing,
            dx: p[0] - existing.points[0],
            dy: p[1] - existing.points[1],
          };
        }
        return;
      }
      const existingShape = findSelectableShapeAt(
        strokes
          .map((stroke) => resolveConnector(stroke, strokes, size.w, size.h))
          .filter(
            (stroke) =>
              stroke.tool === "rectangle" ||
              stroke.tool === "ellipse" ||
              stroke.tool === "line" ||
              stroke.tool === "arrow",
          ),
        p[0],
        p[1],
        eraseHitRadius(strokeWidth),
        size.w,
        size.h,
      );
      setSelectedShapeId(existingShape?.id ?? null);
      if (existingShape) {
        setSelectedTextId(null);
        setSelectedGroupIds(new Set());
        claimSelection(
          `${notebook ? "nb" : "pdf"}-${pageNumber}-shape-${existingShape.id}`,
        );
        const now = Date.now();
        const isDoubleClick =
          lastClickRef.current?.id === existingShape.id &&
          now - lastClickRef.current.atMs < DOUBLE_CLICK_MS;
        lastClickRef.current = { id: existingShape.id, atMs: now };
        if (
          (e.detail >= 2 || isDoubleClick) &&
          (existingShape.tool === "rectangle" ||
            existingShape.tool === "ellipse")
        ) {
          lastClickRef.current = null;
          setEditingTextId(existingShape.id);
          const left = Math.min(
            existingShape.points[0],
            existingShape.points[2],
          );
          const top = Math.min(
            existingShape.points[1],
            existingShape.points[3],
          );
          const shapeWidth = Math.abs(
            existingShape.points[2] - existingShape.points[0],
          );
          const shapeHeight = Math.abs(
            existingShape.points[3] - existingShape.points[1],
          );
          setTextEditor({
            x: left,
            y: top,
            text: existingShape.text ?? "",
            color: existingShape.textColor || existingShape.color || "#000000",
            fontFamily: existingShape.fontFamily ?? "Inter",
            fontSize: existingShape.fontSize ?? 24,
            fontWeight: existingShape.fontWeight ?? 600,
            textAlign: existingShape.textAlign ?? "center",
            verticalAlign: existingShape.verticalAlign ?? "middle",
            textBoxWidth: Math.max(40, shapeWidth * REF_WIDTH),
            textBoxHeight: Math.max(
              24,
              shapeHeight * (size.h / Math.max(size.w, 1)) * REF_WIDTH,
            ),
          });
        } else {
          const isConnector =
            existingShape.tool === "arrow" &&
            Boolean(existingShape.startBinding ?? existingShape.endBinding);
          if (!isConnector) {
            draggingShapeRef.current = {
              stroke: existingShape,
              dx: p[0] - existingShape.points[0],
              dy: p[1] - existingShape.points[1],
            };
          }
        }
      }
      if (!existing && !existingShape) {
        const existingStroke = findStrokeAt(
          strokes.filter(
            (stroke) =>
              stroke.tool !== "text" &&
              stroke.tool !== "rectangle" &&
              stroke.tool !== "ellipse",
          ),
          p[0],
          p[1],
          eraseHitRadius(strokeWidth),
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
    if (tool === "eraser-pixel" || tool === "eraser-stroke") {
      draggingEraserRef.current = true;
      erasedThisDragRef.current = new Set();
      eraserGroupIdRef.current = crypto.randomUUID();
      if (tool === "eraser-pixel") {
        erasePixelAt(p[0], p[1]);
      } else {
        const hit = findStrokeAt(
          strokes,
          p[0],
          p[1],
          eraseHitRadius(strokeWidth),
        );
        if (hit && !erasedThisDragRef.current.has(hit.id)) {
          erasedThisDragRef.current.add(hit.id);
          deleteStrokeAndAttachedConnectors(hit.id, eraserGroupIdRef.current);
        }
      }
      return;
    }
    setSelectedShapeId(null);
    setSelectedTextId(null);
    setSelectedGroupIds(new Set());
    draftRef.current =
      tool === "arrow" ||
      tool === "line" ||
      tool === "rectangle" ||
      tool === "ellipse"
        ? [p[0], p[1], p[0], p[1]]
        : [...p];
    draftPressuresRef.current =
      tool === "pen" && e.pointerType === "pen"
        ? [Math.max(0.01, Math.min(1, e.pressure || 0.5))]
        : null;
    forceRedraw((n) => n + 1);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!editable) return;
    const p = normPoint(e);
    if (!p) return;
    if (lastPointerPosRef) lastPointerPosRef.current = p;
    onPointerMove?.(pageNumber, p[0], p[1], true);
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
        if (stroke.controlX !== undefined) stroke.controlX += offsetX;
        if (stroke.controlY !== undefined) stroke.controlY += offsetY;
      }
      renderNow();
      return;
    }
    if (lassoDraftRef.current) {
      lassoDraftRef.current.push(p[0], p[1]);
      renderNow();
      return;
    }
    if (draggingTextRef.current) {
      // Mahalliy: mutable stroke + renderNow() darhol, har freymda ishlaydi
      // (React state'ga tegmaydi, hostning o'zida qaltiramaydi). Tarmoqqa
      // esa scheduleMoveBroadcast orqali freymga bittadan (throttled)
      // onMoveStroke yuboriladi — shu bilan boshqa foydalanuvchilar/pane
      // ham drag TUGAGUNCHA emas, real vaqtda (kamroq chastotada) ko'radi.
      const { stroke, dx, dy } = draggingTextRef.current;
      const nextX = Math.max(0, Math.min(1, p[0] - dx));
      const nextY = Math.max(0, Math.min(1, p[1] - dy));
      stroke.points[0] = nextX;
      stroke.points[1] = nextY;
      renderNow();
      scheduleMoveBroadcast(() => {
        if (!draggingTextRef.current) return;
        onMoveStroke?.(pageNumber, stroke.id, stroke.points[0], stroke.points[1]);
      });
      return;
    }
    if (draggingShapeRef.current) {
      const { stroke, dx, dy } = draggingShapeRef.current;
      const oldX0 = stroke.points[0];
      const oldY0 = stroke.points[1];
      const width = stroke.points[2] - stroke.points[0];
      const height = stroke.points[3] - stroke.points[1];
      const nextX0 = Math.max(0, Math.min(1 - width, p[0] - dx));
      const nextY0 = Math.max(0, Math.min(1 - height, p[1] - dy));
      const offsetX = nextX0 - oldX0;
      const offsetY = nextY0 - oldY0;
      stroke.points = [nextX0, nextY0, nextX0 + width, nextY0 + height];
      if (stroke.controlX !== undefined) stroke.controlX += offsetX;
      if (stroke.controlY !== undefined) stroke.controlY += offsetY;
      renderNow();
      scheduleMoveBroadcast(() => {
        if (!draggingShapeRef.current) return;
        onUpdateShapeStroke?.(pageNumber, {
          ...stroke,
          points: [...stroke.points],
          ...(stroke.controlX !== undefined ? { controlX: stroke.controlX } : {}),
          ...(stroke.controlY !== undefined ? { controlY: stroke.controlY } : {}),
        });
      });
      return;
    }
    if (draggingStrokeRef.current) {
      // Bu blok avval onMoveStroke'ni HAR pointermove'da to'g'ridan-to'g'ri
      // chaqirardi (boshqa drag turlaridan farqli, throttle qilinmagan) —
      // shuning uchun pen/marker chizmalarini ko'chirishda "qaltirash" aniq
      // sezilarli edi. Endi boshqalari kabi: mahalliy renderNow() har
      // freymda, tarmoq-broadcast esa scheduleMoveBroadcast orqali cheklangan.
      const { stroke, dx, dy } = draggingStrokeRef.current;
      const nextX = p[0] - dx;
      const nextY = p[1] - dy;
      const offsetX = nextX - stroke.points[0];
      const offsetY = nextY - stroke.points[1];
      const moved = stroke.points.map(
        (value, index) => value + (index % 2 === 0 ? offsetX : offsetY),
      );
      if (moved.every((value) => value >= 0 && value <= 1)) {
        stroke.points = moved;
        renderNow();
        scheduleMoveBroadcast(() => {
          if (!draggingStrokeRef.current) return;
          onMoveStroke?.(pageNumber, stroke.id, stroke.points[0], stroke.points[1]);
        });
      }
      return;
    }
    if (tool === "eraser-pixel" || tool === "eraser-stroke") {
      eraserCursorRef.current = p;
      renderNow();
    }
    if (tool === "eraser-pixel") {
      if (draggingEraserRef.current) erasePixelAt(p[0], p[1]);
      return;
    }
    if (tool === "eraser-stroke") {
      const hit = findStrokeAt(
        strokes,
        p[0],
        p[1],
        eraseHitRadius(strokeWidth),
      );
      if (draggingEraserRef.current) {
        if (hit && !erasedThisDragRef.current.has(hit.id)) {
          erasedThisDragRef.current.add(hit.id);
          deleteStrokeAndAttachedConnectors(hit.id);
        }
      } else {
        setHoveredStrokeId(hit?.id ?? null);
      }
      return;
    }
    if (tool === "select") {
      const hoveredText = findTextAt(p[0], p[1]);
      const hoveredShape = hoveredText
        ? null
        : (() => {
            const found = findSelectableShapeAt(
              strokes
                .map((stroke) =>
                  resolveConnector(stroke, strokes, size.w, size.h),
                )
                .filter(
                  (stroke) =>
                    stroke.tool === "rectangle" ||
                    stroke.tool === "ellipse" ||
                    stroke.tool === "line" ||
                    stroke.tool === "arrow",
                ),
              p[0],
              p[1],
              eraseHitRadius(strokeWidth),
              size.w,
              size.h,
            );
            if (
              found?.tool === "arrow" &&
              Boolean(found.startBinding ?? found.endBinding)
            )
              return null;
            return found;
          })();
      const hoveredStroke =
        hoveredText || hoveredShape
          ? null
          : findStrokeAt(
              strokes.filter(
                (stroke) =>
                  stroke.tool !== "text" &&
                  stroke.tool !== "rectangle" &&
                  stroke.tool !== "ellipse",
              ),
              p[0],
              p[1],
              eraseHitRadius(strokeWidth),
            );
      const hit = hoveredText ?? hoveredShape ?? hoveredStroke;
      setHoveredStrokeId(hit?.id ?? null);
      return;
    }
    const draft = draftRef.current;
    if (!draft) return;
    if (
      tool === "arrow" ||
      tool === "line" ||
      tool === "rectangle" ||
      tool === "ellipse"
    ) {
      let nextX = p[0];
      let nextY = p[1];
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
      if (
        (tool === "rectangle" || tool === "ellipse") &&
        e.shiftKey &&
        size.w > 0 &&
        size.h > 0
      ) {
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
      renderNow();
      return;
    }
    const lastX = draft[draft.length - 2];
    const lastY = draft[draft.length - 1];
    if (Math.abs(p[0] - lastX) + Math.abs(p[1] - lastY) < 0.0005) return;
    draft.push(p[0], p[1]);
    if (tool === "pen" && draftPressuresRef.current) {
      draftPressuresRef.current.push(
        Math.max(0.01, Math.min(1, e.pressure || 0.5)),
      );
    }
    renderNow();
  };

  const finishStroke = () => {
    if (!editable) return;
    onPointerMove?.(pageNumber, 0, 0, false);
    // Flush any frame still queued so the finished stroke is on screen before the commit
    // path runs -- otherwise the last samples would be dropped with the cancelled frame.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderImmediate();
    }
    // Drag paytida navbatda qolgan throttled broadcast (agar bo'lsa) endi
    // keraksiz — pastdagi har bir tugatish bloki yakuniy holatni DARHOL
    // yuboradi, shuning uchun eskirgan rAF'ni bekor qilamiz.
    if (broadcastMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(broadcastMoveFrameRef.current);
      broadcastMoveFrameRef.current = null;
    }
    if (isEraser) {
      draggingEraserRef.current = false;
      eraserGroupIdRef.current = null;
      return;
    }
    if (draggingGroupRef.current) {
      const { ids } = draggingGroupRef.current;
      draggingGroupRef.current = null;
      const groupId = crypto.randomUUID();
      for (const stroke of strokes) {
        if (ids.has(stroke.id))
          commitGroupStroke(
            {
              ...stroke,
              points: [...stroke.points],
              ...(stroke.controlX !== undefined
                ? { controlX: stroke.controlX }
                : {}),
              ...(stroke.controlY !== undefined
                ? { controlY: stroke.controlY }
                : {}),
            },
            groupId,
          );
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
        if (enclosed.length > 0) {
          const key = `${notebook ? "nb" : "pdf"}-${pageNumber}-group-${enclosed.join(",")}`;
          claimSelection(key);
        }
      }
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingTextRef.current) {
      const { stroke } = draggingTextRef.current;
      onMoveStroke?.(
        pageNumber,
        stroke.id,
        stroke.points[0],
        stroke.points[1],
      );
      draggingTextRef.current = null;
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingShapeRef.current) {
      const { stroke } = draggingShapeRef.current;
      onUpdateShapeStroke?.(pageNumber, {
        ...stroke,
        points: [...stroke.points],
        ...(stroke.controlX !== undefined
          ? { controlX: stroke.controlX }
          : {}),
        ...(stroke.controlY !== undefined
          ? { controlY: stroke.controlY }
          : {}),
      });
      draggingShapeRef.current = null;
      forceRedraw((n) => n + 1);
      return;
    }
    if (draggingStrokeRef.current) {
      const { stroke } = draggingStrokeRef.current;
      onMoveStroke?.(
        pageNumber,
        stroke.id,
        stroke.points[0],
        stroke.points[1],
      );
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
      const isLineOrArrow = tool === "line" || tool === "arrow";
      const isAnyShapeOrLine = isShape || isLineOrArrow;
      if (
        !isAnyShapeOrLine ||
        Math.abs(draft[2] - draft[0]) > 0.003 ||
        Math.abs(draft[3] - draft[1]) > 0.003
      ) {
        const strokeId = crypto.randomUUID();
        const startSnap = isLineOrArrow
          ? nearestShapeBinding(
              strokes,
              draft[0],
              draft[1],
              size.w,
              size.h,
              undefined,
              CONNECTOR_SNAP_DISTANCE_PX,
            )
          : null;
        const endSnap = isLineOrArrow
          ? nearestShapeBinding(
              strokes,
              draft[2],
              draft[3],
              size.w,
              size.h,
              undefined,
              CONNECTOR_SNAP_DISTANCE_PX,
            )
          : null;
        const isConnector = Boolean(startSnap || endSnap);
        if (startSnap) [draft[0], draft[1]] = startSnap.point;
        if (endSnap) [draft[2], draft[3]] = endSnap.point;
        onStrokeComplete?.(pageNumber, {
          id: strokeId,
          tool: tool as CsTool,
          color,
          width: isConnector ? 2 : strokeWidth,
          points: draft,
          ...((tool as string) === "laser"
            ? { createdAt: Date.now() }
            : {}),
          ...(tool === "pen" && draftPressures?.length === draft.length / 2
            ? { pressures: draftPressures }
            : {}),
          ...(isAnyShapeOrLine
            ? {
                ...shapeStyle,
                lineShape: isConnector
                  ? "curved"
                  : (shapeStyle.lineShape ?? "straight"),
                ...(tool === "arrow" && !shapeStyle.endArrowHead
                  ? { endArrowHead: "arrow", startArrowHead: "none" }
                  : {}),
                ...(tool === "line" && !shapeStyle.endArrowHead
                  ? { endArrowHead: "none", startArrowHead: "none" }
                  : {}),
              }
            : {}),
          ...(startSnap ? { startBinding: startSnap.binding } : {}),
          ...(endSnap ? { endBinding: endSnap.binding } : {}),
          ...(isConnector
            ? {
                width: 2,
                lineShape: "curved" as const,
                startArrowHead: "none" as const,
                endArrowHead: "arrow" as const,
              }
            : {}),
        });
        if (isAnyShapeOrLine) {
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
    if (!connectorDraftRef.current && !lineEndpointDragRef.current)
      setConnectorTarget(null);
    if (
      draftRef.current ||
      draggingStrokeRef.current ||
      draggingShapeRef.current ||
      draggingTextRef.current
    ) {
      return;
    }
    finishStroke();
  };

  return {
    hoveredStrokeId,
    draftRef,
    draftPressuresRef,
    lassoDraftRef,
    eraserCursorRef,
    draggingShapeRef,
    isEraser,
    erasePixelAt,
    handlePointerDown,
    handlePointerMove,
    finishStroke,
    handlePointerLeave,
  };
}
