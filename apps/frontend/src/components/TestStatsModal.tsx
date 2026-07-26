import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Users, X } from "lucide-react";
import {
  apiGetTestStats,
  type TestStats,
  type TestStatsOptionCount,
  type TestStatsQuestion,
} from "../api/tests";

interface Props {
  testId: string;
  testName: string;
  onClose: () => void;
}

interface SelectedOption {
  questionText: string;
  option: TestStatsOptionCount;
}

function OptionStudentsModal({ selected, onClose }: { selected: SelectedOption; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 truncate">{selected.questionText}</p>
            <h3 className="text-sm font-semibold text-gray-800 truncate">{selected.option.text}</h3>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Yopish">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {selected.option.students.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Hech kim tanlamagan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-50">
              {selected.option.students.map((name, i) => (
                <div key={i} className="flex items-center gap-2 py-2">
                  <Users size={13} className="shrink-0 text-gray-300" />
                  <span className="text-sm text-gray-700">{name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  q,
  index,
  isHardest,
  isEasiest,
  onSelectOption,
}: {
  q: TestStatsQuestion;
  index: number;
  isHardest: boolean;
  isEasiest: boolean;
  onSelectOption: (option: TestStatsOptionCount) => void;
}) {
  const pct = q.correctRate !== null ? Math.round(q.correctRate * 100) : null;
  const maxOptionCount = q.optionCounts ? Math.max(1, ...q.optionCounts.map((o) => o.count)) : 1;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isHardest
          ? "border-red-200 bg-red-50/50"
          : isEasiest
            ? "border-green-200 bg-green-50/50"
            : "border-gray-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-gray-800">
          {index + 1}. {q.questionText}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {isHardest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-600">
              <TrendingDown size={12} /> Eng ko'p xato
            </span>
          )}
          {isEasiest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-600">
              <TrendingUp size={12} /> Eng ko'p to'g'ri
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {q.answeredCount} ta javob
        {pct !== null && <> — to'g'ri javob foizi: <span className="font-semibold text-gray-600">{pct}%</span></>}
      </p>

      {q.optionCounts && (
        <div className="flex flex-col gap-2">
          {q.optionCounts.map((opt) => {
            const barPct = Math.round((opt.count / maxOptionCount) * 100);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectOption(opt)}
                disabled={opt.count === 0}
                className="flex items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 text-left transition-colors hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`line-clamp-3 text-xs ${opt.isCorrectOption ? "font-medium text-green-600" : "text-gray-600"}`}>
                      {opt.text}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400 underline decoration-dotted">{opt.count} ta</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div
                      className={`h-1.5 rounded-full ${opt.isCorrectOption ? "bg-green-400" : "bg-gray-300"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {q.textAnswerCounts && q.textAnswerCounts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {q.textAnswerCounts.map((t, i) => (
            <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
              <span className="line-clamp-3 text-xs text-gray-600">{t.text}</span>
              <span className="shrink-0 text-xs text-gray-400">{t.count} ta</span>
            </div>
          ))}
        </div>
      )}

      {q.matchingPairStats && q.matchingPairStats.length > 0 && (
        <div className="flex flex-col gap-2">
          {q.matchingPairStats.map((pair) => {
            const pairPct = pair.answeredCount > 0 ? Math.round((pair.correctCount / pair.answeredCount) * 100) : null;
            return (
              <div key={pair.leftId} className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="line-clamp-3 text-xs text-gray-600">
                    {pair.leftText} <span className="text-gray-300">→</span>{" "}
                    <span className="font-medium text-green-600">{pair.correctRightText}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {pairPct !== null ? `${pairPct}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${pairPct ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!q.optionCounts &&
        (!q.textAnswerCounts || q.textAnswerCounts.length === 0) &&
        (!q.matchingPairStats || q.matchingPairStats.length === 0) && (
          <p className="text-xs text-gray-300">Bu savol turi uchun batafsil statistika mavjud emas.</p>
        )}
    </div>
  );
}

export function TestStatsModal({ testId, testName, onClose }: Props) {
  const [stats, setStats] = useState<TestStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<SelectedOption | null>(null);

  useEffect(() => {
    apiGetTestStats(testId)
      .then(setStats)
      .catch(() => setError("Statistikani yuklab bo'lmadi"));
  }, [testId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800 truncate">{testName} — Statistika</h2>
            {stats && <p className="text-xs text-gray-400 mt-0.5">{stats.totalSubmissions} ta topshirilgan natija</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error ? (
            <p className="py-8 text-center text-sm text-red-400">{error}</p>
          ) : !stats ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
            </div>
          ) : stats.questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Savollar topilmadi.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.questions.map((q, index) => (
                <QuestionCard
                  key={q.questionId}
                  q={q}
                  index={index}
                  isHardest={stats.hardestQuestionId === q.questionId}
                  isEasiest={stats.easiestQuestionId === q.questionId && stats.easiestQuestionId !== stats.hardestQuestionId}
                  onSelectOption={(option) => setSelectedOption({ questionText: q.questionText, option })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedOption && (
        <OptionStudentsModal selected={selectedOption} onClose={() => setSelectedOption(null)} />
      )}
    </div>
  );
}
