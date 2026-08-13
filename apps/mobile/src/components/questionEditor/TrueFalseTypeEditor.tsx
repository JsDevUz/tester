import React from 'react';
import { Pressable, Text, View } from 'react-native';

export function encodeTrueFalse(correct: 'true' | 'false'): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [
    { text: "To'g'ri", isCorrect: correct === 'true', orderIndex: 0 },
    { text: "Noto'g'ri", isCorrect: correct === 'false', orderIndex: 1 },
  ];
}

export function TrueFalseTypeEditor({
  value,
  onChange,
}: {
  value: 'true' | 'false' | null;
  onChange: (value: 'true' | 'false') => void;
}) {
  return (
    <View className="flex-row gap-3">
      <Pressable
        onPress={() => onChange('true')}
        className={`flex-1 items-center rounded-xl py-3 ${value === 'true' ? 'bg-emerald-500' : 'bg-gray-100 dark:bg-dark-canvas'}`}
      >
        <Text className={`font-bold ${value === 'true' ? 'text-white' : 'text-gray-600 dark:text-dark-ink'}`}>To'g'ri</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('false')}
        className={`flex-1 items-center rounded-xl py-3 ${value === 'false' ? 'bg-rose-500' : 'bg-gray-100 dark:bg-dark-canvas'}`}
      >
        <Text className={`font-bold ${value === 'false' ? 'text-white' : 'text-gray-600 dark:text-dark-ink'}`}>Noto'g'ri</Text>
      </Pressable>
    </View>
  );
}
