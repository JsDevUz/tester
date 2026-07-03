import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Hourglass, Trophy, Users } from 'lucide-react';
import { getLiveSocket, closeLiveSocket, type WsQuestion, type WsReveal, type WsState } from '../api/live';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type Phase = 'connecting' | 'lobby' | 'question' | 'waiting' | 'reveal' | 'finished' | 'error';

export function LivePlayPage() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem('token') ?? '';

  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorCode, setErrorCode] = useState('');
  const [players, setPlayers] = useState<Array<{ name: string }>>([]);
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState<WsReveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<WsReveal['leaderboard']>([]);
  const [score, setScore] = useState(0);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getLiveSocket();

    function join() {
      socket.emit('player:join', { pin, token }, (res: any) => {
        if (!res?.ok) { setErrorCode(res?.code ?? 'ERROR'); setPhase('error'); return; }
        const state: WsState = res.state;
        setPlayers(state.players);
        setScore(state.me?.score ?? 0);
        if (state.status === 'lobby') setPhase('lobby');
        else if (state.status === 'finished') {
          setLeaderboard(state.leaderboard ?? []);
          setPhase('finished');
        } else if (state.currentQuestion) {
          setQuestion(state.currentQuestion);
          if (state.status === 'reveal') setPhase('waiting');
          else setPhase(state.me?.answeredCurrent ? 'waiting' : 'question');
        }
      });
    }
    join();
    socket.on('connect', join);

    socket.on('lobby:update', (p: { players: Array<{ name: string }> }) => setPlayers(p.players));
    socket.on('question:start', (q: WsQuestion) => {
      setQuestion(q); setSelected([]); setReveal(null); setPhase('question');
    });
    socket.on('question:progress', (p: { answered: number; total: number }) => setProgress(p));
    socket.on('question:reveal', (r: WsReveal) => {
      setReveal(r);
      if (typeof r.score === 'number') setScore(r.score);
      setPhase('reveal');
    });
    socket.on('game:finished', (g: { leaderboard: WsReveal['leaderboard'] }) => {
      setLeaderboard(g.leaderboard); setPhase('finished');
    });

    timerRef.current = setInterval(() => setNow(Date.now()), 200);
    return () => {
      socket.off('connect', join);
      socket.off('lobby:update'); socket.off('question:start'); socket.off('question:progress');
      socket.off('question:reveal'); socket.off('game:finished');
      if (timerRef.current) clearInterval(timerRef.current);
      closeLiveSocket();
    };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitAnswer(ids: string[]) {
    if (!question) return;
    getLiveSocket().emit('player:answer', { pin, token, questionId: question.id, selectedOptionIds: ids }, (res: any) => {
      if (res?.ok) setPhase('waiting');
    });
  }

  function tapOption(id: string) {
    if (!question || phase !== 'question') return;
    if (question.type === 'multi') {
      setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    } else {
      submitAnswer([id]);
    }
  }

  const remainingPct = question ? Math.max(0, (question.endsAt - now) / (question.timeSec * 1000)) * 100 : 0;
  const myReveal = reveal && typeof reveal.isCorrect === 'boolean' ? reveal : null;

  return (
    <div className="flex flex-col bg-white notranslate" translate="no"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      <div className="shrink-0 h-1 bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400" />

      {phase === 'connecting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
        </div>
      )}

      {phase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-red-400 text-center">
            {errorCode === 'NOT_FOUND' ? 'Sessiya topilmadi yoki tugagan.' : "Ulanishda xato. Qayta urinib ko'ring."}
          </p>
          <button onClick={() => navigate('/live/join')} className="text-indigo-500 text-sm font-medium">← PIN kiritish</button>
        </div>
      )}

      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <Hourglass size={32} className="text-indigo-300 mb-4 animate-pulse" />
          <p className="text-lg font-bold text-gray-900 mb-2">Siz ichkaridasiz!</p>
          <p className="text-sm text-gray-400 mb-6">Ustoz o'yinni boshlashini kuting...</p>
          <div className="flex items-center gap-2 text-gray-500">
            <Users size={15} />
            <span className="text-sm">{players.length} o'yinchi</span>
          </div>
        </div>
      )}

      {(phase === 'question' || phase === 'waiting' || phase === 'reveal') && question && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 px-5 pt-3">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${remainingPct < 20 ? 'bg-red-400' : 'bg-indigo-500'}`}
                style={{ width: phase === 'reveal' ? '0%' : `${remainingPct}%` }} />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-semibold text-gray-700">{question.idx + 1} / {question.total}</span>
              <span className="text-sm font-bold text-indigo-500">{score} ball</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5">
            <p className="text-lg font-bold text-gray-900 leading-snug mb-4">{question.text}</p>
            {question.imageUrl && (
              <img src={question.imageUrl.startsWith('http') ? question.imageUrl : `${BACKEND}${question.imageUrl}`}
                alt="" className="w-full rounded-2xl object-cover mb-4" style={{ maxHeight: 200 }} />
            )}

            {phase === 'waiting' ? (
              <div className="flex flex-col items-center py-10">
                <CheckCircle2 size={36} className="text-green-400 mb-3" />
                <p className="font-semibold text-gray-800 mb-1">Javob qabul qilindi</p>
                <p className="text-sm text-gray-400">{progress.answered} / {progress.total} javob berdi</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 pb-4">
                {question.options.map((opt, i) => {
                  const isSel = selected.includes(opt.id);
                  const isCorrect = reveal?.correctOptionIds.includes(opt.id);
                  return (
                    <button key={opt.id} onClick={() => tapOption(opt.id)}
                      disabled={phase === 'reveal'}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                        phase === 'reveal'
                          ? isCorrect ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-100 opacity-60'
                          : isSel ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-gray-100 text-gray-800 hover:border-indigo-200'
                      }`}>
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSel && phase !== 'reveal' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>{LABELS[i]}</span>
                      <span className="leading-snug">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {phase === 'reveal' && myReveal && (
              <div className={`rounded-2xl px-4 py-4 mb-4 flex items-center gap-3 ${myReveal.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                {myReveal.isCorrect
                  ? <CheckCircle2 size={22} className="text-green-500 shrink-0" />
                  : <XCircle size={22} className="text-red-400 shrink-0" />}
                <div>
                  <p className={`font-semibold ${myReveal.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                    {myReveal.isCorrect ? `To'g'ri! +${myReveal.points} ball` : "Noto'g'ri"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Siz {myReveal.rank}-o'rindasiz</p>
                </div>
              </div>
            )}
          </div>

          {phase === 'question' && question.type === 'multi' && (
            <div className="shrink-0 px-5 pt-2 pb-2">
              <button onClick={() => submitAnswer(selected)} disabled={selected.length === 0}
                className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100">
                Javob berish
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'finished' && (
        <div className="flex-1 flex flex-col items-center px-6 pt-10 overflow-y-auto">
          <Trophy size={40} className="text-amber-400 mb-4" />
          <p className="text-xl font-bold text-gray-900 mb-6">O'yin tugadi!</p>
          <div className="w-full max-w-md flex flex-col gap-2 mb-8">
            {leaderboard.map((e) => (
              <div key={e.userId} className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 ${
                e.rank === 1 ? 'bg-amber-50 border-amber-200' :
                e.rank <= 3 ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white border-gray-100'
              }`}>
                <span className="font-semibold text-gray-800">{e.rank}. {e.name}</span>
                <span className="font-bold text-indigo-600">{e.score}</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/')}
            className="w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors mb-4">
            Bosh sahifa
          </button>
        </div>
      )}
    </div>
  );
}
