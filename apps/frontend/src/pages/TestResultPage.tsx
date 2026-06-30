import { useEffect, useState } from 'react';
import type { SubmissionResult } from '../api/delivery';

export function TestResultPage() {
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('submissionResult');
    if (raw) {
      setResult(JSON.parse(raw));
      sessionStorage.removeItem('submissionResult');
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
                <div key={a.questionId} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                  a.isCorrect === true ? 'bg-green-50 text-green-700' :
                  a.isCorrect === false ? 'bg-red-50 text-red-600' :
                  'bg-gray-50 text-gray-500'
                }`}>
                  <span className="font-medium w-5">{i + 1}.</span>
                  <span>{a.isCorrect === true ? '✓ To\'g\'ri' : a.isCorrect === false ? '✗ Noto\'g\'ri' : '— Ochiq'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {result.showResults === 'after_deadline' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium mb-2">Test topshirildi ✓</p>
            <p className="text-sm text-gray-400">
              Natijalar {result.deadline ? new Date(result.deadline).toLocaleString() : 'deadline'} dan keyin ochiladi.
            </p>
          </div>
        )}

        {result.showResults === 'hidden' && (
          <div className="text-center text-gray-600">
            <p className="text-lg font-medium">Test muvaffaqiyatli topshirildi ✓</p>
          </div>
        )}
      </div>
    </div>
  );
}
