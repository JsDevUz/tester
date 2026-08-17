import { useState } from 'react';
import { X } from 'lucide-react';

interface PromptModalProps {
  title: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptModal({ title, placeholder, initialValue, confirmLabel, onConfirm, onClose }: PromptModalProps) {
  const [value, setValue] = useState(initialValue ?? '');

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:items-center sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:max-w-sm sm:rounded-3xl shadow-2xl text-[var(--text-primary)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder={placeholder}
            className="w-full rounded-xl bg-[var(--card-bg)] border border-slate-200/60 dark:border-white/5 py-2 px-3 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="mt-3.5 w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {confirmLabel ?? 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
