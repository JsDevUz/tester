# LaTeX Formula Paste Support in Lesson Editor — Design Spec

**Goal:** When a teacher pastes text containing inline LaTeX (`$...$`) or display LaTeX (`$$...$$`) into the lesson content editor (e.g. copied from Word/PDF), the formula renders as proper math notation instead of showing up as raw LaTeX source (`\text{...}`, `\rightarrow`, `$`). It must render correctly both in the teacher's editor and on the student-facing lesson page.

## Context

The lesson "editor" content block (`apps/frontend/src/components/course/EditorBlock.tsx`) is a BlockNote (ProseMirror/TipTap-based) rich text editor. It already has a custom `onPasteCapture={handlePaste}` handler that intercepts plain-text paste when the text matches `looksLikeMarkdown()`, converting it via `editor.tryParseMarkdownToBlocks()`. Everything else falls through to BlockNote's default HTML-paste handling.

Reported bug: pasting text like `$\text{تَنْصُرُ} \rightarrow \text{أُنْصُرْ}$ (Unsur).` from an external source shows the literal LaTeX source in the editor and on the student page — there is no math-rendering library anywhere in the codebase (`katex`, `mathjax`, `remark-math` — none present in `apps/frontend/package.json` or `src/`).

Investigation ruled out the alternate hypothesis (Arabic diacritics/combining marks being stripped) — no code in the frontend or backend filters, regexes, or normalizes Unicode combining marks anywhere in the paste → save → render pipeline. The screenshot evidence confirmed the actual issue: raw LaTeX delimiters and commands rendering as literal text because nothing recognizes or renders them as math.

## Scope

**In scope:**
- Detecting `$...$` (inline) and `$$...$$` (display) LaTeX segments in **plain-text paste** (`text/plain` clipboard data) inside the lesson editor.
- Rendering detected formula segments to HTML via KaTeX at paste time and inserting the resulting HTML into the editor alongside the surrounding plain text, preserving mixed text+formula lines (e.g. `asalan: $\text{...}$ (Unsur).`).
- Making the saved HTML render correctly on the student-facing pages that already do `dangerouslySetInnerHTML={{ __html: block.html }}` (`MyCoursesPage.tsx` lesson reader, `PracticeScreen.tsx` if applicable) — achieved automatically since KaTeX output is baked into the saved HTML at paste time; no student-side JS changes needed, only a CSS import.
- Malformed LaTeX (unclosed `$`, invalid commands) degrades gracefully — KaTeX renders an inline error span instead of throwing, so paste never crashes or silently drops content.

**Out of scope:**
- Manual formula authoring/editing UI (no "/formula" slash-menu command, no dedicated BlockNote inline-content type). If a formula renders wrong, the teacher deletes and re-pastes — same recovery model as other paste-derived content.
- Detecting LaTeX arriving via the `text/html` clipboard format (e.g. Word's native equation objects, MathML). Only `text/plain` `$...$`/`$$...$$` markers are handled, matching the reported bug's actual clipboard payload.
- Re-parsing/re-rendering formulas after they're saved (they're static HTML from that point on, like any other pasted content in this editor).
- The unrelated pre-existing lack of HTML sanitization on the student-facing render path (`dangerouslySetInnerHTML` with no DOMPurify) — flagged by investigation as a latent XSS concern, but pre-existing and out of scope for this change.

## Approach

Add `katex` as a frontend dependency. Extend `EditorBlock.tsx`'s existing `handlePaste` handler with a check that runs **before** the existing `looksLikeMarkdown` branch:

1. Read `event.clipboardData.getData('text/plain')` (already done today).
2. Run a detector regex for `$$...$$` and `$...$` segments (display checked first so `$$` isn't misread as two adjacent inline delimiters).
3. If no `$`-delimited segment is found, fall through to the existing markdown/default paste behavior unchanged.
4. If at least one segment is found, split the full pasted text into an ordered list of `{type: 'text', value}` / `{type: 'formula', latex, display}` parts, in the original order, preserving surrounding plain text and line breaks.
5. For each formula part, call `katex.renderToString(latex, { throwOnError: false, displayMode })`.
6. Reassemble all parts into one HTML string per line (plain text parts get their special HTML characters escaped; formula parts are inserted as raw KaTeX HTML), joining multiple lines as separate `<p>` blocks.
7. Feed the resulting HTML through `editor.tryParseHTMLToBlocks()` and insert with the same block-replacement logic already used for the markdown path (empty-paragraph replace vs. insert-after).

Import `katex/dist/katex.min.css` once, globally (e.g. in the app's root CSS entry point, alongside the existing `@blocknote/mantine/style.css` import pattern already used in `EditorBlock.tsx`), so the same stylesheet covers both the teacher's editor and the student-facing rendered HTML — no per-page conditional loading, no runtime KaTeX JS needed outside the editor.

### Why this approach over a custom BlockNote inline-content type

A dedicated "Formula" inline-content type (tahrirlanadigan, schema-level BlockNote element) would let teachers edit formula source after the fact, but requires extending the BlockNote schema, a custom React node view, and custom (de)serialization — substantially more code for a capability that isn't needed here (formulas only need to arrive correctly via paste; fixing a bad one means delete-and-repaste, consistent with how this editor already treats other paste-derived content). Baking KaTeX output to static HTML at paste time is a much smaller change that satisfies the actual requirement.

### Why detect on `text/plain` only, not `text/html`

The reported bug's clipboard payload is plain-text LaTeX source (confirmed by the screenshot: raw `\text{}`, `\rightarrow`, `$` all visible as literal characters, which only happens via the plain-text/markdown paste path or an HTML paste that passes them through verbatim as text). Handling `text/html` math objects (Word's OMML equations, MathML) is a different, larger problem — no evidence in the reported bug that this path is in play — so it's excluded to keep the change focused.

## Detection Regex

Two-pass detection, longest-match-first to avoid `$$...$$` being misparsed as an empty inline pair followed by more `$`:

```
display: /\$\$([\s\S]+?)\$\$/g
inline:  /\$([^\n$]+?)\$/g   (only applied to text left after display extraction)
```

Inline formulas are not allowed to span newlines (prevents accidental multi-paragraph capture from a stray unmatched `$`). Display formulas may span multiple lines.

## Error Handling

`katex.renderToString(latex, { throwOnError: false })` — on invalid LaTeX, KaTeX returns a `<span class="katex-error">` with the problem visibly marked instead of throwing. This means:
- Paste never fails or drops content because of a malformed formula.
- The teacher sees the error inline (red text, standard KaTeX behavior) and can immediately tell something needs fixing, rather than silently getting plain text back.

## Testing

- Manual test: paste the exact reported sample (`$\text{تَنْصُرُ} \rightarrow \text{أُنْصُرْ}$ (Unsur).`) into the lesson editor; confirm it renders as a math arrow expression, matches the student-facing render, and the surrounding Arabic word/parenthetical text is untouched.
- Manual test: paste plain text with no `$` at all — confirm existing markdown/default paste behavior is unchanged (regression check).
- Manual test: paste text with an unclosed `$` (e.g. `price is $5`) — confirm it does NOT get misdetected as a formula (single unmatched `$` shouldn't trigger the inline regex since it requires a closing `$`), and falls through to normal paste.
- Manual test: paste deliberately broken LaTeX (e.g. `$\frac{1$`) — confirm KaTeX error span appears instead of a crash or dropped paste.
- Manual test: paste a mixed multi-line block (like the screenshot) with several `$...$` formulas across multiple lines — confirm each line's formula renders independently and line structure is preserved.
