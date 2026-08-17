import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Music, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  apiGetMediaLibrary,
  apiUploadMedia,
  type MediaLibraryAsset,
} from "../api/questions";

const ACCEPT: Record<"image" | "audio" | "file", string> = {
  image: "image/jpeg,image/png,image/gif,image/webp",
  audio: "audio/mpeg,audio/wav,audio/ogg,audio/mp4",
  file: ".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt",
};

const TITLE: Record<"image" | "audio" | "file", string> = {
  image: "Rasm tanlash",
  audio: "Audio tanlash",
  file: "Fayl tanlash",
};

interface MediaLibraryModalProps {
  type: "image" | "audio" | "file";
  folder: "lessons" | "questions" | "payments" | "practice-submissions";
  onSelect: (url: string) => void;
  onClose: () => void;
}

export function MediaLibraryModal({
  type,
  folder,
  onSelect,
  onClose,
}: MediaLibraryModalProps) {
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGetMediaLibrary(type)
      .then((result) => {
        if (!cancelled) setAssets(result);
      })
      .catch(() => {
        if (!cancelled) toast.error("Kutubxonani yuklab bo'lmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Fayl hajmi 50 MB dan oshmasligi kerak");
      return;
    }
    setUploading(true);
    try {
      const result = await apiUploadMedia(file, folder);
      onSelect(result.url);
    } catch {
      toast.error("Yuklashda xato yuz berdi");
    } finally {
      setUploading(false);
    }
  }

  const Icon =
    type === "image" ? ImageIcon : type === "audio" ? Music : FileText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card flex w-full max-w-lg flex-col overflow-hidden rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-4">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">{TITLE[type]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-black/5 dark:border-white/10 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`rounded-t-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${tab === "library"
                ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
          >
            Kutubxonadan tanlash
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`rounded-t-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${tab === "upload"
                ? "border-b-2 border-indigo-600 text-indigo-600 dark:text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
          >
            Yangi yuklash
          </button>
        </div>

        <div className="max-h-[60vh] min-h-[280px] overflow-y-auto py-4">
          {tab === "library" ? (
            loading ? (
              <p className="py-10 text-center text-xs text-[var(--text-muted)]">
                Yuklanmoqda...
              </p>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--text-muted)]">
                <Icon size={28} className="opacity-50" />
                <p className="text-xs">Hali fayl yuklanmagan</p>
                <button
                  type="button"
                  onClick={() => setTab("upload")}
                  className="mt-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Yangi yuklash
                </button>
              </div>
            ) : type === "image" ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset.url)}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 ring-1 ring-transparent transition-all hover:ring-2 hover:ring-indigo-500 cursor-pointer"
                    title={asset.originalName}
                  >
                    <img
                      src={asset.url}
                      alt={asset.originalName}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset.url)}
                    className="flex items-center gap-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3.5 py-3 text-left transition-colors hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-[var(--text-primary)]">
                        {asset.originalName}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--text-muted)]">
                        {asset.uploaderName}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT[type]}
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer shadow-xs"
              >
                <Upload size={16} />
                {uploading ? "Yuklanmoqda..." : "Fayl tanlash"}
              </button>
              <p className="max-w-xs text-xs text-[var(--text-muted)] leading-relaxed">
                Yuklangan fayl avtomatik kutubxonaga qo'shiladi va shu
                maktabdagi boshqa o'qituvchi/kuratorlar ham qayta ishlata oladi.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
