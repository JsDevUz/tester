import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Confetti from "react-confetti";
import {
  apiGetPublicTest,
  apiStartSubmission,
  apiGetSubmission,
  apiSubmitAnswers,
  apiCheckAnswer,
  type PublicTest,
  type PublicQuestion,
} from "../../api/delivery";
import { apiGetMe } from "../../api/auth";
import { useAuthStore } from "../../stores/authStore";
import { getPublicBaseUrl } from "../../api/baseUrl";
import { TestResultView } from "../../pages/TestResultPage";
import { schedulePageScrollReset } from "../../utils/scroll";
import {
  seededShuffle,
  draftKey,
  VIOLATION_REASON,
  type QuestionFeedback,
  type TestTakerProps,
  type Phase,
} from "./testTakerUtils";
import { TestTakerHeader } from "./TestTakerHeader";
import {
  MobileQuestionChips,
  DesktopQuestionSidebar,
  TestTakerActionsBar,
} from "./TestTakerNavigation";
import { TestQuestionCard } from "./TestQuestionCard";

export type { TestTakerProps };

export function TestTaker({ slug, submissionId: initialSubmissionId, practiceMode, onNavigateResult, onExit }: TestTakerProps) {
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" : "starting");
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);

  const [test, setTest] = useState<PublicTest | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentQuestionChipRef = useRef<HTMLButtonElement>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("test-sound-enabled");
    return saved === null ? true : saved === "1";
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem("test-sound-enabled", soundEnabled ? "1" : "0");
  }, [soundEnabled]);
  const correctAudioRef = useRef<HTMLAudioElement | null>(null);
  const wrongAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    correctAudioRef.current = new Audio("/sounds/correct.mp3");
    wrongAudioRef.current = new Audio("/sounds/wrong.mp3");
  }, []);
  function playFeedbackSound(isCorrect: boolean) {
    if (!soundEnabledRef.current) return;
    const audio = isCorrect ? correctAudioRef.current : wrongAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { });
  }
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [textMap, setTextMap] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, QuestionFeedback>>({});
  const [checking, setChecking] = useState(false);

  const selectedMapRef = useRef<Record<string, string[]>>({});
  const textMapRef = useRef<Record<string, string>>({});
  const orderedQuestionsRef = useRef<PublicQuestion[]>([]);
  const submittingRef = useRef(false);
  const autoSubmitSentRef = useRef(false);
  // SPA ichidagi "Orqaga" oddiy beforeunload/pagehide chiqarmaydi.
  // Joriy leave-submit funksiyasini tugma va browser history handleriga
  // ulash uchun ref'da saqlaymiz.
  const leaveSubmitRef = useRef<() => void>(() => { });

  useEffect(() => {
    currentQuestionChipRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentIdx]);
  useEffect(() => { selectedMapRef.current = selectedMap; }, [selectedMap]);
  useEffect(() => { textMapRef.current = textMap; }, [textMap]);
  useEffect(() => { orderedQuestionsRef.current = orderedQuestions; }, [orderedQuestions]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  useLayoutEffect(() => {
    return schedulePageScrollReset();
  }, [phase]);

  function goToResult(sid: string) {
    setResolvedSubmissionId(sid);
    setPhase("result");
    onNavigateResult(sid);
  }

  // Determine starting phase: if a submissionId was passed in, check its
  // status first (mirrors TakeTestEntryPage.tsx:44-69 and the redirect
  // TakeTestPage.tsx:518-529 performs today).
  useEffect(() => {
    if (!initialSubmissionId) {
      setPhase("starting");
      return;
    }
    let cancelled = false;
    apiGetSubmission(initialSubmissionId, practiceMode)
      .then((sub) => {
        if (cancelled) return;
        if (sub.status === "submitted") {
          goToResult(initialSubmissionId);
        } else {
          setPhase("answering");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("starting");
        }
      });
    return () => { cancelled = true; };
  }, [initialSubmissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: falling back to "starting" here leaves resolvedSubmissionId holding
  // the stale invalid initialSubmissionId until the effect below overwrites it
  // with a freshly-started submission's id — resolvedSubmissionId is never read
  // while phase is "starting" (the loading-guard in Step 1 below returns early
  // for that phase), so this is safe.

  // Auto-start: resolve name and call apiStartSubmission, mirroring
  // TakeTestEntryPage.tsx:28-42 (name resolution) and :71-88 (start call),
  // but skipping the visible name-entry form per the practice-mode design.
  useEffect(() => {
    if (phase !== "starting") return;
    let cancelled = false;

    async function start() {
      let name = adminName;
      if (!name && token) {
        try {
          const me = await apiGetMe();
          name = me.name;
        } catch {
          // fall through to error below
        }
      }
      if (!name) {
        if (!cancelled) setStartError("Foydalanuvchi aniqlanmadi. Qaytadan kiring.");
        return;
      }
      try {
        const { submissionId: newId } = await apiStartSubmission(slug, name, practiceMode);
        if (cancelled) return;
        setResolvedSubmissionId(newId);
        setPhase("answering");
      } catch {
        if (!cancelled) setStartError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    }

    void start();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Aralashtirish seed'i submissionId'ga bog'liq. Dars ichidagi amaliyot
    // submission'ni avtomatik yaratadi, shu sabab ID kelmasidan testni bo'sh
    // seed bilan aralashtirsak natija sahifasidagi tartib bilan mos kelmaydi.
    // ID tayyor bo'lgach aynan backend ishlatadigan seed bilan bir marta tuzamiz.
    if (!resolvedSubmissionId) return;
    apiGetPublicTest(slug, practiceMode).then((t) => {
      setTest(t);
      const qs = t.shuffleQuestions
        ? seededShuffle(t.questions, resolvedSubmissionId)
        : [...t.questions];
      const qsWithOpts = qs.map((q) => ({
        ...q,
        options:
          t.shuffleOptions && q.type !== "matching"
            ? seededShuffle(q.options, resolvedSubmissionId + q.id)
            : q.options,
      }));
      setOrderedQuestions(qsWithOpts);
      const initSelected: Record<string, string[]> = {};
      for (const q of qsWithOpts) {
        if (q.type === "reorder") {
          initSelected[q.id] = q.options.map((o) => o.id);
        }
      }
      const savedDraft = resolvedSubmissionId
        ? localStorage.getItem(draftKey(resolvedSubmissionId))
        : null;
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft) as {
            selectedMap?: Record<string, string[]>;
            textMap?: Record<string, string>;
            currentIdx?: number;
          };
          const questionIds = new Set(qsWithOpts.map((q) => q.id));
          const restoredSelected = Object.fromEntries(
            Object.entries(parsed.selectedMap ?? {}).filter(([id]) =>
              questionIds.has(id),
            ),
          );
          const restoredText = Object.fromEntries(
            Object.entries(parsed.textMap ?? {}).filter(([id]) =>
              questionIds.has(id),
            ),
          );
          setSelectedMap({ ...initSelected, ...restoredSelected });
          setTextMap(restoredText);
          if (
            typeof parsed.currentIdx === "number" &&
            parsed.currentIdx >= 0 &&
            parsed.currentIdx < qsWithOpts.length
          ) {
            setCurrentIdx(parsed.currentIdx);
          }
        } catch {
          setSelectedMap(initSelected);
        }
      } else {
        setSelectedMap(initSelected);
      }
      if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
    });
  }, [slug, resolvedSubmissionId, practiceMode]);

  useEffect(() => {
    if (!resolvedSubmissionId || orderedQuestions.length === 0 || submittingRef.current)
      return;
    const payload = JSON.stringify({
      selectedMap,
      textMap,
      currentIdx,
      updatedAt: Date.now(),
    });
    localStorage.setItem(draftKey(resolvedSubmissionId), payload);
  }, [resolvedSubmissionId, orderedQuestions.length, selectedMap, textMap, currentIdx]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeLeft === 0) handleSubmit();
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!resolvedSubmissionId || test?.autoCompleteOnLeave === false) return;
    const sendSubmit = () => {
      if (
        submittingRef.current ||
        autoSubmitSentRef.current ||
        orderedQuestionsRef.current.length === 0
      )
        return;
      const answers = orderedQuestionsRef.current.map((q) => ({
        questionId: q.id,
        selectedOptionIds: selectedMapRef.current[q.id] ?? [],
        textAnswer: textMapRef.current[q.id] ?? null,
      }));
      const base = getPublicBaseUrl() || window.location.origin;
      const url = `${base}/public/submissions/${resolvedSubmissionId}/submit${practiceMode ? "?practice=1" : ""}`;
      const body = JSON.stringify({
        answers,
        mode: "violation",
        violationReason: VIOLATION_REASON,
      });
      autoSubmitSentRef.current = true;
      const beacon = () =>
        navigator.sendBeacon?.(
          url,
          new Blob([body], { type: "application/json" }),
        );
      try {
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          autoSubmitSentRef.current = false;
          beacon();
        });
      } catch {
        autoSubmitSentRef.current = false;
        beacon();
      }
    };
    let submitSent = false;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendSubmit();
        submitSent = true;
      } else if (document.visibilityState === "visible" && submitSent) {
        setTimeout(() => {
          apiGetSubmission(resolvedSubmissionId, practiceMode)
            .then((sub) => {
              if (sub.status === "submitted")
                goToResult(resolvedSubmissionId);
              else autoSubmitSentRef.current = false;
            })
            .catch(() => { });
        }, 800);
      }
    };
    // App/tab switch is visibilitychange. Blur is intentionally not used because
    // mobile browser UI focus changes can fire it without the student leaving.
    const handleBeforeUnload = () => {
      sendSubmit();
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) sendSubmit();
    };
    const handlePopState = () => sendSubmit();
    leaveSubmitRef.current = sendSubmit;
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (leaveSubmitRef.current === sendSubmit)
        leaveSubmitRef.current = () => { };
    };
  }, [resolvedSubmissionId, test?.autoCompleteOnLeave]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExitWhileAnswering = async () => {
    if (
      test?.autoCompleteOnLeave === false ||
      !resolvedSubmissionId ||
      orderedQuestionsRef.current.length === 0
    ) {
      onExit();
      return;
    }
    if (submittingRef.current || autoSubmitSentRef.current) return;

    // UI'dagi Orqaga uchun requestni kutamiz: foydalanuvchi test ro'yxatiga
    // qaytib darhol yangi urinish boshlasa ham eski urinish DB'ga yozilmay
    // qoladigan race bo'lmasin. Browser back/tab close esa yuqoridagi
    // keepalive/sendBeacon yo'lidan foydalanishda davom etadi.
    submittingRef.current = true;
    setSubmitting(true);
    const answers = orderedQuestionsRef.current.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMapRef.current[q.id] ?? [],
      textAnswer: textMapRef.current[q.id] ?? null,
    }));
    try {
      await apiSubmitAnswers(
        resolvedSubmissionId,
        answers,
        "violation",
        VIOLATION_REASON,
        practiceMode,
      );
      localStorage.removeItem(draftKey(resolvedSubmissionId));
      onExit();
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  async function handleSubmit() {
    if (submitting || !test || !resolvedSubmissionId) return;
    submittingRef.current = true;
    setSubmitting(true);
    const answers = orderedQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMap[q.id] ?? [],
      textAnswer: textMap[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(resolvedSubmissionId, answers, "normal", undefined, practiceMode);
      sessionStorage.setItem("submissionResult", JSON.stringify(result));
      localStorage.removeItem(draftKey(resolvedSubmissionId));
      goToResult(resolvedSubmissionId);
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCheck() {
    if (!test || checking || !resolvedSubmissionId) return;
    const q = orderedQuestions[currentIdx];
    if (!q) return;
    setChecking(true);
    try {
      const { isCorrect, correctAnswer, correctOptionIds } = await apiCheckAnswer(
        resolvedSubmissionId,
        q.id,
        selectedMap[q.id] ?? [],
        textMap[q.id] ?? null,
        practiceMode,
      );
      setFeedbackMap((prev) => ({
        ...prev,
        [q.id]: { isCorrect, correctAnswer, correctOptionIds },
      }));
      if (isCorrect !== null) {
        playFeedbackSound(isCorrect);
      }
      if (isCorrect) {
        setShowConfetti(true);
      }
    } finally {
      setChecking(false);
    }
  }

  function toggleOption(
    questionId: string,
    optionId: string,
    type: "single" | "multi",
  ) {
    if (feedbackMap[questionId]) return; // locked after check
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (type === "single") return { ...prev, [questionId]: [optionId] };
      return current.includes(optionId)
        ? { ...prev, [questionId]: current.filter((id) => id !== optionId) }
        : { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function arrangeAdd(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (current.includes(optionId)) return prev;
      return { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function arrangeRemove(questionId: string, optionId: string) {
    if (feedbackMap[questionId]) return;
    setSelectedMap((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] ?? []).filter((id) => id !== optionId),
    }));
  }

  if (startError) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-red-400 text-center text-sm">{startError}</p>
      </div>
    );
  }

  if (phase === "starting" || phase === "checking" || !resolvedSubmissionId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-3 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  if (phase === "result") {
    return (
      <div>
        <button
          type="button"
          onClick={onExit}
          className="mb-2 inline-flex items-center gap-1.5 px-4 pt-4 text-xs font-bold text-gray-500 hover:text-gray-700 lg:px-8"
        >
          ← Orqaga
        </button>
        <TestResultView
          submissionId={resolvedSubmissionId}
          practiceMode={practiceMode}
          embedded
          onBack={onExit}
        />
      </div>
    );
  }

  // phase === "answering"

  if (!test)
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Yuklanmoqda...</p>
      </div>
    );

  const isPerQuestion = test.showResults === "per_question";
  const isOneByOne = test.oneByOne || isPerQuestion;
  const questions = isOneByOne
    ? [orderedQuestions[currentIdx]].filter(Boolean)
    : orderedQuestions;
  const isLast = currentIdx === orderedQuestions.length - 1;

  const currentQ = orderedQuestions[currentIdx];
  const currentFeedback = currentQ ? feedbackMap[currentQ.id] : undefined;
  const isChecked = !!currentFeedback;

  function isQuestionAnswered(q: PublicQuestion): boolean {
    const sel = selectedMap[q.id];
    if (sel && sel.length > 0) return true;
    const txt = textMap[q.id];
    return !!txt && txt.trim().length > 0;
  }

  // per_question: faqat tekshirilgan (yoki joriy) savolga sakrash mumkin — javob berish
  // majburiy ketma-ketligini buzmaslik uchun. Boshqa oneByOne rejimlarda erkin sakrash.
  function canJumpTo(idx: number): boolean {
    if (!isPerQuestion) return true;
    if (idx <= currentIdx) return true;
    const q = orderedQuestions[idx];
    return !!(q && feedbackMap[q.id]);
  }



  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)] notranslate"
      translate="no"
      style={
        {
          "--q-fs": fontSize + "px",
          height: "100dvh",
          minHeight: "100svh",
          maxHeight: "100dvh",
          overflow: "hidden",
        } as React.CSSProperties
      }
    >
      {showConfetti && (
        <Confetti
          numberOfPieces={250}
          recycle={false}
          gravity={0.3}
          onConfettiComplete={() => setShowConfetti(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none" }}
        />
      )}

      {/* ── HEADER ── */}
      <TestTakerHeader
        testName={test.name}
        isOneByOne={isOneByOne}
        currentIdx={currentIdx}
        totalQuestions={orderedQuestions.length}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((s) => !s)}
        fontSize={fontSize}
        onChangeFontSize={(delta) => setFontSize((s) => Math.min(24, Math.max(12, s + delta)))}
        timeLeft={timeLeft}
        submitting={submitting}
        onExit={() => void handleExitWhileAnswering()}
      />

      {/* ── MOBILE: savol raqamlari ── */}
      {isOneByOne && (
        <MobileQuestionChips
          orderedQuestions={orderedQuestions}
          currentIdx={currentIdx}
          onSelectIndex={(i) => setCurrentIdx(i)}
          canJumpTo={canJumpTo}
          isQuestionAnswered={isQuestionAnswered}
          feedbackMap={feedbackMap}
          isPerQuestion={isPerQuestion}
          currentQuestionChipRef={currentQuestionChipRef}
        />
      )}

      {/* ── CONTENT ── */}
      {isOneByOne ? (
        // ─── ONE BY ONE / PER QUESTION ───────────────────────────
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row-reverse">
          {/* ── DESKTOP: savol navigatori ── */}
          <DesktopQuestionSidebar
            orderedQuestions={orderedQuestions}
            currentIdx={currentIdx}
            onSelectIndex={(i) => setCurrentIdx(i)}
            canJumpTo={canJumpTo}
            isQuestionAnswered={isQuestionAnswered}
            feedbackMap={feedbackMap}
            isPerQuestion={isPerQuestion}
          />

          {/* ── O'NG USTUN: savol + variantlar + feedback + tugmalar ── */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
              {currentQ && (
                <TestQuestionCard
                  question={currentQ}
                  selectedMap={selectedMap}
                  textMap={textMap}
                  feedbackMap={feedbackMap}
                  isPerQuestion={isPerQuestion}
                  onToggleOption={toggleOption}
                  onTextChange={(qid, txt) => setTextMap((p) => ({ ...p, [qid]: txt }))}
                  onSelectChange={(qid, sel) => setSelectedMap((p) => ({ ...p, [qid]: sel }))}
                  onArrangeAdd={arrangeAdd}
                  onArrangeRemove={arrangeRemove}
                  inCard={true}
                />
              )}
            </div>

            {/* ── BOTTOM BUTTONS ── */}
            <TestTakerActionsBar
              isPerQuestion={isPerQuestion}
              isChecked={isChecked}
              isLast={isLast}
              currentIdx={currentIdx}
              submitting={submitting}
              checking={checking}
              onPrev={() => setCurrentIdx((i) => i - 1)}
              onNext={() => setCurrentIdx((i) => i + 1)}
              onCheck={handleCheck}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : (
        // ─── ALL AT ONCE ───────────────────────────────────────────
        <div
          className="flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4 flex flex-col gap-4 max-w-2xl mx-auto w-full"
          style={{
            paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          }}
        >
          {questions.map(
            (q, i) =>
              q && (
                <TestQuestionCard
                  key={q.id}
                  question={q}
                  index={i}
                  selectedMap={selectedMap}
                  textMap={textMap}
                  feedbackMap={feedbackMap}
                  isPerQuestion={isPerQuestion}
                  onToggleOption={toggleOption}
                  onTextChange={(qid, txt) => setTextMap((p) => ({ ...p, [qid]: txt }))}
                  onSelectChange={(qid, sel) => setSelectedMap((p) => ({ ...p, [qid]: sel }))}
                  onArrangeAdd={arrangeAdd}
                  onArrangeRemove={arrangeRemove}
                  inCard={true}
                />
              ),
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {submitting ? "Topshirilmoqda..." : "Topshirish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
