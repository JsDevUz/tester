import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  MoreVertical,
} from 'lucide-react-native';
import type { ChatMessage } from '../../types/api';

export type PendingState = 'pending' | 'sent' | 'failed';

export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
}

interface MobileMessageBubbleProps {
  item: ChatMessage;
  own: boolean;
  bubbleMaxWidth: number;
  isHighlighted: boolean;
  status?: PendingState;
  isDark: boolean;
  onOpenMenu: (item: ChatMessage, own: boolean) => void;
  onRetrySend: (item: ChatMessage) => void;
}

export function MobileMessageBubble({
  item,
  own,
  bubbleMaxWidth,
  isHighlighted,
  status,
  isDark,
  onOpenMenu,
  onRetrySend,
}: MobileMessageBubbleProps) {
  if (item.type !== 'text') {
    return (
      <View className={`mb-2 flex-row ${own ? 'justify-end' : 'justify-start'}`}>
        <View
          style={{width: bubbleMaxWidth}}
          className={`rounded-2xl bg-white px-4 py-3 dark:bg-dark-surface ${
            isHighlighted ? 'border-2 border-brand' : ''
          }`}>
          <View className="flex-row items-start gap-2.5">
            <View
              className={`h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                item.type === 'practice_image'
                  ? 'bg-amber-50 dark:bg-amber-500/15'
                  : item.type === 'practice_grade'
                    ? 'bg-emerald-50 dark:bg-emerald-500/15'
                    : 'bg-indigo-50 dark:bg-dark-surface-2'
              }`}>
              {item.type === 'practice_image' ? (
                <ImageIcon size={16} color="#f59e0b" />
              ) : item.type === 'practice_grade' ? (
                <CheckCircle2 size={16} color="#10b981" />
              ) : (
                <ClipboardCheck size={16} color="#6366f1" />
              )}
            </View>
            <View style={{flexShrink: 1, flexGrow: 1, minWidth: 0}}>
              <Text numberOfLines={2} className="text-sm font-bold text-ink dark:text-dark-ink">
                {item.practice?.title ?? 'Amaliyot'}
              </Text>
              <Text numberOfLines={3} className="mt-0.5 text-xs text-slate-500 dark:text-dark-muted">
                {item.content}
              </Text>
            </View>
          </View>
          {item.type === 'practice_test' && item.testSubmission && (
            <View className="mt-3 flex-row items-center justify-between rounded-xl bg-slate-900 px-3 py-2 dark:bg-dark-surface-2">
              <Text className="text-xs font-semibold text-white dark:text-dark-ink">Natijalar</Text>
              <Text className="text-sm font-bold text-white dark:text-dark-ink">
                {item.testSubmission.score ?? 0} / {item.testSubmission.total ?? 0}
              </Text>
            </View>
          )}
          <Text className="mt-1.5 text-right text-[11px] text-slate-400 dark:text-dark-muted">
            {messageTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={`mb-2 flex-row ${own ? 'justify-end' : 'justify-start'}`}>
      <View style={{maxWidth: bubbleMaxWidth}} className="relative">
        <Pressable
          onLongPress={() => !item.deletedAt && onOpenMenu(item, own)}
          className={`rounded-2xl px-4 py-2.5 ${
            own
              ? 'rounded-br-md bg-brand'
              : 'rounded-bl-md bg-white dark:bg-dark-surface'
          }`}>
          {!item.deletedAt && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onOpenMenu(item, own);
              }}
              hitSlop={8}
              className="absolute right-1 top-1 z-10 h-6 w-6 items-center justify-center rounded-full">
              <MoreVertical size={14} color={own ? 'rgba(255,255,255,0.85)' : isDark ? '#a4a7b2' : '#64748b'} />
            </Pressable>
          )}
          {item.replyTo && (
            <View
              className={`mb-2 rounded-lg border-l-[3px] px-2.5 py-1.5 ${
                own ? 'border-white bg-white/15' : 'border-brand bg-slate-50 dark:bg-dark-surface-2'
              }`}>
              <Text
                numberOfLines={1}
                className={`text-xs font-bold ${own ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>
                {item.replyTo.senderName}
              </Text>
              <Text
                numberOfLines={2}
                className={`text-xs ${own ? 'text-white/85' : 'text-slate-500 dark:text-dark-muted'}`}>
                {item.replyTo.content}
              </Text>
            </View>
          )}
          {item.deletedAt ? (
            <Text className={`text-sm italic ${own ? 'text-white/70' : 'text-slate-400 dark:text-dark-muted'}`}>
              Xabar o'chirilgan
            </Text>
          ) : (
            <Text className={`text-[15px] ${own ? 'text-white' : 'text-ink dark:text-dark-ink'}`}>
              {item.content}
            </Text>
          )}
          <View className="mt-1 flex-row items-center justify-end gap-1">
            <Text className={`text-[11px] ${own ? 'text-white/70' : 'text-slate-400 dark:text-dark-muted'}`}>
              {messageTime(item.createdAt)}
              {item.editedAt ? ' · tahrirlangan' : ''}
            </Text>
            {own && status === 'pending' && <Clock size={12} color="rgba(255,255,255,0.7)" />}
            {own && status !== 'pending' && !item.deletedAt && status !== 'failed' && (
              <Check size={13} color="rgba(255,255,255,0.7)" />
            )}
            {own && status === 'failed' && (
              <Pressable onPress={() => onRetrySend(item)} hitSlop={6}>
                <Text className="text-[11px] font-bold text-red-200">Qayta yuborish</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
