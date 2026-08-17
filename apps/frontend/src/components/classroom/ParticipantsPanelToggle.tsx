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
  hostUserId?: string | null;
  hostName?: string;
  hidden?: boolean;
}

export function ParticipantsPanelToggle({
  participants, speakingUserIds, unmutedUserIds = new Set(), isHost, myUserId,
  onMute, userReactions, theme = "light",
  hostOnline = false, hostUserId = null, hostName = "Ustoz",
  hidden = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onlineCount = participants.filter((p) => p.online).length;

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
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
        >
          <Users size={15} />
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white shadow-xs">
            {onlineCount}/{participants.length}
          </span>
        </button>
      )}

      {open && createPortal(
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-[70] bg-black/10 dark:bg-black/30 transition-opacity animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="O'quvchilar ro'yxati"
            className="classroom-panel-in glass-card z-[80] fixed inset-x-4 bottom-4 top-auto max-h-[85vh] sm:top-14 sm:right-4 sm:left-auto sm:bottom-auto sm:w-88 rounded-3xl p-5 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold tracking-tight text-[var(--text-primary)]">O'quvchilar</h4>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  {onlineCount}/{participants.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                aria-label="Yopish"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto pt-2 flex-1 max-h-[60vh]">
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
                hostUserId={hostUserId}
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
