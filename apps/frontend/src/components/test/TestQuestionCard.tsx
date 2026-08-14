import { Check, X } from "lucide-react";
import type { PublicQuestion } from "../../api/delivery";
import {
  mediaUrl,
  isArabicText,
  TYPE_BADGES,
  type QuestionFeedback,
} from "./testTakerUtils";
import {
  DropPinQuestion,
  MatchingQuestion,
  ReorderQuestion,
  SliderQuestion,
} from "./QuestionTypeRenderers";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export interface TestQuestionCardProps {
  question: PublicQuestion;
  index?: number;
  selectedMap: Record<string, string[]>;
  textMap: Record<string, string>;
  feedbackMap: Record<string, QuestionFeedback>;
  isPerQuestion: boolean;
  onToggleOption: (questionId: string, optionId: string, type: "single" | "multi") => void;
  onTextChange: (questionId: string, text: string) => void;
  onSelectChange: (questionId: string, selected: string[]) => void;
  onArrangeAdd: (questionId: string, optionId: string) => void;
  onArrangeRemove: (questionId: string, optionId: string) => void;
  inCard?: boolean;
}

export function TestQuestionCard({
  question: q,
  index,
  selectedMap,
  textMap,
  feedbackMap,
  isPerQuestion,
  onToggleOption,
  onTextChange,
  onSelectChange,
  onArrangeAdd,
  onArrangeRemove,
  inCard = true,
}: TestQuestionCardProps) {
  const selected = selectedMap[q.id] ?? [];
  const feedback = feedbackMap[q.id];
  const locked = isPerQuestion && !!feedback;
  const correctIds = new Set(feedback?.correctOptionIds ?? []);
  const gap = inCard ? "gap-2.5" : "gap-2";

  const renderBody = () => {
    if (q.type === "slider") {
      return (
        <SliderQuestion
          options={q.options}
          value={textMap[q.id] ?? ""}
          onChange={(v) => {
            if (!locked) onTextChange(q.id, v);
          }}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === "droppin") {
      return (
        <DropPinQuestion
          imageUrl={q.imageUrl ? mediaUrl(q.imageUrl) : ""}
          value={textMap[q.id] ?? ""}
          onChange={(v) => {
            if (!locked) onTextChange(q.id, v);
          }}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === "fillblank") {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Bo'sh joyni to'ldiring:</p>
          <input
            value={textMap[q.id] ?? ""}
            onChange={(e) => {
              if (!locked) onTextChange(q.id, e.target.value);
            }}
            placeholder="Javobingizni yozing..."
            readOnly={locked}
            className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition-colors ${
              feedback?.isCorrect === true
                ? "border-emerald-500 bg-emerald-500 text-white"
                : feedback?.isCorrect === false
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-border bg-gray-50 focus:border-gray-400 focus:bg-white"
            }`}
            style={{ fontSize: "var(--q-fs, 16px)" }}
          />
          {feedback?.isCorrect === false && feedback.correctAnswer && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3.5 text-white">
              <span>{feedback.correctAnswer}</span>
              <Check size={17} className="shrink-0" />
            </div>
          )}
        </div>
      );
    }

    if (q.type === "open") {
      return (
        <div className="flex flex-col gap-2">
          <textarea
            value={textMap[q.id] ?? ""}
            rows={4}
            onChange={(e) => {
              if (!locked) onTextChange(q.id, e.target.value);
            }}
            placeholder="Javobingizni yozing..."
            readOnly={locked}
            className={`w-full resize-none rounded-2xl border px-4 py-3.5 outline-none transition-colors ${
              feedback?.isCorrect === true
                ? "border-emerald-500 bg-emerald-500 text-white"
                : feedback?.isCorrect === false
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-border bg-gray-50 focus:border-gray-400 focus:bg-white"
            }`}
            style={{ fontSize: "var(--q-fs, 16px)" }}
          />
          {feedback?.isCorrect === false && feedback.correctAnswer && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3.5 text-white">
              <span>{feedback.correctAnswer}</span>
              <Check size={17} className="shrink-0" />
            </div>
          )}
        </div>
      );
    }

    if (q.type === "matching") {
      return (
        <MatchingQuestion
          questionId={q.id}
          options={q.options}
          selected={selected}
          onSelect={(ids) => onSelectChange(q.id, ids)}
          locked={locked}
          feedback={feedback}
        />
      );
    }

    if (q.type === "truefalse") {
      return (
        <div className="flex gap-2">
          {q.options.map((opt) => {
            const checked = selected.includes(opt.id);
            const isTrue = opt.text === "To'g'ri";
            const isCorrectOption = correctIds.has(opt.id);
            const resultClass = feedback
              ? isCorrectOption
                ? "border-emerald-500 bg-emerald-500 text-white"
                : checked
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-border bg-white text-gray-400"
              : checked
                ? "border-gray-900 bg-gray-900 text-white shadow-md"
                : "border-border bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50";
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onToggleOption(q.id, opt.id, "single")}
                style={{ fontSize: "var(--q-fs, 16px)" }}
                className={`flex-1 py-4 rounded-2xl border font-semibold transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer ${resultClass} ${
                  locked ? "pointer-events-none" : ""
                }`}
              >
                <span
                  className={`text-lg ${
                    feedback && !isCorrectOption && !checked
                      ? "text-gray-300"
                      : checked || isCorrectOption
                        ? "text-white"
                        : "text-gray-400"
                  }`}
                >
                  {isTrue ? "✓" : "✗"}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === "reorder") {
      return (
        <div className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-x-clip">
          <p className="text-xs text-gray-400 mb-1">
            Ushlab suring va to'g'ri tartibga soling
          </p>
          <ReorderQuestion
            optionIds={selected}
            options={q.options}
            onChange={(ids) => onSelectChange(q.id, ids)}
            locked={locked}
            feedback={feedback}
          />
        </div>
      );
    }

    if (q.type === "arrange") {
      const rtl =
        q.options.some((o) => isArabicText(o.text)) || isArabicText(q.text);
      const correctSeq = feedback?.correctOptionIds ?? [];
      return (
        <div className="flex flex-col gap-2">
          <div
            dir={rtl ? "rtl" : "ltr"}
            className="min-h-14 p-3 border border-dashed border-gray-300 rounded-2xl flex flex-wrap gap-2 items-center bg-gray-50"
          >
            {selected.length === 0 && (
              <span className="text-xs text-gray-300 px-1">
                Bo'laklarni bosib joylashtiring...
              </span>
            )}
            {selected.map((id, pos) => {
              const opt = q.options.find((o) => o.id === id);
              const result = feedback
                ? correctSeq[pos] === id
                  ? "correct"
                  : "incorrect"
                : undefined;
              return opt ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => onArrangeRemove(q.id, id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className={`px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer ${
                    result === "correct"
                      ? "bg-emerald-500 text-white"
                      : result === "incorrect"
                        ? "bg-rose-500 text-white"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {opt.text}
                </button>
              ) : null;
            })}
          </div>
          <div dir={rtl ? "rtl" : "ltr"} className="flex flex-wrap gap-2">
            {q.options
              .filter((o) => !selected.includes(o.id))
              .map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onArrangeAdd(q.id, opt.id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className="px-3.5 py-2 bg-white rounded-xl text-gray-700 hover:border-gray-400 hover:text-gray-900 active:scale-95 transition-all cursor-pointer border border-border"
                >
                  {opt.text}
                </button>
              ))}
          </div>
          {selected.length > 0 && !locked && (
            <button
              type="button"
              onClick={() => onSelectChange(q.id, [])}
              className="text-xs text-gray-400 hover:text-red-400 self-start transition-colors cursor-pointer"
            >
              Tozalash
            </button>
          )}
          {feedback?.isCorrect === false && correctSeq.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-emerald-700">
                To'g'ri javob
              </p>
              <div dir={rtl ? "rtl" : "ltr"} className="flex flex-wrap gap-2">
                {correctSeq.map((id) => {
                  const opt = q.options.find((o) => o.id === id);
                  return opt ? (
                    <span
                      key={`correct-${id}`}
                      style={{ fontSize: "var(--q-fs, 14px)" }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white"
                    >
                      {opt.text}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // single / multi
    return (
      <div className={`flex flex-col ${gap}`}>
        {q.options.map((opt, i) => {
          const checked = selected.includes(opt.id);
          const label = OPTION_LABELS[i] ?? String(i + 1);
          const isCorrectOption = correctIds.has(opt.id);
          const unselectedButCorrect = isCorrectOption && !checked;
          const missedCorrect = unselectedButCorrect && q.type === "multi";
          const cardClass = feedback
            ? checked && isCorrectOption
              ? "bg-emerald-500 border-emerald-500 text-white"
              : checked && !isCorrectOption
                ? "bg-rose-500 border-rose-500 text-white"
                : unselectedButCorrect
                  ? "bg-white border-emerald-500 border-2 text-emerald-700"
                  : "bg-white border-border text-gray-400"
            : checked
              ? "bg-gray-900 border-gray-900 text-white shadow-md"
              : "bg-white border-border text-gray-800 hover:border-gray-300 hover:bg-gray-50";
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                onToggleOption(q.id, opt.id, q.type as "single" | "multi")
              }
              className={`w-full text-left flex items-center gap-2 px-4 py-3.5 rounded-2xl border transition-all duration-150 active:scale-[0.99] cursor-pointer ${cardClass} ${
                locked ? "pointer-events-none" : ""
              }`}
            >
              <span
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  checked
                    ? "bg-white/20 text-white"
                    : unselectedButCorrect
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                }`}
              >
                {label}
              </span>
              <span
                style={{ fontSize: "var(--q-fs, 16px)" }}
                className="leading-snug"
              >
                {opt.text}
              </span>
              {feedback && checked && isCorrectOption && (
                <Check size={18} className="ml-auto shrink-0 text-white" />
              )}
              {feedback && checked && !isCorrectOption && (
                <X size={18} className="ml-auto shrink-0 text-white" />
              )}
              {feedback && unselectedButCorrect && !missedCorrect && (
                <Check
                  size={18}
                  className="ml-auto shrink-0 text-emerald-600"
                />
              )}
              {feedback && missedCorrect && (
                <span className="ml-auto shrink-0 text-xs font-medium text-emerald-600">
                  O'tkazib yubordingiz
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  if (typeof index === "number") {
    // All-at-once card container
    return (
      <div className="bg-white rounded-2xl p-3 sm:p-5 border border-border/60 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          {TYPE_BADGES[q.type] && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                TYPE_BADGES[q.type].cls
              }`}
            >
              {TYPE_BADGES[q.type].label}
            </span>
          )}
        </div>
        <p
          className="font-semibold text-gray-900 mb-4 leading-snug"
          style={{ fontSize: "var(--q-fs, 16px)" }}
        >
          {q.text}
        </p>
        {q.imageUrl && q.type !== "droppin" && (
          <img
            src={mediaUrl(q.imageUrl)}
            alt=""
            className="w-full rounded-xl object-cover mb-4"
            style={{ maxHeight: 200 }}
          />
        )}
        {q.audioUrl && (
          <audio
            src={mediaUrl(q.audioUrl)}
            controls
            className="mb-4 w-full h-9"
          />
        )}
        {renderBody()}
      </div>
    );
  }

  // Single question zone
  return (
    <div className="flex flex-col min-h-full lg:max-w-3xl lg:mx-auto lg:w-full">
      <div className="px-3 lg:px-8 pt-3 lg:pt-10 pb-5">
        {TYPE_BADGES[q.type] && (
          <span
            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-2 ${
              TYPE_BADGES[q.type].cls
            }`}
          >
            {TYPE_BADGES[q.type].label}
          </span>
        )}
        <p
          className="font-bold text-gray-900 leading-snug"
          style={{ fontSize: `calc(var(--q-fs, 16px) + 2px)` }}
        >
          {q.text}
        </p>
        {q.imageUrl && q.type !== "droppin" && (
          <img
            src={mediaUrl(q.imageUrl)}
            alt=""
            className="w-full rounded-2xl object-cover mt-4"
            style={{ maxHeight: 220 }}
          />
        )}
        {q.audioUrl && (
          <audio
            src={mediaUrl(q.audioUrl)}
            controls
            className="w-full h-9 mt-4"
          />
        )}
      </div>

      <div className="h-px bg-gray-100 mx-3 lg:mx-8" />

      <div className="px-3 lg:px-8 pt-5 pb-6 flex flex-col gap-2">
        {renderBody()}
      </div>
    </div>
  );
}
