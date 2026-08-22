import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { ArrowDown, DownloadCloud } from 'lucide-react-native';

interface Props {
  count: number;
  averageProgress?: number;
  onPress: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function DownloadCardBadge({
  count,
  averageProgress = 0,
  onPress,
  className = '',
  size = 'md',
}: Props) {
  const pulse = useSharedValue(1);
  const arrowTranslateY = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );

    arrowTranslateY.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulse, arrowTranslateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const animatedArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: arrowTranslateY.value }],
  }));

  const isSmall = size === 'sm';
  const radius = isSmall ? 10 : 13;
  const strokeWidth = isSmall ? 2 : 2.5;
  const circleSize = (radius + strokeWidth) * 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.max(5, Math.min(100, averageProgress))) / 100;

  return (
    <Pressable
      onPress={(e) => {
        // Prevent triggering parent card navigation
        e.stopPropagation?.();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Yuklanayotgan videolar: ${count} ta`}
      hitSlop={6}
      className={`flex-row items-center gap-1.5 ${isSmall ? 'rounded-lg' : 'rounded-full'} bg-indigo-500/10 px-2.5 py-1.5 border border-indigo-500/20 active:opacity-75 ${className}`}>
      <Animated.View style={animatedStyle} className="relative items-center justify-center">
        <Svg width={circleSize} height={circleSize} className="rotate-[-90deg]">
          {/* Background circle */}
          <Circle
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            stroke="#6366f1"
            strokeOpacity={0.25}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx={circleSize / 2}
            cy={circleSize / 2}
            r={radius}
            stroke="#6366f1"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
        <Animated.View style={[{ position: 'absolute' }, animatedArrowStyle]}>
          <ArrowDown size={isSmall ? 10 : 12} color="#6366f1" strokeWidth={2.5} />
        </Animated.View>
      </Animated.View>

      <Text className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
        {Math.round(averageProgress)}% ({count})
      </Text>
    </Pressable>
  );
}
