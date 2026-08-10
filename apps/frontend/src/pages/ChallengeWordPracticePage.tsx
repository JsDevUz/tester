import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Layers3, ListChecks } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiListMyChallengeWords, apiSetChallengeWordProgress, type ApiStudentChallengeWord } from '../api/challenge-words';
import { StudentShell } from '../components/student/StudentShell';

type Mode = 'flashcard' | 'test';
type Direction = 'wordToTranslation' | 'translationToWord';

export function ChallengeWordPracticePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [words, setWords] = useState<ApiStudentChallengeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction | null>(null);

  useEffect(() => {
    if (!id) return;
    void apiListMyChallengeWords(id).then(setWords).catch(() => toast.error("So'zlarni yuklab bo'lmadi"));
  }, [id]);

  if (!id) return null;
  if (!words) return <StudentShell><p className="p-6 text-sm text-gray-400">Yuklanmoqda...</p></StudentShell>;

  if (!mode || !direction) {
    return (
      <StudentShell>
        <div className="bg-white px-4 py-5 lg:rounded-2xl lg:p-6">
          <button type="button" onClick={() => navigate(`/challenges/${id}`)} className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-gray-500"><ArrowLeft size={16} /> Orqaga</button>
          <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Mashq turi</h1>
          <p className="mb-6 text-sm text-gray-400">Rejim va yo'nalishni tanlang</p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Rejim</p>
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Choice selected={mode === 'flashcard'} onClick={() => setMode('flashcard')} icon={<Layers3 size={20} />} title="Flashcard" subtitle="Kartani suring" />
            <Choice selected={mode === 'test'} onClick={() => setMode('test')} icon={<ListChecks size={20} />} title="Test" subtitle="4 variantli savol" />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Yo'nalish</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice selected={direction === 'wordToTranslation'} onClick={() => setDirection('wordToTranslation')} title="So'z → Tarjima" />
            <Choice selected={direction === 'translationToWord'} onClick={() => setDirection('translationToWord')} title="Tarjima → So'z" />
          </div>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell>
      <div className="min-h-[calc(100dvh-5rem)] bg-[#18181b] px-4 py-5 text-white lg:rounded-2xl lg:p-6">
        <button type="button" onClick={() => { setMode(null); setDirection(null); }} className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-zinc-400"><ArrowLeft size={16} /> Rejim tanlash</button>
        {mode === 'flashcard' ? <Flashcards challengeId={id} words={words} direction={direction} setDirection={setDirection} setWords={setWords} /> : <Test challengeId={id} words={words} direction={direction} setWords={setWords} />}
      </div>
    </StudentShell>
  );
}

function Choice({ selected, onClick, icon, title, subtitle }: { selected: boolean; onClick: () => void; icon?: React.ReactNode; title: string; subtitle?: string }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl p-4 text-left transition ${selected ? 'bg-gray-900 text-white' : 'student-course-card text-gray-900'}`}><span className="mb-2 block">{icon}</span><span className="block text-sm font-bold">{title}</span>{subtitle && <span className="mt-1 block text-xs opacity-60">{subtitle}</span>}</button>;
}

function Flashcards({ challengeId, words, direction, setDirection, setWords }: { challengeId: string; words: ApiStudentChallengeWord[]; direction: Direction; setDirection: (value: Direction) => void; setWords: (words: ApiStudentChallengeWord[]) => void }) {
  const [deck, setDeck] = useState(() => words.filter((word) => !word.known));
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'known' | 'again' | null>(null);
  const startX = useRef(0);
  const current = deck[0];

  async function commit(known: boolean) {
    if (!current || exiting) return;
    setExiting(known ? 'known' : 'again');
    setDragX(known ? window.innerWidth : 0);
    try {
      await apiSetChallengeWordProgress(challengeId, current.id, known);
      setWords(words.map((word) => word.id === current.id ? { ...word, known } : word));
      window.setTimeout(() => {
        setDeck((oldDeck) => {
          const [head, ...rest] = oldDeck;
          return known ? rest : [...rest, head];
        });
        setDragX(0);
        setRevealed(false);
        setExiting(null);
      }, 260);
    } catch {
      toast.error("Natijani saqlab bo'lmadi");
      setDragX(0);
      setExiting(null);
    }
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startX.current = event.clientX;
    setDragging(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragging) setDragX(event.clientX - startX.current);
  }

  function pointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) >= 35) void commit(dragX > 0);
    else setDragX(0);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5 text-center"><h1 className="text-xl font-black">✦ So'z yodlash</h1><p className="mt-1 text-[10px] font-bold tracking-[0.16em] text-zinc-500">CHAPGA — TAKRORLASH · O'NGGA — BILAMAN</p></div>
      <div className="mx-auto mb-5 grid max-w-sm grid-cols-3 gap-2 text-center"><Stat label="Umumiy" value={words.length} color="text-zinc-300" /><Stat label="Qolgan" value={deck.length} color="text-violet-400" /><Stat label="Bilaman" value={words.filter((word) => word.known).length} color="text-emerald-400" /></div>
      <div className="mx-auto mb-6 flex max-w-xs rounded-full bg-zinc-800 p-1 text-xs font-bold"><button type="button" onClick={() => setDirection('wordToTranslation')} className={`flex-1 rounded-full py-2 ${direction === 'wordToTranslation' ? 'bg-violet-500 text-white' : 'text-zinc-500'}`}>So'z</button><button type="button" onClick={() => setDirection('translationToWord')} className={`flex-1 rounded-full py-2 ${direction === 'translationToWord' ? 'bg-violet-500 text-white' : 'text-zinc-500'}`}>Tarjima</button></div>
      {!current ? <div className="py-20 text-center"><p className="text-2xl font-black">🎉 Tugadi!</p><p className="mt-2 text-sm text-zinc-500">Barcha so'zlar yodlandi</p></div> : (
        <div className="relative mx-auto h-[360px] max-w-sm touch-none select-none">
          {deck.slice(1, 7).reverse().map((word, reverseIndex, stack) => { const depth = stack.length - reverseIndex; const tilt = (((word.id.charCodeAt(0) + word.id.charCodeAt(word.id.length - 1)) % 9) - 4) * 0.7; return <div key={word.id} className="absolute inset-0 rounded-[2rem] border border-zinc-700 bg-zinc-800" style={{ transform: `translateY(${depth * 6}px) scale(${1 - depth * 0.025}) rotate(${tilt}deg)`, opacity: 1 - depth * 0.08 }} />; })}
          <div onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => !dragging && Math.abs(dragX) < 5 && setRevealed((value) => !value)} className={`absolute inset-0 flex cursor-grab flex-col items-center justify-center rounded-[2rem] border border-zinc-600 bg-zinc-100 p-8 text-center text-zinc-900 shadow-2xl ${exiting === 'again' ? 'scale-90 opacity-0' : ''}`} style={{ transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`, transition: dragging ? 'none' : 'transform 260ms ease, opacity 260ms ease' }}>
            {dragX > 15 && <span className="absolute left-5 top-5 rotate-[-8deg] rounded border-2 border-emerald-500 px-2 py-1 text-sm font-black text-emerald-600">BILAMAN ✓</span>}{dragX < -15 && <span className="absolute right-5 top-5 rotate-[8deg] rounded border-2 border-rose-500 px-2 py-1 text-sm font-black text-rose-600">YANA ✗</span>}
            <p className="text-3xl font-black">{direction === 'wordToTranslation' ? current.word : current.translation}</p>
            {revealed ? <p className="mt-8 border-t border-zinc-300 pt-6 text-xl font-bold text-violet-600">{direction === 'wordToTranslation' ? current.translation : current.word}</p> : <p className="mt-8 text-[10px] font-black tracking-[0.18em] text-zinc-400">JAVOBNI KO'RSATISH</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) { return <div className="rounded-2xl bg-zinc-800 px-2 py-3"><p className={`text-xl font-black ${color}`}>{value}</p><p className="text-[10px] text-zinc-500">{label}</p></div>; }

function Test({ challengeId, words, direction, setWords }: { challengeId: string; words: ApiStudentChallengeWord[]; direction: Direction; setWords: (words: ApiStudentChallengeWord[]) => void }) {
  const [queue] = useState(() => [...words].sort((a, b) => a.id.localeCompare(b.id)));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const current = queue[index];
  const options = useMemo(() => {
    if (!current) return [];
    const answer = direction === 'wordToTranslation' ? current.translation : current.word;
    const pool = words.filter((word) => word.id !== current.id).map((word) => direction === 'wordToTranslation' ? word.translation : word.word).filter((value, position, all) => value !== answer && all.indexOf(value) === position);
    const seeded = [...pool].sort((a, b) => `${current.id}:${a}`.localeCompare(`${current.id}:${b}`)).slice(0, 3);
    return [answer, ...seeded].sort((a, b) => `${current.id}:${a}`.localeCompare(`${current.id}:${b}`));
  }, [current, direction, words]);

  if (!current) return <div className="py-20 text-center"><p className="text-2xl font-black">Natija: {correctCount}/{queue.length}</p><p className="mt-2 text-zinc-500">to'g'ri javob</p></div>;
  const question = direction === 'wordToTranslation' ? current.word : current.translation;
  const answer = direction === 'wordToTranslation' ? current.translation : current.word;
  async function choose(option: string) {
    if (selected) return;
    setSelected(option);
    const known = option === answer;
    if (known) setCorrectCount((count) => count + 1);
    try { await apiSetChallengeWordProgress(challengeId, current.id, known); setWords(words.map((word) => word.id === current.id ? { ...word, known } : word)); }
    catch { toast.error("Natijani saqlab bo'lmadi"); }
    window.setTimeout(() => { setSelected(null); setIndex((value) => value + 1); }, 700);
  }
  return <div className="mx-auto max-w-md"><p className="text-center text-xs font-bold text-zinc-500">{index + 1} / {queue.length}</p><h1 className="my-8 text-center text-3xl font-black">{question}</h1><div className="grid gap-3">{options.map((option, optionIndex) => { const correct = option === answer; const chosen = option === selected; const state = selected ? correct ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : chosen ? 'border-rose-500 bg-rose-500/20 text-rose-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400' : 'border-zinc-700 bg-zinc-800 hover:border-violet-500'; return <button key={`${option}-${optionIndex}`} type="button" disabled={!!selected} onClick={() => void choose(option)} className={`rounded-2xl border p-4 text-left text-sm font-bold transition ${state}`}>{option}</button>; })}</div></div>;
}
