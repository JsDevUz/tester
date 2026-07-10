import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
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
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({
  id,
  pos,
  text,
}: {
  id: string;
  pos: number;
  text: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border select-none ${
        isDragging
          ? "bg-indigo-50 border-indigo-400 shadow-lg z-50 opacity-90"
          : "bg-white border-border"
      }`}
    >
      <span className="text-gray-300 text-sm font-mono w-5 shrink-0">
        {pos + 1}.
      </span>
      <span
        className="flex-1 text-gray-800"
        style={{ fontSize: "var(--q-fs, 16px)" }}
      >
        {text}
      </span>
      <span
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-gray-300 text-2xl px-1 select-none"
      >
        ⠿
      </span>
    </div>
  );
}

function ReorderQuestion({
  optionIds,
  options,
  onChange,
  locked,
}: {
  optionIds: string[];
  options: { id: string; text: string }[];
  onChange: (ids: string[]) => void;
  locked?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );
  function handleDragEnd(event: DragEndEvent) {
    if (locked) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = optionIds.indexOf(String(active.id));
    const newIdx = optionIds.indexOf(String(over.id));
    onChange(arrayMove(optionIds, oldIdx, newIdx));
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={optionIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {optionIds.map((id, pos) => {
            const opt = options.find((o) => o.id === id);
            return opt ? (
              <SortableItem key={id} id={id} pos={pos} text={opt.text} />
            ) : null;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const BACKEND =
  import.meta.env.VITE_API_URL?.replace("/api/v1", "") ??
  "http://localhost:3001";
function mediaUrl(url: string) {
  return url.startsWith("http") ? url : `${BACKEND}${url}`;
}
const ARABIC_RE = /[؀-ۿ]/;
function isArabicText(text: string) {
  return ARABIC_RE.test(text);
}
const VIOLATION_REASON =
  "Taqiqlangan harakat aniqlanganligi sababli yakunlandi.";
const draftKey = (submissionId: string) => `test-draft:${submissionId}`;

function MatchingQuestion({
  questionId,
  options,
  selected,
  onSelect,
  locked,
}: {
  questionId: string;
  options: { id: string; text: string }[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
}) {
  const lefts = useMemo(
    () =>
      seededShuffle(
        options.filter((_, i) => i % 2 === 0),
        `${questionId}:left`,
      ),
    [questionId, options],
  );
  const rights = useMemo(
    () =>
      seededShuffle(
        options.filter((_, i) => i % 2 !== 0),
        `${questionId}:right`,
      ),
    [questionId, options],
  );
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);

  useEffect(() => {
    setPendingLeft(null);
  }, [questionId]);

  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);

  function tapLeft(id: string) {
    if (locked) return;
    const existingIdx = pairedLeftIds.indexOf(id);
    if (existingIdx !== -1) {
      const newSel = [...selected];
      newSel.splice(existingIdx * 2, 2);
      onSelect(newSel);
    }
    setPendingLeft(id);
  }

  function tapRight(id: string) {
    if (locked || !pendingLeft) return;
    const existingIdx = pairedRightIds.indexOf(id);
    const newSel =
      existingIdx !== -1
        ? selected.filter((_, i) => Math.floor(i / 2) !== existingIdx)
        : [...selected];
    onSelect([...newSel, pendingLeft, id]);
    setPendingLeft(null);
  }

  const COLORS = [
    "indigo",
    "rose",
    "amber",
    "teal",
    "violet",
    "orange",
    "cyan",
    "pink",
  ];
  const colorMap: Record<string, string> = {};
  pairedLeftIds.forEach((lid, i) => {
    colorMap[lid] = COLORS[i % COLORS.length];
  });

  const colorClasses: Record<
    string,
    { left: string; right: string; dot: string }
  > = {
    indigo: {
      left: "bg-indigo-50 border-indigo-400 text-indigo-700",
      right: "bg-indigo-50 border-indigo-400 text-indigo-700",
      dot: "bg-indigo-400",
    },
    rose: {
      left: "bg-rose-50 border-rose-400 text-rose-700",
      right: "bg-rose-50 border-rose-400 text-rose-700",
      dot: "bg-rose-400",
    },
    amber: {
      left: "bg-amber-50 border-amber-400 text-amber-700",
      right: "bg-amber-50 border-amber-400 text-amber-700",
      dot: "bg-amber-400",
    },
    teal: {
      left: "bg-teal-50 border-teal-400 text-teal-700",
      right: "bg-teal-50 border-teal-400 text-teal-700",
      dot: "bg-teal-400",
    },
    violet: {
      left: "bg-violet-50 border-violet-400 text-violet-700",
      right: "bg-violet-50 border-violet-400 text-violet-700",
      dot: "bg-violet-400",
    },
    orange: {
      left: "bg-orange-50 border-orange-400 text-orange-700",
      right: "bg-orange-50 border-orange-400 text-orange-700",
      dot: "bg-orange-400",
    },
    cyan: {
      left: "bg-cyan-50 border-cyan-400 text-cyan-700",
      right: "bg-cyan-50 border-cyan-400 text-cyan-700",
      dot: "bg-cyan-400",
    },
    pink: {
      left: "bg-pink-50 border-pink-400 text-pink-700",
      right: "bg-pink-50 border-pink-400 text-pink-700",
      dot: "bg-pink-400",
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400">
        Chap tomondagini bosing, keyin mos o'ng tomondagini bosing
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {lefts.map((opt) => {
            const pairIdx = pairedLeftIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const isPending = pendingLeft === opt.id;
            const color = isPaired ? colorMap[opt.id] : null;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => tapLeft(opt.id)}
                style={{ fontSize: "var(--q-fs, 14px)" }}
                className={`px-3 py-2.5 rounded-2xl border text-left transition-colors flex items-center gap-2 ${
                  isPending
                    ? "bg-indigo-500 text-white border-indigo-500"
                    : color
                      ? colorClasses[color].left
                      : "bg-white border-border text-gray-700 hover:border-indigo-300"
                } ${locked ? "pointer-events-none" : ""}`}
              >
                {isPaired && color && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${colorClasses[color].dot}`}
                  />
                )}
                {opt.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const pairIdx = pairedRightIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const leftId = isPaired ? pairedLeftIds[pairIdx] : null;
            const color = leftId ? colorMap[leftId] : null;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => tapRight(opt.id)}
                disabled={(!pendingLeft && !isPaired) || locked}
                style={{ fontSize: "var(--q-fs, 14px)" }}
                className={`px-3 py-2.5 rounded-2xl border text-left transition-colors flex items-center gap-2 ${
                  color
                    ? colorClasses[color].right
                    : pendingLeft
                      ? "bg-white border-border text-gray-700 hover:border-green-400 hover:bg-green-50"
                      : "bg-gray-50 border-border text-gray-400"
                }`}
              >
                {isPaired && color && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${colorClasses[color].dot}`}
                  />
                )}
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
      {selected.length > 0 && !locked && (
        <button
          type="button"
          onClick={() => {
            onSelect([]);
            setPendingLeft(null);
          }}
          className="text-xs text-gray-400 hover:text-red-400 self-start"
        >
          Tozalash
        </button>
      )}
    </div>
  );
}

function SliderQuestion({
  options,
  value,
  onChange,
  locked,
}: {
  options: { text: string }[];
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current =
    value !== "" ? parseFloat(value) : Math.round((min + max) / 2);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-3xl font-bold text-indigo-600">
        {current}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-indigo-500 h-2 cursor-pointer disabled:opacity-60"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function DropPinQuestion({
  imageUrl,
  value,
  onChange,
  locked,
}: {
  imageUrl: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  const pin = value ? value.split(",").map(Number) : null;
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
    const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
    onChange(`${x},${y}`);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Rasmda to'g'ri joyni bosing</p>
      <div
        className={`relative w-full rounded-2xl overflow-hidden select-none ${locked ? "cursor-default" : "cursor-crosshair"}`}
        onClick={handleClick}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            Rasm yo'q
          </div>
        )}
        {pin && (
          <div
            className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%` }}
          >
            <div className="w-6 h-6 rounded-full bg-red-500 border border-white shadow-lg flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}
      </div>
      {pin && !locked && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-gray-400 hover:text-red-400 self-start"
        >
          Tozalash
        </button>
      )}
    </div>
  );
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
  single: { label: "Yagona", cls: "bg-blue-100 text-blue-600" },
  multi: { label: "Ko'p tanlov", cls: "bg-purple-100 text-purple-600" },
  open: { label: "Ochiq", cls: "bg-gray-100 text-gray-500" },
  arrange: { label: "Gap tuzish", cls: "bg-amber-100 text-amber-600" },
  truefalse: { label: "To'g'ri/Noto'g'ri", cls: "bg-green-100 text-green-600" },
  reorder: { label: "Tartibga solish", cls: "bg-orange-100 text-orange-600" },
  matching: { label: "Moslashtirish", cls: "bg-teal-100 text-teal-600" },
  fillblank: { label: "Bo'sh joy", cls: "bg-pink-100 text-pink-600" },
  slider: { label: "Slider", cls: "bg-cyan-100 text-cyan-600" },
  droppin: { label: "Drop Pin", cls: "bg-lime-100 text-lime-600" },
};

// per_question feedback state for one question
interface QuestionFeedback {
  isCorrect: boolean | null;
  correctAnswer?: string | null;
  correctOptionIds?: string[];
}

export interface TestTakerProps {
  slug: string;
  submissionId?: string;
  practiceMode: boolean;
  onNavigateResult: (submissionId: string) => void;
  onExit: () => void;
}

type Phase = "checking" | "starting" | "answering" | "result";

export function TestTaker({ slug, submissionId: initialSubmissionId, practiceMode, onNavigateResult, onExit }: TestTakerProps) {
  const [phase, setPhase] = useState<Phase>(initialSubmissionId ? "checking" : "starting");
  const [resolvedSubmissionId, setResolvedSubmissionId] = useState<string | null>(initialSubmissionId ?? null);
  const [startError, setStartError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);

  const [test, setTest] = useState<PublicTest | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
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

  useEffect(() => { selectedMapRef.current = selectedMap; }, [selectedMap]);
  useEffect(() => { textMapRef.current = textMap; }, [textMap]);
  useEffect(() => { orderedQuestionsRef.current = orderedQuestions; }, [orderedQuestions]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

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
    apiGetPublicTest(slug, practiceMode).then((t) => {
      setTest(t);
      const qs = t.shuffleQuestions
        ? seededShuffle(t.questions, resolvedSubmissionId ?? "")
        : [...t.questions];
      const qsWithOpts = qs.map((q) => ({
        ...q,
        options:
          t.shuffleOptions && q.type !== "matching"
            ? seededShuffle(q.options, (resolvedSubmissionId ?? "") + q.id)
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
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!resolvedSubmissionId) return;
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
            .catch(() => {});
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
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resolvedSubmissionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { isCorrect, correctAnswer } = await apiCheckAnswer(
        resolvedSubmissionId,
        q.id,
        selectedMap[q.id] ?? [],
        textMap[q.id] ?? null,
      );
      setFeedbackMap((prev) => ({
        ...prev,
        [q.id]: { isCorrect, correctAnswer },
      }));
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
        <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
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
        <TestResultView submissionId={resolvedSubmissionId} practiceMode={practiceMode} embedded />
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
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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

  const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  function renderQuestionBody(q: PublicQuestion, inCard = false) {
    const selected = selectedMap[q.id] ?? [];
    const locked = isPerQuestion && !!feedbackMap[q.id];
    const gap = inCard ? "gap-2.5" : "gap-3";

    if (q.type === "slider")
      return (
        <SliderQuestion
          options={q.options}
          value={textMap[q.id] ?? ""}
          onChange={(v) => {
            if (!locked) setTextMap((p) => ({ ...p, [q.id]: v }));
          }}
          locked={locked}
        />
      );

    if (q.type === "droppin")
      return (
        <DropPinQuestion
          imageUrl={q.imageUrl ? mediaUrl(q.imageUrl) : ""}
          value={textMap[q.id] ?? ""}
          onChange={(v) => {
            if (!locked) setTextMap((p) => ({ ...p, [q.id]: v }));
          }}
          locked={locked}
        />
      );

    if (q.type === "fillblank")
      return (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-gray-400">Bo'sh joyni to'ldiring:</p>
          <input
            value={textMap[q.id] ?? ""}
            onChange={(e) => {
              if (!locked)
                setTextMap((p) => ({ ...p, [q.id]: e.target.value }));
            }}
            placeholder="Javobingizni yozing..."
            readOnly={locked}
            className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3.5 outline-none focus:border-indigo-400 focus:bg-white transition-colors"
            style={{ fontSize: "var(--q-fs, 16px)" }}
          />
        </div>
      );

    if (q.type === "open")
      return (
        <textarea
          value={textMap[q.id] ?? ""}
          rows={4}
          onChange={(e) => {
            if (!locked) setTextMap((p) => ({ ...p, [q.id]: e.target.value }));
          }}
          placeholder="Javobingizni yozing..."
          readOnly={locked}
          className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3.5 outline-none focus:border-indigo-400 focus:bg-white transition-colors resize-none"
          style={{ fontSize: "var(--q-fs, 16px)" }}
        />
      );

    if (q.type === "matching")
      return (
        <MatchingQuestion
          questionId={q.id}
          options={q.options}
          selected={selected}
          onSelect={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
          locked={locked}
        />
      );

    if (q.type === "truefalse")
      return (
        <div className="flex gap-3">
          {q.options.map((opt) => {
            const checked = selected.includes(opt.id);
            const isTrue = opt.text === "To'g'ri";
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleOption(q.id, opt.id, "single")}
                style={{ fontSize: "var(--q-fs, 16px)" }}
                className={`flex-1 py-4 rounded-2xl border font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${
                  checked
                    ? isTrue
                      ? "bg-green-500 text-white border-green-500 shadow-md shadow-green-100"
                      : "bg-red-400 text-white border-red-400 shadow-md shadow-red-100"
                    : "border-border bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
                } ${locked ? "pointer-events-none" : ""}`}
              >
                <span
                  className={`text-lg ${checked ? "text-white" : isTrue ? "text-green-400" : "text-red-300"}`}
                >
                  {isTrue ? "✓" : "✗"}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>
      );

    if (q.type === "reorder")
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 mb-1">
            Ushlab suring va to'g'ri tartibga soling
          </p>
          <ReorderQuestion
            optionIds={selected}
            options={q.options}
            onChange={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
            locked={locked}
          />
        </div>
      );

    if (q.type === "arrange") {
      const rtl =
        q.options.some((o) => isArabicText(o.text)) || isArabicText(q.text);
      return (
        <div className="flex flex-col gap-3">
          <div
            dir={rtl ? "rtl" : "ltr"}
            className="min-h-14 p-3 border border-dashed border-indigo-200 rounded-2xl flex flex-wrap gap-2 items-center bg-indigo-50/40"
          >
            {selected.length === 0 && (
              <span className="text-xs text-gray-300 px-1">
                Bo'laklarni bosib joylashtiring...
              </span>
            )}
            {selected.map((id) => {
              const opt = q.options.find((o) => o.id === id);
              return opt ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => arrangeRemove(q.id, id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className="px-3.5 py-2 bg-indigo-500 text-white rounded-xl shadow-sm hover:bg-indigo-600 active:scale-95 transition-all"
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
                  onClick={() => arrangeAdd(q.id, opt.id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className="px-3.5 py-2 bg-white rounded-xl text-gray-700 hover:border-indigo-400 hover:text-indigo-600 active:scale-95 transition-all"
                >
                  {opt.text}
                </button>
              ))}
          </div>
          {selected.length > 0 && !locked && (
            <button
              type="button"
              onClick={() => setSelectedMap((p) => ({ ...p, [q.id]: [] }))}
              className="text-xs text-gray-400 hover:text-red-400 self-start transition-colors"
            >
              Tozalash
            </button>
          )}
        </div>
      );
    }

    // single / multi — professional option cards with letter label
    return (
      <div className={`flex flex-col ${gap}`}>
        {q.options.map((opt, i) => {
          const checked = selected.includes(opt.id);
          const label = OPTION_LABELS[i] ?? String(i + 1);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() =>
                toggleOption(q.id, opt.id, q.type as "single" | "multi")
              }
              className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-150 active:scale-[0.99] ${
                checked
                  ? "bg-indigo-500 border-indigo-500 text-white shadow-md shadow-indigo-100"
                  : "bg-white border-border text-gray-800 hover:border-indigo-200 hover:bg-indigo-50/50"
              } ${locked ? "pointer-events-none" : ""}`}
            >
              <span
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  checked
                    ? "bg-white/20 text-white"
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
            </button>
          );
        })}
      </div>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-white notranslate"
      translate="no"
      style={
        { "--q-fs": fontSize + "px", minHeight: "60vh" } as React.CSSProperties
      }
    >
      {/* ── HEADER ── */}
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
            className="shrink-0 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700"
          >
            ← Orqaga
          </button>
        </div>

        <div className="shrink-0 flex items-center justify-center">
          {/* Test nomi — faqat desktop */}
          <span className="hidden lg:block text-sm font-semibold text-gray-700 truncate max-w-xs">
            {test.name}
          </span>

          {/* Progress counter */}
          {isOneByOne ? (
            <span className="text-sm font-semibold text-gray-700">
              {currentIdx + 1}
              <span className="text-gray-300 font-normal">
                {" "}
                / {orderedQuestions.length}
              </span>
            </span>
          ) : (
            <span className="text-sm font-medium text-gray-600 truncate max-w-[160px] lg:hidden">
              {test.name}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-end gap-3">
          {/* Font size controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setFontSize((s) => Math.max(12, s - 2))}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 text-xs font-bold select-none transition-colors"
            >
              A-
            </button>
            <button
              onClick={() => setFontSize((s) => Math.min(24, s + 2))}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 text-sm font-bold select-none transition-colors"
            >
              A+
            </button>
          </div>

          {/* Timer */}
          {timeLeft !== null && (
            <span
              className={`shrink-0 font-mono text-sm font-medium ${timeLeft < 60 ? "text-red-500" : "text-gray-500"}`}
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
              width: `${((currentIdx + 1) / orderedQuestions.length) * 100}%`,
            }}
          />
        </div>
      )}

      {/* ── CONTENT ── */}
      {isOneByOne ? (
        // ─── ONE BY ONE / PER QUESTION ───────────────────────────
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row-reverse">
          {/* ── DESKTOP: savol navigatori (chap panel) ── */}
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
                    onClick={() => jumpable && setCurrentIdx(i)}
                    title={
                      checkedQ
                        ? feedbackMap[q.id].isCorrect
                          ? "To'g'ri"
                          : "Noto'g'ri"
                        : undefined
                    }
                    className={`aspect-square rounded-xl text-sm font-semibold flex items-center justify-center transition-colors ${
                      isCurrent
                        ? "bg-indigo-500 text-white shadow-md shadow-indigo-200"
                        : checkedQ
                          ? feedbackMap[q.id].isCorrect
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200"
                          : answered
                            ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            : jumpable
                              ? "bg-whitetext-gray-500 hover:border-indigo-300"
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
                <span className="w-3.5 h-3.5 rounded-md bg-indigo-100 shrink-0" />{" "}
                Javob berilgan
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-md bg-whiteshrink-0" />{" "}
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

          {/* ── O'NG USTUN: savol + variantlar + feedback + tugmalar ── */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Scrollable question area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {currentQ &&
                (() => {
                  return (
                    <div className="flex flex-col min-h-full lg:max-w-3xl lg:mx-auto lg:w-full">
                      {/* ── Question zone ── */}
                      <div className="px-5 lg:px-8 pt-6 lg:pt-10 pb-5">
                        {TYPE_BADGES[currentQ.type] && (
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-2 ${TYPE_BADGES[currentQ.type].cls}`}
                          >
                            {TYPE_BADGES[currentQ.type].label}
                          </span>
                        )}
                        <p
                          className="font-bold text-gray-900 leading-snug"
                          style={{ fontSize: `calc(var(--q-fs, 16px) + 2px)` }}
                        >
                          {currentQ.text}
                        </p>
                        {currentQ.imageUrl && currentQ.type !== "droppin" && (
                          <img
                            src={mediaUrl(currentQ.imageUrl)}
                            alt=""
                            className="w-full rounded-2xl object-cover mt-4"
                            style={{ maxHeight: 220 }}
                          />
                        )}
                        {currentQ.audioUrl && (
                          <audio
                            src={mediaUrl(currentQ.audioUrl)}
                            controls
                            className="w-full h-9 mt-4"
                          />
                        )}
                      </div>

                      {/* ── Divider ── */}
                      <div className="h-px bg-gray-100 mx-5 lg:mx-8" />

                      {/* ── Options zone ── */}
                      <div className="px-5 lg:px-8 pt-5 pb-6 flex flex-col gap-3">
                        {renderQuestionBody(currentQ, true)}
                      </div>
                    </div>
                  );
                })()}
            </div>

            {/* ── FEEDBACK PANEL (per_question) ── */}
            {isPerQuestion &&
              currentQ &&
              feedbackMap[currentQ.id] &&
              (() => {
                const fb = feedbackMap[currentQ.id];
                const correct = fb.isCorrect === true;
                const incorrect = fb.isCorrect === false;
                return (
                  <div
                    className={`shrink-0 px-5 lg:px-8 py-4 border-t-2 ${
                      correct
                        ? "bg-green-50 border-green-200"
                        : incorrect
                          ? "bg-red-50 border-red-200"
                          : "bg-gray-50 border-border"
                    }`}
                  >
                    <div className="lg:max-w-3xl lg:mx-auto flex items-center gap-3">
                      {correct ? (
                        <CheckCircle2
                          size={22}
                          className="text-green-500 shrink-0"
                        />
                      ) : incorrect ? (
                        <XCircle size={22} className="text-red-400 shrink-0" />
                      ) : null}
                      <div>
                        <p
                          className={`font-semibold ${
                            correct
                              ? "text-green-700"
                              : incorrect
                                ? "text-red-600"
                                : "text-gray-600"
                          }`}
                        >
                          {correct
                            ? "To'g'ri!"
                            : incorrect
                              ? "Noto'g'ri"
                              : "Tekshiruv yakunlanmadi"}
                        </p>
                        {fb.correctAnswer && incorrect && (
                          <p className="text-xs text-green-600 mt-0.5">
                            To'g'ri javob: {fb.correctAnswer}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* ── BOTTOM BUTTONS ── */}
            <div
              className="shrink-0 px-4 lg:px-8 pt-3 pb-4 bg-white border-t border-border flex gap-3"
              style={{
                paddingBottom: "max(16px, env(safe-area-inset-bottom))",
              }}
            >
              <div className="lg:max-w-3xl lg:mx-auto flex gap-3 w-full">
                {isPerQuestion ? (
                  isChecked ? (
                    isLast ? (
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-semibold text-base hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100"
                      >
                        {submitting ? "Topshirilmoqda..." : "Yakunlash ✓"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setCurrentIdx((i) => i + 1)}
                        className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100"
                      >
                        Keyingi →
                      </button>
                    )
                  ) : (
                    <button
                      onClick={handleCheck}
                      disabled={checking}
                      className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-100"
                    >
                      {checking ? "Tekshirilmoqda..." : "Tekshirish"}
                    </button>
                  )
                ) : (
                  <>
                    {currentIdx > 0 && (
                      <button
                        onClick={() => setCurrentIdx((i) => i - 1)}
                        className="px-5 py-4 bg-whitetext-gray-600 rounded-2xl font-medium text-base hover:bg-gray-50 transition-colors shrink-0"
                      >
                        ← Oldingi
                      </button>
                    )}
                    {!isLast ? (
                      <button
                        onClick={() => setCurrentIdx((i) => i + 1)}
                        className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100"
                      >
                        Keyingi →
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-semibold text-base hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100"
                      >
                        {submitting ? "Topshirilmoqda..." : "Topshirish ✓"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // ─── ALL AT ONCE ───────────────────────────────────────────
        <>
          <div
            className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-2xl mx-auto w-full"
            style={{
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
            }}
          >
            {questions.map(
              (q, i) =>
                q && (
                  <div key={q.id} className="bg-white rounded-2xl p-5 shadow-sm">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      {TYPE_BADGES[q.type] && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_BADGES[q.type].cls}`}
                        >
                          {TYPE_BADGES[q.type].label}
                        </span>
                      )}
                    </div>
                    {/* Question text */}
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
                    {renderQuestionBody(q, true)}
                  </div>
                ),
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 disabled:opacity-40 transition-colors"
              >
                {submitting ? "Topshirilmoqda..." : "Topshirish"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
