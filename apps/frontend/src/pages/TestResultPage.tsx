import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Circle, Clock, Trophy, BookOpen, ThumbsUp } from 'lucide-react';
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

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? '';

export function TestResultPage() {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const sid = searchParams.get('sid');
    const raw = sessionStorage.getItem('submissionResult');
    const cachedResult = getCachedSubmissionResult(raw, sid);
    if (cachedResult) {
      setResult(cachedResult);
      sessionStorage.removeItem('submissionResult');
      return;
    }
    if (raw) sessionStorage.removeItem('submissionResult');
    if (sid) {
      apiGetSubmissionResult(sid).then(setResult).catch(() => {});
    }
  }, []);

  if (!result) return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <p className="text-gray-400">Natija topilmadi.</p>
    </div>
  );

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const isGood = pct >= 70;
  const isMid = pct >= 40 && pct < 70;

  return (
    <div
      className="flex flex-col bg-white notranslate"
      translate="no"
      style={{ minHeight: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
    >
      {/* Top accent bar */}
      <div className="shrink-0 h-1 bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400" />

      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">

        {/* Score hero */}
        {result.showResults === 'immediately' ? (
          <>
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-4 ${
                isGood ? 'bg-green-50' : isMid ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                {isGood
                  ? <Trophy size={40} className="text-green-400" />
                  : isMid
                  ? <ThumbsUp size={40} className="text-amber-400" />
                  : <BookOpen size={40} className="text-red-300" />}
              </div>
              <p className={`text-5xl font-black mb-1 ${
                isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'
              }`}>{pct}%</p>
              <p className="text-gray-400 text-sm">{result.score} / {result.total} ta to'g'ri</p>
            </div>

            {/* Answers list */}
            <div className="flex flex-col gap-3">
              {result.answers.map((a, i) => (
                <div key={a.questionId} className={`rounded-2xl border-2 px-4 py-4 ${
                  a.isCorrect === true ? 'border-green-100 bg-green-50/50' :
                  a.isCorrect === false ? 'border-red-100 bg-red-50/50' :
                  'border-gray-100 bg-gray-50/50'
                }`}>
                  {/* Question header */}
                  <div className="flex items-start gap-3 mb-3">
                    <span className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="flex-1 text-sm font-semibold text-gray-800 leading-snug">{a.questionText}</p>
                    <span className="shrink-0">
                      {a.isCorrect === true
                        ? <CheckCircle2 size={18} className="text-green-500" />
                        : a.isCorrect === false
                        ? <XCircle size={18} className="text-red-400" />
                        : <span className="text-gray-300 text-xs">—</span>}
                    </span>
                  </div>

                  {/* Answer detail */}
                  {(a.questionType === 'open' || a.questionType === 'fillblank') ? (
                    <div className="pl-9 flex flex-col gap-1">
                      <p className="text-xs italic text-gray-600 bg-white/80 px-3 py-2 rounded-xl border border-gray-100">
                        {a.textAnswer || '—'}
                      </p>
                      {a.isCorrect !== true && a.correctAnswer && (
                        <p className="text-xs text-green-600 px-1">To'g'ri: <span className="font-medium">{a.correctAnswer}</span></p>
                      )}
                    </div>
                  ) : a.questionType === 'slider' ? (
                    <div className="pl-9 text-xs text-gray-600 flex items-center gap-2">
                      <span className="bg-white/80 border border-gray-100 px-3 py-1.5 rounded-xl">
                        Javob: <span className="font-medium">{a.textAnswer || '—'}</span>
                      </span>
                      {a.isCorrect === false && a.correctAnswer && (
                        <span className="text-green-600">To'g'ri: <span className="font-medium">{a.correctAnswer}</span></span>
                      )}
                    </div>
                  ) : a.questionType === 'droppin' ? (
                    <div className="pl-9">
                      {a.imageUrl ? (() => {
                        const imgSrc = a.imageUrl!.startsWith('http') ? a.imageUrl! : `${BACKEND}${a.imageUrl}`;
                        const student = a.textAnswer?.split(',').map(Number);
                        const correct = a.correctAnswer?.split(',').map(Number);
                        return (
                          <div className="relative inline-block w-full max-w-xs rounded-2xl overflow-hidden border border-gray-100">
                            <img src={imgSrc} alt="" className="w-full" />
                            {student && student.length === 2 && (
                              <div style={{ left: `${student[0] * 100}%`, top: `${student[1] * 100}%` }}
                                className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md bg-red-500" />
                            )}
                            {correct && correct.length === 2 && a.isCorrect === false && (
                              <div style={{ left: `${correct[0] * 100}%`, top: `${correct[1] * 100}%` }}
                                className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md bg-green-500" />
                            )}
                          </div>
                        );
                      })() : <p className="text-xs text-gray-400">Rasm yo'q</p>}
                    </div>
                  ) : a.questionType === 'matching' ? (
                    <div className="pl-9 flex flex-col gap-1">
                      {(() => {
                        const lefts = (a.options ?? []).filter((o) => o.isCorrectOption);
                        const rights = (a.options ?? []).filter((o) => !o.isCorrectOption);
                        return lefts.map((left, idx) => {
                          const correctRight = rights[idx];
                          const studentRightId = a.selectedOptionIds[idx * 2 + 1];
                          const studentRight = (a.options ?? []).find((o) => o.id === studentRightId);
                          const pairCorrect = studentRightId === correctRight?.id;
                          return (
                            <div key={left.id} className={`text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 ${pairCorrect ? 'bg-green-100/70 text-green-800' : 'bg-red-100/70'}`}>
                              <span className="font-medium text-gray-700">{left.text}</span>
                              <span className="text-gray-300">→</span>
                              {pairCorrect
                                ? <span className="text-green-700 font-medium">{correctRight?.text}</span>
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
                    <div className="pl-9 flex flex-col gap-1">
                      {a.options.map((opt) => {
                        const selected = a.selectedOptionIds.includes(opt.id);
                        return (
                          <div key={opt.id} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${
                            opt.isCorrectOption ? 'bg-green-100/70 text-green-700 font-medium' :
                            selected ? 'bg-red-100/70 text-red-600' :
                            'text-gray-400'
                          }`}>
                            <Circle size={8} className={`shrink-0 ${selected ? 'fill-current' : 'opacity-30'}`} />
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
        ) : result.showResults === 'after_deadline' ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center mb-5">
              <Clock size={36} className="text-indigo-400" />
            </div>
            <p className="text-xl font-bold text-gray-900 mb-2">Test topshirildi!</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Natijalar{' '}
              {result.deadline
                ? <span className="text-indigo-500 font-medium">{new Date(result.deadline).toLocaleString()}</span>
                : 'deadline'}{' '}
              dan keyin ochiladi.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-green-50 flex items-center justify-center mb-5">
              <CheckCircle2 size={36} className="text-green-400" />
            </div>
            <p className="text-xl font-bold text-gray-900 mb-2">Muvaffaqiyatli topshirildi!</p>
            <p className="text-sm text-gray-400">Test qabul qilindi.</p>
          </div>
        )}
      </div>
    </div>
  );
}
