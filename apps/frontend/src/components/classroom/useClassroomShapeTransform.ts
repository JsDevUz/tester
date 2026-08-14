import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { CsStroke } from "../../api/classroom";
import { REF_WIDTH } from "./classroomCanvasText";
import { snapRotationAngle } from "./classroomCanvasGeometry";
import { nearestShapeBinding } from "./classroomShapeBindings";

const CONNECTOR_REVEAL_DISTANCE_PX = 44;
const CONNECTOR_SNAP_DISTANCE_PX = 14;

interface UseClassroomShapeTransformParams {
  strokes: CsStroke[];
  pageNumber: number;
  size: { w: number; h: number };
  selectedShape: CsStroke | null;
  selectedShapeRaw: CsStroke | null;
  selectedText: CsStroke | null;
  surfaceRef: React.RefObject<HTMLElement | null>;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  setConnectorTarget: (target: any) => void;
  forceRedraw: React.Dispatch<React.SetStateAction<number>>;
}

export function useClassroomShapeTransform({
  strokes,
  pageNumber,
  size,
  selectedShape,
  selectedShapeRaw,
  selectedText,
  surfaceRef,
  onUpdateShapeStroke,
  onUpdateTextStroke,
  setConnectorTarget,
  forceRedraw,
}: UseClassroomShapeTransformParams) {
  const lineEndpointDragRef = useRef<{
    endpoint: "start" | "end" | "mid";
    startX: number;
    startY: number;
    initPts: number[];
    initControlX?: number;
    initControlY?: number;
    shape?: string;
  } | null>(null);

  const transformingShapeRef = useRef<{
    type: "resize" | "rotate";
    stroke: CsStroke;
    startClientX: number;
    startClientY: number;
    startX0: number;
    startY0: number;
    startX1: number;
    startY1: number;
    corner?: "nw" | "ne" | "sw" | "se";
    centerX?: number;
    centerY?: number;
    startAngle?: number;
    startRotation?: number;
  } | null>(null);

  const transformingTextRef = useRef<{
    type: "resize" | "rotate";
    stroke: CsStroke;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startFontSize: number;
    corner?: "nw" | "ne" | "sw" | "se";
    centerX?: number;
    centerY?: number;
    startAngle?: number;
    startRotation?: number;
  } | null>(null);

  const beginLineEndpointResize = (
    e: ReactPointerEvent,
    endpoint: "start" | "end" | "mid",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedShape || !selectedShapeRaw || !surfaceRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const x0 = selectedShape.points[0];
    const y0 = selectedShape.points[1];
    const x1 = selectedShape.points[2];
    const y1 = selectedShape.points[3];
    const shape = selectedShape.lineShape ?? "straight";
    const initControlX =
      selectedShape.controlX ??
      (shape === "curved" ? (x0 + x1) / 2 : (x0 + x1) / 2);
    const initControlY =
      selectedShape.controlY ??
      (shape === "curved" ? (y0 + y1) / 2 : (y0 + y1) / 2);
    lineEndpointDragRef.current = {
      endpoint,
      startX: (e.clientX - rect.left) / rect.width,
      startY: (e.clientY - rect.top) / rect.height,
      initPts: [...selectedShape.points],
      initControlX,
      initControlY,
      shape,
    };
    selectedShapeRaw.points = [...selectedShape.points];
    if (endpoint === "start") selectedShapeRaw.startBinding = undefined;
    if (endpoint === "end") selectedShapeRaw.endBinding = undefined;
  };

  const transformLineEndpoint = (e: ReactPointerEvent) => {
    if (!lineEndpointDragRef.current || !selectedShapeRaw || !surfaceRef.current)
      return;
    e.preventDefault();
    e.stopPropagation();
    const rect = surfaceRef.current.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / rect.width;
    const curY = (e.clientY - rect.top) / rect.height;
    const dx = curX - lineEndpointDragRef.current.startX;
    const dy = curY - lineEndpointDragRef.current.startY;
    const { endpoint, initPts, initControlX, initControlY, shape } =
      lineEndpointDragRef.current;

    if (endpoint === "start") {
      const nextPts = [...initPts];
      nextPts[0] = Math.max(0, Math.min(1, initPts[0] + dx));
      nextPts[1] = Math.max(0, Math.min(1, initPts[1] + dy));
      selectedShapeRaw.points = nextPts;
    } else if (endpoint === "end") {
      const nextPts = [...initPts];
      nextPts[2] = Math.max(0, Math.min(1, initPts[2] + dx));
      nextPts[3] = Math.max(0, Math.min(1, initPts[3] + dy));
      selectedShapeRaw.points = nextPts;
    } else if (endpoint === "mid") {
      if (shape === "curved") {
        const nextCtrlX = Math.max(
          0,
          Math.min(1, (initControlX ?? 0.5) + dx * 2),
        );
        const nextCtrlY = Math.max(
          0,
          Math.min(1, (initControlY ?? 0.5) + dy * 2),
        );
        selectedShapeRaw.controlX = nextCtrlX;
        selectedShapeRaw.controlY = nextCtrlY;
      } else if (shape === "elbow") {
        const nextCtrlX = Math.max(
          0,
          Math.min(1, (initControlX ?? 0.5) + dx),
        );
        selectedShapeRaw.controlX = nextCtrlX;
      } else {
        const nextPts = [...initPts];
        nextPts[0] = Math.max(0, Math.min(1, initPts[0] + dx));
        nextPts[1] = Math.max(0, Math.min(1, initPts[1] + dy));
        nextPts[2] = Math.max(0, Math.min(1, initPts[2] + dx));
        nextPts[3] = Math.max(0, Math.min(1, initPts[3] + dy));
        selectedShapeRaw.points = nextPts;
      }
    }
    if (endpoint === "start" || endpoint === "end") {
      const offset = endpoint === "start" ? 0 : 2;
      const cursorX = selectedShapeRaw.points[offset];
      const cursorY = selectedShapeRaw.points[offset + 1];
      const nearby = nearestShapeBinding(
        strokes,
        cursorX,
        cursorY,
        size.w,
        size.h,
        selectedShapeRaw.id,
        CONNECTOR_REVEAL_DISTANCE_PX,
      );
      const magnet = nearestShapeBinding(
        strokes,
        cursorX,
        cursorY,
        size.w,
        size.h,
        selectedShapeRaw.id,
        CONNECTOR_SNAP_DISTANCE_PX,
      );
      if (magnet) {
        selectedShapeRaw.points[offset] = magnet.point[0];
        selectedShapeRaw.points[offset + 1] = magnet.point[1];
      }
      setConnectorTarget(
        nearby
          ? {
              shapeId: nearby.binding.strokeId,
              point: magnet?.point ?? nearby.point,
              snapped: Boolean(magnet),
            }
          : null,
      );
    }
    forceRedraw((value) => value + 1);
  };

  const beginShapeResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => {
    if (!selectedShape) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    transformingShapeRef.current = {
      type: "resize",
      stroke: selectedShape,
      corner,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX0: selectedShape.points[0],
      startY0: selectedShape.points[1],
      startX1: selectedShape.points[2],
      startY1: selectedShape.points[3],
    };
  };

  const beginShapeRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!selectedShape || !surfaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const [x0, y0, x1, y1] = selectedShape.points;
    const centerX = rect.left + ((x0 + x1) / 2) * size.w;
    const centerY = rect.top + ((y0 + y1) / 2) * size.h;
    transformingShapeRef.current = {
      type: "rotate",
      stroke: selectedShape,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX0: x0,
      startY0: y0,
      startX1: x1,
      startY1: y1,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: selectedShape.rotation ?? 0,
    };
  };

  const transformShape = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = transformingShapeRef.current;
    if (!current || size.w <= 0 || size.h <= 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (current.type === "rotate") {
      const angle = Math.atan2(
        event.clientY - (current.centerY ?? 0),
        event.clientX - (current.centerX ?? 0),
      );
      const rawDeg =
        (current.startRotation ?? 0) +
        ((angle - (current.startAngle ?? 0)) * 180) / Math.PI;
      current.stroke.rotation = snapRotationAngle(rawDeg);
      onUpdateShapeStroke?.(pageNumber, {
        ...current.stroke,
        points: [...current.stroke.points],
      });
      forceRedraw((value) => value + 1);
      return;
    }

    const rad = ((current.stroke.rotation ?? 0) * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const dxScreen = (event.clientX - current.startClientX) / size.w;
    const dyScreen = (event.clientY - current.startClientY) / size.h;

    let dxLocal = dxScreen * cosR + dyScreen * sinR;
    let dyLocal = -dxScreen * sinR + dyScreen * cosR;

    const startW = Math.abs(current.startX1 - current.startX0);
    const startH = Math.abs(current.startY1 - current.startY0);
    const startCx = (current.startX0 + current.startX1) / 2;
    const startCy = (current.startY0 + current.startY1) / 2;

    const left = current.corner?.includes("w") ?? false;
    const top = current.corner?.includes("n") ?? false;

    if (event.shiftKey) {
      const dxPx = dxLocal * size.w;
      const dyPx = dyLocal * size.h;
      const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
      dxLocal = ((Math.sign(dxPx) || 1) * side) / size.w;
      dyLocal = ((Math.sign(dyPx) || 1) * side) / size.h;
    }

    let deltaW = left ? -dxLocal : dxLocal;
    let deltaH = top ? -dyLocal : dyLocal;

    const newW = Math.max(0.005, startW + deltaW);
    const newH = Math.max(0.005, startH + deltaH);

    deltaW = newW - startW;
    deltaH = newH - startH;

    const localShiftX = (left ? -deltaW : deltaW) / 2;
    const localShiftY = (top ? -deltaH : deltaH) / 2;

    const worldShiftX = localShiftX * cosR - localShiftY * sinR;
    const worldShiftY = localShiftX * sinR + localShiftY * cosR;

    const newCx = startCx + worldShiftX;
    const newCy = startCy + worldShiftY;

    const nextX0 = newCx - newW / 2;
    const nextY0 = newCy - newH / 2;
    const nextX1 = newCx + newW / 2;
    const nextY1 = newCy + newH / 2;

    current.stroke.points = [nextX0, nextY0, nextX1, nextY1];
    forceRedraw((value) => value + 1);
  };

  const finishShapeTransform = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const current = transformingShapeRef.current;
    if (current) {
      transformingShapeRef.current = null;
      onUpdateShapeStroke?.(pageNumber, {
        ...current.stroke,
        points: [...current.stroke.points],
      });
    }

    const epCurrent = lineEndpointDragRef.current;
    setConnectorTarget(null);
    if (epCurrent && selectedShapeRaw) {
      lineEndpointDragRef.current = null;
      let next = { ...selectedShapeRaw, points: [...selectedShapeRaw.points] };
      if (epCurrent.endpoint === "start" || epCurrent.endpoint === "end") {
        const offset = epCurrent.endpoint === "start" ? 0 : 2;
        const snap = nearestShapeBinding(
          strokes,
          next.points[offset],
          next.points[offset + 1],
          size.w,
          size.h,
          next.id,
          CONNECTOR_SNAP_DISTANCE_PX,
        );
        if (snap) {
          next.points[offset] = snap.point[0];
          next.points[offset + 1] = snap.point[1];
          next =
            epCurrent.endpoint === "start"
              ? { ...next, startBinding: snap.binding }
              : { ...next, endBinding: snap.binding };
          next.controlX = undefined;
          next.controlY = undefined;
          next.width = 2;
          next.lineShape = "curved";
          next.startArrowHead = "none";
          next.endArrowHead = "arrow";
        }
      }
      onUpdateShapeStroke?.(pageNumber, next);
    } else {
      lineEndpointDragRef.current = null;
    }
  };

  const beginTextResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: "nw" | "ne" | "sw" | "se",
  ) => {
    if (!selectedText) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    transformingTextRef.current = {
      type: "resize",
      stroke: selectedText,
      corner,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: selectedText.points[0],
      startY: selectedText.points[1],
      startWidth: selectedText.textBoxWidth ?? 320,
      startHeight: selectedText.textBoxHeight ?? 120,
      startFontSize: selectedText.fontSize ?? 24,
    };
  };

  const beginTextRotate = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!selectedText || !surfaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const boxWidth =
      (selectedText.textBoxWidth ?? 320) * (size.w / REF_WIDTH);
    const boxHeight =
      (selectedText.textBoxHeight ?? 120) * (size.w / REF_WIDTH);
    const centerX = rect.left + selectedText.points[0] * size.w + boxWidth / 2;
    const centerY = rect.top + selectedText.points[1] * size.h + boxHeight / 2;
    transformingTextRef.current = {
      type: "rotate",
      stroke: selectedText,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: selectedText.points[0],
      startY: selectedText.points[1],
      startWidth: selectedText.textBoxWidth ?? 320,
      startHeight: selectedText.textBoxHeight ?? 120,
      startFontSize: selectedText.fontSize ?? 24,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: selectedText.rotation ?? 0,
    };
  };

  const transformText = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = transformingTextRef.current;
    if (!current || size.w <= 0 || size.h <= 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (current.type === "rotate") {
      const angle = Math.atan2(
        event.clientY - (current.centerY ?? 0),
        event.clientX - (current.centerX ?? 0),
      );
      const rawDeg =
        (current.startRotation ?? 0) +
        ((angle - (current.startAngle ?? 0)) * 180) / Math.PI;
      current.stroke.rotation = snapRotationAngle(rawDeg);
      forceRedraw((value) => value + 1);
      return;
    }

    const rad = ((current.stroke.rotation ?? 0) * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const dxScreen =
      ((event.clientX - current.startClientX) / size.w) * REF_WIDTH;
    const dyScreen =
      ((event.clientY - current.startClientY) / size.h) * REF_WIDTH;

    const dxLocal = dxScreen * cosR + dyScreen * sinR;
    const dyLocal = -dxScreen * sinR + dyScreen * cosR;

    const left = current.corner?.includes("w") ?? false;
    const top = current.corner?.includes("n") ?? false;

    const rawDx = left ? -dxLocal : dxLocal;
    const rawDy = top ? -dyLocal : dyLocal;

    const startDiagonal =
      Math.hypot(current.startWidth, current.startHeight) || 1;
    const projected =
      (current.startWidth * rawDx + current.startHeight * rawDy) /
      startDiagonal;

    const minScale = Math.max(
      1 / current.startFontSize,
      2 / current.startWidth,
      1.2 / current.startHeight,
    );
    const requestedScale = Math.max(minScale, 1 + projected / startDiagonal);
    const maxScale = Math.max(
      minScale,
      Math.min(
        1000 / current.startWidth,
        2000 / current.startHeight,
        96 / current.startFontSize,
      ),
    );
    const scale = Math.min(maxScale, Math.max(minScale, requestedScale));
    const nextWidth = Math.min(1000, current.startWidth * scale);
    const nextHeight = Math.min(2000, current.startHeight * scale);

    current.stroke.textBoxWidth = nextWidth;
    current.stroke.textBoxHeight = nextHeight;
    current.stroke.fontSize = Math.round(
      Math.max(1, Math.min(96, current.startFontSize * scale)),
    );

    const startW = current.startWidth / REF_WIDTH;
    const startH = (current.startHeight / REF_WIDTH) * (size.w / size.h);
    const nextW = nextWidth / REF_WIDTH;
    const nextH = (nextHeight / REF_WIDTH) * (size.w / size.h);

    const startCx = current.startX + startW / 2;
    const startCy = current.startY + startH / 2;

    const deltaW = nextW - startW;
    const deltaH = nextH - startH;

    const localShiftX = (left ? -deltaW : deltaW) / 2;
    const localShiftY = (top ? -deltaH : deltaH) / 2;

    const worldShiftX = localShiftX * cosR - localShiftY * sinR;
    const worldShiftY = localShiftX * sinR + localShiftY * cosR;

    const newCx = startCx + worldShiftX;
    const newCy = startCy + worldShiftY;

    current.stroke.points[0] = Math.max(0, Math.min(1, newCx - nextW / 2));
    current.stroke.points[1] = Math.max(0, Math.min(1, newCy - nextH / 2));

    forceRedraw((value) => value + 1);
  };

  const finishTextTransform = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const current = transformingTextRef.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    transformingTextRef.current = null;
    onUpdateTextStroke?.(pageNumber, {
      ...current.stroke,
      points: [...current.stroke.points],
    });
  };

  return {
    lineEndpointDragRef,
    transformingShapeRef,
    transformingTextRef,
    beginLineEndpointResize,
    transformLineEndpoint,
    beginShapeResize,
    beginShapeRotate,
    transformShape,
    finishShapeTransform,
    beginTextResize,
    beginTextRotate,
    transformText,
    finishTextTransform,
  };
}
