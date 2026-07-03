import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Play, Square, CheckCircle2, Trophy } from 'lucide-react';
import { getLiveSocket, closeLiveSocket, type WsQuestion, type WsReveal, type WsState } from '../api/live';

type Phase = 'connecting' | 'lobby' | 'question' | 'reveal' | 'finished' | 'error';

export function LiveHostPage() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem('token') ?? '';

  const [phase, setPhase] = useState<Phase>('connecting');
  const [players, setPlayers] = useState<Array<{ name: string }>>([]);
  const [testName, setTestName] = useState('');
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState<WsReveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<WsReveal['leaderboard']>([]);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getLiveSocket();

    function join() {
      socket.emit('host:join', { pin, token }, (res: any) => {
        if (!res?.ok) { setPhase('error'); return; }
        const state: WsState = res.state;
        setTestName(state.testName);
        setPlayers(state.players);
        if (state.status === 'lobby') setPhase('lobby');
        else if (state.status === 'finished') {
          setLeaderboard(state.leaderboard ?? []);
          setPhase('finished');
        } else if (state.currentQuestion) { setQuestion(state.currentQuestion); setPhase('question'); }
      });
    }
    join();
    socket.on('connect', join);

    socket.on('lobby:update', (p: { players: Array<{ name: string }> }) => setPlayers(p.players));
    socket.on('question:start', (q: WsQuestion) => {
      setQuestion(q); setReveal(null); setProgress({ answered: 0, total: 0 }); setPhase('question');
    });
    socket.on('question:progress', (p: { answered: number; total: number }) => setProgress(p));
    socket.on('question:reveal', (r: WsReveal) => { setReveal(r); setPhase('reveal'); });
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

  function handleStart() {
    getLiveSocket().emit('host:start', { pin, token }, () => {});
  }
  function handleEnd() {
    getLiveSocket().emit('host:end', { pin, token }, () => {});
  }

  const remainingPct = question ? Math.max(0, (question.endsAt - now) / (question.timeSec * 1000)) * 100 : 0;

  return (
    <div className="flex flex-col bg-white notranslate" translate="no"
      style={{ minHeight: '100dvh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      <div className="shrink-0 h-1 bg-linear-to-r from-indigo-400 via-purple-400 to-pink-400" />

      {phase === 'connecting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-3 border-indigo-200 border-t-indigo-500 animate-spin" />
        </div>
      )}

      {phase === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-red-400">Sessiya topilmadi yoki tugagan.</p>
          <button onClick={() => navigate('/live')} className="text-indigo-500 text-sm font-medium">← Orqaga</button>
        </div>
      )}

      {phase === 'lobby' && (
        <div className="flex-1 flex flex-col items-center px-6 pt-10">
          <p className="text-sm text-gray-400 mb-1">{testName}</p>
          <p className="text-sm font-semibold text-gray-700 mb-3">O'yin PIN kodi</p>
          <p className="text-6xl font-black text-indigo-500 tracking-[0.2em] mb-8">{pin}</p>
          <div className="flex items-center gap-2 text-gray-500 mb-4">
            <Users size={16} />
            <span className="text-sm font-medium">{players.length} o'yinchi</span>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mb-10 max-w-md">
            {players.map((p, i) => (
              <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium">{p.name}</span>
            ))}
          </div>
          <button onClick={handleStart} disabled={players.length === 0}
            className="w-full max-w-xs py-4 bg-green-500 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100">
            <Play size={18} /> Boshlash
          </button>
        </div>
      )}

      {(phase === 'question' || phase === 'reveal') && question && (
        <div className="flex-1 flex flex-col px-5 pt-4">
          {/* Timer bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className={`h-full rounded-full transition-all ${remainingPct < 20 ? 'bg-red-400' : 'bg-indigo-500'}`}
              style={{ width: phase === 'reveal' ? '0%' : `${remainingPct}%` }} />
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-700">{question.idx + 1} / {question.total}</span>
            <span className="text-sm text-gray-400 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-400" />
              {progress.answered} / {progress.total} javob berdi
            </span>
          </div>
          <p className="text-xl font-bold text-gray-900 leading-snug mb-5">{question.text}</p>
          <div className="flex flex-col gap-2.5">
            {question.options.map((opt, i) => {
              const isCorrect = reveal?.correctOptionIds.includes(opt.id);
              const count = reveal?.distribution[opt.id] ?? 0;
              return (
                <div key={opt.id} className={`px-4 py-3.5 rounded-2xl border-2 flex items-center gap-3 ${
                  phase === 'reveal'
                    ? isCorrect ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-100 opacity-60'
                    : 'bg-white border-gray-100'
                }`}>
                  <span className="w-7 h-7 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][i]}
                  </span>
                  <span className="flex-1 text-gray-800">{opt.text}</span>
                  {phase === 'reveal' && <span className="text-sm font-semibold text-gray-500">{count}</span>}
                </div>
              );
            })}
          </div>
          {phase === 'reveal' && reveal && (
            <div className="mt-5 bg-indigo-50/50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Leaderboard</p>
              {reveal.leaderboard.map((e) => (
                <div key={e.userId} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-700 font-medium">{e.rank}. {e.name}</span>
                  <span className="text-indigo-600 font-bold">{e.score}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto pt-4 pb-2">
            <button onClick={handleEnd}
              className="w-full py-3 border-2 border-red-100 text-red-400 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors">
              <Square size={14} /> Sessiyani tugatish
            </button>
          </div>
        </div>
      )}

      {phase === 'finished' && (
        <div className="flex-1 flex flex-col items-center px-6 pt-10">
          <Trophy size={40} className="text-amber-400 mb-4" />
          <p className="text-xl font-bold text-gray-900 mb-6">Yakuniy natijalar</p>
          <div className="w-full max-w-md flex flex-col gap-2">
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
            className="mt-8 w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors">
            Bosh sahifa
          </button>
        </div>
      )}
    </div>
  );
}
