# Fullscreen-Only Video Player With Draggable PiP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing play opens the video directly in a fullscreen Modal (no inline/minimized state); an in-Modal "PiP" button shrinks it to a small draggable box over the still-visible lesson content, without ever remounting `<Video>`.

**Architecture:** `LazyVideoPlayer` reverts to owning simple local `open` state and renders `HlsVideoPlayer` inside a `Modal` only while open. `HlsVideoPlayer` drops all cross-component positioning (no `rect` prop, no `activeVideoStore` fullscreen/anchor/scroll state) and instead owns a local `mode: 'fullscreen' | 'pip'` plus a `PanResponder`-driven drag position for PiP. `CourseScreen` and `activeVideoStore` shed everything added for the three failed inline-positioning attempts.

**Tech Stack:** React Native, TypeScript, `Modal`, `PanResponder` (already used in this file for the scrub bar), `Animated` (React Native's, not reanimated -- PiP dragging is a simple 2D translate, no need for the reanimated dependency this component pulled in for the abandoned approach).

**Spec:** `docs/superpowers/specs/2026-08-22-video-player-fullscreen-pip-design.md`

## Global Constraints

- Exactly one video is ever actually playing (a real `<Video>` instance) -- unchanged expectation, now trivially satisfied since each `LazyVideoPlayer` owns its own Modal.
- Portrait-only. No orientation locking, no rotation handling anywhere in this plan.
- The poster/thumbnail stays inline in the lesson content at all times (including while a video is open in its Modal) -- this is the "flexible position, teacher places it anywhere in the lesson" requirement. Do not hide or replace the poster when the Modal is open; it simply sits behind/underneath, unaffected, exactly as before any of this work started.
- PiP is in-app only (Modal + PanResponder), not Android's system Picture-in-Picture API.
- Do not touch `DownloadCardBadge.tsx`, `DownloadsBottomSheet.tsx`, `SchoolsScreen.tsx`, `CoursesScreen.tsx`, or `offlineVideoStore.ts`.
- All of `HlsVideoPlayer`'s existing playback/caption/download/watch-progress logic (everything from `manifestUrl` state down through `handleProgress`, `closeCurrentRange`, the download badge, subtitles) must keep working exactly as it does today -- only the outer container/positioning and the fullscreen-vs-inline concept change.

---

## File Structure

- **Modify `apps/mobile/src/store/activeVideoStore.ts`**: delete `placeholderRect`, `setPlaceholderRect`, `screenAnchorRef`, `setScreenAnchorRef`, `scrollTick`, `bumpScrollTick`, `isFullscreen`, `setIsFullscreen`. Delete `activeBlockId`/`setActiveBlockId` too -- nothing outside `HlsVideoPlayer`/`LazyVideoPlayer` reads them once `CourseScreen`'s wiring is removed (verified in Task 4). If that verification finds another reader, keep only that field.
- **Modify `apps/mobile/src/components/LazyVideoPlayer.tsx`**: local `videoOpen` state; renders poster; on press, opens the video (sets `videoOpen = true`); renders `<HlsVideoPlayer>` (which owns its own `Modal`) only while `videoOpen`; passes an `onClose` callback that sets `videoOpen = false`.
- **Modify `apps/mobile/src/components/HlsVideoPlayer.tsx`**: remove the `rect` prop, the `PlaceholderRect`/`screenAnchorRef` imports and reads, the reanimated imports and all reanimated-driven styles/effects. Add a `Modal` wrapper, local `mode` state (`'fullscreen' | 'pip'`), a `PanResponder`-driven PiP position, and an `onClose` prop.
- **Modify `apps/mobile/src/screens/CourseScreen.tsx`**: remove `activeBlockId`, `placeholderRect`, `setActiveBlockId`, `setScreenAnchorRef`, `bumpScrollTick`, `screenRef`, `handleLessonScroll`, the `setActiveBlockId(null)` lesson-change effect, the `onScroll`/`scrollEventThrottle` props on the `ScrollView`, and the conditional `<HlsVideoPlayer>` render between the `ScrollView` and the lessons-list `Modal`. Keep `isFullscreen` read from the store only if Task 4's grep shows `headerShown: !isFullscreen` is still meaningful -- it isn't (see Task 4), so remove that too and always pass `headerShown: true`.
- **No change needed**: `apps/mobile/src/components/LessonBlock.tsx` -- already calls `<LazyVideoPlayer blockId={block.id} title={...} posterUrl={...} />` with no positioning props (this was fixed in an earlier session and never touched by the failed positioning attempts).

---

## Task 1: Strip `activeVideoStore` down to nothing video-positioning-specific

**Files:**
- Modify: `apps/mobile/src/store/activeVideoStore.ts`

**Interfaces:**
- Produces: either an empty/removed store, or a minimal store with only fields still read elsewhere (determined by Task 4's grep before this task's final state is locked in -- see Step 3).

- [ ] **Step 1: Grep every current consumer before deleting anything**

Run: `grep -rn "useActiveVideoStore\|activeVideoStore" apps/mobile/src --include="*.tsx" --include="*.ts" | grep -v "store/activeVideoStore.ts"`

Expected (based on the current failed-attempt code): matches in `HlsVideoPlayer.tsx` (`isFullscreen`, `setIsFullscreen`, `setActiveBlockId`, `screenAnchorRef`) and `CourseScreen.tsx` (`isFullscreen`, `activeBlockId`, `placeholderRect`, `setActiveBlockId`, `setScreenAnchorRef`, `bumpScrollTick`). Confirm no other file appears. If one does, stop and reconsider scope with the user before proceeding -- this plan assumes only those two files depend on the store.

- [ ] **Step 2: Delete the file's contents down to nothing**

Since Task 2 and Task 3 remove every one of those reads (see their steps), and Task 4 removes `CourseScreen`'s reads, no field survives. Replace the full contents of `apps/mobile/src/store/activeVideoStore.ts` with nothing video-store-shaped -- delete the file entirely:

Run: `rm apps/mobile/src/store/activeVideoStore.ts`

- [ ] **Step 3: Commit**

```bash
git add -A -- apps/mobile/src/store/activeVideoStore.ts
git commit -m "refactor: remove activeVideoStore

Every field existed to support cross-component video positioning
(placeholder rect, screen anchor, scroll tick, fullscreen flag shared
between CourseScreen and HlsVideoPlayer) for an approach that's being
replaced -- HlsVideoPlayer now owns fullscreen/PiP entirely locally.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Note: this commit will not build until Tasks 2-4 land (both consumers still import the now-deleted module). That's expected -- Task 2's own commit is the first point the tree builds again. If your workflow requires every commit to build, squash Tasks 1-2 together instead; this plan lists them separately because they're conceptually distinct steps, not because Task 1 alone must compile.

---

## Task 2: Rewrite `HlsVideoPlayer` to own its Modal, fullscreen/PiP mode, and a close callback

**Files:**
- Modify: `apps/mobile/src/components/HlsVideoPlayer.tsx`

**Interfaces:**
- Consumes: nothing from `activeVideoStore` (deleted in Task 1).
- Produces: `HlsVideoPlayer` props become `{ blockId: string; watermark?: boolean; title?: string; lessonId?: string; lessonTitle?: string; courseId?: string; courseTitle?: string; schoolId?: string; onClose: () => void }`. No `autoPlay` prop -- opening this component now always means "the viewer just pressed play," so playback always starts immediately (the component is never mounted any other way once Task 3 lands). No `rect` prop.

This task changes: the import list, the prop type/destructure, removes the `isFullscreen`/`setIsFullscreen`/`setActiveBlockId`/`screenAnchorRef` store reads, adds local `mode` state and a `PanResponder`-driven PiP position, and replaces the final return statement (currently the reanimated-driven `Animated.View` pair) with a `Modal`-wrapped tree.

- [ ] **Step 1: Update imports**

Remove these lines from the top of `apps/mobile/src/components/HlsVideoPlayer.tsx`:

```ts
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
```

and

```ts
import { useActiveVideoStore, type PlaceholderRect } from '../store/activeVideoStore';
```

Add `Modal` and `Animated` (React Native's own, for the PiP drag) to the existing `react-native` import list (currently missing both -- `Modal` was removed from this file in the prior session, `Animated` from `react-native` was already an unused leftover import that got deleted then too):

```ts
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
```

Add `Move` (or reuse `Maximize2`) from `lucide-react-native` for the PiP "expand" affordance -- reuse the existing `Maximize2`/`Minimize2` icons already imported (`Maximize2` = expand back to fullscreen, shown on the PiP box; `Minimize2` = shrink to PiP, shown in fullscreen's control bar) rather than adding a new icon import.

- [ ] **Step 2: Update the prop signature**

Replace:

```ts
export function HlsVideoPlayer({
  blockId,
  watermark = true,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  autoPlay = false,
  rect,
}: {
  blockId: string;
  watermark?: boolean;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  /**
   * Start playing immediately. Set when the player was mounted by a play press (see
   * LazyVideoPlayer) -- the viewer already asked to watch, so a second press is a step that
   * should not exist.
   */
  autoPlay?: boolean;
  /**
   * The on-screen rect (from the lesson's placeholder) this player should sit on top of
   * when not fullscreen. Null for one frame before the placeholder's first layout lands.
   */
  rect: PlaceholderRect | null;
}) {
```

with:

```ts
export function HlsVideoPlayer({
  blockId,
  watermark = true,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  onClose,
}: {
  blockId: string;
  watermark?: boolean;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  /** This component is only ever mounted by a play press (see LazyVideoPlayer), so it always
   *  starts playing immediately -- there is no separate "mounted but paused" entry point. */
  onClose: () => void;
}) {
```

- [ ] **Step 3: Replace `paused` initial state**

Find:

```ts
  const [paused, setPaused] = useState(!autoPlay);
```

Replace with:

```ts
  const [paused, setPaused] = useState(false);
```

- [ ] **Step 4: Remove the store reads, add local mode + PiP drag state**

Find:

```ts
  const isFullscreen = useActiveVideoStore(s => s.isFullscreen);
  const setIsFullscreen = useActiveVideoStore(s => s.setIsFullscreen);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const screenAnchorRef = useActiveVideoStore(s => s.screenAnchorRef);
  const wrapperRef = useRef<View>(null);
```

Replace with:

```ts
  const [mode, setMode] = useState<'fullscreen' | 'pip'>('fullscreen');
  const isFullscreen = mode === 'fullscreen';

  // PiP box position, dragged freely with a finger. Starts near the top-right so it never
  // opens on top of the close/PiP buttons a viewer might reach for next. Clamped to stay
  // fully on screen in onPanResponderMove below.
  const pipSize = { width: 160, height: 90 };
  const pipPan = useRef(new Animated.ValueXY({ x: windowWidthRef.current - pipSize.width - 16, y: 80 })).current;
  const pipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipPan.setOffset({
          // @ts-expect-error -- Animated.ValueXY exposes _value at runtime; there is no
          // public getter, and this is the standard RN pattern for resuming a drag from the
          // box's current position instead of snapping back to (0,0).
          x: pipPan.x._value,
          // @ts-expect-error -- see above.
          y: pipPan.y._value,
        });
        pipPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pipPan.x, dy: pipPan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pipPan.flattenOffset();
      },
    }),
  ).current;
```

This references `windowWidthRef` which doesn't exist yet -- add it right after the existing `useWindowDimensions` call:

Find:

```ts
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
```

Replace with:

```ts
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const windowWidthRef = useRef(windowWidth);
  useEffect(() => {
    windowWidthRef.current = windowWidth;
  }, [windowWidth]);
```

(`useRef` needs a stable initial value at first render, and `windowWidth` is already in scope by the time `pipPan` is created a few lines below it in the file, so this ref only matters for correctness on a dimension change *before* first drag -- acceptable given PiP position isn't expected to survive a rotation in a portrait-only app.)

- [ ] **Step 5: Update the fullscreen/PiP toggle button and remove the old minimize button's `setActiveBlockId` call**

Find (the "Fullscreen Button" in the top-right action bar):

```ts
                {/* Fullscreen Button */}
                <Pressable
                  onPress={() => {
                    console.log('[DBG] fullscreen button pressed', {isFullscreen});
                    resumeTimeRef.current = currentTimeRef.current;
                    // Only the fullscreen flag flips here -- activeBlockId stays set, since
                    // clearing it would unmount this very player (CourseScreen only renders
                    // HlsVideoPlayer while its block is active) and stop playback dead.
                    setIsFullscreen(!isFullscreen);
                  }}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
```

Replace with:

```ts
                {/* PiP toggle: shrinks the video to a draggable box without unmounting it. */}
                <Pressable
                  onPress={() => setMode(m => (m === 'fullscreen' ? 'pip' : 'fullscreen'))}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
```

Find the two remaining `setActiveBlockId` call sites (the minimize button shown over an error/loading state, and none other -- confirm with `grep -n setActiveBlockId apps/mobile/src/components/HlsVideoPlayer.tsx` after this step returns exactly the ones handled here):

```ts
        {(error || !manifestUrl) && isFullscreen && (
          <Pressable
            onPress={() => {
              setIsFullscreen(false);
              setActiveBlockId(null);
            }}
            style={{
              position: 'absolute',
              top: Math.max(16, insets.top + 8),
              right: Math.max(20, insets.right + 12),
              zIndex: 60,
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/70 border border-white/20">
            <Minimize2 size={18} color="white" />
          </Pressable>
        )}
```

Replace with (this becomes the close button for the error/loading state -- there's no fullscreen/PiP distinction to preserve once the whole player is a Modal, so this now always closes rather than "un-fullscreening" into a since-removed inline state):

```ts
        {(error || !manifestUrl) && (
          <Pressable
            onPress={onClose}
            style={{
              position: 'absolute',
              top: Math.max(16, insets.top + 8),
              right: Math.max(20, insets.right + 12),
              zIndex: 60,
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/70 border border-white/20">
            <X size={18} color="white" />
          </Pressable>
        )}
```

This introduces `X` -- add it to the `lucide-react-native` import list alongside `Captions, Check, ChevronDown, ...`.

Also add a permanent close button to the fullscreen controls' top-right action bar (next to the PiP toggle), since closing was previously conflated with "minimize" and there is no other way to fully exit now:

Find the `View` wrapping the PiP toggle button (the "Top Right Action Bar"):

```ts
              <View
                style={{
                  position: 'absolute',
                  top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
                  right: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  zIndex: 20,
                }}>
                {/* PiP toggle: shrinks the video to a draggable box without unmounting it. */}
                <Pressable
                  onPress={() => setMode(m => (m === 'fullscreen' ? 'pip' : 'fullscreen'))}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
              </View>
```

Replace with:

```ts
              <View
                style={{
                  position: 'absolute',
                  top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
                  right: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  zIndex: 20,
                  flexDirection: 'row',
                  gap: 8,
                }}>
                {/* PiP toggle: shrinks the video to a draggable box without unmounting it. */}
                <Pressable
                  onPress={() => setMode(m => (m === 'fullscreen' ? 'pip' : 'fullscreen'))}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
                <Pressable
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  <X size={16} color="white" />
                </Pressable>
              </View>
```

- [ ] **Step 6: Replace the final return statement**

Find the whole block from the `// Drives the container's position/size...` comment down through the end of the file (the reanimated shared values, the positioning `useEffect`, `animatedContainerStyle`, `animatedProgressStyle`, and the final `return (...)`). Replace all of it with:

```ts
  const pipStyle = {
    transform: pipPan.getTranslateTransform(),
  };

  return (
    <Modal
      visible
      transparent={mode === 'pip'}
      statusBarTranslucent
      animationType="fade"
      supportedOrientations={['portrait']}
      onRequestClose={onClose}>
      {mode === 'fullscreen' ? (
        <View style={{ width: windowWidth, height: windowHeight, backgroundColor: 'black' }}>
          {mediaSurface}
        </View>
      ) : (
        // PiP: the Modal itself is transparent, so the lesson behind it (this same
        // CourseScreen, still mounted underneath) shows through and stays scrollable/
        // interactive everywhere outside the small draggable box below.
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            {...pipPanResponder.panHandlers}
            style={[
              {
                position: 'absolute',
                width: pipSize.width,
                height: pipSize.height,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: 'black',
                elevation: 8,
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 8,
              },
              pipStyle,
            ]}>
            {mediaSurface}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}
```

Note: `mediaSurface` (defined earlier in the file, unchanged) already contains its own fullscreen-vs-not conditionals (e.g. the download badge's `top: isFullscreen ? ... : 12`) -- these still work correctly since `isFullscreen` is now a local derived boolean (`mode === 'fullscreen'`) instead of a store value, with the same true/false meaning. The controls inside `mediaSurface` (play/pause, skip, scrub bar, speed, captions) render in both fullscreen and PiP today; if the PiP box is too small for them to be usable, that's a follow-up polish item, not a blocker for this plan -- the PiP box is still functionally correct (video visible, draggable, tap targets present even if cramped).

- [ ] **Step 7: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: errors only in `LazyVideoPlayer.tsx` (still passing the old props) and `CourseScreen.tsx` (still importing the deleted store) -- both fixed in Tasks 3-4. No errors should remain in `HlsVideoPlayer.tsx` itself. If there are, fix them before proceeding (common ones to watch for: `X` not imported, `Modal` not imported, leftover reference to `rect` or `screenAnchorRef` somewhere in `mediaSurface` -- run `grep -n "rect\b\|screenAnchorRef\|useActiveVideoStore\|reanimated" apps/mobile/src/components/HlsVideoPlayer.tsx` and confirm zero matches).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/HlsVideoPlayer.tsx
git commit -m "refactor: HlsVideoPlayer owns its own Modal, fullscreen/PiP mode

Replaces the reanimated absolute-positioning approach (which required
computing this component's on-screen rect relative to a lesson
placeholder and re-deriving it on every scroll) with a Modal the
component owns outright. Fullscreen and PiP are both local render
states inside that Modal -- PiP additionally drags via PanResponder,
the same gesture primitive already used here for the scrub bar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Revert `LazyVideoPlayer` to simple local-state open/close

**Files:**
- Modify: `apps/mobile/src/components/LazyVideoPlayer.tsx`

**Interfaces:**
- Consumes: `HlsVideoPlayer` from Task 2 (props: `blockId`, `watermark?`, `title?`, `lessonId?`, `lessonTitle?`, `courseId?`, `courseTitle?`, `schoolId?`, `onClose: () => void`).
- Produces: `LazyVideoPlayer` keeps its existing public signature (`blockId`, `title?`, `posterUrl?`) unchanged -- `LessonBlock.tsx` needs zero edits.

- [ ] **Step 1: Replace the full file**

```tsx
import React, {useState} from 'react';
import {Image, Pressable, View} from 'react-native';
import {Play} from 'lucide-react-native';
import {HlsVideoPlayer} from './HlsVideoPlayer';

/**
 * Shows a poster until the student taps, then opens the real player in its own fullscreen
 * Modal (see HlsVideoPlayer). The poster itself never moves or unmounts -- it stays exactly
 * where the lesson content placed it, whether or not the player is currently open.
 */
export function LazyVideoPlayer({
  blockId,
  title,
  posterUrl,
}: {
  blockId: string;
  title?: string;
  posterUrl?: string | null;
}) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVideoOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title ? `${title}ni ijro etish` : 'Videoni ijro etish'}
        className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {posterUrl ? (
          <Image
            source={{uri: posterUrl}}
            resizeMode="contain"
            className="h-full w-full"
          />
        ) : null}
        <View className="absolute inset-0 items-center justify-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-black/60">
            <Play size={28} color="#fff" fill="#fff" />
          </View>
        </View>
      </Pressable>
      {videoOpen && (
        <HlsVideoPlayer
          blockId={blockId}
          title={title}
          watermark
          onClose={() => setVideoOpen(false)}
        />
      )}
    </>
  );
}
```

Note: `lessonId`/`lessonTitle`/`courseId`/`courseTitle`/`schoolId` are dropped from this call site entirely -- they were only ever used for the download-badge metadata (`startDownload` options in `HlsVideoPlayer`), and `LessonBlock.tsx` still has them available as its own props if a later task wants to thread them back through. This plan intentionally does not restore that plumbing (it's an unrelated, previously-fixed concern -- see Task 4's note) to keep this task's diff focused on the positioning-architecture revert. If download metadata (course/lesson title on the downloads badge) regresses, that's a one-line follow-up (add the same props back to both `LazyVideoPlayer` and this call), not a reason to block this plan.

Actually -- re-check before accepting that regression: `LessonBlock.tsx`'s current call site (as of the end of the prior session) already passes only `blockId`, `title`, `posterUrl` to `LazyVideoPlayer` (the lessonId/courseId plumbing was removed from `LazyVideoPlayer`'s signature in an earlier task in a previous plan, when the placeholder-rect approach was first built, and never restored to a pre-placeholder shape). Confirm this with:

Run: `grep -n "<LazyVideoPlayer" apps/mobile/src/components/LessonBlock.tsx`
Expected: a call with exactly `blockId`, `title`, `posterUrl` -- no `lessonId`/`courseId`/etc. If it has more props than that, copy them into both this file's prop signature and the `<HlsVideoPlayer>` call above so nothing regresses; if it matches exactly, no further action needed and the note above about a "regression" doesn't apply -- there was none to begin with.

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors in `LazyVideoPlayer.tsx`. `CourseScreen.tsx` still errors (Task 4 fixes it).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/LazyVideoPlayer.tsx
git commit -m "refactor: LazyVideoPlayer opens HlsVideoPlayer in its own Modal via local state

No more activeBlockId/placeholderRect coordination with CourseScreen --
the poster stays inline and simply mounts the player (which now owns
its Modal outright) on press.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Remove the positioning wiring from `CourseScreen`

**Files:**
- Modify: `apps/mobile/src/screens/CourseScreen.tsx`

**Interfaces:**
- Consumes: nothing from `activeVideoStore` (deleted in Task 1).

- [ ] **Step 1: Remove the store import and all derived state**

Find:

```ts
import {useActiveVideoStore} from '../store/activeVideoStore';
```

Delete this line entirely.

Find:

```ts
  const isFullscreen = useActiveVideoStore(s => s.isFullscreen);
  const activeBlockId = useActiveVideoStore(s => s.activeBlockId);
  const placeholderRect = useActiveVideoStore(s => s.placeholderRect);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const setScreenAnchorRef = useActiveVideoStore(s => s.setScreenAnchorRef);
  const bumpScrollTick = useActiveVideoStore(s => s.bumpScrollTick);
  const scrollViewRef = useRef<ScrollView>(null);
  const screenRef = useRef<View>(null);

  // HlsVideoPlayer positions itself against this same node (not the window) so its
  // absolute coordinates are correct regardless of the native header's height.
  useEffect(() => {
    setScreenAnchorRef(screenRef);
    return () => setScreenAnchorRef(null);
  }, [setScreenAnchorRef]);

  // Scrolling moves the active video's placeholder without firing its onLayout (only the
  // ScrollView's offset changes, not the placeholder's own size/position within it) --
  // this nudges the real player to re-measure and follow. Throttled: onScroll otherwise
  // fires far more often than a resize animation needs to track.
  const lastScrollBumpRef = useRef(0);
  const handleLessonScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollBumpRef.current < 32) return;
    lastScrollBumpRef.current = now;
    bumpScrollTick();
  }, [bumpScrollTick]);
```

Replace with:

```ts
  const scrollViewRef = useRef<ScrollView>(null);
```

- [ ] **Step 2: Remove `isFullscreen` from the header-options effect**

Find:

```ts
    navigation.setOptions({
      headerShown: !isFullscreen,
```

Replace with:

```ts
    navigation.setOptions({
      headerShown: true,
```

Find the effect's dependency array a few lines below (ends with `isFullscreen`):

```ts
  }, [selected, showPractice, selectedIndex, lessons.length, lessonsListOpen, isDark, isFullscreen]);
```

Replace with:

```ts
  }, [selected, showPractice, selectedIndex, lessons.length, lessonsListOpen, isDark]);
```

- [ ] **Step 3: Remove the lesson-change effect's `setActiveBlockId(null)`**

Find:

```ts
  useEffect(() => {
    setShowPractice(false);
    setActiveBlockId(null);
  }, [selectedLessonId, setActiveBlockId]);
```

Replace with:

```ts
  useEffect(() => {
    setShowPractice(false);
  }, [selectedLessonId]);
```

- [ ] **Step 4: Remove `screenRef` from `Screen` and `onScroll`/`scrollEventThrottle` from the `ScrollView`**

Find:

```tsx
      <Screen ref={screenRef}>
```

Replace with:

```tsx
      <Screen>
```

Find:

```tsx
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          onScroll={handleLessonScroll}
          scrollEventThrottle={32}
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          className="flex-1">
```

Replace with:

```tsx
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          className="flex-1">
```

(Leave `Screen`'s own `ref` prop support from the prior session's `Ui.tsx` change in place -- `apps/mobile/src/components/Ui.tsx`'s `Screen` stays a `forwardRef` component; not reverting that is harmless even though nothing passes a ref to it anymore, and reverting it risks breaking another `<Screen>` call site that might start relying on it later. No action needed there.)

- [ ] **Step 5: Remove the conditional `<HlsVideoPlayer>` render**

Find:

```tsx
        </ScrollView>
        {activeBlockId && lesson.blocks.some(b => b.id === activeBlockId) && (
          <HlsVideoPlayer
            blockId={activeBlockId}
            title={
              lesson.blocks.find(b => b.id === activeBlockId)?.label ||
              lesson.blocks.find(b => b.id === activeBlockId)?.fileName ||
              lesson.title
            }
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            courseId={courseId}
            courseTitle={course.title}
            schoolId={schoolId}
            watermark
            autoPlay
            rect={placeholderRect}
          />
        )}
        <Modal
          visible={lessonsListOpen}
```

Replace with:

```tsx
        </ScrollView>
        <Modal
          visible={lessonsListOpen}
```

Also remove the now-unused `HlsVideoPlayer` import:

Find:

```ts
import {HlsVideoPlayer} from '../components/HlsVideoPlayer';
```

Delete this line entirely.

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: zero errors across the whole project.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/CourseScreen.tsx
git commit -m "refactor: remove video-positioning wiring from CourseScreen

HlsVideoPlayer now owns its own Modal and never renders inside
CourseScreen's tree at all -- LazyVideoPlayer mounts it directly where
the poster is, so there is no longer any activeBlockId/placeholderRect/
screenAnchorRef/scrollTick coordination for CourseScreen to do.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Manual verification on the Android emulator/device

**Files:** none (verification only)

- [ ] **Step 1: Build and install**

Run: `cd apps/mobile/android && ./gradlew installDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Confirm Metro is serving the new bundle**

Run: `curl -s http://localhost:8081/status`
Expected: `packager-status:running`. If not running, start it: `cd apps/mobile && npx react-native start --port 8081 > /tmp/metro.log 2>&1 &` (background) and wait for `packager-status:running` before continuing.

- [ ] **Step 3: Launch and open a lesson with a video**

Run: `adb shell am force-stop uz.jamm.app && adb shell am start -n uz.jamm.app/.MainActivity`
Navigate to a course lesson containing a video block (manually, or report back to the user to navigate if on-device interaction is unreliable in this environment -- prior sessions found `adb shell input tap` coordinate-guessing and `screencap` both too unreliable here to trust as the sole verification method).

- [ ] **Step 4: Verify play opens fullscreen directly**

Tap the poster's play button. Expected: a fullscreen Modal opens immediately (no inline "activated but not fullscreen" state ever appears), playback starts (buffering spinner may appear briefly, then the video frame).

- [ ] **Step 5: Verify PiP shrink, drag, and expand -- all without interrupting playback**

Let playback run a few seconds (note the on-screen clock). Tap the PiP toggle button. Expected: the video shrinks to a small box in the top-right, the clock keeps advancing (compare before/after -- it should not reset to 0:00 or freeze), and the lesson content becomes visible/scrollable around the box. Drag the box to a different screen corner -- it should follow the finger smoothly and stay wherever released. Tap the PiP box's toggle again to return to fullscreen -- clock still advancing, no remount.

- [ ] **Step 6: Verify close stops playback and saves progress**

Tap the close (X) button. Expected: the Modal unmounts, returning to the lesson screen with the poster visible again in its original inline position. Re-open the same video (tap play again) -- expected: it resumes from roughly the same watched position (existing resume-from-watch-progress logic, unchanged by this plan).

- [ ] **Step 7: Verify Android back button also closes correctly**

With the video open in fullscreen, press the Android back button/gesture instead of the X. Expected: same close behavior as Step 6 (Modal's `onRequestClose` also calls `onClose`).

- [ ] **Step 8: Report results**

If any check in Steps 4-7 fails, stop here rather than attempting another inline-positioning patch -- this plan exists specifically because that approach was abandoned after three failed attempts. A failure at this stage means something in this Modal-based design itself needs re-examination (e.g. via superpowers:systematic-debugging), not a quick tweak to coordinates.
