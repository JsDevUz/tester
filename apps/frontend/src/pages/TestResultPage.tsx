import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { apiGetSubmissionResult, type SubmissionResult } from '../api/delivery';

export function getCachedSubmissionResult(raw: string | null, submissionId: string | null) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SubmissionResult;
    if (submissionId && parsed.submissionId !== submissionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const sid = searchParams.get('sid');

    // Try sessionStorage first (just submitted)
    const raw = sessionStorage.getItem('submissionResult');
    const cachedResult = getCachedSubmissionResult(raw, sid);
    if (cachedResult) {
      setResult(cachedResult);
      sessionStorage.removeItem('submissionResult');
      return;
    }
    if (raw) sessionStorage.removeItem('submissionResult');

    // Fallback: load from backend via sid param (e.g. navigated back)
    if (sid) {
      apiGetSubmissionResult(sid).then((res) => { console.log('[result]', res); setResult(res); }).catch(() => {});
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
                  {(a.questionType === 'open' || a.questionType === 'fillblank') ? (
                    <div className="pl-5 flex flex-col gap-1 mt-1">
                      <p className="text-xs italic text-gray-600">{a.textAnswer || '—'}</p>
                      {a.isCorrect === false && a.correctAnswer && a.questionType === 'fillblank' && (
                        <p className="text-xs text-green-600">To'g'ri: {a.correctAnswer}</p>
                      )}
                    </div>
                  ) : a.questionType === 'matching' ? (
                    <div className="flex flex-col gap-1 pl-5 mt-1">
                      {(() => {
                        const lefts = (a.options ?? []).filter((o) => o.isCorrectOption);
                        const rights = (a.options ?? []).filter((o) => !o.isCorrectOption);
                        return lefts.map((left, idx) => {
                          const correctRight = rights[idx];
                          const studentRightId = a.selectedOptionIds[idx * 2 + 1];
                          const studentRight = (a.options ?? []).find((o) => o.id === studentRightId);
                          const pairCorrect = studentRightId === correctRight?.id;
                          return (
                            <div key={left.id} className={`text-xs px-2 py-1.5 rounded-lg ${pairCorrect ? 'bg-green-100' : 'bg-red-50'}`}>
                              <span className="font-medium text-gray-700">{left.text}</span>
                              <span className="text-gray-400 mx-1">→</span>
                              {pairCorrect
                                ? <span className="text-green-700">{correctRight?.text}</span>
                                : <>
                                    <span className="text-red-500 line-through">{studentRight?.text ?? '—'}</span>
                                    <span className="text-green-600 ml-1">({correctRight?.text})</span>
                                  </>
                              }
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : a.options && a.options.length > 0 ? (
                    <div className="flex flex-col gap-1 pl-5 mt-1">
                      {a.options.map((opt) => {
                        const selected = a.selectedOptionIds.includes(opt.id);
                        return (
                          <div key={opt.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                            opt.isCorrectOption ? 'bg-green-100 text-green-700' :
                            selected ? 'bg-red-100 text-red-600' :
                            'text-gray-400'
                          }`}>
                            <Circle size={9} className={`shrink-0 ${selected ? 'fill-current' : 'opacity-30'}`} />
                            <span>{opt.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
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
