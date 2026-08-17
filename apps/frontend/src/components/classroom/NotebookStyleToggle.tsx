import { useEffect, useRef, useState } from "react";
import { Grid3x3, AlignJustify, Grip, Square, Check } from "lucide-react";
import type { CsNotebookStyle } from "../../api/classroom";

const OPTIONS: Array<{ value: CsNotebookStyle; label: string; icon: typeof Grid3x3 }> = [
  { value: "grid", label: "Katakli", icon: Grid3x3 },
  { value: "lined", label: "Yo'l-yo'l", icon: AlignJustify },
  { value: "dot", label: "Nuqtali", icon: Grip },
  { value: "plain", label: "Naqshsiz", icon: Square },
];

/** Daftar foni: katakli / yo'l-yo'l / naqshsiz — ustoz uchun header'da
 * theme-toggle yonida chiqadigan ixcham tanlagich. */
export function NotebookStyleToggle({
  style, onChange,
}: {
  style: CsNotebookStyle;
  onChange: (style: CsNotebookStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const Active = OPTIONS.find((o) => o.value === style)?.icon ?? Grid3x3;

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
        title="Daftar foni"
        className={`glass flex items-center justify-center rounded-full px-2.5 py-1.5 shadow-md transition-all active:scale-95 cursor-pointer ${open ? "text-indigo-600 dark:text-indigo-400 scale-105" : "text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/15"}`}
      >
        <Active size={14} />
      </button>
      {open && (
        <div className="glass-card absolute right-0 top-full z-30 mt-2 w-40 p-1.5 shadow-2xl text-[var(--text-primary)]">
          <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Daftar foni</p>
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${style === option.value ? "bg-indigo-600 text-white shadow-xs" : "text-[var(--text-primary)] hover:bg-[var(--card-hover)]"}`}
            >
              <option.icon size={14} className="shrink-0" />
              <span className="flex-1">{option.label}</span>
              {style === option.value && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
