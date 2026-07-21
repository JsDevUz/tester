# Button and Message Content Blocks — Design Spec

**Goal:** Add two new lesson content-block types the teacher can insert from the lesson editor's block picker: a **Button** block (a styled call-to-action link) and a **Message** block (one or more static chat-bubble-style lines of text, shown as if sent by the student's curator — or the course's teacher if no curator is assigned). Both render identically for students on the lesson-reading page.

## Context

Lesson content blocks are rows in the `content_blocks` table (`apps/backend/src/db/schema.ts:101-125`), each with a `type` discriminator (`editor`, `video`, `image`, `file`, `live_class`) and a shared set of nullable columns (`html`, `fileName`, `previewUrl`, `embedUrl`, `label`, ...) reused across types. The teacher-facing lesson editor (`apps/frontend/src/components/course/LessonEditorView.tsx` renders `ContentBlockView.tsx` per block) lets a teacher add/reorder/remove blocks; students see the rendered result via `apps/frontend/src/pages/MyCoursesPage.tsx`'s `LessonBlock` component, which switches on `block.type`.

This spec was requested from two reference screenshots of a different product's block editor (a "Кнопка"/Button block with a link, colors, and an "open in new tab" toggle; and a "Сообщение"/Message block showing chat bubbles with a sender name/avatar and an "Добавить сообщение" button to add more bubbles) — reproduced here using this codebase's own color palette and patterns, not the reference product's visual style. The reference screenshots' "Добавить кнопку" (add another button) and "Добавить сообщение" (add another message bubble) buttons inside the settings modal are explicitly NOT wanted per the request ("dobovit knopka va dobovit sobsheniya btn lar kerak emas modal ichidagi") — a Button block has exactly one button, and a Message block's per-bubble add/remove happens through this app's existing block-list list actions, not a nested "add" control.

Investigation confirmed: the "message sender defaults to curator, or teacher if no curator assigned" behavior the request describes already exists correctly for the practice chat feature (`apps/backend/src/practice-messenger/practice-messenger.service.ts:619`, `resolveGroupAndCurator`: `curator?.schoolMember?.studentId ?? course.adminId`). This spec reuses that same fallback rule for the Message block's sender, implemented fresh since the Message block has no relationship to the practice-chat feature's data model.

## Scope

**In scope:**
- Backend: new `content_blocks` columns for Button props; a new `message_block_lines` child table for Message block text lines (ordered, one-to-many, since a Message block holds multiple bubble texts); a new "curator or teacher" resolver for the student-facing lesson query.
- Backend: `POST` endpoints to create a Button block and a Message block; `PATCH` extensions to edit Button props; new endpoints to add/edit/remove/reorder a Message block's lines.
- Frontend: two new entries in the lesson editor's block-type picker; a `ButtonBlockEditor` and `MessageBlockEditor` settings panel (matching this app's existing `ContentBlockView.tsx` per-block settings pattern, not a modal — see Open Question resolution below); student-facing rendering for both block types in `MyCoursesPage.tsx`'s `LessonBlock`.
- Frontend: sender avatar/name for the Message block on the student side, resolved server-side (not client-side) using the curator-or-teacher rule.

**Out of scope:**
- Nested "add another button" / "add another message line" controls inside a settings modal (explicitly rejected per the request — this app doesn't use a modal for block settings at all; see below).
- A "sender name" free-text field (the reference screenshot's "Имя отправителя" input) — the request says the sender is always the resolved curator/teacher, not editable per-block.
- Editing which specific curator gets shown if a group has more than one curator — reuses the existing single-curator-per-group resolution already used elsewhere (first curator enrollment found, matching `resolveGroupAndCurator`'s pattern).
- Rich text inside message bubbles (plain text only, matching the reference's plain textarea inputs).
- Any change to the Button/Message block once published being retroactively re-styled by a global theme — colors are set per-block at creation time, matching the reference screenshot's per-block color pickers.

## Key Finding: this app has no settings modal for blocks

The reference screenshots show a block's settings (text, link, colors, toggles) inside a collapsible "Настройки" panel within what appears to be a modal dialog. This codebase's actual pattern (`ContentBlockView.tsx`, confirmed by reading the file) renders each block's editable settings inline, in the block's own card in the lesson editor's vertical block list — there is no per-block modal anywhere in the editor. The Button and Message blocks' settings follow this same existing inline-card pattern, not a new modal. This also resolves the "no add button inside the modal" instruction naturally: since there's no modal, the question doesn't apply in the same shape — a Button block simply has one button's settings inline, and a Message block's lines are edited as an ordered list within the card, with add/remove controls styled like this app's existing list-item add/remove patterns (e.g. `PracticeBlockView`'s per-item controls), not a "Добавить" button living inside a modal footer.

## Data Model

### Button block — new columns on `content_blocks`

```
buttonUrl: text('button_url')          -- the link; null until set
buttonColor: text('button_color')      -- hex string, e.g. '#4F46E5'; null = use this app's default indigo
buttonTextColor: text('button_text_color') -- hex string; null = white
openInNewTab: boolean('open_in_new_tab').notNull().default(true)
```

Reuses the existing `label` column for the button's visible text (already present, already used by the `file` block type for its display name — consistent reuse, not a new column).

`type = 'button'` for these rows. `buttonUrl` is nullable at the DB level (a teacher can add the block before filling in a link) but the student-facing button is disabled/hidden until a URL is set (mirrors how `live_class` blocks with no valid session aren't offered to students).

### Message block — new child table `message_block_lines`

A Message block holds an ordered list of text lines (chat bubbles), so it needs a one-to-many child table rather than a single column:

```ts
export const messageBlockLines = pgTable('message_block_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentBlockId: uuid('content_block_id').notNull().references(() => contentBlocks.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull().default(0),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

`type = 'message'` for the parent `content_blocks` row. No new columns needed on `content_blocks` itself for this block type — the sender is resolved server-side at read time (see below), never stored.

## Backend Design

### New `content-blocks.service.ts` methods

- `createButtonBlock(lessonId, adminId)` — inserts a `type: 'button'` row with `label: 'Perehod'` (a sensible Uzbek-context default button text, editable immediately after), `buttonUrl: null`, `openInNewTab: true`, `buttonColor: null`, `buttonTextColor: null`. Follows the same `CONTENT_BLOCK_LIMIT` check as every other block-creation method.
- `createMessageBlock(lessonId, adminId)` — inserts a `type: 'message'` row, then inserts one `message_block_lines` row with placeholder text `''` (so the teacher immediately has one editable bubble, matching the reference screenshot's default state of one filled example bubble — except empty here since there's no scripted default content).
- `update(id, adminId, data)` — extended to accept the new Button fields (`buttonUrl?`, `buttonColor?`, `buttonTextColor?`, `openInNewTab?`) alongside the existing `html`/`label`/`embedUrl`.
- `addMessageLine(blockId, adminId)` — appends a new empty line at the end.
- `updateMessageLine(lineId, adminId, text)` — updates one line's text.
- `removeMessageLine(lineId, adminId)` — deletes one line (a Message block must keep at least 1 line; deleting the last one is rejected with a `BadRequestException`, mirroring how other list-like features in this app protect a minimum count).
- `reorderMessageLines(blockId, adminId, lineIds)` — same pattern as the existing `reorder` method for blocks.

All of the above call `assertLessonOwnership` (Button/Message block methods) or an equivalent `assertLineOwnership` that walks `line -> block -> lesson -> module -> course -> adminId` (Message line methods) — matching the existing ownership-check pattern used by every other mutation in this service.

### New `content-blocks.controller.ts` routes

```
POST   lessons/:lessonId/blocks/button           -> createButtonBlock
POST   lessons/:lessonId/blocks/message           -> createMessageBlock
POST   blocks/:blockId/message-lines              -> addMessageLine
PATCH  message-lines/:id                          -> updateMessageLine  (body: { text: string })
DELETE message-lines/:id                          -> removeMessageLine
POST   blocks/:blockId/message-lines/reorder      -> reorderMessageLines (body: { lineIds: string[] })
```

`UpdateBlockDto` (existing, in the controller) gains `@IsOptional() @IsUrl() buttonUrl?: string`, `@IsOptional() @IsString() buttonColor?: string`, `@IsOptional() @IsString() buttonTextColor?: string`, `@IsOptional() @IsBoolean() openInNewTab?: boolean`.

### Student-facing read path (`groups.service.ts`, `getMyCourseDetail`)

The `blocks` mapping (`groups.service.ts:501-523`, the block-shaping code inside `getMyCourseDetail`) gains:
- Button fields passed through as-is (`buttonUrl`, `buttonColor`, `buttonTextColor`, `openInNewTab`, existing `label`).
- For `type === 'message'` blocks: fetch `message_block_lines` ordered by `orderIndex`, and resolve the sender via a new private method `resolveCuratorOrTeacher(courseId, studentId)`:
  ```ts
  private async resolveCuratorOrTeacher(courseId: string, studentId: string) {
    // Mirrors practice-messenger.service.ts's resolveGroupAndCurator fallback
    // rule (curator if assigned, else the course's teacher/admin), reimplemented
    // here since this read path has no relationship to the practice-chat feature.
    const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
    // ... find the student's group's curator via groupEnrollments, same join
    // pattern already used earlier in this same function for `curatorName`
    // (groups.service.ts:457-471) ...
    // if curator found: return { name: curator.displayName, avatarUrl: curator.displayAvatarUrl }
    // else: return { name: course teacher's displayName, avatarUrl: ... }
  }
  ```
  This runs once per lesson fetch when message blocks are present (not once per message block — the resolved sender is the same for every message block in the course, so it's computed once and reused across all message blocks in the response, avoiding redundant queries).

## Frontend Design

### Types (`apps/frontend/src/api/contentBlocks.ts`)

```ts
export interface ApiContentBlock {
  // ...existing fields...
  type: 'editor' | 'video' | 'image' | 'file' | 'live_class' | 'button' | 'message';
  buttonUrl: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
  openInNewTab: boolean;
  messageLines?: { id: string; text: string; orderIndex: number }[]; // only present for type: 'message'
}
```

Student-facing type (`apps/frontend/src/api/groups.ts`'s `ApiMyLesson`/block shape) gains the same fields plus, for message blocks, a `messageSender: { name: string; avatarUrl: string | null }` field populated by the backend's curator-or-teacher resolution (never computed client-side, so the student never needs to know whether it's a curator or the teacher — the name/avatar are already correct).

### Editor UI (`apps/frontend/src/components/course/ContentBlockView.tsx`)

Two new block-card renderers, `ButtonBlockCard` and `MessageBlockCard`, added to the same `switch`/conditional structure `ContentBlockView.tsx` already uses per `block.type` (alongside the existing `editor`/`video`/`image`/`file`/`live_class` cases).

**`ButtonBlockCard`:**
- A live preview of the button (this app's rounded-button style, background = `buttonColor ?? this app's default indigo token`, text color = `buttonTextColor ?? white`).
- Inline settings (no modal, per the Key Finding above): text input for button label, URL input for the link, a checkbox for "Open in new tab" (labelled in Uzbek, matching this app's existing checkbox copy style, e.g. `PracticeSection.tsx`'s pass-threshold toggle), and two color inputs (native `<input type="color">` paired with a hex text field, mirroring the reference screenshot's swatch+hex-text layout) for button color and text color.

**`MessageBlockCard`:**
- Renders each line as a chat-bubble preview (this app's gray-bubble style, consistent with `PracticeMessenger`'s own message bubbles for visual consistency within the app, but statically — no live chat behavior).
- Each line has an inline textarea and a remove button (disabled/hidden when it's the only remaining line, per the "at least 1 line" backend rule) — no nested "add" button inside any modal, since there is no modal; the "add a line" control sits at the bottom of the card's line list, styled like this app's other list-add controls (e.g. `PracticeBlockPicker`).
- No sender-name input — the card shows a note ("Yuboruvchi: kurator yoki ustoz avtomatik ko'rsatiladi" / "Sender: curator or teacher shown automatically") instead of an editable field, since the request explicitly wants this non-editable.

### Block picker (`apps/frontend/src/components/course/BlockPicker.tsx`)

**Key finding:** a "Tugma" (Button) entry already exists in `BLOCK_ITEMS` (`BlockPicker.tsx:29`) — `{ key: 'button', label: 'Tugma', icon: MousePointer2, disabled: true }` — wired to nothing (`handleClick` has no `'button'` branch) and permanently disabled. This is a pre-existing placeholder for exactly this feature. This spec removes `disabled: true` from that entry, adds a `'message'` entry (`{ key: 'message', label: 'Xabar', icon: MessageSquareText }` or a similarly fitting `lucide-react` icon — not `MessageCircle`, since that's already used elsewhere in this app for the practice-chat/messenger entry points, e.g. `LessonReader`'s "Ustozga murojaat" button; a distinct icon avoids visual ambiguity between the two features), and adds an `onPickButton: () => void` / `onPickMessage: () => void` prop pair to `BlockPickerProps`, following the exact shape of the existing `onPickLiveClass` prop (a plain no-argument callback, since neither block type needs an upload/file-picker/selection step to create — both start with empty/default content the teacher fills in afterward, exactly like `live_class` needing a session pre-selected elsewhere but unlike the file/video pickers which need a File object upfront).

`LessonEditorView.tsx` wires these two new props the same way it wires `onPickLiveClass` today (calling `addBlock`-equivalent store actions — see below), passing them into its `<BlockPicker>` instantiation.

`courseStore.ts` gains `addButtonBlock(courseId, moduleId, lessonId)` and `addMessageBlock(courseId, moduleId, lessonId)`, both following the exact structure of the existing `addLiveClassBlock` (`courseStore.ts:696-725`): call the new creation API, wrap the returned row via a `toFrontendBlock`-equivalent mapping, push it into the lesson's `blocks` array in store state.

### Student-facing render (`MyCoursesPage.tsx`'s `LessonBlock`)

- `type === 'button'`: renders an `<a>` styled as a button (background/text color from the block's props, falling back to this app's default indigo/white), `href={block.buttonUrl}`, `target={block.openInNewTab ? '_blank' : undefined}`, `rel="noreferrer"` when opening in a new tab. If `buttonUrl` is null/empty (teacher hasn't filled it in yet), the block renders nothing on the student side (consistent with how an unconfigured `live_class` block is skipped for students).
- `type === 'message'`: renders each line as a chat bubble using `messageSender.name`/`messageSender.avatarUrl` (via the existing `UserAvatar` component) exactly once at the top of the block, followed by each line's bubble — matching the reference screenshot's layout of one sender header followed by stacked message bubbles.

## Testing

- Backend: unit-style verification via the existing manual-testing conventions in this codebase (no backend test suite currently exists for content-blocks, matching the precedent of `live_class`/`file` block creation, which also ship without dedicated backend tests) — verified instead through the same ownership/limit checks every other block type already has, reviewed for correctness.
- Frontend: manual verification in the lesson editor (add a Button block, set a link and colors, confirm live preview updates; add a Message block, add/remove/reorder lines, confirm the student-facing page shows the correct sender when a curator is assigned vs. when only a teacher is assigned) — no browser automation available in this environment (same constraint noted in the LaTeX paste work), so this is flagged as manual QA the human must perform before considering this complete.
