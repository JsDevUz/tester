import React, {useEffect, useMemo, useState} from 'react';
import {Platform, Text as RNText, View} from 'react-native';
import {Canvas, Circle, DashPathEffect, Group, Path, Skia} from '@shopify/react-native-skia';
import {getStroke} from 'perfect-freehand';
import type {CsPointer, CsStroke} from '../../types/classroom';

const REF_WIDTH = 1000;
const ARROW_HEAD_LEN_REF = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

function shapeAnchor(shape: CsStroke, side: 'top' | 'right' | 'bottom' | 'left', position = 0.5, width = REF_WIDTH, height = REF_WIDTH): [number, number] {
  const left = shape.tool === 'text' ? shape.points[0] : Math.min(shape.points[0], shape.points[2]);
  const right = shape.tool === 'text' ? left + (shape.textBoxWidth ?? 320) / REF_WIDTH : Math.max(shape.points[0], shape.points[2]);
  const top = shape.tool === 'text' ? shape.points[1] : Math.min(shape.points[1], shape.points[3]);
  const bottom = shape.tool === 'text' ? top + ((shape.textBoxHeight ?? 120) * (width / REF_WIDTH)) / Math.max(height, 1) : Math.max(shape.points[1], shape.points[3]);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const t = Math.max(0, Math.min(1, position));
  let x: number;
  let y: number;
  if (shape.tool === 'ellipse') {
    // Web (classroomShapeBindings.ts) bilan bir xil: side asosida baza burchak,
    // position esa kichik offset beradi
    const baseAngle =
      side === 'right' ? 0
      : side === 'bottom' ? Math.PI / 2
      : side === 'left' ? Math.PI
      : (3 * Math.PI) / 2; // top
    const offset = (t - 0.5) * Math.PI;
    const angle = baseAngle + offset;
    x = cx + (Math.cos(angle) * (right - left)) / 2;
    y = cy + (Math.sin(angle) * (bottom - top)) / 2;
  } else {
    x = side === 'left' ? left : side === 'right' ? right : left + (right - left) * t;
    y = side === 'top' ? top : side === 'bottom' ? bottom : top + (bottom - top) * t;
  }
  const rotAngle = ((shape.rotation ?? 0) * Math.PI) / 180;
  if (rotAngle) {
    // Web bilan bir xil: pixel-space bo'yicha aylantirish
    const dx = (x - cx) * width;
    const dy = (y - cy) * height;
    const rdx = dx * Math.cos(rotAngle) - dy * Math.sin(rotAngle);
    const rdy = dx * Math.sin(rotAngle) + dy * Math.cos(rotAngle);
    x = cx + rdx / width;
    y = cy + rdy / height;
  }
  return [x, y];
}


function resolveConnector(stroke: CsStroke, strokes: CsStroke[], width: number, height: number): CsStroke {
  if (stroke.tool !== 'line' && stroke.tool !== 'arrow') return stroke;
  const points = [...stroke.points];
  const apply = (binding: CsStroke['startBinding'], offset: 0 | 2) => {
    if (!binding) return;
    const shape = strokes.find(item => item.id === binding.strokeId && (item.tool === 'rectangle' || item.tool === 'ellipse' || item.tool === 'text'));
    if (shape) [points[offset], points[offset + 1]] = shapeAnchor(shape, binding.side, binding.position, width, height);
  };
  apply(stroke.startBinding, 0);
  apply(stroke.endBinding, 2);
  return {...stroke, points};
}

function resolveFontFamily(family?: string, fontWeight?: string | number): string | undefined {
  if (!family) return undefined;
  const f = family.toLowerCase();
  const isBold = Number(fontWeight) >= 600 || fontWeight === 'bold';
  if (f.includes('comic') || f.includes('chalk')) {
    if (Platform.OS === 'ios') {
      return isBold ? 'ChalkboardSE-Bold' : 'ChalkboardSE-Regular';
    }
    return 'casual';
  }
  if (f.includes('georgia') || f.includes('serif')) {
    if (Platform.OS === 'ios') {
      return isBold ? 'Georgia-Bold' : 'Georgia';
    }
    return 'serif';
  }
  if (f.includes('mono') || f.includes('courier')) {
    if (Platform.OS === 'ios') {
      return isBold ? 'Courier-Bold' : 'Courier';
    }
    return 'monospace';
  }
  if (f.includes('arial')) {
    if (Platform.OS === 'ios') {
      return isBold ? 'Arial-BoldMT' : 'Arial';
    }
    return 'sans-serif';
  }
  return undefined;
}

function buildLineShaftPath(s: CsStroke, w: number, h: number) {

  const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const shape = s.lineShape ?? 'straight';
  const ctrlX = s.controlX !== undefined ? s.controlX * w : (x0 + x1) / 2;
  const ctrlY = s.controlY !== undefined ? s.controlY * h : (y0 + y1) / 2;
  const path = Skia.Path.Make();
  path.moveTo(x0, y0);
  if (shape === 'elbow') {
    path.lineTo(ctrlX, y0);
    path.lineTo(ctrlX, y1);
    path.lineTo(x1, y1);
  } else if (shape === 'curved') {
    if ((s.startBinding || s.endBinding) && s.controlX === undefined && s.controlY === undefined) {
      const vector = (side: string | undefined, fx: number, fy: number): [number, number] =>
        side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'top' ? [0, -1] : side === 'bottom' ? [0, 1] : [fx, fy];
      const distance = Math.hypot(x1 - x0, y1 - y0);
      const handle = Math.max(28 * (w / REF_WIDTH), Math.min(distance * 0.42, 180 * (w / REF_WIDTH)));
      const [svx, svy] = vector(s.startBinding?.side, (x1 - x0) / Math.max(distance, 1), (y1 - y0) / Math.max(distance, 1));
      const [evx, evy] = vector(s.endBinding?.side, (x0 - x1) / Math.max(distance, 1), (y0 - y1) / Math.max(distance, 1));
      path.cubicTo(x0 + svx * handle, y0 + svy * handle, x1 + evx * handle, y1 + evy * handle, x1, y1);
    } else {
      path.quadTo(ctrlX, ctrlY, x1, y1);
    }
  } else {
    path.lineTo(x1, y1);
  }
  return path;
}

function getHeadAngles(s: CsStroke, w: number, h: number) {
  const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const shape = s.lineShape ?? 'straight';
  const ctrlX = s.controlX !== undefined ? s.controlX * w : (x0 + x1) / 2;
  const ctrlY = s.controlY !== undefined ? s.controlY * h : (y0 + y1) / 2;
  let lastAngle = Math.atan2(y1 - y0, x1 - x0);
  let firstAngle = Math.atan2(y0 - y1, x0 - x1);
  if (shape === 'elbow') {
    lastAngle = Math.atan2(0, x1 - ctrlX);
    firstAngle = Math.atan2(0, x0 - ctrlX);
  } else if (shape === 'curved') {
    if ((s.startBinding || s.endBinding) && s.controlX === undefined && s.controlY === undefined) {
      const vector = (side: string | undefined, fx: number, fy: number): [number, number] =>
        side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'top' ? [0, -1] : side === 'bottom' ? [0, 1] : [fx, fy];
      const distance = Math.hypot(x1 - x0, y1 - y0);
      const [svx, svy] = vector(s.startBinding?.side, (x1 - x0) / Math.max(distance, 1), (y1 - y0) / Math.max(distance, 1));
      const [evx, evy] = vector(s.endBinding?.side, (x0 - x1) / Math.max(distance, 1), (y0 - y1) / Math.max(distance, 1));
      firstAngle = Math.atan2(-svy, -svx);
      lastAngle = Math.atan2(-evy, -evx);
    } else {
      lastAngle = Math.atan2(y1 - ctrlY, x1 - ctrlX);
      firstAngle = Math.atan2(y0 - ctrlY, x0 - ctrlX);
    }
  }
  return {firstAngle, lastAngle};
}

function buildArrowHead(
  type: string | undefined,
  x: number,
  y: number,
  angle: number,
  headLen: number,
): {path: any; isFill: boolean} | null {
  if (!type || type === 'none') return null;
  // headLen chaqiruvchida allaqachon (w / REF_WIDTH) bilan masshtablangan —
  // bu yerda qat'iy 14px minimal qiymat bilan cheklansa, kichikroq ekranda
  // (talaba tomonida) o'q uchi chiziqqa nisbatan kattaroq ko'rinardi. Web
  // (classroomCanvasDraw.ts) bilan bir xil fix.
  const len = headLen;
  const path = Skia.Path.Make();

  if (type === 'arrow' || type === 'open') {
    path.moveTo(
      x - len * Math.cos(angle - ARROW_HEAD_ANGLE),
      y - len * Math.sin(angle - ARROW_HEAD_ANGLE),
    );
    path.lineTo(x, y);
    path.lineTo(
      x - len * Math.cos(angle + ARROW_HEAD_ANGLE),
      y - len * Math.sin(angle + ARROW_HEAD_ANGLE),
    );
    return {path, isFill: false};
  }

  if (type === 'arrow-filled' || type === 'filled') {
    path.moveTo(x, y);
    path.lineTo(
      x - len * 1.1 * Math.cos(angle - ARROW_HEAD_ANGLE),
      y - len * 1.1 * Math.sin(angle - ARROW_HEAD_ANGLE),
    );
    path.lineTo(
      x - len * 1.1 * Math.cos(angle + ARROW_HEAD_ANGLE),
      y - len * 1.1 * Math.sin(angle + ARROW_HEAD_ANGLE),
    );
    path.close();
    return {path, isFill: true};
  }

  if (type === 'circle' || type === 'dot') {
    const r = Math.max(len * 0.55, 6);
    const cx = x - Math.cos(angle) * (r * 0.5);
    const cy = y - Math.sin(angle) * (r * 0.5);
    path.addOval(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2));
    return {path, isFill: true};
  }

  if (type === 'diamond') {
    const dLen = len * 1.25;
    const dWidth = len * 0.65;
    const backX = x - Math.cos(angle) * dLen;
    const backY = y - Math.sin(angle) * dLen;
    const midX = x - Math.cos(angle) * (dLen / 2);
    const midY = y - Math.sin(angle) * (dLen / 2);
    const perpX = Math.cos(angle + Math.PI / 2) * dWidth;
    const perpY = Math.sin(angle + Math.PI / 2) * dWidth;
    path.moveTo(x, y);
    path.lineTo(midX + perpX, midY + perpY);
    path.lineTo(backX, backY);
    path.lineTo(midX - perpX, midY - perpY);
    path.close();
    return {path, isFill: true};
  }

  if (type === 'bar') {
    const bWidth = Math.max(len * 0.85, 10);
    const perpX = Math.cos(angle + Math.PI / 2) * bWidth;
    const perpY = Math.sin(angle + Math.PI / 2) * bWidth;
    path.moveTo(x + perpX, y + perpY);
    path.lineTo(x - perpX, y - perpY);
    return {path, isFill: false};
  }

  return null;
}

// perfect-freehand orqali bosim-sezuvchan (boshi/oxiri ingichka, tez
// harakatda ingichkaroq) qalam effekti — web (classroomCanvasDraw.ts)dagi
// bilan bir xil parametrlar, shunda ustoz (web) va talaba (mobile) tomonida
// pen chizig'i bir xil ko'rinadi. getStroke() outline nuqtalari qaytaradi,
// bu FILL path sifatida chiziladi (stroke emas).
function buildPenPath(s: CsStroke, w: number, h: number) {
  const pointCount = Math.floor(s.points.length / 2);
  const hasRealPressure = s.pressures?.length === pointCount;
  const input: number[][] = Array.from({length: pointCount}, (_, index) =>
    hasRealPressure
      ? [s.points[index * 2] * w, s.points[index * 2 + 1] * h, s.pressures![index]]
      : [s.points[index * 2] * w, s.points[index * 2 + 1] * h],
  );
  const size = Math.max(1, s.width * (w / REF_WIDTH));
  const outline = getStroke(input, {
    size,
    thinning: 0.58,
    smoothing: 0.62,
    streamline: 0.48,
    simulatePressure: !hasRealPressure,
    easing: (pressure: number) => pressure,
    start: {taper: size * 0.65, cap: true},
    end: {taper: size * 1.8, cap: true},
  });
  const path = Skia.Path.Make();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    path.quadTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
  }
  path.close();
  return path;
}

function buildFreehandPath(s: CsStroke, w: number, h: number) {
  const path = Skia.Path.Make();
  if (s.points.length === 2) {
    path.moveTo(s.points[0] * w, s.points[1] * h);
    path.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
    return path;
  }
  if (s.points.length === 4) {
    path.moveTo(s.points[0] * w, s.points[1] * h);
    path.lineTo(s.points[2] * w, s.points[3] * h);
    return path;
  }
  path.moveTo(s.points[0] * w, s.points[1] * h);
  let prevX = s.points[0] * w;
  let prevY = s.points[1] * h;
  for (let i = 2; i + 1 < s.points.length; i += 2) {
    const curX = s.points[i] * w;
    const curY = s.points[i + 1] * h;
    const midX = (prevX + curX) / 2;
    const midY = (prevY + curY) / 2;
    path.quadTo(prevX, prevY, midX, midY);
    prevX = curX;
    prevY = curY;
  }
  path.lineTo(prevX, prevY);
  return path;
}

function buildShapePath(s: CsStroke, w: number, h: number) {
  const [x0raw, y0raw, x1raw, y1raw] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
  const x = Math.min(x0raw, x1raw);
  const y = Math.min(y0raw, y1raw);
  const width = Math.abs(x1raw - x0raw);
  const height = Math.abs(y1raw - y0raw);
  const path = Skia.Path.Make();
  if (width < 1 || height < 1) return path;
  if (s.tool === 'ellipse') {
    path.addOval(Skia.XYWHRect(x, y, width, height));
  } else {
    const radius = s.edges === 'round' ? Math.min(width, height) * 0.12 : 0;
    path.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, width, height), radius, radius));
  }
  return path;
}

const laserArrivalMap = new Map<string, number>();

function getLaserAge(id: string): number {
  const now = Date.now();
  if (!laserArrivalMap.has(id)) {
    laserArrivalMap.set(id, now);
  }
  return (now - laserArrivalMap.get(id)!) / 1000;
}

const StrokeShape = React.memo(function StrokeShape({s, w, h}: {s: CsStroke; w: number; h: number}) {
  const scale = w / REF_WIDTH;

  if (s.tool === 'arrow' || s.tool === 'line') {
    if (s.points.length < 4) return null;
    const [x0, y0, x1, y1] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
    const shaftPath = buildLineShaftPath(s, w, h);
    const lineWidth = Math.max(1, s.width * scale);
    const arrowHeadLen = ARROW_HEAD_LEN_REF * (w / REF_WIDTH) * Math.max(0.35, Math.min(1.4, s.width / 4));
    const headLen = Math.min(arrowHeadLen, Math.hypot(x1 - x0, y1 - y0) / 3);
    const {firstAngle, lastAngle} = getHeadAngles(s, w, h);

    const endHeadType = s.endArrowHead ?? (s.tool === 'arrow' ? 'arrow' : 'none');
    const startHeadType = s.startArrowHead ?? 'none';

    const endHead = buildArrowHead(endHeadType, x1, y1, lastAngle, headLen);
    const startHead = buildArrowHead(startHeadType, x0, y0, firstAngle, headLen);

    const strokeStyle = s.strokeStyle ?? 'solid';
    const intervals =
      strokeStyle === 'dashed'
        ? [lineWidth * 3, lineWidth * 2]
        : strokeStyle === 'dotted'
        ? [lineWidth, lineWidth * 1.5]
        : undefined;

    return (
      <Group opacity={(s.opacity ?? 100) / 100}>
        {/* Line Shaft */}
        <Path
          path={shaftPath}
          style="stroke"
          strokeWidth={lineWidth}
          strokeCap="round"
          strokeJoin="round"
          color={s.color}>
          {intervals && <DashPathEffect intervals={intervals} />}
        </Path>
        {/* End Arrowhead */}
        {endHead && (
          <Path
            path={endHead.path}
            style={endHead.isFill ? 'fill' : 'stroke'}
            strokeWidth={lineWidth}
            strokeCap="round"
            strokeJoin="round"
            color={s.color}
          />
        )}
        {/* Start Arrowhead */}
        {startHead && (
          <Path
            path={startHead.path}
            style={startHead.isFill ? 'fill' : 'stroke'}
            strokeWidth={lineWidth}
            strokeCap="round"
            strokeJoin="round"
            color={s.color}
          />
        )}
      </Group>
    );
  }

  if (s.tool === 'rectangle' || s.tool === 'ellipse') {
    if (s.points.length < 4) return null;
    const path = buildShapePath(s, w, h);
    const lineWidth = Math.max(1, s.width * scale);
    const hasFill = s.backgroundColor && s.backgroundColor !== 'transparent';
    const strokeStyle = s.strokeStyle ?? 'solid';
    const intervals =
      strokeStyle === 'dashed'
        ? [lineWidth * 3, lineWidth * 2]
        : strokeStyle === 'dotted'
        ? [lineWidth, lineWidth * 1.5]
        : undefined;

    const [x0raw, y0raw, x1raw, y1raw] = [s.points[0] * w, s.points[1] * h, s.points[2] * w, s.points[3] * h];
    const cx = (x0raw + x1raw) / 2;
    const cy = (y0raw + y1raw) / 2;
    const rotationDeg = s.rotation ?? 0;

    return (
      <Group opacity={(s.opacity ?? 100) / 100} origin={{x: cx, y: cy}} transform={rotationDeg ? [{rotate: (rotationDeg * Math.PI) / 180}] : undefined}>
        {hasFill && (
          <Path path={path} style="fill" color={s.backgroundColor} opacity={(s.opacity ?? 100) / 100} />
        )}
        {strokeStyle !== 'none' && (
          <Path path={path} style="stroke" strokeWidth={lineWidth} strokeCap="round" strokeJoin="round" color={s.color}>
            {intervals && <DashPathEffect intervals={intervals} />}
          </Path>
        )}
      </Group>
    );
  }

  if (s.tool === 'laser') {
    const elapsed = getLaserAge(s.id);
    if (elapsed >= 3) return null;

    let laserAlpha = 1;
    if (elapsed > 2) {
      laserAlpha = Math.max(0, 1 - (elapsed - 2));
    }

    const laserColor = s.color && s.color !== '#000000' ? s.color : '#ff2b2b';
    const path = buildFreehandPath(s, w, h);
    const strokeWidth = Math.max(1.5, (s.width || 3) * scale);

    const tipX = s.points.length >= 2 ? s.points[s.points.length - 2] * w : 0;
    const tipY = s.points.length >= 2 ? s.points[s.points.length - 1] * h : 0;
    const dotRadius = Math.max(2.5, strokeWidth * 1.1);

    return (
      <Group opacity={laserAlpha}>
        {/* Subtle laser glow */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={strokeWidth + 2}
          strokeCap="round"
          strokeJoin="round"
          color={laserColor}
          opacity={0.25}
        />
        {/* Core thin laser beam */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
          color={laserColor}
        />
        {/* Laser tip dot */}
        {s.points.length >= 2 && (
          <Group>
            <Circle cx={tipX} cy={tipY} r={dotRadius + 1.5} color={laserColor} opacity={0.3} />
            <Circle cx={tipX} cy={tipY} r={dotRadius} color={laserColor} />
          </Group>
        )}
      </Group>
    );
  }

  if (s.tool === 'pen') {
    return <Path path={buildPenPath(s, w, h)} style="fill" color={s.color} opacity={1} />;
  }

  const baseOpacity = s.tool === 'highlighter' ? 0.35 : 1;
  return (
    <Path
      path={buildFreehandPath(s, w, h)}
      style="stroke"
      strokeWidth={Math.max(1, s.width * scale)}
      strokeCap="round"
      strokeJoin="round"
      color={s.color}
      opacity={baseOpacity}
    />
  );
});

function TextStrokeItem({s, w, h}: {s: CsStroke; w: number; h: number}) {
  if (!s.text) return null;
  const scale = w / REF_WIDTH;
  const referenceFontSize = s.fontSize ?? Math.max(14, s.width * 6);
  const fontSize = Math.max(1, referenceFontSize * scale);
  const lineHeight = fontSize * 1.25;
  const originX = s.points[0] * w;
  const originY = s.points[1] * h;
  const fontFamily = resolveFontFamily(s.fontFamily, s.fontWeight);
  const lines = s.text.split('\n');

  const measuredBoxWidth = (s.textBoxWidth ?? 320) * scale;
  const maxLineLength = Math.max(...lines.map(l => l.length), 1);
  const boxWidth = Math.max(measuredBoxWidth, fontSize * (maxLineLength * 0.75));
  const boxHeight = Math.max((s.textBoxHeight ?? 30) * scale, lines.length * lineHeight);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: originX,
        top: originY,
        width: boxWidth,
        height: boxHeight,
        overflow: 'visible',
        alignItems:
          s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        opacity: (s.opacity ?? 100) / 100,
        transform: s.rotation ? [{rotate: `${s.rotation}deg`}] : undefined,
      }}>
      {lines.map((line, idx) => (
        <RNText
          key={idx}
          numberOfLines={1}
          style={{
            fontSize,
            lineHeight,
            color: s.color || '#ffffff',
            fontFamily,
            fontWeight: String(s.fontWeight ?? 600) as any,
            textAlign: s.textAlign ?? 'left',
            includeFontPadding: false,
          }}>
          {line}
        </RNText>
      ))}
    </View>
  );
}

function ShapeTextItem({s, w, h}: {s: CsStroke; w: number; h: number}) {
  if (!s.text?.trim() || (s.tool !== 'rectangle' && s.tool !== 'ellipse')) return null;
  const left = Math.min(s.points[0], s.points[2]) * w;
  const top = Math.min(s.points[1], s.points[3]) * h;
  const boxWidth = Math.abs(s.points[2] - s.points[0]) * w;
  const boxHeight = Math.abs(s.points[3] - s.points[1]) * h;
  const fontSize = Math.max(1, (s.fontSize ?? 24) * (w / REF_WIDTH));
  return (
    <View pointerEvents="none" style={{position: 'absolute', left, top, width: boxWidth, height: boxHeight, padding: 6, justifyContent: s.verticalAlign === 'top' ? 'flex-start' : s.verticalAlign === 'bottom' ? 'flex-end' : 'center', opacity: (s.opacity ?? 100) / 100, transform: s.rotation ? [{rotate: `${s.rotation}deg`}] : undefined}}>
      <RNText numberOfLines={20} style={{color: s.color || '#ffffff', fontSize, lineHeight: fontSize * 1.25, fontFamily: resolveFontFamily(s.fontFamily, s.fontWeight), fontWeight: String(s.fontWeight ?? 600) as any, textAlign: s.textAlign ?? 'center', includeFontPadding: false}}>
        {s.text}
      </RNText>
    </View>
  );
}





export function ClassroomStrokeCanvas({
  strokes,
  width,
  height,
  pointer,
}: {
  strokes: CsStroke[];
  width: number;
  height: number;
  pointer?: CsPointer | null;
}) {
  const [tick, setTick] = useState(0);

  // Check if any active laser strokes exist
  const hasActiveLaser = useMemo(() => {
    return strokes.some(s => s.tool === 'laser' && getLaserAge(s.id) < 3);
  }, [strokes, tick]);

  useEffect(() => {
    if (!hasActiveLaser) return;
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 50);
    return () => clearInterval(interval);
  }, [hasActiveLaser]);

  if (width <= 0 || height <= 0) return null;

  const pathStrokes = strokes.filter(s => s.tool !== 'text').map(s => resolveConnector(s, strokes, width, height));
  const textStrokes = strokes.filter(s => s.tool === 'text');
  const shapeTextStrokes = strokes.filter(s => (s.tool === 'rectangle' || s.tool === 'ellipse') && s.text);
  const hasPointer = Boolean(pointer && pointer.active);

  // If there are no drawings/text/pointer on this page, don't mount anything
  if (pathStrokes.length === 0 && textStrokes.length === 0 && shapeTextStrokes.length === 0 && !hasPointer) {
    return null;
  }

  return (
    <View style={{width, height, position: 'absolute', top: 0, left: 0}} pointerEvents="none">
      {(pathStrokes.length > 0 || hasPointer) && (
        <Canvas style={{width, height, position: 'absolute', top: 0, left: 0}} pointerEvents="none">
          {pathStrokes.map(s => (
            <StrokeShape key={s.id} s={s} w={width} h={height} />
          ))}
          {hasPointer && (
            <Circle
              cx={pointer!.x * width}
              cy={pointer!.y * height}
              r={Math.max(4, 12 * (width / REF_WIDTH))}
              color="rgba(59, 130, 246, 0.25)"
            />
          )}
        </Canvas>
      )}
      {textStrokes.map(s => (
        <TextStrokeItem key={s.id} s={s} w={width} h={height} />
      ))}
      {shapeTextStrokes.map(s => (
        <ShapeTextItem key={`shape-text-${s.id}`} s={s} w={width} h={height} />
      ))}
    </View>
  );
}
