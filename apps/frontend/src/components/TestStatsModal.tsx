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
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/10 pb-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)] truncate">{selected.questionText}</p>
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{selected.option.text}</h3>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer" aria-label="Yopish">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          {selected.option.students.length === 0 ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">Hech kim tanlamagan.</p>
          ) : (
            <div className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
              {selected.option.students.map((name, i) => (
                <div key={i} className="flex items-center gap-2 py-2">
                  <Users size={13} className="shrink-0 text-indigo-500" />
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{name}</span>
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
      className={`rounded-2xl border p-4 transition-all ${isHardest
          ? "border-red-500/20 bg-red-500/5"
          : isEasiest
            ? "border-green-500/20 bg-green-500/5"
            : "border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5"
        }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-bold text-[var(--text-primary)]">
          {index + 1}. {q.questionText}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {isHardest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">
              <TrendingDown size={12} /> Eng ko'p xato
            </span>
          )}
          {isEasiest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-500">
              <TrendingUp size={12} /> Eng ko'p to'g'ri
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] mb-3">
        {q.answeredCount} ta javob
        {pct !== null && <> — to'g'ri javob foizi: <span className="font-bold text-[var(--text-primary)]">{pct}%</span></>}
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
                className="group w-full text-left cursor-pointer disabled:cursor-default"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-medium truncate ${opt.isCorrectOption ? "font-bold text-green-500" : "text-[var(--text-secondary)]"}`}>
                    {opt.text}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)] font-medium">
                    {opt.count} ta
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all ${opt.isCorrectOption ? "bg-green-500" : "bg-indigo-500"}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {q.textAnswerCounts && q.textAnswerCounts.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {q.textAnswerCounts.map((ans, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-[var(--text-secondary)] font-medium">{ans.text}</span>
              <span className="shrink-0 text-[var(--text-muted)]">{ans.count} marta</span>
            </div>
          ))}
        </div>
      )}

      {q.matchingPairStats && q.matchingPairStats.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {q.matchingPairStats.map((pair) => {
            const pairPct = pair.answeredCount > 0 ? Math.round((pair.correctCount / pair.answeredCount) * 100) : null;
            return (
              <div key={pair.leftId} className="min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="line-clamp-5 text-xs text-[var(--text-secondary)]">
                    {pair.leftText} <span className="text-[var(--text-muted)]">→</span>{" "}
                    <span className="font-bold text-green-500">{pair.correctRightText}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {pairPct !== null ? `${pairPct}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                  <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${pairPct ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!q.optionCounts &&
        (!q.textAnswerCounts || q.textAnswerCounts.length === 0) &&
        (!q.matchingPairStats || q.matchingPairStats.length === 0) && (
          <p className="text-xs text-[var(--text-muted)]">Bu savol turi uchun batafsil statistika mavjud emas.</p>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/10 pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight truncate">{testName} — Statistika</h2>
            {stats && <p className="text-xs text-[var(--text-muted)] mt-0.5">{stats.totalSubmissions} ta topshirilgan natija</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {error ? (
            <p className="py-8 text-center text-xs text-red-400">{error}</p>
          ) : !stats ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 rounded-full border-2 border-indigo-500/20 border-t-indigo-600 animate-spin" />
            </div>
          ) : stats.questions.length === 0 ? (
            <p className="py-8 text-center text-xs text-[var(--text-muted)]">Savollar topilmadi.</p>
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
