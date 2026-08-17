import { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreVertical } from "lucide-react";

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect?: () => void;
  subMenu?: MenuItem[];
}

export function ClassroomCallBarMenu({ items }: { items: MenuItem[]; theme?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const [activeSubMenuKey, setActiveSubMenuKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveSubMenuKey(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const activeItem = items.find((i) => i.key === activeSubMenuKey && i.subMenu && i.subMenu.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setActiveSubMenuKey(null);
        }}
        title="Ko'proq"
        aria-label="Ko'proq"
        className={`glass flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all active:scale-95 cursor-pointer ${
          open
            ? 'bg-black/15 dark:bg-white/20 text-indigo-600 dark:text-indigo-400'
            : 'text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/15'
        }`}
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-56">
          {/* Main Menu Panel */}
          <div className="glass-card w-56 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 text-[var(--text-primary)] flex flex-col">
            {items.map((item) => {
              const hasSub = Boolean(item.subMenu && item.subMenu.length > 0);
              const isActiveSub = activeSubMenuKey === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onMouseEnter={() => {
                    if (hasSub) setActiveSubMenuKey(item.key);
                    else setActiveSubMenuKey(null);
                  }}
                  onClick={() => {
                    if (hasSub) {
                      setActiveSubMenuKey((prev) => (prev === item.key ? null : item.key));
                    } else {
                      item.onSelect?.();
                      setOpen(false);
                      setActiveSubMenuKey(null);
                    }
                  }}
                  className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors cursor-pointer ${
                    isActiveSub
                      ? "bg-indigo-600/20 text-indigo-600 dark:text-white font-bold"
                      : "text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white"
                  }`}
                >
                  <span className={`shrink-0 transition-colors ${isActiveSub ? "text-indigo-600 dark:text-white" : "text-[var(--text-muted)] group-hover:text-indigo-600 dark:group-hover:text-white"}`}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {hasSub && (
                    <ChevronRight size={14} className={`shrink-0 transition-transform ${isActiveSub ? "text-indigo-600 dark:text-white rotate-180 sm:rotate-0" : "text-[var(--text-muted)] group-hover:text-indigo-600 dark:group-hover:text-white"}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Submenu Panel (Absolute sibling positioned to the right without shifting main menu) */}
          {activeItem && activeItem.subMenu && (
            <div className="glass-card absolute left-[calc(100%+8px)] top-0 z-40 w-56 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)] flex flex-col">
              {activeItem.subMenu.map((subItem) => (
                <button
                  key={subItem.key}
                  type="button"
                  onClick={() => {
                    subItem.onSelect?.();
                    setOpen(false);
                    setActiveSubMenuKey(null);
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white cursor-pointer"
                >
                  <span className="shrink-0 text-[var(--text-muted)] group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">{subItem.icon}</span>
                  <span className="flex-1 truncate">{subItem.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
