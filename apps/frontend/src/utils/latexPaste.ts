const DISPLAY_PATTERN = /\$\$([\s\S]+?)\$\$/g;
// Requires the captured content to start and end with a non-whitespace
// character (a single non-whitespace char is also valid). This prevents a
// price mention like "$5 but formula is $" from being mistaken for a
// formula boundary, since its content ends in whitespace right before the
// next literal $ — the regex backtracks past it to find the real formula.
const INLINE_PATTERN = /\$(\S(?:[^\n$]*\S)?)\$/g;

export type LatexSegment =
  | { type: 'text'; value: string }
  | { type: 'formula'; latex: string; display: boolean };

/**
 * Splits plain text into ordered text/formula segments. Display ($$...$$)
 * formulas may span multiple lines; inline ($...$) formulas never match
 * across a newline (enforced by INLINE_PATTERN excluding '\n').
 */
export function splitLatexSegments(text: string): LatexSegment[] {
  const segments: LatexSegment[] = [];
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
      const gapSegments: LatexSegment[] = [];
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

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const BULLET_PATTERN = /^[-*+]\s+(.*)$/;
const NUMBERED_PATTERN = /^\d+\.\s+(.*)$/;

export type LineBlock =
  | { blockType: 'heading'; level: number; segments: LatexSegment[] }
  | { blockType: 'bulletListItem'; segments: LatexSegment[] }
  | { blockType: 'numberedListItem'; segments: LatexSegment[] }
  | { blockType: 'paragraph'; segments: LatexSegment[] };

/**
 * Splits multi-line text (that may mix markdown structure — headings,
 * bullet/numbered lists — with $...$/$$...$$ LaTeX formulas on any line)
 * into one LineBlock per non-empty line, each carrying its own text/formula
 * segments. Unlike routing the whole paste through either a pure-markdown
 * parser or a pure-LaTeX inserter, this lets a single paste correctly
 * preserve BOTH markdown block structure AND inline formulas together —
 * the two are not mutually exclusive in real pasted content (e.g. a lesson
 * with headings, lists, and a formula-bearing paragraph in the same paste).
 */
export function textToLineBlocks(text: string): LineBlock[] {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): LineBlock => {
      const headingMatch = HEADING_PATTERN.exec(line);
      if (headingMatch) {
        return { blockType: 'heading', level: headingMatch[1].length, segments: splitLatexSegments(headingMatch[2]) };
      }
      const bulletMatch = BULLET_PATTERN.exec(line);
      if (bulletMatch) {
        return { blockType: 'bulletListItem', segments: splitLatexSegments(bulletMatch[1]) };
      }
      const numberedMatch = NUMBERED_PATTERN.exec(line);
      if (numberedMatch) {
        return { blockType: 'numberedListItem', segments: splitLatexSegments(numberedMatch[1]) };
      }
      return { blockType: 'paragraph', segments: splitLatexSegments(line) };
    });
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li';

/**
 * Splits pasted `text/html` (not `text/plain`) into one LineBlock per
 * "leaf" block-level element (heading/paragraph/list item), each carrying
 * its own text/formula segments from its text content.
 *
 * This exists because real clipboard sources (Google Docs, Notion, etc.)
 * commonly put NO newlines between paragraphs in their `text/plain`
 * payload — the paragraph/heading structure only exists in `text/html`
 * (as actual <h1>/<p>/<li> elements). Splitting `text/plain` on '\n' in
 * that case yields a single giant line, losing all block structure even
 * though the source visually had headings and lists. Parsing the HTML
 * instead recovers the real structure.
 *
 * "Leaf" elements: an element matching BLOCK_SELECTOR is skipped if it
 * itself contains another BLOCK_SELECTOR match — this avoids double-
 * counting Google Docs' <li><p>...</p></li> nesting (both the <li> and
 * its inner <p> would otherwise match and yield duplicate text).
 */
export function htmlToLineBlocks(html: string): LineBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const elements = Array.from(doc.body.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (el) => !el.querySelector(BLOCK_SELECTOR),
  );

  return elements
    .map((el): LineBlock | null => {
      const text = (el.textContent ?? '').trim();
      if (!text) return null;

      if (HEADING_TAGS.has(el.tagName)) {
        const level = Number(el.tagName[1]);
        return { blockType: 'heading', level, segments: splitLatexSegments(text) };
      }
      // Check for an enclosing <li> BEFORE the plain-tag check below — the
      // leaf element itself may be a <p> nested inside a <li> (Google Docs'
      // <li><p>...</p></li> pattern), in which case el.tagName is "P", not
      // "LI", but it should still be classified as a list item.
      const li = el.closest('li');
      if (li) {
        const isOrdered = li.parentElement?.tagName === 'OL';
        return {
          blockType: isOrdered ? 'numberedListItem' : 'bulletListItem',
          segments: splitLatexSegments(text),
        };
      }
      return { blockType: 'paragraph', segments: splitLatexSegments(text) };
    })
    .filter((block): block is LineBlock => block !== null);
}
