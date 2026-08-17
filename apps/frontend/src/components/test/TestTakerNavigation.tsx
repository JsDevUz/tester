import type React from "react";
import type { PublicQuestion } from "../../api/delivery";
import type { QuestionFeedback } from "./testTakerUtils";

export interface TestTakerNavigationProps {
  orderedQuestions: PublicQuestion[];
  currentIdx: number;
  onSelectIndex: (index: number) => void;
  canJumpTo: (index: number) => boolean;
  isQuestionAnswered: (question: PublicQuestion) => boolean;
  feedbackMap: Record<string, QuestionFeedback>;
  isPerQuestion: boolean;
  currentQuestionChipRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileQuestionChips({
  orderedQuestions,
  currentIdx,
  onSelectIndex,
  canJumpTo,
  isQuestionAnswered,
  feedbackMap,
  isPerQuestion,
  currentQuestionChipRef,
}: TestTakerNavigationProps) {
  return (
    <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 lg:hidden">
      {orderedQuestions.map((q, i) => {
        const answered = isQuestionAnswered(q);
        const isCurrent = i === currentIdx;
        const jumpable = canJumpTo(i);
        const checkedQ = isPerQuestion && !!feedbackMap[q.id];
        return (
          <button
            key={q.id}
            ref={isCurrent ? currentQuestionChipRef : undefined}
            disabled={!jumpable}
            onClick={() => jumpable && onSelectIndex(i)}
            className={`w-9 h-9 shrink-0 rounded-xl text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
              isCurrent
                ? "bg-indigo-600 text-white shadow-md scale-105"
                : checkedQ
                  ? feedbackMap[q.id].isCorrect
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                  : answered
                    ? "bg-black/10 dark:bg-white/15 text-[var(--text-primary)]"
                    : jumpable
                      ? "bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-[var(--text-muted)]"
                      : "bg-black/5 dark:bg-white/5 text-[var(--text-muted)] opacity-30 cursor-not-allowed"
            }`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

export function DesktopQuestionSidebar({
  orderedQuestions,
  currentIdx,
  onSelectIndex,
  canJumpTo,
  isQuestionAnswered,
  feedbackMap,
  isPerQuestion,
}: TestTakerNavigationProps) {
  return (
    <div className="hidden lg:flex lg:flex-col lg:w-64 xl:w-72 shrink-0 border-l border-black/5 dark:border-white/10 bg-[var(--surface-bg)] px-5 py-6 overflow-y-auto text-[var(--text-primary)]">
      <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4">
        Savollar
      </p>
      <div className="grid grid-cols-5 gap-2">
        {orderedQuestions.map((q, i) => {
          const answered = isQuestionAnswered(q);
          const isCurrent = i === currentIdx;
          const jumpable = canJumpTo(i);
          const checkedQ = isPerQuestion && !!feedbackMap[q.id];
          return (
            <button
              key={q.id}
              disabled={!jumpable}
              onClick={() => jumpable && onSelectIndex(i)}
              title={
                checkedQ
                  ? feedbackMap[q.id].isCorrect
                    ? "To'g'ri"
                    : "Noto'g'ri"
                  : undefined
              }
              className={`h-9 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isCurrent
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                  : checkedQ
                    ? feedbackMap[q.id].isCorrect
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400"
                    : answered
                      ? "bg-black/10 dark:bg-white/15 border-transparent text-[var(--text-primary)]"
                      : jumpable
                        ? "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10"
                        : "bg-transparent border-transparent text-[var(--text-muted)] opacity-30 cursor-not-allowed"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-col gap-2 text-xs font-semibold text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-black/10 dark:bg-white/15 shrink-0" />{" "}
          Javob berilgan
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shrink-0" />{" "}
          Javobsiz
        </div>
        {isPerQuestion && (
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-transparent border border-dashed border-black/20 dark:border-white/20 shrink-0" />{" "}
            Hali ochilmagan
          </div>
        )}
      </div>
    </div>
  );
}

export interface TestTakerActionsBarProps {
  isPerQuestion: boolean;
  isChecked: boolean;
  isLast: boolean;
  currentIdx: number;
  submitting: boolean;
  checking: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCheck: () => void;
  onSubmit: () => void;
}

export function TestTakerActionsBar({
  isPerQuestion,
  isChecked,
  isLast,
  currentIdx,
  submitting,
  checking,
  onPrev,
  onNext,
  onCheck,
  onSubmit,
}: TestTakerActionsBarProps) {
  return (
    <div
      className="shrink-0 px-4 lg:px-8 pt-3.5 pb-4 bg-transparent border-t border-black/5 dark:border-white/10 rounded-none flex gap-2"
      style={{
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="lg:max-w-3xl lg:mx-auto flex gap-2.5 w-full">
        {isPerQuestion ? (
          isChecked ? (
            isLast ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm disabled:opacity-40 transition-colors shadow-md cursor-pointer"
              >
                {submitting ? "Topshirilmoqda..." : "Yakunlash ✓"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-colors shadow-md cursor-pointer"
              >
                Keyingi →
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onCheck}
              disabled={checking}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm disabled:opacity-50 transition-colors shadow-md cursor-pointer"
            >
              {checking ? "Tekshirilmoqda..." : "Tekshirish"}
            </button>
          )
        ) : (
          <>
            {currentIdx > 0 && (
              <button
                type="button"
                onClick={onPrev}
                className="px-5 py-3.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[var(--text-primary)] rounded-2xl font-bold text-xs hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                ← Oldingi
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={onNext}
                className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-colors shadow-md cursor-pointer"
              >
                Keyingi →
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm disabled:opacity-40 transition-colors shadow-md cursor-pointer"
              >
                {submitting ? "Topshirilmoqda..." : "Topshirish ✓"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
