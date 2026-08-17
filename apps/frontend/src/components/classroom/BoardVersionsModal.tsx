import { useEffect, useState } from "react";
import { Clock, History, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { apiGetBoardVersions, apiRestoreBoardVersion, type BoardVersionItem } from "../../api/boards";

interface Props {
  boardId: string;
  onClose: () => void;
  onRestored?: () => void;
}

function fmtTime(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) +
    ` · ${d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function BoardVersionsModal({ boardId, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<BoardVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGetBoardVersions(boardId)
      .then((data) => {
        if (!cancelled) setVersions(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Versiyalar tarixini yuklab bo'lmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [boardId]);

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      await apiRestoreBoardVersion(boardId, versionId);
      toast.success("Doska tanlangan versiyaga qaytarildi!");
      if (onRestored) onRestored();
      onClose();
    } catch {
      toast.error("Versiyani tiklab bo'lmadi");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
      onPointerDown={(e) => { if (e.target === e.currentTarget && !restoringId) onClose(); }}
    >
      <div className="glass-card flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl text-[var(--text-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <History size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Versiyalar tarixi</h2>
              <p className="text-xs text-gray-500">Ilgari saqlangan taxta versiyalari va tiklash</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={restoringId !== null}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col gap-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-gray-700">Versiyalar tarixi topilmadi</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {versions.map((ver) => {
                const isRestoring = restoringId === ver.id;
                return (
                  <div
                    key={ver.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4 transition-all hover:bg-white hover:shadow-md hover:border-indigo-100"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-900">{ver.label}</span>
                        {ver.id === "current" && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Joriy
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={11} />
                        <span>{fmtTime(ver.timestampMs)}</span>
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
                        <span>{ver.pageCount} sahifa</span>
                        <span>·</span>
                        <span>{ver.strokeCount} chizma</span>
                        {ver.pdfName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[120px] text-indigo-600 font-medium">{ver.pdfName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {ver.id !== "current" && (
                      <button
                        type="button"
                        onClick={() => void handleRestore(ver.id)}
                        disabled={restoringId !== null}
                        className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white  hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                      >
                        {isRestoring ? (
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        <span>{isRestoring ? "Tiklanmoqda..." : "Tiklash"}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
