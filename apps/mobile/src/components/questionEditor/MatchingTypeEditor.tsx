import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

export type MatchPair = { left: string; right: string };

export function encodeMatching(pairs: MatchPair[]): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  const valid = pairs.filter((p) => p.left.trim() && p.right.trim());
  return valid.flatMap((p, i) => [
    { text: p.left.trim(), isCorrect: true, orderIndex: i },
    { text: p.right.trim(), isCorrect: false, orderIndex: i },
  ]);
}

export function MatchingTypeEditor({ pairs, onChange }: { pairs: MatchPair[]; onChange: (pairs: MatchPair[]) => void }) {
  function setLeft(index: number, left: string) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, left } : p)));
  }
  function setRight(index: number, right: string) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, right } : p)));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      {pairs.map((pair, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <TextInput
            value={pair.left}
            onChangeText={(text) => setLeft(index, text)}
            placeholder="Chap (savol)"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <TextInput
            value={pair.right}
            onChangeText={(text) => setRight(index, text)}
            placeholder="O'ng (javob)"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={() => onChange([...pairs, { left: '', right: '' }])} className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas">
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Juftlik qo'shish</Text>
      </Pressable>
    </View>
  );
}
