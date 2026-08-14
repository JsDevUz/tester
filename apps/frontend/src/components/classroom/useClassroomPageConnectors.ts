import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CsStroke } from "../../api/classroom";
import type { ShapeStyle } from "./classroomCanvasText";
import {
  getGhostShapeBounds,
  nearestShapeBinding,
  shapeAnchor,
} from "./classroomShapeBindings";

const CONNECTOR_REVEAL_DISTANCE_PX = 44;
const CONNECTOR_SNAP_DISTANCE_PX = 14;

interface UseClassroomPageConnectorsParams {
  strokes: CsStroke[];
  pageNumber: number;
  size: { w: number; h: number };
  color: string;
  strokeWidth: number;
  shapeStyle: ShapeStyle;
  notebook: boolean;
  surfaceRef: React.RefObject<HTMLElement | null>;
  draggingShapeRef: React.RefObject<any>;
  transformingShapeRef: React.RefObject<any>;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  setSelectedTextId: (id: string | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  setEditingTextId: (id: string | null) => void;
  setTextEditor: React.Dispatch<React.SetStateAction<any>>;
  claimSelection: (key: string) => void;
  forceRedraw: React.Dispatch<React.SetStateAction<number>>;
}

export function useClassroomPageConnectors({
  strokes,
  pageNumber,
  size,
  color,
  strokeWidth,
  shapeStyle,
  notebook,
  surfaceRef,
  draggingShapeRef,
  transformingShapeRef,
  onStrokeComplete,
  onUpdateShapeStroke,
  setSelectedTextId,
  setSelectedShapeId,
  setEditingTextId,
  setTextEditor,
  claimSelection,
  forceRedraw,
}: UseClassroomPageConnectorsParams) {
  const connectorDraftRef = useRef<{
    points: number[];
    startBinding: NonNullable<CsStroke["startBinding"]>;
    startClientX: number;
    startClientY: number;
    sourceStroke: CsStroke;
  } | null>(null);

  const [connectorHover, setConnectorHover] = useState<{
    stroke: CsStroke;
    side: "top" | "right" | "bottom" | "left";
  } | null>(null);

  const [connectorTarget, setConnectorTarget] = useState<{
    shapeId: string;
    point: [number, number];
    snapped: boolean;
  } | null>(null);

  const [connectorShapePicker, setConnectorShapePicker] = useState<{
    connectorId: string;
    batchGroupId: string;
    dropX: number;
    dropY: number;
    screenX: number;
    screenY: number;
    sourceStroke?: CsStroke;
  } | null>(null);

  const pickConnectorShape = (chosenTool: "rectangle" | "ellipse" | "text") => {
    if (!connectorShapePicker) return;
    const { connectorId, batchGroupId, dropX, dropY, sourceStroke } =
      connectorShapePicker;
    setConnectorShapePicker(null);

    let defaultW = 0.16;
    let defaultH = 0.09 * (size.w / Math.max(size.h, 1));
    if (sourceStroke) {
      if (sourceStroke.tool === "rectangle" || sourceStroke.tool === "ellipse") {
        defaultW = Math.abs(sourceStroke.points[2] - sourceStroke.points[0]);
        defaultH = Math.abs(sourceStroke.points[3] - sourceStroke.points[1]);
      }
    }
    defaultW = Math.max(0.06, Math.min(0.5, defaultW));
    defaultH = Math.max(0.04, Math.min(0.4, defaultH));

    const minX = Math.max(0.01, Math.min(0.99 - defaultW, dropX - defaultW / 2));
    const minY = Math.max(0.01, Math.min(0.99 - defaultH, dropY - defaultH / 2));
    const maxX = minX + defaultW;
    const maxY = minY + defaultH;

    const newShapeId = crypto.randomUUID();
    let newStroke: CsStroke;

    if (chosenTool === "text") {
      newStroke = {
        id: newShapeId,
        tool: "text",
        text: "Matn",
        color: sourceStroke?.color ?? color,
        width: 2,
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: 400,
        textAlign: "left",
        points: [minX, minY],
        textBoxWidth: 160,
        textBoxHeight: 48,
      };
    } else {
      newStroke = {
        id: newShapeId,
        tool: chosenTool,
        color: sourceStroke?.color ?? color,
        width: sourceStroke?.width ?? strokeWidth,
        ...shapeStyle,
        ...(sourceStroke &&
        (sourceStroke.tool === "rectangle" || sourceStroke.tool === "ellipse")
          ? {
              backgroundColor: sourceStroke.backgroundColor,
              fillStyle: sourceStroke.fillStyle,
              strokeStyle: sourceStroke.strokeStyle,
              edges: sourceStroke.edges,
              opacity: sourceStroke.opacity,
            }
          : {}),
        points: [minX, minY, maxX, maxY],
      };
    }

    const currentConnector = strokes.find((s) => s.id === connectorId);
    const startX = currentConnector ? currentConnector.points[0] : dropX;
    const startY = currentConnector ? currentConnector.points[1] : dropY;
    const dx = dropX - startX;
    const dy = (dropY - startY) * (size.h / Math.max(size.w, 1));
    let targetSide: NonNullable<CsStroke["startBinding"]>["side"] = "left";
    if (Math.abs(dx) > Math.abs(dy)) {
      targetSide = dx > 0 ? "left" : "right";
    } else {
      targetSide = dy > 0 ? "top" : "bottom";
    }

    onStrokeComplete?.(pageNumber, newStroke, batchGroupId);

    if (currentConnector) {
      onUpdateShapeStroke?.(
        pageNumber,
        {
          ...currentConnector,
          endBinding: { strokeId: newShapeId, side: targetSide },
        },
        batchGroupId,
      );
    }

    if (chosenTool === "text") {
      setSelectedTextId(newShapeId);
      setSelectedShapeId(null);
      setEditingTextId(newShapeId);
      setTextEditor({
        x: minX,
        y: minY,
        text: "",
        color: sourceStroke?.color ?? color,
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: 400,
        textAlign: "left",
        textBoxWidth: 160,
        textBoxHeight: 48,
      });
    } else {
      setSelectedTextId(null);
      setSelectedShapeId(newShapeId);
    }
    claimSelection(
      `${notebook ? "nb" : "pdf"}-${pageNumber}-${chosenTool === "text" ? "text" : "shape"}-${newShapeId}`,
    );
    forceRedraw((v) => v + 1);
  };

  const beginConnectorFromStroke = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: CsStroke,
    side: NonNullable<CsStroke["startBinding"]>["side"],
  ) => {
    if (
      source.tool !== "rectangle" &&
      source.tool !== "ellipse" &&
      source.tool !== "text"
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setConnectorHover(null);
    setConnectorShapePicker(null);
    if (draggingShapeRef.current) draggingShapeRef.current = null;
    if (transformingShapeRef.current) transformingShapeRef.current = null;
    const [x, y] = shapeAnchor(source, side, 0.5, size.w, size.h);
    connectorDraftRef.current = {
      points: [x, y, x, y],
      startBinding: { strokeId: source.id, side },
      startClientX: event.clientX,
      startClientY: event.clientY,
      sourceStroke: source,
    };
    setConnectorTarget(null);
    forceRedraw((value) => value + 1);
  };

  const moveConnectorFromShape = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const draft = connectorDraftRef.current;
    if (!draft || !surfaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = surfaceRef.current.getBoundingClientRect();
    const cursorX = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const cursorY = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );
    const nearby = nearestShapeBinding(
      strokes,
      cursorX,
      cursorY,
      size.w,
      size.h,
      draft.startBinding.strokeId,
      CONNECTOR_REVEAL_DISTANCE_PX,
    );
    const magnet = nearestShapeBinding(
      strokes,
      cursorX,
      cursorY,
      size.w,
      size.h,
      draft.startBinding.strokeId,
      CONNECTOR_SNAP_DISTANCE_PX,
    );
    draft.points[2] = magnet?.point[0] ?? cursorX;
    draft.points[3] = magnet?.point[1] ?? cursorY;
    setConnectorTarget(
      nearby
        ? {
            shapeId: nearby.binding.strokeId,
            point: magnet?.point ?? nearby.point,
            snapped: Boolean(magnet),
          }
        : null,
    );
    forceRedraw((value) => value + 1);
  };

  const finishConnectorFromShape = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const draft = connectorDraftRef.current;
    if (!draft) return;
    event.preventDefault();
    event.stopPropagation();
    connectorDraftRef.current = null;
    setConnectorTarget(null);
    setConnectorHover(null);

    const dragDistance = Math.hypot(
      event.clientX - draft.startClientX,
      event.clientY - draft.startClientY,
    );
    const isDrag = dragDistance > 8;

    if (!isDrag) {
      const batchGroupId = crypto.randomUUID();
      const ghost = getGhostShapeBounds(
        draft.sourceStroke,
        draft.startBinding.side,
        size,
      );
      const newShapeId = crypto.randomUUID();
      const connectorId = crypto.randomUUID();
      const oppositeSide: NonNullable<CsStroke["startBinding"]>["side"] =
        draft.startBinding.side === "left"
          ? "right"
          : draft.startBinding.side === "right"
            ? "left"
            : draft.startBinding.side === "top"
              ? "bottom"
              : "top";

      const newShape: CsStroke = {
        id: newShapeId,
        tool: "rectangle",
        color: draft.sourceStroke.color ?? color,
        width: draft.sourceStroke.width ?? strokeWidth,
        ...shapeStyle,
        ...(draft.sourceStroke.tool === "rectangle" ||
        draft.sourceStroke.tool === "ellipse"
          ? {
              backgroundColor: draft.sourceStroke.backgroundColor,
              fillStyle: draft.sourceStroke.fillStyle,
              strokeStyle: draft.sourceStroke.strokeStyle,
              edges: draft.sourceStroke.edges,
              opacity: draft.sourceStroke.opacity,
              width: draft.sourceStroke.width,
            }
          : {}),
        points: [ghost.minX, ghost.minY, ghost.maxX, ghost.maxY],
      };

      const [anchorStartX, anchorStartY] = shapeAnchor(
        draft.sourceStroke,
        draft.startBinding.side,
        0.5,
        size.w,
        size.h,
      );
      const [anchorEndX, anchorEndY] = shapeAnchor(
        newShape,
        oppositeSide,
        0.5,
        size.w,
        size.h,
      );

      const connector: CsStroke = {
        id: connectorId,
        tool: "arrow",
        color: draft.sourceStroke.color ?? color,
        ...shapeStyle,
        points: [anchorStartX, anchorStartY, anchorEndX, anchorEndY],
        lineShape: "curved",
        startArrowHead: "none",
        endArrowHead: "arrow",
        startBinding: {
          strokeId: draft.sourceStroke.id,
          side: draft.startBinding.side,
        },
        endBinding: { strokeId: newShapeId, side: oppositeSide },
        width: 2,
      };

      onStrokeComplete?.(pageNumber, newShape, batchGroupId);
      onStrokeComplete?.(pageNumber, connector, batchGroupId);

      setSelectedTextId(null);
      setSelectedShapeId(newShapeId);
      claimSelection(
        `${notebook ? "nb" : "pdf"}-${pageNumber}-shape-${newShapeId}`,
      );
      forceRedraw((value) => value + 1);
      return;
    }

    const endSnap = nearestShapeBinding(
      strokes,
      draft.points[2],
      draft.points[3],
      size.w,
      size.h,
      draft.startBinding.strokeId,
      CONNECTOR_SNAP_DISTANCE_PX,
    );
    if (endSnap) [draft.points[2], draft.points[3]] = endSnap.point;

    if (endSnap) {
      const connectorId = crypto.randomUUID();
      onStrokeComplete?.(pageNumber, {
        id: connectorId,
        tool: "arrow",
        color,
        ...shapeStyle,
        points: [...draft.points],
        lineShape: "curved",
        startArrowHead: "none",
        endArrowHead: "arrow",
        startBinding: { ...draft.startBinding },
        endBinding: { ...endSnap.binding },
        width: 2,
      });
      setSelectedTextId(null);
      setSelectedShapeId(connectorId);
      claimSelection(
        `${notebook ? "nb" : "pdf"}-${pageNumber}-shape-${connectorId}`,
      );
    } else {
      const batchGroupId = crypto.randomUUID();
      const connectorId = crypto.randomUUID();
      onStrokeComplete?.(
        pageNumber,
        {
          id: connectorId,
          tool: "arrow",
          color,
          ...shapeStyle,
          points: [...draft.points],
          lineShape: "curved",
          startArrowHead: "none",
          endArrowHead: "arrow",
          startBinding: { ...draft.startBinding },
          width: 2,
        },
        batchGroupId,
      );
      setSelectedTextId(null);
      setSelectedShapeId(connectorId);
      claimSelection(
        `${notebook ? "nb" : "pdf"}-${pageNumber}-shape-${connectorId}`,
      );

      setConnectorShapePicker({
        connectorId,
        batchGroupId,
        dropX: draft.points[2],
        dropY: draft.points[3],
        screenX: event.clientX,
        screenY: event.clientY,
        sourceStroke: draft.sourceStroke,
      });
    }
  };

  return {
    connectorDraftRef,
    connectorHover,
    setConnectorHover,
    connectorTarget,
    setConnectorTarget,
    connectorShapePicker,
    setConnectorShapePicker,
    pickConnectorShape,
    beginConnectorFromStroke,
    moveConnectorFromShape,
    finishConnectorFromShape,
  };
}
