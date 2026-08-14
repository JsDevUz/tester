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
        className="shrink-0 px-4 lg:px-6 flex items-center justify-between gap-2 lg:gap-4 bg-white lg:border-b lg:border-border"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(52px + env(safe-area-inset-top))",
        }}
      >
        <div className="flex-1 flex items-center min-w-0">
          <button
            type="button"
            onClick={onExit}
            disabled={submitting}
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer disabled:opacity-50"
          >
            ← Orqaga
          </button>
        </div>

        <div className="shrink-0 flex items-center justify-center">
          {/* Test nomi — faqat desktop */}
          <span className="hidden lg:block text-sm font-semibold text-gray-700 truncate max-w-xs">
            {testName}
          </span>

          {/* Progress counter */}
          {isOneByOne ? (
            <span className="text-sm font-semibold text-gray-700">
              {currentIdx + 1}
              <span className="text-gray-300 font-normal">
                {" "}
                / {totalQuestions}
              </span>
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-600 truncate max-w-[160px] lg:hidden">
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
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 shrink-0 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Font size controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangeFontSize(-2)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 text-xs font-bold select-none transition-colors cursor-pointer"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => onChangeFontSize(2)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 text-sm font-bold select-none transition-colors cursor-pointer"
            >
              A+
            </button>
          </div>

          {/* Timer */}
          {timeLeft !== null && (
            <span
              className={`shrink-0 font-mono text-sm font-medium ${
                timeLeft < 60 ? "text-red-500" : "text-gray-500"
              }`}
            >
              <Clock size={12} className="inline mr-0.5 -mt-0.5" />
              {formatTime(timeLeft)}
            </span>
          )}
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      {isOneByOne && (
        <div className="shrink-0 h-1.5 bg-gray-100 mx-4 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{
              width: `${((currentIdx + 1) / Math.max(1, totalQuestions)) * 100}%`,
            }}
          />
        </div>
      )}
    </>
  );
}
