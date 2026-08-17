import { useState } from "react";

const COLORS = [
  "#6366f1",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6B7280",
  "#1f2937",
];

interface Props {
  onSubmit: (name: string, color: string) => void;
  onClose: () => void;
  initial?: { name: string; color: string };
  title?: string;
}

export function NewFolderModal({
  onSubmit,
  onClose,
  initial,
  title = "Yangi papka",
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366f1");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), color);
  }

  return (
    <div className="fixed inset-0 bg-black/10 dark:bg-black/30 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Papka nomi"
            className="rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all placeholder:text-[var(--text-muted)]"
          />
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                  color === c ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent scale-110" : ""
                }`}
                style={{
                  backgroundColor: c,
                }}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              {title === "Yangi papka" ? "Yaratish" : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
