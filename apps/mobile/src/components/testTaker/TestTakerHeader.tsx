import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { formatTime } from '../../lib/testTaker';

interface TestTakerHeaderProps {
  fontSize: number;
  timeLeft: number | null;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
}

export function TestTakerHeader({
  fontSize: _fontSize,
  timeLeft,
  onIncreaseFontSize,
  onDecreaseFontSize,
}: TestTakerHeaderProps) {
  return (
    <View className="flex-row items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-dark-border">
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onDecreaseFontSize}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-xl active:bg-slate-100 dark:bg-dark-surface-2">
          <Text className="text-xs font-bold text-slate-400 dark:text-dark-muted">
            A-
          </Text>
        </Pressable>
        <Pressable
          onPress={onIncreaseFontSize}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-xl active:bg-slate-100 dark:bg-dark-surface-2">
          <Text className="text-sm font-bold text-slate-400 dark:text-dark-muted">
            A+
          </Text>
        </Pressable>
      </View>
      {timeLeft !== null && (
        <View className="flex-row items-center gap-1">
          <Clock size={12} color={timeLeft < 60 ? '#ef4444' : '#64748b'} />
          <Text
            className={`font-mono text-sm ${
              timeLeft < 60 ? 'text-red-500' : 'text-slate-500'
            }`}>
            {formatTime(timeLeft)}
          </Text>
        </View>
      )}
    </View>
  );
}
