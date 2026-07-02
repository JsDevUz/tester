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
      <span className="flex-1 text-gray-800" style={{ fontSize: 'var(--q-fs, 16px)' }}>{text}</span>
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

  const COLORS = ['indigo', 'rose', 'amber', 'teal', 'violet', 'orange', 'cyan', 'pink'];
  const colorMap: Record<string, string> = {};
  pairedLeftIds.forEach((lid, i) => { colorMap[lid] = COLORS[i % COLORS.length]; });

  const colorClasses: Record<string, { left: string; right: string; dot: string }> = {
    indigo: { left: 'bg-indigo-50 border-indigo-400 text-indigo-700', right: 'bg-indigo-50 border-indigo-400 text-indigo-700', dot: 'bg-indigo-400' },
    rose:   { left: 'bg-rose-50 border-rose-400 text-rose-700',       right: 'bg-rose-50 border-rose-400 text-rose-700',       dot: 'bg-rose-400' },
    amber:  { left: 'bg-amber-50 border-amber-400 text-amber-700',    right: 'bg-amber-50 border-amber-400 text-amber-700',    dot: 'bg-amber-400' },
    teal:   { left: 'bg-teal-50 border-teal-400 text-teal-700',       right: 'bg-teal-50 border-teal-400 text-teal-700',       dot: 'bg-teal-400' },
    violet: { left: 'bg-violet-50 border-violet-400 text-violet-700', right: 'bg-violet-50 border-violet-400 text-violet-700', dot: 'bg-violet-400' },
    orange: { left: 'bg-orange-50 border-orange-400 text-orange-700', right: 'bg-orange-50 border-orange-400 text-orange-700', dot: 'bg-orange-400' },
    cyan:   { left: 'bg-cyan-50 border-cyan-400 text-cyan-700',       right: 'bg-cyan-50 border-cyan-400 text-cyan-700',       dot: 'bg-cyan-400' },
    pink:   { left: 'bg-pink-50 border-pink-400 text-pink-700',       right: 'bg-pink-50 border-pink-400 text-pink-700',       dot: 'bg-pink-400' },
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400">Chap tomondagini bosing, keyin mos o'ng tomondagini bosing</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {lefts.map((opt) => {
            const pairIdx = pairedLeftIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const isPending = pendingLeft === opt.id;
            const color = isPaired ? colorMap[opt.id] : null;
            return (
              <button key={opt.id} type="button" onClick={() => tapLeft(opt.id)}
                style={{ fontSize: 'var(--q-fs, 14px)' }}
                className={`px-3 py-2.5 rounded-xl border-2 text-left transition-colors flex items-center gap-2 ${
                  isPending ? 'bg-indigo-500 text-white border-indigo-500' :
                  color ? colorClasses[color].left :
                  'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}>
                {isPaired && color && <span className={`w-2 h-2 rounded-full shrink-0 ${colorClasses[color].dot}`} />}
                {opt.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const pairIdx = pairedRightIds.indexOf(opt.id);
            const isPaired = pairIdx !== -1;
            const leftId = isPaired ? pairedLeftIds[pairIdx] : null;
            const color = leftId ? colorMap[leftId] : null;
            return (
              <button key={opt.id} type="button" onClick={() => tapRight(opt.id)}
                disabled={!pendingLeft && !isPaired}
                style={{ fontSize: 'var(--q-fs, 14px)' }}
                className={`px-3 py-2.5 rounded-xl border-2 text-left transition-colors flex items-center gap-2 ${
                  color ? colorClasses[color].right :
                  pendingLeft ? 'bg-white border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50' :
                  'bg-gray-50 border-gray-100 text-gray-400'
                }`}>
                {isPaired && color && <span className={`w-2 h-2 rounded-full shrink-0 ${colorClasses[color].dot}`} />}
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

function SliderQuestion({
  options, value, onChange,
}: { options: { text: string }[]; value: string; onChange: (v: string) => void }) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current = value !== '' ? parseFloat(value) : Math.round((min + max) / 2);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-3xl font-bold text-indigo-600">{current}</div>
      <input
        type="range" min={min} max={max} step={step}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-indigo-500 h-2 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function DropPinQuestion({
  imageUrl, value, onChange,
}: { imageUrl: string; value: string; onChange: (v: string) => void }) {
  const pin = value ? value.split(',').map(Number) : null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
    const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
    onChange(`${x},${y}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Rasmda to'g'ri joyni bosing</p>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-gray-200 cursor-crosshair select-none"
        onClick={handleClick}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full object-contain pointer-events-none" draggable={false} />
        ) : (
          <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Rasm yo'q</div>
        )}
        {pin && (
          <div
            className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${parseFloat(pin[0].toString()) * 100}%`, top: `${parseFloat(pin[1].toString()) * 100}%` }}
          >
            <div className="w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}
      </div>
      {pin && (
        <button type="button" onClick={() => onChange('')}
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
  const [fontSize, setFontSize] = useState(16);

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
    slider:    { label: 'Slider',             cls: 'bg-cyan-100 text-cyan-600' },
    droppin:   { label: 'Drop Pin',           cls: 'bg-lime-100 text-lime-600' },
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
        <p className="font-medium text-gray-800 mb-3" style={{ fontSize: 'var(--q-fs, 16px)' }}>{q.text}</p>
        {q.imageUrl && (
          <div className="mb-3 flex justify-center">
            <img src={mediaUrl(q.imageUrl)} alt="" className="rounded-xl object-contain max-h-64 max-w-full border border-gray-100" />
          </div>
        )}
        {q.audioUrl && (
          <audio src={mediaUrl(q.audioUrl)} controls className="mb-3 w-full h-9" />
        )}
        {q.type === 'slider' ? (
          <SliderQuestion
            options={q.options}
            value={textMap[q.id] ?? ''}
            onChange={(v) => setTextMap((prev) => ({ ...prev, [q.id]: v }))}
          />
        ) : q.type === 'droppin' ? (
          <DropPinQuestion
            imageUrl={q.imageUrl ? mediaUrl(q.imageUrl) : ''}
            value={textMap[q.id] ?? ''}
            onChange={(v) => setTextMap((prev) => ({ ...prev, [q.id]: v }))}
          />
        ) : q.type === 'fillblank' ? (
          <div>
            <p className="text-xs text-gray-400 mb-2">Bo'sh joyni to'ldiring (<code className="bg-gray-100 px-1 rounded">___</code>):</p>
            <input
              value={textMap[q.id] ?? ''}
              onChange={(e) => setTextMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Javobingizni yozing..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-pink-400"
              style={{ fontSize: 'var(--q-fs, 16px)' }}
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
            className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            style={{ fontSize: 'var(--q-fs, 16px)' }}
          />
        ) : q.type === 'truefalse' ? (
          <div className="flex gap-3">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              const isTrue = opt.text === "To'g'ri";
              return (
                <button key={opt.id} type="button"
                  onClick={() => toggleOption(q.id, opt.id, 'single')}
                  style={{ fontSize: 'var(--q-fs, 16px)' }}
                  className={`flex-1 py-4 rounded-xl border-2 font-semibold transition-colors ${
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
                    style={{ fontSize: 'var(--q-fs, 16px)' }}
                    className="px-3 py-2 bg-indigo-500 text-white rounded-lg shadow-sm hover:bg-indigo-600 transition-colors">
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
                    style={{ fontSize: 'var(--q-fs, 16px)' }}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-colors">
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
                  style={{ fontSize: 'var(--q-fs, 16px)' }}
                  className={`text-left px-4 py-3 rounded-xl border transition-colors ${checked ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-200 text-gray-700 hover:border-indigo-300'}`}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50 flex flex-col notranslate" translate="no" style={{ '--q-fs': fontSize + 'px' } as React.CSSProperties}>
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 truncate flex-1">{test.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setFontSize((s) => Math.max(12, s - 2))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-base font-bold select-none">
            A-
          </button>
          <button onClick={() => setFontSize((s) => Math.min(24, s + 2))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-lg font-bold select-none">
            A+
          </button>
          {timeLeft !== null && (
            <span className={`font-mono text-sm ml-1 ${timeLeft < 60 ? 'text-red-500' : 'text-gray-500'}`}>
              <Clock size={13} className="inline mr-0.5" />{formatTime(timeLeft)}
            </span>
          )}
        </div>
      </div>
      {isOneByOne && (
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-indigo-500 transition-all"
            style={{ width: `${((currentIdx + 1) / orderedQuestions.length) * 100}%` }} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full flex flex-col gap-4 pb-28">
        {isOneByOne && (
          <p className="text-xs text-gray-400 text-right">{currentIdx + 1} / {orderedQuestions.length}</p>
        )}
        {questions.map((q, i) => renderQuestion(q, isOneByOne ? currentIdx : i))}
      </div>

      {/* Fixed bottom buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          {isOneByOne ? (
            <div className="flex gap-3">
              {currentIdx > 0 && (
                <button onClick={() => setCurrentIdx((i) => i - 1)}
                  className="px-6 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl text-base font-medium hover:bg-gray-50 shrink-0">
                  ← Oldingi
                </button>
              )}
              {!isLast ? (
                <button onClick={() => setCurrentIdx((i) => i + 1)}
                  className="flex-1 py-4 bg-indigo-500 text-white rounded-2xl text-base font-semibold hover:bg-indigo-600 shadow-md shadow-indigo-100">
                  Keyingi →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 py-4 bg-green-500 text-white rounded-2xl text-base font-semibold hover:bg-green-600 disabled:opacity-40 shadow-md shadow-green-100">
                  {submitting ? 'Topshirilmoqda...' : 'Topshirish ✓'}
                </button>
              )}
            </div>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-4 bg-green-500 text-white rounded-2xl text-base font-semibold hover:bg-green-600 disabled:opacity-40">
              {submitting ? 'Topshirilmoqda...' : 'Topshirish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
