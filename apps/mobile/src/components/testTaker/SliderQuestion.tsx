import React, {useMemo, useRef, useState} from 'react';
import {PanResponder, Text, View, type LayoutChangeEvent} from 'react-native';
import type {PublicOption, QuestionFeedback} from '../../types/delivery';

// Web port note: @react-native-community/slider is not installed and can't
// be added from this worktree (no npm install access outside the sandbox),
// so this is a small hand-rolled track+thumb slider built on PanResponder
// (already a core RN API, no new dependency needed). Behavior matches the
// web <input type="range">: min/max/step come from options[0..2].text.
export function SliderQuestion({
  options,
  value,
  onChange,
  locked,
  feedback,
}: {
  options: PublicOption[];
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current = value !== '' ? parseFloat(value) : Math.round((min + max) / 2);
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);

  const color =
    feedback?.isCorrect === true ? '#10b981' : feedback?.isCorrect === false ? '#f43f5e' : '#111827';

  function valueFromX(x: number): number {
    const width = trackWidthRef.current;
    if (width <= 0) return current;
    const ratio = Math.min(1, Math.max(0, x / width));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.min(max, Math.max(min, stepped));
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: () => !locked,
        onPanResponderGrant: e => {
          if (locked) return;
          onChange(String(valueFromX(e.nativeEvent.locationX)));
        },
        onPanResponderMove: e => {
          if (locked) return;
          onChange(String(valueFromX(e.nativeEvent.locationX)));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, min, max, step, trackWidth],
  );

  const ratio = max > min ? (current - min) / (max - min) : 0;

  return (
    <View className="flex flex-col gap-3">
      <Text className="text-center text-3xl font-bold" style={{color}}>
        {current}
      </Text>
      <View
        className="h-9 justify-center"
        onLayout={(e: LayoutChangeEvent) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
          setTrackWidth(e.nativeEvent.layout.width);
        }}
        {...panResponder.panHandlers}>
        <View className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-dark-border">
          <View className="h-full rounded-full" style={{width: `${ratio * 100}%`, backgroundColor: color}} />
        </View>
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            className="absolute h-6 w-6 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{left: Math.max(0, ratio * trackWidth - 12), top: '50%', backgroundColor: color}}
          />
        )}
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-slate-400 dark:text-dark-muted">{min}</Text>
        <Text className="text-xs text-slate-400 dark:text-dark-muted">{max}</Text>
      </View>
      {feedback?.isCorrect === false && feedback.correctAnswer && (
        <View className="rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3">
          <Text className="text-center font-semibold text-white">
            To'g'ri qiymat: {feedback.correctAnswer}
          </Text>
        </View>
      )}
    </View>
  );
}
