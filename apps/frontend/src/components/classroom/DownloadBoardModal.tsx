import { BookOpen, FileText, Loader2 } from "lucide-react";

interface Props {
  submitting: boolean;
  onSelect: (mode: "pdf" | "notebook") => void;
  onClose: () => void;
}

export function DownloadBoardModal({ submitting, onSelect, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="w-80 rounded-3xl bg-white p-6">
        <p className="mb-1 text-sm font-semibold text-gray-800">Yuklab olish</p>
        <p className="mb-5 text-sm text-gray-400">
          Qaysi taxtani PDF sifatida yuklab olmoqchisiz?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSelect("notebook")}
            className="flex items-center gap-2.5 rounded-2xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BookOpen size={16} className="text-gray-400" />
            Daftar
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSelect("pdf")}
            className="flex items-center gap-2.5 rounded-2xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={16} className="text-gray-400" />
            PDF
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? "Tayyorlanmoqda..." : "Bekor qilish"}
          </button>
        </div>
      </div>
    </div>
  );
}
