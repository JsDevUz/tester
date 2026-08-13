import React from 'react';
import { Text, View } from 'react-native';
import { ReorderTypeEditor } from './ReorderTypeEditor';
import { Pressable, TextInput } from 'react-native';
import { Trash2 } from 'lucide-react-native';

export function encodeArrange(
  correctTokens: string[],
  distractors: string[],
): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  const validTokens = correctTokens.map((t) => t.trim()).filter(Boolean);
  const validDistractors = distractors.map((d) => d.trim()).filter(Boolean);
  return [
    ...validTokens.map((text, orderIndex) => ({ text, isCorrect: true, orderIndex })),
    ...validDistractors.map((text) => ({ text, isCorrect: false, orderIndex: 0 })),
  ];
}

export function ArrangeTypeEditor({
  correctTokens,
  distractors,
  onChangeTokens,
  onChangeDistractors,
}: {
  correctTokens: string[];
  distractors: string[];
  onChangeTokens: (tokens: string[]) => void;
  onChangeDistractors: (distractors: string[]) => void;
}) {
  function setDistractor(index: number, text: string) {
    onChangeDistractors(distractors.map((d, i) => (i === index ? text : d)));
  }
  function removeDistractor(index: number) {
    onChangeDistractors(distractors.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-3">
      <ReorderTypeEditor tokens={correctTokens} onChange={onChangeTokens} />
      <Text className="text-xs text-gray-400">Chalg'ituvchi variantlar (ixtiyoriy):</Text>
      {distractors.map((d, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <TextInput
            value={d}
            onChangeText={(text) => setDistractor(index, text)}
            placeholder="Chalg'ituvchi"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => removeDistractor(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChangeDistractors([...distractors, ''])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Chalg'ituvchi qo'shish</Text>
      </Pressable>
    </View>
  );
}
