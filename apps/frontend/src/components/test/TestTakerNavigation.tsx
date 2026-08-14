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
            className={`w-9 h-9 shrink-0 rounded-xl text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer ${
              isCurrent
                ? "bg-gray-900 text-white shadow-md"
                : checkedQ
                  ? feedbackMap[q.id].isCorrect
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-600"
                  : answered
                    ? "bg-gray-200 text-gray-700"
                    : jumpable
                      ? "bg-white border border-border text-gray-500"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed"
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
    <div className="hidden lg:flex lg:flex-col lg:w-64 xl:w-72 shrink-0 border-l border-border bg-gray-50/60 px-5 py-6 overflow-y-auto">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
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
              className={`h-9 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isCurrent
                  ? "bg-gray-900 border-gray-900 text-white shadow-sm"
                  : checkedQ
                    ? feedbackMap[q.id].isCorrect
                      ? "bg-green-100 border-green-200 text-green-700"
                      : "bg-red-100 border-red-200 text-red-600"
                    : answered
                      ? "bg-gray-200 border-gray-300 text-gray-800"
                      : jumpable
                        ? "bg-white text-gray-500 hover:border-gray-300"
                        : "bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex flex-col gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-gray-200 shrink-0" />{" "}
          Javob berilgan
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-white border border-gray-200 shrink-0" />{" "}
          Javobsiz
        </div>
        {isPerQuestion && (
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-md bg-gray-100 shrink-0" />{" "}
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
      className="shrink-0 px-4 lg:px-8 pt-3 pb-4 bg-white border-t border-border flex gap-2"
      style={{
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="lg:max-w-3xl lg:mx-auto flex gap-2 w-full">
        {isPerQuestion ? (
          isChecked ? (
            isLast ? (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-semibold text-base hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100 cursor-pointer"
              >
                {submitting ? "Topshirilmoqda..." : "Yakunlash ✓"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100 cursor-pointer"
              >
                Keyingi →
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onCheck}
              disabled={checking}
              className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-100 cursor-pointer"
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
                className="px-5 py-4 bg-white border border-border text-gray-600 rounded-2xl font-medium text-base hover:bg-gray-50 transition-colors shrink-0 cursor-pointer"
              >
                ← Oldingi
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={onNext}
                className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100 cursor-pointer"
              >
                Keyingi →
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-semibold text-base hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100 cursor-pointer"
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
