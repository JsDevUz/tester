# Video Watch Progress Design

## Problem

`HlsVideoPlayer.tsx` currently tracks no viewing progress at all — no `timeupdate` listener, no persisted position, no percent-watched indicator. There is no way to know how much of a video a student has actually watched, or which parts they skipped versus genuinely viewed.

Reference (Exode LMS screenshot) shows the desired UX: the progress bar renders the segments a student has actually watched as highlighted ranges, plus a "N% ko'rilgan" (N% watched) label below it.

## Goal

Track, per student per video content-block, which time ranges of the video have actually been watched (not just the last playback position), compute a real "percent watched" from the merged, non-overlapping coverage of those ranges, and surface both the percent and a segment-highlighted progress bar in `HlsVideoPlayer.tsx`.

## Non-goals

- This percent does **not** gate lesson completion, "Keyingi dars"/"Amaliyot" advancement, or any unlock logic — it is purely informational. Existing `maxUnlockedIndex`/`markSelectedLessonComplete` flows are untouched.
- No changes to the practice/test-taking systems (unrelated to this feature).
- No re-architecture of the existing HLS streaming/watermark/DRM logic in `HlsVideoPlayer.tsx` — this is additive.
- No teacher-facing dashboard for per-student watch analytics in this pass — only the student's own player shows their own progress.

## Data model

New table `video_watch_segments`:

```
id            uuid, PK
contentBlockId uuid, FK -> content_blocks.id, cascade delete
studentId     uuid, FK -> users.id, cascade delete
startSec      integer, not null
endSec        integer, not null
updatedAt     timestamp, not null, default now()
```

No unique constraint on `(contentBlockId, studentId)` — a student can have multiple stored segments per video; the backend merges overlapping/adjacent segments into non-overlapping ranges on every write (see below), so the row count stays small (bounded by the number of genuinely disjoint watched ranges, not by the number of write requests).

`contentBlocks.durationSec` (already exists) is the denominator for percent computation. If it's null (duration not yet known, e.g. still processing), percent is not computed (returns `null`, frontend shows nothing).

## Backend behavior

**`POST /content-blocks/:id/watch-progress`** — body `{ startSec: number, endSec: number }`. Authenticated student only (own progress, no teacher/admin access needed for this pass since there's no dashboard consuming it yet). Steps:
1. Validate `endSec > startSec` and both `>= 0`.
2. Load all existing segments for `(contentBlockId, studentId)`.
3. Merge the new `[startSec, endSec]` range into the existing set: any existing segment that overlaps or is adjacent (gap-tolerant, e.g. within 2 seconds, to absorb small timer-tick gaps) to the new range is combined into one wider segment; non-overlapping segments are left as separate rows.
4. Replace the old rows for this `(contentBlockId, studentId)` with the merged set (delete + re-insert in one transaction, since segment count is small — typically under 10).
5. Return `{ watchedPercent: number | null }` computed as `sum(merged segment lengths) / durationSec * 100`, rounded, capped at 100.

**`GET /content-blocks/:id/watch-progress`** — authenticated student only. Returns `{ segments: {startSec, endSec}[], watchedPercent: number | null }` for the current student — used to restore the progress-bar overlay and percent label when the player mounts (e.g. returning to a lesson).

## Frontend behavior (`HlsVideoPlayer.tsx`)

- On mount (after the existing HLS boot sequence), fetch `GET .../watch-progress` once to seed the initial overlay/percent.
- Attach a `timeupdate` listener. Track an in-progress "current watched range" in a ref: `{start, end}`, extending `end` as `timeupdate` fires while playing. A seek (detected via a jump in `currentTime` larger than ~2 seconds between consecutive `timeupdate` events) closes the current range and starts a new one at the new position — this is what prevents a jump-to-end from counting as watching everything in between.
- Every 7 seconds (periodic, via `setInterval` while playing) and on `pause`/`ended`/component-unmount, POST the current in-progress range (if it has grown since the last save) to `.../watch-progress`, then update local `watchedPercent`/segments state from the response.
- Render an overlay of small highlighted `<div>`s positioned absolutely over the native `<video>` element's control-bar area is not feasible (native controls aren't overlay-able) — instead, render a **custom thin progress strip below the video** (a new element, separate from the native video controls), width-proportional to `durationSec`, with each watched segment drawn as a highlighted block at `left: start/duration*100%, width: (end-start)/duration*100%`. Below it, the "N% ko'rilgan" text label, matching the reference screenshot's placement (under the player, not inside the native control bar, since the native `<video controls>` bar can't be extended with custom overlays across browsers).

## Testing

- Backend: unit tests for the pure segment-merge function (extracted as an exported function, e.g. `mergeWatchSegments(existing, incoming, gapToleranceSec)`), covering: no overlap (stays separate), exact overlap, partial overlap, adjacent-within-tolerance merge, new segment fully inside an existing one (no-op growth).
- No frontend automated tests (this codebase has none for player/UI components) — manual browser QA is the verification path, per established project convention: play a video partway, seek forward, confirm the skipped range is not marked watched; replay the same range twice, confirm no duplicate/overlapping segments accumulate; refresh the page mid-lesson, confirm the progress strip restores from the last saved state.
