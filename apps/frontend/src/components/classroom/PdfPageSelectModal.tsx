import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { apiGetPdfLibraryPages, type PdfLibraryAsset } from "../../api/classroom";

interface Props {
  asset: PdfLibraryAsset;
  onConfirm: (pageNumbers: number[]) => void;
  onBack: () => void;
  onClose: () => void;
  submitting: boolean;
}

// Kutubxonadan tanlangan PDF'ning barcha (avtomatik konvertatsiya qilingan)
// sahifalarini thumbnail sifatida ko'rsatadi — ustoz checkbox bilan kerakli
// sahifalarni tanlab, faqat o'shalarni jonli darsga qo'shadi.
export function PdfPageSelectModal({ asset, onConfirm, onBack, onClose, submitting }: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    apiGetPdfLibraryPages(asset.id)
      .then((res) => {
        if (cancelled) return;
        if (res.status !== 'ready') {
          toast.error("PDF hali tayyor emas");
          onBack();
          return;
        }
        setPages(res.pages);
      })
      .catch(() => { if (!cancelled) toast.error("Sahifalarni yuklab bo'lmadi"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  function toggle(pageNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  }

  function toggleAll() {
    if (!pages) return;
    setSelected((prev) => (prev.size === pages.length ? new Set() : new Set(pages.map((_, i) => i + 1))));
  }

  const sortedSelected = [...selected].sort((a, b) => a - b);
  const allSelected = pages != null && selected.size === pages.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--text-primary)] tracking-tight">{asset.originalName}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Jonli darsga qo'shiladigan sahifalarni tanlang</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-2.5">
          <button
            type="button"
            onClick={toggleAll}
            disabled={!pages}
            className="text-xs font-bold text-indigo-500 hover:text-indigo-600 disabled:opacity-40 cursor-pointer"
          >
            {allSelected ? "Hech birini tanlamaslik" : "Hammasini tanlash"}
          </button>
          <span className="text-xs font-medium text-[var(--text-muted)]">{selected.size} / {pages?.length ?? 0} tanlandi</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-6">
          {!pages ? (
            <p className="py-10 text-center text-xs font-medium text-[var(--text-muted)]">Sahifalar yuklanmoqda...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pages.map((url, idx) => {
                const pageNumber = idx + 1;
                const isSelected = selected.has(pageNumber);
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => toggle(pageNumber)}
                    className={`group relative overflow-hidden rounded-2xl border-2 transition-all cursor-pointer ${
                      isSelected ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-transparent hover:border-indigo-500/40"
                    }`}
                  >
                    <img src={url} alt={`Sahifa ${pageNumber}`} className="aspect-3/4 w-full bg-[var(--card-bg)] object-cover" />
                    <span
                      className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        isSelected ? "bg-indigo-600 text-white shadow-xs" : "bg-white/90 dark:bg-black/80 text-[var(--text-muted)] ring-1 ring-black/10 dark:ring-white/10"
                      }`}
                    >
                      {isSelected ? <Check size={12} /> : pageNumber}
                    </span>
                    <span className="absolute bottom-1.5 left-2 rounded-lg bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                      {pageNumber}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-6 py-4">
          <button type="button" onClick={onBack} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            ← Boshqa fayl
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || submitting}
            onClick={() => onConfirm(sortedSelected)}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {submitting ? "Qo'shilmoqda..." : `Qo'shish (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
