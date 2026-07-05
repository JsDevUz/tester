import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { AnswerResultCard } from '../components/AnswerResultCard';
import { apiGetSubmission, type SubmissionDetail } from '../api/submissions';
import { formatDateTime } from '../utils/date';

export function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (id) apiGetSubmission(id).then(setDetail).catch(() => setError(true));
  }, [id]);

  if (error) return (
    <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center">
      <p className="text-red-400">Natija topilmadi.</p>
    </div>
  );

  if (!detail) return (
    <div className="min-h-screen bg-[#f9f9f9] flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
    </div>
  );

  const pct = detail.total ? Math.round(((detail.score ?? 0) / detail.total) * 100) : 0;
  const isGood = pct >= 70;
  const isMid = pct >= 40 && pct < 70;
  const isViolation = detail.mode === 'violation';

  return (
    <AppShell>
      <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 w-full px-6 py-5">
        {/* Header */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4 transition-colors">
          <ChevronLeft size={16} /> Natijalar
        </button>

        <div className="bg-white rounded-2xl border-2 border-gray-100 px-5 py-4 flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 truncate">{detail.studentName}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {detail.submittedAt ? formatDateTime(detail.submittedAt) : 'Topshirilmagan'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-xl font-black ${isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'}`}>
              {pct}%
            </p>
            <p className="text-xs text-gray-400">{detail.score} / {detail.total}</p>
          </div>
        </div>

        {isViolation && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>Taqiqlangan harakat aniqlanganligi sababli yakunlandi.</span>
          </div>
        )}

        {/* Answers */}
        <div className="flex flex-col gap-3">
          {detail.answers.map((a, i) => (
            <AnswerResultCard key={a.questionId} answer={a} index={i} />
          ))}
          {detail.answers.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Javoblar topilmadi.</p>
          )}
        </div>
      </div>
      </div>
    </AppShell>
  );
}
