import sharp from 'sharp';
import { MAX_PDF_PAGES, PDF_RENDER_WIDTH } from './classroom.logic';

// mupdf'dan ishlatiladigan minimal yuza — testlarda fake beriladi
export interface PdfEngine {
  openDocument(buffer: Buffer): PdfEngineDoc;
}

export interface PdfEngineDoc {
  countPages(): number;
  renderPagePng(pageIndex: number, targetWidth: number): Buffer;
  destroy(): void;
}

export class PdfConversionError extends Error {}

// mupdf ESM-only (top-level await) — CJS buildda oddiy import ishlamaydi,
// shuning uchun real dynamic import() ga majburlaymiz.
let enginePromise: Promise<PdfEngine> | null = null;
function loadMupdfEngine(): Promise<PdfEngine> {
  if (!enginePromise) {
    enginePromise = (new Function('return import("mupdf")')() as Promise<typeof import('mupdf')>).then(
      (mupdf): PdfEngine => ({
        openDocument(buffer: Buffer) {
          const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
          return {
            countPages: () => doc.countPages(),
            renderPagePng(pageIndex: number, targetWidth: number) {
              const page = doc.loadPage(pageIndex);
              try {
                const [x0, , x1] = page.getBounds();
                const scale = targetWidth / Math.max(1, x1 - x0);
                const pixmap = page.toPixmap(
                  mupdf.Matrix.scale(scale, scale),
                  mupdf.ColorSpace.DeviceRGB,
                  false,
                  true,
                );
                try {
                  return Buffer.from(pixmap.asPNG());
                } finally {
                  pixmap.destroy();
                }
              } finally {
                page.destroy();
              }
            },
            destroy: () => doc.destroy(),
          };
        },
      }),
    );
  }
  return enginePromise;
}

// Har bir sahifani PDF_RENDER_WIDTH kenglikda WebP rasmga aylantiradi.
export async function convertPdfToPageImages(pdfBuffer: Buffer, engine?: PdfEngine): Promise<Buffer[]> {
  const eng = engine ?? (await loadMupdfEngine());
  let doc: PdfEngineDoc;
  try {
    doc = eng.openDocument(pdfBuffer);
  } catch {
    throw new PdfConversionError('PDF_INVALID');
  }
  try {
    const pageCount = doc.countPages();
    if (pageCount === 0) throw new PdfConversionError('PDF_EMPTY');
    if (pageCount > MAX_PDF_PAGES) throw new PdfConversionError('PDF_TOO_MANY_PAGES');

    const images: Buffer[] = [];
    for (let i = 0; i < pageCount; i++) {
      const png = doc.renderPagePng(i, PDF_RENDER_WIDTH);
      images.push(await sharp(png).webp({ quality: 80 }).toBuffer());
    }
    return images;
  } finally {
    doc.destroy();
  }
}
