# Seamless Fullscreen Video Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toggling video fullscreen/minimize never remounts `<Video>`, so playback never stops or reloads -- only the player's container animates size/position.

**Architecture:** Lift `HlsVideoPlayer` out of the lesson `ScrollView` so it renders once, directly under `CourseScreen`'s `Screen`, absolutely positioned. `LazyVideoPlayer` becomes an inert placeholder that reports its on-screen rect via `onLayout`/`measure` whenever it is the lesson's active video block. `CourseScreen` positions the single real player against that rect (or against the full screen when fullscreen), animating between the two with `react-native-reanimated`.

**Tech Stack:** React Native, TypeScript, Zustand (`activeVideoStore`), `react-native-reanimated` v4 (`useSharedValue`, `useAnimatedStyle`, `withTiming`), `react-native-video`.

**Spec:** `docs/superpowers/specs/2026-08-22-video-player-seamless-fullscreen-design.md`

## Global Constraints

- Exactly one video is "active" (mounted as a real `<Video>`) at a time, globally per lesson -- confirmed with user, no parallel active videos.
- Fullscreen is portrait-only. No orientation locking, no rotation handling.
- `CourseScreen`'s existing `navigation.setOptions({ headerShown: !isFullscreen, ... })` (CourseScreen.tsx:209) already hides the native header while fullscreen -- do not duplicate or remove this.
- `<Video>` and all of `HlsVideoPlayer`'s existing playback/caption/download/watch-progress logic must NOT change behavior -- only its outer positioning wrapper changes.
- Do not touch `DownloadCardBadge.tsx`, `DownloadsBottomSheet.tsx`, `SchoolsScreen.tsx`, `CoursesScreen.tsx`, or `offlineVideoStore.ts` -- unrelated to this change.

---

## File Structure

- **Modify `apps/mobile/src/store/activeVideoStore.ts`**: add `placeholderRect` state (the on-screen rect of the currently-active video's placeholder) and its setter.
- **Modify `apps/mobile/src/components/LazyVideoPlayer.tsx`**: strip out all player-mounting logic. It becomes a poster + play button that, once pressed, marks itself as the lesson's active block (via the store) and turns into a transparent layout-reporting placeholder. It no longer imports or renders `HlsVideoPlayer`.
- **Modify `apps/mobile/src/components/HlsVideoPlayer.tsx`**: remove the `Modal` branch and the two-shape `isFullscreen ? ... : ...` wrapper. Replace with a single `Animated.View` whose position/size is driven by two new props (`rect: {x,y,width,height} | null`, `isFullscreen: boolean`) via reanimated, always mounted at the same place in the tree once rendered.
- **Modify `apps/mobile/src/screens/CourseScreen.tsx`**: render the single `HlsVideoPlayer` instance as a sibling of the lesson `ScrollView` (inside `Screen`), gated on `activeBlockId` belonging to the current lesson's blocks. Pass it `placeholderRect` and `isFullscreen` from the store.
- **No change needed**: `apps/mobile/src/components/LessonBlock.tsx` already forwards `lessonId`/`lessonTitle`/`courseId`/`courseTitle`/`schoolId` to `LazyVideoPlayer` -- its own signature and body stay as-is.

---

## Task 1: Add placeholder rect to `activeVideoStore`

**Files:**
- Modify: `apps/mobile/src/store/activeVideoStore.ts`
- Test: manual (Zustand store, no test harness in this repo for stores -- verified via Task 5's manual test plan)

**Interfaces:**
- Produces: `PlaceholderRect` type `{ x: number; y: number; width: number; height: number }`; `useActiveVideoStore` state fields `placeholderRect: PlaceholderRect | null` and `setPlaceholderRect: (r: PlaceholderRect | null) => void`.

- [ ] **Step 1: Add the type and state fields**

Replace the full file contents with:

```ts
import {create} from 'zustand';

export interface PlaceholderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ActiveVideoState {
  isFullscreen: boolean;
  setIsFullscreen: (isFullscreen: boolean) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  placeholderRect: PlaceholderRect | null;
  setPlaceholderRect: (rect: PlaceholderRect | null) => void;
}

export const useActiveVideoStore = create<ActiveVideoState>((set) => ({
  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({isFullscreen}),
  activeBlockId: null,
  setActiveBlockId: (activeBlockId) => set({activeBlockId}),
  placeholderRect: null,
  setPlaceholderRect: (placeholderRect) => set({placeholderRect}),
}));
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors mentioning `activeVideoStore.ts` (other pre-existing errors in unrelated files, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/store/activeVideoStore.ts
git commit -m "feat: track the active video's on-screen placeholder rect

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Rework `LazyVideoPlayer` into a placeholder-only component

**Files:**
- Modify: `apps/mobile/src/components/LazyVideoPlayer.tsx`

**Interfaces:**
- Consumes: `useActiveVideoStore` from Task 1 (`activeBlockId`, `setActiveBlockId`, `setPlaceholderRect`, `isFullscreen`).
- Produces: `LazyVideoPlayer` component with the same public props it has today (`blockId`, `title`, `lessonId`, `lessonTitle`, `courseId`, `courseTitle`, `schoolId`, `posterUrl`, `watermark`) so `LessonBlock.tsx` needs zero changes. `watermark`/`title`/`lessonId`/etc. become unused by `LazyVideoPlayer` itself (the real player reads them from `CourseScreen` instead) -- keep them in the prop signature anyway so `LessonBlock`'s call site continues to compile unchanged, but mark them intentionally unused rather than deleting the props (deleting them would force a matching `LessonBlock.tsx` edit, which the spec explicitly scoped out).

Actually: simpler and cleaner -- since `LessonBlock.tsx` is passed `lessonId`/`lessonTitle`/`courseId`/`courseTitle`/`schoolId`/`watermark` purely to *forward* them onward, and the real player now lives in `CourseScreen` (which already has direct access to `lesson.id`, `lesson.title`, `courseId`, `course.title`, `schoolId` -- see CourseScreen.tsx:395-404), `LazyVideoPlayer` no longer needs most of these at all. Drop them from its signature; `LessonBlock` passes only what `LazyVideoPlayer` still needs (`blockId`, `posterUrl`, `title` for the poster's accessibility label). This does require one small `LessonBlock.tsx` edit (removing the now-unused props from its `<LazyVideoPlayer>` call) -- see Task 2 Step 4.

- [ ] **Step 1: Write the new `LazyVideoPlayer`**

Replace the full file contents with:

```tsx
import React, {useCallback, useRef} from 'react';
import {Image, Pressable, View, type LayoutChangeEvent} from 'react-native';
import {Play} from 'lucide-react-native';
import {useActiveVideoStore} from '../store/activeVideoStore';

/**
 * Shows a poster until the student taps, then hands off to the single
 * screen-level HlsVideoPlayer (see CourseScreen) by marking this block as
 * the lesson's active video.
 *
 * Once active, this component stops drawing the poster and instead reports
 * its own on-screen rect on every layout pass -- CourseScreen positions the
 * real player to sit exactly on top of that rect. The player itself never
 * lives here, so switching a block active/inactive never mounts or unmounts
 * a <Video>.
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
  const activeBlockId = useActiveVideoStore(s => s.activeBlockId);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const setPlaceholderRect = useActiveVideoStore(s => s.setPlaceholderRect);
  const isActive = activeBlockId === blockId;
  const containerRef = useRef<View>(null);

  // Re-measures on every layout pass (not just once on activation) so
  // scrolling the lesson while this video plays inline keeps the real
  // player, which reads this rect from the store, glued to the placeholder.
  const reportLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      containerRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setPlaceholderRect({x, y, width, height});
        }
      });
    },
    [setPlaceholderRect],
  );

  if (isActive) {
    return (
      <View
        ref={containerRef}
        onLayout={reportLayout}
        className="aspect-video w-full overflow-hidden rounded-2xl"
      />
    );
  }

  return (
    <Pressable
      onPress={() => setActiveBlockId(blockId)}
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
  );
}
```

- [ ] **Step 2: Typecheck (expect a `LessonBlock.tsx` error -- fixed in Step 4)**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: an error in `LessonBlock.tsx` about excess/unknown props (`lessonId`, `lessonTitle`, `courseId`, `courseTitle`, `schoolId`, `watermark`) passed to `<LazyVideoPlayer>`. This confirms the prop signature actually shrank; proceed to Step 4.

- [ ] **Step 3: (no-op placeholder removed -- proceed directly to the LessonBlock fix)**

- [ ] **Step 4: Update `LessonBlock.tsx`'s call site**

In `apps/mobile/src/components/LessonBlock.tsx`, find the video block's return (around line 349-361):

```tsx
    return (
      <LazyVideoPlayer
        blockId={block.id}
        title={block.label || block.fileName || lessonTitle || 'Video dars'}
        lessonId={lessonId}
        lessonTitle={lessonTitle}
        courseId={courseId}
        courseTitle={courseTitle}
        schoolId={schoolId}
        posterUrl={block.previewUrl}
        watermark
      />
    );
```

Replace with:

```tsx
    return (
      <LazyVideoPlayer
        blockId={block.id}
        title={block.label || block.fileName || lessonTitle || 'Video dars'}
        posterUrl={block.previewUrl}
      />
    );
```

`LessonBlock`'s own prop signature (`lessonId`, `lessonTitle`, `courseId`, `courseTitle`, `schoolId` as props of `LessonBlock` itself) stays unchanged -- `CourseScreen.tsx` still passes them in (CourseScreen.tsx:395-404) and Task 4 relies on `CourseScreen` having them directly, not on `LessonBlock` re-forwarding them anywhere.

- [ ] **Step 5: Typecheck again**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors in `LazyVideoPlayer.tsx` or `LessonBlock.tsx`. (`HlsVideoPlayer.tsx` and `CourseScreen.tsx` will still error until Tasks 3-4 land -- that's expected at this point.)

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/LazyVideoPlayer.tsx apps/mobile/src/components/LessonBlock.tsx
git commit -m "refactor: turn LazyVideoPlayer into a layout-reporting placeholder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rework `HlsVideoPlayer` to be externally positioned, never Modal-wrapped

**Files:**
- Modify: `apps/mobile/src/components/HlsVideoPlayer.tsx`

**Interfaces:**
- Consumes: `PlaceholderRect` type from Task 1 (`../store/activeVideoStore`).
- Produces: `HlsVideoPlayer` now takes two additional required props: `rect: PlaceholderRect | null` and, as before, reads `isFullscreen`/`setIsFullscreen`/`setActiveBlockId` from `useActiveVideoStore` (unchanged from current code). Removes its own `autoPlay` prop's old meaning of "mounted by a play press" note (still valid -- CourseScreen always mounts with `autoPlay` since mounting only happens after a play press) -- keep `autoPlay` as-is, always `true` from the call site (Task 4).

This task changes the returned JSX at the bottom of the file (roughly lines 1214-1288) and adds reanimated-driven positioning. All state/effects/handlers above `mediaSurface` (lines 194-1212) are untouched.

- [ ] **Step 1: Add reanimated imports and the `rect` prop**

At the top of `apps/mobile/src/components/HlsVideoPlayer.tsx`, add to the import list (after the existing `react-native-safe-area-context` import):

```ts
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
```

Remove `Modal` from the `react-native` import list (line 7) since it is no longer used anywhere in this file. Also remove the now-unused `Animated` name collision: the existing import list already destructures `Animated` from `'react-native'` (line 3) -- delete that line, since the file will use reanimated's default-exported `Animated` instead and the RN one is never referenced elsewhere in this file (confirm with a search in Step 2).

Update the component's prop type (currently `blockId, watermark, title, lessonId, lessonTitle, courseId, courseTitle, schoolId, autoPlay`, lines 169-193) to add:

```ts
  rect,
```

to the destructured params, and

```ts
  rect: import('../store/activeVideoStore').PlaceholderRect | null;
```

to the inline type -- or, cleaner, add a named import at the top:

```ts
import { useActiveVideoStore, type PlaceholderRect } from '../store/activeVideoStore';
```

(replacing the existing `import { useActiveVideoStore } from '../store/activeVideoStore';` at line 46), then use `rect: PlaceholderRect | null;` in the prop type block.

- [ ] **Step 2: Verify `Animated` from `react-native` is unused elsewhere in the file**

Run: `grep -n "Animated\." apps/mobile/src/components/HlsVideoPlayer.tsx`
Expected: no matches before this task's edits touch the return statement (the current file imports `Animated` from `react-native` but never uses it -- confirmed dead import from the earlier fullscreen-fix session). If any match turns up, keep both imports aliased (`import { Animated as RNAnimated } from 'react-native'`) instead of removing -- but expect zero matches.

- [ ] **Step 3: Replace the return statement**

Replace everything from `return (` at the end of the component (starting at the line matching `  return (\n    <View ref={wrapperRef}>`) through its closing `);\n}` with:

```tsx
  const rectWidth = useSharedValue(rect?.width ?? 0);
  const rectHeight = useSharedValue(rect?.height ?? 0);
  const rectX = useSharedValue(rect?.x ?? 0);
  const rectY = useSharedValue(rect?.y ?? 0);
  const mountOpacity = useSharedValue(rect ? 1 : 0);

  useEffect(() => {
    if (isFullscreen) {
      rectX.value = withTiming(0, {duration: 220});
      rectY.value = withTiming(0, {duration: 220});
      rectWidth.value = withTiming(windowWidth, {duration: 220});
      rectHeight.value = withTiming(windowHeight, {duration: 220});
      mountOpacity.value = withTiming(1, {duration: 120});
      return;
    }
    if (!rect) return;
    rectX.value = withTiming(rect.x, {duration: 220});
    rectY.value = withTiming(rect.y, {duration: 220});
    rectWidth.value = withTiming(rect.width, {duration: 220});
    rectHeight.value = withTiming(rect.height, {duration: 220});
    mountOpacity.value = withTiming(1, {duration: 120});
  }, [isFullscreen, rect, windowWidth, windowHeight, rectX, rectY, rectWidth, rectHeight, mountOpacity]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: rectX.value,
    top: rectY.value,
    width: rectWidth.value,
    height: rectHeight.value,
    opacity: mountOpacity.value,
    backgroundColor: 'black',
    borderRadius: isFullscreen ? 0 : 16,
    overflow: 'hidden',
    zIndex: 50,
  }));

  return (
    <Animated.View ref={wrapperRef} style={animatedContainerStyle}>
      {mediaSurface}
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
    </Animated.View>
  );
}
```

Notes on this replacement:
- `borderRadius` is forced to 0 in fullscreen (matches the old Modal's edge-to-edge look) and 16 otherwise (matches the old inline `rounded-2xl`).
- The old file's trailing "Mening video ko'rishim" watch-progress section (the `!isFullscreen && videoDuration !== null && ...` block, previously rendered as a sibling of the video `View` at the very bottom, lines 1252-1286) is **dropped from this component** -- it visually belongs directly under the video in the lesson flow, but the video itself no longer lives in that flow. Task 4 re-homes this block into `CourseScreen`, rendered directly under the placeholder in the normal `ScrollView` content, reading `videoDuration`/`watchedSegments`/`progressOpen` etc. -- **but those are local state inside `HlsVideoPlayer`, not exposed**. Resolve this now: keep the watch-progress UI inside `HlsVideoPlayer` itself, rendered as a *second* returned element via a fragment, absolutely positioned to sit just below the animated video container using the same `rect`/`isFullscreen` values (not fullscreen only, and hidden entirely while fullscreen). Replace the return block above once more with the final version:

```tsx
  const progressTop = useSharedValue((rect?.y ?? 0) + (rect?.height ?? 0));

  useEffect(() => {
    if (isFullscreen || !rect) return;
    progressTop.value = withTiming(rect.y + rect.height, {duration: 220});
  }, [isFullscreen, rect, progressTop]);

  const animatedProgressStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: rect?.x ?? 0,
    top: progressTop.value,
    width: rect?.width ?? 0,
    opacity: isFullscreen || !rect ? 0 : 1,
  }));

  return (
    <>
      <Animated.View ref={wrapperRef} style={animatedContainerStyle}>
        {mediaSurface}
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
      </Animated.View>
      {!isFullscreen && rect && videoDuration !== null && videoDuration > 0 && (
        <Animated.View style={[animatedProgressStyle, {marginTop: 8}]} pointerEvents="box-none">
          <Pressable onPress={() => setProgressOpen(v => !v)} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                Mening video ko'rishim
              </Text>
              {progressOpen ? (
                <ChevronUp size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              ) : (
                <ChevronDown size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              )}
            </View>
            {dynamicPercent !== null && (
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                {dynamicPercent}% ko'rilgan
              </Text>
            )}
          </Pressable>
          {progressOpen && (
            <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-dark-surface-2">
              {watchedSegments.map(seg => (
                <View
                  key={`${seg.startSec}-${seg.endSec}`}
                  className="absolute h-full rounded-full bg-brand"
                  style={{
                    left: `${Math.min(100, Math.max(0, (seg.startSec / videoDuration) * 100))}%`,
                    width: `${Math.min(100, Math.max(1, ((seg.endSec - seg.startSec) / videoDuration) * 100))}%`,
                  }}
                />
              ))}
            </View>
          )}
        </Animated.View>
      )}
    </>
  );
}
```

This keeps the progress panel visually anchored right under wherever the placeholder currently sits (tracking scroll the same way the video container does), hides it during fullscreen (matching prior behavior where it was only ever shown `!isFullscreen`), and requires no new props -- it's computed from the same `rect`/`isFullscreen` this task already threads through.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: errors only in `CourseScreen.tsx` (missing `rect` prop on `<HlsVideoPlayer>` -- not yet updated) and possibly none in `HlsVideoPlayer.tsx` itself. Fix any `HlsVideoPlayer.tsx`-local errors (e.g. unused `windowWidth`/`windowHeight` destructure removal is NOT needed -- they're still used in the new effect above) before moving on.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/HlsVideoPlayer.tsx
git commit -m "refactor: position HlsVideoPlayer with reanimated instead of a Modal

The Modal-based fullscreen remounted <Video> on every toggle (a Modal is
backed by its own native window, so the child moves to a different React
parent and gets recreated). Positioning a single always-mounted
Animated.View instead means fullscreen/minimize only resizes the
container -- playback never stops or reloads.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Wire the single player instance into `CourseScreen`

**Files:**
- Modify: `apps/mobile/src/screens/CourseScreen.tsx`

**Interfaces:**
- Consumes: `HlsVideoPlayer` from Task 3 (props: `blockId: string`, `watermark?: boolean`, `title?: string`, `lessonId?: string`, `lessonTitle?: string`, `courseId?: string`, `courseTitle?: string`, `schoolId?: string`, `autoPlay?: boolean`, `rect: PlaceholderRect | null`); `activeBlockId`/`placeholderRect`/`setActiveBlockId`/`isFullscreen` from `useActiveVideoStore` (Task 1).

- [ ] **Step 1: Read `activeBlockId` and `placeholderRect` from the store**

In `apps/mobile/src/screens/CourseScreen.tsx`, find (around line 70-71):

```tsx
  const isFullscreen = useActiveVideoStore(s => s.isFullscreen);
  const scrollViewRef = useRef<ScrollView>(null);
```

Replace with:

```tsx
  const isFullscreen = useActiveVideoStore(s => s.isFullscreen);
  const activeBlockId = useActiveVideoStore(s => s.activeBlockId);
  const placeholderRect = useActiveVideoStore(s => s.placeholderRect);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const scrollViewRef = useRef<ScrollView>(null);
```

- [ ] **Step 2: Import `HlsVideoPlayer`**

Add near the top with the other component imports (after the `LessonBlock` import, around line 29):

```tsx
import {HlsVideoPlayer} from '../components/HlsVideoPlayer';
```

- [ ] **Step 3: Clear the active video when switching lessons**

Find the effect that resets practice mode on lesson change (around line 178-180):

```tsx
  useEffect(() => {
    setShowPractice(false);
  }, [selectedLessonId]);
```

Replace with:

```tsx
  useEffect(() => {
    setShowPractice(false);
    setActiveBlockId(null);
  }, [selectedLessonId, setActiveBlockId]);
```

This matches the spec's edge case ("Leaving the lesson/screen: unmount naturally cleans up") -- switching lessons deactivates whatever video was playing rather than leaving a stale `activeBlockId` from the old lesson pointing at a block that no longer renders (which would leave `HlsVideoPlayer` mounted with no visible placeholder to track).

- [ ] **Step 4: Render the single player as a sibling of the `ScrollView`**

Find the closing of the lesson `ScrollView` and the "Darslar Tartibi" `Modal` that follows it (around line 476-477):

```tsx
        </ScrollView>
        <Modal
          visible={lessonsListOpen}
```

Insert the player render between them:

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

The `lesson.blocks.some(b => b.id === activeBlockId)` guard is the "belongs to the current lesson" check from the spec -- without it, a stale `activeBlockId` left over from a race during the lesson-switch effect (Step 3) could otherwise briefly render a player for a block that isn't part of `lesson` anymore.

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit -p .`
Expected: no errors in `CourseScreen.tsx`, `HlsVideoPlayer.tsx`, `LazyVideoPlayer.tsx`, `LessonBlock.tsx`, or `activeVideoStore.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/CourseScreen.tsx
git commit -m "feat: mount a single HlsVideoPlayer per lesson at the screen level

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Manual verification on the Android emulator

**Files:** none (verification only)

- [ ] **Step 1: Build and install**

Run: `cd apps/mobile/android && ./gradlew installDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 2: Launch and open a lesson with a video**

Run: `adb shell am force-stop uz.jamm.app && adb shell am start -n uz.jamm.app/.MainActivity`
Navigate (manually or via `adb shell input tap`) to a course lesson containing a video block.

- [ ] **Step 3: Verify uninterrupted fullscreen toggle**

Press play, wait until the on-screen clock is visibly advancing past 3-4 seconds. Tap the fullscreen button. Verify:
- No loading spinner reappears.
- The clock keeps advancing across the transition (compare the second shown just before the tap and just after the animation settles -- it should be at most ~1s behind wall-clock time, not reset to 0:00).
- Take a screenshot mid-animation (`adb exec-out screencap -p`) if timing allows, to confirm the video frame is not black/blank during the resize.

- [ ] **Step 4: Verify uninterrupted minimize**

Tap the minimize (fullscreen) button again. Verify the same three checks as Step 3, in reverse, and additionally that no blank gap or leftover space appears above the header once minimized (regression check for the earlier Modal-layout fix this replaces).

- [ ] **Step 5: Verify inline scroll tracking**

While the video plays inline (not fullscreen), scroll the lesson content up and down. Verify the video's visual position stays glued to its placeholder slot (no lag, no visible seam) and that the "Mening video ko'rishim" progress panel (if the video has a known duration) stays directly under it.

- [ ] **Step 6: Verify switching lessons stops the player cleanly**

With a video active (not fullscreen), navigate to a different lesson via "Darslar Tartibi". Verify no player-shaped remnant or crash occurs, and opening a video in the new lesson works normally.

- [ ] **Step 7: Report results**

If any check in Steps 3-6 fails, do not proceed to further tasks -- this is the terminal verification step for the whole plan. Note the exact failing behavior for follow-up debugging (do not guess a fix without re-running systematic-debugging).
