import type React from "react";
import { GripHorizontal, Plus, Trash2 } from "lucide-react";
import { DropPinEditor } from "./DropPinEditor";

export interface OptionInput {
  text: string;
  isCorrect: boolean;
  orderIndex?: number;
}

export interface MatchPair {
  left: string;
  right: string;
}

export function TrueFalseEditor({
  tfCorrect,
  onChange,
}: {
  tfCorrect: "true" | "false" | null;
  onChange: (val: "true" | "false") => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">To'g'ri javobni tanlang:</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("true")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
            tfCorrect === "true"
              ? "bg-green-500 text-white border-green-500"
              : "border-border text-gray-500 hover:border-green-300 hover:text-green-600"
          }`}
        >
          ✓ To'g'ri
        </button>
        <button
          type="button"
          onClick={() => onChange("false")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
            tfCorrect === "false"
              ? "bg-red-400 text-white border-red-400"
              : "border-border text-gray-500 hover:border-red-300 hover:text-red-500"
          }`}
        >
          ✗ Noto'g'ri
        </button>
      </div>
    </div>
  );
}

export function FillBlankEditor({
  correctAnswer,
  onChange,
}: {
  correctAnswer: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">
        Savol matnida <code className="bg-gray-100 px-1 rounded">___</code>{" "}
        yozing, to'g'ri javobni kiriting:
      </p>
      <input
        value={correctAnswer}
        onChange={(e) => onChange(e.target.value)}
        placeholder="To'g'ri javob..."
        className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
      />
    </div>
  );
}

export function SliderEditor({
  opts,
  setOpts,
  correctAnswer,
  setCorrectAnswer,
}: {
  opts: OptionInput[];
  setOpts: React.Dispatch<React.SetStateAction<OptionInput[]>>;
  correctAnswer: string;
  setCorrectAnswer: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Slider sozlamalari:</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-gray-400">Min</label>
          <input
            type="number"
            placeholder="0"
            value={opts[0]?.text ?? ""}
            onChange={(e) =>
              setOpts([
                { text: e.target.value, isCorrect: false },
                opts[1] ?? { text: "", isCorrect: false },
                opts[2] ?? { text: "", isCorrect: false },
              ])
            }
            className="w-full rounded-lg border border-border bg-gray-50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Max</label>
          <input
            type="number"
            placeholder="100"
            value={opts[1]?.text ?? ""}
            onChange={(e) =>
              setOpts([
                opts[0] ?? { text: "", isCorrect: false },
                { text: e.target.value, isCorrect: false },
                opts[2] ?? { text: "", isCorrect: false },
              ])
            }
            className="w-full rounded-lg border border-border bg-gray-50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Qadam</label>
          <input
            type="number"
            placeholder="1"
            value={opts[2]?.text ?? ""}
            onChange={(e) =>
              setOpts([
                opts[0] ?? { text: "", isCorrect: false },
                opts[1] ?? { text: "", isCorrect: false },
                { text: e.target.value, isCorrect: false },
              ])
            }
            className="w-full rounded-lg border border-border bg-gray-50 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400">To'g'ri qiymat</label>
        <input
          type="number"
          value={correctAnswer}
          onChange={(e) => setCorrectAnswer(e.target.value)}
          placeholder="Masalan: 42"
          className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400"
        />
      </div>
    </div>
  );
}

export function MatchingEditor({
  matchPairs,
  setMatchPairs,
}: {
  matchPairs: MatchPair[];
  setMatchPairs: React.Dispatch<React.SetStateAction<MatchPair[]>>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1 mb-1">
        <p className="text-xs text-gray-500 font-medium px-1">Chap (savol)</p>
        <p className="text-xs text-gray-500 font-medium px-1">O'ng (javob)</p>
      </div>
      {matchPairs.map((pair, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 items-center">
          <input
            value={pair.left}
            onChange={(e) =>
              setMatchPairs(
                matchPairs.map((p, idx) =>
                  idx === i ? { ...p, left: e.target.value } : p,
                ),
              )
            }
            placeholder={`Savol ${i + 1}`}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-400 bg-gray-50"
          />
          <div className="flex gap-1 items-center">
            <input
              value={pair.right}
              onChange={(e) =>
                setMatchPairs(
                  matchPairs.map((p, idx) =>
                    idx === i ? { ...p, right: e.target.value } : p,
                  ),
                )
              }
              placeholder={`Javob ${i + 1}`}
              className="flex-1 border border-green-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-400 bg-green-50/30"
            />
            {matchPairs.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  setMatchPairs(matchPairs.filter((_, idx) => idx !== i))
                }
                className="text-gray-300 hover:text-red-400 shrink-0 cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setMatchPairs([...matchPairs, { left: "", right: "" }])}
        className="text-xs text-gray-700 hover:text-gray-900 self-start flex items-center gap-1 cursor-pointer"
      >
        <Plus size={12} /> Juft qo'shish
      </button>
    </div>
  );
}

export function ReorderEditor({
  correctTokens,
  setCorrectTokens,
}: {
  correctTokens: string[];
  setCorrectTokens: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500 flex items-center gap-1">
        <GripHorizontal size={12} /> To'g'ri tartibni kiriting (o'quvchi
        aralashtirilib beriladi)
      </p>
      <div className="flex flex-col gap-1.5">
        {correctTokens.map((tok, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-mono w-5 text-right shrink-0">
              {i + 1}.
            </span>
            <input
              value={tok}
              onChange={(e) =>
                setCorrectTokens(
                  correctTokens.map((t, idx) =>
                    idx === i ? e.target.value : t,
                  ),
                )
              }
              placeholder={`Element ${i + 1}`}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-400 bg-gray-50"
            />
            {correctTokens.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  setCorrectTokens(correctTokens.filter((_, idx) => idx !== i))
                }
                className="text-gray-300 hover:text-red-400 cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setCorrectTokens([...correctTokens, ""])}
          className="text-xs text-gray-700 hover:text-gray-900 self-start flex items-center gap-1 mt-0.5 cursor-pointer"
        >
          <Plus size={12} /> Element qo'shish
        </button>
      </div>
      {correctTokens.filter((t) => t.trim()).length >= 2 && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-2">
            O'quvchiga ko'rinishi (aralashtirilgan):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...correctTokens.filter((t) => t.trim())]
              .sort(() => Math.random() - 0.5)
              .map((tok, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-white rounded-lg text-sm text-gray-700 "
                >
                  {tok}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ArrangeEditor({
  correctTokens,
  setCorrectTokens,
  distractors,
  setDistractors,
}: {
  correctTokens: string[];
  setCorrectTokens: React.Dispatch<React.SetStateAction<string[]>>;
  distractors: string[];
  setDistractors: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
          <GripHorizontal size={12} /> To'g'ri tartib (ketma-ketlikda kiriting)
        </p>
        <div className="flex flex-col gap-1.5">
          {correctTokens.map((tok, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono w-5 text-right shrink-0">
                {i + 1}.
              </span>
              <input
                value={tok}
                onChange={(e) =>
                  setCorrectTokens(
                    correctTokens.map((t, idx) =>
                      idx === i ? e.target.value : t,
                    ),
                  )
                }
                placeholder={`Bo'lak ${i + 1}`}
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-400 bg-gray-50"
              />
              {correctTokens.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    setCorrectTokens(
                      correctTokens.filter((_, idx) => idx !== i),
                    )
                  }
                  className="text-gray-300 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCorrectTokens([...correctTokens, ""])}
            className="text-xs text-gray-700 hover:text-gray-900 self-start flex items-center gap-1 mt-0.5 cursor-pointer"
          >
            <Plus size={12} /> Bo'lak qo'shish
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1.5">
          Chalg'ituvchi bo'laklar (ixtiyoriy)
        </p>
        <div className="flex flex-col gap-1.5">
          {distractors.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={d}
                onChange={(e) =>
                  setDistractors(
                    distractors.map((t, idx) =>
                      idx === i ? e.target.value : t,
                    ),
                  )
                }
                placeholder={`Chalg'ituvchi ${i + 1}`}
                className="flex-1 rounded-lg border border-border bg-gray-50 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button
                type="button"
                onClick={() =>
                  setDistractors(distractors.filter((_, idx) => idx !== i))
                }
                className="text-gray-300 hover:text-red-400 cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDistractors([...distractors, ""])}
            className="text-xs text-gray-400 hover:text-gray-600 self-start flex items-center gap-1 mt-0.5 cursor-pointer"
          >
            <Plus size={12} /> Chalg'ituvchi qo'shish
          </button>
        </div>
      </div>

      {correctTokens.filter((t) => t.trim()).length >= 2 && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 mb-2">Ko'rinishi:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              ...correctTokens.filter((t) => t.trim()),
              ...distractors.filter((d) => d.trim()),
            ]
              .sort(() => Math.random() - 0.5)
              .map((tok, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 bg-white rounded-lg text-sm text-gray-700 "
                >
                  {tok}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OpenEditor({
  opts,
  setOpts,
  correctAnswer,
  setCorrectAnswer,
}: {
  opts: OptionInput[];
  setOpts: React.Dispatch<React.SetStateAction<OptionInput[]>>;
  correctAnswer: string;
  setCorrectAnswer: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">
        To'g'ri javoblar (agar o'quvchi yozsa — to'g'ri hisoblanadi):
      </p>
      {opts
        .filter((o) => o.isCorrect)
        .map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-green-400 shrink-0" />
            <input
              value={opt.text}
              onChange={(e) =>
                setOpts(
                  opts.map((o, idx) =>
                    idx === opts.indexOf(opt) ? { ...o, text: e.target.value } : o,
                  ),
                )
              }
              placeholder={`To'g'ri variant ${i + 1}`}
              className="flex-1 border border-green-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="button"
              onClick={() => setOpts(opts.filter((o) => o !== opt))}
              className="text-gray-300 hover:text-red-400 text-lg leading-none cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
      <button
        type="button"
        onClick={() => setOpts([...opts, { text: "", isCorrect: true }])}
        className="text-xs text-green-600 hover:text-green-700 self-start cursor-pointer"
      >
        + To'g'ri javob qo'shish
      </button>
      <div className="mt-1">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-400">
            AI uchun qo'shimcha ko'rsatma (ixtiyoriy):
          </p>
          <span
            className={`text-[10px] ${correctAnswer.length > 30 ? "text-red-400" : "text-gray-300"}`}
          >
            {correctAnswer.length}/30
          </span>
        </div>
        <input
          value={correctAnswer}
          onChange={(e) => {
            if (e.target.value.length <= 30) setCorrectAnswer(e.target.value);
          }}
          placeholder="Masalan: O'zbekiston poytaxti..."
          className="w-full rounded-lg border border-border bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-400"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Agar o'quvchi javobi yuqoridagi variantlarga mos kelmasa, AI shu
          ko'rsatma asosida tekshiradi.
        </p>
      </div>
    </div>
  );
}

export function SingleMultiEditor({
  type,
  opts,
  setOpts,
  onToggleCorrect,
  onAddOption,
  onRemoveOption,
}: {
  type: "single" | "multi";
  opts: OptionInput[];
  setOpts: React.Dispatch<React.SetStateAction<OptionInput[]>>;
  onToggleCorrect: (i: number) => void;
  onAddOption: () => void;
  onRemoveOption: (i: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {opts.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type={type === "single" ? "radio" : "checkbox"}
            checked={opt.isCorrect}
            onChange={() => onToggleCorrect(i)}
            name="correct"
            className="w-4 h-4 accent-gray-900 cursor-pointer"
          />
          <input
            value={opt.text}
            onChange={(e) =>
              setOpts(
                opts.map((o, idx) =>
                  idx === i ? { ...o, text: e.target.value } : o,
                ),
              )
            }
            placeholder={`Variant ${i + 1}`}
            className="flex-1 rounded-lg border border-border bg-gray-50 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            type="button"
            onClick={() => onRemoveOption(i)}
            className="text-gray-300 hover:text-red-400 text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAddOption}
        className="text-xs text-gray-700 hover:text-gray-900 self-start cursor-pointer"
      >
        + Variant qo'shish
      </button>
    </div>
  );
}

export { DropPinEditor };
