import React, {useCallback, useEffect, useRef} from 'react';
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
  const screenAnchorRef = useActiveVideoStore(s => s.screenAnchorRef);
  const scrollTick = useActiveVideoStore(s => s.scrollTick);
  const isActive = activeBlockId === blockId;
  const containerRef = useRef<View>(null);

  // Re-measures on every layout pass (not just once on activation) so
  // scrolling the lesson while this video plays inline keeps the real
  // player, which reads this rect from the store, glued to the placeholder.
  //
  // Both this node and CourseScreen's root (screenAnchorRef) are measured in window
  // coordinates and the anchor's offset subtracted out, rather than using
  // measureLayout(anchor, ...) directly -- measureLayout proved unreliable here (it
  // returned wildly wrong coordinates, e.g. thousands of dp off-screen, after a scroll),
  // while measureInWindow against the real window is the well-exercised RN path.
  const reportLayout = useCallback(
    (_e?: LayoutChangeEvent) => {
      const anchor = screenAnchorRef?.current;
      if (!anchor) return;
      anchor.measureInWindow((anchorX, anchorY) => {
        containerRef.current?.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            setPlaceholderRect({x: x - anchorX, y: y - anchorY, width, height});
          }
        });
      });
    },
    [setPlaceholderRect, screenAnchorRef],
  );

  // onLayout only fires when this node's own size/position within its parent changes --
  // scrolling the lesson moves it on screen without touching either, so the placeholder
  // would otherwise go stale the moment the ScrollView moves. bumpScrollTick (see
  // CourseScreen's onScroll) re-runs the same measurement on every scroll tick.
  useEffect(() => {
    if (isActive) reportLayout();
  }, [isActive, scrollTick, reportLayout]);

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
