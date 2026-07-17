import { convertPdfToPageImages, PdfConversionError, PdfEngine } from './pdf-converter';
import { MAX_PDF_PAGES } from './classroom.logic';
import sharp from 'sharp';

// 4x4 qizil PNG — fake engine render natijasi sifatida
async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png()
    .toBuffer();
}

function fakeEngine(pageCount: number, png: Buffer, opts: { failOpen?: boolean } = {}): PdfEngine & { destroyed: boolean } {
  const engine = {
    destroyed: false,
    openDocument() {
      if (opts.failOpen) throw new Error('boom');
      return {
        countPages: () => pageCount,
        renderPagePng: () => png,
        destroy: () => { engine.destroyed = true; },
      };
    },
  };
  return engine;
}

describe('convertPdfToPageImages', () => {
  it('har sahifa uchun webp buffer qaytaradi', async () => {
    const png = await tinyPng();
    const engine = fakeEngine(3, png);
    const images = await convertPdfToPageImages(Buffer.from('pdf'), engine);
    expect(images.length).toBe(3);
    for (const img of images) {
      expect(img.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(img.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
    expect(engine.destroyed).toBe(true);
  });

  it('ochilmaydigan fayl PDF_INVALID', async () => {
    const engine = fakeEngine(1, Buffer.alloc(0), { failOpen: true });
    await expect(convertPdfToPageImages(Buffer.from('x'), engine)).rejects.toThrow(PdfConversionError);
  });

  it('bosh PDF rad etiladi', async () => {
    const engine = fakeEngine(0, Buffer.alloc(0));
    await expect(convertPdfToPageImages(Buffer.from('x'), engine)).rejects.toThrow('PDF_EMPTY');
  });

  it('sahifa limiti oshsa PDF_TOO_MANY_PAGES', async () => {
    const engine = fakeEngine(MAX_PDF_PAGES + 1, Buffer.alloc(0));
    await expect(convertPdfToPageImages(Buffer.from('x'), engine)).rejects.toThrow('PDF_TOO_MANY_PAGES');
    expect(engine.destroyed).toBe(true);
  });
});
