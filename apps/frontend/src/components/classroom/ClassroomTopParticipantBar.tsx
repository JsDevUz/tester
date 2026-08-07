import React, { useState, useEffect } from "react";
import { Mic, MicOff, User, Users } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";

const AVATAR_COLORS = [
  "#e67700", "#087f5b", "#1971c2", "#5f3dc4",
  "#c2255c", "#2f9e44", "#1864ab", "#862e9c",
  "#d9480f", "#099268", "#1098ad", "#ae3ec9",
];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  participants: CsParticipant[];
  speakingUserIds?: Set<string>;
  unmutedUserIds?: Set<string>;
  myUserId?: string | null;
  myUserName?: string;
  theme?: "light" | "dark";
  isHost?: boolean;
  hostOnline?: boolean;
  hostName?: string;
}

export const ClassroomTopParticipantBar: React.FC<Props> = ({
  participants: _participants,
  speakingUserIds = new Set(),
  unmutedUserIds = new Set(),
  myUserId,
  myUserName = "Siz",
  theme = "light",
  isHost = false,
  hostOnline = false,
  hostName = "Ustoz",
}) => {
  const isDark = theme === "dark";

  const hasMe = _participants.some((p) => p.userId === myUserId || p.userId === "me" || (myUserName && p.name === myUserName));
  const listToRender: Array<{ userId: string; name: string; isMuted?: boolean; role?: string }> = [
    // Prepend teacher/ustoz tile if online
    ...(hostOnline ? [{
      userId: "host",
      name: hostName || "Ustoz",
      isMuted: !unmutedUserIds.has("host") && !unmutedUserIds.has("teacher") && !(hostName && unmutedUserIds.has(hostName)),
      role: "host",
    }] : []),
    // Prepend current user (me) if not host and not already in participants
    ...(!isHost && !hasMe && myUserName ? [{
      userId: myUserId || "me",
      name: myUserName,
      isMuted: !unmutedUserIds.has(myUserId || "me") && !(myUserName && unmutedUserIds.has(myUserName)),
      role: "student",
    }] : []),
    // Add all active student participants who are online
    ..._participants.filter(p => p.online).map((p) => ({
      userId: p.userId,
      name: p.name,
      isMuted: !unmutedUserIds.has(p.userId) && !(p.name && unmutedUserIds.has(p.name)),
      role: "student",
    }))
  ];

  // Measure window width dynamically to determine how many tiles can fit in the top row
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Dynamic sorting: Current user (isMe) always first, then host, then speaking users, then the rest
  const sortedList = [...listToRender].sort((a, b) => {
    const aIsMe = a.userId === myUserId || a.userId === "me" || (myUserName && a.name === myUserName);
    const bIsMe = b.userId === myUserId || b.userId === "me" || (myUserName && b.name === myUserName);
    if (aIsMe) return -1;
    if (bIsMe) return 1;

    // Promote host/teacher
    const aIsHost = a.role === "host";
    const bIsHost = b.role === "host";
    if (aIsHost && !bIsHost) return -1;
    if (!aIsHost && bIsHost) return 1;

    const aSpeaking = speakingUserIds.has(a.userId) || (a.name && speakingUserIds.has(a.name));
    const bSpeaking = speakingUserIds.has(b.userId) || (b.name && speakingUserIds.has(b.name));
    if (aSpeaking && !bSpeaking) return -1;
    if (!aSpeaking && bSpeaking) return 1;

    return a.name.localeCompare(b.name);
  });

  const isMobile = windowWidth < 640;
  const tileWidth = isMobile ? 130 : 150;
  const gap = 12;
  const paddingSpace = 32;
  const availableWidth = windowWidth - paddingSpace;
  const maxTiles = Math.max(2, Math.floor((availableWidth + gap) / (tileWidth + gap)));

  const totalCount = sortedList.length;
  const showTruncated = totalCount > maxTiles;
  const listToDisplay: Array<{ userId: string; name: string; isMuted?: boolean; role?: string; hiddenUsersInfo?: Array<{ initials: string; bgHex: string }> }> = showTruncated
    ? [
      ...sortedList.slice(0, maxTiles - 1),
      {
        userId: "others",
        name: `Yana ${totalCount - (maxTiles - 1)} ta`,
        role: "others",
        isMuted: true,
        hiddenUsersInfo: sortedList.slice(maxTiles - 1).slice(0, 2).map((u) => ({
          initials: u.role === "host" ? "U" : getInitials(u.name),
          bgHex: u.role === "host" ? "#4f46e5" : getAvatarColor(u.name),
        })),
      },
    ]
    : sortedList;

  const justifyClass = listToDisplay.length > 5 ? "justify-start" : "justify-center";

  return (
    <div className={`w-full px-4 py-2 flex items-center ${justifyClass} gap-3 overflow-x-auto select-none h-[84px] sm:h-[96px] shrink-0 transition-colors duration-250 ${isDark ? "bg-gray-50 border-white/5" : "bg-gray-50 border-gray-200/80"
      }`}>
      {listToDisplay.map((p) => {
        const isSpeaking = speakingUserIds.has(p.userId) || (p.name && speakingUserIds.has(p.name));
        const isMe = p.userId === myUserId || p.userId === "me" || (myUserName && p.name === myUserName);
        const isHostRole = p.role === "host";
        const bgHex = isHostRole ? "#4f46e5" : getAvatarColor(p.name);
        const initials = isHostRole ? "U" : getInitials(p.name);
        const displayName = isHostRole
          ? (isMe ? `${p.name} (Ustoz, Siz)` : `${p.name} (Ustoz)`)
          : (isMe ? `${p.name} (Siz)` : p.name);

        if (p.role === "others") {
          const hUsers = p.hiddenUsersInfo || [];
          return (
            <div
              key={p.userId}
              onClick={() => window.dispatchEvent(new CustomEvent("open-participants-panel"))}
              className={`relative w-[130px] sm:w-[150px] h-full rounded-xl flex flex-col items-center justify-center p-2  border shrink-0 overflow-hidden cursor-pointer hover:border-indigo-500/50 ${isDark
                  ? "bg-[#28292d] border-white/5 text-white"
                  : "bg-white border-gray-200/80 text-gray-800"
                }`}
            >
              {/* Overlapping Avatars */}
              <div className="flex items-center justify-center -space-x-3 mb-2 group-hover:scale-105 transition-transform duration-300">
                {hUsers.map((hu, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-center rounded-full text-white font-bold text-[10px] sm:text-xs shadow-md border border-white dark:border-[#28292d]"
                    style={{
                      backgroundColor: hu.bgHex,
                      width: "30px",
                      height: "30px",
                    }}
                  >
                    {hu.initials}
                  </div>
                ))}
                {/* Fallback if empty */}
                {hUsers.length === 0 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600/10 text-indigo-500 font-bold ">
                    <Users size={12} />
                  </div>
                )}
              </div>

              {/* Label */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center w-[90%]">
                <div className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${isDark ? "bg-black/50 text-white" : "bg-gray-100 text-gray-800"
                  }`}>
                  {p.name}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={p.userId}
            className={`relative w-[130px] sm:w-[150px] h-full rounded-xl flex items-center justify-center p-2  border shrink-0 overflow-hidden ${isSpeaking
              ? "border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/80"
              : isDark
                ? "bg-[#28292d] border-white/5"
                : "bg-white border-gray-200/80"
              }`}
          >
            {/* Small Centered Avatar */}
            <div
              className={`flex items-center justify-center rounded-full text-white font-bold text-sm sm:text-base  transition-transform duration-300 ease-out ${isSpeaking
                ? `ring-2 ring-emerald-500 ring-offset-2 scale-110 ${isDark ? "ring-offset-[#28292d]" : "ring-offset-white"
                }`
                : "scale-100"
                }`}
              style={{
                backgroundColor: bgHex,
                width: "40px",
                height: "40px",
              }}
            >
              {initials.length <= 2 ? <span>{initials}</span> : <User size={20} />}
            </div>

            {/* Bottom Centered Label Pill */}
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none w-[90%]">
              <div className={`flex items-center gap-1.5 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium  max-w-full ${isDark ? "bg-black/70 text-white" : "bg-white/95 text-gray-800 "
                }`}>
                <span className="truncate max-w-[65px] sm:max-w-[85px]">{displayName}</span>
                <div className={`flex items-center justify-center shrink-0 ${p.isMuted
                  ? isDark
                    ? "text-white/60"
                    : "text-gray-400"
                  : "text-emerald-500"
                  }`}>
                  {p.isMuted ? <MicOff size={11} /> : <Mic size={11} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
