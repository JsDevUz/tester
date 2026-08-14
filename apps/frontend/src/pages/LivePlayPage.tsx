import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Trophy,
} from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import {
  getLiveSocket,
  closeLiveSocket,
  type WsQuestion,
  type WsReveal,
  type WsState,
  type WsTeamUpdate,
  type WsSuggestionUpdate,
} from "../api/live";
import { useLiveVoice } from "../hooks/useLiveVoice";
import { MicControl } from "../components/classroom/MicControl";
import {
  SliderInput,
  DropPinInput,
  MatchingInput,
  ArrangeInput,
  ReorderInput,
  mediaUrl,
} from "../components/live/LiveQuestionInputs";
import {
  LiveConnectingView,
  LiveErrorView,
  LiveLobbyView,
  LiveTeamWaitingView,
} from "../components/live/LivePhaseViews";

const BACKEND =
  import.meta.env.VITE_API_URL?.replace("/api/v1", "") ??
  "http://localhost:3001";
const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

type Phase =
  | "connecting"
  | "lobby"
  | "team_waiting"
  | "question"
  | "waiting"
  | "reveal"
  | "finished"
  | "error";

export function LivePlayPage() {
  const { pin } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token") ?? "";

  const [phase, setPhase] = useState<Phase>("connecting");
  const voice = useLiveVoice(
    phase !== "connecting" && phase !== "error" ? pin : undefined,
    false,
  );
  const [errorCode, setErrorCode] = useState("");
  const [players, setPlayers] = useState<Array<{ name: string }>>([]);
  const [question, setQuestion] = useState<WsQuestion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState<WsReveal | null>(null);
  const [leaderboard, setLeaderboard] = useState<WsReveal["leaderboard"]>([]);
  const [score, setScore] = useState(0);
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isTeamMode, setIsTeamMode] = useState(false);
  const [myTeam, setMyTeam] = useState<{
    id: string;
    name: string;
    captainUserId: string | null;
    members: Array<{ userId: string; name: string }>;
  } | null>(null);
  const [isCaptain, setIsCaptain] = useState(false);
  const [suggestedOptionIds, setSuggestedOptionIds] = useState<string[]>([]);
  const [suggestionCounts, setSuggestionCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const socket = getLiveSocket();

    function join() {
      socket.emit("player:join", { pin, token }, (res: any) => {
        if (!res?.ok) {
          setErrorCode(res?.code ?? "ERROR");
          setPhase("error");
          return;
        }
        const state: WsState = res.state;
        setPlayers(state.players);
        setScore(state.me?.score ?? 0);
        if (state.status === "lobby") setPhase("lobby");
        else if (state.status === "team_assign")
          setPhase((prev) => (prev === "team_waiting" ? prev : "team_waiting"));
        else if (state.status === "finished") {
          setLeaderboard(state.leaderboard ?? []);
          setPhase("finished");
        } else if (state.currentQuestion) {
          setQuestion(state.currentQuestion);
          if (state.status === "reveal") setPhase("waiting");
          else setPhase(state.me?.answeredCurrent ? "waiting" : "question");
        }
      });
    }
    join();
    socket.on("connect", join);

    socket.on("lobby:update", (p: { players: Array<{ name: string }> }) =>
      setPlayers(p.players),
    );
    socket.on("question:start", (q: WsQuestion) => {
      setQuestion(q);
      setSelected([]);
      setTextAnswer("");
      setReveal(null);
      setSuggestedOptionIds([]);
      setSuggestionCounts({});
      setPhase("question");
    });
    socket.on("question:progress", (p: { answered: number; total: number }) =>
      setProgress(p),
    );
    socket.on("question:reveal", (r: WsReveal) => {
      setReveal(r);
      if (typeof r.score === "number") setScore(r.score);
      setPhase("reveal");
    });
    socket.on(
      "game:finished",
      (g: { leaderboard: WsReveal["leaderboard"] }) => {
        setLeaderboard(g.leaderboard);
        setPhase("finished");
      },
    );
    socket.on("team:update", (u: WsTeamUpdate) => {
      setIsTeamMode(true);
      const myUserId = (() => {
        try {
          return JSON.parse(atob(token.split(".")[1])).sub as string;
        } catch {
          return null;
        }
      })();
      if (!myUserId) return;
      const team = u.teams.find((t) =>
        t.members.some((m) => m.userId === myUserId),
      );
      if (team) {
        setMyTeam({
          id: team.id,
          name: team.name,
          captainUserId: team.captainUserId,
          members: team.members,
        });
        setIsCaptain(team.captainUserId === myUserId);
        setPhase((prev) =>
          prev === "connecting" || prev === "lobby" ? "team_waiting" : prev,
        );
      } else {
        setMyTeam(null);
        setIsCaptain(false);
      }
    });
    socket.on("team:suggestionUpdate", (u: WsSuggestionUpdate) =>
      setSuggestionCounts(u.counts),
    );

    timerRef.current = setInterval(() => setNow(Date.now()), 200);
    return () => {
      socket.off("connect", join);
      socket.off("lobby:update");
      socket.off("question:start");
      socket.off("question:progress");
      socket.off("question:reveal");
      socket.off("game:finished");
      socket.off("team:update");
      socket.off("team:suggestionUpdate");
      if (timerRef.current) clearInterval(timerRef.current);
      closeLiveSocket();
    };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  function submitAnswer(ids: string[], text: string | null = null) {
    if (!question) return;
    const event = isTeamMode ? "captain:answer" : "player:answer";
    const payload = isTeamMode
      ? {
        pin,
        token,
        questionId: question.id,
        selectedOptionIds: ids,
        textAnswer: text,
      }
      : {
        pin,
        token,
        questionId: question.id,
        selectedOptionIds: ids,
        textAnswer: text,
      };
    getLiveSocket().emit(event, payload, (res: any) => {
      if (res?.ok) setPhase("waiting");
    });
  }

  function tapOption(id: string) {
    if (!question || phase !== "question") return;
    if (isTeamMode && !isCaptain) {
      tapSuggest(id);
      return;
    }
    if (question.type === "multi" || isTeamMode) {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    } else {
      submitAnswer([id]);
    }
  }

  function tapSuggest(optionId: string) {
    if (!myTeam || isCaptain) return;
    getLiveSocket().emit(
      "member:suggest",
      { pin, token, teamId: myTeam.id, optionId },
      () => { },
    );
    setSuggestedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId],
    );
  }

  function renderCaptainInput() {
    if (!question) return null;
    if (question.type === "open" || question.type === "fillblank") {
      return (
        <div className="flex flex-col gap-2">
          <textarea
            id="captain-text-input"
            rows={3}
            placeholder="Javobni kiriting..."
            className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3 text-base outline-none focus:border-gray-400"
          />
          <button
            onClick={() => {
              const el = document.getElementById(
                "captain-text-input",
              ) as HTMLTextAreaElement;
              submitAnswer([], el?.value ?? "");
            }}
            className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors"
          >
            Javob berish
          </button>
        </div>
      );
    }
    if (question.type === "slider") {
      return (
        <div className="flex flex-col gap-2">
          <input
            id="captain-slider-input"
            type="range"
            min={0}
            max={100}
            defaultValue={50}
            className="w-full accent-gray-900"
          />
          <button
            onClick={() => {
              const el = document.getElementById(
                "captain-slider-input",
              ) as HTMLInputElement;
              submitAnswer([], el?.value ?? "50");
            }}
            className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors"
          >
            Javob berish
          </button>
        </div>
      );
    }
    // matching/arrange/reorder/droppin: minimal fallback — captain confirms verbally coordinated answer is out of scope
    // for this plan's UI depth; render a simple text fallback so the flow is never blocked.
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-400">
          Bu savol turi uchun ovozli kelishilgan javobni yozing (vergul bilan
          ajrating).
        </p>
        <textarea
          id="captain-fallback-input"
          rows={2}
          className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3 text-base outline-none focus:border-gray-400"
        />
        <button
          onClick={() => {
            const el = document.getElementById(
              "captain-fallback-input",
            ) as HTMLTextAreaElement;
            const ids = (el?.value ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            submitAnswer(ids, null);
          }}
          className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors"
        >
          Javob berish
        </button>
      </div>
    );
  }

  const remainingPct = question
    ? Math.max(0, (question.endsAt - now) / (question.timeSec * 1000)) * 100
    : 0;
  const myReveal =
    reveal && typeof reveal.isCorrect === "boolean" ? reveal : null;

  return (
    <StudentShell>
      <div
        className="flex h-[calc(100vh-2rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl bg-white notranslate"
        translate="no"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="shrink-0 h-1 bg-linear-to-r from-gray-800 via-gray-500 to-gray-300" />

        {voice.voiceAvailable && phase !== "connecting" && phase !== "error" && (
          <div className="fixed left-1/2 z-50 -translate-x-1/2" style={{ bottom: "max(76px, calc(env(safe-area-inset-bottom) + 70px))" }}>
            <MicControl
              micEnabled={voice.micEnabled}
              onToggleMic={() => void voice.toggleMic()}
              audioInputs={voice.audioInputs}
              activeAudioInputId={voice.activeAudioInputId}
              onSwitchAudioInput={(deviceId) => void voice.switchAudioInput(deviceId)}
              disabled={!voice.connected}
            />
          </div>
        )}

        {voice.needsAudioUnlock && (
          <button
            type="button"
            onClick={voice.unlockAudio}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white text-sm px-4 py-2 rounded-full shadow-md font-medium hover:bg-indigo-700"
          >
            Ovozni yoqish uchun bosing
          </button>
        )}

        {phase === "connecting" && <LiveConnectingView />}

        {phase === "error" && (
          <LiveErrorView
            errorCode={errorCode}
            onBack={() => navigate("/live/join")}
          />
        )}

        {phase === "lobby" && <LiveLobbyView playerCount={players.length} />}

        {phase === "team_waiting" && (
          <LiveTeamWaitingView myTeam={myTeam} isCaptain={isCaptain} />
        )}

        {(phase === "question" || phase === "waiting" || phase === "reveal") &&
          question && (
            <div className="flex-1 flex flex-col min-h-0 lg:max-w-2xl lg:mx-auto lg:w-full">
              <div className="shrink-0 px-5 pt-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${remainingPct < 20 ? "bg-red-400" : "bg-gray-900"}`}
                    style={{
                      width: phase === "reveal" ? "0%" : `${remainingPct}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-gray-700">
                    {question.idx + 1} / {question.total}
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {score} ball
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5">
                <p className="text-lg font-bold text-gray-900 leading-snug mb-4">
                  {question.text}
                </p>
                {question.imageUrl && (
                  <img
                    src={
                      question.imageUrl.startsWith("http")
                        ? question.imageUrl
                        : `${BACKEND}${question.imageUrl}`
                    }
                    alt=""
                    className="w-full rounded-2xl object-cover mb-4"
                    style={{ maxHeight: 200 }}
                  />
                )}

                {phase === "waiting" ? (
                  <div className="flex flex-col items-center py-10">
                    <CheckCircle2 size={36} className="text-green-400 mb-3" />
                    <p className="font-semibold text-gray-800 mb-1">
                      Javob qabul qilindi
                    </p>
                    <p className="text-sm text-gray-400">
                      {progress.answered} / {progress.total} javob berdi
                    </p>
                  </div>
                ) : isTeamMode &&
                  !isCaptain &&
                  !["single", "multi", "truefalse"].includes(question.type) ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <p className="font-semibold text-gray-700 mb-1">
                      Sardoringiz javob bermoqda...
                    </p>
                    <p className="text-sm text-gray-400">{myTeam?.name}</p>
                  </div>
                ) : isTeamMode &&
                  isCaptain &&
                  !["single", "multi", "truefalse"].includes(question.type) ? (
                  renderCaptainInput()
                ) : question.type === "single" ||
                  question.type === "multi" ||
                  question.type === "truefalse" ? (
                  <div className="flex flex-col gap-2.5 pb-4">
                    {question.options.map((opt, i) => {
                      const isSel = selected.includes(opt.id);
                      const isSuggested = suggestedOptionIds.includes(opt.id);
                      const isCorrect = reveal?.correctOptionIds.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => tapOption(opt.id)}
                          disabled={phase === "reveal"}
                          className={`w-full text-left flex items-center gap-2 px-4 py-3.5 rounded-2xl border transition-all active:scale-[0.99] ${phase === "reveal"
                            ? isCorrect
                              ? "bg-green-50 border-green-300"
                              : "bg-gray-50 border-border opacity-60"
                            : (isTeamMode && !isCaptain ? isSuggested : isSel)
                              ? "bg-gray-900 border-gray-900 text-white"
                              : "bg-white border-border text-gray-800 hover:border-gray-300"
                            }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${(isTeamMode && !isCaptain ? isSuggested : isSel) &&
                              phase !== "reveal"
                              ? "bg-white/20 text-white"
                              : "bg-gray-100 text-gray-500"
                              }`}
                          >
                            {LABELS[i]}
                          </span>
                          <span className="leading-snug flex-1">{opt.text}</span>
                          {isTeamMode &&
                            isCaptain &&
                            suggestionCounts[opt.id] > 0 && (
                              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg shrink-0">
                                {suggestionCounts[opt.id]}
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>
                ) : question.type === "fillblank" ? (
                  <div className="flex flex-col gap-1.5 pb-4">
                    <p className="text-xs text-gray-400">
                      Bo'sh joyni to'ldiring:
                    </p>
                    <input
                      value={textAnswer}
                      disabled={phase === "reveal"}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="Javobingizni yozing..."
                      className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3.5 outline-none focus:border-gray-400 focus:bg-white transition-colors"
                    />
                  </div>
                ) : question.type === "open" ? (
                  <div className="pb-4">
                    <textarea
                      value={textAnswer}
                      rows={4}
                      disabled={phase === "reveal"}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="Javobingizni yozing..."
                      className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3.5 outline-none focus:border-gray-400 focus:bg-white transition-colors resize-none"
                    />
                  </div>
                ) : question.type === "slider" ? (
                  <div className="pb-4">
                    <SliderInput
                      options={question.options}
                      value={textAnswer}
                      onChange={setTextAnswer}
                      locked={phase === "reveal"}
                    />
                  </div>
                ) : question.type === "droppin" ? (
                  <div className="pb-4">
                    <DropPinInput
                      imageUrl={
                        question.imageUrl ? mediaUrl(question.imageUrl) : ""
                      }
                      value={textAnswer}
                      onChange={setTextAnswer}
                      locked={phase === "reveal"}
                    />
                  </div>
                ) : question.type === "matching" ? (
                  <div className="pb-4">
                    <MatchingInput
                      options={question.options}
                      selected={selected}
                      onSelect={setSelected}
                      locked={phase === "reveal"}
                    />
                  </div>
                ) : question.type === "arrange" ? (
                  <div className="pb-4">
                    <ArrangeInput
                      options={question.options}
                      selected={selected}
                      onSelect={setSelected}
                      locked={phase === "reveal"}
                    />
                  </div>
                ) : question.type === "reorder" ? (
                  <div className="pb-4">
                    <ReorderInput
                      options={question.options}
                      selected={selected}
                      onSelect={setSelected}
                      locked={phase === "reveal"}
                    />
                  </div>
                ) : null}

                {phase === "reveal" && myReveal && (
                  <div
                    className={`rounded-2xl px-4 py-4 mb-4 flex items-center gap-2 ${myReveal.isCorrect ? "bg-green-50" : "bg-red-50"}`}
                  >
                    {myReveal.isCorrect ? (
                      <CheckCircle2
                        size={22}
                        className="text-green-500 shrink-0"
                      />
                    ) : (
                      <XCircle size={22} className="text-red-400 shrink-0" />
                    )}
                    <div>
                      <p
                        className={`font-semibold ${myReveal.isCorrect ? "text-green-700" : "text-red-600"}`}
                      >
                        {myReveal.isCorrect
                          ? `To'g'ri! +${myReveal.points} ball`
                          : "Noto'g'ri"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Siz {myReveal.rank}-o'rindasiz
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {!isTeamMode &&
                phase === "question" &&
                (question.type === "multi" ||
                  question.type === "fillblank" ||
                  question.type === "open" ||
                  question.type === "slider" ||
                  question.type === "droppin" ||
                  question.type === "matching" ||
                  question.type === "arrange" ||
                  question.type === "reorder") && (
                  <div className="shrink-0 px-5 pt-2 pb-2">
                    <button
                      onClick={() => {
                        if (
                          question.type === "fillblank" ||
                          question.type === "open" ||
                          question.type === "slider" ||
                          question.type === "droppin"
                        ) {
                          submitAnswer([], textAnswer);
                        } else if (question.type === "reorder") {
                          submitAnswer(
                            selected.length > 0
                              ? selected
                              : question.options.map((o) => o.id),
                          );
                        } else {
                          submitAnswer(selected);
                        }
                      }}
                      disabled={
                        question.type === "multi"
                          ? selected.length === 0
                          : question.type === "matching" ||
                            question.type === "arrange"
                            ? selected.length === 0
                            : question.type === "reorder"
                              ? false
                              : !textAnswer.trim()
                      }
                      className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100"
                    >
                      Javob berish
                    </button>
                  </div>
                )}

              {isTeamMode &&
                isCaptain &&
                ["single", "multi", "truefalse"].includes(question.type) &&
                phase === "question" && (
                  <div className="shrink-0 px-5 pt-2 pb-2">
                    <button
                      onClick={() => submitAnswer(selected)}
                      disabled={selected.length === 0}
                      className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100"
                    >
                      Javob berish
                    </button>
                  </div>
                )}
            </div>
          )}

        {phase === "finished" && (
          <div className="flex-1 flex flex-col items-center px-6 pt-10 overflow-y-auto">
            <Trophy size={40} className="text-amber-400 mb-4" />
            <p className="text-xl font-bold text-gray-900 mb-6">O'yin tugadi!</p>
            <div className="w-full max-w-md flex flex-col gap-2 mb-8">
              {leaderboard.map((e) => (
                <div
                  key={e.userId}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${e.rank === 1
                    ? "bg-amber-50 border-amber-200"
                    : e.rank <= 3
                      ? "bg-gray-50 border-gray-200"
                      : "bg-white border-border"
                    }`}
                >
                  <span className="font-semibold text-gray-800">
                    {e.rank}. {e.name}
                  </span>
                  <span className="font-bold text-gray-900">{e.score}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/")}
              className="w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition-colors mb-4"
            >
              Bosh sahifa
            </button>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
