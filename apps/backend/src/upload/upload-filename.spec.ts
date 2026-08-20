import { decodeUploadFilename } from './upload-filename';

/** Mimics what Busboy hands us: UTF-8 bytes read back as latin-1. */
function asMultipartWouldDeliver(name: string): string {
  return Buffer.from(name, 'utf8').toString('latin1');
}

describe('decodeUploadFilename', () => {
  it('restores a Cyrillic name mangled into latin-1', () => {
    const original = '2026-07-17-Заметка-21-18_аннотация.pdf';
    expect(decodeUploadFilename(asMultipartWouldDeliver(original))).toBe(original);
  });

  it("restores Uzbek's oʻ and gʻ", () => {
    const original = "Oʻzbek tili — 1-dars (gʻoya).pdf";
    expect(decodeUploadFilename(asMultipartWouldDeliver(original))).toBe(original);
  });

  it('leaves a plain ASCII name untouched', () => {
    expect(decodeUploadFilename("Ism va F'el taqsimoti.pdf")).toBe("Ism va F'el taqsimoti.pdf");
  });

  it('leaves an already-correct UTF-8 name untouched', () => {
    // Some clients do send UTF-8 straight through; re-decoding must not corrupt it.
    expect(decodeUploadFilename('Заметка.pdf')).toBe('Заметка.pdf');
  });

  it('returns the input unchanged when the bytes are not valid UTF-8', () => {
    // A genuinely latin-1 name: 0xE9 alone is not a valid UTF-8 sequence.
    const latin1Only = 'cafééé.pdf';
    expect(decodeUploadFilename(latin1Only)).toBe(latin1Only);
  });

  it('handles an empty name', () => {
    expect(decodeUploadFilename('')).toBe('');
  });
});
