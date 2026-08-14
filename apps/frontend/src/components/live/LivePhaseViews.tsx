import { Crown, Hourglass, Trophy, Users } from "lucide-react";
import type { WsState } from "../../api/live";

export interface MyTeamInfo {
  id: string;
  name: string;
  captainUserId: string | null;
  members: Array<{ userId: string; name: string }>;
}

export function LiveConnectingView() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-gray-200 border-t-gray-900 animate-spin" />
    </div>
  );
}

export function LiveErrorView({
  errorCode,
  onBack,
}: {
  errorCode: string | null;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-red-400 text-center">
        {errorCode === "NOT_FOUND"
          ? "Sessiya topilmadi yoki tugagan."
          : "Ulanishda xato. Qayta urinib ko'ring."}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="text-gray-700 text-sm font-medium cursor-pointer"
      >
        ← PIN kiritish
      </button>
    </div>
  );
}

export function LiveLobbyView({ playerCount }: { playerCount: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <Hourglass size={32} className="text-gray-400 mb-4 animate-pulse" />
      <p className="text-lg font-bold text-gray-900 mb-2">Siz ichkaridasiz!</p>
      <p className="text-sm text-gray-400 mb-6">
        Ustoz o'yinni boshlashini kuting...
      </p>
      <div className="flex items-center gap-2 text-gray-500">
        <Users size={15} />
        <span className="text-sm">{playerCount} o'yinchi</span>
      </div>
    </div>
  );
}

export function LiveTeamWaitingView({
  myTeam,
  isCaptain,
}: {
  myTeam: MyTeamInfo | null;
  isCaptain: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <Hourglass size={32} className="text-gray-400 mb-4 animate-pulse" />
      <p className="text-lg font-bold text-gray-900 mb-2">
        {myTeam?.name ?? "Guruh kutilmoqda"}
      </p>
      <p className="text-sm text-gray-400 mb-4">
        {isCaptain ? "Siz sardorsiz" : "Siz a'zosiz"}
      </p>
      {myTeam && myTeam.members.length > 0 && (
        <div className="w-full max-w-xs flex flex-col gap-1.5 mb-4">
          {myTeam.members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm"
            >
              {m.userId === myTeam.captainUserId ? (
                <Crown size={14} className="text-amber-500 shrink-0" />
              ) : (
                <Users size={14} className="text-gray-300 shrink-0" />
              )}
              <span className="text-gray-700 font-medium truncate">
                {m.name}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-400">
        Ustoz o'yinni boshlashini kuting...
      </p>
    </div>
  );
}

export function LiveFinishedView({
  score,
  state,
  onExit,
}: {
  score: number;
  state: WsState | null;
  onExit: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto w-full">
      <Trophy size={48} className="text-amber-400 mb-4" />
      <p className="text-2xl font-bold text-gray-900 mb-1">O'yin tugadi!</p>
      <p className="text-4xl font-extrabold text-indigo-600 my-4">
        {score}{" "}
        <span className="text-lg font-normal text-gray-400">ball</span>
      </p>

      {state?.leaderboard && state.leaderboard.length > 0 && (
        <div className="w-full bg-gray-50 rounded-2xl p-4 my-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Top Natijalar
          </p>
          <div className="flex flex-col gap-2">
            {state.leaderboard.slice(0, 5).map((entry, idx) => (
              <div
                key={entry.userId ?? idx}
                className="flex items-center justify-between px-3 py-2 bg-white rounded-xl text-sm shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 font-bold text-gray-400 text-xs">
                    #{idx + 1}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {entry.name}
                  </span>
                </div>
                <span className="font-bold text-indigo-600">
                  {entry.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onExit}
        className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-semibold text-sm hover:bg-gray-800 transition-colors mt-2 cursor-pointer"
      >
        Chiqish
      </button>
    </div>
  );
}
