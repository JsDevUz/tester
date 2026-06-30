import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { apiGetSubmission, type SubmissionResult } from '../api/delivery';

export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    // Try sessionStorage first (just submitted)
    const raw = sessionStorage.getItem('submissionResult');
    if (raw) {
      setResult(JSON.parse(raw));
      sessionStorage.removeItem('submissionResult');
      return;
    }
    // Fallback: load from backend via sid param (e.g. navigated back)
    const sid = searchParams.get('sid');
    if (sid) {
      apiGetSubmission(sid).then((sub) => {
        if (sub.status === 'submitted') {
          setResult({
            submissionId: sid,
            score: sub.score ?? 0,
            total: sub.total ?? 0,
            showResults: sub.showResults as SubmissionResult['showResults'],
            deadline: sub.deadline,
            answers: [],
          });
        }
      }).catch(() => {});
    }
  }, []);

  if (!result) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Natija topilmadi.</p>
    </div>
  );

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex gap-1.5 mb-6">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
        </div>

        {result.showResults === 'immediately' && (
          <>
            <div className="text-center mb-6">
              <p className="text-4xl font-bold text-indigo-600">{result.score} / {result.total}</p>
              <p className="text-sm text-gray-400 mt-1">{pct}% to'g'ri</p>
            </div>
            <div className="flex flex-col gap-3">
              {result.answers.map((a, i) => (
                <div key={a.questionId} className={`rounded-xl px-4 py-3 text-sm ${
                  a.isCorrect === true ? 'bg-green-50' :
                  a.isCorrect === false ? 'bg-red-50' :
                  'bg-gray-50'
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className="font-medium text-gray-500 shrink-0">{i + 1}.</span>
                    <span className="font-medium text-gray-800 flex-1">{a.questionText}</span>
                    <span className="shrink-0">
                      {a.isCorrect === true ? <CheckCircle2 size={16} className="text-green-500" /> : a.isCorrect === false ? <XCircle size={16} className="text-red-400" /> : <span className="text-gray-300">—</span>}
                    </span>
                  </div>
                  {a.questionType === 'open' && a.textAnswer && (
                    <p className="text-xs text-gray-500 pl-5">{a.textAnswer}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {result.showResults === 'after_deadline' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium mb-2 flex items-center justify-center gap-2"><CheckCircle2 size={20} className="text-green-500" /> Test topshirildi</p>
            <p className="text-sm text-gray-400">
              Natijalar {result.deadline ? new Date(result.deadline).toLocaleString() : 'deadline'} dan keyin ochiladi.
            </p>
          </div>
        )}

        {result.showResults === 'hidden' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium flex items-center justify-center gap-2"><CheckCircle2 size={20} className="text-green-500" /> Test muvaffaqiyatli topshirildi</p>
          </div>
        )}
      </div>
    </div>
  );
}
