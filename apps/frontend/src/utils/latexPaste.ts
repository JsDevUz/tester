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
