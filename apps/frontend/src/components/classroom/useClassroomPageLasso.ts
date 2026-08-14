import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { toast } from "sonner";
import type { CsStroke } from "../../api/classroom";
import { measureTextBox } from "./classroomCanvasText";
import { strokeBoundingBox } from "./classroomCanvasGeometry";
import { CLASSROOM_PAGE_CLIPBOARD_KEY } from "./classroomPageClipboard";

interface UseClassroomPageLassoParams {
  strokes: CsStroke[];
  pageNumber: number;
  size: { w: number; h: number };
  editable: boolean;
  tool: string;
  isActiveSurface?: boolean;
  lassoClipboard?: { current: CsStroke[] };
  lastPointerPosRef: React.RefObject<[number, number] | null>;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  deleteStrokeAndAttachedConnectors: (strokeIdOrIds: string | string[]) => void;
  forceRedraw: React.Dispatch<React.SetStateAction<number>>;
  surfaceRef: React.RefObject<HTMLDivElement | HTMLImageElement | null>;
}

export function useClassroomPageLasso({
  strokes,
  pageNumber,
  size,
  editable,
  tool,
  isActiveSurface,
  lassoClipboard,
  lastPointerPosRef,
  onStrokeComplete,
  onUpdateTextStroke,
  onUpdateShapeStroke,
  deleteStrokeAndAttachedConnectors,
  forceRedraw,
  surfaceRef,
}: UseClassroomPageLassoParams) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  const selectedGroupStrokes =
    selectedGroupIds.size > 0
      ? strokes.filter((stroke) => selectedGroupIds.has(stroke.id))
      : [];

  const selectedGroupBounds =
    selectedGroupStrokes.length > 0
      ? selectedGroupStrokes.reduce(
          (acc, stroke) => {
            const box = strokeBoundingBox(stroke);
            return {
              left: Math.min(acc.left, box.left),
              top: Math.min(acc.top, box.top),
              right: Math.max(acc.right, box.right),
              bottom: Math.max(acc.bottom, box.bottom),
            };
          },
          {
            left: Infinity,
            top: Infinity,
            right: -Infinity,
            bottom: -Infinity,
          },
        )
      : null;

  const commitGroupStroke = useCallback(
    (stroke: CsStroke, groupId?: string) => {
      if (stroke.tool === "text") onUpdateTextStroke?.(pageNumber, stroke, groupId);
      else onUpdateShapeStroke?.(pageNumber, stroke, groupId);
    },
    [pageNumber, onUpdateTextStroke, onUpdateShapeStroke],
  );

  const deleteSelectedGroup = () => {
    if (selectedGroupIds.size === 0) return;
    deleteStrokeAndAttachedConnectors(Array.from(selectedGroupIds));
    setSelectedGroupIds(new Set());
  };

  const copySelectedGroup = useCallback(() => {
    if (selectedGroupStrokes.length === 0) return;
    localStorage.removeItem(CLASSROOM_PAGE_CLIPBOARD_KEY);
    if (lassoClipboard) {
      lassoClipboard.current = selectedGroupStrokes.map((stroke) => ({
        ...stroke,
        points: [...stroke.points],
      }));
      toast.success("Elementlar nusxalandi");
    }
  }, [lassoClipboard, selectedGroupStrokes]);

  const PASTE_OFFSET = 0.02;
  const pasteSelectedGroup = useCallback(() => {
    if (!lassoClipboard || lassoClipboard.current.length === 0) return;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const stroke of lassoClipboard.current) {
      for (let i = 0; i < stroke.points.length; i += 2) {
        const x = stroke.points[i];
        const y = stroke.points[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    let targetX = centerX + PASTE_OFFSET;
    let targetY = centerY + PASTE_OFFSET;

    if (lastPointerPosRef.current) {
      targetX = lastPointerPosRef.current[0];
      targetY = lastPointerPosRef.current[1];
    }

    let dx = targetX - centerX;
    let dy = targetY - centerY;

    const newMinX = minX + dx;
    const newMaxX = maxX + dx;
    const newMinY = minY + dy;
    const newMaxY = maxY + dy;

    if (newMinX < 0) dx -= newMinX;
    else if (newMaxX > 1) dx -= newMaxX - 1;

    if (newMinY < 0) dy -= newMinY;
    else if (newMaxY > 1) dy -= newMaxY - 1;

    const idMap = new Map<string, string>();
    for (const stroke of lassoClipboard.current) {
      idMap.set(stroke.id, crypto.randomUUID());
    }

    const newIds = new Set<string>();
    for (const stroke of lassoClipboard.current) {
      const newId = idMap.get(stroke.id)!;
      const shiftedPoints = stroke.points.map((val, idx) =>
        idx % 2 === 0
          ? Math.min(1, Math.max(0, val + dx))
          : Math.min(1, Math.max(0, val + dy)),
      );
      const startBinding = stroke.startBinding
        ? {
            ...stroke.startBinding,
            strokeId:
              idMap.get(stroke.startBinding.strokeId) ??
              stroke.startBinding.strokeId,
          }
        : undefined;
      const endBinding = stroke.endBinding
        ? {
            ...stroke.endBinding,
            strokeId:
              idMap.get(stroke.endBinding.strokeId) ??
              stroke.endBinding.strokeId,
          }
        : undefined;

      const controlX =
        stroke.controlX !== undefined
          ? Math.min(1, Math.max(0, stroke.controlX + dx))
          : undefined;
      const controlY =
        stroke.controlY !== undefined
          ? Math.min(1, Math.max(0, stroke.controlY + dy))
          : undefined;

      onStrokeComplete?.(pageNumber, {
        ...stroke,
        id: newId,
        points: shiftedPoints,
        startBinding,
        endBinding,
        controlX,
        controlY,
      });
      newIds.add(newId);
    }
    setSelectedGroupIds(newIds);
  }, [lassoClipboard, onStrokeComplete, pageNumber, lastPointerPosRef]);

  useEffect(() => {
    if (!editable || tool !== "lasso" || !isActiveSurface) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c" && selectedGroupStrokes.length > 0) {
        event.preventDefault();
        copySelectedGroup();
      } else if (key === "v" && (lassoClipboard?.current.length ?? 0) > 0) {
        event.preventDefault();
        pasteSelectedGroup();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    copySelectedGroup,
    editable,
    isActiveSurface,
    lassoClipboard,
    pasteSelectedGroup,
    selectedGroupStrokes.length,
    tool,
  ]);

  const resizingGroupRef = useRef<{
    corner: "nw" | "ne" | "sw" | "se";
    startBounds: { left: number; top: number; right: number; bottom: number };
    startClientX: number;
    startClientY: number;
    startStrokes: Map<string, CsStroke>;
  } | null>(null);

  const rotatingGroupRef = useRef<{
    centerX: number;
    centerY: number;
    startAngle: number;
    startStrokes: Map<string, CsStroke>;
  } | null>(null);

  const beginGroupResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => {
    if (!selectedGroupBounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingGroupRef.current = {
      corner,
      startBounds: selectedGroupBounds,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startStrokes: new Map(
        selectedGroupStrokes.map((s) => [
          s.id,
          { ...s, points: [...s.points] },
        ]),
      ),
    };
  };

  const transformGroupResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = resizingGroupRef.current;
    if (!current || size.w <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    let dx = (event.clientX - current.startClientX) / size.w;
    let dy = (event.clientY - current.startClientY) / size.h;
    const left = current.corner.includes("w");
    const top = current.corner.includes("n");
    if (event.shiftKey && size.w > 0 && size.h > 0) {
      const dxPx = dx * size.w;
      const dyPx = dy * size.h;
      const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
      dx = ((Math.sign(dxPx) || 1) * side) / size.w;
      dy = ((Math.sign(dyPx) || 1) * side) / size.h;
    }
    const { startBounds } = current;
    const nextLeft = left
      ? Math.max(0, Math.min(startBounds.right - 0.01, startBounds.left + dx))
      : startBounds.left;
    const nextTop = top
      ? Math.max(0, Math.min(startBounds.bottom - 0.01, startBounds.top + dy))
      : startBounds.top;
    const nextRight = !left
      ? Math.max(startBounds.left + 0.01, Math.min(1, startBounds.right + dx))
      : startBounds.right;
    const nextBottom = !top
      ? Math.max(startBounds.top + 0.01, Math.min(1, startBounds.bottom + dy))
      : startBounds.bottom;
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
        const clampedFont = Math.round(
          Math.max(1, Math.min(96, originalFont * fontScale)),
        );
        stroke.fontSize = clampedFont;
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
        if (original.controlX !== undefined && original.controlY !== undefined) {
          const [cx, cy] = remap(original.controlX, original.controlY);
          stroke.controlX = cx;
          stroke.controlY = cy;
        } else if (original.controlX !== undefined) {
          const [cx] = remap(original.controlX, 0);
          stroke.controlX = cx;
        }
        stroke.width = Math.max(
          1,
          Math.round((original.width ?? 4) * fontScale),
        );
      }
    }
    forceRedraw((v) => v + 1);
  };

  const finishGroupResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = resizingGroupRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    resizingGroupRef.current = null;
    const groupId = crypto.randomUUID();
    for (const stroke of selectedGroupStrokes) {
      if (stroke.tool === "text" && stroke.text) {
        const measured = measureTextBox(
          stroke.text,
          stroke.fontFamily ?? "Inter",
          stroke.fontSize ?? 24,
          stroke.fontWeight ?? 400,
        );
        stroke.textBoxWidth = measured.width + 8;
        stroke.textBoxHeight = measured.height;
      }
      commitGroupStroke(
        {
          ...stroke,
          points: [...stroke.points],
          ...(stroke.controlX !== undefined ? { controlX: stroke.controlX } : {}),
          ...(stroke.controlY !== undefined ? { controlY: stroke.controlY } : {}),
        },
        groupId,
      );
    }
  };

  const beginGroupRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!selectedGroupBounds || !surfaceRef.current || size.w <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centerX = (selectedGroupBounds.left + selectedGroupBounds.right) / 2;
    const centerY = (selectedGroupBounds.top + selectedGroupBounds.bottom) / 2;
    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + centerX * size.w;
    const centerClientY = rect.top + centerY * size.h;
    rotatingGroupRef.current = {
      centerX,
      centerY,
      startAngle: Math.atan2(
        event.clientY - centerClientY,
        event.clientX - centerClientX,
      ),
      startStrokes: new Map(
        selectedGroupStrokes.map((s) => [
          s.id,
          {
            ...s,
            points: [...s.points],
            ...(s.controlX !== undefined ? { controlX: s.controlX } : {}),
            ...(s.controlY !== undefined ? { controlY: s.controlY } : {}),
          },
        ]),
      ),
    };
  };

  const transformGroupRotate = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = rotatingGroupRef.current;
    if (!current || !surfaceRef.current || size.w <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = surfaceRef.current.getBoundingClientRect();
    const centerClientX = rect.left + current.centerX * size.w;
    const centerClientY = rect.top + current.centerY * size.h;
    const angle = Math.atan2(
      event.clientY - centerClientY,
      event.clientX - centerClientX,
    );
    const deltaRad = angle - current.startAngle;
    const deltaDeg = (deltaRad * 180) / Math.PI;
    const cos = Math.cos(deltaRad);
    const sin = Math.sin(deltaRad);
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
      if (
        original.tool === "text" ||
        original.tool === "rectangle" ||
        original.tool === "ellipse"
      ) {
        const box = strokeBoundingBox(original);
        const [newCx, newCy] = rotatePoint(
          (box.left + box.right) / 2,
          (box.top + box.bottom) / 2,
        );
        const boxW = box.right - box.left;
        const boxH = box.bottom - box.top;
        stroke.rotation =
          Math.round(((original.rotation ?? 0) + deltaDeg) * 10) / 10;
        if (original.tool === "text") {
          stroke.points = [newCx - boxW / 2, newCy - boxH / 2];
        } else {
          stroke.points = [
            newCx - boxW / 2,
            newCy - boxH / 2,
            newCx + boxW / 2,
            newCy + boxH / 2,
          ];
        }
      } else {
        const nextPoints: number[] = [];
        for (let i = 0; i < original.points.length; i += 2) {
          const [rx, ry] = rotatePoint(
            original.points[i],
            original.points[i + 1],
          );
          nextPoints.push(rx, ry);
        }
        stroke.points = nextPoints;
        if (original.controlX !== undefined && original.controlY !== undefined) {
          const [rcx, rcy] = rotatePoint(
            original.controlX,
            original.controlY,
          );
          stroke.controlX = rcx;
          stroke.controlY = rcy;
        }
      }
    }
    forceRedraw((v) => v + 1);
  };

  const finishGroupRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = rotatingGroupRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    rotatingGroupRef.current = null;
    const groupId = crypto.randomUUID();
    for (const stroke of selectedGroupStrokes) {
      commitGroupStroke(
        {
          ...stroke,
          points: [...stroke.points],
          ...(stroke.rotation !== undefined ? { rotation: stroke.rotation } : {}),
          ...(stroke.controlX !== undefined ? { controlX: stroke.controlX } : {}),
          ...(stroke.controlY !== undefined ? { controlY: stroke.controlY } : {}),
        },
        groupId,
      );
    }
  };

  return {
    selectedGroupIds,
    setSelectedGroupIds,
    selectedGroupStrokes,
    selectedGroupBounds,
    commitGroupStroke,
    deleteSelectedGroup,
    copySelectedGroup,
    pasteSelectedGroup,
    beginGroupResize,
    transformGroupResize,
    finishGroupResize,
    beginGroupRotate,
    transformGroupRotate,
    finishGroupRotate,
  };
}
