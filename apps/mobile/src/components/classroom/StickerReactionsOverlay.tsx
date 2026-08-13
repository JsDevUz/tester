import React, {useEffect} from 'react';
import {Text, View, useWindowDimensions} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {getReactionAnimProps} from '../../lib/stickerReactionAnim';
import type {StickerReactionItem} from '../../types/classroom';

const NAME_COLORS = [
  '#1a73e8', '#0f9d58', '#f4511e', '#ab47bc',
  '#00acc1', '#fb8c00', '#e91e63', '#43a047',
];

function getNameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
}

function ReactionSticker({item, screenHeight}: {item: StickerReactionItem; screenHeight: number}) {
  const {leftPct, swingX, durationMs, delayMs} = getReactionAnimProps(item.id);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withTiming(1, {duration: durationMs, easing: Easing.linear}),
    );
  }, [delayMs, durationMs, progress]);

  const style = useAnimatedStyle(() => {
    'worklet';
    const p = progress.value;

    // Upward vertical float (0 to -90% of screen height)
    const translateY = -p * (screenHeight * 0.9);

    // Sinusoidal S-curve horizontal sway (matches web sx1, sx2, sx3, sx4)
    const translateX = Math.sin(p * Math.PI * 3.5) * swingX;

    // Opacity envelope: Quick fade-in (0->0.08), solid (0.08->0.75), smooth fade-out (0.75->1.0)
    let opacity = 1;
    if (p < 0.08) {
      opacity = p / 0.08;
    } else if (p > 0.75) {
      opacity = 1 - (p - 0.75) / 0.25;
    }

    // Scale envelope: Pop in (0.6 -> 1.15 -> 1.0), gentle shrink at apex (1.0 -> 0.75)
    let scale = 1;
    if (p < 0.08) {
      scale = 0.6 + (p / 0.08) * 0.55;
    } else if (p < 0.18) {
      scale = 1.15 - ((p - 0.08) / 0.1) * 0.15;
    } else if (p > 0.8) {
      scale = 1.0 - ((p - 0.8) / 0.2) * 0.25;
    }

    return {
      transform: [{translateY}, {translateX}, {scale}],
      opacity,
    };
  });

  const nameColor = item.isSelf ? '#1a73e8' : getNameColor(item.userName);
  const displayName = item.isSelf ? 'Siz' : item.userName;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 90,
          left: `${leftPct}%`,
          alignItems: 'center',
          gap: 3,
        },
        style,
      ]}
      pointerEvents="none">
      <Text style={{fontSize: 42, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: {width: 0, height: 4}, textShadowRadius: 8}}>
        {item.emoji}
      </Text>
      <View
        style={{
          backgroundColor: nameColor,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 2.5,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: 2},
          shadowOpacity: 0.25,
          shadowRadius: 4,
          elevation: 3,
        }}>
        <Text style={{color: 'white', fontSize: 11, fontWeight: '700'}}>
          {displayName}
        </Text>
      </View>
    </Animated.View>
  );
}

export function StickerReactionsOverlay({reactions}: {reactions: StickerReactionItem[]}) {
  const {height} = useWindowDimensions();
  if (!reactions || reactions.length === 0) return null;
  return (
    <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 70}} pointerEvents="none">
      {reactions.map(r => (
        <ReactionSticker key={r.id} item={r} screenHeight={height} />
      ))}
    </View>
  );
}

