import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type {NativeStackNavigationProp, NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  Check,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  MoreVertical,
  Pencil,
  Pin,
  Reply,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react-native';
import {useColorScheme} from 'nativewind';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../navigation/types';
import type {ChatMessage, ChatPreview} from '../types/api';
import {useLiveNotificationsStore} from '../store/liveNotificationsStore';
import {
  apiDeletePracticeMessage,
  apiGetPracticeChat,
  apiGetPracticeChats,
  apiSendPracticeMessage,
  apiUpdatePracticeMessage,
} from '../api/practiceMessenger';
import {CachedImage} from '../components/common/CachedImage';
import {connectPracticeMessengerSocket} from '../lib/practiceMessengerSocket';
import type {PracticeMessengerSocketPayload} from '../types/api';
import {cached} from '../lib/storage';
import {Empty, Loading, OfflineBanner, Screen, StaleNote} from '../components/Ui';
import {useNetwork} from '../providers/NetworkProvider';
import {useAuthStore} from '../store/authStore';
import {getApiErrorMessage} from '../lib/errors';

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

export function MessengerScreen({navigation}: {navigation: NativeStackNavigationProp<RootStackParamList>}) {
  const insets = useSafeAreaInsets();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [data, setData] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await cached('chats', async () => (await apiGetPracticeChats()).chats);
      setData(r.data);
      setStale(r.stale);
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
    return data.filter(chat =>
      chat.curator.name.toLowerCase().includes(trimmed) ||
      chat.courseTitle.toLowerCase().includes(trimmed) ||
      chat.groupName.toLowerCase().includes(trimmed),
    );
  }, [data, query]);

  return (
    <Screen>
      <View className="border-b border-slate-100 bg-white px-4 pb-3 dark:border-dark-border dark:bg-dark-surface" style={{paddingTop: insets.top + 12}}>
        <View className="flex-row items-center gap-2.5 rounded-2xl border border-slate-200/60 bg-slate-50 px-4 py-2.5 dark:border-dark-border dark:bg-dark-surface-2">
          <Search size={18} color={isDark ? '#a4a7b2' : '#94a3b8'} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Qidirish"
            placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
            className="min-w-0 flex-1 text-sm font-medium text-ink dark:text-dark-ink"
            style={{paddingVertical: 0, includeFontPadding: false}}
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
          keyExtractor={x => x.id}
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
          renderItem={({item}) => (
            <Pressable
              onPress={() => navigation.navigate('Chat', {chatId: item.id, title: item.curator.name})}
              className="mt-2 flex-row items-center rounded-2xl bg-white p-4 dark:bg-dark-surface">
              <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-indigo-50 dark:bg-dark-surface-2">
                {item.curator.avatarUrl ? (
                  <CachedImage source={{uri: item.curator.avatarUrl}} category="avatars" className="h-full w-full" resizeMode="cover" />
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

type ChatProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

type PendingState = 'pending' | 'sent' | 'failed';

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
}

export function ChatScreen({route}: ChatProps) {
  const insets = useSafeAreaInsets();
  const {chatId} = route.params;
  const {width: windowWidth} = useWindowDimensions();
  const bubbleMaxWidth = windowWidth * 0.85;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingStatus, setPendingStatus] = useState<Record<string, PendingState>>({});
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [menuTarget, setMenuTarget] = useState<{ item: ChatMessage; own: boolean } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const {online} = useNetwork();
  const {colorScheme} = useColorScheme();
  const isDark = colorScheme === 'dark';
  const token = useAuthStore(s => s.token);
  const currentUser = useAuthStore(s => s.user);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    try {
      const r = await cached(`chat:${chatId}`, () => apiGetPracticeChat(chatId));
      setMessages(r.data.messages);
      setHasMore(r.data.hasMore);
      setNextCursor(r.data.nextCursor);
      setStale(r.stale);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadOlder() {
    if (!hasMore || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await apiGetPracticeChat(chatId, nextCursor);
      setMessages(current => {
        const existingIds = new Set(current.map(m => m.id));
        return [...page.messages.filter(m => !existingIds.has(m.id)), ...current];
      });
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch {
      // Silently ignore - user can retry by scrolling again.
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const socket = connectPracticeMessengerSocket(token);

    function handleNewMessage(payload: PracticeMessengerSocketPayload) {
      if (payload.chatId !== chatId) return;
      if (payload.type !== 'text') {
        void load();
        return;
      }
      setMessages(current => {
        if (current.some(m => m.id === payload.id)) return current;
        const sender =
          current.find(m => m.sender.id === payload.senderId)?.sender ??
          (payload.senderId === currentUser?.id
            ? {id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl ?? null}
            : {id: payload.senderId, name: 'Foydalanuvchi', avatarUrl: null});
        return [
          ...current,
          {
            id: payload.id,
            sender,
            type: 'text',
            content: payload.content,
            createdAt: payload.createdAt,
            editedAt: payload.editedAt ?? null,
            deletedAt: payload.deletedAt ?? null,
            replyTo: null,
            metadata: {},
            practice: null,
            testSubmission: null,
            imageSubmission: null,
            imageSubmissions: [],
          },
        ];
      });
    }

    function handleUpdated(payload: PracticeMessengerSocketPayload) {
      if (payload.chatId !== chatId) return;
      setMessages(current =>
        current.map(m =>
          m.id === payload.id
            ? {...m, content: payload.content, editedAt: payload.editedAt ?? new Date().toISOString()}
            : m,
        ),
      );
    }

    function handleDeleted(payload: PracticeMessengerSocketPayload) {
      if (payload.chatId !== chatId) return;
      setMessages(current =>
        current.map(m =>
          m.id === payload.id
            ? {...m, content: '', deletedAt: payload.deletedAt ?? new Date().toISOString(), editedAt: null}
            : m,
        ),
      );
    }

    socket.on('new_message', handleNewMessage);
    socket.on('message_updated', handleUpdated);
    socket.on('message_deleted', handleDeleted);
    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_updated', handleUpdated);
      socket.off('message_deleted', handleDeleted);
    };
  }, [token, chatId, currentUser, load]);

  function cancelAction() {
    setReplyingTo(null);
    setEditingMessage(null);
    setDraft('');
  }

  function startReply(message: ChatMessage) {
    if (message.deletedAt) return;
    setEditingMessage(null);
    setReplyingTo(message);
    setDraft('');
  }

  function startEdit(message: ChatMessage) {
    setReplyingTo(null);
    setEditingMessage(message);
    setDraft(message.content);
  }

  async function deleteMessage(messageId: string) {
    try {
      await apiDeletePracticeMessage(chatId, messageId);
      if (editingMessage?.id === messageId) cancelAction();
      setMessages(current =>
        current.map(m => (m.id === messageId ? {...m, deletedAt: new Date().toISOString()} : m)),
      );
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Xabarni o'chirib bo'lmadi"));
    }
  }

  function confirmDelete(message: ChatMessage) {
    Alert.alert('Xabarni o‘chirish', "Bu amalni ortga qaytarib bo'lmaydi.", [
      {text: 'Bekor qilish', style: 'cancel'},
      {text: "O'chirish", style: 'destructive', onPress: () => void deleteMessage(message.id)},
    ]);
  }

  async function send() {
    const value = draft.trim();
    if (!value) return;
    if (!online) {
      Alert.alert('Internet kerak', 'Xabar yuborish faqat online ishlaydi.');
      return;
    }

    if (editingMessage) {
      setSending(true);
      const editId = editingMessage.id;
      try {
        await apiUpdatePracticeMessage(chatId, editId, value);
        setMessages(current =>
          current.map(m => (m.id === editId ? {...m, content: value, editedAt: new Date().toISOString()} : m)),
        );
        cancelAction();
      } catch (error) {
        Alert.alert('Xatolik', getApiErrorMessage(error, "Xabarni tahrirlab bo'lmadi"));
      } finally {
        setSending(false);
      }
      return;
    }

    const replyToMessageId = replyingTo?.id;
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: ChatMessage = {
      id: localId,
      sender: {
        id: currentUser?.id ?? '',
        name: currentUser?.name ?? 'Siz',
        avatarUrl: currentUser?.avatarUrl ?? null,
      },
      type: 'text',
      content: value,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyTo: replyingTo
        ? {id: replyingTo.id, senderName: replyingTo.sender.name, content: replyingTo.content, type: replyingTo.type}
        : null,
      metadata: {},
      practice: null,
      testSubmission: null,
      imageSubmission: null,
      imageSubmissions: [],
    };

    setMessages(current => [...current, optimisticMessage]);
    setPendingStatus(current => ({...current, [localId]: 'pending'}));
    setDraft('');
    setReplyingTo(null);

    try {
      const created = await apiSendPracticeMessage(chatId, value, replyToMessageId);
      setMessages(current =>
        current.map(m => (m.id === localId ? {...m, id: created.id, createdAt: created.createdAt} : m)),
      );
      setPendingStatus(current => {
        const next = {...current};
        delete next[localId];
        next[created.id] = 'sent';
        return next;
      });
    } catch {
      setPendingStatus(current => ({...current, [localId]: 'failed'}));
    }
  }

  function retrySend(message: ChatMessage) {
    setMessages(current => current.filter(m => m.id !== message.id));
    setPendingStatus(current => {
      const next = {...current};
      delete next[message.id];
      return next;
    });
    setDraft(message.content);
  }

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const pinnedMessages = useMemo(
    () => messages.filter(m => m.type === 'practice_test' || m.type === 'practice_image'),
    [messages],
  );

  useEffect(() => {
    setActivePinnedIndex(Math.max(0, pinnedMessages.length - 1));
  }, [pinnedMessages.length]);

  function focusPreviousPinnedMessage() {
    if (pinnedMessages.length === 0) return;
    const nextIndex = activePinnedIndex <= 0 ? pinnedMessages.length - 1 : activePinnedIndex - 1;
    const message = pinnedMessages[nextIndex];
    setActivePinnedIndex(nextIndex);
    const reversedIndex = reversedMessages.findIndex(m => m.id === message.id);
    if (reversedIndex >= 0) {
      listRef.current?.scrollToIndex({index: reversedIndex, animated: true, viewPosition: 0.5});
    }
    setHighlightedMessageId(message.id);
    setTimeout(() => setHighlightedMessageId(null), 1600);
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      className="flex-1 bg-canvas dark:bg-dark-canvas">
      <OfflineBanner />
      <StaleNote stale={stale} />
      {pinnedMessages.length > 0 && (
        <Pressable
          onPress={focusPreviousPinnedMessage}
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
      )}
      <FlatList
        ref={listRef}
        inverted
        data={reversedMessages}
        keyExtractor={x => x.id}
        contentContainerClassName="p-4"
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        onScrollToIndexFailed={() => {}}
        ListFooterComponent={loadingOlder ? <ActivityIndicator className="py-2" color="#6366f1" /> : null}
        renderItem={({item}) => {
          const own = item.sender.id === currentUser?.id;
          const status = pendingStatus[item.id];
          const isHighlighted = highlightedMessageId === item.id;

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
                  onLongPress={() => !item.deletedAt && setMenuTarget({item, own})}
                  className={`rounded-2xl px-4 py-2.5 ${
                    own
                      ? 'rounded-br-md bg-brand'
                      : 'rounded-bl-md bg-white dark:bg-dark-surface'
                  }`}>
                  {!item.deletedAt && (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setMenuTarget({item, own});
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
                      <Pressable onPress={() => retrySend(item)} hitSlop={6}>
                        <Text className="text-[11px] font-bold text-red-200">Qayta yuborish</Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      {(replyingTo || editingMessage) && (
        <View className="flex-row items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2 dark:border-dark-border dark:bg-dark-surface-2">
          <View className="min-w-0 flex-1">
            <Text className="text-xs font-bold text-ink dark:text-dark-ink">
              {editingMessage ? 'Xabarni tahrirlash' : `${replyingTo?.sender.name} xabariga javob`}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs text-slate-500 dark:text-dark-muted">
              {(editingMessage ?? replyingTo)?.content}
            </Text>
          </View>
          <Pressable onPress={cancelAction} hitSlop={8}>
            <X size={16} color={isDark ? '#a4a7b2' : '#94a3b8'} />
          </Pressable>
        </View>
      )}
      <View
        style={{paddingBottom: Math.max(insets.bottom, 12)}}
        className="flex-row items-end gap-2 border-t border-slate-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface">
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={online ? 'Xabar yozing...' : 'Offline'}
          placeholderTextColor={isDark ? '#a4a7b2' : '#94a3b8'}
          className="max-h-28 min-h-12 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-slate-800 dark:bg-dark-surface-2 dark:text-dark-ink"
        />
        <Pressable
          onPress={() => void send()}
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

      {menuTarget && (
        <Modal
          visible={Boolean(menuTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuTarget(null)}>
          <Pressable
            onPress={() => setMenuTarget(null)}
            className="flex-1 justify-center bg-black/30 px-5">
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                alignSelf: menuTarget.own ? 'flex-end' : 'flex-start',
                width: 210,
                backgroundColor: isDark ? '#1e1f26' : '#ffffff',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                borderWidth: 1,
                borderRadius: 24,
                padding: 6,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: isDark ? 0.5 : 0.2,
                shadowRadius: 24,
                elevation: 24,
              }}>
              <Pressable
                onPress={() => {
                  const target = menuTarget.item;
                  setMenuTarget(null);
                  startReply(target);
                }}
                className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
                  isDark ? 'active:bg-white/5' : 'active:bg-slate-50'
                }`}>
                <Reply size={18} color={isDark ? '#e4e4e7' : '#3f3f46'} />
                <Text
                  style={{ color: isDark ? '#f4f4f5' : '#18181b' }}
                  className="text-[15px] font-semibold">
                  Javob yozish
                </Text>
              </Pressable>

              {menuTarget.own && (
                <>
                  <Pressable
                    onPress={() => {
                      const target = menuTarget.item;
                      setMenuTarget(null);
                      startEdit(target);
                    }}
                    className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
                      isDark ? 'active:bg-white/5' : 'active:bg-slate-50'
                    }`}>
                    <Pencil size={18} color={isDark ? '#e4e4e7' : '#3f3f46'} />
                    <Text
                      style={{ color: isDark ? '#f4f4f5' : '#18181b' }}
                      className="text-[15px] font-semibold">
                      Tahrirlash
                    </Text>
                  </Pressable>

                  <View
                    style={{
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                    }}
                    className="my-1 h-[1px]"
                  />

                  <Pressable
                    onPress={() => {
                      const target = menuTarget.item;
                      setMenuTarget(null);
                      confirmDelete(target);
                    }}
                    className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${
                      isDark ? 'active:bg-red-950/30' : 'active:bg-red-50'
                    }`}>
                    <Trash2 size={18} color="#ef4444" />
                    <Text className="text-[15px] font-semibold text-red-500">
                      O‘chirish
                    </Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}
