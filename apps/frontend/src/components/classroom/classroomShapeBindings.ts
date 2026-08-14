import type { CsShapeBinding, CsStroke } from "../../api/classroom";
import { REF_WIDTH } from "./classroomCanvasText";

export function getGhostShapeBounds(
  source: CsStroke,
  side: "top" | "right" | "bottom" | "left",
  size: { w: number; h: number },
) {
  let minX: number, maxX: number, minY: number, maxY: number, w: number, h: number;
  if (source.tool === "text") {
    minX = source.points[0];
    minY = source.points[1];
    w = (source.textBoxWidth ?? 320) / REF_WIDTH;
    h = ((source.textBoxHeight ?? 120) * (size.w / REF_WIDTH)) / Math.max(size.h, 1);
    maxX = minX + w;
    maxY = minY + h;
  } else {
    minX = Math.min(source.points[0], source.points[2]);
    maxX = Math.max(source.points[0], source.points[2]);
    minY = Math.min(source.points[1], source.points[3]);
    maxY = Math.max(source.points[1], source.points[3]);
    w = maxX - minX;
    h = maxY - minY;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const gapX = Math.max(0.04, 60 / Math.max(size.w, 1));
  const gapY = Math.max(0.04, 60 / Math.max(size.h, 1));

  let newMinX = minX;
  let newMinY = minY;

  if (side === "right") {
    newMinX = maxX + gapX;
    newMinY = cy - h / 2;
  } else if (side === "left") {
    newMinX = minX - gapX - w;
    newMinY = cy - h / 2;
  } else if (side === "bottom") {
    newMinX = cx - w / 2;
    newMinY = maxY + gapY;
  } else if (side === "top") {
    newMinX = cx - w / 2;
    newMinY = minY - gapY - h;
  }

  const boundedMinX = Math.max(0.01, Math.min(0.99 - w, newMinX));
  const boundedMinY = Math.max(0.01, Math.min(0.99 - h, newMinY));
  const boundedMaxX = boundedMinX + w;
  const boundedMaxY = boundedMinY + h;

  return {
    minX: boundedMinX,
    minY: boundedMinY,
    maxX: boundedMaxX,
    maxY: boundedMaxY,
    width: w,
    height: h,
    rotation: source.rotation ?? 0,
    tool: source.tool === "ellipse" ? "ellipse" : "rectangle",
  };
}

export function connectorCurvePoint(
  stroke: CsStroke,
  t: number,
  width: number,
  height: number,
): [number, number] {
  const [x0, y0, x1, y1] = stroke.points;
  const u = 1 - t;
  if (
    stroke.lineShape === "curved" &&
    (stroke.startBinding || stroke.endBinding) &&
    stroke.controlX === undefined &&
    stroke.controlY === undefined
  ) {
    const sx = x0 * width;
    const sy = y0 * height;
    const ex = x1 * width;
    const ey = y1 * height;
    const distance = Math.hypot(ex - sx, ey - sy);
    const vector = (
      side: CsShapeBinding["side"] | undefined,
      fallbackX: number,
      fallbackY: number,
    ): [number, number] =>
      side === "left"
        ? [-1, 0]
        : side === "right"
          ? [1, 0]
          : side === "top"
            ? [0, -1]
            : side === "bottom"
              ? [0, 1]
              : [fallbackX, fallbackY];
    const handle = Math.max(
      28 * (width / REF_WIDTH),
      Math.min(distance * 0.42, 180 * (width / REF_WIDTH)),
    );
    const safeDistance = Math.max(distance, 1);
    const [svx, svy] =
      stroke.startBindingVector ??
      vector(
        stroke.startBinding?.side,
        (ex - sx) / safeDistance,
        (ey - sy) / safeDistance,
      );
    const [evx, evy] =
      stroke.endBindingVector ??
      vector(
        stroke.endBinding?.side,
        (sx - ex) / safeDistance,
        (sy - ey) / safeDistance,
      );
    const cp1x = sx + svx * handle;
    const cp1y = sy + svy * handle;
    const cp2x = ex + evx * handle;
    const cp2y = ey + evy * handle;
    const x =
      u * u * u * sx +
      3 * u * u * t * cp1x +
      3 * u * t * t * cp2x +
      t * t * t * ex;
    const y =
      u * u * u * sy +
      3 * u * u * t * cp1y +
      3 * u * t * t * cp2y +
      t * t * t * ey;
    return [x / width, y / height];
  }
  const ctrlX = stroke.controlX ?? (x0 + x1) / 2;
  const ctrlY = stroke.controlY ?? (y0 + y1) / 2;
  return [
    u * u * x0 + 2 * u * t * ctrlX + t * t * x1,
    u * u * y0 + 2 * u * t * ctrlY + t * t * y1,
  ];
}

export function shapeAnchor(
  shape: CsStroke,
  side: CsShapeBinding["side"],
  position = 0.5,
  width = REF_WIDTH,
  height = REF_WIDTH,
): [number, number] {
  const left =
    shape.tool === "text"
      ? shape.points[0]
      : Math.min(shape.points[0], shape.points[2]);
  const right =
    shape.tool === "text"
      ? left + (shape.textBoxWidth ?? 320) / REF_WIDTH
      : Math.max(shape.points[0], shape.points[2]);
  const top =
    shape.tool === "text"
      ? shape.points[1]
      : Math.min(shape.points[1], shape.points[3]);
  const bottom =
    shape.tool === "text"
      ? top +
        ((shape.textBoxHeight ?? 120) * (width / REF_WIDTH)) /
          Math.max(height, 1)
      : Math.max(shape.points[1], shape.points[3]);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const t = Math.max(0, Math.min(1, position));
  let x: number;
  let y: number;
  if (shape.tool === "ellipse") {
    const baseAngle =
      side === "right"
        ? 0
        : side === "bottom"
          ? Math.PI / 2
          : side === "left"
            ? Math.PI
            : (3 * Math.PI) / 2;
    const offset = (t - 0.5) * Math.PI;
    const angle = baseAngle + offset;
    x = cx + (Math.cos(angle) * (right - left)) / 2;
    y = cy + (Math.sin(angle) * (bottom - top)) / 2;
  } else {
    x = side === "left" ? left : side === "right" ? right : left + (right - left) * t;
    y = side === "top" ? top : side === "bottom" ? bottom : top + (bottom - top) * t;
  }
  const angle = ((shape.rotation ?? 0) * Math.PI) / 180;
  if (angle) {
    // Ekranda piksellar bo'yicha haqiqiy Euclidean aylantirish:
    const dx = (x - cx) * width;
    const dy = (y - cy) * height;
    const rdx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const rdy = dx * Math.sin(angle) + dy * Math.cos(angle);
    x = cx + rdx / width;
    y = cy + rdy / height;
  }
  return [x, y];
}

export function shapeBindingVector(
  shape: CsStroke,
  side: CsShapeBinding["side"],
  position = 0.5,
  width = REF_WIDTH,
  height = REF_WIDTH,
): [number, number] {
  let ux = 0;
  let uy = 0;

  if (shape.tool === "ellipse") {
    const baseAngle =
      side === "right"
        ? 0
        : side === "bottom"
          ? Math.PI / 2
          : side === "left"
            ? Math.PI
            : (3 * Math.PI) / 2;
    const offset = (Math.max(0, Math.min(1, position)) - 0.5) * Math.PI;
    const angle = baseAngle + offset;
    const left = Math.min(shape.points[0], shape.points[2]);
    const right = Math.max(shape.points[0], shape.points[2]);
    const top = Math.min(shape.points[1], shape.points[3]);
    const bottom = Math.max(shape.points[1], shape.points[3]);
    const a = Math.max(((right - left) * width) / 2, 1e-4);
    const b = Math.max(((bottom - top) * height) / 2, 1e-4);
    const nx = Math.cos(angle) / a;
    const ny = Math.sin(angle) / b;
    const len = Math.hypot(nx, ny) || 1;
    ux = nx / len;
    uy = ny / len;
  } else {
    if (side === "left") {
      ux = -1;
      uy = 0;
    } else if (side === "right") {
      ux = 1;
      uy = 0;
    } else if (side === "top") {
      ux = 0;
      uy = -1;
    } else if (side === "bottom") {
      ux = 0;
      uy = 1;
    }
  }

  const angle = ((shape.rotation ?? 0) * Math.PI) / 180;
  if (angle) {
    const rx = ux * Math.cos(angle) - uy * Math.sin(angle);
    const ry = ux * Math.sin(angle) + uy * Math.cos(angle);
    return [rx, ry];
  }
  return [ux, uy];
}

export function resolveConnector(
  stroke: CsStroke,
  strokes: CsStroke[],
  width = REF_WIDTH,
  height = REF_WIDTH,
): CsStroke {
  if (stroke.tool !== "line" && stroke.tool !== "arrow") return stroke;
  const points = [...stroke.points];
  let startVector: [number, number] | undefined = stroke.startBindingVector;
  let endVector: [number, number] | undefined = stroke.endBindingVector;

  if (stroke.startBinding) {
    const shape = strokes.find(
      (item) =>
        item.id === stroke.startBinding?.strokeId &&
        (item.tool === "rectangle" ||
          item.tool === "ellipse" ||
          item.tool === "text"),
    );
    if (shape) {
      [points[0], points[1]] = shapeAnchor(
        shape,
        stroke.startBinding.side,
        stroke.startBinding.position,
        width,
        height,
      );
      startVector = shapeBindingVector(
        shape,
        stroke.startBinding.side,
        stroke.startBinding.position,
        width,
        height,
      );
    }
  }

  if (stroke.endBinding) {
    const shape = strokes.find(
      (item) =>
        item.id === stroke.endBinding?.strokeId &&
        (item.tool === "rectangle" ||
          item.tool === "ellipse" ||
          item.tool === "text"),
    );
    if (shape) {
      [points[2], points[3]] = shapeAnchor(
        shape,
        stroke.endBinding.side,
        stroke.endBinding.position,
        width,
        height,
      );
      endVector = shapeBindingVector(
        shape,
        stroke.endBinding.side,
        stroke.endBinding.position,
        width,
        height,
      );
    }
  }

  return {
    ...stroke,
    points,
    startBindingVector: startVector,
    endBindingVector: endVector,
  };
}

export function nearestShapeBinding(
  strokes: CsStroke[],
  x: number,
  y: number,
  width: number,
  height: number,
  excludeId?: string,
  maxDistance = 24,
): { binding: CsShapeBinding; point: [number, number] } | null {
  let closest: {
    binding: CsShapeBinding;
    point: [number, number];
    distance: number;
  } | null = null;
  for (const shape of strokes) {
    if (
      shape.id === excludeId ||
      (shape.tool !== "rectangle" &&
        shape.tool !== "ellipse" &&
        shape.tool !== "text")
    )
      continue;
    const left =
      shape.tool === "text"
        ? shape.points[0]
        : Math.min(shape.points[0], shape.points[2]);
    const right =
      shape.tool === "text"
        ? left + (shape.textBoxWidth ?? 320) / REF_WIDTH
        : Math.max(shape.points[0], shape.points[2]);
    const top =
      shape.tool === "text"
        ? shape.points[1]
        : Math.min(shape.points[1], shape.points[3]);
    const bottom =
      shape.tool === "text"
        ? top +
          ((shape.textBoxHeight ?? 120) * (width / REF_WIDTH)) /
            Math.max(height, 1)
        : Math.max(shape.points[1], shape.points[3]);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rotation = -((shape.rotation ?? 0) * Math.PI) / 180;
    const dx = (x - cx) * width;
    const dy = (y - cy) * height;
    const localDx = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const localDy = dx * Math.sin(rotation) + dy * Math.cos(rotation);
    const localX = cx + localDx / width;
    const localY = cy + localDy / height;
    const candidates: Array<{
      side: CsShapeBinding["side"];
      position: number;
    }> = [];
    if (shape.tool === "ellipse") {
      const angle = Math.atan2(
        (localY - cy) / Math.max((bottom - top) / 2, 1e-6),
        (localX - cx) / Math.max((right - left) / 2, 1e-6),
      );
      const position =
        ((angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) /
        (Math.PI * 2);
      const side: CsShapeBinding["side"] =
        Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
          ? Math.cos(angle) >= 0
            ? "right"
            : "left"
          : Math.sin(angle) >= 0
            ? "bottom"
            : "top";
      candidates.push({ side, position });
    } else {
      candidates.push(
        {
          side: "top",
          position: (localX - left) / Math.max(right - left, 1e-6),
        },
        {
          side: "right",
          position: (localY - top) / Math.max(bottom - top, 1e-6),
        },
        {
          side: "bottom",
          position: (localX - left) / Math.max(right - left, 1e-6),
        },
        {
          side: "left",
          position: (localY - top) / Math.max(bottom - top, 1e-6),
        },
      );
    }
    for (const { side, position: rawPosition } of candidates) {
      const position = Math.max(0, Math.min(1, rawPosition));
      const point = shapeAnchor(shape, side, position, width, height);
      const distance = Math.hypot(
        (point[0] - x) * width,
        (point[1] - y) * height,
      );
      if (
        distance <= maxDistance &&
        (!closest || distance < closest.distance)
      ) {
        closest = {
          binding: { strokeId: shape.id, side, position },
          point,
          distance,
        };
      }
    }
  }
  return closest ? { binding: closest.binding, point: closest.point } : null;
}
