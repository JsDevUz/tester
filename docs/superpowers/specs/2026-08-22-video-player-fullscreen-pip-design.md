# Video player: fullscreen-only playback with an in-app draggable PiP

## Background

Three prior attempts (documented in the previous spec,
`2026-08-22-video-player-seamless-fullscreen-design.md`) tried to keep the
video inline in the lesson's `ScrollView`, expand it to fullscreen via
absolute positioning + manually computed coordinates
(`measureInWindow`/`measureLayout`), and sync that position back on scroll.
All three failed in practice:

- `measureLayout` against a shared anchor returned wildly wrong coordinates
  after a scroll (observed: thousands of dp off-screen).
- `onLayout` doesn't fire from scrolling alone, so the tracked rect went
  stale the moment the lesson scrolled, even after switching to
  `measureInWindow`.
- Manually computing "how far the fullscreen container must climb to reach
  the true top of the screen" (subtracting the header's height) is fragile
  and had to be re-derived per screen.

This is the "3+ fixes failed, question the architecture" case. The user
picked a different design instead of a fourth patch.

## New design (confirmed with user)

Drop the inline "video sits in the document flow" concept entirely for the
*playing* state:

1. **Poster stays inline.** `LazyVideoPlayer`'s poster + play button keeps
   its current spot in the lesson content, at whatever position the
   teacher placed the video block (unchanged -- this is the "flexible
   position" requirement).
2. **Play -> fullscreen immediately.** Pressing play does not activate an
   inline player. It opens a `Modal` (`transparent={false}`) containing
   `HlsVideoPlayer`, filling the screen. There is no inline/"minimized"
   playing state at all.
3. **No manual minimize.** The old fullscreen/minimize toggle is gone.
   The only ways out of the Modal are the close (X) button and Android's
   back gesture/button.
4. **In-Modal PiP.** A new "PiP" button in the fullscreen controls shrinks
   the video (still the same mounted `<Video>` -- never remounted) to a
   small draggable box positioned with `PanResponder` (already used
   elsewhere in this file for the scrub bar), still inside the same
   `Modal`. The `Modal` becomes `transparent={true}` while in PiP mode, so
   the lesson content behind it (the same `CourseScreen` screen, now
   revealed through the transparent Modal) is visible and interactive
   around the small video box. Tapping the PiP box again (or a dedicated
   expand control on it) returns to full fullscreen.
5. **Close** unmounts the `Modal` entirely (and with it `<Video>` --
   accepted: closing playback is supposed to stop it, unlike toggling
   fullscreen/PiP which must not).

This removes every cross-component coordinate computation: the video's
container is never positioned relative to a lesson placeholder or a screen
anchor. Inside the fullscreen Modal, "fullscreen" and "PiP" are both just
static/gesture-driven layouts local to that Modal -- no `ScrollView`,
`measureInWindow`, or scroll-tick plumbing involved anywhere.

## Components

### `activeVideoStore.ts` (simplified)

Drop `placeholderRect`, `setPlaceholderRect`, `screenAnchorRef`,
`setScreenAnchorRef`, `scrollTick`, `bumpScrollTick` -- none of them are
needed once the player never leaves its own Modal. Keep `activeBlockId`
only if something outside the player still needs to know a video is
playing (checked in the plan below); otherwise the store can shrink to
nothing lesson-video-specific and `LazyVideoPlayer` manages its own local
`open` state directly, the way it did before any of this cross-component
positioning work began.

### `LazyVideoPlayer.tsx`

Back to a simple local-state component: renders the poster; on press, sets
local `videoOpen = true` and renders `HlsVideoPlayer` inside a `Modal`
(passed as a prop or rendered directly by `LazyVideoPlayer` -- see plan).
No placeholder measuring, no store-driven rect.

### `HlsVideoPlayer.tsx`

- Remove: `rect` prop, `PlaceholderRect` import, `screenAnchorRef`,
  reanimated-driven `rectX/Y/Width/Height`, `mountOpacity`, `progressTop`,
  `animatedContainerStyle`, `animatedProgressStyle`, the whole
  positioning `useEffect`.
- Remove: `isFullscreen`/`setIsFullscreen` from `activeVideoStore` (no
  longer a cross-component concern -- this component IS always fullscreen
  or PiP, decided by its own local state).
- Add local state: `mode: 'fullscreen' | 'pip'`.
- The returned tree becomes: `Modal` (open as long as this component is
  mounted -- mounted by `LazyVideoPlayer` only while playing) wrapping a
  single `View` that is either full-bleed (`fullscreen`) or a small
  fixed-size draggable box (`pip`, position tracked by local
  `useState`/`Animated.ValueXY` updated via `PanResponder`, matching the
  existing scrub-bar gesture pattern in this same file).
- The "Mening video ko'rishim" watch-progress panel, previously
  positioned to trail the inline placeholder, now renders as an ordinary
  in-Modal element below the video controls (still fullscreen-relative,
  no external rect needed) -- visible in fullscreen mode, hidden in PiP
  (too small to usefully show it).
- `onRequestClose` (Android back) and the close (X) button both call a
  single `onClose` prop supplied by `LazyVideoPlayer`, which unmounts the
  player.

### `CourseScreen.tsx`

Remove all `activeBlockId`/`placeholderRect`/`screenAnchorRef`/
`scrollTick`/`handleLessonScroll` wiring added in the previous (failed)
attempts: the `screenRef`, the `onScroll`/`scrollEventThrottle` props on
the lesson `ScrollView`, the `setScreenAnchorRef` effect, the
`setActiveBlockId(null)` on lesson change, and the conditional
`<HlsVideoPlayer>` render that used to sit between the `ScrollView` and
the lessons-list `Modal`. `LessonBlock`/`LazyVideoPlayer` render exactly as
they did before any of this cross-component work (`lesson.blocks.map(block
=> <LessonBlock ... />)`, no extra props threaded through for video
positioning).

## Confirmed constraints

- Exactly one video is ever "active" (mounted as a real `<Video>`) at a
  time -- unchanged from before; now trivially true since each
  `LazyVideoPlayer` owns its own Modal and only one poster is ever pressed
  at a time in practice (not enforced globally, but the risk -- two videos
  both open in separate Modals -- was already possible in principle before
  this change too, and is out of scope here).
- Portrait-only. No orientation handling in the Modal (matches the earlier
  confirmed constraint).
- PiP is in-app only: a draggable box inside the transparent Modal. Not
  Android's system Picture-in-Picture API, not a cross-app floating
  window. "native future" (the user's phrase) is understood as "uses
  standard React Native primitives (Modal, PanResponder, Animated) rather
  than a third-party PiP library," not literally the OS PiP feature.

## Testing plan

Manual, on the Android emulator/device:

1. Open a lesson, press play on a video -- Modal opens immediately in
   fullscreen, playback starts, no spinner-then-jump-cut (buffering
   spinner is expected briefly, matches existing behavior).
2. Let it play a few seconds (clock visibly advancing), tap the PiP
   button -- video shrinks to a small box, lesson content becomes visible
   and scrollable behind it, clock keeps advancing (no remount).
3. Drag the PiP box to a different corner -- it follows the finger and
   stays wherever released.
4. Tap the PiP box (or its expand control) -- returns to fullscreen,
   still no remount, clock still advancing.
5. Close (X button and, separately, Android back) -- Modal unmounts,
   playback stops, watch-progress is saved (existing `closeCurrentRange`
   logic, untouched).
6. Re-open the same video -- resumes from the same watched position via
   existing resume logic (untouched).
