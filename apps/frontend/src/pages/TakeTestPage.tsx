import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiGetPublicTest, apiSubmitAnswers, type PublicTest, type PublicQuestion } from '../api/delivery';

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

  async function handleSubmit() {
    if (submitting || !test) return;
    setSubmitting(true);
    const answers = orderedQuestions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selectedMap[q.id] ?? [],
      textAnswer: textMap[q.id] ?? null,
    }));
    try {
      const result = await apiSubmitAnswers(submissionId, answers);
      sessionStorage.setItem('submissionResult', JSON.stringify(result));
      navigate(`/t/${slug}/result`);
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
        <p className="text-xs text-gray-400 mb-1">{idx + 1}. savol</p>
        <p className="text-sm font-medium text-gray-800 mb-4">{q.text}</p>
        {q.type === 'open' ? (
          <textarea
            value={textMap[q.id] ?? ''} rows={3}
            onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Javobingizni yozing..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleOption(q.id, opt.id, q.type as 'single' | 'multi')}
                  className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${checked ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-700 hover:border-indigo-300'}`}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{test.name}</span>
        {timeLeft !== null && (
          <span className={`font-mono text-sm ${timeLeft < 60 ? 'text-red-500' : 'text-gray-500'}`}>
            ⏱ {formatTime(timeLeft)}
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
        <div className="flex justify-end gap-2 mt-2">
          {isOneByOne && !isLast ? (
            <button onClick={() => setCurrentIdx((i) => i + 1)}
              className="px-5 py-2 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600">
              Keyingi
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2 bg-green-500 text-white rounded-xl text-sm hover:bg-green-600 disabled:opacity-40">
              {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
