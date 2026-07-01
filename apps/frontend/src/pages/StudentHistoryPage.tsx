import { useEffect, useState } from 'react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMySubmissions, type Submission } from '../api/submissions';

export function StudentHistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetMySubmissions()
      .then(setSubmissions)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Testlar tarixi</h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-5 text-sm text-gray-400 text-center">Yuklanmoqda...</p>
          ) : submissions.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">Hali ishlangan testlar yo'q.</p>
          ) : submissions.map((submission) => {
            const percent = submission.total ? Math.round(((submission.score ?? 0) / submission.total) * 100) : 0;
            return (
              <div key={submission.id} className="px-4 py-3 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{submission.testName ?? 'Test'}</p>
                  <p className="text-xs text-gray-400">
                    {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : 'Topshirilmagan'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-indigo-600">{submission.score ?? 0} / {submission.total ?? 0}</p>
                  <p className="text-xs text-gray-400">{percent}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
