import { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreVertical } from "lucide-react";

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect?: () => void;
  subMenu?: MenuItem[];
}

export function ClassroomCallBarMenu({ items, theme = 'light' }: { items: MenuItem[]; theme?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const [activeSubMenuKey, setActiveSubMenuKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const btnBase = isDark
    ? 'bg-[#1f2023]/80 backdrop-blur-md ring-1 ring-white/10 text-white hover:bg-[#2a2b2f]/90'
    : 'bg-[#f1f3f4]/85 backdrop-blur-md ring-1 ring-black/5 text-[#1f2023] hover:bg-[#e8eaed]/95 border border-gray-200/70';

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
        className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all active:scale-95 ${
          open
            ? (isDark ? 'bg-[#35363a]/80 backdrop-blur-md ring-1 ring-white/15 text-white' : 'bg-gray-300 text-gray-900')
            : btnBase
        }`}
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl">
          {/* Main Menu Items */}
          {items.map((item) => {
            const hasSub = Boolean(item.subMenu && item.subMenu.length > 0);
            const isActiveSub = activeSubMenuKey === item.key;
            return (
              <div
                key={item.key}
                className="relative"
                onMouseEnter={() => {
                  if (hasSub) setActiveSubMenuKey(item.key);
                  else setActiveSubMenuKey(null);
                }}
                onMouseLeave={(e) => {
                  if (hasSub && !e.currentTarget.contains(e.relatedTarget as Node)) {
                    setActiveSubMenuKey(null);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (hasSub) {
                      setActiveSubMenuKey((prev) => (prev === item.key ? null : item.key));
                    } else {
                      item.onSelect?.();
                      setOpen(false);
                      setActiveSubMenuKey(null);
                    }
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    isActiveSub
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="shrink-0 text-gray-500">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {hasSub && (
                    <ChevronRight size={15} className={`shrink-0 transition-transform ${isActiveSub ? "text-indigo-600 rotate-180 sm:rotate-0" : "text-gray-400"}`} />
                  )}
                </button>

                {/* Submenu Popover — 8px visual gap with invisible hover bridge */}
                {hasSub && isActiveSub && item.subMenu && (
                  <div
                    onMouseEnter={() => setActiveSubMenuKey(item.key)}
                    className="absolute left-full top-0 pl-2.5 z-40 w-[234px] animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="w-56 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/90 p-1.5 shadow-xl backdrop-blur-xl">
                      {item.subMenu.map((subItem) => (
                        <button
                          key={subItem.key}
                          type="button"
                          onClick={() => {
                            subItem.onSelect?.();
                            setOpen(false);
                            setActiveSubMenuKey(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <span className="shrink-0 text-gray-500">{subItem.icon}</span>
                          <span className="flex-1 truncate">{subItem.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
