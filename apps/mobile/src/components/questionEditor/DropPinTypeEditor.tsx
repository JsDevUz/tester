import React, { useState } from 'react';
import { Image, Pressable, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

export function encodeDropPinRadius(radiusPct: string): Array<{ text: string; isCorrect: boolean; orderIndex: number }> {
  return [{ text: radiusPct.trim() || '8', isCorrect: false, orderIndex: 0 }];
}

export function DropPinTypeEditor({
  imageUrl,
  correctAnswer,
  radiusPct,
  onChangeRadius,
  onChangeCorrectAnswer,
}: {
  imageUrl: string | null;
  correctAnswer: string;
  radiusPct: string;
  onChangeRadius: (v: string) => void;
  onChangeCorrectAnswer: (v: string) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(e: LayoutChangeEvent) {
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  }

  function onPress(e: GestureResponderEvent) {
    if (!size.width || !size.height) return;
    const xPct = (e.nativeEvent.locationX / size.width) * 100;
    const yPct = (e.nativeEvent.locationY / size.height) * 100;
    onChangeCorrectAnswer(`${xPct.toFixed(1)},${yPct.toFixed(1)}`);
  }

  const [px, py] = correctAnswer ? correctAnswer.split(',').map(Number) : [null, null];

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-[10px] text-gray-400">Radius (1-30%):</Text>
        <TextInput
          value={radiusPct}
          onChangeText={onChangeRadius}
          keyboardType="numeric"
          placeholder="8"
          placeholderTextColor="#94a3b8"
          className="w-16 rounded-lg bg-gray-100 px-2 py-1.5 text-sm text-ink dark:bg-dark-canvas dark:text-dark-ink"
        />
      </View>
      {imageUrl ? (
        <Pressable onPress={onPress} onLayout={onLayout} className="relative overflow-hidden rounded-xl">
          <Image source={{ uri: imageUrl }} style={{ width: '100%', aspectRatio: size.width && size.height ? size.width / size.height : 1.5 }} resizeMode="cover" />
          {px !== null && py !== null && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: `${px}%`,
                top: `${py}%`,
                width: 16,
                height: 16,
                marginLeft: -8,
                marginTop: -8,
                borderRadius: 8,
                backgroundColor: '#ef4444',
                borderWidth: 2,
                borderColor: '#ffffff',
              }}
            />
          )}
        </Pressable>
      ) : (
        <View className="items-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 dark:bg-dark-canvas dark:border-zinc-700">
          <Text className="text-xs text-gray-400">Yuqoridan rasm yuklang, keyin to'g'ri joyni bosing</Text>
        </View>
      )}
      {correctAnswer && (
        <Text className="text-[10px] text-gray-400">Pin: {correctAnswer} | Radius: {radiusPct || '8'}%</Text>
      )}
    </View>
  );
}
