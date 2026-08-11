// Hit-testing va geometriya: stroke/shakl ustiga bosilganini aniqlash,
// o'chirgich radiusi, bounding box, lasso tanlash. Sof funksiyalar —
// React holatiga bog'liq emas.
import type { CsStroke } from "../../api/classroom";
import { REF_WIDTH } from "./classroomCanvasText";

const ERASE_HIT_BASE = 0.0025;
export function eraseHitRadius(strokeWidth: number): number {
  return ERASE_HIT_BASE + (strokeWidth / REF_WIDTH) * 1;
}

function distToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x0 + t * dx;
  const cy = y0 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// To'rtburchak/doira uchun: chegara yaqinida (border) yoki fon rangi
// bo'lsa ichida ham "tegdi" deb hisoblanadi — Excalidraw'da shaklning
// to'ldirilgan ichi ham bosilganda tanlanadi/o'chadi, faqat chegarasi emas.
function hitTestShape(
  stroke: CsStroke,
  x: number,
  y: number,
  hitRadius: number,
  includeInterior = false,
): boolean {
  const [x0, y0, x1, y1] = stroke.points;
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  let localX = x;
  let localY = y;
  if (stroke.rotation) {
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const angle = (-stroke.rotation * Math.PI) / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    localX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
    localY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  const hasFill =
    Boolean(stroke.backgroundColor) && stroke.backgroundColor !== "transparent";
  if (hasFill || includeInterior) {
    if (stroke.tool === "ellipse") {
      const radiusX = Math.max((right - left) / 2, hitRadius);
      const radiusY = Math.max((bottom - top) / 2, hitRadius);
      const nx = (localX - (left + right) / 2) / (radiusX + hitRadius);
      const ny = (localY - (top + bottom) / 2) / (radiusY + hitRadius);
      return nx * nx + ny * ny <= 1;
    }
    return (
      localX >= left - hitRadius &&
      localX <= right + hitRadius &&
      localY >= top - hitRadius &&
      localY <= bottom + hitRadius
    );
  }
  const nearVerticalEdge =
    (localX >= left - hitRadius && localX <= left + hitRadius) ||
    (localX >= right - hitRadius && localX <= right + hitRadius);
  const nearHorizontalEdge =
    (localY >= top - hitRadius && localY <= top + hitRadius) ||
    (localY >= bottom - hitRadius && localY <= bottom + hitRadius);
  const withinVerticalSpan =
    localY >= top - hitRadius && localY <= bottom + hitRadius;
  const withinHorizontalSpan =
    localX >= left - hitRadius && localX <= right + hitRadius;
  return (
    (nearVerticalEdge && withinVerticalSpan) ||
    (nearHorizontalEdge && withinHorizontalSpan)
  );
}

function hitTestLineOrArrow(
  stroke: CsStroke,
  px: number,
  py: number,
  hitRadius: number,
): boolean {
  const [x0, y0, x1, y1] = stroke.points;
  const shape = stroke.lineShape ?? "straight";
  const ctrlX = stroke.controlX ?? (x0 + x1) / 2;
  const ctrlY = stroke.controlY ?? (y0 + y1) / 2;

  // Hit radiusni foydalanuvchi qulay va oson ushlab olishi uchun sezgir qilamiz
  const radius = Math.max(hitRadius, 0.025);

  if (shape === "elbow") {
    const d1 = distToSegment(px, py, x0, y0, ctrlX, y0);
    const d2 = distToSegment(px, py, ctrlX, y0, ctrlX, y1);
    const d3 = distToSegment(px, py, ctrlX, y1, x1, y1);
    return Math.min(d1, d2, d3) <= radius;
  }

  if (shape === "curved") {
    const STEPS = 16;
    let prevX = x0;
    let prevY = y0;
    let minDist = Infinity;

    for (let i = 1; i <= STEPS; i += 1) {
      const t = i / STEPS;
      const invT = 1 - t;
      const curX = invT * invT * x0 + 2 * invT * t * ctrlX + t * t * x1;
      const curY = invT * invT * y0 + 2 * invT * t * ctrlY + t * t * y1;

      const d = distToSegment(px, py, prevX, prevY, curX, curY);
      if (d < minDist) minDist = d;

      prevX = curX;
      prevY = curY;
    }
    return minDist <= radius;
  }

  return distToSegment(px, py, x0, y0, x1, y1) <= radius;
}

export function findSelectableShapeAt(
  strokes: CsStroke[],
  x: number,
  y: number,
  hitRadius: number,
): CsStroke | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index];
    if (stroke.points.length < 4) continue;
    if (stroke.tool === "line" || stroke.tool === "arrow") {
      if (hitTestLineOrArrow(stroke, x, y, hitRadius)) return stroke;
    } else if (stroke.tool === "rectangle" || stroke.tool === "ellipse") {
      if (hitTestShape(stroke, x, y, hitRadius, true)) return stroke;
    }
  }
  return null;
}

export function findStrokeAt(
  strokes: CsStroke[],
  x: number,
  y: number,
  hitRadius: number,
): CsStroke | null {
  // Oxirgi chizilgandan boshlab tekshiramiz — ustma-ust chizmalarda eng
  // "tepadagi" (oxirgi chizilgan) ni topish tabiiyroq.
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    const pts = s.points;
    if (pts.length >= 4 && (s.tool === "line" || s.tool === "arrow")) {
      if (hitTestLineOrArrow(s, x, y, hitRadius)) return s;
      continue;
    }
    if (pts.length === 4 && (s.tool === "rectangle" || s.tool === "ellipse")) {
      if (hitTestShape(s, x, y, hitRadius)) return s;
      continue;
    }
    if (pts.length < 4) {
      if (pts.length === 2 && Math.hypot(x - pts[0], y - pts[1]) <= hitRadius)
        return s;
      continue;
    }
    for (let j = 0; j + 3 < pts.length; j += 2) {
      if (
        distToSegment(x, y, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <=
        hitRadius
      )
        return s;
    }
  }
  return null;
}

// Pixel-eraser: berilgan nuqtaga tegib turgan segment(lar)ni chizmadan
// "kesib" olib tashlaydi. Qolgan uzluksiz bo'laklar alohida yangi
// chizmalar sifatida qaytariladi (kamida 2 nuqtali bo'laklar saqlanadi).
export function eraseNearPoint(
  stroke: CsStroke,
  x: number,
  y: number,
  hitRadius: number,
): CsStroke[] | null {
  const pts = stroke.points;
  if (
    pts.length < 4 ||
    stroke.tool === "arrow" ||
    stroke.tool === "line" ||
    stroke.tool === "rectangle" ||
    stroke.tool === "ellipse"
  )
    return null;

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
    .map((run) => ({
      id: crypto.randomUUID(),
      tool: stroke.tool,
      color: stroke.color,
      width: stroke.width,
      points: run,
    }));
}

function getQuadraticBezierExtrema(p0: number, p1: number, p2: number): number[] {
  const points = [p0, p2];
  const denom = p0 - 2 * p1 + p2;
  if (denom !== 0) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) {
      const val = (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
      points.push(val);
    }
  }
  return points;
}

// Har qanday turdagi stroke (qalam/marker/strelka/shape/matn) uchun
// normalizatsiyalangan (0..1) bounding box — lasso tanlovi va guruh
// ko'chirish/o'lchamini o'zgartirish uchun bir xil interfeys kerak.
export function strokeBoundingBox(stroke: CsStroke): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  if (stroke.tool === "text") {
    const w = (stroke.textBoxWidth ?? 320) / REF_WIDTH;
    const h = (stroke.textBoxHeight ?? 120) / REF_WIDTH;
    return {
      left: stroke.points[0],
      top: stroke.points[1],
      right: stroke.points[0] + w,
      bottom: stroke.points[1] + h,
    };
  }
  if ((stroke.tool === "line" || stroke.tool === "arrow") && stroke.points.length >= 4) {
    const [x0, y0, x1, y1] = stroke.points;
    const shape = stroke.lineShape ?? "straight";
    if (shape === "curved") {
      const ctrlX = stroke.controlX ?? (x0 + x1) / 2;
      const ctrlY = stroke.controlY ?? (y0 + y1) / 2;
      const xs = getQuadraticBezierExtrema(x0, ctrlX, x1);
      const ys = getQuadraticBezierExtrema(y0, ctrlY, y1);
      return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      };
    }
    if (shape === "elbow") {
      const ctrlX = stroke.controlX ?? (x0 + x1) / 2;
      const xs = [x0, x1, ctrlX];
      const ys = [y0, y1];
      return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      };
    }
  }
  const xs = stroke.points.filter((_, i) => i % 2 === 0);
  const ys = stroke.points.filter((_, i) => i % 2 === 1);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}


function strokeCentroid(stroke: CsStroke): [number, number] {
  const box = strokeBoundingBox(stroke);
  return [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
}

/**
 * Rotation uchun magnit (snap) effekti:
 * 0, 45, 90, 135, 180, 225, 270, 315, 360 graduslarga yaqinlashganda
 * (SNAP_THRESHOLD = 4.5 gradus oralig'ida) burchak o'sha aniq gradusga yopishadi.
 */
export function snapRotationAngle(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  const THRESHOLD = 4.5;

  for (const snap of SNAP_ANGLES) {
    if (Math.abs(normalized - snap) <= THRESHOLD) {
      const targetDeg = snap === 360 ? 0 : snap;
      const fullRotations = Math.floor(deg / 360);
      return fullRotations * 360 + targetDeg;
    }
  }
  return Math.round(deg * 10) / 10;
}

// Ray-casting: nuqta yopiq ko'pburchak (lasso yo'li) ichidami tekshiradi.
function pointInPolygon(x: number, y: number, polygon: number[]): boolean {
  let inside = false;
  const n = polygon.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2],
      yi = polygon[i * 2 + 1];
    const xj = polygon[j * 2],
      yj = polygon[j * 2 + 1];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Lasso yo'li ichida markazi (yoki bounding box ustma-ust tushishi) bo'lgan
// barcha strokelarni topadi — Miro/Excalidraw'dagi "erkin tanlash" kabi.
export function findStrokesInLasso(strokes: CsStroke[], polygon: number[]): string[] {
  if (polygon.length < 6) return [];
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  const polyLeft = Math.min(...xs),
    polyRight = Math.max(...xs);
  const polyTop = Math.min(...ys),
    polyBottom = Math.max(...ys);
  const ids: string[] = [];
  for (const stroke of strokes) {
    const box = strokeBoundingBox(stroke);
    // Tezkor rad etish: bounding box lasso'ning umumiy bounding box'i bilan
    // umuman kesishmasa, batafsil tekshirish shart emas.
    if (
      box.right < polyLeft ||
      box.left > polyRight ||
      box.bottom < polyTop ||
      box.top > polyBottom
    )
      continue;
    const [cx, cy] = strokeCentroid(stroke);
    let hit = pointInPolygon(cx, cy, polygon);
    if (!hit) {
      for (let i = 0; i < stroke.points.length; i += 2) {
        if (pointInPolygon(stroke.points[i], stroke.points[i + 1], polygon)) {
          hit = true;
          break;
        }
      }
    }
    if (!hit && stroke.controlX !== undefined && stroke.controlY !== undefined) {
      if (pointInPolygon(stroke.controlX, stroke.controlY, polygon)) {
        hit = true;
      }
    }
    if (!hit && (stroke.tool === "line" || stroke.tool === "arrow") && stroke.lineShape === "curved") {
      const [x0, y0, x1, y1] = stroke.points;
      const ctrlX = stroke.controlX ?? (x0 + x1) / 2;
      const ctrlY = stroke.controlY ?? (y0 + y1) / 2;
      const midX = 0.25 * x0 + 0.5 * ctrlX + 0.25 * x1;
      const midY = 0.25 * y0 + 0.5 * ctrlY + 0.25 * y1;
      if (pointInPolygon(midX, midY, polygon)) {
        hit = true;
      }
    }
    if (hit) ids.push(stroke.id);
  }
  return ids;
}


