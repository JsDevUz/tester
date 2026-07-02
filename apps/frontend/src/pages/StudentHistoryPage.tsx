import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, X, ChevronRight } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMySubmissions, apiGetMySubmissionDetail, type Submission, type SubmissionDetail } from '../api/submissions';

export function StudentHistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    apiGetMySubmissions()
      .then(setSubmissions)
      .finally(() => setLoading(false));
  }, []);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await apiGetMySubmissionDetail(id);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 p-4 max-w-3xl mx-auto w-full">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Testlar tarixi</h2>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-5 text-sm text-gray-400 text-center">Yuklanmoqda...</p>
          ) : submissions.length === 0 ? (
            <p className="p-5 text-sm text-gray-400 text-center">Hali ishlangan testlar yo'q.</p>
          ) : submissions.map((s) => {
            const percent = s.total ? Math.round(((s.score ?? 0) / s.total) * 100) : 0;
            return (
              <button key={s.id} onClick={() => openDetail(s.id)}
                className="w-full px-4 py-3 border-b border-gray-50 last:border-0 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors text-left">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.testName ?? 'Test'}</p>
                  <p className="text-xs text-gray-400">
                    {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : 'Topshirilmagan'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-600">{s.score ?? 0} / {s.total ?? 0}</p>
                    <p className="text-xs text-gray-400">{percent}%</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="text-sm font-semibold text-gray-800">{detail?.testName ?? '...'}</p>
                {detail && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {detail.score} / {detail.total} ball
                    {detail.total ? ` · ${Math.round(((detail.score ?? 0) / detail.total) * 100)}%` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {detailLoading && <p className="text-center text-sm text-gray-400 py-6">Yuklanmoqda...</p>}

              {detail && detail.showResults !== 'immediately' && (
                <p className="text-center text-sm text-gray-400 py-6">
                  {detail.showResults === 'after_deadline'
                    ? 'Natijalar muddat tugagandan keyin ochiladi.'
                    : 'Natijalar yashirin.'}
                </p>
              )}

              {detail?.showResults === 'immediately' && detail.answers.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-6">Javoblar topilmadi.</p>
              )}

              {detail?.showResults === 'immediately' && detail.answers.map((a, i) => (
                <div key={a.questionId} className={`rounded-xl px-4 py-3 text-sm ${
                  a.isCorrect === true ? 'bg-green-50' :
                  a.isCorrect === false ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs text-gray-400 shrink-0 mt-0.5">{i + 1}.</span>
                    <span className="font-medium text-gray-800 flex-1">{a.questionText}</span>
                    {a.isCorrect === true && <CheckCircle2 size={15} className="text-green-500 shrink-0 mt-0.5" />}
                    {a.isCorrect === false && <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />}
                  </div>
                  {(a.questionType === 'open' || a.questionType === 'fillblank') ? (
                    <div className="pl-4 flex flex-col gap-1">
                      <p className="text-xs text-gray-600 italic">{a.textAnswer || '—'}</p>
                      {a.isCorrect !== true && a.correctAnswer && (
                        <p className="text-xs text-green-600">To'g'ri: {a.correctAnswer}</p>
                      )}
                    </div>
                  ) : a.questionType === 'matching' ? (
                    <div className="flex flex-col gap-1 pl-4">
                      {/* matching: options come in pairs — lefts (isCorrectOption=true) and rights */}
                      {(() => {
                        const lefts = a.options.filter((o) => o.isCorrectOption);
                        const rights = a.options.filter((o) => !o.isCorrectOption);
                        return lefts.map((left, idx) => {
                          const correctRight = rights[idx];
                          const studentRightId = a.selectedOptionIds[idx * 2 + 1];
                          const studentRight = a.options.find((o) => o.id === studentRightId);
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
                  ) : a.questionType === 'slider' ? (
                    <div className="pl-4 mt-1 text-xs text-gray-600">
                      Javob: <span className="font-medium">{a.textAnswer || '—'}</span>
                      {a.isCorrect === false && a.correctAnswer && (
                        <span className="text-green-600 ml-2">To'g'ri: {a.correctAnswer}</span>
                      )}
                    </div>
                  ) : a.questionType === 'droppin' ? (
                    <div className="pl-4 mt-2">
                      {(a as any).imageUrl ? (() => {
                        const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? '';
                        const imgSrc = (a as any).imageUrl.startsWith('http') ? (a as any).imageUrl : `${BACKEND}${(a as any).imageUrl}`;
                        const student = a.textAnswer?.split(',').map(Number);
                        const correct = a.correctAnswer?.split(',').map(Number);
                        return (
                          <div className="relative inline-block w-full max-w-xs">
                            <img src={imgSrc} alt="" className="w-full rounded-xl border border-gray-100" />
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
                      })() : (
                        <p className="text-xs text-gray-400">Rasm yo'q</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 pl-4">
                      {a.options.map((opt) => {
                        const selected = a.selectedOptionIds.includes(opt.id);
                        return (
                          <div key={opt.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                            opt.isCorrectOption ? 'bg-green-100 text-green-700' :
                            selected ? 'bg-red-100 text-red-500' : 'text-gray-400'
                          }`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                              opt.isCorrectOption ? 'bg-green-400' :
                              selected ? 'bg-red-400' : 'bg-gray-200'
                            }`} />
                            {opt.text}
                            {selected && !opt.isCorrectOption && <span className="ml-auto text-[10px] text-red-400">sizning javob</span>}
                            {opt.isCorrectOption && <span className="ml-auto text-[10px] text-green-500">to'g'ri</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
