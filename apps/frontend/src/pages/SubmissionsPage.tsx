import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { useSubmissionStore } from '../stores/submissionStore';
import { useTestStore } from '../stores/testStore';

export function SubmissionsPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { submissions, fetchSubmissions } = useSubmissionStore();
  const { tests } = useTestStore();
  const test = tests.find((t) => t.id === testId);

  useEffect(() => {
    if (testId) fetchSubmissions(testId);
  }, [testId]);

  const shareLink = test?.slug ? `${window.location.origin}/t/${test.slug}` : '';

  async function copyLink() {
    if (shareLink) await navigator.clipboard.writeText(shareLink);
  }

  function scoreBadgeClass(score: number | null, total: number | null) {
    if (score === null || total === null || total === 0) return 'bg-gray-100 text-gray-500';
    const pct = score / total;
    if (pct >= 0.7) return 'bg-green-100 text-green-700';
    if (pct >= 0.5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-600';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← Orqaga</button>
          <span className="text-gray-400">/</span>
          <h2 className="text-sm font-medium text-gray-700">{test?.name ?? 'Test'} — Natijalar</h2>
        </div>

        {shareLink && (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-400 flex-1 truncate">{shareLink}</span>
            <button onClick={copyLink} className="text-xs text-indigo-500 hover:text-indigo-700 shrink-0">
              📋 Nusxalash
            </button>
          </div>
        )}

        {submissions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-8">Hali natijalar yo'q.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {submissions.map((sub) => (
              <div key={sub.id}
                onClick={() => navigate(`/submissions/${sub.id}`)}
                className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{sub.studentName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : 'Topshirilmagan'}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${scoreBadgeClass(sub.score, sub.total)}`}>
                  {sub.score !== null && sub.total !== null ? `${sub.score} / ${sub.total}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
