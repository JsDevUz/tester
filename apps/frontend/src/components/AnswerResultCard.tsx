import { CheckCircle2, XCircle, Circle } from "lucide-react";

const BACKEND = import.meta.env.VITE_API_URL?.replace("/api/v1", "") ?? "";

export interface AnswerResultData {
  questionId: string;
  questionText: string;
  questionType: string;
  isCorrect: boolean | null;
  selectedOptionIds: string[];
  textAnswer: string | null;
  correctAnswer?: string | null;
  imageUrl?: string | null;
  options?: Array<{ id: string; text: string; isCorrectOption: boolean }>;
}

export function AnswerResultCard({
  answer: a,
  index,
}: {
  answer: AnswerResultData;
  index: number;
}) {
  return (
    <div
      className={`rounded-3xl border p-4 sm:p-5 transition-colors ${a.isCorrect === true
        ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-[#152720]"
        : a.isCorrect === false
          ? "border-red-200/80 bg-red-50/70 dark:border-red-900/40 dark:bg-[#2c1c21]"
          : "border-gray-200 bg-gray-50/80 dark:border-zinc-700 dark:bg-zinc-800/40"
        }`}
    >
      {/* Question header */}
      <div className="mb-3.5 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gray-200/70 text-xs font-extrabold text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">
          {index + 1}
        </span>
        <p className="flex-1 text-sm font-bold leading-snug text-gray-900 dark:text-zinc-100">
          {a.questionText}
        </p>
        <span className="shrink-0">
          {a.isCorrect === true ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 size={18} className="text-emerald-500" />
            </span>
          ) : a.isCorrect === false ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-red-600  dark:text-red-400">
              <XCircle size={18} className="text-red-500" />
            </span>
          ) : (
            <span className="text-xs font-bold text-gray-400">—</span>
          )}
        </span>
      </div>

      {/* Answer detail */}
      {a.questionType === "open" || a.questionType === "fillblank" ? (
        <div className="flex flex-col gap-1.5 pl-10">
          <p className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {a.textAnswer || "—"}
          </p>
          {a.isCorrect === null && (
            <p className="px-1 text-xs text-gray-400">Tekshiruv yakunlanmadi</p>
          )}
          {a.isCorrect === false && a.correctAnswer && (
            <p className="px-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              To'g'ri javob: <span className="font-bold">{a.correctAnswer}</span>
            </p>
          )}
        </div>
      ) : a.questionType === "slider" ? (
        <div className="flex items-center gap-2 pl-10 text-xs">
          <span className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-800 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            Javob: <span className="font-bold">{a.textAnswer || "—"}</span>
          </span>
          {a.isCorrect === false && a.correctAnswer && (
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              To'g'ri: <span className="font-bold">{a.correctAnswer}</span>
            </span>
          )}
        </div>
      ) : a.questionType === "droppin" ? (
        <div className="pl-10">
          {a.imageUrl ? (
            (() => {
              const imgSrc = a.imageUrl.startsWith("http")
                ? a.imageUrl
                : `${BACKEND}${a.imageUrl}`;
              const student = a.textAnswer?.split(",").map(Number);
              const correct = a.correctAnswer?.split(",").map(Number);
              return (
                <div className="relative inline-block w-full max-w-xs overflow-hidden rounded-2xl border border-gray-200 shadow-xs dark:border-zinc-700">
                  <img src={imgSrc} alt="" className="w-full" />
                  {student && student.length === 2 && !isNaN(student[0]) && (
                    <div
                      style={{
                        left: `${student[0] * 100}%`,
                        top: `${student[1] * 100}%`,
                      }}
                      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow-md"
                    />
                  )}
                  {correct && correct.length === 2 && a.isCorrect === false && (
                    <div
                      style={{
                        left: `${correct[0] * 100}%`,
                        top: `${correct[1] * 100}%`,
                      }}
                      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-md"
                    />
                  )}
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-gray-400">Rasm yo'q</p>
          )}
        </div>
      ) : a.questionType === "matching" ? (
        <div className="flex flex-col gap-1.5 pl-10">
          {(() => {
            const lefts = (a.options ?? []).filter((o) => o.isCorrectOption);
            const rights = (a.options ?? []).filter((o) => !o.isCorrectOption);
            const studentPairs = new Map<string, string>();
            for (let i = 0; i < a.selectedOptionIds.length; i += 2) {
              studentPairs.set(
                a.selectedOptionIds[i],
                a.selectedOptionIds[i + 1],
              );
            }
            return lefts.map((left, idx) => {
              const correctRight = rights[idx];
              const studentRightId = studentPairs.get(left.id);
              const studentRight = (a.options ?? []).find(
                (o) => o.id === studentRightId,
              );
              const pairCorrect = studentRightId === correctRight?.id;
              return (
                <div
                  key={left.id}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold ${pairCorrect
                    ? "bg-emerald-500 text-white shadow-xs"
                    : "bg-red-500 text-white shadow-xs"
                    }`}
                >
                  <span>{left.text}</span>
                  <span className="opacity-70">→</span>
                  {pairCorrect ? (
                    <span>{correctRight?.text}</span>
                  ) : (
                    <>
                      <span className="line-through opacity-80">
                        {studentRight?.text ?? "—"}
                      </span>
                      <span className="ml-1 text-emerald-200">
                        ({correctRight?.text})
                      </span>
                    </>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ) : a.options && a.options.length > 0 ? (
        <div className="flex flex-col gap-2 pl-10">
          {a.options.map((opt) => {
            const selected = a.selectedOptionIds.includes(opt.id);
            const isCorrect = opt.isCorrectOption;
            if (isCorrect) {
              return (
                <div
                  key={opt.id}
                  className="flex items-center gap-3 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs"
                >
                  <Circle
                    size={14}
                    className="shrink-0 fill-white text-white"
                  />
                  <span>{opt.text}</span>
                </div>
              );
            }
            if (selected) {
              return (
                <div
                  key={opt.id}
                  className="flex items-center gap-3 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs"
                >
                  <Circle
                    size={14}
                    className="shrink-0 fill-white text-white"
                  />
                  <span>{opt.text}</span>
                </div>
              );
            }
            return (
              <div
                key={opt.id}
                className="flex items-center gap-3 px-4 py-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400"
              >
                <Circle
                  size={14}
                  className="shrink-0 text-gray-400 dark:text-zinc-600"
                />
                <span>{opt.text}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
