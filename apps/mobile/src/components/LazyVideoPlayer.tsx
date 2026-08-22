import React, {useState} from 'react';
import {Pressable, View} from 'react-native';
import {Play} from 'lucide-react-native';
import {CachedImage} from './common/CachedImage';
import {HlsVideoPlayer} from './HlsVideoPlayer';

/**
 * Shows a poster until the student taps, then mounts HlsVideoPlayer right here (in the
 * lesson's normal document flow) and lets it drive native fullscreen on its own via
 * react-native-video's presentFullscreenPlayer -- no screen-level "active video" state is
 * needed, since native fullscreen/PiP are imperative calls on the mounted <Video>, not a
 * matter of where in the tree this component renders.
 */
export function LazyVideoPlayer({
  blockId,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  posterUrl,
}: {
  blockId: string;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  posterUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <View className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <HlsVideoPlayer
          blockId={blockId}
          title={title}
          lessonId={lessonId}
          lessonTitle={lessonTitle}
          courseId={courseId}
          courseTitle={courseTitle}
          schoolId={schoolId}
          onClose={() => setOpen(false)}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setOpen(true)}
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
