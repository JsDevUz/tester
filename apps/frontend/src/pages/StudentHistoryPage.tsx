import { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, X, ChevronRight, Circle, Clock, Trophy, BookOpen, ThumbsUp } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMySubmissions, apiGetMySubmissionDetail, type Submission, type SubmissionDetail } from '../api/submissions';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? '';
const LIMIT = 10;

export function StudentHistoryPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  async function loadMore(reset = false) {
    if (reset) {
      offsetRef.current = 0;
      setSubmissions([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiGetMySubmissions(LIMIT, offsetRef.current);
      setSubmissions((prev) => reset ? rows : [...prev, ...rows]);
      offsetRef.current += rows.length;
      if (rows.length < LIMIT) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { loadMore(true); }, []);

  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
      loadMore(false);
    }
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await apiGetMySubmissionDetail(id));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Testlar tarixi</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Hali ishlangan testlar yo'q.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map((s) => {
              const pct = s.total ? Math.round(((s.score ?? 0) / s.total) * 100) : 0;
              const isGood = pct >= 70;
              const isMid = pct >= 40 && pct < 70;
              return (
                <button key={s.id} onClick={() => openDetail(s.id)}
                  className="w-full bg-white rounded-2xl border-2 border-gray-100 px-4 py-4 flex items-center gap-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left active:scale-[0.99]">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isGood ? 'bg-green-50' : isMid ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    {isGood
                      ? <Trophy size={18} className="text-green-400" />
                      : isMid
                      ? <ThumbsUp size={18} className="text-amber-400" />
                      : <BookOpen size={18} className="text-red-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.testName ?? 'Test'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : 'Topshirilmagan'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'}`}>
                        {pct}%
                      </p>
                      <p className="text-xs text-gray-400">{s.score ?? 0}/{s.total ?? 0}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </button>
              );
            })}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="py-2 flex justify-center">
              {loadingMore && (
                <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
              )}
              {!hasMore && submissions.length > 0 && (
                <p className="text-xs text-gray-300">Hammasi yuklandi</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail bottom sheet */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92dvh] flex flex-col">
            {/* Handle */}
            <div className="shrink-0 flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="shrink-0 flex items-start justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className="text-base font-bold text-gray-900">{detail?.testName ?? '...'}</p>
                {detail && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {detail.score} / {detail.total} ball
                    {detail.total ? ` · ${Math.round(((detail.score ?? 0) / detail.total) * 100)}%` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {detailLoading && (
                <div className="flex justify-center py-10">
                  <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
                </div>
              )}

              {detail && detail.showResults !== 'immediately' && (
                <div className="flex flex-col items-center text-center py-10">
                  <Clock size={32} className="text-indigo-300 mb-3" />
                  <p className="text-sm text-gray-500">
                    {detail.showResults === 'after_deadline'
                      ? 'Natijalar muddat tugagandan keyin ochiladi.'
                      : 'Natijalar yashirin.'}
                  </p>
                </div>
              )}

              {detail?.showResults === 'immediately' && detail.answers.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Javoblar topilmadi.</p>
              )}

              {detail?.showResults === 'immediately' && detail.answers.map((a, i) => (
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
                      {(a as any).imageUrl ? (() => {
                        const imgSrc = (a as any).imageUrl.startsWith('http') ? (a as any).imageUrl : `${BACKEND}${(a as any).imageUrl}`;
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
                        const lefts = a.options.filter((o) => o.isCorrectOption);
                        const rights = a.options.filter((o) => !o.isCorrectOption);
                        return lefts.map((left, idx) => {
                          const correctRight = rights[idx];
                          const studentRightId = a.selectedOptionIds[idx * 2 + 1];
                          const studentRight = a.options.find((o) => o.id === studentRightId);
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
                  ) : (
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
