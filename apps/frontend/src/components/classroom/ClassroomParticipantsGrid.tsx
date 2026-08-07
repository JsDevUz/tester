import React from "react";
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

export const ClassroomParticipantsGrid: React.FC<Props> = ({
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
  // test

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

  // Measure container size dynamically using a ResizeObserver to prevent vertical scrollbars
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      const observer = new ResizeObserver((entries) => {
        if (entries && entries.length > 0) {
          const { width, height } = entries[0].contentRect;
          setContainerSize({ width, height });
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  const totalCount = sortedList.length;

  // Compute how many columns the grid uses
  let colsCount = 2;
  const currentW = containerSize.width || (typeof window !== "undefined" ? window.innerWidth : 1024);
  if (currentW >= 1024 && currentW < 1280) {
    colsCount = 3;
  } else if (currentW >= 1280) {
    colsCount = 4;
  }

  // Calculate dynamic limit to guarantee no scrollbar
  let gridLimit = 8;
  if (containerSize.width > 0 && containerSize.height > 0) {
    const W = containerSize.width;
    const H = containerSize.height;
    const gap = 12; // gap-3 is 12px
    const tileWidth = (W - (colsCount - 1) * gap) / colsCount;

    // Account for CSS constraints: min-h-[160px] sm:min-h-[220px] max-h-[360px]
    // sm: min-height is active when screen width >= 640px.
    const isSmBreakpoint = W >= 640;
    const minH = isSmBreakpoint ? 220 : 160;
    const maxH = 360;
    const tileHeight = Math.max(minH, Math.min(maxH, (tileWidth * 9) / 16));

    const availableHeight = H - 40; // safety margin
    const maxRows = Math.max(1, Math.floor((availableHeight + gap) / (tileHeight + gap)));
    gridLimit = colsCount * maxRows;
  } else {
    // Fallback based on width if container size is not yet measured
    const isMobileSize = currentW < 520;
    const isTabletSize = currentW >= 520 && currentW < 960;
    gridLimit = isMobileSize ? 8 : (isTabletSize ? 9 : 12);
  }

  const showTruncated = totalCount > gridLimit;
  const listToDisplay: Array<{ userId: string; name: string; isMuted?: boolean; role?: string; hiddenUsersInfo?: Array<{ initials: string; bgHex: string }> }> = showTruncated
    ? [
      ...sortedList.slice(0, gridLimit - 1),
      {
        userId: "others",
        name: `Yana ${totalCount - (gridLimit - 1)} ta`,
        role: "others",
        isMuted: true,
        hiddenUsersInfo: sortedList.slice(gridLimit - 1).slice(0, 2).map((u) => ({
          initials: u.role === "host" ? "U" : getInitials(u.name),
          bgHex: u.role === "host" ? "#4f46e5" : getAvatarColor(u.name),
        })),
      },
    ]
    : sortedList;

  const total = listToDisplay.length;

  // Compute grid layout columns based on count (Google Meet / Telemost style)
  let gridColsClass = "grid-cols-1 max-w-2xl";
  if (total === 2) {
    gridColsClass = "grid-cols-1 sm:grid-cols-2 max-w-4xl";
  } else if (total === 3 || total === 4) {
    gridColsClass = "grid-cols-2 max-w-5xl";
  } else if (total >= 5) {
    gridColsClass = "grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-10xl";
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 w-full h-full flex flex-col items-center px-4 pt-4 pb-28 sm:px-4 sm:pt-8 sm:pb-32 overflow-y-auto select-none transition-colors duration-250 ${isDark ? "bg-[#18191c]" : "bg-gray-100"
        }`}
    >
      <div className={`grid gap-3 sm:gap-3 w-full ${gridColsClass} justify-center items-center my-auto`}>
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
                className={`relative w-full aspect-video min-h-[160px] sm:min-h-[220px] max-h-[360px] rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center transition-all duration-200 overflow-hidden group border cursor-pointer hover:border-indigo-500/50 ${isDark
                  ? "bg-[#28292d] border-white/5 shadow-md text-white"
                  : "bg-white border-gray-200/80 shadow-md text-gray-800"
                  }`}
              >
                {/* Overlapping Avatars Container */}
                <div className="flex items-center justify-center -space-x-4 sm:-space-x-5 mb-4 group-hover:scale-105 transition-transform duration-300">
                  {hUsers.map((hu, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-center rounded-full text-white font-bold text-lg sm:text-xl shadow-md border-2 border-[#28292d] dark:border-[#28292d]"
                      style={{
                        backgroundColor: hu.bgHex,
                        width: "48px",
                        height: "48px",
                      }}
                    >
                      {hu.initials}
                    </div>
                  ))}
                  {/* Fallback if empty */}
                  {hUsers.length === 0 && (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/10 text-indigo-500 font-bold ">
                      <Users size={20} />
                    </div>
                  )}
                </div>

                {/* Centered text label */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-[90%]">
                  <div className={`px-4 py-1.5 rounded-full text-sm font-semibold ${isDark ? "bg-black/25 text-white" : "bg-gray-100 text-gray-800"
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
              className={`relative w-full aspect-video min-h-[160px] sm:min-h-[220px] max-h-[360px] rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center transition-all duration-200 overflow-hidden group border ${isSpeaking
                ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.25)] ring-2 ring-emerald-500/80"
                : isDark
                  ? "bg-[#28292d] border-white/5 shadow-md"
                  : "bg-white border-gray-200/80 shadow-md"
                } ${isSpeaking ? (isDark ? "bg-[#28292d]" : "bg-white") : ""}`}
            >
              {/* Centered Avatar Circle */}
              <div
                className={`relative flex items-center justify-center rounded-full text-white font-bold text-2xl sm:text-4xl shadow-lg transition-transform duration-300 ease-out ${isSpeaking
                  ? `ring-4 ring-emerald-500 ring-offset-4 scale-110 ${isDark ? "ring-offset-[#28292d]" : "ring-offset-white"
                  }`
                  : "scale-100 group-hover:scale-105"
                  }`}
                style={{
                  backgroundColor: bgHex,
                  width: total <= 2 ? "100px" : "80px",
                  height: total <= 2 ? "100px" : "80px",
                }}
              >
                {initials.length <= 2 ? (
                  <span>{initials}</span>
                ) : (
                  <User size={36} />
                )}
              </div>

              {/* Bottom Centered Participant Name & Mic Status Pill */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none w-[90%]">
                <div className={`flex items-center gap-2 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium max-w-full  ${isDark ? "bg-black/10 text-white " : "bg-white/95 text-gray-800"
                  }`}>
                  <span className="truncate max-w-[90%] sm:max-w-[90%]">{displayName}</span>
                  <div className={`flex items-center justify-center shrink-0 ${p.isMuted
                    ? isDark
                      ? "text-white/60"
                      : "text-gray-400"
                    : "text-emerald-500"
                    }`}>
                    {p.isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
