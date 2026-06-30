import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Circle, CheckCheck } from 'lucide-react';
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
                  {a.questionType === 'open' ? (
                    <p className="text-xs text-gray-500 pl-5">{a.textAnswer ?? '(javob berilmagan)'}</p>
                  ) : (
                    <div className="flex flex-col gap-1 pl-5">
                      {a.options.map((opt) => {
                        const selected = a.selectedOptionIds.includes(opt.id);
                        const correct = a.correctOptionIds.includes(opt.id);
                        return (
                          <div key={opt.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                            correct ? 'bg-green-100 text-green-700' :
                            selected ? 'bg-red-100 text-red-600' :
                            'text-gray-400'
                          }`}>
                            {selected ? <Circle size={10} className="fill-current shrink-0" /> : <Circle size={10} className="shrink-0 opacity-40" />}
                            <span>{opt.text}</span>
                            {correct && <CheckCheck size={11} className="ml-auto opacity-60 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
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
