import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, X } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";
import { ClassroomParticipants } from "./ClassroomParticipants";

interface Props {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  unmutedUserIds?: Set<string>;
  isHost: boolean;
  myUserId: string | null;
  onMute?: (userId: string) => void;
  userReactions?: Record<string, string>;
  compact?: boolean;
  theme?: "light" | "dark";
  hostOnline?: boolean;
  hostName?: string;
  hidden?: boolean;
}

export function ParticipantsPanelToggle({
  participants, speakingUserIds, unmutedUserIds = new Set(), isHost, myUserId,
  onMute, userReactions, theme = "light",
  hostOnline = false, hostName = "Ustoz",
  hidden = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onlineCount = participants.filter((p) => p.online).length;
  const isDark = theme === "dark";

  // Global event listener to open from elsewhere (like clicking + others tile)
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-participants-panel", handleOpen);
    return () => window.removeEventListener("open-participants-panel", handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Theme tokens — RaisedHandsControl bilan bir xil
  const panelBg      = isDark ? "bg-[#202124]"   : "bg-white";
  const borderCls    = isDark ? "border-white/10" : "border-gray-200";
  const titleCls     = isDark ? "text-white"      : "text-gray-900";
  const closeCls     = isDark
    ? "text-white/60 hover:bg-white/10 hover:text-white"
    : "text-gray-400 hover:bg-gray-100 hover:text-gray-700";
  const dragHandleCls = isDark ? "bg-white/20"    : "bg-gray-300";
  const countBadgeCls = isDark
    ? "bg-white/10 text-white"
    : "bg-gray-900 text-white";

  // Trigger button — theme-aware pill
  const btnCls = isDark
    ? `flex items-center transition-colors shadow-md gap-1 rounded-full px-2 py-1.5 text-xs font-medium border border-white/10 ${open ? "bg-[#5c5e62] text-white" : "bg-[#3c4043] text-white hover:bg-[#4a4d51]"}`
    : `flex items-center transition-colors shadow-md gap-1 rounded-full px-2 py-1.5 text-xs font-medium border border-gray-100 ${open ? "bg-indigo-100 text-indigo-700" : "bg-white text-gray-500 hover:bg-gray-100"}`;

  return (
    <div className="relative">
      {!hidden && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="O'quvchilar ro'yxati"
          title="O'quvchilar"
          className={btnCls}
        >
          <Users size={14} />
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${countBadgeCls}`}>
            {onlineCount}/{participants.length}
          </span>
        </button>
      )}

      {open && createPortal(
        <>
          {/* Mobil overlay */}
          <div
            className="sm:hidden fixed inset-0 z-[70] bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="O'quvchilar ro'yxati"
            className={`classroom-panel-in z-[80] fixed inset-x-0 bottom-0 rounded-t-2xl shadow-2xl h-[98vh] max-h-[98vh] sm:inset-x-auto sm:bottom-auto sm:rounded-2xl sm:w-80 sm:origin-top-right border ${panelBg} ${borderCls}`}
            style={
              typeof window !== "undefined" && window.innerWidth >= 640
                ? { top: "1vh", right: "16px" }
                : undefined
            }
          >
            {/* Drag handle — mobile only */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className={`w-10 h-1 rounded-full ${dragHandleCls}`} />
            </div>

            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${borderCls}`}>
              <div className="flex items-center gap-2">
                <h4 className={`text-base font-semibold ${titleCls}`}>O'quvchilar</h4>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isDark ? "bg-white/10 text-white/70" : "bg-gray-100 text-gray-500"
                }`}>
                  {onlineCount}/{participants.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded-full p-1.5 transition-colors ${closeCls}`}
                aria-label="Yopish"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div
              className="overflow-y-auto px-2 py-2"
              style={{ maxHeight: "calc(98vh - 80px)" }}
            >
              <ClassroomParticipants
                participants={participants}
                speakingUserIds={speakingUserIds}
                unmutedUserIds={unmutedUserIds}
                isHost={isHost}
                myUserId={myUserId}
                onMute={onMute}
                userReactions={userReactions}
                bare
                theme={theme}
                hostOnline={hostOnline}
                hostName={hostName}
              />
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
