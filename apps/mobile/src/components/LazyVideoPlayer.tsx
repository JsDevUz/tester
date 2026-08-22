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
