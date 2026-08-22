import React from 'react';
import {Pressable, View} from 'react-native';
import {Play} from 'lucide-react-native';
import {useActiveVideoStore} from '../store/activeVideoStore';
import {CachedImage} from './common/CachedImage';

/**
 * Shows a poster until the student taps, then hands off to the single screen-level
 * HlsVideoPlayer (see CourseScreen) by marking this block as the lesson's active video.
 * The poster itself never moves or unmounts -- it stays exactly where the lesson content
 * placed it, whether or not the player is currently open.
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
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);

  return (
    <Pressable
      onPress={() => setActiveBlockId(blockId)}
      accessibilityRole="button"
      accessibilityLabel={title ? `${title}ni ijro etish` : 'Videoni ijro etish'}
      className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {posterUrl ? (
        <CachedImage
          source={{uri: posterUrl}}
          category="general"
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
