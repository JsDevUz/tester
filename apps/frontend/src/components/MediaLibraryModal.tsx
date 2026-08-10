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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-bold text-gray-800">{TITLE[type]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-5 pt-3">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${tab === "library"
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600"
              }`}
          >
            Kutubxonadan tanlash
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${tab === "upload"
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600"
              }`}
          >
            Yangi yuklash
          </button>
        </div>

        <div className="max-h-[60vh] min-h-[280px] overflow-y-auto p-5">
          {tab === "library" ? (
            loading ? (
              <p className="py-10 text-center text-sm text-gray-400">
                Yuklanmoqda...
              </p>
            ) : assets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-400">
                <Icon size={28} className="opacity-50" />
                <p className="text-sm">Hali fayl yuklanmagan</p>
                <button
                  type="button"
                  onClick={() => setTab("upload")}
                  className="mt-1 text-xs font-semibold text-gray-700 underline"
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
                    className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100 ring-1 ring-transparent transition-all hover:ring-2 hover:ring-gray-900"
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
                    className="flex items-center gap-2 rounded-xl bg-gray-50 px-3.5 py-3 text-left transition-colors hover:bg-gray-100"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-800">
                        {asset.originalName}
                      </span>
                      <span className="block truncate text-xs text-gray-400">
                        {asset.uploaderName}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
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
                className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload size={16} />
                {uploading ? "Yuklanmoqda..." : "Fayl tanlash"}
              </button>
              <p className="max-w-xs text-xs text-gray-400">
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
