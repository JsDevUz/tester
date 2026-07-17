import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, X } from "lucide-react";
import type { CsParticipant } from "../../api/classroom";
import { ClassroomParticipants } from "./ClassroomParticipants";

interface Props {
  participants: CsParticipant[];
  speakingUserIds: Set<string>;
  isHost: boolean;
  myUserId: string | null;
  onMute?: (userId: string) => void;
  // Ixcham toolbar qatorlarida (kichikroq padding, "O'quvchilar" matni yashirin) ishlatish uchun
  compact?: boolean;
}

// Header'dagi icon orqali ochiladigan/yopiladigan o'quvchilar paneli.
// position: absolute bilan PDF ustiga tushadi — asosiy kontent joyini
// egallamaydi. Tashqariga bosilganda va Escape bosilganda yopiladi.
export function ParticipantsPanelToggle({ participants, speakingUserIds, isHost, myUserId, onMute, compact }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Desktop (sm+) uchun panel pozitsiyasi tugma joylashuviga qarab
  // hisoblanadi (portal orqali document.body'ga chiqarilgani uchun CSS
  // position:absolute endi tugmaga emas, body'ga nisbatan bo'lardi).
  // Mobil uchun esa null qoladi — CSS orqali pastdan sheet sifatida ochiladi.
  const [desktopPos, setDesktopPos] = useState<{ top: number; right: number } | null>(null);
  const onlineCount = participants.filter((p) => p.online).length;

  useEffect(() => {
    if (!open) { setDesktopPos(null); return; }
    const btn = buttonRef.current;
    if (!btn || window.innerWidth < 640) return;
    const rect = btn.getBoundingClientRect();
    setDesktopPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open]);

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
        className={`relative flex items-center transition-colors shadow-md ${
          compact
            ? `gap-1 rounded-full px-2 py-1.5 text-xs font-medium border border-gray-100 ${open ? "bg-indigo-100 text-indigo-700" : "bg-white text-gray-500 hover:bg-gray-100"}`
            : `gap-1.5 rounded-xl px-2.5 py-2.5 text-sm font-medium sm:px-3 ${open ? "bg-indigo-100 text-indigo-700" : "bg-white text-gray-500 hover:bg-gray-100"}`
        }`}
      >
        <Users size={compact ? 14 : 18} />
        {!compact && <span className="hidden sm:inline">O'quvchilar</span>}
        <span className={`rounded-full bg-gray-900 text-white font-semibold ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"}`}>
          {onlineCount}/{participants.length}
        </span>
      </button>

      {open && createPortal(
        <>
          {/* Mobil: pastdan chiqadigan sheet, orqa fonni qoraytiradi */}
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="O'quvchilar ro'yxati"
            className="classroom-panel-in z-40 bg-white ring-1 ring-black/5 fixed inset-x-0 bottom-0 rounded-t-2xl shadow-2xl max-h-[75vh] sm:inset-x-auto sm:bottom-auto sm:rounded-2xl sm:shadow-xl sm:w-[min(20rem,calc(100vw-2rem))] sm:max-h-[min(28rem,calc(100vh-6rem))] sm:origin-top-right"
            style={desktopPos ? { top: desktopPos.top, right: desktopPos.right } : undefined}
          >
            <div className="overflow-hidden rounded-t-2xl sm:rounded-2xl">
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
        </>,
        document.body,
      )}
    </div>
  );
}
