import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { apiGetPublicTest, apiSubmitAnswers, apiGetSubmission, type PublicTest, type PublicQuestion } from '../api/delivery';
import { getPublicBaseUrl } from '../api/baseUrl';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, pos, text }: { id: string; pos: number; text: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 select-none ${
        isDragging ? 'bg-indigo-50 border-indigo-400 shadow-lg z-50 opacity-90' : 'bg-white border-gray-200'
      }`}>
      <span className="text-gray-300 text-sm font-mono w-5 shrink-0">{pos + 1}.</span>
      <span className="flex-1 text-base text-gray-800">{text}</span>
      <span {...attributes} {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-gray-300 text-2xl px-1 select-none">
        ⠿
      </span>
    </div>
  );
}

function ReorderQuestion({ optionIds, options, onChange }: {
  optionIds: string[];
  options: { id: string; text: string }[];
  onChange: (ids: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = optionIds.indexOf(String(active.id));
    const newIdx = optionIds.indexOf(String(over.id));
    onChange(arrayMove(optionIds, oldIdx, newIdx));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={optionIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {optionIds.map((id, pos) => {
            const opt = options.find((o) => o.id === id);
            return opt ? <SortableItem key={id} id={id} pos={pos} text={opt.text} /> : null;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${BACKEND}${url}`; }

// Matching: left col shuffled, right col shuffled — user taps left then right to pair
function MatchingQuestion({ questionId: _qid, options, selected, onSelect }: {
  questionId: string;
  options: { id: string; text: string }[];
  selected: string[];
  onSelect: (ids: string[]) => void;
}) {
  const lefts = useMemo(() => [...options.filter((_, i) => i % 2 === 0)].sort(() => Math.random() - 0.5), []);
  const rights = useMemo(() => [...options.filter((_, i) => i % 2 !== 0)].sort(() => Math.random() - 0.5), []);
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);

  // selected = [leftId, rightId, leftId, rightId, ...]
  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);

  function tapLeft(id: string) {
    // remove existing pair if any
    const existingIdx = pairedLeftIds.indexOf(id);
    if (existingIdx !== -1) {
      const newSel = [...selected];
      newSel.splice(existingIdx * 2, 2);
      onSelect(newSel);
    }
    setPendingLeft(id);
  }

  function tapRight(id: string) {
    if (!pendingLeft) return;
    // remove if already paired
    const existingIdx = pairedRightIds.indexOf(id);
    const newSel = existingIdx !== -1
      ? selected.filter((_, i) => Math.floor(i / 2) !== existingIdx)
      : [...selected];
    onSelect([...newSel, pendingLeft, id]);
    setPendingLeft(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400">Chap tomondagini bosing, keyin mos o'ng tomondagini bosing</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {lefts.map((opt) => {
            const pairIdx = pairedLeftIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const isPending = pendingLeft === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => tapLeft(opt.id)}
                className={`px-3 py-2.5 rounded-xl border-2 text-sm text-left transition-colors ${
                  isPending ? 'bg-indigo-500 text-white border-indigo-500' :
                  isPaired ? 'bg-indigo-50 border-indigo-300 text-indigo-700' :
                  'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}>
                {opt.text}
                {isPaired && <span className="ml-1 text-xs text-indigo-400">↔ {pairedRightIds[pairIdx] ? rights.find(r => r.id === pairedRightIds[pairIdx])?.text : ''}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const isPaired = pairedRightIds.includes(opt.id);
            return (
              <button key={opt.id} type="button" onClick={() => tapRight(opt.id)}
                disabled={!pendingLeft && !isPaired}
                className={`px-3 py-2.5 rounded-xl border-2 text-sm text-left transition-colors ${
                  isPaired ? 'bg-green-50 border-green-300 text-green-700' :
                  pendingLeft ? 'bg-white border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50' :
                  'bg-gray-50 border-gray-100 text-gray-400'
                }`}>
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
      {selected.length > 0 && (
        <button type="button" onClick={() => { onSelect([]); setPendingLeft(null); }}
          className="text-xs text-gray-400 hover:text-red-400 self-start">Tozalash</button>
      )}
    </div>
  );
}

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

  const selectedMapRef = useRef<Record<string, string[]>>({});
  const textMapRef = useRef<Record<string, string>>({});
  const orderedQuestionsRef = useRef<PublicQuestion[]>([]);
  const submittingRef = useRef(false);

  useEffect(() => { selectedMapRef.current = selectedMap; }, [selectedMap]);
  useEffect(() => { textMapRef.current = textMap; }, [textMap]);
  useEffect(() => { orderedQuestionsRef.current = orderedQuestions; }, [orderedQuestions]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  useEffect(() => {
    if (!slug || !submissionId) return;
    apiGetSubmission(submissionId).then((sub) => {
      if (sub.status === 'submitted') {
        navigate(`/t/${slug}/result?sid=${submissionId}`, { replace: true });
      }
    }).catch(() => {
      // Submission topilmadi — entry sahifasiga qaytarish
      navigate(`/t/${slug}`, { replace: true });
    });
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
      // Pre-fill reorder questions with shuffled options
      const initSelected: Record<string, string[]> = {};
      for (const q of qsWithOpts) {
        if (q.type === 'reorder') {
          initSelected[q.id] = seededShuffle([...q.options], submissionId + q.id).map((o) => o.id);
        }
      }
      if (Object.keys(initSelected).length > 0) {
        setSelectedMap((prev) => ({ ...prev, ...initSelected }));
      }
      if (t.timeLimit) setTimeLeft(t.timeLimit * 60);
    });
  }, [slug]);

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

  useEffect(() => {
    if (timeLeft === 0) handleSubmit();
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

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

    let submitSent = false;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendSubmit();
        submitSent = true;
      } else if (document.visibilityState === 'visible' && submitSent) {
        setTimeout(() => {
          apiGetSubmission(submissionId).then((sub) => {
            if (sub.status === 'submitted') {
              navigate(`/t/${slug}/result?sid=${submissionId}`, { replace: true });
            }
          }).catch(() => {});
        }, 800);
      }
    };

    const handleBeforeUnload = () => { sendSubmit(); };

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
      submittingRef.current = false;
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

  const TYPE_BADGES: Record<string, { label: string; cls: string }> = {
    single:    { label: 'Yagona',             cls: 'bg-blue-100 text-blue-600' },
    multi:     { label: "Ko'p tanlov",        cls: 'bg-purple-100 text-purple-600' },
    open:      { label: 'Ochiq',              cls: 'bg-gray-100 text-gray-500' },
    arrange:   { label: 'Gap tuzish',         cls: 'bg-amber-100 text-amber-600' },
    truefalse: { label: "To'g'ri/Noto'g'ri", cls: 'bg-green-100 text-green-600' },
    reorder:   { label: 'Tartibga solish',    cls: 'bg-orange-100 text-orange-600' },
    matching:  { label: 'Moslashtirish',      cls: 'bg-teal-100 text-teal-600' },
    fillblank: { label: "Bo'sh joy",          cls: 'bg-pink-100 text-pink-600' },
  };


  function renderQuestion(q: PublicQuestion, idx: number) {
    const selected = selectedMap[q.id] ?? [];
    const badge = TYPE_BADGES[q.type];
    return (
      <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm text-gray-400">{idx + 1}. savol</p>
          {badge && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>}
        </div>
        <p className="text-base font-medium text-gray-800 mb-3">{q.text}</p>
        {q.imageUrl && (
          <div className="mb-3 flex justify-center">
            <img src={mediaUrl(q.imageUrl)} alt="" className="rounded-xl object-contain max-h-64 max-w-full border border-gray-100" />
          </div>
        )}
        {q.audioUrl && (
          <audio src={mediaUrl(q.audioUrl)} controls className="mb-3 w-full h-9" />
        )}
        {q.type === 'fillblank' ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Bo'sh joyni to'ldiring (<code className="bg-gray-100 px-1 rounded">___</code>):</p>
            <input
              value={textMap[q.id] ?? ''}
              onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Javobingizni yozing..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
        ) : q.type === 'matching' ? (
          <MatchingQuestion
            questionId={q.id}
            options={q.options}
            selected={selected}
            onSelect={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
          />
        ) : q.type === 'open' ? (
          <textarea
            value={textMap[q.id] ?? ''} rows={3}
            onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Javobingizni yozing..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
        ) : q.type === 'truefalse' ? (
          <div className="flex gap-3">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              const isTrue = opt.text === "To'g'ri";
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleOption(q.id, opt.id, 'single')}
                  className={`flex-1 py-4 rounded-xl border-2 text-base font-semibold transition-colors ${
                    checked
                      ? isTrue ? 'bg-green-500 text-white border-green-500' : 'bg-red-400 text-white border-red-400'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}>
                  {isTrue ? '✓ ' : '✗ '}{opt.text}
                </button>
              );
            })}
          </div>
        ) : q.type === 'reorder' ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-400 mb-1">Ushlab suring va to'g'ri tartibga soling</p>
            <ReorderQuestion
              optionIds={selected}
              options={q.options}
              onChange={(ids) => setSelectedMap((p) => ({ ...p, [q.id]: ids }))}
            />
          </div>
        ) : q.type === 'arrange' ? (
          <div className="flex flex-col gap-3">
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
