import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronUp, Pin } from 'lucide-react-native';
import type { ChatMessage } from '../../types/api';

interface MobileChatPinnedBannerProps {
  pinnedMessages: ChatMessage[];
  activePinnedIndex: number;
  isDark: boolean;
  onPress: () => void;
}

export function MobileChatPinnedBanner({
  pinnedMessages,
  activePinnedIndex,
  isDark,
  onPress,
}: MobileChatPinnedBannerProps) {
  if (pinnedMessages.length === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-slate-100 bg-white px-5 py-2.5 dark:border-dark-border dark:bg-dark-surface">
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 dark:bg-dark-surface-2">
        <Pin size={16} color="#6366f1" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-bold text-ink dark:text-dark-ink">
          Qadalgan amaliyotlar · {activePinnedIndex + 1}/{pinnedMessages.length}
        </Text>
        <Text numberOfLines={1} className="text-xs text-slate-500 dark:text-dark-muted">
          {pinnedMessages[activePinnedIndex]?.practice?.title ?? 'Amaliyot'}
        </Text>
      </View>
      <ChevronUp size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
    </Pressable>
  );
}
