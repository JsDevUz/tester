import { create } from 'zustand';
import { apiGetUnreadPracticeChatIds } from '../api/practiceMessenger';

interface PracticeMessengerState {
  unreadChatIds: Set<string>;
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
  markChatUnread: (chatId: string) => void;
  markChatRead: (chatId: string) => void;
  loadUnread: () => Promise<void>;
}

export const usePracticeMessengerStore = create<PracticeMessengerState>((set, get) => ({
  unreadChatIds: new Set(),
  activeChatId: null,
  setActiveChatId: (chatId) => {
    set({ activeChatId: chatId });
    if (chatId) get().markChatRead(chatId);
  },
  markChatUnread: (chatId) => {
    if (get().activeChatId === chatId) return;
    const next = new Set(get().unreadChatIds);
    next.add(chatId);
    set({ unreadChatIds: next });
  },
  markChatRead: (chatId) => {
    if (!get().unreadChatIds.has(chatId)) return;
    const next = new Set(get().unreadChatIds);
    next.delete(chatId);
    set({ unreadChatIds: next });
  },
  loadUnread: async () => {
    try {
      const ids = await apiGetUnreadPracticeChatIds();
      set({ unreadChatIds: new Set(ids) });
    } catch {
      // silent — unread badge is best-effort, not critical path
    }
  },
}));
