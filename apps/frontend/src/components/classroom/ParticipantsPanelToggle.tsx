import { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";
import { ClassroomParticipants } from "./ClassroomParticipants";

interface Props {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  isHost: boolean;
  myUserId: string | null;
  onMute?: (userId: string) => void;
}

// Header'dagi icon orqali ochiladigan/yopiladigan o'quvchilar paneli.
// position: absolute bilan PDF ustiga tushadi — asosiy kontent joyini
// egallamaydi. Tashqariga bosilganda va Escape bosilganda yopiladi.
export function ParticipantsPanelToggle({ participants, speakingUserIds, isHost, myUserId, onMute }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onlineCount = participants.filter((p) => p.online).length;

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
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="O'quvchilar ro'yxati"
        title="O'quvchilar"
        className={`relative flex items-center gap-1.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-colors sm:px-3 ${
          open ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
        }`}
      >
        <Users size={18} />
        <span className="hidden sm:inline">O'quvchilar</span>
        <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {onlineCount}/{participants.length}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="O'quvchilar ro'yxati"
          className="classroom-panel-in absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(20rem,calc(100vw-2rem))] origin-top-right"
        >
          <div className="max-h-[min(28rem,calc(100vh-6rem))] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-800">O'quvchilar</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Yopish"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
            <ClassroomParticipants
              participants={participants}
              speakingUserIds={speakingUserIds}
              isHost={isHost}
              myUserId={myUserId}
              onMute={onMute}
              bare
            />
          </div>
        </div>
      )}
    </div>
  );
}
