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
  const screenAnchorRef = useActiveVideoStore(s => s.screenAnchorRef);
  const isActive = activeBlockId === blockId;
  const containerRef = useRef<View>(null);

  // Re-measures on every layout pass (not just once on activation) so
  // scrolling the lesson while this video plays inline keeps the real
  // player, which reads this rect from the store, glued to the placeholder.
  //
  // Measured against CourseScreen's own root node (screenAnchorRef), not the window --
  // HlsVideoPlayer is positioned absolutely inside that same root, so a window-relative
  // rect would be off by however far the native header pushes that root down the screen.
  const reportLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      const anchor = screenAnchorRef?.current;
      if (!anchor) return;
      containerRef.current?.measureLayout(
        anchor,
        (x, y, width, height) => {
          if (width > 0 && height > 0) {
            setPlaceholderRect({x, y, width, height});
          }
        },
        () => {},
      );
    },
    [setPlaceholderRect, screenAnchorRef],
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
