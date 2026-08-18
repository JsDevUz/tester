import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Layers3,
  ListChecks,
  Pencil,
  RotateCcw,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { apiGetDeckBySlug, apiDeleteWordDeck } from "../api/word-decks";
import { StudentShell } from "../components/student/StudentShell";
import { SegmentedControl } from "../components/student/SegmentedControl";
import { useAuthStore } from "../stores/authStore";

type Mode = "flashcard" | "test";
type Direction = "wordToTranslation" | "translationToWord";
type PracticeWord = { id: string; word: string; translation: string; known: boolean };

export function DeckPracticePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.admin);
  const [deckInfo, setDeckInfo] = useState<{ id: string; ownerId: string } | null>(null);
  const [deckName, setDeckName] = useState("");
  const [words, setWords] = useState<PracticeWord[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [direction, setDirection] = useState<Direction>("wordToTranslation");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void apiGetDeckBySlug(slug)
      .then((deck) => {
        setDeckInfo({ id: deck.id, ownerId: deck.ownerId });
        setDeckName(deck.name);
        setWords(deck.words.map((w) => ({ ...w, known: false })));
      })
      .catch(() => toast.error("Lug'atni yuklab bo'lmadi"));
  }, [slug]);

  const isOwner = Boolean(currentUser && deckInfo && currentUser.id === deckInfo.ownerId);

  async function handleDeleteDeck() {
    if (!deckInfo) return;
    try {
      await apiDeleteWordDeck(deckInfo.id);
      toast.success("Lug'at o'chirildi");
      navigate("/my-dictionaries");
    } catch {
      toast.error("Lug'atni o'chirib bo'lmadi");
    }
  }

  if (!slug) return null;
  if (!words) {
    return (
      <StudentShell>
        <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        </div>
      </StudentShell>
    );
  }

  if (!mode) {
    return (
      <StudentShell>
        <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-6">
          <button
            type="button"
            onClick={() => navigate("/my-dictionaries")}
            className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={16} /> Orqaga
          </button>
          <h1 className="mb-1 text-2xl font-extrabold text-gray-900">{deckName}</h1>
          <p className="mb-6 text-sm text-gray-400">Rejim va yo'nalishni tanlang</p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Yo'nalish</p>
          <SegmentedControl
            value={direction}
            onChange={setDirection}
            className="mb-6"
            options={[
              { value: "wordToTranslation", label: "So'z" },
              { value: "translationToWord", label: "Tarjima" },
            ]}
          />
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Rejim</p>
          <div className="mb-6 grid grid-cols-2 gap-2">
            <Choice selected={mode === "flashcard"} onClick={() => setMode("flashcard")} icon={<Layers3 size={20} />} title="Flashcard" subtitle="Kartani suring" />
            <Choice selected={mode === "test"} onClick={() => setMode("test")} icon={<ListChecks size={20} />} title="Test" subtitle="4 variantli savol" />
          </div>

          {isOwner && deckInfo && (
            <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => navigate(`/my-dictionaries/${deckInfo.id}`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-50 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:hover:bg-indigo-950/80 transition-colors"
              >
                <Pencil size={16} /> Tahrirlash
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-3 flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/80 transition-colors"
              >
                <Trash2 size={16} /> O'chirish
              </button>
            </div>
          )}
        </div>

        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
          >
            <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
              <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">Lug'atni o'chirish</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                <span className="font-bold text-[var(--text-primary)]">"{deckName}"</span> o'chirilsinmi? Ichidagi barcha so'zlar ham o'chadi.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteDeck()}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        )}
      </StudentShell>
    );
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel min-h-[calc(100dvh-5rem)] px-4 py-5 text-gray-900 min-[1025px]:p-6 dark:text-white">
        <button
          type="button"
          onClick={() => setMode(null)}
          className="mb-5 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ArrowLeft size={16} /> Rejim tanlash
        </button>
        {mode === "flashcard" ? (
          <Flashcards words={words} direction={direction} setWords={setWords} deckName={deckName} />
        ) : (
          <Test words={words} direction={direction} setWords={setWords} />
        )}
      </div>
    </StudentShell>
  );
}

function Choice({ selected, onClick, icon, title, subtitle }: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode; title: string; subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl p-4 text-left transition-all ${selected
          ? "bg-indigo-600 text-white"
          : "student-responsive-card bg-white border border-gray-200/80 text-gray-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
        }`}
    >
      <span className="mb-2 block">{icon}</span>
      <span className="block text-sm font-bold">{title}</span>
      {subtitle && <span className="mt-0.5 block text-xs opacity-60">{subtitle}</span>}
    </button>
  );
}

function Flashcards({ words, direction, setWords, deckName }: {
  words: PracticeWord[]; direction: Direction; setWords: (words: PracticeWord[]) => void; deckName: string;
}) {
  const [deck, setDeck] = useState(() => words.filter((w) => !w.known));
  const [revealed, setRevealed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [exiting, setExiting] = useState<"again" | "known" | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [repeatCount, setRepeatCount] = useState(0);

  const startX = useRef(0);
  const startY = useRef(0);
  const isDrag = useRef(false);
  const currentRef = useRef(deck[0]);
  const wordsRef = useRef(words);

  useEffect(() => { currentRef.current = deck[0]; }, [deck]);
  useEffect(() => { wordsRef.current = words; }, [words]);

  const commit = useCallback((known: boolean) => {
    const swiped = currentRef.current;
    if (!swiped || exiting) return;

    if (!known) setRepeatCount((count) => count + 1);

    setExiting(known ? "known" : "again");
    setWords(wordsRef.current.map((w) => (w.id === swiped.id ? { ...w, known } : w)));

    setTimeout(() => {
      setDeck((oldDeck) => {
        const rest = oldDeck.filter((w) => w.id !== swiped.id);
        return known ? rest : [...rest, { ...swiped, known: false }];
      });
      setDragX(0);
      setRevealed(false);
      setExiting(null);
    }, 320);
  }, [exiting, setWords]);

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    startX.current = event.clientX;
    startY.current = event.clientY;
    isDrag.current = false;
    setDragging(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || exiting) return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (Math.hypot(dx, dy) > 8) {
      isDrag.current = true;
    }
    setDragX(dx);
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
    setDragging(false);

    if (!isDrag.current && !exiting) {
      setRevealed((r) => !r);
      setDragX(0);
      return;
    }

    if (Math.abs(dragX) < 40) {
      setDragX(0);
    } else {
      commit(dragX > 0);
    }
  }

  function resetDeck() {
    if (resetting) return;
    setResetting(true);
    const resetWords = words.map((w) => ({ ...w, known: false }));
    setWords(resetWords);
    setDeck(resetWords);
    setRevealed(false);
    setDragX(0);
    setExiting(null);
    setRepeatCount(0);
    setResetting(false);
  }

  const current = deck[0];
  if (!current) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-3xl font-black text-gray-900 dark:text-zinc-100">🎉 Tugadi!</p>
        <p className="mt-2 text-sm font-semibold text-gray-400">Barcha so'zlar yodlandi</p>
        <button
          type="button"
          disabled={resetting}
          onClick={resetDeck}
          className="mt-6 flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3.5 font-bold text-white shadow-md hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          <RotateCcw size={18} />
          <span>Qayta boshlash</span>
        </button>
      </div>
    );
  }

  const rotateDeg = (dragX / 200) * 14;
  const bilamanOpacity = dragX > 0 ? Math.min(dragX / 80, 1) : 0;
  const yanaOpacity = dragX < 0 ? Math.min(Math.abs(dragX) / 80, 1) : 0;

  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-6 select-none">
      <div className="w-full text-center">
        <h1 className="text-[20px] font-extrabold tracking-[2px] text-gray-900 dark:text-zinc-200">
          ✦ {deckName}
        </h1>
        <p className="mt-1 text-[11px] font-semibold text-gray-400">
          CHAPGA - TAKRORLASH · O'NGGA - BILAMAN
        </p>
      </div>

      <div className="mb-6 mt-4 flex w-[250px] justify-between text-center">
        <Stat label="TAKRORLASH" value={repeatCount} color="#ef4444" />
        <Stat label="QOLGAN" value={deck.length} color="#6366f1" />
        <Stat label="BILAMAN" value={words.filter((w) => w.known).length} color="#10b981" />
      </div>

      <div className="relative h-[340px] w-[280px] touch-none">
        {deck.slice(1, 6).reverse().map((w, reverseIndex, stack) => {
          const depth = stack.length - reverseIndex;
          const uid = words.findIndex((item) => item.id === w.id);
          const seed = (uid * 137 + depth * 53) % 20;
          const opacity = depth <= 1 ? 1 : Math.max(1 - (depth - 1) * 0.16, 0.15);
          return (
            <div
              key={`stack-${w.id}-${depth}`}
              className="absolute inset-0 rounded-3xl border-2 border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 pointer-events-none"
              style={{
                transform: `translateY(${-depth * 6}px) scale(${1 - depth * 0.05}) rotate(${seed - 10}deg)`,
                opacity,
                zIndex: 100 - depth,
              }}
            />
          );
        })}

        <div
          key={`top-${current.id}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-gray-200 bg-white p-6 text-center shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            zIndex: exiting === "again" ? 1 : 100,
            opacity: exiting ? 0 : 1,
            transform:
              exiting === "again"
                ? "translateX(0) translateY(90px) scale(0.6)"
                : exiting === "known"
                ? "translateX(560px) rotate(20deg)"
                : `translateX(${dragX}px) rotate(${rotateDeg}deg)`,
            transition: dragging
              ? "none"
              : exiting
              ? `transform 320ms ${exiting === "again" ? "ease-in" : "ease"}, opacity 320ms ${exiting === "again" ? "ease-in" : "ease"}`
              : "transform 350ms cubic-bezier(.34,1.56,.64,1)",
          }}
        >
          {dragX > 0 && (
            <div
              style={{ opacity: bilamanOpacity }}
              className="absolute top-4 right-4 rotate-[-10deg] rounded-xl border-2 border-emerald-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20 pointer-events-none"
            >
              <span className="text-xs font-black tracking-wider text-emerald-600">BILAMAN ✓</span>
            </div>
          )}

          {dragX < 0 && (
            <div
              style={{ opacity: yanaOpacity }}
              className="absolute top-4 left-4 rotate-[10deg] rounded-xl border-2 border-rose-500 bg-white/90 px-3 py-1 dark:bg-zinc-800/90 z-20 pointer-events-none"
            >
              <span className="text-xs font-black tracking-wider text-rose-600">YANA ✗</span>
            </div>
          )}

          <div className="flex-1 w-full h-full flex flex-col items-center justify-center pointer-events-none">
            <p className="text-center text-3xl font-extrabold text-gray-900 dark:text-zinc-100">
              {direction === "wordToTranslation" ? current.word : current.translation}
            </p>
            <div className="relative mt-4 flex min-h-6 w-full items-center justify-center">
              {revealed ? (
                <p className="text-lg text-center font-semibold text-gray-700 dark:text-zinc-200">
                  {direction === "wordToTranslation" ? current.translation : current.word}
                </p>
              ) : (
                <p className="text-[10px] font-bold tracking-[1px] text-gray-400">JAVOBNI KO'RSATISH</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={resetting}
        onClick={resetDeck}
        className="mt-6 flex items-center gap-2 rounded-full bg-white px-5 py-3 border border-gray-200 dark:bg-zinc-800 dark:border-zinc-700 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-700 cursor-pointer"
      >
        <RotateCcw size={16} color="#6366f1" className={resetting ? "animate-spin" : ""} />
        <span className="font-bold text-gray-700 dark:text-zinc-200 text-sm">Yangilash</span>
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="items-center">
      <p style={{ color }} className="text-2xl font-extrabold">{value}</p>
      <p className="text-[10px] font-bold tracking-[1px] text-gray-400">{label}</p>
    </div>
  );
}

function Test({ words, direction, setWords }: {
  words: PracticeWord[]; direction: Direction; setWords: (words: PracticeWord[]) => void;
}) {
  const [queue, setQueue] = useState(() => [...words].sort((a, b) => a.id.localeCompare(b.id)));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const current = queue[index];
  const options = useMemo(() => {
    if (!current) return [];
    const answer = direction === "wordToTranslation" ? current.translation : current.word;
    const pool = words
      .filter((word) => word.id !== current.id)
      .map((word) => (direction === "wordToTranslation" ? word.translation : word.word))
      .filter((value, position, all) => value !== answer && all.indexOf(value) === position);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const distractors = shuffled.slice(0, 3);
    const combined = [answer, ...distractors];
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, direction]);

  function restart() {
    const fresh = words.map((w) => ({ ...w, known: false }));
    setWords(fresh);
    setQueue([...fresh]);
    setIndex(0);
    setSelected(null);
    setChecked(false);
    setCorrectCount(0);
    setResults([]);
  }

  if (words.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-gray-900 dark:text-zinc-100">
        <p className="text-xl font-bold">Lug'atda so'zlar mavjud emas</p>
        <p className="mt-2 text-sm text-gray-400">Test ishlash uchun avval lug'atga so'zlar qo'shing</p>
      </div>
    );
  }

  if (!current) {
    const percentage = queue.length ? Math.round((correctCount / queue.length) * 100) : 0;
    return (
      <div className="mx-auto max-w-xl py-10 text-center text-gray-900 dark:text-zinc-100">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-400">
          <Trophy size={38} />
        </div>
        <p className="mt-5 text-sm font-semibold text-gray-400 dark:text-zinc-500">TEST YAKUNLANDI</p>
        <h1 className="mt-1 text-3xl font-black">Natijangiz</h1>
        <p className="mt-3 text-5xl font-black text-indigo-500 dark:text-indigo-400">{percentage}%</p>
        <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-4">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{correctCount}</p>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">To'g'ri</p>
          </div>
          <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 p-4">
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{queue.length - correctCount}</p>
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Noto'g'ri</p>
          </div>
        </div>
        <button
          type="button"
          onClick={restart}
          className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-600 dark:shadow-none"
        >
          <RotateCcw size={17} /> Qayta ishlash
        </button>
      </div>
    );
  }
  const question = direction === "wordToTranslation" ? current.word : current.translation;
  const answer = direction === "wordToTranslation" ? current.translation : current.word;

  function checkAnswer() {
    if (!selected || checked) return;
    const known = selected === answer;
    if (known) setCorrectCount((count) => count + 1);
    setResults((oldResults) => [...oldResults, known]);
    setChecked(true);
    setWords(words.map((word) => (word.id === current.id ? { ...word, known } : word)));
  }

  function nextQuestion() {
    setSelected(null);
    setChecked(false);
    setIndex((value) => value + 1);
  }

  const optionLabels = ["A", "B", "C", "D"];
  const progress = ((index + 1) / queue.length) * 100;

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white text-gray-900 shadow-sm ring-1 ring-gray-100">
      <div className="px-4 pt-5 sm:px-8">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-500">Savol {index + 1}/{queue.length}</span>
          <span className="font-semibold text-indigo-500">{correctCount} to'g'ri</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex gap-2 overflow-x-auto py-4">
          {queue.map((word, questionIndex) => {
            const isCurrent = questionIndex === index;
            const result = results[questionIndex];
            return (
              <span
                key={word.id}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${isCurrent ? "bg-gray-900 text-white shadow-md" : result === true ? "bg-emerald-100 text-emerald-700" : result === false ? "bg-rose-100 text-rose-600" : "border border-gray-200 bg-white text-gray-400"
                  }`}
              >
                {questionIndex + 1}
              </span>
            );
          })}
        </div>
      </div>

      <div className="border-t border-gray-100 p-4 sm:px-8 sm:py-9">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{question}</h1>
        <p className="mt-2 text-sm text-gray-400">
          {direction === "wordToTranslation" ? "To'g'ri tarjimani tanlang" : "To'g'ri so'zni tanlang"}
        </p>

        <div className="mt-7 grid gap-2">
          {options.map((option, optionIndex) => {
            const correct = option === answer;
            const chosen = option === selected;
            const state = checked
              ? chosen && correct
                ? "border-emerald-500 bg-emerald-500 text-white"
                : chosen
                  ? "border-rose-500 bg-rose-500 text-white"
                  : correct
                    ? "border-2 border-emerald-500 bg-white text-emerald-700"
                    : "border-gray-200 bg-white text-gray-400"
              : chosen
                ? "border-gray-900 bg-gray-900 text-white shadow-md"
                : "border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50";
            return (
              <button
                key={`${option}-${optionIndex}`}
                type="button"
                disabled={checked}
                onClick={() => setSelected(option)}
                className={`flex w-full items-center gap-2 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99] ${state}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${chosen ? "bg-white/20 text-white" : checked && correct ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {optionLabels[optionIndex]}
                </span>
                <span className="font-semibold leading-snug">{option}</span>
                {checked && chosen && correct && <Check size={18} className="ml-auto shrink-0" />}
                {checked && chosen && !correct && <X size={18} className="ml-auto shrink-0" />}
                {checked && !chosen && correct && <Check size={18} className="ml-auto shrink-0 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex border-t border-gray-200 bg-white px-4 pt-3 sm:px-8" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        {checked ? (
          <button
            type="button"
            onClick={nextQuestion}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition ${index === queue.length - 1 ? "bg-emerald-500 shadow-emerald-100 hover:bg-emerald-600" : "bg-indigo-500 shadow-indigo-100 hover:bg-indigo-600"}`}
          >
            {index === queue.length - 1 ? "Yakunlash" : "Keyingi"}
            {index === queue.length - 1 ? <Check size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : (
          <button
            type="button"
            disabled={!selected}
            onClick={checkAnswer}
            className="flex-1 rounded-2xl bg-indigo-500 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-600 disabled:opacity-40"
          >
            Tekshirish
          </button>
        )}
      </div>
    </div>
  );
}
