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
      className={`rounded-2xl border px-4 py-4 ${
        a.isCorrect === true
          ? "border-green-100 bg-green-50/50"
          : a.isCorrect === false
            ? "border-red-100 bg-red-50/50"
            : "border-border bg-gray-50/50"
      }`}
    >
      {/* Question header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="w-6 h-6 rounded-lg bg-whitetext-xs font-bold text-gray-500 flex items-center justify-center shrink-0 mt-0.5">
          {index + 1}
        </span>
        <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug">
          {a.questionText}
        </p>
        <span className="shrink-0">
          {a.isCorrect === true ? (
            <CheckCircle2 size={18} className="text-green-500" />
          ) : a.isCorrect === false ? (
            <XCircle size={18} className="text-red-400" />
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </span>
      </div>

      {/* Answer detail */}
      {a.questionType === "open" || a.questionType === "fillblank" ? (
        <div className="pl-9 flex flex-col gap-1">
          <p className="text-xs italic text-gray-600 bg-white/80 px-3 py-2 rounded-xl border border-border">
            {a.textAnswer || "—"}
          </p>
          {a.isCorrect === null && (
            <p className="text-xs text-gray-400 px-1">Tekshiruv yakunlanmadi</p>
          )}
          {a.isCorrect === false && a.correctAnswer && (
            <p className="text-xs text-green-600 px-1">
              To'g'ri: <span className="font-medium">{a.correctAnswer}</span>
            </p>
          )}
        </div>
      ) : a.questionType === "slider" ? (
        <div className="pl-9 text-xs text-gray-600 flex items-center gap-2">
          <span className="bg-white/80px-3 py-1.5 rounded-xl">
            Javob: <span className="font-medium">{a.textAnswer || "—"}</span>
          </span>
          {a.isCorrect === false && a.correctAnswer && (
            <span className="text-green-600">
              To'g'ri: <span className="font-medium">{a.correctAnswer}</span>
            </span>
          )}
        </div>
      ) : a.questionType === "droppin" ? (
        <div className="pl-9">
          {a.imageUrl ? (
            (() => {
              const imgSrc = a.imageUrl.startsWith("http")
                ? a.imageUrl
                : `${BACKEND}${a.imageUrl}`;
              const student = a.textAnswer?.split(",").map(Number);
              const correct = a.correctAnswer?.split(",").map(Number);
              return (
                <div className="relative inline-block w-full max-w-xs rounded-2xl overflow-hidden border border-border">
                  <img src={imgSrc} alt="" className="w-full" />
                  {student && student.length === 2 && !isNaN(student[0]) && (
                    <div
                      style={{
                        left: `${student[0] * 100}%`,
                        top: `${student[1] * 100}%`,
                      }}
                      className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-md bg-red-500"
                    />
                  )}
                  {correct && correct.length === 2 && a.isCorrect === false && (
                    <div
                      style={{
                        left: `${correct[0] * 100}%`,
                        top: `${correct[1] * 100}%`,
                      }}
                      className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-md bg-green-500"
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
        <div className="pl-9 flex flex-col gap-1">
          {(() => {
            const lefts = (a.options ?? []).filter((o) => o.isCorrectOption);
            const rights = (a.options ?? []).filter((o) => !o.isCorrectOption);
            // Talaba chap elementlarni istalgan tartibda tanlashi mumkin, shuning uchun
            // selectedOptionIds'dagi juftliklarni pozitsiya emas, ID orqali bog'laymiz.
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
                  className={`text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 ${pairCorrect ? "bg-green-100/70 text-green-800" : "bg-red-100/70"}`}
                >
                  <span className="font-medium text-gray-700">{left.text}</span>
                  <span className="text-gray-300">→</span>
                  {pairCorrect ? (
                    <span className="text-green-700 font-medium">
                      {correctRight?.text}
                    </span>
                  ) : (
                    <>
                      <span className="text-red-500 line-through">
                        {studentRight?.text ?? "—"}
                      </span>
                      <span className="text-green-600 ml-1">
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
        <div className="pl-9 flex flex-col gap-1">
          {a.options.map((opt) => {
            const selected = a.selectedOptionIds.includes(opt.id);
            return (
              <div
                key={opt.id}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
                  opt.isCorrectOption
                    ? "bg-green-100/70 text-green-700 font-medium"
                    : selected
                      ? "bg-red-100/70 text-red-600"
                      : "text-gray-400"
                }`}
              >
                <Circle
                  size={8}
                  className={`shrink-0 ${selected ? "fill-current" : "opacity-30"}`}
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
