import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { apiGetPublicTest, apiSubmitAnswers, apiGetSubmission, type PublicTest, type PublicQuestion } from '../api/delivery';
import { getPublicBaseUrl } from '../api/baseUrl';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${BACKEND}${url}`; }

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function TakeTestPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const submissionId = searchParams.get('sid') ?? '';

  const [test, setTest] = useState<PublicTest | null>(null);
  const [orderedQuestions, setOrderedQuestions] = useState<PublicQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, string[]>>({});
  const [textMap, setTextMap] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Refs for auto-submit — useState values are stale in event listeners
  const selectedMapRef = useRef<Record<string, string[]>>({});
  const textMapRef = useRef<Record<string, string>>({});
  const orderedQuestionsRef = useRef<PublicQuestion[]>([]);
  const submittingRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { selectedMapRef.current = selectedMap; }, [selectedMap]);
  useEffect(() => { textMapRef.current = textMap; }, [textMap]);
  useEffect(() => { orderedQuestionsRef.current = orderedQuestions; }, [orderedQuestions]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  useEffect(() => {
    if (!slug || !submissionId) return;
    // Guard: if already submitted, redirect to result immediately
    apiGetSubmission(submissionId).then((sub) => {
      if (sub.status === 'submitted') {
        navigate(`/t/${slug}/result?sid=${submissionId}`, { replace: true });
      }
    }).catch(() => {});
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return;
    apiGetPublicTest(slug).then((t) => {
      setTest(t);
      const qs = t.shuffleQuestions ? seededShuffle(t.questions, submissionId) : [...t.questions];
      const qsWithOpts = qs.map((q) => ({
        ...q,
        options: t.shuffleOptions ? seededShuffle(q.options, submissionId + q.id) : q.options,
      }));
      setOrderedQuestions(qsWithOpts);
      if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
    });
  }, [slug]);

  // Single effect: starts interval when timeLeft transitions from null to a value
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timeLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when timeLeft hits 0
  useEffect(() => {
    if (timeLeft === 0) handleSubmit();
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit on page hide/close
  useEffect(() => {
    if (!submissionId) return;

    const sendSubmit = () => {
      if (submittingRef.current || orderedQuestionsRef.current.length === 0) return;
      const answers = orderedQuestionsRef.current.map((q) => ({
        questionId: q.id,
        selectedOptionIds: selectedMapRef.current[q.id] ?? [],
        textAnswer: textMapRef.current[q.id] ?? null,
      }));
      const base = getPublicBaseUrl() || window.location.origin;
      const url = `${base}/public/submissions/${submissionId}/submit`;
      const body = JSON.stringify({ answers });
      try {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      } catch {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') sendSubmit();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      sendSubmit();
      e.preventDefault();
    };

    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const handleBlur = () => {
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) sendSubmit();
      }, 1000);
    };
    const handleFocus = () => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    };

    window.addEventListener('pagehide', sendSubmit);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('pagehide', sendSubmit);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (submitting || !test) return;
    submittingRef.current = true;
    setSubmitting(true);
    const answers = orderedQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMap[q.id] ?? [],
      textAnswer: textMap[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(submissionId, answers);
      sessionStorage.setItem('submissionResult', JSON.stringify(result));
      navigate(`/t/${slug}/result?sid=${submissionId}`);
    } catch {
      setSubmitting(false);
    }
  }

  function toggleOption(questionId: string, optionId: string, type: 'single' | 'multi') {
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (type === 'single') return { ...prev, [questionId]: [optionId] };
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  function arrangeAdd(questionId: string, optionId: string) {
    setSelectedMap((prev) => {
      const current = prev[questionId] ?? [];
      if (current.includes(optionId)) return prev;
      return { ...prev, [questionId]: [...current, optionId] };
    });
  }

  function arrangeRemove(questionId: string, optionId: string) {
    setSelectedMap((prev) => ({
      ...prev,
      [questionId]: (prev[questionId] ?? []).filter((id) => id !== optionId),
    }));
  }

  if (!test) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex items-center justify-center">
      <p className="text-gray-400">Yuklanmoqda...</p>
    </div>
  );

  const isOneByOne = test.oneByOne;
  const questions = isOneByOne ? [orderedQuestions[currentIdx]] : orderedQuestions;
  const isLast = currentIdx === orderedQuestions.length - 1;

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function renderQuestion(q: PublicQuestion, idx: number) {
    const selected = selectedMap[q.id] ?? [];
    return (
      <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm text-gray-400 mb-1">{idx + 1}. savol</p>
        <p className="text-base font-medium text-gray-800 mb-3">{q.text}</p>
        {q.imageUrl && (
          <div className="mb-3 flex justify-center">
            <img src={mediaUrl(q.imageUrl)} alt="" className="rounded-xl object-contain max-h-64 max-w-full border border-gray-100" />
          </div>
        )}
        {q.audioUrl && (
          <audio src={mediaUrl(q.audioUrl)} controls className="mb-3 w-full h-9" />
        )}
        {q.type === 'open' ? (
          <textarea
            value={textMap[q.id] ?? ''} rows={3}
            onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Javobingizni yozing..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        ) : q.type === 'arrange' ? (
          <div className="flex flex-col gap-3">
            {/* Answer zone — placed tokens */}
            <div className="min-h-12 p-2 border-2 border-dashed border-indigo-200 rounded-xl flex flex-wrap gap-2 items-center bg-indigo-50/30">
              {selected.length === 0 && <span className="text-xs text-gray-300 px-1">Bo'laklarni bosib joylashtiring...</span>}
              {selected.map((id) => {
                const opt = q.options.find((o) => o.id === id);
                return opt ? (
                  <button key={id} type="button"
                    onClick={() => arrangeRemove(q.id, id)}
                    className="px-3 py-2 bg-indigo-500 text-white rounded-lg text-base shadow-sm hover:bg-indigo-600 transition-colors">
                    {opt.text}
                  </button>
                ) : null;
              })}
            </div>
            {/* Token bank */}
            <div className="flex flex-wrap gap-2">
              {q.options
                .filter((o) => !selected.includes(o.id))
                .map((opt) => (
                  <button key={opt.id} type="button"
                    onClick={() => arrangeAdd(q.id, opt.id)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-base text-gray-700 shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-colors">
                    {opt.text}
                  </button>
                ))}
            </div>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelectedMap((p) => ({ ...p, [q.id]: [] }))}
                className="text-xs text-gray-400 hover:text-red-400 self-start">
                Tozalash
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleOption(q.id, opt.id, q.type as 'single' | 'multi')}
                  className={`text-left px-4 py-3 rounded-xl border text-base transition-colors ${checked ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-700 hover:border-indigo-300'}`}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col notranslate" translate="no">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="text-base font-medium text-gray-700">{test.name}</span>
        {timeLeft !== null && (
          <span className={`font-mono text-base ${timeLeft < 60 ? 'text-red-500' : 'text-gray-500'}`}>
            <Clock size={15} className="inline mr-1" />{formatTime(timeLeft)}
          </span>
        )}
      </div>
      {isOneByOne && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-indigo-500 transition-all"
            style={{ width: `${((currentIdx + 1) / orderedQuestions.length) * 100}%` }}
          />
        </div>
      )}
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-4">
        {isOneByOne && (
          <p className="text-xs text-gray-400 text-right">{currentIdx + 1} / {orderedQuestions.length}</p>
        )}
        {questions.map((q, i) => renderQuestion(q, isOneByOne ? currentIdx : i))}
        <div className="flex justify-between gap-2 mt-2">
          {isOneByOne && currentIdx > 0 ? (
            <button onClick={() => setCurrentIdx((i) => i - 1)}
              className="px-5 py-3 bg-white border border-gray-200 text-gray-600 rounded-xl text-base hover:border-gray-300">
              Oldingi
            </button>
          ) : <span />}
          {isOneByOne && !isLast ? (
            <button onClick={() => setCurrentIdx((i) => i + 1)}
              className="px-5 py-3 bg-indigo-500 text-white rounded-xl text-base hover:bg-indigo-600">
              Keyingi
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-3 bg-green-500 text-white rounded-xl text-base hover:bg-green-600 disabled:opacity-40">
              {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
