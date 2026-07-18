import { useEffect, useRef, useState } from "react";
import { Grid3x3, AlignJustify, Square, Check } from "lucide-react";
import type { CsNotebookStyle } from "../../api/classroom";

const OPTIONS: Array<{ value: CsNotebookStyle; label: string; icon: typeof Grid3x3 }> = [
  { value: "grid", label: "Katakli", icon: Grid3x3 },
  { value: "lined", label: "Yo'l-yo'l", icon: AlignJustify },
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
        className={`flex items-center justify-center rounded-full border px-2 py-1.5 shadow-md transition-colors ${open ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-gray-100 bg-white text-gray-500 hover:bg-gray-100"}`}
      >
        <Active size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm">
          <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Daftar foni</p>
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors ${style === option.value ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <option.icon size={14} className="shrink-0" />
              <span className="flex-1">{option.label}</span>
              {style === option.value && <Check size={14} className="text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
