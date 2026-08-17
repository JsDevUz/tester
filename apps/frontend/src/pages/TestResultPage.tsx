import { useEffect, useLayoutEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  X,
  XCircle,
  Circle,
  Clock,
  Trophy,
  BookOpen,
  ThumbsUp,
} from "lucide-react";
import { apiGetSubmissionResult, type SubmissionResult } from "../api/delivery";
import { formatDateTime } from "../utils/date";
import { schedulePageScrollReset } from "../utils/scroll";

export function getCachedSubmissionResult(
  raw: string | null,
  submissionId: string | null,
) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SubmissionResult;
    if (submissionId && parsed.submissionId !== submissionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

const BACKEND = import.meta.env.VITE_API_URL?.replace("/api/v1", "") ?? "";

function TestResultBody({
  result,
  pct,
  isGood,
  isMid,
}: {
  result: SubmissionResult;
  pct: number;
  isGood: boolean;
  isMid: boolean;
}) {
  return result.showResults === "immediately" ||
    result.showResults === "per_question" ? (
    <>
      <div className="text-center mb-8">
        <div
          className={`inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-4 ${
            isGood ? "bg-emerald-500/10 text-emerald-500" : isMid ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"
          }`}
        >
          {isGood ? (
            <Trophy size={42} />
          ) : isMid ? (
            <ThumbsUp size={42} />
          ) : (
            <BookOpen size={42} />
          )}
        </div>
        <p
          className={`text-5xl font-black mb-1 ${
            isGood ? "text-emerald-500" : isMid ? "text-amber-500" : "text-red-500"
          }`}
        >
          {pct}%
        </p>
        <p className="text-[var(--text-muted)] text-sm font-semibold">
          {result.score} / {result.total} ta to'g'ri
        </p>
      </div>

      {/* Answers list */}
      <div className="flex flex-col gap-2.5">
        {result.answers.map((a, i) => (
          <div
            key={a.questionId}
            className={`rounded-2xl border p-4 transition-colors ${
              a.isCorrect === true
                ? "border-emerald-500/20 bg-emerald-500/5 text-[var(--text-primary)]"
                : a.isCorrect === false
                ? "border-red-500/20 bg-red-500/5 text-[var(--text-primary)]"
                : "border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 text-[var(--text-primary)]"
            }`}
          >
            {/* Question header */}
            <div className="flex items-start gap-2.5 mb-3">
              <span className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/10 text-xs font-bold text-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="flex-1 text-sm font-bold text-[var(--text-primary)] leading-snug">
                {a.questionText}
              </p>
              <span className="shrink-0">
                {a.isCorrect === true ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : a.isCorrect === false ? (
                  <XCircle size={18} className="text-red-500" />
                ) : (
                  <span className="text-[var(--text-muted)] text-xs">—</span>
                )}
              </span>
            </div>

            {/* Answer detail */}
            {a.questionType === "open" || a.questionType === "fillblank" ? (
              <div className="pl-8 flex flex-col gap-1.5">
                <p className="text-xs italic text-[var(--text-primary)] bg-black/5 dark:bg-black/30 px-3 py-2 rounded-xl border border-black/5 dark:border-white/10">
                  {a.textAnswer || "—"}
                </p>
                {a.isCorrect === null && (
                  <p className="text-xs text-[var(--text-muted)] px-1">
                    Tekshiruv yakunlanmadi
                  </p>
                )}
                {a.isCorrect === false && a.correctAnswer && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold px-1">
                    To'g'ri:{" "}
                    <span className="font-bold">{a.correctAnswer}</span>
                  </p>
                )}
              </div>
            ) : a.questionType === "slider" ? (
              <div className="pl-8 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                <span className="bg-black/5 dark:bg-black/30 px-3 py-1.5 rounded-xl border border-black/5 dark:border-white/10">
                  Javob:{" "}
                  <span className="font-bold text-[var(--text-primary)]">{a.textAnswer || "—"}</span>
                </span>
                {a.isCorrect === false && a.correctAnswer && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    To'g'ri: {a.correctAnswer}
                  </span>
                )}
              </div>
            ) : a.questionType === "droppin" ? (
              <div className="pl-8">
                {a.imageUrl ? (
                  (() => {
                    const imgSrc = a.imageUrl!.startsWith("http")
                      ? a.imageUrl!
                      : `${BACKEND}${a.imageUrl}`;
                    const student = a.textAnswer?.split(",").map(Number);
                    const correct = a.correctAnswer?.split(",").map(Number);
                    return (
                      <div className="relative inline-block w-full max-w-xs rounded-2xl overflow-hidden border border-black/5 dark:border-white/10">
                        <img src={imgSrc} alt="" className="w-full" />
                        {student && student.length === 2 && (
                          <div
                            style={{
                              left: `${student[0] * 100}%`,
                              top: `${student[1] * 100}%`,
                            }}
                            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-md bg-red-500"
                          />
                        )}
                        {correct && correct.length === 2 && (
                          <div
                            style={{
                              left: `${correct[0] * 100}%`,
                              top: `${correct[1] * 100}%`,
                            }}
                            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-md bg-emerald-500"
                          />
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                )}
              </div>
            ) : a.options ? (
              <div className="pl-8 flex flex-col gap-1.5">
                {a.options.map((opt) => {
                  const isUserChosen = a.selectedOptionIds?.includes(opt.id);
                  const isCorrectOpt = opt.isCorrectOption;
                  return (
                    <div
                      key={opt.id}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                        isCorrectOpt
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : isUserChosen && !isCorrectOpt
                          ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                          : "bg-black/5 dark:bg-black/20 text-[var(--text-muted)] border border-transparent"
                      }`}
                    >
                      {isCorrectOpt ? (
                        <Check size={14} className="text-emerald-500 shrink-0" />
                      ) : isUserChosen ? (
                        <X size={14} className="text-red-500 shrink-0" />
                      ) : (
                        <Circle size={10} className="text-[var(--text-muted)] opacity-40 shrink-0" />
                      )}
                      <span>{opt.text}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  ) : result.showResults === "after_deadline" ? (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-5">
        <Clock size={36} />
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)] mb-2">Test topshirildi!</p>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Natijalar{" "}
        {result.deadline ? (
          <span className="text-[var(--text-primary)] font-bold">
            {formatDateTime(result.deadline)}
          </span>
        ) : (
          "deadline"
        )}{" "}
        dan keyin ochiladi.
      </p>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-5">
        <CheckCircle2 size={36} />
      </div>
      <p className="text-xl font-bold text-[var(--text-primary)] mb-2">
        Muvaffaqiyatli topshirildi!
      </p>
      <p className="text-xs font-semibold text-[var(--text-muted)]">Test qabul qilindi.</p>
    </div>
  );
}

export function TestResultView({
  submissionId,
  practiceMode,
  embedded = false,
  onBack,
}: {
  submissionId: string | null;
  practiceMode: boolean;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const isPractice = practiceMode;

  useLayoutEffect(() => {
    return schedulePageScrollReset();
  }, [submissionId]);

  useEffect(() => {
    const sid = submissionId;
    const raw = sessionStorage.getItem("submissionResult");
    const cachedResult = getCachedSubmissionResult(raw, sid);
    if (cachedResult) {
      setResult(cachedResult);
      sessionStorage.removeItem("submissionResult");
      if (sid) localStorage.removeItem(`test-draft:${sid}`);
      return;
    }
    if (raw) sessionStorage.removeItem("submissionResult");
    if (sid) {
      apiGetSubmissionResult(sid, isPractice)
        .then((res) => {
          setResult(res);
          localStorage.removeItem(`test-draft:${sid}`);
        })
        .catch(() => { });
    }
  }, [submissionId, isPractice]);

  if (!result)
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <p className="text-[var(--text-muted)] font-semibold text-sm">Natija topilmadi.</p>
      </div>
    );

  const pct =
    result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const isGood = pct >= 70;
  const isMid = pct >= 40 && pct < 70;
  const isViolation = result.mode === "violation";

  if (embedded) {
    return (
      <div className="px-4 lg:px-8 pt-2 pb-8 text-[var(--text-primary)]">
        {isViolation && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-500 text-center">
            {result.violationReason ??
              "Taqiqlangan harakat aniqlanganligi sababli yakunlandi."}
          </div>
        )}
        <TestResultBody result={result} pct={pct} isGood={isGood} isMid={isMid} />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-6 w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 px-4 py-3.5 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Darsga qaytish
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)] notranslate"
      translate="no"
      style={{
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex-1 lg:flex lg:justify-center p-4 sm:p-6 lg:py-10">
        <div className="glass-card lg:w-full lg:max-w-2xl rounded-3xl shadow-xl border border-black/5 dark:border-white/10 overflow-hidden text-[var(--text-primary)] self-start">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="px-5 lg:px-8 pt-8 pb-8">
            {/* Score hero */}
            {isViolation && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-500 text-center">
                {result.violationReason ??
                  "Taqiqlangan harakat aniqlanganligi sababli yakunlandi."}
              </div>
            )}

            <TestResultBody result={result} pct={pct} isGood={isGood} isMid={isMid} />
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mt-6 w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 px-4 py-4 text-sm font-bold text-white transition-colors shadow-md cursor-pointer"
              >
                Bosh sahifaga qaytish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  return (
    <TestResultView
      submissionId={searchParams.get("sid")}
      practiceMode={searchParams.get("practice") === "1"}
      onBack={() => navigate("/")}
    />
  );
}
