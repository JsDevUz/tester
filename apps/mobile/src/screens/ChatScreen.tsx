import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pencil, Reply, Trash2 } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import type { ChatMessage, PracticeMessengerSocketPayload } from '../types/api';
import {
  apiDeletePracticeMessage,
  apiGetPracticeChat,
  apiSendPracticeMessage,
  apiUpdatePracticeMessage,
} from '../api/practiceMessenger';
import { connectPracticeMessengerSocket } from '../lib/practiceMessengerSocket';
import { cachedFirst } from '../lib/storage';
import { Loading, OfflineBanner, StaleNote } from '../components/Ui';
import { useNetwork } from '../providers/NetworkProvider';
import { useAuthStore } from '../store/authStore';
import { getApiErrorMessage } from '../lib/errors';
import {
  MobileMessageBubble,
  type PendingState,
} from '../components/messenger/MobileMessageBubble';
import { MobileChatPinnedBanner } from '../components/messenger/MobileChatPinnedBanner';
import { MobileMessageInput } from '../components/messenger/MobileMessageInput';

type ChatProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ route }: ChatProps) {
  const insets = useSafeAreaInsets();
  const { chatId } = route.params;
  const { width: windowWidth } = useWindowDimensions();
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
  const { online } = useNetwork();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    try {
      const applyChat = (chat: Awaited<ReturnType<typeof apiGetPracticeChat>>) => {
        setMessages(chat.messages);
        setHasMore(chat.hasMore);
        setNextCursor(chat.nextCursor);
      };
      const r = await cachedFirst(
        `chat:${chatId}`,
        () => apiGetPracticeChat(chatId),
        (fresh) => {
          applyChat(fresh);
          setStale(false);
        },
        () => setStale(false),
      );
      if (r.data) applyChat(r.data);
      setStale(r.fromCache);
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
      setMessages((current) => {
        const existingIds = new Set(current.map((m) => m.id));
        return [...page.messages.filter((m) => !existingIds.has(m.id)), ...current];
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
      setMessages((current) => {
        if (current.some((m) => m.id === payload.id)) return current;
        const sender =
          current.find((m) => m.sender.id === payload.senderId)?.sender ??
          (payload.senderId === currentUser?.id
            ? { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl ?? null }
            : { id: payload.senderId, name: 'Foydalanuvchi', avatarUrl: null });
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
      setMessages((current) =>
        current.map((m) =>
          m.id === payload.id
            ? { ...m, content: payload.content, editedAt: payload.editedAt ?? new Date().toISOString() }
            : m,
        ),
      );
    }

    function handleDeleted(payload: PracticeMessengerSocketPayload) {
      if (payload.chatId !== chatId) return;
      setMessages((current) =>
        current.map((m) =>
          m.id === payload.id
            ? { ...m, content: '', deletedAt: payload.deletedAt ?? new Date().toISOString(), editedAt: null }
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
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)),
      );
    } catch (error) {
      Alert.alert('Xatolik', getApiErrorMessage(error, "Xabarni o'chirib bo'lmadi"));
    }
  }

  function confirmDelete(message: ChatMessage) {
    Alert.alert('Xabarni o‘chirish', "Bu amalni ortga qaytarib bo'lmaydi.", [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: "O'chirish", style: 'destructive', onPress: () => void deleteMessage(message.id) },
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
        setMessages((current) =>
          current.map((m) => (m.id === editId ? { ...m, content: value, editedAt: new Date().toISOString() } : m)),
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
        ? { id: replyingTo.id, senderName: replyingTo.sender.name, content: replyingTo.content, type: replyingTo.type }
        : null,
      metadata: {},
      practice: null,
      testSubmission: null,
      imageSubmission: null,
      imageSubmissions: [],
    };

    setMessages((current) => [...current, optimisticMessage]);
    setPendingStatus((current) => ({ ...current, [localId]: 'pending' }));
    setDraft('');
    setReplyingTo(null);

    try {
      const created = await apiSendPracticeMessage(chatId, value, replyToMessageId);
      setMessages((current) =>
        current.map((m) => (m.id === localId ? { ...m, id: created.id, createdAt: created.createdAt } : m)),
      );
      setPendingStatus((current) => {
        const next = { ...current };
        delete next[localId];
        next[created.id] = 'sent';
        return next;
      });
    } catch {
      setPendingStatus((current) => ({ ...current, [localId]: 'failed' }));
    }
  }

  function retrySend(message: ChatMessage) {
    setMessages((current) => current.filter((m) => m.id !== message.id));
    setPendingStatus((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });
    setDraft(message.content);
  }

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.type === 'practice_test' || m.type === 'practice_image'),
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
    const reversedIndex = reversedMessages.findIndex((m) => m.id === message.id);
    if (reversedIndex >= 0) {
      listRef.current?.scrollToIndex({ index: reversedIndex, animated: true, viewPosition: 0.5 });
    }
    setHighlightedMessageId(message.id);
    setTimeout(() => setHighlightedMessageId(null), 1600);
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      className="flex-1 bg-canvas dark:bg-dark-canvas">
      <OfflineBanner />
      <StaleNote stale={stale} />

      <MobileChatPinnedBanner
        pinnedMessages={pinnedMessages}
        activePinnedIndex={activePinnedIndex}
        isDark={isDark}
        onPress={focusPreviousPinnedMessage}
      />

      <FlatList
        ref={listRef}
        inverted
        data={reversedMessages}
        keyExtractor={(x) => x.id}
        contentContainerClassName="p-4"
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        onScrollToIndexFailed={() => {}}
        ListFooterComponent={loadingOlder ? <ActivityIndicator className="py-2" color="#6366f1" /> : null}
        renderItem={({ item }) => (
          <MobileMessageBubble
            item={item}
            own={item.sender.id === currentUser?.id}
            bubbleMaxWidth={bubbleMaxWidth}
            isHighlighted={highlightedMessageId === item.id}
            status={pendingStatus[item.id]}
            isDark={isDark}
            onOpenMenu={(target, own) => setMenuTarget({ item: target, own })}
            onRetrySend={retrySend}
          />
        )}
      />

      <MobileMessageInput
        draft={draft}
        online={online}
        sending={sending}
        isDark={isDark}
        insetsBottom={insets.bottom}
        replyingTo={replyingTo}
        editingMessage={editingMessage}
        onDraftChange={setDraft}
        onSend={() => void send()}
        onCancelAction={cancelAction}
      />

      {menuTarget && (
        <Modal
          visible={Boolean(menuTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuTarget(null)}>
          <Pressable onPress={() => setMenuTarget(null)} className="flex-1 justify-center bg-black/30 px-5">
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
                <Text style={{ color: isDark ? '#f4f4f5' : '#18181b' }} className="text-[15px] font-semibold">
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
                    <Text style={{ color: isDark ? '#f4f4f5' : '#18181b' }} className="text-[15px] font-semibold">
                      Tahrirlash
                    </Text>
                  </Pressable>

                  <View
                    style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9' }}
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
                    <Text className="text-[15px] font-semibold text-red-500">O‘chirish</Text>
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
