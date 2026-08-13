import React from 'react';
import { Text, TextInput, View } from 'react-native';

export function encodeSlider(min: string, max: string, step: string): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [
    { text: min.trim() || '0', isCorrect: false, orderIndex: 0 },
    { text: max.trim() || '100', isCorrect: false, orderIndex: 1 },
    { text: step.trim() || '1', isCorrect: false, orderIndex: 2 },
  ];
}

export function SliderTypeEditor({
  min,
  max,
  step,
  onChangeMin,
  onChangeMax,
  onChangeStep,
}: {
  min: string;
  max: string;
  step: string;
  onChangeMin: (v: string) => void;
  onChangeMax: (v: string) => void;
  onChangeStep: (v: string) => void;
}) {
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Min</Text>
        <TextInput value={min} onChangeText={onChangeMin} keyboardType="numeric" placeholder="0" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Max</Text>
        <TextInput value={max} onChangeText={onChangeMax} keyboardType="numeric" placeholder="100" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
      <View className="flex-1">
        <Text className="mb-1 text-[10px] text-gray-400">Qadam</Text>
        <TextInput value={step} onChangeText={onChangeStep} keyboardType="numeric" placeholder="1" placeholderTextColor="#94a3b8" className="rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink" />
      </View>
    </View>
  );
}
