import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

/** Mikrofon va qo'ng'iroqni tugatish tugmalari orasidagi "⋮" menyu —
 * kamdan-kam ishlatiladigan boshqaruvlarni (yozib olish, havola, yuklab
 * olish, daftar foni) yig'ib turadi, aynan Google Meet uslubida pastdan
 * yuqoriga ochiladi. */
export function ClassroomCallBarMenu({ items, theme = 'light' }: { items: MenuItem[]; theme?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const btnBase = isDark
    ? 'bg-[#3c4043] text-white hover:bg-[#4a4d51]'
    : 'bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8eaed] border border-gray-200/70';

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Ko'proq"
        aria-label="Ko'proq"
        className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all active:scale-95 ${
          open
            ? (isDark ? 'bg-[#5c5e62] text-white' : 'bg-gray-300 text-gray-900')
            : btnBase
        }`}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-52 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => { item.onSelect(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <span className="shrink-0 text-gray-500">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
