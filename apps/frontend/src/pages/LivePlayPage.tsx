import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Hourglass, Trophy, Users, Crown } from 'lucide-react';
import { getLiveSocket, closeLiveSocket, type WsQuestion, type WsReveal, type WsState, type WsTeamUpdate, type WsSuggestionUpdate } from '../api/live';

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3001';
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type Phase = 'connecting' | 'lobby' | 'team_waiting' | 'question' | 'waiting' | 'reveal' | 'finished' | 'error';

function mediaUrl(url: string) { return url.startsWith('http') ? url : `${BACKEND}${url}`; }

function SliderInput({ options, value, onChange, locked }: {
  options: Array<{ text: string }>; value: string; onChange: (v: string) => void; locked?: boolean;
}) {
  const min = options[0] ? parseFloat(options[0].text) : 0;
  const max = options[1] ? parseFloat(options[1].text) : 100;
  const step = options[2] ? parseFloat(options[2].text) : 1;
  const current = value !== '' ? parseFloat(value) : Math.round((min + max) / 2);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center text-3xl font-bold text-indigo-600">{current}</div>
      <input type="range" min={min} max={max} step={step} value={current} disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-indigo-500 h-2 cursor-pointer disabled:opacity-60" />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function DropPinInput({ imageUrl, value, onChange, locked }: {
  imageUrl: string; value: string; onChange: (v: string) => void; locked?: boolean;
}) {
  const pin = value ? value.split(',').map(Number) : null;
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (locked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width).toFixed(4);
    const y = ((e.clientY - rect.top) / rect.height).toFixed(4);
    onChange(`${x},${y}`);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Rasmda to'g'ri joyni bosing</p>
      <div className={`relative w-full rounded-2xl overflow-hidden border border-gray-200 select-none ${locked ? 'cursor-default' : 'cursor-crosshair'}`}
        onClick={handleClick}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full object-contain pointer-events-none" draggable={false} />
        ) : (
          <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">Rasm yo'q</div>
        )}
        {pin && (
          <div className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${pin[0] * 100}%`, top: `${pin[1] * 100}%` }}>
            <div className="w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchingInput({ options, selected, onSelect, locked }: {
  options: Array<{ id: string; text: string }>; selected: string[]; onSelect: (ids: string[]) => void; locked?: boolean;
}) {
  const lefts = useMemo(() => [...options.filter((_, i) => i % 2 === 0)].sort(() => Math.random() - 0.5), [options]);
  const rights = useMemo(() => [...options.filter((_, i) => i % 2 !== 0)].sort(() => Math.random() - 0.5), [options]);
  const [pendingLeft, setPendingLeft] = useState<string | null>(null);

  const pairedLeftIds = selected.filter((_, i) => i % 2 === 0);
  const pairedRightIds = selected.filter((_, i) => i % 2 !== 0);

  function tapLeft(id: string) {
    if (locked) return;
    const existingIdx = pairedLeftIds.indexOf(id);
    if (existingIdx !== -1) {
      const newSel = [...selected];
      newSel.splice(existingIdx * 2, 2);
      onSelect(newSel);
    }
    setPendingLeft(id);
  }
  function tapRight(id: string) {
    if (locked || !pendingLeft) return;
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
            const isPaired = pairedLeftIds.includes(opt.id);
            const isPending = pendingLeft === opt.id;
            return (
              <button key={opt.id} type="button" onClick={() => tapLeft(opt.id)}
                className={`px-3 py-2.5 rounded-2xl border-2 text-left transition-colors text-sm ${
                  isPending ? 'bg-indigo-500 text-white border-indigo-500' :
                  isPaired ? 'bg-indigo-50 border-indigo-300 text-indigo-700' :
                  'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                } ${locked ? 'pointer-events-none' : ''}`}>
                {opt.text}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rights.map((opt) => {
            const isPaired = pairedRightIds.includes(opt.id);
            return (
              <button key={opt.id} type="button" onClick={() => tapRight(opt.id)}
                disabled={(!pendingLeft && !isPaired) || locked}
                className={`px-3 py-2.5 rounded-2xl border-2 text-left transition-colors text-sm ${
                  isPaired ? 'bg-indigo-50 border-indigo-300 text-indigo-700' :
                  pendingLeft ? 'bg-white border-gray-200 text-gray-700 hover:border-green-400 hover:bg-green-50' :
                  'bg-gray-50 border-gray-100 text-gray-400'
                }`}>
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArrangeInput({ options, selected, onSelect, locked }: {
  options: Array<{ id: string; text: string }>; selected: string[]; onSelect: (ids: string[]) => void; locked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-14 p-3 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-wrap gap-2 items-center bg-indigo-50/40">
        {selected.length === 0 && <span className="text-xs text-gray-300 px-1">Bo'laklarni bosib joylashtiring...</span>}
        {selected.map((id) => {
          const opt = options.find((o) => o.id === id);
          return opt ? (
            <button key={id} type="button" disabled={locked}
              onClick={() => onSelect(selected.filter((x) => x !== id))}
              className="px-3.5 py-2 bg-indigo-500 text-white rounded-xl shadow-sm hover:bg-indigo-600 active:scale-95 transition-all text-sm">
              {opt.text}
            </button>
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.filter((o) => !selected.includes(o.id)).map((opt) => (
          <button key={opt.id} type="button" disabled={locked}
            onClick={() => onSelect([...selected, opt.id])}
            className="px-3.5 py-2 bg-white border-2 border-gray-200 rounded-xl text-gray-700 hover:border-indigo-400 hover:text-indigo-600 active:scale-95 transition-all text-sm">
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReorderInput({ options, selected, onSelect, locked }: {
  options: Array<{ id: string; text: string }>; selected: string[]; onSelect: (ids: string[]) => void; locked?: boolean;
}) {
  const ids = selected.length > 0 ? selected : options.map((o) => o.id);
  function move(idx: number, dir: -1 | 1) {
    if (locked) return;
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[idx], next[j]] = [next[j], next[idx]];
    onSelect(next);
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400 mb-1">Tugmalar bilan to'g'ri tartibga soling</p>
      {ids.map((id, pos) => {
        const opt = options.find((o) => o.id === id);
        if (!opt) return null;
        return (
          <div key={id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border-2 bg-white border-gray-200">
            <span className="text-gray-300 text-sm font-mono w-5 shrink-0">{pos + 1}.</span>
            <span className="flex-1 text-gray-800 text-sm">{opt.text}</span>
            <div className="flex flex-col gap-0.5">
              <button type="button" disabled={locked || pos === 0} onClick={() => move(pos, -1)}
                className="text-gray-400 disabled:opacity-30 px-1">▲</button>
              <button type="button" disabled={locked || pos === ids.length - 1} onClick={() => move(pos, 1)}
                className="text-gray-400 disabled:opacity-30 px-1">▼</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LivePlayPage() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem('token') ?? '';

  const [phase, setPhase] = useState<Phase>('connecting');
  const [errorCode, setErrorCode] = useState('');
  const [players, setPlayers] = useState<Array<{ name: string }>>([]);
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState<WsReveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<WsReveal['leaderboard']>([]);
  const [score, setScore] = useState(0);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isTeamMode, setIsTeamMode] = useState(false);
  const [myTeam, setMyTeam] = useState<{ id: string; name: string; captainUserId: string | null; members: Array<{ userId: string; name: string }> } | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [suggestedOptionIds, setSuggestedOptionIds] = useState<string[]>([]);
  const [suggestionCounts, setSuggestionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const socket = getLiveSocket();

    function join() {
      socket.emit('player:join', { pin, token }, (res: any) => {
        if (!res?.ok) { setErrorCode(res?.code ?? 'ERROR'); setPhase('error'); return; }
        const state: WsState = res.state;
        setPlayers(state.players);
        setScore(state.me?.score ?? 0);
        if (state.status === 'lobby') setPhase('lobby');
        else if (state.status === 'team_assign') setPhase((prev) => prev === 'team_waiting' ? prev : 'team_waiting');
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
      setQuestion(q); setSelected([]); setTextAnswer(''); setReveal(null);
      setSuggestedOptionIds([]); setSuggestionCounts({});
      setPhase('question');
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
    socket.on('team:update', (u: WsTeamUpdate) => {
      setIsTeamMode(true);
      const myUserId = (() => {
        try { return JSON.parse(atob(token.split('.')[1])).sub as string; } catch { return null; }
      })();
      if (!myUserId) return;
      const team = u.teams.find((t) => t.members.some((m) => m.userId === myUserId));
      if (team) {
        setMyTeam({ id: team.id, name: team.name, captainUserId: team.captainUserId, members: team.members });
        setIsCaptain(team.captainUserId === myUserId);
        setPhase((prev) => (prev === 'connecting' || prev === 'lobby') ? 'team_waiting' : prev);
      } else {
        setMyTeam(null);
        setIsCaptain(false);
      }
    });
    socket.on('team:suggestionUpdate', (u: WsSuggestionUpdate) => setSuggestionCounts(u.counts));

    timerRef.current = setInterval(() => setNow(Date.now()), 200);
    return () => {
      socket.off('connect', join);
      socket.off('lobby:update'); socket.off('question:start'); socket.off('question:progress');
      socket.off('question:reveal'); socket.off('game:finished');
      socket.off('team:update'); socket.off('team:suggestionUpdate');
      if (timerRef.current) clearInterval(timerRef.current);
      closeLiveSocket();
    };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitAnswer(ids: string[], text: string | null = null) {
    if (!question) return;
    const event = isTeamMode ? 'captain:answer' : 'player:answer';
    const payload = isTeamMode
      ? { pin, token, questionId: question.id, selectedOptionIds: ids, textAnswer: text }
      : { pin, token, questionId: question.id, selectedOptionIds: ids, textAnswer: text };
    getLiveSocket().emit(event, payload, (res: any) => {
      if (res?.ok) setPhase('waiting');
    });
  }

  function tapOption(id: string) {
    if (!question || phase !== 'question') return;
    if (isTeamMode && !isCaptain) {
      tapSuggest(id);
      return;
    }
    if (question.type === 'multi' || isTeamMode) {
      setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    } else {
      submitAnswer([id]);
    }
  }

  function tapSuggest(optionId: string) {
    if (!myTeam || isCaptain) return;
    getLiveSocket().emit('member:suggest', { pin, token, teamId: myTeam.id, optionId }, () => {});
    setSuggestedOptionIds((prev) => prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]);
  }

  function renderCaptainInput() {
    if (!question) return null;
    if (question.type === 'open' || question.type === 'fillblank') {
      return (
        <div className="flex flex-col gap-3">
          <textarea id="captain-text-input" rows={3}
            placeholder="Javobni kiriting..."
            className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 text-base outline-none focus:border-indigo-400" />
          <button onClick={() => {
            const el = document.getElementById('captain-text-input') as HTMLTextAreaElement;
            submitAnswer([], el?.value ?? '');
          }} className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors">
            Javob berish
          </button>
        </div>
      );
    }
    if (question.type === 'slider') {
      return (
        <div className="flex flex-col gap-3">
          <input id="captain-slider-input" type="range" min={0} max={100} defaultValue={50} className="w-full accent-indigo-500" />
          <button onClick={() => {
            const el = document.getElementById('captain-slider-input') as HTMLInputElement;
            submitAnswer([], el?.value ?? '50');
          }} className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors">
            Javob berish
          </button>
        </div>
      );
    }
    // matching/arrange/reorder/droppin: minimal fallback — captain confirms verbally coordinated answer is out of scope
    // for this plan's UI depth; render a simple text fallback so the flow is never blocked.
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-400">Bu savol turi uchun ovozli kelishilgan javobni yozing (vergul bilan ajrating).</p>
        <textarea id="captain-fallback-input" rows={2}
          className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 text-base outline-none focus:border-indigo-400" />
        <button onClick={() => {
          const el = document.getElementById('captain-fallback-input') as HTMLTextAreaElement;
          const ids = (el?.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          submitAnswer(ids, null);
        }} className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors">
          Javob berish
        </button>
      </div>
    );
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

      {phase === 'team_waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Hourglass size={32} className="text-indigo-300 mb-4 animate-pulse" />
          <p className="text-lg font-bold text-gray-900 mb-2">{myTeam?.name ?? 'Guruh kutilmoqda'}</p>
          <p className="text-sm text-gray-400 mb-4">{isCaptain ? 'Siz sardorsiz' : "Siz a'zosiz"}</p>
          {myTeam && myTeam.members.length > 0 && (
            <div className="w-full max-w-xs flex flex-col gap-1.5 mb-4">
              {myTeam.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm">
                  {m.userId === myTeam.captainUserId
                    ? <Crown size={14} className="text-amber-500 shrink-0" />
                    : <Users size={14} className="text-gray-300 shrink-0" />}
                  <span className="text-gray-700 font-medium truncate">{m.name}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-400">Ustoz o'yinni boshlashini kuting...</p>
        </div>
      )}

      {(phase === 'question' || phase === 'waiting' || phase === 'reveal') && question && (
        <div className="flex-1 flex flex-col min-h-0 lg:max-w-2xl lg:mx-auto lg:w-full">
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
            ) : isTeamMode && !isCaptain && !['single', 'multi', 'truefalse'].includes(question.type) ? (
              <div className="flex flex-col items-center py-10 text-center">
                <p className="font-semibold text-gray-700 mb-1">Sardoringiz javob bermoqda...</p>
                <p className="text-sm text-gray-400">{myTeam?.name}</p>
              </div>
            ) : isTeamMode && isCaptain && !['single', 'multi', 'truefalse'].includes(question.type) ? (
              renderCaptainInput()
            ) : question.type === 'single' || question.type === 'multi' || question.type === 'truefalse' ? (
              <div className="flex flex-col gap-2.5 pb-4">
                {question.options.map((opt, i) => {
                  const isSel = selected.includes(opt.id);
                  const isSuggested = suggestedOptionIds.includes(opt.id);
                  const isCorrect = reveal?.correctOptionIds.includes(opt.id);
                  return (
                    <button key={opt.id} onClick={() => tapOption(opt.id)}
                      disabled={phase === 'reveal'}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                        phase === 'reveal'
                          ? isCorrect ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-100 opacity-60'
                          : (isTeamMode && !isCaptain ? isSuggested : isSel) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-gray-100 text-gray-800 hover:border-indigo-200'
                      }`}>
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        (isTeamMode && !isCaptain ? isSuggested : isSel) && phase !== 'reveal' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>{LABELS[i]}</span>
                      <span className="leading-snug flex-1">{opt.text}</span>
                      {isTeamMode && isCaptain && suggestionCounts[opt.id] > 0 && (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg shrink-0">
                          {suggestionCounts[opt.id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : question.type === 'fillblank' ? (
              <div className="flex flex-col gap-1.5 pb-4">
                <p className="text-xs text-gray-400">Bo'sh joyni to'ldiring:</p>
                <input value={textAnswer} disabled={phase === 'reveal'}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Javobingizni yozing..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3.5 outline-none focus:border-indigo-400 focus:bg-white transition-colors" />
              </div>
            ) : question.type === 'open' ? (
              <div className="pb-4">
                <textarea value={textAnswer} rows={4} disabled={phase === 'reveal'}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Javobingizni yozing..."
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3.5 outline-none focus:border-indigo-400 focus:bg-white transition-colors resize-none" />
              </div>
            ) : question.type === 'slider' ? (
              <div className="pb-4">
                <SliderInput options={question.options} value={textAnswer} onChange={setTextAnswer} locked={phase === 'reveal'} />
              </div>
            ) : question.type === 'droppin' ? (
              <div className="pb-4">
                <DropPinInput imageUrl={question.imageUrl ? mediaUrl(question.imageUrl) : ''} value={textAnswer}
                  onChange={setTextAnswer} locked={phase === 'reveal'} />
              </div>
            ) : question.type === 'matching' ? (
              <div className="pb-4">
                <MatchingInput options={question.options} selected={selected} onSelect={setSelected} locked={phase === 'reveal'} />
              </div>
            ) : question.type === 'arrange' ? (
              <div className="pb-4">
                <ArrangeInput options={question.options} selected={selected} onSelect={setSelected} locked={phase === 'reveal'} />
              </div>
            ) : question.type === 'reorder' ? (
              <div className="pb-4">
                <ReorderInput options={question.options} selected={selected} onSelect={setSelected} locked={phase === 'reveal'} />
              </div>
            ) : null}

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

          {!isTeamMode && phase === 'question' && (
            question.type === 'multi' || question.type === 'fillblank' || question.type === 'open' ||
            question.type === 'slider' || question.type === 'droppin' || question.type === 'matching' ||
            question.type === 'arrange' || question.type === 'reorder'
          ) && (
            <div className="shrink-0 px-5 pt-2 pb-2">
              <button
                onClick={() => {
                  if (question.type === 'fillblank' || question.type === 'open' || question.type === 'slider' || question.type === 'droppin') {
                    submitAnswer([], textAnswer);
                  } else if (question.type === 'reorder') {
                    submitAnswer(selected.length > 0 ? selected : question.options.map((o) => o.id));
                  } else {
                    submitAnswer(selected);
                  }
                }}
                disabled={
                  question.type === 'multi' ? selected.length === 0 :
                  question.type === 'matching' || question.type === 'arrange' ? selected.length === 0 :
                  question.type === 'reorder' ? false :
                  !textAnswer.trim()
                }
                className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100">
                Javob berish
              </button>
            </div>
          )}

          {isTeamMode && isCaptain && ['single', 'multi', 'truefalse'].includes(question.type) && phase === 'question' && (
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
