import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native';

export function encodeReorder(tokens: string[]): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, orderIndex) => ({ text, isCorrect: true, orderIndex }));
}

export function ReorderTypeEditor({ tokens, onChange }: { tokens: string[]; onChange: (tokens: string[]) => void }) {
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= tokens.length) return;
    const next = [...tokens];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function setText(index: number, text: string) {
    onChange(tokens.map((t, i) => (i === index ? text : t)));
  }
  function remove(index: number) {
    onChange(tokens.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      <Text className="text-xs text-gray-400">To'g'ri tartibda kiriting:</Text>
      {tokens.map((token, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <Text className="w-5 text-xs text-gray-400">{index + 1}.</Text>
          <TextInput
            value={token}
            onChangeText={(text) => setText(index, text)}
            placeholder={`${index + 1}-element`}
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => move(index, -1)} disabled={index === 0} className="h-8 w-8 items-center justify-center opacity-100">
            <ChevronUp size={16} color={index === 0 ? '#e2e8f0' : '#475569'} />
          </Pressable>
          <Pressable onPress={() => move(index, 1)} disabled={index === tokens.length - 1} className="h-8 w-8 items-center justify-center">
            <ChevronDown size={16} color={index === tokens.length - 1 ? '#e2e8f0' : '#475569'} />
          </Pressable>
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...tokens, ''])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Element qo'shish</Text>
      </Pressable>
    </View>
  );
}
