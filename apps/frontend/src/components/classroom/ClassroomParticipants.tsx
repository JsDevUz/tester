import { Mic, MicOff, Volume2 } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";

const STATUS_LABEL: Record<CsParticipant["status"], { text: string; cls: string }> = {
  present: { text: "keldi", cls: "bg-emerald-50 text-emerald-700" },
  late: { text: "kech keldi", cls: "bg-amber-50 text-amber-700" },
  absent: { text: "yo'q", cls: "bg-gray-100 text-gray-500" },
};

interface Props {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  isHost: boolean;
  myUserId: string | null;
  onMute?: (userId: string) => void;
  // true bo'lsa o'zining karta-shadow/sarlavhasini chizmaydi — masalan
  // ParticipantsPanelToggle o'ziga xos konteyner ichida ishlatganda.
  bare?: boolean;
}

export function ClassroomParticipants({ participants, speakingUserIds, isHost, myUserId, onMute, bare = false }: Props) {
  const sorted = [...participants].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  const onlineCount = participants.filter((p) => p.online).length;

  return (
    <div className={bare ? "flex flex-col gap-2 min-h-0" : "bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-2 min-h-0"}>
      {!bare && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">O'quvchilar</h3>
          <span className="text-xs text-gray-400">{onlineCount}/{participants.length} onlayn</span>
        </div>
      )}
      <div className={`flex-1 overflow-y-auto flex flex-col gap-1 ${bare ? "p-2" : ""}`}>
        {sorted.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Hozircha o'quvchi yo'q</p>}
        {sorted.map((p) => {
          const status = STATUS_LABEL[p.status];
          const speaking = speakingUserIds.has(p.userId);
          return (
            <div key={p.userId} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${speaking ? "bg-indigo-50" : ""}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${p.online ? "bg-emerald-500" : "bg-gray-300"}`} />
              <span className={`text-sm truncate flex-1 ${p.online ? "text-gray-800" : "text-gray-400"}`}>
                {p.name}{p.userId === myUserId ? " (siz)" : ""}
              </span>
              {speaking && <Volume2 size={14} className="text-indigo-600 shrink-0 animate-pulse" />}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${status.cls}`}>{status.text}</span>
              {isHost && p.online && (
                <button
                  type="button"
                  onClick={() => onMute?.(p.userId)}
                  className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  title="Mikrofonini o'chirish"
                >
                  <MicOff size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!isHost && (
        <p className={`text-[11px] text-gray-400 flex items-center gap-1 ${bare ? "px-2 pb-2" : ""}`}>
          <Mic size={12} /> Gapirish uchun pastdagi mikrofon tugmasini yoqing
        </p>
      )}
    </div>
  );
}
