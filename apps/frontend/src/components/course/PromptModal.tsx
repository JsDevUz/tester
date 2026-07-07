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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white sm:max-w-sm sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder={placeholder}
            className="w-full rounded-2xl bg-gray-50 px-4 py-2.5 text-sm outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="mt-4 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            {confirmLabel ?? 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
