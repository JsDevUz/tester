# LaTeX Formula Paste Support in Lesson Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a teacher pastes plain text containing `$...$` (inline) or `$$...$$` (display) LaTeX into the lesson content editor, the formula renders as real math notation — both in the teacher's editor and on the student-facing lesson page — instead of showing raw LaTeX source.

**Architecture:** A new pure module (`apps/frontend/src/utils/latexPaste.ts`) detects `$...$`/`$$...$$` segments in a plain-text string and converts the whole string into an HTML string, using `katex.renderToString` for formula segments and HTML-escaping for the surrounding text. `EditorBlock.tsx`'s existing `handlePaste` handler calls this module before its current `looksLikeMarkdown` check; if the module finds no formula, paste falls through unchanged. The resulting HTML is fed through BlockNote's existing `editor.tryParseHTMLToBlocks()` and inserted with the same block-replacement logic already used for markdown paste. KaTeX's CSS is imported once globally so both the editor and the student-facing `dangerouslySetInnerHTML` render correctly.

**Tech Stack:** React, TypeScript, BlockNote (`@blocknote/core`/`react`/`mantine`), KaTeX (`katex` npm package), Vite.

## Global Constraints

- Only `text/plain` clipboard data is inspected for `$...$`/`$$...$$` — `text/html` clipboard payloads (e.g. Word equation objects) are explicitly out of scope (per spec).
- `katex.renderToString` must be called with `{ throwOnError: false }` — malformed LaTeX must render an inline KaTeX error span, never throw or drop the paste.
- Inline formulas (`$...$`) must not match across a newline; display formulas (`$$...$$`) may span multiple lines.
- No manual formula-authoring UI (no slash-menu command, no BlockNote schema changes) — paste-time detection only, per spec scope.
- KaTeX CSS loads globally (one import in `apps/frontend/src/index.css`), not per-component.

---

## File Structure

- **Create** `apps/frontend/src/utils/latexPaste.ts` — pure text→HTML conversion logic (detection regex, KaTeX rendering, HTML escaping, line/paragraph assembly). No React, no DOM, no BlockNote imports — testable in isolation.
- **Modify** `apps/frontend/src/components/course/EditorBlock.tsx` — wire the new module into `handlePaste`.
- **Modify** `apps/frontend/src/index.css` — add the global KaTeX CSS import.
- **Modify** `apps/frontend/package.json` — add `katex` dependency (via `npm install`, not hand-edited).

---

### Task 1: `latexPaste.ts` — detection and HTML conversion module

**Files:**
- Create: `apps/frontend/src/utils/latexPaste.ts`
- Test: `apps/frontend/src/utils/latexPaste.test.ts`

**Interfaces:**
- Consumes: `katex` package (`katex.renderToString(latex: string, options: { throwOnError: boolean; displayMode: boolean }): string`), installed in Task 2.
- Produces: `containsLatex(text: string): boolean` and `convertLatexToHtml(text: string): string`, both consumed by `EditorBlock.tsx` in Task 3.

This task is written before Task 2 (dependency install) so the failing-test step is meaningful, but since the module imports `katex` directly, **Task 2 (installing `katex`) must be done first in execution order** — do Task 2, then come back and do Task 1's steps. (Numbering reflects file-responsibility order, not execution order; the execution order is stated explicitly at the start of each task.)

- [ ] **Step 1: Install `katex` first (prerequisite for this task — see Task 2 for full details)**

Run:
```bash
cd apps/frontend && npm install katex
```
Expected: `package.json` gains a `"katex"` entry under `dependencies`; `package-lock.json` updates. Confirm with:
```bash
node -e "console.log(require('./apps/frontend/node_modules/katex/package.json').version)"
```
Expected output: a version string like `0.18.1` (exact patch version may differ; any `0.18.x` or later `katex` is fine).

- [ ] **Step 2: Write the failing test file**

Create `apps/frontend/src/utils/latexPaste.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/utils/latexPaste.test.ts`
Expected: FAIL — `Cannot find module './latexPaste'` (file doesn't exist yet).

If `vitest` isn't configured yet in this project, check first:
```bash
cd apps/frontend && cat package.json | grep -i vitest
```
If there's no `vitest` devDependency or `test` script, install it as a devDependency before proceeding:
```bash
cd apps/frontend && npm install -D vitest
```
And confirm `vite.config.ts` doesn't need a `test` block for basic `vitest run <file>` invocation — plain `npx vitest run <path>` works without one for simple `describe`/`it`/`expect` tests using `vitest` globals imported explicitly (as done above via `import { describe, expect, it } from 'vitest'`), so no config change is required.

- [ ] **Step 4: Write `latexPaste.ts`**

Create `apps/frontend/src/utils/latexPaste.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/utils/latexPaste.test.ts`
Expected: PASS — all 11 tests green.

If the "does not treat a newline-spanning $...$" test fails because `splitIntoSegments` is called per-line (splitting on `\n` before segment detection means a `$` on one line can never see a `$` on the next line), this is actually already guaranteed correct by construction (each line is processed independently) — if it fails for another reason, inspect the actual vs. expected HTML output and adjust the regex escaping, not the newline-splitting structure.

- [ ] **Step 6: Commit**

```bash
cd apps/frontend && git add src/utils/latexPaste.ts src/utils/latexPaste.test.ts package.json package-lock.json
git commit -m "feat: add LaTeX paste-detection and KaTeX HTML conversion utility"
```

---

### Task 2: Install `katex` and load its CSS globally

**Files:**
- Modify: `apps/frontend/package.json` (via `npm install`, already done as part of Task 1 Step 1 — this task documents the CSS wiring that depends on it)
- Modify: `apps/frontend/src/index.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: global availability of KaTeX's stylesheet for both `EditorBlock.tsx` (Task 3) and the student-facing render in `MyCoursesPage.tsx:1080-1081` (no code change needed there — it inherits the global CSS automatically).

**Note:** `npm install katex` was already run in Task 1 Step 1 (it had to happen first so `latexPaste.ts` could import `katex`). This task only adds the CSS import — if you're executing tasks out of order, confirm `katex` is already in `apps/frontend/package.json` dependencies before proceeding; if not, run `cd apps/frontend && npm install katex` now.

- [ ] **Step 1: Confirm `katex` is installed**

Run:
```bash
cd apps/frontend && grep '"katex"' package.json
```
Expected: a line like `"katex": "^0.18.1",` under `dependencies`. If missing, run `npm install katex` before continuing.

- [ ] **Step 2: Add the global KaTeX CSS import**

Read the current top of `apps/frontend/src/index.css` to confirm the exact first line, then add the KaTeX import directly after the Tailwind import:

```css
@import "tailwindcss";
@import "katex/dist/katex.min.css";
```

(The existing `@import "tailwindcss";` line stays first; add the KaTeX import as the new second line, immediately after it, before any of the existing custom CSS rules in the file.)

- [ ] **Step 3: Verify the dev server builds without errors**

Run:
```bash
cd apps/frontend && npx vite build --mode development 2>&1 | tail -30
```
Expected: build completes with no errors mentioning `katex` or `index.css`. (A full production build is used here only as a fast way to confirm Vite can resolve and bundle the new CSS import — this does not deploy anything.)

- [ ] **Step 4: Commit**

```bash
cd apps/frontend && git add src/index.css
git commit -m "feat: load KaTeX stylesheet globally for editor and student lesson views"
```

---

### Task 3: Wire LaTeX detection into `EditorBlock.tsx`'s paste handler

**Files:**
- Modify: `apps/frontend/src/components/course/EditorBlock.tsx:1-16` (imports), `:98-123` (`handlePaste`)

**Interfaces:**
- Consumes: `containsLatex(text: string): boolean` and `convertLatexToHtml(text: string): string` from `apps/frontend/src/utils/latexPaste.ts` (Task 1). Also consumes existing `editor.tryParseHTMLToBlocks(html: string): Promise<Block[]>` (BlockNote API, already used at `EditorBlock.tsx:61`) and the existing empty-paragraph/insert-after block-placement logic already present in `handlePaste`.
- Produces: no new exports — this is the terminal integration point for Task 1's module.

This task has no automated test (it wires DOM clipboard events into a live ProseMirror editor instance, which isn't practical to unit-test in this codebase — there is no existing test harness for `EditorBlock.tsx` or any BlockNote component). Verification is manual, via the dev server, as specified in the steps below.

- [ ] **Step 1: Add the import**

In `apps/frontend/src/components/course/EditorBlock.tsx`, add this import alongside the existing local imports (after the `MediaLibraryModal` import on line 15):

```ts
import { containsLatex, convertLatexToHtml } from '../../utils/latexPaste';
```

- [ ] **Step 2: Extend `handlePaste` to check for LaTeX before the markdown check**

Replace the current `handlePaste` function body:

```tsx
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const markdown = event.clipboardData.getData('text/plain');
    if (!markdown || !looksLikeMarkdown(markdown)) return;

    const blocks = editor.tryParseMarkdownToBlocks(markdown);
    if (blocks.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const currentBlock = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      Array.isArray(currentBlock.content) &&
      currentBlock.content.length === 0;

    if (editor.document.length === 1 && isEmptyParagraph) {
      editor.replaceBlocks(editor.document, blocks);
    } else if (isEmptyParagraph) {
      editor.replaceBlocks([currentBlock.id], blocks);
    } else {
      editor.insertBlocks(blocks, currentBlock.id, 'after');
    }

    void handleChange();
  }
```

with:

```tsx
  function insertParsedBlocks(blocks: Awaited<ReturnType<typeof editor.tryParseMarkdownToBlocks>>) {
    if (blocks.length === 0) return false;

    const currentBlock = editor.getTextCursorPosition().block;
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      Array.isArray(currentBlock.content) &&
      currentBlock.content.length === 0;

    if (editor.document.length === 1 && isEmptyParagraph) {
      editor.replaceBlocks(editor.document, blocks);
    } else if (isEmptyParagraph) {
      editor.replaceBlocks([currentBlock.id], blocks);
    } else {
      editor.insertBlocks(blocks, currentBlock.id, 'after');
    }

    void handleChange();
    return true;
  }

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;

    if (containsLatex(text)) {
      const html = convertLatexToHtml(text);
      const blocks = await editor.tryParseHTMLToBlocks(html);
      if (insertParsedBlocks(blocks)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (!looksLikeMarkdown(text)) return;

    const blocks = editor.tryParseMarkdownToBlocks(text);
    if (insertParsedBlocks(blocks)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
```

Note: `handlePaste` becomes `async`. Confirm `onPasteCapture={handlePaste}` at line 143 still type-checks with an async handler (React's `ClipboardEventHandler` accepts a function returning `void | Promise<void>`-compatible signatures loosely via `any` return, but to be safe, wrap the call site: change `onPasteCapture={handlePaste}` to `onPasteCapture={(e) => void handlePaste(e)}`).

- [ ] **Step 3: Update the JSX call site for the now-async handler**

In the same file, find:

```tsx
    <div
      className="course-editor rounded-2xl bg-white py-2"
      onPasteCapture={handlePaste}
    >
```

Replace with:

```tsx
    <div
      className="course-editor rounded-2xl bg-white py-2"
      onPasteCapture={(event) => void handlePaste(event)}
    >
```

- [ ] **Step 4: Typecheck**

Run:
```bash
cd apps/frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "EditorBlock"
```
Expected: no output (no errors referencing `EditorBlock.tsx`).

- [ ] **Step 5: Manual verification — start the dev server**

Run:
```bash
cd apps/frontend && npm run dev
```

Open the app, navigate to a course's lesson editor (teacher/curator view), open an "editor" content block, and paste the following plain text directly into it (select the text below, copy, and paste into the editor):

```
asalan: $\text{تَنْصُرُ} \rightarrow \text{أُنْصُرْ}$ (Unsur).
```

Expected: the pasted line shows "asalan: " as plain text, followed by a rendered math expression (arrow between two boxed/styled Arabic terms in KaTeX's typeset style), followed by " (Unsur)." as plain text — no literal `\text{}`, `\rightarrow`, or `$` characters visible.

- [ ] **Step 6: Manual verification — regression check on existing markdown paste**

In the same editor, paste plain text with no `$` characters that matches the existing markdown heuristics, e.g.:

```
# Heading test
- bullet one
- bullet two
```

Expected: still converts to a heading + bulleted list exactly as it did before this change (unchanged behavior, confirming the LaTeX branch doesn't interfere when no `$` is present).

- [ ] **Step 7: Manual verification — malformed LaTeX doesn't crash paste**

Paste:

```
broken formula: $\frac{1$ end
```

Expected: no crash, no blank/dropped paste. The formula segment renders as a KaTeX error (typically shown in red/error styling by KaTeX's default CSS) instead of the raw `\frac{1` text, and "broken formula: " / " end" remain as plain text on the same line.

- [ ] **Step 8: Manual verification — student-facing render**

Save the lesson (wait for the debounced autosave, ~1.5s, or navigate away and back to confirm persistence), then open the same lesson from the student-facing course view (`MyCoursesPage.tsx`'s `LessonReader`). Confirm the formula from Step 5 renders identically (same KaTeX typeset styling) as it did in the editor — this confirms the global CSS from Task 2 covers the student render path.

- [ ] **Step 9: Commit**

```bash
cd apps/frontend && git add src/components/course/EditorBlock.tsx
git commit -m "feat: detect and render pasted LaTeX formulas in the lesson editor"
```

---

## Self-Review Notes

- **Spec coverage:** Detection of `$...$`/`$$...$$` in plain-text paste (Task 1, 3), KaTeX rendering with graceful error handling (Task 1 step 4, tested in step 2's malformed-LaTeX case, verified manually in Task 3 step 7), mixed text+formula same-line rendering (Task 1's line-based segment assembly, tested and manually verified in Task 3 step 5), global CSS so both teacher and student views render correctly (Task 2), no BlockNote schema/manual-authoring changes (confirmed — no schema edits in any task), out-of-scope `text/html` clipboard math objects (not touched — only `text/plain` is read in Task 3 step 2, matching existing `handlePaste` behavior). All spec requirements are covered.
- **Placeholder scan:** No TBD/TODO; all code blocks are complete and paste-ready.
- **Type consistency:** `containsLatex`/`convertLatexToHtml` names and signatures match between Task 1 (definition) and Task 3 (usage). `insertParsedBlocks` is introduced and used consistently within Task 3 only.
