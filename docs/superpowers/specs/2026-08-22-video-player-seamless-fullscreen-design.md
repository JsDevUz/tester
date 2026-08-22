# Video player: seamless fullscreen/minimize transition

## Problem

`HlsVideoPlayer` currently renders its fullscreen state inside a React Native
`Modal`:

```
isFullscreen ? <Modal><View>{mediaSurface}</View></Modal> : <View>{mediaSurface}</View>
```

`mediaSurface` (which contains the `<Video>` element) sits under a different
parent in each branch. A `Modal` is backed by its own native window, so when
`isFullscreen` flips, React unmounts `<Video>` from the inline `View` and
mounts a new one inside the `Modal`'s window. The native video player is
destroyed and recreated — playback stops, the buffer is discarded, and the
spinner reappears while it reloads. Toggling fullscreen or minimizing back
currently interrupts playback both times.

## Goal

Fullscreen and minimize must be purely a resize/reposition of the existing
video surface. The `<Video>` component is mounted exactly once for the
lifetime of a lesson's active playback and never moves to a different parent
or unmounts when toggling fullscreen. Only its container's size/position
animates.

## Why a Modal can't be fixed in place

A `Modal` always renders through a separate native window; there is no way to
keep a single React child continuously mounted across a Modal boundary in
React Native (no portal primitive exists here as in react-native's own
Modal implementation). The only way to guarantee zero remounts is to never
put the video inside a Modal, and never let it change React parents at all.

## Approach

Lift the player up to `CourseScreen`, outside the lesson `ScrollView`,
rendered once as an absolutely-positioned sibling of the scroll view. The
`LessonBlock`'s video slot becomes an inert placeholder that reports its
on-screen layout; `CourseScreen` positions the single real player to match
that placeholder's rect when not fullscreen, and animates it to fill the
screen when fullscreen — all without unmounting.

### Confirmed constraints (from user)

- Exactly one video is ever "active" (mounted as a real `<Video>`) at a time
  across the whole lesson. Pressing play on a different video block pauses/
  deactivates the previous one. This matches an existing product decision
  (`LazyVideoPlayer` already tracks a per-block `activated` flag; we make
  "active" global-per-lesson instead of per-block).
- Fullscreen is **portrait only**. No orientation change, no
  `react-native-orientation-locker`. Fullscreen simply means "the player's
  container grows to fill the screen while the phone stays upright."
  This removes all rotation-related complexity from this change.
- The existing `headerShown: !isFullscreen` in `CourseScreen`'s
  `navigation.setOptions` already hides the native stack header while
  fullscreen is active, so the absolutely-positioned player can safely cover
  the full screen height without a separate header-overlap concern.

## Components and data flow

### `activeVideoStore.ts` (extended)

Already holds `isFullscreen`, `activeBlockId`. Add:

```ts
interface PlaceholderRect { x: number; y: number; width: number; height: number; }

interface ActiveVideoState {
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  placeholderRect: PlaceholderRect | null;
  setPlaceholderRect: (r: PlaceholderRect | null) => void;
}
```

`placeholderRect` is measured in the screen's own coordinate space (via
`measure`/`onLayout` relative to a screen-level container ref), not the
window — the player is a sibling of the `ScrollView` inside the same
`Screen`, so window-relative and screen-relative coincide here since `Screen`
fills the window.

### `LazyVideoPlayer.tsx` (rework)

Currently owns `activated` state and swaps between a poster `Pressable` and a
mounted `HlsVideoPlayer`. It becomes purely presentational:

- Always renders the poster + play button in its normal flow position
  (unchanged visuals when not the active block).
- Reports its own layout rect via `onLayout` **only when it is the active
  block** (`activeBlockId === blockId`), continuously, so scrolling the
  lesson keeps the real player glued to the placeholder's position. (Simpler
  alternative considered and rejected: measuring only once on activation —
  rejected because the user can scroll the lesson while a non-fullscreen
  video is playing inline, and the real player must track that scroll.)
- On press (when not yet activated for this lesson), calls
  `setActiveBlockId(blockId)` instead of local `setActivated(true)`.
- Renders nothing where the poster used to sit once this block is active and
  not fullscreen — instead it renders a same-sized transparent placeholder
  `View` (to reserve layout space) with `onLayout` wired up. The real
  `HlsVideoPlayer`, absolutely positioned in `CourseScreen`, visually covers
  this placeholder exactly, so from the user's perspective nothing changes.

### `HlsVideoPlayer.tsx` (moved, simplified)

- Instantiated once in `CourseScreen`, not in `LessonBlock`/`LazyVideoPlayer`.
  Only rendered at all when `activeBlockId` is non-null for the current
  lesson (i.e., some video block has been activated).
- Drops the `Modal` branch entirely. Always renders `mediaSurface` inside a
  single `Animated.View` (reanimated) whose style is:
  - Not fullscreen: `position: absolute`, `left/top/width/height` driven by
    `placeholderRect` (animated with `withTiming` when the rect changes,
    e.g. on rotation-free layout changes/scroll).
  - Fullscreen: `position: absolute`, `left:0, top:0, width: windowWidth,
    height: windowHeight` (animated transition from the previous rect).
- The fullscreen toggle button still calls `setIsFullscreen`/
  `setActiveBlockId` from `activeVideoStore`, unchanged in spirit from the
  current code — only the container that responds to `isFullscreen` changes.
- All playback state/logic (buffering, captions, watch-progress, download
  badge, scrubbing) is untouched — only the outer positioning wrapper changes.

### `LessonBlock.tsx`

Passes through `lessonId`/`lessonTitle`/`courseId`/`courseTitle`/`schoolId`
as it already does (fixed in the prior session). No structural change beyond
whatever prop plumbing `LazyVideoPlayer`'s rework needs.

### `CourseScreen.tsx`

- Renders the lesson `ScrollView` as today.
- Immediately after (sibling, not child, of the ScrollView, inside the same
  `Screen`), conditionally renders:
  ```tsx
  {activeBlockId && activeBlock && (
    <HlsVideoPlayer
      blockId={activeBlockId}
      ...same props LazyVideoPlayer used to forward...
      placeholderRect={placeholderRect}
      isFullscreen={isFullscreen}
    />
  )}
  ```
  where `activeBlock` is looked up from the current lesson's blocks by id
  (needed for title/durationSec props).
- When the user navigates to a different lesson while a video is active,
  clear `activeBlockId`/`isFullscreen` (video belongs to one lesson only) —
  matches current behavior implicitly since `LazyVideoPlayer` today remounts
  per lesson render anyway.

## Edge cases

- **Placeholder not yet measured** (`placeholderRect === null`, e.g. first
  render before layout fires): player renders with `opacity: 0` for one
  frame rather than at a garbage position, then fades in once the first
  `onLayout` lands. This avoids a visible flash at (0,0).
- **Switching active video mid-playback**: setting a new `activeBlockId`
  unmounts the previous `HlsVideoPlayer` (acceptable — confirmed only one
  video is ever active) and mounts the new one against its own placeholder.
- **Leaving the lesson/screen**: unmount naturally cleans up (existing
  `closeCurrentRange`/watch-progress effects unaffected).
- **Download badge / offline caching**: unaffected — these hang off
  `blockId` and the (unchanged) `offlineVideoStore`, not off where the
  component is mounted in the tree.

## Testing plan

Manual, on the Android emulator (no automated RN view-tree test harness in
this repo for this kind of animation):

1. Open a lesson, press play on a video, let it buffer past the first
   second so `currentTime` is visibly advancing.
2. Tap fullscreen — verify: no spinner reappears, `currentTime` keeps
   advancing across the transition (read the on-screen clock before/after),
   audio (if any) does not glitch/restart.
3. Tap minimize — same verification in reverse.
4. Scroll the lesson while the video is playing inline (not fullscreen) —
   verify the player visually stays glued to its placeholder's position.
5. Re-run the existing fullscreen layout regression check (no stray gaps,
   no leftover blank space above the header) since this replaces that
   Modal-based fix from the same session.
