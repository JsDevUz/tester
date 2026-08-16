import type React from "react";
import { useState } from "react";
import { Image, Music, X } from "lucide-react";
import { MediaLibraryModal } from "./MediaLibraryModal";
import {
  type OptionInput,
  type MatchPair,
  TrueFalseEditor,
  FillBlankEditor,
  SliderEditor,
  MatchingEditor,
  ReorderEditor,
  ArrangeEditor,
  OpenEditor,
  SingleMultiEditor,
  DropPinEditor,
} from "./question/QuestionFormEditors";

export type { OptionInput };

export interface InitialValues {
  text: string;
  type:
    | "single"
    | "multi"
    | "open"
    | "arrange"
    | "truefalse"
    | "reorder"
    | "matching"
    | "fillblank"
    | "slider"
    | "droppin";
  options: OptionInput[];
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
}

export interface QuestionFormProps {
  onSubmit: (data: {
    text: string;
    type: string;
    options: OptionInput[];
    imageUrl?: string | null;
    audioUrl?: string | null;
    correctAnswer?: string | null;
  }) => void;
  initial?: InitialValues;
  submitLabel?: string;
  onCancel?: () => void;
  hideAiTypes?: boolean;
}

const BACKEND =
  import.meta.env.VITE_API_URL?.replace("/api/v1", "") ??
  "http://localhost:3001";
function mediaUrl(url: string) {
  return url.startsWith("http") ? url : `${BACKEND}${url}`;
}

const ALL_TYPE_LABELS: Record<string, string> = {
  single: "Yagona tanlov",
  multi: "Ko'p tanlov",
  open: "Ochiq javob",
  arrange: "Gap tuzish",
  truefalse: "To'g'ri/Noto'g'ri",
  reorder: "Tartibga solish",
  matching: "Moslashtirish",
  fillblank: "Bo'sh joy",
  slider: "Slider",
  droppin: "Drop Pin",
};

export function QuestionForm({
  onSubmit,
  initial,
  submitLabel,
  onCancel,
  hideAiTypes,
}: QuestionFormProps) {
  const [text, setText] = useState(initial?.text ?? "");
  const [type, setType] = useState<InitialValues["type"]>(
    initial?.type ?? "single",
  );
  const [opts, setOpts] = useState<OptionInput[]>(
    initial?.options.length
      ? initial.options
      : [
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ],
  );
  const [correctTokens, setCorrectTokens] = useState<string[]>(
    initial?.type === "arrange" || initial?.type === "reorder"
      ? initial.options.filter((o) => o.isCorrect).map((o) => o.text)
      : ["", ""],
  );
  const [distractors, setDistractors] = useState<string[]>(
    initial?.type === "arrange"
      ? initial.options.filter((o) => !o.isCorrect).map((o) => o.text)
      : [],
  );
  const [correctAnswer, setCorrectAnswer] = useState(
    initial?.correctAnswer ?? "",
  );
  const [tfCorrect, setTfCorrect] = useState<"true" | "false" | null>(
    initial?.type === "truefalse"
      ? initial.options.find((o) => o.text === "To'g'ri")?.isCorrect
        ? "true"
        : "false"
      : null,
  );
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>(() => {
    if (initial?.type === "matching" && initial.options.length) {
      const lefts = initial.options
        .filter((o) => o.isCorrect)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const rights = initial.options
        .filter((o) => !o.isCorrect)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      return lefts.map((l, i) => ({
        left: l.text,
        right: rights[i]?.text ?? "",
      }));
    }
    return [
      { left: "", right: "" },
      { left: "", right: "" },
    ];
  });
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.imageUrl ?? null,
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(
    initial?.audioUrl ?? null,
  );
  const [mediaModal, setMediaModal] = useState<"image" | "audio" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function addOption() {
    setOpts([...opts, { text: "", isCorrect: false }]);
  }

  function removeOption(i: number) {
    setOpts(opts.filter((_, idx) => idx !== i));
  }

  function toggleCorrect(i: number) {
    if (type === "single") {
      setOpts(
        opts.map((o, idx) => ({
          ...o,
          isCorrect: idx === i,
        })),
      );
    } else {
      setOpts(
        opts.map((o, idx) => (idx === i ? { ...o, isCorrect: !o.isCorrect } : o)),
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let options: OptionInput[];
    if (type === "arrange") {
      const validTokens = correctTokens.filter((t) => t.trim());
      const validDistractors = distractors.filter((d) => d.trim());
      if (validTokens.length < 2) return;
      options = [
        ...validTokens.map((t, i) => ({
          text: t.trim(),
          isCorrect: true,
          orderIndex: i,
        })),
        ...validDistractors.map((d) => ({
          text: d.trim(),
          isCorrect: false,
          orderIndex: 0,
        })),
      ];
    } else if (type === "reorder") {
      const validTokens = correctTokens.filter((t) => t.trim());
      if (validTokens.length < 2) return;
      options = validTokens.map((t, i) => ({
        text: t.trim(),
        isCorrect: true,
        orderIndex: i,
      }));
    } else if (type === "truefalse") {
      if (!tfCorrect) {
        setUploadError("To'g'ri yoki Noto'g'rini tanlang");
        return;
      }
      options = [
        { text: "To'g'ri", isCorrect: tfCorrect === "true", orderIndex: 0 },
        { text: "Noto'g'ri", isCorrect: tfCorrect === "false", orderIndex: 1 },
      ];
    } else if (type === "matching") {
      const valid = matchPairs.filter((p) => p.left.trim() && p.right.trim());
      if (valid.length < 2) {
        setUploadError("Kamida 2 ta juft kiriting");
        return;
      }
      options = valid.flatMap((p, i) => [
        { text: p.left.trim(), isCorrect: true, orderIndex: i },
        { text: p.right.trim(), isCorrect: false, orderIndex: i },
      ]);
    } else if (type === "fillblank") {
      options = [];
    } else if (type === "slider") {
      options = [
        { text: opts[0]?.text || "0", isCorrect: false, orderIndex: 0 },
        { text: opts[1]?.text || "100", isCorrect: false, orderIndex: 1 },
        { text: opts[2]?.text || "1", isCorrect: false, orderIndex: 2 },
      ];
    } else if (type === "droppin") {
      options = [
        { text: opts[0]?.text || "8", isCorrect: false, orderIndex: 0 },
      ];
    } else {
      options = opts.filter((o) => o.text.trim());
      if ((type === "single" || type === "multi") && options.length > 0) {
        const hasCorrect = options.some((o) => o.isCorrect);
        if (!hasCorrect) {
          setUploadError("Kamida bitta to'g'ri javob belgilanishi shart");
          return;
        }
      }
    }
    setUploadError(null);

    onSubmit({
      text: text.trim(),
      type,
      options,
      imageUrl,
      audioUrl,
      correctAnswer: correctAnswer.trim() || null,
    });

    // reset
    setText("");
    setType(initial ? type : "single");
    setOpts([
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ]);
    setCorrectTokens(["", ""]);
    setDistractors([]);
    setCorrectAnswer("");
    setTfCorrect(null);
    setMatchPairs([
      { left: "", right: "" },
      { left: "", right: "" },
    ]);
    setImageUrl(null);
    setAudioUrl(null);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-[1024px]:bg-transparent min-[1025px]:bg-white min-[1025px]:dark:bg-[#30313a] rounded-2xl flex flex-col gap-2"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Savol matni..."
        required
        className="w-full rounded-lg border border-border dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/60 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-zinc-500 resize-none"
      />

      {/* Media & Type selector */}
      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto py-0.5">
        {imageUrl ? (
          <div className="relative group inline-block shrink-0">
            <img
              src={mediaUrl(imageUrl)}
              alt=""
              className="h-20 w-auto rounded-lg object-cover border border-border"
            />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMediaModal("image")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border dark:border-zinc-600 rounded-lg text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors font-medium shrink-0 cursor-pointer"
          >
            <Image size={13} /> Rasm
          </button>
        )}
        {audioUrl ? (
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 border border-gray-200 dark:border-zinc-700 shrink-0">
            <Music size={13} className="text-gray-700 dark:text-zinc-300 shrink-0" />
            <audio src={mediaUrl(audioUrl)} controls className="h-7" />
            <button
              type="button"
              onClick={() => setAudioUrl(null)}
              className="text-gray-400 dark:text-zinc-500 hover:text-red-400 cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMediaModal("audio")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-border dark:border-zinc-600 rounded-lg text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors font-medium shrink-0 cursor-pointer"
          >
            <Music size={13} /> Audio
          </button>
        )}

        {/* Type select */}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as InitialValues["type"])}
          className="text-xs px-3 py-1.5 border border-dashed border-border dark:border-zinc-600 rounded-lg text-gray-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 font-semibold outline-none cursor-pointer hover:border-gray-400 dark:hover:border-zinc-500 focus:ring-2 focus:ring-indigo-500 transition-colors shrink-0"
        >
          {Object.entries(ALL_TYPE_LABELS)
            .filter(([k]) => !hideAiTypes || k !== "open")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </select>

        {uploadError && (
          <span className="text-xs text-red-500 shrink-0">{uploadError}</span>
        )}
      </div>

      {mediaModal && (
        <MediaLibraryModal
          type={mediaModal}
          folder="questions"
          onSelect={(url) => {
            if (mediaModal === "image") setImageUrl(url);
            else setAudioUrl(url);
            setMediaModal(null);
          }}
          onClose={() => setMediaModal(null)}
        />
      )}

      {/* Options by type */}
      {type === "truefalse" && (
        <TrueFalseEditor tfCorrect={tfCorrect} onChange={setTfCorrect} />
      )}

      {type === "fillblank" && (
        <FillBlankEditor
          correctAnswer={correctAnswer}
          onChange={setCorrectAnswer}
        />
      )}

      {type === "slider" && (
        <SliderEditor
          opts={opts}
          setOpts={setOpts}
          correctAnswer={correctAnswer}
          setCorrectAnswer={setCorrectAnswer}
        />
      )}

      {type === "droppin" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-400 dark:text-zinc-400">
            Rasm yuklang va to'g'ri joyni bosing:
          </p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-400 dark:text-zinc-400 shrink-0">
              Radius (1–30%):
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={opts[0]?.text ?? "8"}
              onChange={(e) =>
                setOpts([{ text: e.target.value, isCorrect: false }])
              }
              className="w-20 rounded-lg border border-border dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/60 text-gray-900 dark:text-zinc-100 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-lime-400"
            />
            <span className="text-[10px] text-gray-400 dark:text-zinc-400">
              % (katta = keng, kichik = aniq)
            </span>
          </div>
          {imageUrl ? (
            <DropPinEditor
              imageUrl={mediaUrl(imageUrl)}
              correctAnswer={correctAnswer}
              radiusPct={parseFloat(opts[0]?.text ?? "8")}
              onChange={setCorrectAnswer}
            />
          ) : (
            <div className="text-xs text-gray-400 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800/60 rounded-xl p-4 text-center border border-dashed border-border dark:border-zinc-700">
              Yuqoridan rasm yuklang, keyin to'g'ri joyni bosing
            </div>
          )}
          {correctAnswer && (
            <p className="text-[10px] text-gray-400 dark:text-zinc-400">
              Pin: {correctAnswer} | Radius: {opts[0]?.text ?? "8"}%
            </p>
          )}
        </div>
      )}

      {type === "matching" && (
        <MatchingEditor
          matchPairs={matchPairs}
          setMatchPairs={setMatchPairs}
        />
      )}

      {type === "reorder" && (
        <ReorderEditor
          correctTokens={correctTokens}
          setCorrectTokens={setCorrectTokens}
        />
      )}

      {type === "arrange" && (
        <ArrangeEditor
          correctTokens={correctTokens}
          setCorrectTokens={setCorrectTokens}
          distractors={distractors}
          setDistractors={setDistractors}
        />
      )}

      {type === "open" && (
        <OpenEditor
          opts={opts}
          setOpts={setOpts}
          correctAnswer={correctAnswer}
          setCorrectAnswer={setCorrectAnswer}
        />
      )}

      {(type === "single" || type === "multi") && (
        <SingleMultiEditor
          type={type}
          opts={opts}
          setOpts={setOpts}
          onToggleCorrect={toggleCorrect}
          onAddOption={addOption}
          onRemoveOption={removeOption}
        />
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 cursor-pointer"
          >
            Bekor qilish
          </button>
        )}
        <button
          type="submit"
          className="text-sm bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 disabled:opacity-40 cursor-pointer"
        >
          {submitLabel ?? "Savol qo'shish"}
        </button>
      </div>
    </form>
  );
}
