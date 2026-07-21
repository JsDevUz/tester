// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { containsLatex, splitLatexSegments, textToLineBlocks, htmlToLineBlocks } from './latexPaste';

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

describe('textToLineBlocks', () => {
  it('classifies a heading line and strips the # prefix', () => {
    const blocks = textToLineBlocks('# Heading text');
    expect(blocks).toEqual([
      { blockType: 'heading', level: 1, segments: [{ type: 'text', value: 'Heading text' }] },
    ]);
  });

  it('classifies a level-2 heading', () => {
    const blocks = textToLineBlocks('## Sub heading');
    expect(blocks).toEqual([
      { blockType: 'heading', level: 2, segments: [{ type: 'text', value: 'Sub heading' }] },
    ]);
  });

  it('classifies a bullet list line and strips the marker', () => {
    const blocks = textToLineBlocks('- bullet item');
    expect(blocks).toEqual([
      { blockType: 'bulletListItem', segments: [{ type: 'text', value: 'bullet item' }] },
    ]);
  });

  it('classifies a numbered list line and strips the marker', () => {
    const blocks = textToLineBlocks('1. first step');
    expect(blocks).toEqual([
      { blockType: 'numberedListItem', segments: [{ type: 'text', value: 'first step' }] },
    ]);
  });

  it('classifies a plain line as a paragraph', () => {
    const blocks = textToLineBlocks('just plain text');
    expect(blocks).toEqual([
      { blockType: 'paragraph', segments: [{ type: 'text', value: 'just plain text' }] },
    ]);
  });

  it('drops empty lines', () => {
    const blocks = textToLineBlocks('first\n\nsecond');
    expect(blocks).toEqual([
      { blockType: 'paragraph', segments: [{ type: 'text', value: 'first' }] },
      { blockType: 'paragraph', segments: [{ type: 'text', value: 'second' }] },
    ]);
  });

  it('preserves a formula inside a heading line', () => {
    const blocks = textToLineBlocks('# Title with $\\text{a}$ formula');
    expect(blocks).toEqual([
      {
        blockType: 'heading',
        level: 1,
        segments: [
          { type: 'text', value: 'Title with ' },
          { type: 'formula', latex: '\\text{a}', display: false },
          { type: 'text', value: ' formula' },
        ],
      },
    ]);
  });

  it('handles the realistic mixed lesson excerpt end to end (headings + list + formulas)', () => {
    const sample = [
      "# 7-dars: Buyruq fe'li qanday yasaladi?",
      "Kitobimizning 14-sahifasida buyruq fe'li haqida.",
      "1. 1-bosqich: Muxotab shaklini olamiz: $\\text{a}$.",
      "## Ikkinchi savol",
    ].join('\n');
    const blocks = textToLineBlocks(sample);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ blockType: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ blockType: 'paragraph' });
    expect(blocks[2]).toMatchObject({ blockType: 'numberedListItem' });
    expect((blocks[2] as { segments: unknown[] }).segments).toContainEqual({ type: 'formula', latex: '\\text{a}', display: false });
    expect(blocks[3]).toMatchObject({ blockType: 'heading', level: 2 });
  });
});

describe('htmlToLineBlocks', () => {
  it('extracts a heading and a paragraph as separate blocks', () => {
    const html = '<h1>Title</h1><p>Body text</p>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      { blockType: 'heading', level: 1, segments: [{ type: 'text', value: 'Title' }] },
      { blockType: 'paragraph', segments: [{ type: 'text', value: 'Body text' }] },
    ]);
  });

  it('extracts a level-2 heading', () => {
    const blocks = htmlToLineBlocks('<h2>Sub heading</h2>');
    expect(blocks).toEqual([
      { blockType: 'heading', level: 2, segments: [{ type: 'text', value: 'Sub heading' }] },
    ]);
  });

  it('classifies <ol><li> as numberedListItem', () => {
    const html = '<ol><li>first</li><li>second</li></ol>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      { blockType: 'numberedListItem', segments: [{ type: 'text', value: 'first' }] },
      { blockType: 'numberedListItem', segments: [{ type: 'text', value: 'second' }] },
    ]);
  });

  it('classifies <ul><li> as bulletListItem', () => {
    const html = '<ul><li>one</li></ul>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      { blockType: 'bulletListItem', segments: [{ type: 'text', value: 'one' }] },
    ]);
  });

  it('does not duplicate text when a Google-Docs-style <li><p> nesting is present', () => {
    const html = '<ol><li dir="ltr"><p dir="ltr">nested paragraph text</p></li></ol>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      { blockType: 'numberedListItem', segments: [{ type: 'text', value: 'nested paragraph text' }] },
    ]);
  });

  it('preserves a formula inside a paragraph extracted from HTML', () => {
    const html = '<p>asalan: $\\text{a}$ (misol).</p>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      {
        blockType: 'paragraph',
        segments: [
          { type: 'text', value: 'asalan: ' },
          { type: 'formula', latex: '\\text{a}', display: false },
          { type: 'text', value: ' (misol).' },
        ],
      },
    ]);
  });

  it('drops empty block elements (no text content)', () => {
    const html = '<p></p><p>real content</p>';
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toEqual([
      { blockType: 'paragraph', segments: [{ type: 'text', value: 'real content' }] },
    ]);
  });

  it('handles the exact reported Google-Docs-style excerpt (heading + paragraph + numbered list with formulas)', () => {
    const html = `<meta charset='utf-8'><b id="docs-internal-guid-x" style="font-weight:normal;">
<p dir="ltr"><span style="font-weight:700;font-size:20pt;">7-dars: Buyruq fe'li</span></p>
<p dir="ltr"><span>Kitobimizning 14-sahifasida.</span></p>
<ol style="margin-top:0;margin-bottom:0;">
  <li dir="ltr"><p dir="ltr"><span style="font-weight:700;">1-bosqich:</span><span> Muxotab shaklini olamiz: $\\text{a}$.</span></p></li>
  <li dir="ltr"><p dir="ltr"><span>2-bosqich: Boshidagi harfini olib tashlaymiz.</span></p></li>
</ol>
</b>`;
    const blocks = htmlToLineBlocks(html);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({ blockType: 'paragraph' });
    expect(blocks[1]).toMatchObject({ blockType: 'paragraph' });
    expect(blocks[2]).toMatchObject({ blockType: 'numberedListItem' });
    expect((blocks[2] as { segments: unknown[] }).segments).toContainEqual({ type: 'formula', latex: '\\text{a}', display: false });
    expect(blocks[3]).toMatchObject({ blockType: 'numberedListItem' });
  });
});
