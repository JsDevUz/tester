import React, {useState} from 'react';
import {Image, Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent} from 'react-native';
import {Check} from 'lucide-react-native';
import type {QuestionFeedback} from '../../types/delivery';

export function DropPinQuestion({
  imageUrl,
  value,
  onChange,
  locked,
  feedback,
}: {
  imageUrl: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  const [size, setSize] = useState({width: 0, height: 0});
  const pin = value ? value.split(',').map(Number) : null;
  const correctPin =
    feedback?.isCorrect === false && feedback.correctAnswer
      ? feedback.correctAnswer.split(',').map(Number)
      : null;

  function handlePress(e: GestureResponderEvent) {
    if (locked || size.width <= 0 || size.height <= 0) return;
    const {locationX, locationY} = e.nativeEvent;
    const x = Math.min(1, Math.max(0, locationX / size.width)).toFixed(4);
    const y = Math.min(1, Math.max(0, locationY / size.height)).toFixed(4);
    onChange(`${x},${y}`);
  }

  return (
    <View className="flex flex-col gap-2">
      <Text className="text-xs text-slate-400 dark:text-dark-muted">Rasmda to'g'ri joyni bosing</Text>
      <Pressable
        onPress={handlePress}
        onLayout={(e: LayoutChangeEvent) => setSize({width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height})}
        className="relative w-full overflow-hidden rounded-2xl">
        {imageUrl ? (
          <Image source={{uri: imageUrl}} className="w-full" style={{height: 220}} resizeMode="contain" />
        ) : (
          <View className="h-48 w-full items-center justify-center bg-slate-100 dark:bg-dark-surface-2">
            <Text className="text-sm text-slate-400 dark:text-dark-muted">Rasm yo'q</Text>
          </View>
        )}
        {pin && pin.length === 2 && (
          <View
            pointerEvents="none"
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%`}}>
            <View
              className={`h-6 w-6 items-center justify-center rounded-full border border-white shadow ${
                feedback?.isCorrect === true
                  ? 'bg-emerald-500'
                  : feedback?.isCorrect === false
                    ? 'bg-rose-500'
                    : 'bg-indigo-500'
              }`}>
              <View className="h-2 w-2 rounded-full bg-white dark:bg-dark-canvas" />
            </View>
          </View>
        )}
        {correctPin && Number.isFinite(correctPin[0]) && Number.isFinite(correctPin[1]) && (
          <View
            pointerEvents="none"
            className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{left: `${correctPin[0] * 100}%`, top: `${correctPin[1] * 100}%`}}>
            <View className="h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow">
              <Check size={16} color="white" />
            </View>
          </View>
        )}
      </Pressable>
      {feedback && !pin && (
        <View className="rounded-2xl border border-rose-500 bg-rose-500 px-4 py-3.5">
          <Text className="text-white">Siz joy belgilamadingiz</Text>
        </View>
      )}
      {pin && !locked && (
        <Pressable onPress={() => onChange('')} className="self-start">
          <Text className="text-xs text-slate-400 dark:text-dark-muted">Tozalash</Text>
        </Pressable>
      )}
    </View>
  );
}
