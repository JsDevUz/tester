import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Trash2, Upload, X } from "lucide-react";
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
  if (status === 'processing' || status === 'pending') return { text: 'Tayyorlanmoqda...', cls: 'text-amber-600 bg-amber-50' };
  if (status.startsWith('failed')) return { text: 'Xatolik', cls: 'text-red-600 bg-red-50' };
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
    pollRef.current = window.setInterval(() => { void reload().catch(() => {}); }, 3000);
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
    try {
      await apiDeletePdfFromLibrary(assetId);
      toast.success("Fayl o'chirildi");
      await reload();
    } catch {
      toast.error("O'chirib bo'lmadi");
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-800">PDF tanlash</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {usage && (
          <div className={`px-5 py-2.5 text-xs border-b border-gray-100 ${nearLimit ? "bg-amber-50 text-amber-700" : "text-gray-400"}`}>
            Kutubxona: {formatBytes(usage.totalBytes)} / {formatBytes(usage.maxTotalBytes)} · {usage.fileCount} / {usage.maxFileCount} fayl
            {nearLimit && " — chegaraga yaqin, keraksiz fayllarni o'chiring"}
          </div>
        )}

        <div ref={bodyRef} className="max-h-[60vh] min-h-70 overflow-y-auto p-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
              <FileText size={28} className="opacity-50" />
              <p className="text-sm">Hali PDF yuklanmagan</p>
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
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors ${ready ? "bg-gray-50 hover:bg-gray-100 cursor-pointer" : "bg-gray-50"}`}
                      onClick={() => ready && onSelect(asset)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500">
                        {status?.text === 'Tayyorlanmoqda...' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-800">{asset.originalName}</span>
                        <span className="block truncate text-xs text-gray-400">
                          {asset.uploaderName} · {formatBytes(asset.sizeBytes)}
                          {asset.pdfPageCount != null && ` · ${asset.pdfPageCount} sahifa`}
                        </span>
                      </span>
                      {status && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.text}</span>
                      )}
                      {status?.text === 'Xatolik' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleRetry(asset.id); }}
                          className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                          title="Qayta urinish"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(asset.id); }}
                        className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="O'chirish"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {displayCount < assets.length && (
                <div ref={sentinelRef} className="flex items-center justify-center py-3 text-xs text-indigo-600 gap-2 font-medium">
                  <Loader2 size={15} className="animate-spin" />
                  <span>Ko'proq PDF fayllar yuklanmoqda...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={16} />
            {uploading ? "Yuklanmoqda..." : "Yangi PDF yuklash"}
          </button>
        </div>
      </div>
    </div>
  );
}
