import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pencil, Send, X } from 'lucide-react-native';
import type { ChatMessage } from '../../types/api';

interface MobileMessageInputProps {
  draft: string;
  online: boolean;
  sending: boolean;
  isDark: boolean;
  insetsBottom: number;
  replyingTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onCancelAction: () => void;
}

export function MobileMessageInput({
  draft,
  online,
  sending,
  isDark,
  insetsBottom,
  replyingTo,
  editingMessage,
  onDraftChange,
  onSend,
  onCancelAction,
}: MobileMessageInputProps) {
  return (
    <>
      {(replyingTo || editingMessage) && (
        <View className="flex-row items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 dark:border-dark-border dark:bg-dark-surface-2">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-ink dark:text-dark-ink">
              {editingMessage
                ? 'Xabarni tahrirlash'
                : `${replyingTo?.sender.name} xabariga javob`}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-slate-500 dark:text-dark-muted">
              {(editingMessage ?? replyingTo)?.content}
            </Text>
          </View>
          <Pressable onPress={onCancelAction} hitSlop={8}>
            <X size={16} color={isDark ? '#a4a7b2' : '#94a3b8'} />
          </Pressable>
        </View>
      )}

      <View
        style={{paddingBottom: Math.max(insetsBottom, 12)}}
        className="flex-row items-end gap-2 border-t border-slate-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface">
        <TextInput
          multiline
          value={draft}
          onChangeText={onDraftChange}
          placeholder={online ? 'Xabar yozing...' : 'Offline'}
          placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
          className="max-h-28 min-h-12 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-slate-800 dark:bg-dark-surface-2 dark:text-dark-ink"
        />
        <Pressable
          onPress={onSend}
          disabled={sending || !draft.trim()}
          className="h-12 w-12 items-center justify-center rounded-2xl bg-brand disabled:opacity-40">
          {sending ? (
            <ActivityIndicator color="white" />
          ) : editingMessage ? (
            <Pencil size={18} color="white" />
          ) : (
            <Send size={20} color="white" />
          )}
        </Pressable>
      </View>
    </>
  );
}
