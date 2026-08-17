import { Clock, Volume2, VolumeX } from "lucide-react";

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface TestTakerHeaderProps {
  testName: string;
  isOneByOne: boolean;
  currentIdx: number;
  totalQuestions: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  fontSize: number;
  onChangeFontSize: (delta: number) => void;
  timeLeft: number | null;
  submitting: boolean;
  onExit: () => void;
}

export function TestTakerHeader({
  testName,
  isOneByOne,
  currentIdx,
  totalQuestions,
  soundEnabled,
  onToggleSound,
  fontSize: _fontSize,
  onChangeFontSize,
  timeLeft,
  submitting,
  onExit,
}: TestTakerHeaderProps) {
  return (
    <>
      <div
        className="shrink-0 px-4 lg:px-6 flex items-center justify-between gap-2 lg:gap-4 bg-transparent text-[var(--text-primary)]"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(54px + env(safe-area-inset-top))",
        }}
      >
        <div className="flex-1 flex items-center min-w-0">
          <button
            type="button"
            onClick={onExit}
            disabled={submitting}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl px-2.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            ← Orqaga
          </button>
        </div>

        <div className="shrink-0 flex items-center justify-center">
          {/* Test nomi — faqat desktop */}
          <span className="hidden lg:block text-sm font-bold text-[var(--text-primary)] truncate max-w-xs">
            {testName}
          </span>

          {/* Progress counter */}
          {isOneByOne ? (
            <span className="text-xs font-bold text-[var(--text-primary)] bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full">
              {currentIdx + 1}
              <span className="text-[var(--text-muted)] font-normal">
                {" "}
                / {totalQuestions}
              </span>
            </span>
          ) : (
            <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[160px] lg:hidden">
              {testName}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-end gap-2">
          {/* Sound toggle */}
          <button
            type="button"
            onClick={onToggleSound}
            title={soundEnabled ? "Ovozni o'chirish" : "Ovozni yoqish"}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Font size controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangeFontSize(-2)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 text-xs font-bold select-none transition-colors cursor-pointer"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => onChangeFontSize(2)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 text-sm font-bold select-none transition-colors cursor-pointer"
            >
              A+
            </button>
          </div>

          {/* Timer */}
          {timeLeft !== null && (
            <span
              className={`shrink-0 font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                timeLeft < 60 ? "bg-red-500/10 text-red-500" : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)]"
              }`}
            >
              <Clock size={12} className="inline mr-1 -mt-0.5" />
              {formatTime(timeLeft)}
            </span>
          )}
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      {isOneByOne && (
        <div className="shrink-0 h-1 bg-black/5 dark:bg-white/10 mx-4 mt-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
            style={{
              width: `${((currentIdx + 1) / Math.max(1, totalQuestions)) * 100}%`,
            }}
          />
        </div>
      )}
    </>
  );
}
