import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock, Check, X, Volume2, VolumeX } from "lucide-react";
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
  result,
}: {
  id: string;
  pos: number;
  text: string;
  result?: "correct" | "incorrect";
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(verticalTransform), transition }}
      className={`flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden px-4 py-3 rounded-2xl border select-none ${isDragging
          ? "bg-gray-50 border-gray-400 shadow-lg z-50 opacity-90"
          : result === "correct"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : result === "incorrect"
              ? "border-rose-500 bg-rose-500 text-white"
              : "bg-white border-border"
        }`}
    >
      <span
        className={`text-sm font-mono w-5 shrink-0 ${result ? "text-white/70" : "text-gray-300"}`}
      >
        {pos + 1}.
      </span>
      <span
        className={`min-w-0 flex-1 break-words ${result ? "text-white" : "text-gray-800"}`}
        style={{ fontSize: "var(--q-fs, 16px)" }}
      >
        {text}
      </span>
      <span
        {...attributes}
        {...listeners}
        className={`touch-none cursor-grab active:cursor-grabbing text-2xl px-1 select-none ${result ? "text-white/50" : "text-gray-300"}`}
      >
        ⠿
      </span>
      {result === "correct" && <Check size={18} className="shrink-0 text-white" />}
      {result === "incorrect" && <X size={18} className="shrink-0 text-white" />}
    </div>
  );
}

function ReorderQuestion({
  optionIds,
  options,
  onChange,
  locked,
  feedback,
}: {
  optionIds: string[];
  options: { id: string; text: string }[];
  onChange: (ids: string[]) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
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
        <div className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-x-clip">
          {optionIds.map((id, pos) => {
            const opt = options.find((o) => o.id === id);
            const result = feedback
              ? feedback.correctOptionIds?.[pos] === id
                ? "correct"
                : "incorrect"
              : undefined;
            return opt ? (
              <SortableItem key={id} id={id} pos={pos} text={opt.text} result={result} />
            ) : null;
          })}
        </div>
      </SortableContext>
      {feedback?.isCorrect === false && feedback.correctOptionIds && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-emerald-700">To'g'ri tartib</p>
          {feedback.correctOptionIds.map((id, pos) => {
            const opt = options.find((option) => option.id === id);
            return opt ? (
              <div
                key={`correct-${id}`}
                className="flex items-center gap-3 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3 text-white"
              >
                <span className="w-5 shrink-0 font-mono text-sm text-white/70">{pos + 1}.</span>
                <span className="min-w-0 flex-1 break-words">{opt.text}</span>
                <Check size={18} className="shrink-0" />
              </div>
            ) : null;
          })}
        </div>
      )}
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
  feedback,
}: {
  questionId: string;
  options: { id: string; text: string }[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
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
  const boardRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef(new Map<string, HTMLButtonElement>());
  const rightRefs = useRef(new Map<string, HTMLButtonElement>());
  const [connections, setConnections] = useState<Array<{
    key: string;
    leftId: string;
    rightId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    result: "neutral" | "correct" | "incorrect";
  }>>([]);

  useEffect(() => {
    setPendingLeft(null);
  }, [questionId]);

  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);
  const correctIds = feedback?.correctOptionIds ?? [];
  const correctPairs = new Map<string, string>();
  for (let index = 0; index < correctIds.length; index += 2) {
    if (correctIds[index] && correctIds[index + 1])
      correctPairs.set(correctIds[index], correctIds[index + 1]);
  }

  useLayoutEffect(() => {
    const updateConnections = () => {
      const board = boardRef.current;
      if (!board) return;
      const boardRect = board.getBoundingClientRect();
      const selectedPairs = pairedLeftIds.map((leftId, index) => ({
        key: `selected-${leftId}-${pairedRightIds[index]}`,
        leftId,
        rightId: pairedRightIds[index],
        result: !feedback
          ? "neutral" as const
          : correctPairs.get(leftId) === pairedRightIds[index]
            ? "correct" as const
            : "incorrect" as const,
      }));
      const selectedPairKeys = new Set(
        selectedPairs.map((pair) => `${pair.leftId}:${pair.rightId}`),
      );
      const missingCorrectPairs = feedback
        ? [...correctPairs.entries()]
          .filter(([leftId, rightId]) => !selectedPairKeys.has(`${leftId}:${rightId}`))
          .map(([leftId, rightId]) => ({
            key: `correct-${leftId}-${rightId}`,
            leftId,
            rightId,
            result: "correct" as const,
          }))
        : [];
      setConnections([...selectedPairs, ...missingCorrectPairs].flatMap((pair) => {
        const { leftId, rightId } = pair;
        const left = leftRefs.current.get(leftId);
        const right = rightRefs.current.get(rightId);
        if (!left || !right) return [];
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return [{
          key: pair.key,
          leftId,
          rightId,
          x1: leftRect.right - boardRect.left,
          y1: leftRect.top + leftRect.height / 2 - boardRect.top,
          x2: rightRect.left - boardRect.left,
          y2: rightRect.top + rightRect.height / 2 - boardRect.top,
          result: pair.result,
        }];
      }));
    };
    updateConnections();
    const observer = new ResizeObserver(updateConnections);
    if (boardRef.current) observer.observe(boardRef.current);
    window.addEventListener('resize', updateConnections);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateConnections);
    };
  }, [selected, options, feedback]);

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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400">
        Chap tomondagini bosing, keyin mos o'ng tomondagini bosing
      </p>
      <div ref={boardRef} className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 sm:gap-12">
        <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" aria-hidden="true">
          {connections.map((connection) => {
            const bend = Math.max(12, (connection.x2 - connection.x1) * 0.45);
            return (
              <g
                key={connection.key}
                className={
                  connection.result === "correct"
                    ? "text-emerald-500"
                    : connection.result === "incorrect"
                      ? "text-rose-500"
                      : "text-gray-400"
                }
              >
                <path
                  d={`M ${connection.x1} ${connection.y1} C ${connection.x1 + bend} ${connection.y1}, ${connection.x2 - bend} ${connection.y2}, ${connection.x2} ${connection.y2}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-inherit"
                />
                <circle cx={connection.x1} cy={connection.y1} r="3" fill="currentColor" />
                <circle cx={connection.x2} cy={connection.y2} r="3" fill="currentColor" />
              </g>
            );
          })}
        </svg>
        <div className="flex flex-col gap-2">
          {lefts.map((opt) => {
            const pairIdx = pairedLeftIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const isPending = pendingLeft === opt.id;
            return (
              <button
                key={opt.id}
                ref={(node) => { if (node) leftRefs.current.set(opt.id, node); else leftRefs.current.delete(opt.id); }}
                type="button"
                onClick={() => tapLeft(opt.id)}
                style={{ fontSize: "var(--q-fs, 14px)" }}
                className={`relative z-10 min-w-0 break-words px-3 py-2.5 rounded-2xl border text-left transition-colors ${isPending
                    ? "bg-gray-900 text-white border-gray-900"
                    : isPaired
                      ? "bg-gray-100 border-gray-400 text-gray-800"
                      : "bg-white border-border text-gray-700 hover:border-gray-300"
                  } ${locked ? "pointer-events-none" : ""}`}
              >
                {opt.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const pairIdx = pairedRightIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            return (
              <button
                key={opt.id}
                ref={(node) => { if (node) rightRefs.current.set(opt.id, node); else rightRefs.current.delete(opt.id); }}
                type="button"
                onClick={() => tapRight(opt.id)}
                disabled={(!pendingLeft && !isPaired) || locked}
                style={{ fontSize: "var(--q-fs, 14px)" }}
                className={`relative z-10 min-w-0 break-words px-3 py-2.5 rounded-2xl border text-left transition-colors ${isPaired
                    ? "bg-gray-100 border-gray-400 text-gray-800"
                    : pendingLeft
                      ? "bg-white border-gray-400 text-gray-700 hover:bg-gray-50"
                      : "bg-gray-50 border-border text-gray-400"
                  }`}
              >
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
  feedback,
}: {
  options: { text: string }[];
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current =
    value !== "" ? parseFloat(value) : Math.round((min + max) / 2);
  return (
    <div className="flex flex-col gap-3">
      <div
        className={`text-center text-3xl font-bold ${feedback?.isCorrect === true
            ? "text-emerald-600"
            : feedback?.isCorrect === false
              ? "text-rose-600"
              : "text-gray-900"
          }`}
      >
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
        className={`w-full h-2 cursor-pointer disabled:opacity-100 ${feedback?.isCorrect === true
            ? "accent-emerald-500"
            : feedback?.isCorrect === false
              ? "accent-rose-500"
              : "accent-gray-900"
          }`}
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {feedback?.isCorrect === false && feedback.correctAnswer && (
        <div className="rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3 text-center font-semibold text-white">
          To'g'ri qiymat: {feedback.correctAnswer}
        </div>
      )}
    </div>
  );
}

function DropPinQuestion({
  imageUrl,
  value,
  onChange,
  locked,
  feedback,
}: {
  imageUrl: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
  feedback?: QuestionFeedback;
}) {
  const pin = value ? value.split(",").map(Number) : null;
  const correctPin =
    feedback?.isCorrect === false && feedback.correctAnswer
      ? feedback.correctAnswer.split(",").map(Number)
      : null;
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
            <div
              className={`w-6 h-6 rounded-full border border-white shadow-lg flex items-center justify-center ${feedback?.isCorrect === true
                  ? "bg-emerald-500"
                  : feedback?.isCorrect === false
                    ? "bg-rose-500"
                    : "bg-indigo-500"
                }`}
            >
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}
        {correctPin && Number.isFinite(correctPin[0]) && Number.isFinite(correctPin[1]) && (
          <div
            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${correctPin[0] * 100}%`, top: `${correctPin[1] * 100}%` }}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-lg">
              <Check size={16} className="text-white" />
            </div>
          </div>
        )}
      </div>
      {feedback && !pin && (
        <div className="rounded-2xl border border-rose-500 bg-rose-500 px-4 py-3.5 text-white">
          Siz joy belgilamadingiz
        </div>
      )}
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
    const feedback = feedbackMap[q.id];
    const locked = isPerQuestion && !!feedback;
    const correctIds = new Set(feedback?.correctOptionIds ?? []);
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
          feedback={feedback}
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
          feedback={feedback}
        />
      );

    if (q.type === "fillblank")
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400">Bo'sh joyni to'ldiring:</p>
          <input
            value={textMap[q.id] ?? ""}
            onChange={(e) => {
              if (!locked)
                setTextMap((p) => ({ ...p, [q.id]: e.target.value }));
            }}
            placeholder="Javobingizni yozing..."
            readOnly={locked}
            className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition-colors ${feedback?.isCorrect === true
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

    if (q.type === "open")
      return (
        <div className="flex flex-col gap-2">
          <textarea
            value={textMap[q.id] ?? ""}
            rows={4}
            onChange={(e) => {
              if (!locked) setTextMap((p) => ({ ...p, [q.id]: e.target.value }));
            }}
            placeholder="Javobingizni yozing..."
            readOnly={locked}
            className={`w-full resize-none rounded-2xl border px-4 py-3.5 outline-none transition-colors ${feedback?.isCorrect === true
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

    if (q.type === "matching")
      return (
        <MatchingQuestion
          questionId={q.id}
          options={q.options}
          selected={selected}
          onSelect={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
          locked={locked}
          feedback={feedback}
        />
      );

    if (q.type === "truefalse")
      return (
        <div className="flex gap-3">
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
                onClick={() => toggleOption(q.id, opt.id, "single")}
                style={{ fontSize: "var(--q-fs, 16px)" }}
                className={`flex-1 py-4 rounded-2xl border font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${resultClass} ${locked ? "pointer-events-none" : ""}`}
              >
                <span
                  className={`text-lg ${feedback && !isCorrectOption && !checked ? "text-gray-300" : checked || isCorrectOption ? "text-white" : "text-gray-400"}`}
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
        <div className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-x-clip">
          <p className="text-xs text-gray-400 mb-1">
            Ushlab suring va to'g'ri tartibga soling
          </p>
          <ReorderQuestion
            optionIds={selected}
            options={q.options}
            onChange={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
            locked={locked}
            feedback={feedback}
          />
        </div>
      );

    if (q.type === "arrange") {
      const rtl =
        q.options.some((o) => isArabicText(o.text)) || isArabicText(q.text);
      const correctSeq = feedback?.correctOptionIds ?? [];
      return (
        <div className="flex flex-col gap-3">
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
                  onClick={() => arrangeRemove(q.id, id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className={`px-3.5 py-2 rounded-xl  transition-all active:scale-95 ${result === "correct"
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
                  onClick={() => arrangeAdd(q.id, opt.id)}
                  style={{ fontSize: "var(--q-fs, 14px)" }}
                  className="px-3.5 py-2 bg-white rounded-xl text-gray-700 hover:border-gray-400 hover:text-gray-900 active:scale-95 transition-all"
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

    // single / multi — professional option cards with letter label
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
                toggleOption(q.id, opt.id, q.type as "single" | "multi")
              }
              className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-150 active:scale-[0.99] ${cardClass} ${locked ? "pointer-events-none" : ""}`}
            >
              <span
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${checked
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
                <Check size={18} className="ml-auto shrink-0 text-emerald-600" />
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
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-white notranslate"
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
            onClick={() => void handleExitWhileAnswering()}
            disabled={submitting}
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
          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            title={soundEnabled ? "Ovozni o'chirish" : "Ovozni yoqish"}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 shrink-0 transition-colors"
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

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

      {/* ── MOBILE: savol raqamlari (gorizontal scroll) ── */}
      {isOneByOne && (
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
                onClick={() => jumpable && setCurrentIdx(i)}
                className={`w-9 h-9 shrink-0 rounded-xl text-sm font-semibold flex items-center justify-center transition-colors ${isCurrent
                    ? "bg-gray-900 text-white shadow-md"
                    : checkedQ
                      ? feedbackMap[q.id].isCorrect
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600"
                      : answered
                        ? "bg-gray-200 text-gray-700"
                        : jumpable
                          ? "bg-white border border-border text-gray-500"
                          : "bg-gray-100 text-gray-300"
                  }`}
              >
                {i + 1}
              </button>
            );
          })}
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
                    className={`aspect-square rounded-xl text-sm font-semibold flex items-center justify-center transition-colors ${isCurrent
                        ? "bg-gray-900 text-white shadow-md"
                        : checkedQ
                          ? feedbackMap[q.id].isCorrect
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200"
                          : answered
                            ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
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
                <span className="w-3.5 h-3.5 rounded-md bg-white shrink-0" />{" "}
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
            <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
              {currentQ &&
                (() => {
                  return (
                    <div className="flex flex-col min-h-full lg:max-w-3xl lg:mx-auto lg:w-full">
                      {/* ── Question zone ── */}
                      <div className="px-3 lg:px-8 pt-3 lg:pt-10 pb-5">
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
                      <div className="h-px bg-gray-100 mx-3 lg:mx-8" />

                      {/* ── Options zone ── */}
                      <div className="px-3 lg:px-8 pt-5 pb-6 flex flex-col gap-3">
                        {renderQuestionBody(currentQ, true)}
                      </div>
                    </div>
                  );
                })()}
            </div>

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
            className="flex-1 overflow-y-auto px-2 py-3 sm:px-4 sm:py-4 flex flex-col gap-4 max-w-2xl mx-auto w-full"
            style={{
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
            }}
          >
            {questions.map(
              (q, i) =>
                q && (
                  <div key={q.id} className="bg-white rounded-2xl p-3  sm:p-5">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-7 h-7 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center shrink-0">
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
