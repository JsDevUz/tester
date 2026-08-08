// Stroke va shakllarni canvas'ga chizish. Sof render mantiqi — React
// holatiga bog'liq emas, shuning uchun komponentdan ajratilgan va
// alohida test qilinishi mumkin.
import { getStroke } from "perfect-freehand";
import type { CsStroke } from "../../api/classroom";
import {
  REF_WIDTH,
  getFontFamilyString,
  wrapTextLines,
} from "./classroomCanvasText";

const ARROW_HEAD_LEN_REF = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

function drawHead(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  angle: number,
  headLen: number,
) {
  if (!type || type === "none") return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = ctx.strokeStyle;

  // Head size calculation relative to headLen, ensuring high visibility
  const len = Math.max(headLen, 14);

  if (type === "arrow" || type === "open") {
    ctx.beginPath();
    ctx.moveTo(
      x - len * Math.cos(angle - ARROW_HEAD_ANGLE),
      y - len * Math.sin(angle - ARROW_HEAD_ANGLE),
    );
    ctx.lineTo(x, y);
    ctx.lineTo(
      x - len * Math.cos(angle + ARROW_HEAD_ANGLE),
      y - len * Math.sin(angle + ARROW_HEAD_ANGLE),
    );
    ctx.stroke();
  } else if (type === "arrow-filled" || type === "filled") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - len * 1.1 * Math.cos(angle - ARROW_HEAD_ANGLE),
      y - len * 1.1 * Math.sin(angle - ARROW_HEAD_ANGLE),
    );
    ctx.lineTo(
      x - len * 1.1 * Math.cos(angle + ARROW_HEAD_ANGLE),
      y - len * 1.1 * Math.sin(angle + ARROW_HEAD_ANGLE),
    );
    ctx.closePath();
    ctx.fill();
  } else if (type === "circle" || type === "dot") {
    const r = Math.max(len * 0.55, 6);
    const cx = x - Math.cos(angle) * (r * 0.5);
    const cy = y - Math.sin(angle) * (r * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "diamond") {
    const dLen = len * 1.25;
    const dWidth = len * 0.65;
    const backX = x - Math.cos(angle) * dLen;
    const backY = y - Math.sin(angle) * dLen;
    const midX = x - Math.cos(angle) * (dLen / 2);
    const midY = y - Math.sin(angle) * (dLen / 2);
    const perpX = Math.cos(angle + Math.PI / 2) * dWidth;
    const perpY = Math.sin(angle + Math.PI / 2) * dWidth;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(midX + perpX, midY + perpY);
    ctx.lineTo(backX, backY);
    ctx.lineTo(midX - perpX, midY - perpY);
    ctx.closePath();
    ctx.fill();
  } else if (type === "bar") {
    const bWidth = Math.max(len * 0.85, 10);
    const perpX = Math.cos(angle + Math.PI / 2) * bWidth;
    const perpY = Math.sin(angle + Math.PI / 2) * bWidth;
    ctx.beginPath();
    ctx.moveTo(x + perpX, y + perpY);
    ctx.lineTo(x - perpX, y - perpY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  s: CsStroke,
  w: number,
  h: number,
  dimmed?: boolean,
) {
  const [x0, y0, x1, y1] = [
    s.points[0] * w,
    s.points[1] * h,
    s.points[2] * w,
    s.points[3] * h,
  ];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.globalAlpha = dimmed ? 0.25 : 1;
  const lineWidth = Math.max(1, s.width * (w / REF_WIDTH));
  ctx.lineWidth = lineWidth;
  const strokeStyle = s.strokeStyle ?? "solid";
  if (strokeStyle === "dashed") ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
  else if (strokeStyle === "dotted") ctx.setLineDash([lineWidth, lineWidth * 1.5]);
  else ctx.setLineDash([]);

  const shape = s.lineShape ?? "straight";
  let lastAngle = Math.atan2(y1 - y0, x1 - x0);
  let firstAngle = Math.atan2(y0 - y1, x0 - x1);

  const ctrlX = s.controlX !== undefined ? s.controlX * w : (x0 + x1) / 2;
  const ctrlY = s.controlY !== undefined ? s.controlY * h : (y0 + y1) / 2;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  if (shape === "elbow") {
    const midX = ctrlX;
    ctx.lineTo(midX, y0);
    ctx.lineTo(midX, y1);
    ctx.lineTo(x1, y1);
    lastAngle = Math.atan2(0, x1 - midX);
    firstAngle = Math.atan2(0, x0 - midX);
  } else if (shape === "curved") {
    ctx.quadraticCurveTo(ctrlX, ctrlY, x1, y1);
    lastAngle = Math.atan2(y1 - ctrlY, x1 - ctrlX);
    firstAngle = Math.atan2(y0 - ctrlY, x0 - ctrlX);
  } else {
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();

  const arrowHeadLen =
    ARROW_HEAD_LEN_REF *
    (w / REF_WIDTH) *
    Math.max(0.35, Math.min(1.4, s.width / 4));
  const headLen = Math.min(arrowHeadLen, Math.hypot(x1 - x0, y1 - y0) / 3);

  const endHead = s.endArrowHead ?? "arrow";
  const startHead = s.startArrowHead ?? "none";

  drawHead(ctx, endHead, x1, y1, lastAngle, headLen);
  drawHead(ctx, startHead, x0, y0, firstAngle, headLen);

  ctx.restore();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  s: CsStroke,
  w: number,
  h: number,
  dimmed?: boolean,
) {
  const [x0, y0, x1, y1] = [
    s.points[0] * w,
    s.points[1] * h,
    s.points[2] * w,
    s.points[3] * h,
  ];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.globalAlpha = dimmed ? 0.25 : 1;
  const lineWidth = Math.max(1, s.width * (w / REF_WIDTH));
  ctx.lineWidth = lineWidth;
  const strokeStyle = s.strokeStyle ?? "solid";
  if (strokeStyle === "dashed") ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
  else if (strokeStyle === "dotted") ctx.setLineDash([lineWidth, lineWidth * 1.5]);
  else ctx.setLineDash([]);

  const shape = s.lineShape ?? "straight";
  let lastAngle = Math.atan2(y1 - y0, x1 - x0);
  let firstAngle = Math.atan2(y0 - y1, x0 - x1);

  const ctrlX = s.controlX !== undefined ? s.controlX * w : (x0 + x1) / 2;
  const ctrlY = s.controlY !== undefined ? s.controlY * h : (y0 + y1) / 2;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  if (shape === "elbow") {
    const midX = ctrlX;
    ctx.lineTo(midX, y0);
    ctx.lineTo(midX, y1);
    ctx.lineTo(x1, y1);
    lastAngle = Math.atan2(0, x1 - midX);
    firstAngle = Math.atan2(0, x0 - midX);
  } else if (shape === "curved") {
    ctx.quadraticCurveTo(ctrlX, ctrlY, x1, y1);
    lastAngle = Math.atan2(y1 - ctrlY, x1 - ctrlX);
    firstAngle = Math.atan2(y0 - ctrlY, x0 - ctrlX);
  } else {
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();

  const arrowHeadLen =
    ARROW_HEAD_LEN_REF *
    (w / REF_WIDTH) *
    Math.max(0.35, Math.min(1.4, s.width / 4));
  const headLen = Math.min(arrowHeadLen, Math.hypot(x1 - x0, y1 - y0) / 3);

  const endHead = s.endArrowHead ?? "none";
  const startHead = s.startArrowHead ?? "none";

  drawHead(ctx, endHead, x1, y1, lastAngle, headLen);
  drawHead(ctx, startHead, x0, y0, firstAngle, headLen);

  ctx.restore();
}

function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// Hachure/cross-hatch fill: shape yo'lini clip qilib, ichiga parallel
// chiziqlar (cross-hatch uchun ikki yo'nalishda) chiziladi — Excalidraw'ning
// "qo'lda chizilgan shtrix" fon uslubiga o'xshash, "solid" dan farqli.
function paintHachureFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  crossHatch: boolean,
  scale: number,
) {
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  const gap = Math.max(4, 7 * scale);
  const diag = Math.hypot(width, height);
  const draw45 = (sign: 1 | -1) => {
    ctx.beginPath();
    for (let offset = -diag; offset < diag; offset += gap) {
      const x0 = x + offset;
      const y0 = y;
      const x1 = x + offset + sign * height;
      const y1 = y + height;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };
  draw45(1);
  if (crossHatch) draw45(-1);
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  s: CsStroke,
  w: number,
  h: number,
  dimmed?: boolean,
) {
  const [x0raw, y0raw, x1raw, y1raw] = [
    s.points[0] * w,
    s.points[1] * h,
    s.points[2] * w,
    s.points[3] * h,
  ];
  const x = Math.min(x0raw, x1raw);
  const y = Math.min(y0raw, y1raw);
  const width = Math.abs(x1raw - x0raw);
  const height = Math.abs(y1raw - y0raw);
  if (width < 1 || height < 1) return;

  ctx.save();
  if (s.rotation) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }
  const strokeAlpha = dimmed ? 0.25 : 1;
  const fillAlpha = strokeAlpha * ((s.opacity ?? 100) / 100);
  ctx.globalAlpha = strokeAlpha;
  const scale = w / REF_WIDTH;
  const lineWidth = Math.max(1, s.width * scale);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokeStyle = s.strokeStyle ?? "solid";
  if (strokeStyle === "dashed") ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
  else if (strokeStyle === "dotted")
    ctx.setLineDash([lineWidth, lineWidth * 1.5]);
  else ctx.setLineDash([]);

  const radius = s.edges === "round" ? Math.min(width, height) * 0.12 : 0;

  const buildPath = () => {
    if (s.tool === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else {
      drawRoundRectPath(ctx, x, y, width, height, radius);
    }
  };

  const background = s.backgroundColor;
  if (background && background !== "transparent") {
    const fillStyle = s.fillStyle ?? "hachure";
    buildPath();
    ctx.globalAlpha = fillAlpha;
    if (fillStyle === "solid") {
      ctx.fillStyle = background;
      ctx.fill();
    } else {
      paintHachureFill(
        ctx,
        x,
        y,
        width,
        height,
        background,
        fillStyle === "cross-hatch",
        scale,
      );
    }
  }

  ctx.globalAlpha = strokeAlpha;
  if (strokeStyle !== "none") {
    buildPath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: CsStroke,
  w: number,
  h: number,
  dimmed?: boolean,
) {
  if (s.points.length < 2) return;
  if (s.tool === "text") {
    if (!s.text) return;
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.globalAlpha = dimmed ? 0.25 : 1;
    const referenceFontSize = s.fontSize ?? Math.max(14, s.width * 6);
    const renderedFontSize = Math.max(1, referenceFontSize * (w / REF_WIDTH));
    ctx.font = `${s.fontWeight ?? 600} ${renderedFontSize}px ${getFontFamilyString(s.fontFamily)}`;
    ctx.textBaseline = "alphabetic";
    const lineHeight = renderedFontSize * 1.25;
    const boxWidth = (s.textBoxWidth ?? 320) * (w / REF_WIDTH);
    const lines = wrapTextLines(ctx, s.text, boxWidth);
    const originX = s.points[0] * w;
    const originY = s.points[1] * h;
    const boxHeight =
      (s.textBoxHeight ?? Math.max(lineHeight, lines.length * lineHeight)) *
      (w / REF_WIDTH);
    // textBaseline:"top" shrift ustidagi taxminiy "leading/2" masofasi bilan
    // ishlaydi — bu haqiqiy shriftga qarab (Georgia, Comic Sans va h.k. turli
    // ascent nisbatiga ega) farq qilib, matn tahrirlashda ko'ringan joydan
    // saqlangandan keyin bir oz yuqoriroqqa chiqib qolardi. Shrift metrikasi
    // (actualBoundingBoxAscent) bilan har bir qatorning haqiqiy tepasini
    // aniq hisoblab, "alphabetic" baseline'ga moslab chizamiz — bu <textarea>
    // ichida ko'ringan qator boshlanish nuqtasi bilan har qanday shrift/
    // o'lchamda bir xil natija beradi.
    const measureLine = lines.find((line) => line.trim().length > 0) ?? "M";
    const ascent =
      ctx.measureText(measureLine).actualBoundingBoxAscent ||
      renderedFontSize * 0.8;
    const lineTopOffset = (lineHeight - renderedFontSize) / 2 + ascent;
    const align = s.textAlign ?? "left";
    const lineX = (line: string) => {
      if (align === "left") return 0;
      const lineWidth = ctx.measureText(line).width;
      return align === "center"
        ? (boxWidth - lineWidth) / 2
        : boxWidth - lineWidth;
    };
    if (s.rotation) {
      ctx.translate(originX + boxWidth / 2, originY + boxHeight / 2);
      ctx.rotate((s.rotation * Math.PI) / 180);
      lines.forEach((line, index) =>
        ctx.fillText(
          line,
          -boxWidth / 2 + lineX(line),
          -boxHeight / 2 + lineTopOffset + index * lineHeight,
        ),
      );
    } else {
      lines.forEach((line, index) =>
        ctx.fillText(
          line,
          originX + lineX(line),
          originY + lineTopOffset + index * lineHeight,
        ),
      );
    }
    ctx.restore();
    return;
  }
  if (s.tool === "arrow") {
    if (s.points.length >= 4) drawArrow(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "line") {
    if (s.points.length >= 4) drawLine(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "rectangle" || s.tool === "ellipse") {
    if (s.points.length >= 4) drawShape(ctx, s, w, h, dimmed);
    return;
  }
  if (s.tool === "pen") {
    const pointCount = Math.floor(s.points.length / 2);
    const hasRealPressure = s.pressures?.length === pointCount;
    const input: number[][] = Array.from({ length: pointCount }, (_, index) =>
      hasRealPressure
        ? [
          s.points[index * 2] * w,
          s.points[index * 2 + 1] * h,
          s.pressures![index],
        ]
        : [s.points[index * 2] * w, s.points[index * 2 + 1] * h],
    );
    const size = Math.max(1, s.width * (w / REF_WIDTH));
    const outline = getStroke(input, {
      size,
      thinning: 0.58,
      smoothing: 0.62,
      streamline: 0.48,
      simulatePressure: !hasRealPressure,
      easing: (pressure) => pressure,
      start: { taper: size * 0.65, cap: true },
      end: { taper: size * 1.8, cap: true },
    });
    if (outline.length > 0) {
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      ctx.beginPath();
      ctx.moveTo(outline[0][0], outline[0][1]);
      for (let index = 1; index < outline.length; index += 1) {
        const current = outline[index];
        const next = outline[(index + 1) % outline.length];
        ctx.quadraticCurveTo(
          current[0],
          current[1],
          (current[0] + next[0]) / 2,
          (current[1] + next[1]) / 2,
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return;
  }
  if (s.tool === "laser") {
    const now = Date.now();
    const startTime = s.createdAt || now;
    const elapsed = (now - startTime) / 1000;
    if (elapsed >= 3) {
      return;
    }
    let laserAlpha = 1;
    if (elapsed > 2) {
      laserAlpha = 1 - (elapsed - 2);
    }
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const laserColor = s.color && s.color !== "#000000" ? s.color : "#ff2b2b";
    ctx.strokeStyle = laserColor;
    ctx.shadowColor = laserColor;
    ctx.shadowBlur = Math.max(8, (s.width || 4) * 2.5);
    ctx.lineWidth = Math.max(3, s.width * (w / REF_WIDTH));
    ctx.globalAlpha = (dimmed ? 0.25 : 1) * Math.max(0, Math.min(1, laserAlpha));

    ctx.beginPath();
    if (s.points.length === 2) {
      ctx.moveTo(s.points[0] * w, s.points[1] * h);
      ctx.lineTo(s.points[0] * w + 0.5, s.points[1] * h + 0.5);
    } else if (s.points.length === 4) {
      ctx.moveTo(s.points[0] * w, s.points[1] * h);
      ctx.lineTo(s.points[2] * w, s.points[3] * h);
    } else {
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

    if (s.points.length >= 2) {
      const tipX = s.points[s.points.length - 2] * w;
      const tipY = s.points[s.points.length - 1] * h;
      const dotRadius = Math.max(4, (s.width * (w / REF_WIDTH)) * 1.1);
      ctx.fillStyle = laserColor;
      ctx.beginPath();
      ctx.arc(tipX, tipY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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
