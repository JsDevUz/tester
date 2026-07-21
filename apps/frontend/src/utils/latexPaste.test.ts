import { describe, expect, it } from 'vitest';
import { containsLatex, convertLatexToHtml } from './latexPaste';

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

describe('convertLatexToHtml', () => {
  it('renders plain text with no formula as an escaped paragraph', () => {
    const html = convertLatexToHtml('Hello & <world>');
    expect(html).toBe('<p>Hello &amp; &lt;world&gt;</p>');
  });

  it('renders an inline formula inside surrounding text on one line', () => {
    const html = convertLatexToHtml('asalan: $\\text{a}$ (misol).');
    expect(html).toContain('<p>asalan: ');
    expect(html).toContain('(misol).</p>');
    expect(html).toContain('class="katex"');
  });

  it('renders a display formula without inline surrounding text collapsing it', () => {
    const html = convertLatexToHtml('$$\\text{a} \\rightarrow \\text{b}$$');
    expect(html).toContain('class="katex-display"');
  });

  it('produces an inline katex-error span for malformed LaTeX instead of throwing', () => {
    expect(() => convertLatexToHtml('$\\frac{1$')).not.toThrow();
    const html = convertLatexToHtml('$\\frac{1$');
    expect(html).toContain('katex-error');
  });

  it('does not treat a newline-spanning $...$ as one inline formula', () => {
    const html = convertLatexToHtml('$a\nb$');
    // No closing $ on the same line as the opening $, so both $ are treated as literal text.
    expect(html).not.toContain('class="katex"');
    expect(html).toContain('$a');
    expect(html).toContain('b$');
  });

  it('renders multiple lines as separate paragraphs, preserving order', () => {
    const html = convertLatexToHtml('first line\nsecond line with $\\text{x}$ formula');
    const firstIdx = html.indexOf('first line');
    const secondIdx = html.indexOf('second line');
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(html).toContain('class="katex"');
  });

  it('escapes HTML special characters in the plain-text portions around a formula', () => {
    const html = convertLatexToHtml('<b>bold?</b> $\\text{x}$ & more');
    expect(html).toContain('&lt;b&gt;bold?&lt;/b&gt;');
    expect(html).toContain('&amp; more');
  });
});
