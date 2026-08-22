import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import type { ChatPreview } from '../types/api';
import { useLiveNotificationsStore } from '../store/liveNotificationsStore';
import { apiGetPracticeChats } from '../api/practiceMessenger';
import { CachedImage } from '../components/common/CachedImage';
import { cachedFirst } from '../lib/storage';
import { Empty, Loading, OfflineBanner, Screen, StaleNote } from '../components/Ui';
import {TAB_BAR_CLEARANCE} from '../navigation/tabBarLayout';

export { ChatScreen } from './ChatScreen';

function chatPreviewText(chat: ChatPreview): string {
  if (!chat.lastMessage) return 'Yangi amaliyot xabarlari shu yerda chiqadi';
  if (chat.lastMessage.type === 'practice_test') return 'Test natijasi yuborildi';
  if (chat.lastMessage.type === 'practice_image') return 'Rasmli topshiriq yuborildi';
  if (chat.lastMessage.type === 'practice_grade') return 'Topshiriq baholandi';
  return chat.lastMessage.content;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MessengerScreen({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [data, setData] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await cachedFirst(
        'chats',
        async () => (await apiGetPracticeChats()).chats,
        (fresh) => {
          setData(fresh);
          setStale(false);
        },
        () => setStale(false),
      );
      if (r.data) setData(r.data);
      setStale(r.fromCache);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    useLiveNotificationsStore.getState().clearUnread();
  }, []);

  const visibleChats = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return data;
    return data.filter(
      (chat) =>
        chat.curator.name.toLowerCase().includes(trimmed) ||
        chat.courseTitle.toLowerCase().includes(trimmed) ||
        chat.groupName.toLowerCase().includes(trimmed),
    );
  }, [data, query]);

  return (
    <Screen>
      <View
        className="border-b border-slate-100 bg-white px-4 pb-3 dark:border-dark-border dark:bg-dark-surface"
        style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-2.5 rounded-2xl border border-slate-200/60 bg-slate-50 px-4 py-2.5 dark:border-dark-border dark:bg-dark-surface-2">
          <Search size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Qidirish"
            placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
            className="min-w-0 flex-1 text-sm font-medium text-ink dark:text-dark-ink"
            style={{ paddingVertical: 0, includeFontPadding: false }}
          />
        </View>
      </View>
      <OfflineBanner />
      <StaleNote stale={stale} />
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={visibleChats}
          keyExtractor={(x) => x.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={
            <Empty text={query.trim() ? 'Bunday amaliyot chati topilmadi' : "Hozircha suhbatlar yo'q"} />
          }
          contentContainerClassName="px-4"
          contentContainerStyle={{paddingBottom: TAB_BAR_CLEARANCE}}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('Chat', { chatId: item.id, title: item.curator.name })}
              className="mt-2 flex-row items-center rounded-2xl bg-white p-4 dark:bg-dark-surface">
              <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-indigo-50 dark:bg-dark-surface-2">
                {item.curator.avatarUrl ? (
                  <CachedImage
                    source={{ uri: item.curator.avatarUrl }}
                    category="avatars"
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-base font-bold text-brand">
                    {(item.curator.name || '?').trim()[0]?.toUpperCase()}
                  </Text>
                )}
              </View>
              <View className="ml-3 min-w-0 flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text numberOfLines={1} className="flex-1 font-extrabold text-ink dark:text-dark-ink">
                    {item.curator.name}
                  </Text>
                  {item.lastMessage && (
                    <Text className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-dark-muted">
                      {formatDateTime(item.lastMessage.createdAt)}
                    </Text>
                  )}
                </View>
                <Text numberOfLines={1} className="text-xs text-slate-400 dark:text-dark-muted">
                  {item.courseTitle} · {item.groupName}
                </Text>
                <Text numberOfLines={1} className="mt-1 text-sm text-slate-500 dark:text-dark-muted">
                  {chatPreviewText(item)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
