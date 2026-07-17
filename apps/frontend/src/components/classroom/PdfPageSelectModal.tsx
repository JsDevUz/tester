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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-gray-800">{asset.originalName}</h2>
            <p className="text-xs text-gray-400">Jonli darsga qo'shiladigan sahifalarni tanlang</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-2.5">
          <button
            type="button"
            onClick={toggleAll}
            disabled={!pages}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
          >
            {allSelected ? "Hech birini tanlamaslik" : "Hammasini tanlash"}
          </button>
          <span className="text-xs text-gray-400">{selected.size} / {pages?.length ?? 0} tanlandi</span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {!pages ? (
            <p className="py-10 text-center text-sm text-gray-400">Sahifalar yuklanmoqda...</p>
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
                    className={`group relative overflow-hidden rounded-xl border-2 transition-colors ${
                      isSelected ? "border-indigo-500" : "border-transparent hover:border-gray-200"
                    }`}
                  >
                    <img src={url} alt={`Sahifa ${pageNumber}`} className="aspect-3/4 w-full bg-gray-100 object-cover" />
                    <span
                      className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-white/90 text-gray-400 ring-1 ring-gray-200"
                      }`}
                    >
                      {isSelected ? <Check size={12} /> : pageNumber}
                    </span>
                    <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1 text-[10px] font-medium text-white">
                      {pageNumber}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 p-5">
          <button type="button" onClick={onBack} className="text-sm font-medium text-gray-500 hover:text-gray-700">
            ← Boshqa fayl
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || submitting}
            onClick={() => onConfirm(sortedSelected)}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Qo'shilmoqda..." : `Qo'shish (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
