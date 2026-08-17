import { BookOpen, FileText, Loader2 } from "lucide-react";

interface Props {
  submitting: boolean;
  onSelect: (mode: "pdf" | "notebook") => void;
  onClose: () => void;
}

export function DownloadBoardModal({ submitting, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="glass-card w-84 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        <p className="mb-1 text-base font-bold text-[var(--text-primary)] tracking-tight">Yuklab olish</p>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Qaysi taxtani PDF sifatida yuklab olmoqchisiz?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSelect("notebook")}
            className="flex items-center gap-2.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-subtle)] px-4 py-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <BookOpen size={16} className="text-indigo-500" />
            <span>Daftar</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSelect("pdf")}
            className="flex items-center gap-2.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-subtle)] px-4 py-3 text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <FileText size={16} className="text-indigo-500" />
            <span>PDF</span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting && <Loader2 size={14} className="animate-spin text-indigo-500" />}
            {submitting ? "Tayyorlanmoqda..." : "Bekor qilish"}
          </button>
        </div>
      </div>
    </div>
  );
}
