import { jsPDF } from "jspdf";
import type { CsBoardMode, CsNotebookOrientation, CsNotebookStyle, CsStroke } from "../../api/classroom";
import { drawStroke } from "./classroomCanvasDraw";
import { resolveConnector } from "./classroomShapeBindings";

// Eksport uchun sahifa render kengligi — REF_WIDTH bilan bir xil bo'lishi
// shart emas, lekin baland bo'lgani sari chiziqlar/matn sifatliroq chiqadi.
// A4'ni taxminan 290 DPI'da rasterlaydi.
const EXPORT_WIDTH = 2400;
const A4_RATIO = 297 / 210; // balandlik/kenglik (portrait)

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Daftar foni (katak/yo'l-yo'l/nuqtalar) — ClassroomPdfViewer.tsx va mobile
// ClassroomNotebookBackground.tsx bilan 100% bir xil proporsiya va ranglarda.
function drawNotebookBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: CsNotebookStyle,
  theme: "light" | "dark" = "light"
) {
  ctx.save();
  ctx.fillStyle = theme === "dark" ? "#1c1f26" : "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (style === "plain") {
    ctx.restore();
    return;
  }

  ctx.lineWidth = 1;
  if (style === "lined") {
    // Yo'l-yo'l (chiziqli) — web da width / 22 ga mos
    ctx.strokeStyle = "rgba(148,163,184,0.14)";
    const step = w / 22;
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (style === "dot") {
    // Nuqtali (Excalidraw uslubi) — web (width / 40) bilan 1:1 bir xil oraliq.
    ctx.fillStyle = "rgba(148,163,184,0.28)";
    const step = w / 40;
    const radius = 1 * (w / EXPORT_WIDTH);
    for (let x = step; x < w; x += step) {
      for (let y = step; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // Kataklar (grid) — web (width / 24) va mobile bilan 1:1 bir xil
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    const step = w / 24;
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
  theme: "light" | "dark";
  pageUrl?: string;
  strokes: CsStroke[];
  width: number;
  fallbackHeight: number;
}): Promise<HTMLCanvasElement> {
  const { mode, notebookStyle, theme, pageUrl, strokes, width, fallbackHeight } = params;
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
    drawNotebookBackground(ctx, width, height, notebookStyle, theme);
  } else {
    // PDF rejimida har doim orqa fon toza oq qilib to'ldiriladi
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (img) {
      ctx.drawImage(img, 0, 0, width, height);
    }
  }

  // stroke.points doim 0..1 normalized, shu sahifaning w/h'iga nisbiy —
  // canvas render bilan 100% bir xil joyda va proporsiyada chiqadi.
  for (const stroke of strokes) {
    const strokeToDraw = resolveConnector(stroke, strokes, width, height);
    drawStroke(ctx, strokeToDraw, width, height);
  }

  return canvas;
}

export interface ExportBoardParams {
  mode: CsBoardMode;
  notebookPageStyles: Record<number, CsNotebookStyle>;
  notebookPageOrientations: Record<number, CsNotebookOrientation>;
  theme?: "light" | "dark";
  pageUrls: string[];
  strokesByPage: Record<number, CsStroke[]>;
  pageCount: number;
  fileName: string;
}

// Daftar yoki PDF taxtasining barcha sahifalarini bitta ko'p sahifali PDF
// faylga yig'ib, brauzerda yuklab olishni ishga tushiradi.
export async function exportBoardToPdf(params: ExportBoardParams): Promise<void> {
  const { mode, notebookPageStyles, notebookPageOrientations, theme = "light", pageUrls, strokesByPage, pageCount, fileName } = params;
  const width = EXPORT_WIDTH;

  let pdf: jsPDF | null = null;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const isLandscape = notebookPageOrientations[pageNumber] === "landscape";
    const fallbackHeight = Math.round(
      EXPORT_WIDTH * (isLandscape ? 1 / A4_RATIO : A4_RATIO),
    );
    const canvas = await renderPageToCanvas({
      mode,
      notebookStyle: notebookPageStyles[pageNumber] ?? "grid",
      theme,
      pageUrl: pageUrls[pageNumber - 1],
      strokes: strokesByPage[pageNumber] ?? [],
      width,
      fallbackHeight,
    });

    const dataUrl = canvas.toDataURL("image/png");
    const format: [number, number] = [canvas.width, canvas.height];
    // MUHIM: jsPDF-da agar width > height bo'lsa, orientation 'landscape' bo'lishi shart!
    // Aks holda jsPDF format[width, height] ni o'zicha [height, width] deb almashtirib
    // yuboradi va tasvirni gorizontal siqib (chizmalarni buzib) qo'yadi.
    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";

    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: "px", format, compress: true });
    } else {
      pdf.addPage(format, orientation);
    }
    pdf.addImage(dataUrl, "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
  }

  pdf?.save(fileName);
}

