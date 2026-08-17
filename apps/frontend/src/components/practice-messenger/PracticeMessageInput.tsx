import type React from "react";
import { Pencil, Send, X } from "lucide-react";
import type { ApiPracticeMessage } from "../../api/practiceMessenger";

interface PracticeMessageInputProps {
  draft: string;
  sending: boolean;
  replyingTo: ApiPracticeMessage | null;
  editingMessage: ApiPracticeMessage | null;
  draftRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onCancelAction: () => void;
}

export function PracticeMessageInput({
  draft,
  sending,
  replyingTo,
  editingMessage,
  draftRef,
  onDraftChange,
  onSend,
  onCancelAction,
}: PracticeMessageInputProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="practice-messenger-composer border-t border-black/10 dark:border-white/10 px-3 py-3 sm:px-4"
    >
      {(replyingTo || editingMessage) && (
        <div className="practice-messenger-replying mx-auto mb-2.5 flex w-full max-w-4xl items-center gap-2 rounded-2xl border-l-4 border-indigo-500 bg-black/5 dark:bg-[#2e303c] px-3.5 py-2 text-xs text-[var(--text-secondary)]">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-indigo-600 dark:text-indigo-400">
              {editingMessage
                ? "Xabarni tahrirlash"
                : `${replyingTo?.sender.name} xabariga javob`}
            </p>
            <p className="mt-0.5 truncate text-[var(--text-muted)]">
              {(editingMessage ?? replyingTo)?.content}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelAction}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Amalni bekor qilish"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2.5 rounded-2xl bg-white dark:bg-[#2e303c] border border-black/10 dark:border-white/10 px-3.5 py-2 shadow-xs transition-all focus-within:border-indigo-500/80 focus-within:ring-2 focus-within:ring-indigo-500/25">
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={
            editingMessage ? "Xabarni tahrirlang..." : "Xabar yozing..."
          }
          className="max-h-24 min-h-5 flex-1 resize-none !bg-transparent text-xs sm:text-sm font-semibold leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] sm:max-h-28 sm:min-h-6"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:bg-indigo-600 disabled:hover:scale-100 cursor-pointer"
        >
          {editingMessage ? <Pencil size={15} /> : <Send size={15} />}
        </button>
      </div>
    </form>
  );
}
