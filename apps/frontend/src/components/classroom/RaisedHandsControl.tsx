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

export function RaisedHandsControl({ raisedHands, onLowerAll, onLowerUser, readOnly = false, theme: _theme = "dark" }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  return (
    <div className="relative">
      {/* Green Header Pill Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shadow-md transition-all hover:bg-emerald-500/10 active:scale-95 sm:px-3 sm:gap-2 cursor-pointer"
        title="Qo'l ko'targanlar ro'yxati"
      >
        <span className="flex items-center justify-center rounded-full bg-emerald-600 p-1 text-white shrink-0 shadow-xs">
          <Hand size={12} />
        </span>
        {/* Ism faqat desktop (sm+) da ko'rinadi */}
        <span className="hidden sm:inline truncate max-w-[140px]">
          {firstUser.userName}{countMore > 0 ? ` + ${countMore} more` : ""}
        </span>
        {countMore > 0 && (
          <span className="sm:hidden text-[10px] font-bold leading-none">
            {raisedHands.length}
          </span>
        )}
      </button>

      {open && createPortal(
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/10 dark:bg-black/30 transition-opacity animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Qo'l ko'targanlar"
            className="classroom-panel-in glass-card z-50 fixed inset-x-4 bottom-4 top-auto max-h-[80vh] sm:top-14 sm:right-4 sm:left-auto sm:bottom-auto sm:w-88 rounded-3xl p-5 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
                  Qo'l ko'targanlar
                </h4>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {raisedHands.length}
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
            <div className="pt-3 overflow-y-auto flex-1 max-h-[55vh]">
              <div className="flex items-center justify-between pb-3 text-xs">
                <span className="text-[var(--text-muted)] font-medium">Birinchidan oxirigacha</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => { onLowerAll(); setOpen(false); }}
                    className="font-bold text-indigo-500 hover:text-indigo-600 cursor-pointer"
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
                      className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-[var(--card-hover)] text-[var(--text-primary)]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
                          style={{ backgroundColor: getAvatarColor(item.userName) }}
                        >
                          {initial}
                        </div>
                        <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                          {item.userName}
                        </span>
                      </div>

                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => onLowerUser(item.userId)}
                          className="rounded-xl p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors shrink-0 cursor-pointer"
                          title="Qo'lni tushirish"
                        >
                          <X size={15} />
                        </button>
                      ) : (
                        <span className="text-emerald-500 shrink-0 p-1">
                          <Hand size={15} />
                        </span>
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
