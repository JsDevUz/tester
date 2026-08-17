import { useState } from "react";
import type { CreateStudentTestData } from "../api/student-tests";

interface Props {
  folderId: string;
  onSubmit: (data: CreateStudentTestData) => void;
  onClose: () => void;
  initial?: Partial<CreateStudentTestData>;
  title?: string;
}

export function StudentTestSettingsModal({ folderId, onSubmit, onClose, initial, title = "Yangi test" }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [hasTimeLimit, setHasTimeLimit] = useState(!!initial?.timeLimit);
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimit ?? 30);
  const [showResults, setShowResults] = useState(initial?.showResults ?? "immediately");
  const isPerQuestion = showResults === "per_question";
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? false);
  const [oneByOne, setOneByOne] = useState(initial?.oneByOne ?? false);
  const [autoCompleteOnLeave, setAutoCompleteOnLeave] = useState(initial?.autoCompleteOnLeave ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      folderId,
      name: name.trim(),
      description: description.trim() || undefined,
      timeLimit: hasTimeLimit ? timeLimit : undefined,
      showResults,
      shuffleQuestions,
      shuffleOptions,
      oneByOne,
      autoCompleteOnLeave,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/10 dark:bg-black/30 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-card w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Test nomi *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="masalan: Matematika"
              className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Tavsif</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Ixtiyoriy tavsif"
              className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all placeholder:text-[var(--text-muted)] resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="hasTimeLimit" checked={hasTimeLimit} onChange={(e) => setHasTimeLimit(e.target.checked)} className="w-4 h-4 rounded cursor-pointer accent-indigo-600" />
            <label htmlFor="hasTimeLimit" className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer">Vaqt chegarasi</label>
            {hasTimeLimit && (
              <input type="number" min={1} value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} className="w-20 rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40" />
            )}
            {hasTimeLimit && <span className="text-xs text-[var(--text-muted)]">daqiqa</span>}
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Natijalarni ko'rsatish</label>
            <select
              value={showResults}
              onChange={(e) => {
                const v = e.target.value as "immediately" | "after_deadline" | "hidden" | "per_question";
                setShowResults(v);
                if (v === "per_question") setOneByOne(true);
              }}
              className="w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
            >
              <option value="immediately">Topshirilgandan keyin darhol</option>
              <option value="per_question">Har bir savolda javobni ko'rsat (birin-ketin)</option>
              <option value="hidden">Ko'rsatilmasin</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${isPerQuestion ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
              <input type="checkbox" checked={oneByOne} disabled={isPerQuestion} onChange={(e) => setOneByOne(e.target.checked)} className="w-4 h-4 rounded cursor-pointer accent-indigo-600" />
              Savollarni birin-ketin ko'rsatish{isPerQuestion && " (avtomatik)"}
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
              <input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} className="w-4 h-4 rounded cursor-pointer accent-indigo-600" />
              Savollar tartibini aralashtirish
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
              <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} className="w-4 h-4 rounded cursor-pointer accent-indigo-600" />
              Javob variantlarini aralashtirish
            </label>
            <label className="flex items-start gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
              <input type="checkbox" checked={autoCompleteOnLeave} onChange={(e) => setAutoCompleteOnLeave(e.target.checked)} className="w-4 h-4 mt-0.5 shrink-0 rounded cursor-pointer accent-indigo-600" />
              <span>
                Testdan chiqilganda avtomatik yakunlash
                <span className="block mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)] font-normal">
                  Boshqa ilova yoki brauzer oynasiga o'tilsa, test avtomatik topshiriladi.
                </span>
              </span>
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer">Bekor qilish</button>
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer">
              {title === "Yangi test" ? "Yaratish va savollar qo'shish" : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
