import { Mic, MicOff, Volume2 } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";

const STATUS_LABEL: Record<
  CsParticipant["status"],
  { text: string; dotCls: string; badgeCls: string }
> = {
  present: { text: "keldi",      dotCls: "bg-emerald-500", badgeCls: "bg-emerald-500/15 text-emerald-600" },
  late:    { text: "kech keldi", dotCls: "bg-amber-500",   badgeCls: "bg-amber-500/15  text-amber-600"   },
  absent:  { text: "yo'q",       dotCls: "bg-gray-400",    badgeCls: "bg-gray-400/15   text-gray-500"    },
};

const AVATAR_HEX = [
  "#e67700", "#087f5b", "#1971c2", "#5f3dc4",
  "#c2255c", "#2f9e44", "#1864ab", "#862e9c",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_HEX[Math.abs(h) % AVATAR_HEX.length];
}

interface Props {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  isHost: boolean;
  myUserId: string | null;
  onMute?: (userId: string) => void;
  userReactions?: Record<string, string>;
  bare?: boolean;
  theme?: "light" | "dark";
}

export function ClassroomParticipants({
  participants, speakingUserIds, isHost, myUserId,
  onMute, userReactions, bare = false, theme = "light",
}: Props) {
  const isDark = theme === "dark";

  const sorted = [...participants].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
  );
  const onlineCount = participants.filter((p) => p.online).length;

  // Theme tokens
  const nameCls     = isDark ? "text-white"     : "text-gray-900";
  const nameOffCls  = isDark ? "text-white/40"  : "text-gray-400";
  const rowHover    = isDark ? "hover:bg-white/5"  : "hover:bg-gray-50";
  const speakBg     = isDark ? "bg-indigo-500/20"  : "bg-indigo-50";
  const micHover    = isDark
    ? "text-white/40 hover:text-red-400 hover:bg-red-500/15"
    : "text-gray-400 hover:text-red-600 hover:bg-red-50";
  const emptyCls    = isDark ? "text-white/40"  : "text-gray-400";

  return (
    <div className={bare ? "flex flex-col min-h-0" : ""}>
      {!bare && (
        <div className="flex items-center justify-between px-1 pb-2">
          <span className={`text-xs font-medium ${isDark ? "text-white/50" : "text-gray-400"}`}>
            {onlineCount}/{participants.length} onlayn
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
        {sorted.length === 0 && (
          <p className={`text-sm py-6 text-center ${emptyCls}`}>
            Hozircha o'quvchi yo'q
          </p>
        )}

        {sorted.map((p) => {
          const status  = STATUS_LABEL[p.status];
          const speaking = speakingUserIds.has(p.userId);
          const reaction = userReactions?.[p.userId];
          const initial  = p.name.charAt(0).toUpperCase() || "?";

          return (
            <div
              key={p.userId}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${rowHover} ${speaking ? speakBg : ""}`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: avatarColor(p.name) }}
                >
                  {initial}
                </div>
                {/* Online dot */}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ${
                    isDark ? "ring-[#202124]" : "ring-white"
                  } ${status.dotCls}`}
                />
              </div>

              {/* Name */}
              <span className={`text-sm truncate flex-1 font-medium ${p.online ? nameCls : nameOffCls}`}>
                {p.name}
                {p.userId === myUserId && (
                  <span className={`ml-1 text-[11px] font-normal ${isDark ? "text-white/40" : "text-gray-400"}`}>(siz)</span>
                )}
              </span>

              {/* Reaction emoji */}
              {reaction && (
                <span className="text-base shrink-0 leading-none" title="Oxirgi reaksiya">
                  {reaction}
                </span>
              )}

              {/* Speaking indicator */}
              {speaking && (
                <Volume2 size={14} className="text-indigo-400 shrink-0 animate-pulse" />
              )}

              {/* Status badge */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${status.badgeCls}`}>
                {status.text}
              </span>

              {/* Host mute button */}
              {isHost && p.online && (
                <button
                  type="button"
                  onClick={() => onMute?.(p.userId)}
                  className={`p-1 rounded-lg transition-colors shrink-0 ${micHover}`}
                  title="Mikrofonini o'chirish"
                >
                  <MicOff size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Mic hint for students */}
      {!isHost && (
        <div className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] border-t ${
          isDark ? "border-white/10 text-white/30" : "border-gray-100 text-gray-400"
        }`}>
          <Mic size={11} />
          Gapirish uchun mikrofon tugmasini yoqing
        </div>
      )}
    </div>
  );
}
