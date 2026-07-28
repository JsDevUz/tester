import { jsPDF } from "jspdf";
import type { CsBoardMode, CsNotebookStyle, CsStroke } from "../../api/classroom";
import { drawStroke } from "./ClassroomPdfViewer";

// Eksport uchun sahifa render kengligi — REF_WIDTH bilan bir xil bo'lishi
// shart emas, lekin baland bo'lgani sari chiziqlar/matn sifatliroq chiqadi.
const EXPORT_WIDTH = 1600;
const A4_RATIO = 297 / 210; // balandlik/kenglik

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Daftar foni (katak/yo'l-yo'l) — ClassroomPdfPage'dagi CSS backgroundImage
// bilan bir xil proporsiyada (A4 kengligiga nisbiy), lekin canvas chiziqlari
// sifatida — CSS orqa fon eksport rasmida umuman ko'rinmagani uchun kerak.
function drawNotebookBackground(ctx: CanvasRenderingContext2D, w: number, h: number, style: CsNotebookStyle) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (style === "plain") {
    ctx.restore();
    return;
  }
  ctx.strokeStyle = "rgba(96,165,250,.28)";
  ctx.lineWidth = 1;
  if (style === "lined") {
    const step = w / 30;
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else {
    const step = w / 42;
    ctx.strokeStyle = "rgba(96,165,250,.22)";
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function renderPageToCanvas(params: {
  mode: CsBoardMode;
  notebookStyle: CsNotebookStyle;
  pageUrl?: string;
  strokes: CsStroke[];
  width: number;
  fallbackHeight: number;
}): Promise<HTMLCanvasElement> {
  const { mode, notebookStyle, pageUrl, strokes, width, fallbackHeight } = params;
  const canvas = document.createElement("canvas");

  let height = fallbackHeight;
  let img: HTMLImageElement | null = null;
  if (mode === "pdf" && pageUrl) {
    img = await loadImage(pageUrl);
    height = Math.round(width * (img.naturalHeight / img.naturalWidth));
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  if (mode === "notebook") {
    drawNotebookBackground(ctx, width, height, notebookStyle);
  } else if (img) {
    ctx.drawImage(img, 0, 0, width, height);
  }

  // stroke.points doim 0..1 normalized, shu sahifaning w/h'iga nisbiy —
  // shuning uchun bu yerda haqiqiy sahifa o'lchami (PDF rasm nisbatiga mos
  // yoki notebook uchun A4) qanday bo'lishidan qat'i nazar strokelar
  // to'g'ri joyda chiqadi (canvas'dagi live render bilan bir xil formula).
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, width, height);
  }

  return canvas;
}

export interface ExportBoardParams {
  mode: CsBoardMode;
  notebookPageStyles: Record<number, CsNotebookStyle>;
  pageUrls: string[];
  strokesByPage: Record<number, CsStroke[]>;
  pageCount: number;
  fileName: string;
}

// Daftar yoki PDF taxtasining barcha sahifalarini bitta ko'p sahifali PDF
// faylga yig'ib, brauzerda yuklab olishni ishga tushiradi.
export async function exportBoardToPdf(params: ExportBoardParams): Promise<void> {
  const { mode, notebookPageStyles, pageUrls, strokesByPage, pageCount, fileName } = params;
  const width = EXPORT_WIDTH;
  const fallbackHeight = Math.round(EXPORT_WIDTH * A4_RATIO);

  let pdf: jsPDF | null = null;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const canvas = await renderPageToCanvas({
      mode,
      notebookStyle: notebookPageStyles[pageNumber] ?? "grid",
      pageUrl: pageUrls[pageNumber - 1],
      strokes: strokesByPage[pageNumber] ?? [],
      width,
      fallbackHeight,
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const format: [number, number] = [canvas.width, canvas.height];
    if (!pdf) {
      pdf = new jsPDF({ orientation: "portrait", unit: "px", format });
    } else {
      pdf.addPage(format, "portrait");
    }
    pdf.addImage(dataUrl, "JPEG", 0, 0, canvas.width, canvas.height);
  }

  pdf?.save(fileName);
}
