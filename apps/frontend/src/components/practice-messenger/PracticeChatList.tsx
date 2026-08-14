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
      className={`practice-messenger-list min-h-0 flex-col bg-[#f1f5f9] dark:bg-zinc-950 lg:flex lg:border-r lg:border-gray-200/60 dark:lg:border-zinc-800/60 ${
        mobileThreadOpen ? "hidden" : "flex"
      }`}
    >
      <div className="bg-white border-b border-gray-100 p-3 sm:p-4 dark:bg-zinc-900 dark:border-zinc-800">
        <label className="flex items-center gap-2.5 rounded-2xl bg-gray-50 border border-gray-200/60 px-4 py-2.5 text-gray-400 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 dark:bg-zinc-800/80 dark:border-zinc-700/80 transition-all">
          <Search size={18} className="shrink-0 text-gray-400 dark:text-zinc-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Qidirish"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-zinc-100 outline-none placeholder:text-gray-400 dark:placeholder:text-zinc-500"
          />
        </label>
      </div>
      <div className="max-h-64 flex-1 overflow-y-auto lg:max-h-none p-3 sm:p-4">
        {loading ? (
          <div className="flex justify-center py-12 text-gray-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : visibleChats.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-gray-400">
            {query.trim()
              ? "Bunday amaliyot chati topilmadi"
              : "Hali amaliyot chati yo‘q."}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
                  className={`student-responsive-card group relative flex w-full items-center gap-2.5 rounded-[20px] bg-white p-3 text-left transition-all border border-gray-200/60 dark:bg-zinc-900 dark:border-zinc-800 ${
                    active
                      ? "border-gray-300 dark:border-zinc-700"
                      : "hover:border-gray-300"
                  }`}
                >
                  <UserAvatar
                    name={partnerName}
                    avatarUrl={partnerAvatar}
                    className="h-12 w-12 shrink-0 rounded-full text-sm font-bold"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                        {partnerName}
                      </p>
                      {chat.lastMessage && (
                        <span className="shrink-0 text-[11px] font-medium text-gray-400">
                          {formatDateTime(chat.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400 dark:text-zinc-400">
                      {chat.courseTitle} · {chat.groupName}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-gray-600 dark:text-zinc-300">
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
