import React, {useState} from 'react';
import {Image, Pressable, View} from 'react-native';
import {Play} from 'lucide-react-native';
import {HlsVideoPlayer} from './HlsVideoPlayer';

/**
 * Shows a poster until the student taps, then mounts the real player.
 *
 * A lesson can hold several video blocks, and every mounted player immediately opens a
 * playback session, checks the offline registry and starts pulling segments. On a phone that
 * meant several streams competing for one connection before anything had been watched, which
 * made the first video slower to start rather than faster.
 *
 * Once mounted the player stays mounted, so pausing does not discard the buffer.
 */
export function LazyVideoPlayer({
  blockId,
  title,
  posterUrl,
  watermark,
}: {
  blockId: string;
  title?: string;
  posterUrl?: string | null;
  watermark?: boolean;
}) {
  const [activated, setActivated] = useState(false);

  if (activated) {
    // autoPlay: the tap that mounted the player was already the "play" tap.
    return <HlsVideoPlayer blockId={blockId} title={title} watermark={watermark} autoPlay />;
  }

  return (
    <Pressable
      onPress={() => setActivated(true)}
      accessibilityRole="button"
      accessibilityLabel="Videoni ijro etish"
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
