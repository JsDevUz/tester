import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ImageIcon,
  Maximize2,
  MoreVertical,
  Pencil,
  Reply,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { ApiPracticeMessage } from "../../api/practiceMessenger";
import { messageTime } from "./practiceMessengerUtils";

interface PracticeMessageBubbleProps {
  message: ApiPracticeMessage;
  currentUserId?: string;
  isCurator: boolean;
  activeMessageActionsId: string | null;
  highlighted: boolean;
  scoreByMessage: Record<string, string>;
  editingGradeMessageId: string | null;
  onSetMessageRef: (el: HTMLDivElement | null) => void;
  onToggleActions: (id: string | null) => void;
  onReply: (message: ApiPracticeMessage) => void;
  onStartEditing: (message: ApiPracticeMessage) => void;
  onDeletePrompt: (message: ApiPracticeMessage) => void;
  onOpenTestResult: (message: ApiPracticeMessage) => void;
  onGradeImage: (message: ApiPracticeMessage) => void;
  onGradeTest: (message: ApiPracticeMessage) => void;
  onStartEditingImageGrade: (message: ApiPracticeMessage, score: number) => void;
  onCancelEditingImageGrade: (messageId: string) => void;
  onScoreChange: (messageId: string, value: string) => void;
  onOpenFullscreenImage: (url: string) => void;
}

export function PracticeMessageBubble({
  message,
  currentUserId,
  isCurator,
  activeMessageActionsId,
  highlighted,
  scoreByMessage,
  editingGradeMessageId,
  onSetMessageRef,
  onToggleActions,
  onReply,
  onStartEditing,
  onDeletePrompt,
  onOpenTestResult,
  onGradeImage,
  onGradeTest,
  onStartEditingImageGrade,
  onCancelEditingImageGrade,
  onScoreChange,
  onOpenFullscreenImage,
}: PracticeMessageBubbleProps) {
  const own = message.sender.id === currentUserId;
  const practiceMessage = message.type !== "text";
  const maxScore = Number(message.practice?.maxScore ?? message.metadata.maxScore ?? 0);
  const gradedImage = message.imageSubmissions.find(
    (image) => image.gradedAt !== null && image.score !== null,
  );
  const imageIsGraded =
    maxScore > 0 &&
    message.imageSubmissions.length > 0 &&
    message.imageSubmissions.every(
      (image) => image.gradedAt !== null && image.score !== null,
    );
  const editingImageGrade = editingGradeMessageId === message.id;
  const canManage = own && message.type === "text" && !message.deletedAt;

  return (
    <div
      ref={onSetMessageRef}
      className={`flex px-1 transition-[background-color,box-shadow] duration-300 ${
        own ? "justify-end" : "justify-start"
      } ${highlighted ? "practice-messenger-highlighted rounded-2xl p-2" : ""}`}
    >
      <div
        onClick={(event) => {
          if (
            message.deletedAt ||
            !window.matchMedia("(max-width: 639px)").matches ||
            (event.target as HTMLElement).closest("button, a, input, textarea")
          ) {
            return;
          }
          onToggleActions(activeMessageActionsId === message.id ? null : message.id);
        }}
        className={`practice-message-bubble group relative max-w-[92%] py-2.5 sm:max-w-[78%] ${
          own
            ? "practice-message-own rounded-2xl rounded-br-md pl-4 pr-7"
            : "practice-message-incoming rounded-2xl rounded-bl-md pl-7 pr-4"
        }`}
      >
        {!message.deletedAt && (
          <div
            onClick={(event) => event.stopPropagation()}
            className={`absolute top-1.5 z-50 ${own ? "right-1.5" : "left-1.5"}`}
          >
            <button
              type="button"
              onClick={() =>
                onToggleActions(activeMessageActionsId === message.id ? null : message.id)
              }
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${
                own
                  ? "text-white/80 hover:bg-white/20 hover:text-white"
                  : "text-gray-400 hover:bg-black/10 hover:text-gray-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              } ${
                activeMessageActionsId === message.id
                  ? "opacity-100 bg-black/20"
                  : "opacity-80 sm:opacity-0 sm:group-hover:opacity-100"
              }`}
              aria-label="Amallar"
            >
              <MoreVertical size={14} />
            </button>

            {activeMessageActionsId === message.id && (
              <div
                className={`glass-panel absolute top-full mt-1.5 z-50 w-44 rounded-2xl p-1.5 shadow-2xl border border-black/10 dark:border-white/10 ${
                  own ? "right-0" : "left-0"
                }`}
                style={{
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToggleActions(null);
                    onReply(message);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Reply size={15} className="text-[var(--text-muted)]" />
                  <span>Javob berish</span>
                </button>

                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleActions(null);
                        onStartEditing(message);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Pencil size={15} className="text-[var(--text-muted)]" />
                      <span>Tahrirlash</span>
                    </button>

                    <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                    <button
                      type="button"
                      onClick={() => {
                        onToggleActions(null);
                        onDeletePrompt(message);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} className="text-red-500 dark:text-red-400" />
                      <span>O‘chirish</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {message.replyTo && (
          <div
            className={`practice-message-reply mb-2 rounded-xl border-l-[3px] px-3 py-1.5 text-left ${
              own
                ? "practice-message-reply-own border-white bg-white/15 text-white"
                : "practice-message-reply-incoming bg-black/5 dark:bg-white/10 text-[var(--text-primary)]"
            }`}
          >
            <p className={`truncate text-xs font-bold ${own ? "text-white" : "text-indigo-600 dark:text-indigo-400"}`}>
              {message.replyTo.senderName}
            </p>
            <p className="line-clamp-2 text-xs font-medium opacity-90">
              {message.replyTo.content}
            </p>
          </div>
        )}

        {message.deletedAt ? (
          <p className={`text-sm italic ${own ? "text-gray-300" : "text-gray-400"}`}>
            Xabar o‘chirildi
          </p>
        ) : practiceMessage ? (
          <div>
            <div className="flex items-start gap-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  message.type === "practice_image"
                    ? "bg-amber-50 text-amber-500"
                    : message.type === "practice_grade"
                    ? "bg-green-50 text-green-600"
                    : "practice-messenger-accent-icon"
                }`}
              >
                {message.type === "practice_image" ? (
                  <ImageIcon size={17} />
                ) : message.type === "practice_grade" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <ClipboardCheck size={17} />
                )}
              </span>
              <div>
                <p className="text-sm font-bold">
                  {message.practice?.title ?? "Amaliyot"}
                </p>
                <p className={`mt-0.5 text-xs ${own ? "text-gray-300" : "text-gray-500"}`}>
                  {message.content}
                </p>
              </div>
            </div>

            {message.type === "practice_test" && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenTestResult(message)}
                  className="practice-messenger-result mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-opacity hover:opacity-90"
                  title="Tanlangan javoblarni ko‘rish"
                >
                  <span className="text-xs font-semibold">Natijalarni ko‘rish</span>
                  <span className="text-sm font-bold">
                    {message.testSubmission?.score ?? 0} / {message.testSubmission?.total ?? 0}
                  </span>
                </button>
                {isCurator &&
                  (maxScore <= 0 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-500">
                      Maksimal yulduz belgilanmagan
                    </p>
                  ) : editingImageGrade ? (
                    <div className="mt-2 flex items-end gap-2">
                      <label className="min-w-0 flex-1 text-xs font-semibold text-gray-400">
                        Amaliyot yulduzi / {maxScore}
                        <input
                          type="number"
                          min={0}
                          max={maxScore}
                          value={scoreByMessage[message.id] ?? ""}
                          onChange={(e) => onScoreChange(message.id, e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-bold text-gray-900 outline-none focus:border-gray-900"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onGradeTest(message)}
                        className="practice-messenger-primary rounded-lg px-3 py-2 text-xs font-bold"
                      >
                        Saqlash
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancelEditingImageGrade(message.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500"
                        aria-label="Bekor qilish"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1 text-sm font-bold text-amber-500">
                        <Star size={14} fill="currentColor" />
                        {message.testSubmission?.practiceScore ?? 0} / {maxScore}
                        {message.testSubmission?.scoreOverridden && (
                          <span className="text-[10px] font-medium text-gray-400">
                            qo‘lda
                          </span>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onStartEditingImageGrade(
                            message,
                            message.testSubmission?.practiceScore ?? 0,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700"
                      >
                        <Pencil size={13} /> Tahrirlash
                      </button>
                    </div>
                  ))}
              </>
            )}

            {message.type === "practice_image" && message.imageSubmissions.length > 0 && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {message.imageSubmissions.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => onOpenFullscreenImage(image.imageUrl)}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100"
                      aria-label={`${index + 1}-rasmni katta ochish`}
                    >
                      <img
                        src={image.imageUrl}
                        alt={`O‘quvchi yuborgan rasm ${index + 1}`}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-colors group-hover:bg-black/35 group-hover:opacity-100">
                        <Maximize2 size={20} />
                      </span>
                    </button>
                  ))}
                </div>
                {isCurator &&
                  (maxScore <= 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-50 px-3 py-2.5">
                      <p className="text-xs font-bold text-amber-600">
                        Maksimal yulduz belgilanmagan
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Baholashdan oldin kurs kontentidagi amaliyot sozlamalarida maksimal yulduzni belgilang.
                      </p>
                    </div>
                  ) : !imageIsGraded || editingImageGrade ? (
                    <div className="mt-3 flex items-end gap-2">
                      <label className="min-w-0 flex-1 text-xs font-semibold text-gray-500">
                        Barcha rasmlar uchun yulduz / {maxScore}
                        <input
                          value={scoreByMessage[message.id] ?? ""}
                          onChange={(e) => onScoreChange(message.id, e.target.value)}
                          inputMode="numeric"
                          className="mt-1 block w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm font-bold text-gray-900 outline-none focus:border-gray-900"
                          placeholder={`0 / ${maxScore}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onGradeImage(message)}
                        className="practice-messenger-primary rounded-lg px-3 py-2 text-xs font-bold transition-colors"
                      >
                        {editingImageGrade ? "Saqlash" : "Baholash"}
                      </button>
                      {editingImageGrade && (
                        <button
                          type="button"
                          onClick={() => onCancelEditingImageGrade(message.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                          aria-label="Baho tahririni bekor qilish"
                          title="Bekor qilish"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-green-600">
                        {gradedImage?.score} / {maxScore} yulduz berildi
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onStartEditingImageGrade(message, gradedImage!.score!)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
                      >
                        <Pencil size={13} /> Tahrirlash
                      </button>
                    </div>
                  ))}
              </>
            )}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-[21px]">
            {message.content}
          </p>
        )}

        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] leading-4 ${
            own ? "opacity-60" : "text-slate-500"
          }`}
        >
          <span>{messageTime(message.createdAt)}</span>
          {message.editedAt ? " · tahrirlangan" : ""}
          {own && <Check size={14} strokeWidth={2} />}
        </div>
      </div>
    </div>
  );
}
