import { describe, expect, it } from 'vitest';
import { containsLatex, splitLatexSegments } from './latexPaste';

describe('containsLatex', () => {
  it('returns false for plain text with no $ signs', () => {
    expect(containsLatex('Bu oddiy matn, formula yoq.')).toBe(false);
  });

  it('returns false for a single unmatched $ sign', () => {
    expect(containsLatex('Narxi $5 turadi')).toBe(false);
  });

  it('returns true for inline $...$ formula', () => {
    expect(containsLatex('asalan: $\\text{a}$ (misol).')).toBe(true);
  });

  it('returns true for display $$...$$ formula', () => {
    expect(containsLatex('$$\\text{a} \\rightarrow \\text{b}$$')).toBe(true);
  });
});

describe('splitLatexSegments', () => {
  it('returns a single text segment for plain text with no formula', () => {
    const segments = splitLatexSegments('Hello & <world>');
    expect(segments).toEqual([{ type: 'text', value: 'Hello & <world>' }]);
  });

  it('splits an inline formula from surrounding text on one line', () => {
    const segments = splitLatexSegments('asalan: $\\text{a}$ (misol).');
    expect(segments).toEqual([
      { type: 'text', value: 'asalan: ' },
      { type: 'formula', latex: '\\text{a}', display: false },
      { type: 'text', value: ' (misol).' },
    ]);
  });

  it('splits a display formula as its own segment', () => {
    const segments = splitLatexSegments('$$\\text{a} \\rightarrow \\text{b}$$');
    expect(segments).toEqual([
      { type: 'formula', latex: '\\text{a} \\rightarrow \\text{b}', display: true },
    ]);
  });

  it('does not treat a newline-spanning $...$ as one inline formula', () => {
    const segments = splitLatexSegments('$a\nb$');
    // No closing $ on the same line as the opening $, so the whole string stays literal text.
    expect(segments).toEqual([{ type: 'text', value: '$a\nb$' }]);
  });

  it('splits multiple lines with a formula on the second line, preserving order', () => {
    const segments = splitLatexSegments('first line\nsecond line with $\\text{x}$ formula');
    expect(segments).toEqual([
      { type: 'text', value: 'first line\nsecond line with ' },
      { type: 'formula', latex: '\\text{x}', display: false },
      { type: 'text', value: ' formula' },
    ]);
  });

  it('does not mistake a price marker for the start of an inline formula', () => {
    const segments = splitLatexSegments('Cost is $5 but formula is $x$');
    expect(segments).toEqual([
      { type: 'text', value: 'Cost is $5 but formula is ' },
      { type: 'formula', latex: 'x', display: false },
    ]);
  });
});
