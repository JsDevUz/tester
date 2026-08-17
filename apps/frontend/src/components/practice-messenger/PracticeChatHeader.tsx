import { ArrowLeft, ChevronUp, Pin } from "lucide-react";
import type { ApiPracticeChat, ApiPracticeMessage } from "../../api/practiceMessenger";
import { UserAvatar } from "../UserAvatar";

interface PracticeChatHeaderProps {
  chat: ApiPracticeChat;
  isCurator: boolean;
  pinnedMessages: ApiPracticeMessage[];
  activePinnedIndex: number;
  onBack: () => void;
  onFocusPreviousPinned: () => void;
}

export function PracticeChatHeader({
  chat,
  isCurator,
  pinnedMessages,
  activePinnedIndex,
  onBack,
  onFocusPreviousPinned,
}: PracticeChatHeaderProps) {
  const partnerName = isCurator ? chat.student.name : chat.curator.name;
  const partnerAvatar = isCurator ? chat.student.avatarUrl : chat.curator.avatarUrl;

  return (
    <>
      <header className="practice-messenger-header flex items-center justify-between border-b border-black/10 dark:border-white/10 px-3 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] lg:hidden cursor-pointer"
            aria-label="Chatlar ro‘yxatiga qaytish"
            title="Orqaga"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs sm:text-sm font-bold text-[var(--text-primary)]">
              {partnerName}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {chat.courseTitle} · {chat.groupName}
            </p>
          </div>
        </div>
        <UserAvatar
          name={partnerName}
          avatarUrl={partnerAvatar}
          className="practice-messenger-avatar h-9 w-9 rounded-full text-xs font-bold"
        />
      </header>

      {pinnedMessages.length > 0 && (
        <button
          type="button"
          onClick={onFocusPreviousPinned}
          className="practice-messenger-pins flex items-center gap-2 border-b border-black/5 dark:border-white/5 bg-[var(--card-bg)] px-5 py-2.5 text-left transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
          title="Oldingi qadalgan amaliyotga o‘tish"
        >
          <span className="practice-messenger-accent-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
            <Pin size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[var(--text-primary)]">
              Qadalgan amaliyotlar · {activePinnedIndex + 1}/{pinnedMessages.length}
            </span>
            <span className="block truncate text-xs text-[var(--text-muted)]">
              {pinnedMessages[activePinnedIndex]?.practice?.title ?? "Amaliyot"}
            </span>
          </span>
          <ChevronUp size={18} className="shrink-0 text-[var(--text-muted)]" />
        </button>
      )}
    </>
  );
}
