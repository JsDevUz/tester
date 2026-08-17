import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  apiDeletePdfFromLibrary, apiListPdfLibrary, apiPdfLibraryUsage, apiRetryPdfProcessing,
  apiUploadPdfToLibrary, type PdfLibraryAsset, type PdfLibraryUsage,
} from "../../api/classroom";

interface Props {
  onSelect: (asset: PdfLibraryAsset) => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function statusLabel(status: string | null): { text: string; cls: string } | null {
  if (status === 'ready' || status === null) return null;
  if (status === 'processing' || status === 'pending') return { text: 'Tayyorlanmoqda...', cls: 'text-amber-600 bg-amber-500/10' };
  if (status.startsWith('failed')) return { text: 'Xatolik', cls: 'text-red-600 bg-red-500/10' };
  return null;
}

// Jonli dars uchun alohida PDF kutubxonasi — umumiy MediaLibraryModal'dan
// ataylab ajratilgan: bu yerda foydalanuvchi PDF faylning o'zini emas,
// konvertatsiya qilingan sahifa-rasmlarini tanlaydi (keyingi bosqichda).
export function ClassroomPdfLibraryModal({ onSelect, onClose }: Props) {
  const [assets, setAssets] = useState<PdfLibraryAsset[]>([]);
  const [usage, setUsage] = useState<PdfLibraryUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    const [list, usageSummary] = await Promise.all([apiListPdfLibrary(), apiPdfLibraryUsage()]);
    setAssets(list);
    setUsage(usageSummary);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .catch(() => { if (!cancelled) toast.error("Kutubxonani yuklab bo'lmadi"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Infinite Scroll Observer
  useEffect(() => {
    if (loading || displayCount >= assets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + 10, assets.length));
        }
      },
      { root: bodyRef.current, threshold: 0.1 }
    );
    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [loading, displayCount, assets.length]);

  // Konvertatsiya orqa fonda ketayotgan fayllar bo'lsa — holatini kuzatib turamiz
  useEffect(() => {
    const hasPending = assets.some((a) => a.pdfProcessingStatus === 'pending' || a.pdfProcessingStatus === 'processing');
    if (!hasPending) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => { void reload().catch(() => { }); }, 3000);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Fayl hajmi 100 MB dan oshmasligi kerak");
      return;
    }
    setUploading(true);
    try {
      await apiUploadPdfToLibrary(file);
      toast.success("PDF yuklandi, sahifalar tayyorlanmoqda...");
      await reload();
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'LIBRARY_FILE_LIMIT' || code === 'LIBRARY_SIZE_LIMIT') {
        toast.error(err?.response?.data?.message ?? "Kutubxona chegarasiga yetdi — eski fayllarni o'chiring");
      } else {
        toast.error(err?.response?.data?.message ?? "Yuklashda xato yuz berdi");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(assetId: string) {
    setDeletingId(assetId);
    try {
      await apiDeletePdfFromLibrary(assetId);
      toast.success("Fayl o'chirildi");
      await reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetry(assetId: string) {
    try {
      await apiRetryPdfProcessing(assetId);
      toast.success("Qayta tayyorlanmoqda...");
      await reload();
    } catch {
      toast.error("Boshlab bo'lmadi");
    }
  }

  const nearLimit = usage
    ? usage.fileCount >= usage.maxFileCount - 3 || usage.totalBytes >= usage.maxTotalBytes * 0.9
    : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">PDF tanlash</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {usage && (
          <div className={`px-6 py-2.5 text-xs border-b border-[var(--border-subtle)] ${nearLimit ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "text-[var(--text-muted)]"}`}>
            Kutubxona: {formatBytes(usage.totalBytes)} / {formatBytes(usage.maxTotalBytes)} · {usage.fileCount} / {usage.maxFileCount} fayl
            {nearLimit && " — chegaraga yaqin, keraksiz fayllarni o'chiring"}
          </div>
        )}

        <div ref={bodyRef} className="max-h-[60vh] min-h-70 overflow-y-auto p-6">
          {loading ? (
            <p className="py-10 text-center text-xs font-medium text-[var(--text-muted)]">Yuklanmoqda...</p>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--text-muted)]">
              <FileText size={28} className="opacity-50" />
              <p className="text-xs font-medium">Hali PDF yuklanmagan</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                {assets.slice(0, displayCount).map((asset) => {
                  const status = statusLabel(asset.pdfProcessingStatus);
                  const ready = !status;
                  return (
                    <div
                      key={asset.id}
                      className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-colors border border-[var(--border-subtle)] ${ready ? "bg-[var(--card-bg)] hover:bg-[var(--card-hover)] cursor-pointer" : "bg-[var(--card-bg)]"}`}
                      onClick={() => ready && onSelect(asset)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                        {status?.text === 'Tayyorlanmoqda...' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{asset.originalName}</span>
                        <span className="block truncate text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                          {asset.uploaderName} · {formatBytes(asset.sizeBytes)}
                          {asset.pdfPageCount != null && ` · ${asset.pdfPageCount} sahifa`}
                        </span>
                      </span>
                      {status && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.text}</span>
                      )}
                      {status?.text === 'Xatolik' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleRetry(asset.id); }}
                          className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                          title="Qayta urinish"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(asset.id); }}
                        disabled={deletingId === asset.id}
                        className="shrink-0 rounded-xl p-1.5 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40 cursor-pointer transition-colors"
                        title="O'chirish"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {displayCount < assets.length && (
                <div ref={sentinelRef} className="flex items-center justify-center py-2 text-xs font-semibold text-indigo-500">
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Ko'proq yuklanmoqda...
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-6 py-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span>{uploading ? "Yuklanmoqda..." : "Yangi PDF yuklash"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}
