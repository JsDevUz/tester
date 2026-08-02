import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Hand, X } from "lucide-react";

export interface RaisedHandItem {
  userId: string;
  userName: string;
  raisedAt: number;
}

interface Props {
  raisedHands: RaisedHandItem[];
  onLowerAll: () => void;
  onLowerUser: (userId: string) => void;
  /** O'quvchi uchun — lower tugmalari ko'rsatilmaydi */
  readOnly?: boolean;
  theme?: "light" | "dark";
}

const AVATAR_HEX_COLORS = [
  "#e67700",  // orange
  "#087f5b",  // teal
  "#1971c2",  // blue
  "#5f3dc4",  // purple
  "#c2255c",  // pink
  "#2f9e44",  // green
  "#1864ab",  // dark blue
  "#862e9c",  // violet
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_HEX_COLORS[Math.abs(hash) % AVATAR_HEX_COLORS.length];
}

export function RaisedHandsControl({ raisedHands, onLowerAll, onLowerUser, readOnly = false, theme = "dark" }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [desktopPos, setDesktopPos] = useState<{ top: number; right: number } | null>(null);
  const isDark = theme === "dark";

  // Desktop pozitsiyasini tugma joylashuvidan hisoblash
  useEffect(() => {
    if (!open) { setDesktopPos(null); return; }
    const btn = buttonRef.current;
    if (!btn || window.innerWidth < 640) return;
    const rect = btn.getBoundingClientRect();
    setDesktopPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [open]);

  // Outside click / Escape
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

  if (!raisedHands || raisedHands.length === 0) return null;

  const firstUser = raisedHands[0];
  const countMore = raisedHands.length - 1;

  // Theme-aware classes
  const panelBg    = isDark ? "bg-[#202124]"    : "bg-white";
  const borderCls  = isDark ? "border-white/10" : "border-gray-200";
  const titleCls   = isDark ? "text-white"      : "text-gray-900";
  const closeCls   = isDark
    ? "text-white/60 hover:bg-white/10 hover:text-white"
    : "text-gray-400 hover:bg-gray-100 hover:text-gray-700";
  const subTextCls = isDark ? "text-white/50"   : "text-gray-400";
  const lowerBtnCls = isDark
    ? "text-blue-400 hover:text-blue-300"
    : "text-blue-600 hover:text-blue-700";
  const rowHoverCls = isDark ? "hover:bg-white/5" : "hover:bg-gray-50";
  const nameCls     = isDark ? "text-white"       : "text-gray-900";
  const dragHandleCls = isDark ? "bg-white/20"    : "bg-gray-300";
  const lowerIconCls  = isDark
    ? "text-emerald-400 hover:bg-white/10 hover:text-emerald-300"
    : "text-emerald-600 hover:bg-gray-100 hover:text-emerald-700";

  return (
    <div className="relative">
      {/* Green Header Pill Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-[#a8f0b0] px-2 py-1.5 text-xs font-semibold text-[#00210b] shadow-md transition-all hover:bg-[#97e4a0] active:scale-95 sm:px-3 sm:gap-2"
        title="Qo'l ko'targanlar ro'yxati"
      >
        <span className="flex items-center justify-center rounded-full bg-[#0a3818] p-1 text-[#a8f0b0] shrink-0">
          <Hand size={13} />
        </span>
        {/* Ism faqat desktop (sm+) da ko'rinadi */}
        <span className="hidden sm:inline truncate max-w-[140px]">
          {firstUser.userName}{countMore > 0 ? ` + ${countMore} more` : ""}
        </span>
        {/* Mobileda faqat son (1+ bo'lsa) */}
        {countMore > 0 && (
          <span className="sm:hidden text-[10px] font-bold leading-none">
            {raisedHands.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Mobil: orqa fon overlay */}
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel: mobil = bottom sheet, desktop = dropdown */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Qo'l ko'targanlar"
            className={`classroom-panel-in z-50 fixed inset-x-0 bottom-0 rounded-t-2xl shadow-2xl max-h-[75vh] sm:inset-x-auto sm:bottom-auto sm:rounded-2xl sm:w-80 sm:max-h-[min(28rem,calc(100vh-6rem))] sm:origin-top-right border ${panelBg} ${borderCls}`}
            style={desktopPos ? { top: desktopPos.top, right: desktopPos.right } : undefined}
          >
            {/* Drag handle — faqat mobileda */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className={`w-10 h-1 rounded-full ${dragHandleCls}`} />
            </div>

            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${borderCls}`}>
              <h4 className={`text-base font-semibold ${titleCls}`}>
                Qo'l ko'targanlar
              </h4>
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
            <div className="p-3 overflow-y-auto" style={{ maxHeight: "min(340px, 60vh)" }}>
              <div className="flex items-center justify-between pb-3 text-xs">
                <span className={subTextCls}>Birinchidan oxirigacha</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => { onLowerAll(); setOpen(false); }}
                    className={`font-medium hover:underline ${lowerBtnCls}`}
                  >
                    Hammasini tushirish
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {raisedHands.map((item) => {
                  const initial = item.userName.charAt(0).toUpperCase() || "?";
                  return (
                    <div
                      key={item.userId}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${rowHoverCls}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: getAvatarColor(item.userName) }}
                        >
                          {initial}
                        </div>
                        <span className={`truncate text-sm font-medium ${nameCls}`}>
                          {item.userName}
                        </span>
                      </div>

                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => onLowerUser(item.userId)}
                          className={`rounded-full p-1.5 transition-colors shrink-0 ${lowerIconCls}`}
                          title="Qo'lni tushirish"
                        >
                          <Hand size={16} />
                        </button>
                      ) : (
                        <Hand size={16} className="text-emerald-500 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
