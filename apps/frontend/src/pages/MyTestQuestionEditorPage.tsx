import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, Pencil, Trash2, X, Image, Music, ArrowLeft } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { QuestionForm } from "../components/QuestionForm";
import { BulkImportTab } from "../components/BulkImportTab";
import { SegmentedControl } from "../components/student/SegmentedControl";
import { ConfirmDeleteModal } from "../components/course/ConfirmDeleteModal";
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
      <div className="glass-card rounded-2xl p-4 transition-all text-[var(--text-primary)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            {index + 1}. savol — tahrirlash
          </span>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
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
    <div className="glass-card rounded-2xl p-4 transition-all text-[var(--text-primary)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-xs font-bold text-[var(--text-muted)] shrink-0 mt-0.5">
            {index + 1}.
          </span>
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
              {q.text}
            </p>
            {(q.imageUrl || q.audioUrl) && (
              <div className="flex items-center gap-2 mt-1">
                {q.imageUrl && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    <Image size={11} /> Rasm
                  </span>
                )}
                {q.audioUrl && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full">
                    <Music size={11} /> Audio
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-2">
        {q.options.map((opt) => (
          <div
            key={opt.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs ${
              opt.isCorrect
                ? "bg-green-500/10 text-green-600 dark:text-green-400 font-bold"
                : "bg-black/5 dark:bg-white/5 text-[var(--text-secondary)]"
            }`}
          >
            <span
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                opt.isCorrect
                  ? "bg-green-500 text-white"
                  : "border border-black/10 dark:border-white/10"
              }`}
            >
              {opt.isCorrect && <Check size={10} strokeWidth={3} />}
            </span>
            <span className="truncate">{opt.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyTestQuestionEditorPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<StudentTestDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [tab, setTab] = useState("manual");
  const [confirmDeleteQuestion, setConfirmDeleteQuestion] = useState<Question | null>(null);

  useEffect(() => {
    if (!testId) return;
    apiGetStudentTest(testId)
      .then((t) => {
        setTest(t);
        setQuestions(t.questions ?? []);
      });
  }, [testId]);

  async function handleAddQuestion(data: SaveData) {
    if (!testId) return;
    const q = await apiAddStudentQuestion(testId, data);
    setQuestions([...questions, q]);
  }

  async function handleSaveQuestion(q: Question, data: SaveData) {
    const updated = await apiUpdateStudentQuestion(q.id, data);
    setQuestions(questions.map((item) => (item.id === q.id ? updated : item)));
  }

  async function deleteQuestion(id: string) {
    await apiDeleteStudentQuestion(id);
    setQuestions(questions.filter((item) => item.id !== id));
  }

  function questionsToBulkText(): string {
    return questions
      .map((q) => {
        const lines = [`# ${q.text}`];
        for (const o of q.options) {
          lines.push(`${o.isCorrect ? "+" : "-"} ${o.text}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
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

  return (
    <StudentShell>
      <div className="student-responsive-panel flex flex-col p-4 min-[1025px]:p-6">
        <div className="flex-1 w-full text-[var(--text-primary)]">
          <div className="flex items-center gap-2 mb-5">
            <button
              type="button"
              onClick={() => navigate(`/my-tests/${test?.folderId}`)}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} /> Testlar
            </button>
            <span className="text-xs text-[var(--text-muted)]">/</span>
            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              {test?.name ?? "Test"}
            </h2>
            <span className="text-xs text-[var(--text-muted)] font-medium ml-auto">
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

          <div className="glass-card rounded-3xl p-5 sm:p-7 mb-6 text-[var(--text-primary)]">
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
              <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
                Savollar ({questions.length})
              </h3>
              {questions.map((q, i) => (
                <InlineQuestionCard
                  key={q.id}
                  index={i}
                  question={q}
                  onSave={(data) => handleSaveQuestion(q, data)}
                  onDelete={() => setConfirmDeleteQuestion(q)}
                />
              ))}
            </div>
          )}
        </div>

        {confirmDeleteQuestion && (
          <ConfirmDeleteModal
            title="Savolni o'chirish"
            description={`"${confirmDeleteQuestion.text}" savoli o'chirilsinmi?`}
            onConfirm={() => {
              deleteQuestion(confirmDeleteQuestion.id);
              setConfirmDeleteQuestion(null);
            }}
            onClose={() => setConfirmDeleteQuestion(null)}
          />
        )}
      </div>
    </StudentShell>
  );
}
