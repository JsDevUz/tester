import { Loader2, Search } from "lucide-react";
import type { ApiPracticeChatPreview } from "../../api/practiceMessenger";
import { UserAvatar } from "../UserAvatar";
import { formatDateTime } from "../../utils/date";
import { previewText } from "./practiceMessengerUtils";

interface PracticeChatListProps {
  chats: ApiPracticeChatPreview[];
  selectedId: string | null;
  query: string;
  loading: boolean;
  mobileThreadOpen: boolean;
  currentUserId?: string;
  onQueryChange: (query: string) => void;
  onSelectChat: (chatId: string) => void;
}

export function PracticeChatList({
  chats,
  selectedId,
  query,
  loading,
  mobileThreadOpen,
  currentUserId,
  onQueryChange,
  onSelectChat,
}: PracticeChatListProps) {
  const visibleChats = chats.filter((chat) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      chat.student.name.toLowerCase().includes(q) ||
      chat.curator.name.toLowerCase().includes(q) ||
      chat.courseTitle.toLowerCase().includes(q) ||
      chat.groupName.toLowerCase().includes(q) ||
      (chat.lastMessage?.content ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <aside
      className={`practice-messenger-list min-h-0 flex-col lg:flex ${
        mobileThreadOpen ? "hidden" : "flex"
      }`}
    >
      <div className="border-b border-black/10 dark:border-white/10 p-3 sm:p-4">
        <label className="flex items-center gap-2.5 rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-2.5 text-[var(--text-muted)] focus-within:ring-2 focus-within:ring-indigo-500/40 transition-all cursor-text">
          <Search size={17} className="shrink-0 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Qidirish..."
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>
      </div>
      <div className="max-h-64 flex-1 overflow-y-auto lg:max-h-none p-0">
        {loading ? (
          <div className="flex justify-center py-12 text-[var(--text-muted)]">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : visibleChats.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs font-medium text-[var(--text-muted)]">
            {query.trim()
              ? "Bunday amaliyot chati topilmadi"
              : "Hali amaliyot chati yo‘q."}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
            {visibleChats.map((chat) => {
              const active = chat.id === selectedId;
              const partnerName =
                currentUserId === chat.student.id
                  ? chat.curator.name
                  : chat.student.name;
              const partnerAvatar =
                currentUserId === chat.student.id
                  ? chat.curator.avatarUrl
                  : chat.student.avatarUrl;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={`group relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer select-none rounded-none border-none ${
                    active
                      ? "bg-black/10 dark:bg-white/10"
                      : "bg-transparent hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <UserAvatar
                    name={partnerName}
                    avatarUrl={partnerAvatar}
                    className="h-11 w-11 shrink-0 rounded-full text-xs font-bold"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                        {partnerName}
                      </p>
                      {chat.lastMessage && (
                        <span className="shrink-0 text-[10px] font-medium text-[var(--text-muted)]">
                          {formatDateTime(chat.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-muted)]">
                      {chat.courseTitle} · {chat.groupName}
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--text-secondary)]">
                      {previewText(chat)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
