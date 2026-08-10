import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, Circle, Pencil, Trash2, X, Image, Music, ArrowLeft } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { QuestionForm } from "../components/QuestionForm";
import { BulkImportTab } from "../components/BulkImportTab";
import { SegmentedControl } from "../components/student/SegmentedControl";
import {
  apiGetStudentTest,
  apiAddStudentQuestion,
  apiUpdateStudentQuestion,
  apiDeleteStudentQuestion,
  type StudentTestDetail,
} from "../api/student-tests";
import type { Question } from "../api/questions";

type SaveData = {
  text: string;
  type: string;
  options: Array<{ text: string; isCorrect: boolean }>;
  imageUrl?: string | null;
  audioUrl?: string | null;
  correctAnswer?: string | null;
};

interface InlineCardProps {
  index: number;
  question: Question;
  onSave: (data: SaveData) => Promise<void>;
  onDelete: () => void;
}

function InlineQuestionCard({
  index,
  question: q,
  onSave,
  onDelete,
}: InlineCardProps) {
  const [editing, setEditing] = useState(false);

  async function handleSave(data: SaveData) {
    await onSave(data);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-300 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400">
            {index + 1}. savol — tahrirlash
          </span>
          <button
            onClick={() => setEditing(false)}
            className="text-gray-300 hover:text-gray-500"
          >
            <X size={16} />
          </button>
        </div>
        <QuestionForm
          hideAiTypes
          initial={{
            text: q.text,
            type: q.type as any,
            options: q.options,
            imageUrl: q.imageUrl,
            audioUrl: q.audioUrl,
            correctAnswer: q.correctAnswer,
          }}
          onSubmit={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-xs font-semibold text-gray-400 shrink-0 mt-0.5">
            {index + 1}.
          </span>
          <div>
            <p className="text-sm font-medium text-gray-800 leading-snug">
              {q.text}
            </p>
            {(q.imageUrl || q.audioUrl) && (
              <div className="flex items-center gap-2 mt-1">
                {q.imageUrl && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                    <Image size={11} /> Rasm
                  </span>
                )}
                {q.audioUrl && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                    <Music size={11} /> Audio
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {q.options && q.options.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-gray-50">
          {q.options.map((opt) => (
            <div
              key={opt.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${opt.isCorrect
                ? "bg-emerald-50 text-emerald-700 font-medium"
                : "bg-gray-50 text-gray-500"
                }`}
            >
              {opt.isCorrect ? (
                <Check size={13} className="text-emerald-500 shrink-0" />
              ) : (
                <Circle size={13} className="text-gray-300 shrink-0" />
              )}
              <span className="truncate">{opt.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MyTestQuestionEditorPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<StudentTestDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tab, setTab] = useState<"manual" | "bulk">("manual");

  useEffect(() => {
    if (testId) {
      void apiGetStudentTest(testId).then((t) => {
        setTest(t);
        setQuestions(t.questions ?? []);
      });
    }
  }, [testId]);

  async function handleAddQuestion(data: SaveData) {
    if (!testId) return;
    const added = await apiAddStudentQuestion(testId, {
      text: data.text,
      type: data.type as any,
      options: data.options,
      imageUrl: data.imageUrl ?? undefined,
      audioUrl: data.audioUrl ?? undefined,
      correctAnswer: data.correctAnswer ?? undefined,
    });
    setQuestions((prev) => [...prev, added]);
  }

  async function handleSaveQuestion(q: Question, data: SaveData) {
    const updated = await apiUpdateStudentQuestion(q.id, {
      text: data.text,
      type: data.type as any,
      options: data.options,
      imageUrl: data.imageUrl ?? undefined,
      audioUrl: data.audioUrl ?? undefined,
      correctAnswer: data.correctAnswer ?? undefined,
    });
    setQuestions((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
  }

  async function deleteQuestion(qId: string) {
    await apiDeleteStudentQuestion(qId);
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
  }

  async function handleBulkImport(text: string): Promise<number> {
    if (!testId) return 0;
    const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
    let count = 0;
    for (const block of blocks) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const questionText = lines[0].replace(/^#\s*/, "");
      const isMulti = lines[0].startsWith("#multi");
      const optionLines = lines.slice(1);
      const options = optionLines.map((l) => ({
        text: l.replace(/^[+-]\s*/, ""),
        isCorrect: l.startsWith("+"),
      }));
      await apiAddStudentQuestion(testId, {
        text: questionText,
        type: isMulti ? "multi" : "single",
        options,
      });
      count += 1;
    }
    if (testId) {
      void apiGetStudentTest(testId).then((t) => setQuestions(t.questions ?? []));
    }
    return count;
  }

  function questionsToBulkText(): string {
    return questions
      .map((q) => {
        const typePrefix =
          q.type === "multi" ? "#multi\n" : q.type === "open" ? "#open\n" : "";
        const optionsText = q.options
          .map((o) => `${o.isCorrect ? "+" : "-"} ${o.text}`)
          .join("\n");
        return `${typePrefix}${q.text}\n${optionsText}`;
      })
      .join("\n\n");
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel flex flex-col p-4 min-[1025px]:p-6">
        <div className="flex-1 p-3 w-full max-[1024px]:bg-transparent min-[1025px]:bg-white rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => navigate(`/my-tests/${test?.folderId}`)}
              className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft size={16} /> Testlar
            </button>
            <span className="text-gray-300">/</span>
            <h2 className="text-sm font-medium text-gray-700">
              {test?.name ?? "Test"}
            </h2>
            <span className="text-xs text-gray-400 ml-auto">
              {questions.length} ta savol
            </span>
          </div>

          <SegmentedControl
            value={tab}
            onChange={setTab}
            className="mb-5 max-w-xs"
            options={[
              { value: "manual", label: "Qo'lda kiritish" },
              { value: "bulk", label: "Ommaviy import" },
            ]}
          />

          <div>
            {tab === "manual" ? (
              <QuestionForm key="new" hideAiTypes onSubmit={handleAddQuestion} />
            ) : (
              <BulkImportTab
                onImport={handleBulkImport}
                bulkText={questionsToBulkText()}
              />
            )}
          </div>

          {questions.length > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              <h3 className="text-sm font-medium text-gray-700">
                Savollar ({questions.length})
              </h3>
              {questions.map((q, i) => (
                <InlineQuestionCard
                  key={q.id}
                  index={i}
                  question={q}
                  onSave={(data) => handleSaveQuestion(q, data)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
