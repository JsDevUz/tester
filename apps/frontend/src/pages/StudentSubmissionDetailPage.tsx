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
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-5">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft size={16} />
          Natijalar
        </button>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {error && (
          <p className="py-12 text-center text-sm text-red-400">
            Natija topilmadi.
          </p>
        )}

        {detail && (
          <>
            <section className="student-course-card challenge-detail-card mb-4 rounded-3xl p-5">
              <p className="text-xl font-extrabold text-gray-900 dark:text-zinc-100">
                {detail.testName ?? "Test"}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-zinc-400">
                {detail.score} / {detail.total} ball · {pct}%
              </p>
            </section>

            {!canShowAnswers && (
              <section className="student-course-card challenge-detail-card flex flex-col items-center p-8 text-center rounded-3xl">
                <Clock size={32} className="mb-3 text-gray-300 dark:text-zinc-600" />
                <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">
                  {detail.showResults === "after_deadline"
                    ? "Natijalar muddat tugagandan keyin ochiladi."
                    : "Natijalar yashirin."}
                </p>
              </section>
            )}

            {canShowAnswers && detail.answers.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">
                Javoblar topilmadi.
              </p>
            )}

            {canShowAnswers && (
              <div className="flex flex-col gap-3.5 pb-8">
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
