import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Clock } from "lucide-react";
import { AnswerResultCard } from "../components/AnswerResultCard";
import { StudentShell } from "../components/student/StudentShell";
import {
  apiGetMySubmissionDetail,
  type SubmissionDetail,
} from "../api/submissions";

export function StudentSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiGetMySubmissionDetail(id)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  const pct = detail?.total
    ? Math.round(((detail.score ?? 0) / detail.total) * 100)
    : 0;
  const canShowAnswers =
    detail?.showResults === "immediately" ||
    detail?.showResults === "per_question";

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
          Natijalar
        </button>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 dark:border-white/15 border-t-indigo-600" />
          </div>
        )}

        {error && (
          <p className="py-12 text-center text-xs font-semibold text-red-400">
            Natija topilmadi.
          </p>
        )}

        {detail && (
          <>
            <section className="glass-card mb-4 rounded-3xl p-5 sm:p-6">
              <p className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                {detail.testName ?? "Test"}
              </p>
              <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                {detail.score} / {detail.total} ball · <span className="text-indigo-600 dark:text-indigo-400">{pct}%</span>
              </p>
            </section>

            {!canShowAnswers && (
              <section className="glass-card flex flex-col items-center p-8 text-center rounded-3xl">
                <Clock size={32} className="mb-3 text-[var(--text-muted)] opacity-40" />
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {detail.showResults === "after_deadline"
                    ? "Natijalar muddat tugagandan keyin ochiladi."
                    : "Natijalar yashirin."}
                </p>
              </section>
            )}

            {canShowAnswers && detail.answers.length === 0 && (
              <p className="py-8 text-center text-xs font-semibold text-[var(--text-muted)]">
                Javoblar topilmadi.
              </p>
            )}

            {canShowAnswers && (
              <div className="flex flex-col gap-2.5 pb-8">
                {detail.answers.map((answer, index) => (
                  <AnswerResultCard
                    key={answer.questionId}
                    answer={answer}
                    index={index}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}
