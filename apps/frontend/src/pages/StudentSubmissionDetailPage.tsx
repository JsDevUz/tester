import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Clock } from "lucide-react";
import { Toolbar } from "../components/Toolbar";
import { AnswerResultCard } from "../components/AnswerResultCard";
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
    <div className="min-h-screen bg-[#f6f6f6] flex flex-col">
      <Toolbar />
      <main className="flex-1 w-full px-4 py-5 lg:px-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft size={16} />
          Natijalar
        </button>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-400 py-12">
            Natija topilmadi.
          </p>
        )}

        {detail && (
          <>
            <section className="bg-white rounded-2xl px-5 py-4 mb-4">
              <p className="text-lg font-bold text-gray-900">
                {detail.testName ?? "Test"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {detail.score} / {detail.total} ball · {pct}%
              </p>
            </section>

            {!canShowAnswers && (
              <section className="bg-white rounded-2xlflex flex-col items-center text-center py-12 px-5">
                <Clock size={32} className="text-indigo-300 mb-3" />
                <p className="text-sm text-gray-500">
                  {detail.showResults === "after_deadline"
                    ? "Natijalar muddat tugagandan keyin ochiladi."
                    : "Natijalar yashirin."}
                </p>
              </section>
            )}

            {canShowAnswers && detail.answers.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">
                Javoblar topilmadi.
              </p>
            )}

            {canShowAnswers && (
              <div className="flex flex-col gap-3 pb-8">
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
      </main>
    </div>
  );
}
