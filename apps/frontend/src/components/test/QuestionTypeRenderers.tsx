import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
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
import {
  seededShuffle,
  type QuestionFeedback,
} from "./testTakerUtils";

export function SortableItem({
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
      className={`flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden px-4 py-3 rounded-2xl border select-none ${isDragging
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

export function ReorderQuestion({
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
                className="flex items-center gap-2 rounded-2xl border border-emerald-500 bg-emerald-500 px-4 py-3 text-white"
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

export function MatchingQuestion({
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
    <div className="flex flex-col gap-2">
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

export function SliderQuestion({
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
    <div className="flex flex-col gap-2">
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

export function DropPinQuestion({
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
