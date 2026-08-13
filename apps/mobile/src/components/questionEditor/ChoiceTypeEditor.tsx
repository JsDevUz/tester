import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, Circle, Trash2 } from 'lucide-react-native';

export type ChoiceOption = { text: string; isCorrect: boolean };

export function encodeChoiceOptions(opts: ChoiceOption[]): Array<{ text: string; isCorrect: boolean }> {
  return opts.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }));
}

export function ChoiceTypeEditor({
  type,
  options,
  onChange,
}: {
  type: 'single' | 'multi';
  options: ChoiceOption[];
  onChange: (options: ChoiceOption[]) => void;
}) {
  function toggleCorrect(index: number) {
    if (type === 'single') {
      onChange(options.map((o, i) => ({ ...o, isCorrect: i === index })));
    } else {
      onChange(options.map((o, i) => (i === index ? { ...o, isCorrect: !o.isCorrect } : o)));
    }
  }

  function setText(index: number, text: string) {
    onChange(options.map((o, i) => (i === index ? { ...o, text } : o)));
  }

  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <View className="gap-2">
      {options.map((option, index) => (
        <View key={index} className="flex-row items-center gap-2">
          <Pressable onPress={() => toggleCorrect(index)} className="h-8 w-8 items-center justify-center">
            {option.isCorrect ? <Check size={18} color="#10b981" /> : <Circle size={18} color="#cbd5e1" />}
          </Pressable>
          <TextInput
            value={option.text}
            onChangeText={(text) => setText(index, text)}
            placeholder={`Variant ${index + 1}`}
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-xl bg-gray-100 px-3 py-2.5 text-ink dark:bg-dark-canvas dark:text-dark-ink"
          />
          <Pressable onPress={() => remove(index)} className="h-8 w-8 items-center justify-center">
            <Trash2 size={16} color="#ef4444" />
          </Pressable>
        </View>
      ))}
      <Pressable
        onPress={() => onChange([...options, { text: '', isCorrect: false }])}
        className="items-center rounded-xl bg-gray-100 py-2.5 dark:bg-dark-canvas"
      >
        <Text className="text-xs font-bold text-gray-600 dark:text-dark-ink">+ Variant qo'shish</Text>
      </Pressable>
    </View>
  );
}
