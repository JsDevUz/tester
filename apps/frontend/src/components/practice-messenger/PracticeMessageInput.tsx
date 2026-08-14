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
      className="practice-messenger-composer border-t border-gray-100 bg-white p-2 sm:p-3"
    >
      {(replyingTo || editingMessage) && (
        <div className="practice-messenger-replying mx-auto mb-2 flex w-full max-w-4xl items-center gap-2 rounded-xl border-l-4 px-3 py-2 text-xs text-gray-600">
          <div className="min-w-0 flex-1">
            <p className="practice-messenger-replying-title font-bold">
              {editingMessage
                ? "Xabarni tahrirlash"
                : `${replyingTo?.sender.name} xabariga javob`}
            </p>
            <p className="mt-0.5 truncate">
              {(editingMessage ?? replyingTo)?.content}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelAction}
            className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"
            aria-label="Amalni bekor qilish"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 transition-colors focus-within:border-gray-900 sm:rounded-2xl sm:px-3 sm:py-2">
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
          className="max-h-24 min-h-5 flex-1 resize-none !bg-transparent text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400 sm:max-h-28 sm:min-h-6"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="practice-messenger-primary practice-messenger-send-button flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-100 sm:h-9 sm:w-9"
        >
          {editingMessage ? <Pencil size={16} /> : <Send size={17} />}
        </button>
      </div>
    </form>
  );
}
