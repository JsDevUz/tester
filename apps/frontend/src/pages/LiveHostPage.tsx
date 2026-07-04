import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Play, Square, CheckCircle2, Trophy } from 'lucide-react';
import { getLiveSocket, closeLiveSocket, type WsQuestion, type WsReveal, type WsState, type WsTeam, type WsTeamMember, type WsTeamUpdate } from '../api/live';

type Phase = 'connecting' | 'lobby' | 'team_assign' | 'question' | 'reveal' | 'finished' | 'error';

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
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [teams, setTeams] = useState<WsTeam[]>([]);
  const [unassigned, setUnassigned] = useState<WsTeamMember[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [captainDisconnectedTeamId, setCaptainDisconnectedTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
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
        else if (state.status === 'team_assign') { setIsTeamMode(true); setPhase('team_assign'); }
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
    socket.on('team:update', (u: WsTeamUpdate) => { setTeams(u.teams); setUnassigned(u.unassigned); });
    socket.on('team:captainDisconnected', (d: { teamId: string }) => setCaptainDisconnectedTeamId(d.teamId));

    timerRef.current = setInterval(() => setNow(Date.now()), 200);
    return () => {
      socket.off('connect', join);
      socket.off('lobby:update'); socket.off('question:start'); socket.off('question:progress');
      socket.off('question:reveal'); socket.off('game:finished');
      socket.off('team:update'); socket.off('team:captainDisconnected');
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
  function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    getLiveSocket().emit('host:createTeam', { pin, token, name: newTeamName.trim() }, () => {});
    setNewTeamName('');
  }
  function handleAssignPlayer(userId: string, teamId: string) {
    getLiveSocket().emit('host:assignPlayer', { pin, token, userId, teamId }, () => {});
    setSelectedPlayer(null);
  }
  function handleSetCaptain(teamId: string, userId: string) {
    getLiveSocket().emit('host:setCaptain', { pin, token, teamId, userId }, () => { setCaptainDisconnectedTeamId(null); });
  }
  function handleStartTeamGame() {
    getLiveSocket().emit('host:startTeam', { pin, token }, (res: any) => {
      if (!res?.ok && res?.code === 'TEAM_NOT_READY') {
        alert("Har bir guruhda kamida bitta sardor tayinlanishi kerak.");
      }
    });
  }

  const remainingPct = question ? Math.max(0, (question.endsAt - now) / (question.timeSec * 1000)) * 100 : 0;

  const teamsWithoutCaptain = teams.filter((t) => !t.captainUserId);
  const hasEnoughTeams = teams.length >= 2;
  const teamGameReady = hasEnoughTeams && teamsWithoutCaptain.length === 0;
  const teamGameNotReadyReason = !hasEnoughTeams
    ? "Kamida 2 ta guruh va har birida sardor kerak"
    : teamsWithoutCaptain.length > 0
      ? `${teamsWithoutCaptain.map((t) => t.name).join(', ')}'da sardor tayinlanmagan`
      : null;

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
          <p className="text-sm text-gray-400 mb-1">{testName}{isTeamMode && ' · Jamoaviy'}</p>
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

      {phase === 'team_assign' && (
        <div className="flex-1 flex flex-col px-5 pt-6 overflow-y-auto">
          <p className="text-lg font-bold text-gray-900 mb-4">Guruhlarga taqsimlash</p>

          <div className="flex gap-2 mb-5">
            <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Guruh nomi (masalan Guruh 1)"
              className="flex-1 bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400" />
            <button onClick={handleCreateTeam}
              className="px-4 py-2.5 bg-indigo-500 text-white rounded-2xl text-sm font-semibold hover:bg-indigo-600 transition-colors">
              Guruh qo'shish
            </button>
          </div>

          <p className="text-xs font-semibold text-gray-500 mb-2">Taqsimlanmagan o'quvchilar ({unassigned.length})</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {unassigned.map((p) => (
              <button key={p.userId} onClick={() => setSelectedPlayer(p.userId)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  selectedPlayer === p.userId ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-indigo-50'
                }`}>
                {p.name}
              </button>
            ))}
            {unassigned.length === 0 && <p className="text-xs text-gray-300">Hammasi taqsimlandi</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {teams.map((team) => (
              <div key={team.id} className={`rounded-2xl border-2 p-4 ${
                captainDisconnectedTeamId === team.id ? 'border-red-200 bg-red-50/50' : 'border-gray-100'
              }`}>
                <p className="font-semibold text-gray-800 mb-2">{team.name}</p>
                {captainDisconnectedTeamId === team.id && (
                  <p className="text-xs text-red-500 mb-2">Sardor uzildi — yangi sardor tayinlang</p>
                )}
                <div className="flex flex-col gap-1.5">
                  {team.members.map((m) => (
                    <button key={m.userId}
                      onClick={() => selectedPlayer ? handleAssignPlayer(selectedPlayer, team.id) : handleSetCaptain(team.id, m.userId)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                        team.captainUserId === m.userId ? 'bg-amber-50 text-amber-700 font-semibold' : 'bg-gray-50 text-gray-700 hover:bg-indigo-50'
                      }`}>
                      <span>{m.name}</span>
                      {team.captainUserId === m.userId && <span className="text-xs">Sardor</span>}
                    </button>
                  ))}
                  {team.members.length === 0 && (
                    <button onClick={() => selectedPlayer && handleAssignPlayer(selectedPlayer, team.id)}
                      className="text-xs text-gray-300 border-2 border-dashed border-gray-200 rounded-xl py-3 hover:border-indigo-200 transition-colors">
                      O'quvchini shu yerga qo'shish uchun avval yuqoridan tanlang
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pb-4">
            {teamGameNotReadyReason && (
              <p className="text-xs text-center text-amber-600 mb-2">{teamGameNotReadyReason}</p>
            )}
            <button onClick={handleStartTeamGame} disabled={!teamGameReady}
              className="w-full py-4 bg-green-500 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-green-600 disabled:opacity-40 transition-colors shadow-lg shadow-green-100">
              Boshlash
            </button>
          </div>
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
          {question.options.length > 0 && question.type !== 'droppin' ? (
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
          ) : (
            <div className="px-4 py-3.5 rounded-2xl border-2 border-gray-100 bg-gray-50 text-gray-500 text-sm">
              {phase === 'reveal'
                ? `To'g'ri javob: ${reveal?.correctAnswer ?? '—'}`
                : "O'yinchilar javob yozmoqda..."}
            </div>
          )}
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
