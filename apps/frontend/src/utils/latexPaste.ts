import katex from 'katex';

const DISPLAY_PATTERN = /\$\$([\s\S]+?)\$\$/g;
const INLINE_PATTERN = /\$([^\n$]+?)\$/g;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

function renderFormula(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, { throwOnError: false, displayMode });
}

type Segment = { type: 'text'; value: string } | { type: 'formula'; latex: string; display: boolean };

function splitIntoSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  DISPLAY_PATTERN.lastIndex = 0;
  const displayMatches: Array<{ start: number; end: number; latex: string }> = [];
  let displayMatch: RegExpExecArray | null;
  while ((displayMatch = DISPLAY_PATTERN.exec(text)) !== null) {
    displayMatches.push({
      start: displayMatch.index,
      end: displayMatch.index + displayMatch[0].length,
      latex: displayMatch[1],
    });
  }

  function pushTextThenFormula(start: number, end: number, latex: string, display: boolean) {
    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }
    segments.push({ type: 'formula', latex, display });
    cursor = end;
  }

  if (displayMatches.length === 0) {
    // No $$...$$ blocks — scan the whole string for inline $...$ only.
    INLINE_PATTERN.lastIndex = 0;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = INLINE_PATTERN.exec(text)) !== null) {
      pushTextThenFormula(inlineMatch.index, inlineMatch.index + inlineMatch[0].length, inlineMatch[1], false);
    }
  } else {
    // Walk display matches in order; scan inline $...$ in the plain-text gaps between them.
    for (const dm of displayMatches) {
      const gap = text.slice(cursor, dm.start);
      INLINE_PATTERN.lastIndex = 0;
      let inlineMatch: RegExpExecArray | null;
      let gapCursor = 0;
      const gapSegments: Segment[] = [];
      while ((inlineMatch = INLINE_PATTERN.exec(gap)) !== null) {
        if (inlineMatch.index > gapCursor) {
          gapSegments.push({ type: 'text', value: gap.slice(gapCursor, inlineMatch.index) });
        }
        gapSegments.push({ type: 'formula', latex: inlineMatch[1], display: false });
        gapCursor = inlineMatch.index + inlineMatch[0].length;
      }
      if (gapCursor < gap.length) {
        gapSegments.push({ type: 'text', value: gap.slice(gapCursor) });
      }
      segments.push(...gapSegments);
      segments.push({ type: 'formula', latex: dm.latex, display: true });
      cursor = dm.end;
    }
  }

  if (cursor < text.length) {
    const rest = text.slice(cursor);
    INLINE_PATTERN.lastIndex = 0;
    let inlineMatch: RegExpExecArray | null;
    let restCursor = 0;
    while ((inlineMatch = INLINE_PATTERN.exec(rest)) !== null) {
      if (inlineMatch.index > restCursor) {
        segments.push({ type: 'text', value: rest.slice(restCursor, inlineMatch.index) });
      }
      segments.push({ type: 'formula', latex: inlineMatch[1], display: false });
      restCursor = inlineMatch.index + inlineMatch[0].length;
    }
    if (restCursor < rest.length) {
      segments.push({ type: 'text', value: rest.slice(restCursor) });
    }
  }

  return segments;
}

/** True if the text contains at least one $...$ or $$...$$ formula marker. */
export function containsLatex(text: string): boolean {
  DISPLAY_PATTERN.lastIndex = 0;
  if (DISPLAY_PATTERN.test(text)) return true;
  INLINE_PATTERN.lastIndex = 0;
  return INLINE_PATTERN.test(text);
}

/**
 * Converts plain text containing $...$/$$...$$ LaTeX markers into an HTML
 * string: plain-text runs are HTML-escaped and wrapped per line in <p>,
 * formula runs are rendered to KaTeX HTML inline within their line's <p>.
 */
export function convertLatexToHtml(text: string): string {
  const lines = text.split('\n');
  const htmlLines: string[] = [];

  for (const line of lines) {
    const segments = splitIntoSegments(line);
    if (segments.length === 0) {
      htmlLines.push(`<p>${escapeHtml(line)}</p>`);
      continue;
    }
    const lineHtml = segments
      .map((segment) =>
        segment.type === 'text' ? escapeHtml(segment.value) : renderFormula(segment.latex, segment.display),
      )
      .join('');
    htmlLines.push(`<p>${lineHtml}</p>`);
  }

  return htmlLines.join('');
}
