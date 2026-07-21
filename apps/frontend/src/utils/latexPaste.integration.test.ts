// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BlockNoteSchema, BlockNoteEditor, defaultBlockSpecs, defaultInlineContentSpecs, createInlineContentSpec } from '@blocknote/core';
import katex from 'katex';
import { splitLatexSegments } from './latexPaste';

// Mirrors the formula inline-content spec defined in EditorBlock.tsx, so this
// test exercises the exact same paste -> insert -> export -> re-parse path
// the real editor uses, without needing a browser or React component tree.
function renderFormulaSpan(latex: string, display: boolean) {
  const span = document.createElement('span');
  span.setAttribute('data-latex', latex);
  if (display) span.setAttribute('data-display', 'true');
  span.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  return span;
}

// No `parse` function here — matches EditorBlock.tsx exactly. Passing a
// `parse` function makes BlockNote register a `tag: "*"` ProseMirror parse
// rule (getInlineContentParseRules in @blocknote/core) that runs against
// EVERY element in any pasted HTML, which breaks parsing of headings/lists/
// bold text from external sources (Google Docs etc.) into one flat
// paragraph. The formula node is still correctly re-parsed on reload via
// the standard data-inline-content-type="formula" selector rule, which
// BlockNote always registers regardless of whether `parse` is given.
const formula = createInlineContentSpec(
  {
    type: 'formula',
    content: 'none',
    propSchema: { latex: { default: '' }, display: { default: false } },
  },
  {
    render: (ic) => ({ dom: renderFormulaSpan(ic.props.latex, ic.props.display) }),
    toExternalHTML: (ic) => ({ dom: renderFormulaSpan(ic.props.latex, ic.props.display) }),
  },
);

const { video: _video, audio: _audio, file: _file, ...restBlockSpecs } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({
  blockSpecs: restBlockSpecs,
  inlineContentSpecs: { ...defaultInlineContentSpecs, formula },
});

function pasteText(editor: BlockNoteEditor<any, any, any>, text: string) {
  const content = splitLatexSegments(text).map((segment) =>
    segment.type === 'text'
      ? segment.value
      : ({ type: 'formula', props: { latex: segment.latex, display: segment.display } } as const),
  );
  editor.insertInlineContent(content as never);
}

describe('LaTeX paste survives the full BlockNote round-trip', () => {
  it('renders the exact reported Arabic sample with intact katex markup', async () => {
    const editor = BlockNoteEditor.create({ schema });
    pasteText(editor, 'asalan: $\\text{تَنْصُرُ} \\rightarrow \\text{أُنْصُرْ}$ (Unsur).');

    const exportedHtml = await editor.blocksToFullHTML(editor.document);
    expect(exportedHtml).toContain('class="katex"');
    expect(exportedHtml).toContain('asalan:');
    expect(exportedHtml).toContain('(Unsur).');
    // The visible glyph output must contain the Arabic words themselves,
    // rendered outside of the LaTeX-source annotation/data-latex attribute.
    expect(exportedHtml).toContain('<span class="mord">تَنْصُرُ</span>');
    expect(exportedHtml).toContain('<span class="mord">أُنْصُرْ</span>');
  });

  it('re-parses its own exported HTML back into a working formula (simulates reloading a saved lesson)', async () => {
    const editor1 = BlockNoteEditor.create({ schema });
    pasteText(editor1, 'asalan: $\\text{a}$ (misol).');
    const savedHtml = await editor1.blocksToFullHTML(editor1.document);

    const editor2 = BlockNoteEditor.create({ schema });
    const reparsedBlocks = await editor2.tryParseHTMLToBlocks(savedHtml);
    editor2.replaceBlocks(editor2.document, reparsedBlocks);
    const reExportedHtml = await editor2.blocksToFullHTML(editor2.document);

    expect(reExportedHtml).toContain('class="katex"');
    expect(reExportedHtml).toContain('data-latex="\\text{a}"');
  });

  it('student-facing render path (raw dangerouslySetInnerHTML, no JS) shows the same static KaTeX markup that was saved', async () => {
    const editor = BlockNoteEditor.create({ schema });
    pasteText(editor, '$$\\text{a} \\rightarrow \\text{b}$$');
    const savedHtml = await editor.blocksToFullHTML(editor.document);

    // The student page does `dangerouslySetInnerHTML={{ __html: block.html }}`
    // with no JS re-render step, so the saved HTML itself must already
    // contain the fully-formed KaTeX output (no client-side KaTeX call
    // needed on the student side).
    expect(savedHtml).toContain('class="katex-display"');
    expect(savedHtml).toContain('katex-mathml');
    expect(savedHtml).toContain('katex-html');
  });

  it('plain text with no $ markers is unaffected (regression check)', async () => {
    const editor = BlockNoteEditor.create({ schema });
    pasteText(editor, 'Bu oddiy matn, formula yoq.');
    const html = await editor.blocksToFullHTML(editor.document);
    expect(html).toContain('Bu oddiy matn, formula yoq.');
    expect(html).not.toContain('katex');
  });

  it('malformed LaTeX renders a katex-error span instead of crashing the insert', async () => {
    const editor = BlockNoteEditor.create({ schema });
    expect(() => pasteText(editor, 'broken: $\\frac{1$ end')).not.toThrow();
    const html = await editor.blocksToFullHTML(editor.document);
    expect(html).toContain('katex-error');
  });

  it('regression: pasting rich external HTML (headings/lists/bold) still parses into distinct blocks, not one flattened paragraph', async () => {
    // This is the exact failure mode caused by giving the formula inline
    // content spec a `parse` function (see comment above `formula`): every
    // heading/list/bold structure collapses into a single paragraph when
    // BlockNote's blanket `tag: "*"` parse rule is active.
    const editor = BlockNoteEditor.create({ schema });
    const richHtml = `<meta charset='utf-8'><b id="docs-internal-guid-x" style="font-weight:normal;">
<h1 dir="ltr"><span style="font-weight:700;">7-dars: Buyruq fe'li</span></h1>
<p dir="ltr"><span>Kitobimizning 14-sahifasida <b>buyruq fe'li</b> haqida.</span></p>
<ol>
  <li dir="ltr"><p dir="ltr"><span style="font-weight:700;">1-bosqich:</span><span> Muxotab shaklini olamiz</span></p></li>
  <li dir="ltr"><p dir="ltr"><span style="font-weight:700;">2-bosqich:</span><span> Boshidagi harfini olib tashlaymiz</span></p></li>
</ol>
</b>`;
    const blocks = await editor.tryParseHTMLToBlocks(richHtml);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('numberedListItem');
    expect(blocks.length).toBeGreaterThan(1);
  });
});
