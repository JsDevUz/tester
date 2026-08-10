import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, MonitorPlay, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiMyFreeSessionHistory, apiDeleteClassSession, type FreeClassHistoryItem } from "../api/classroom";
import { AppShell } from "../components/AppShell";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const min = Math.max(1, Math.round(ms / 60000));
  return `${min} min`;
}

export function FreeClassHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FreeClassHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<FreeClassHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiMyFreeSessionHistory();
      setItems(data);
    } catch {
      toast.error("Tarixni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDeleteClassSession(deleteTarget.id);
      toast.success("Dars o'chirildi");
      setDeleteTarget(null);
      void reload();
    } catch {
      toast.error("Darsni o'chirib bo'lmadi");
    } finally {
      setDeleting(false);
    }
  };

  const handleReplayClick = (item: FreeClassHistoryItem) => {
    const recordings = item.recordings ?? [];
    if (recordings.length >= 1) {
      navigate(`/classroom-history/${item.id}/replay?recordingId=${recordings[0].id}`);
    } else {
      navigate(`/classroom-history/${item.id}/replay`);
    }
  };

  useEffect(() => { void reload(); }, [reload]);

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 p-6 w-full">
          <div className="rounded-2xl bg-white p-5">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Mening darslarim (erkin)</p>
            {loading ? (
              <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Hozircha erkin darslar o'tkazilmagan</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900">{item.title ?? item.pdfName ?? "Erkin dars"}</span>
                      <span className="text-xs text-gray-400">{fmtDate(item.startedAt)}</span>
                    </div>
                    {item.status === "active" ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">jonli</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={12} />{fmtDuration(item.startedAt, item.endedAt)}</span>
                    )}
                    <span className="flex-1" />
                    {/* Faqat to'liq (ovozli) replay */}
                    {item.status === "ended" && (item.recordingMode === "full" || item.recordingMode === "boardAudio") && (
                      <button
                        type="button"
                        onClick={() => handleReplayClick(item)}
                        title="To'liq (ovozli) ko'rish"
                        className="flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700"
                      >
                        <MonitorPlay size={14} />
                      </button>
                    )}
                    {item.status === "ended" && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        title="O'chirish"
                        className="flex shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 p-2 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni o'chirish">
              <div className="flex items-center gap-2 text-red-600">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <Trash2 size={20} />
                </div>
                <h3 className="text-base font-semibold text-gray-900">Darsni o'chirish</h3>
              </div>
              <p className="text-xs text-gray-600">
                Haqiqatan ham bu darsni va unga bog'langan barcha audio yozuvlar, chizmalar va ma'lumotlarni o'chirib tashlamoqchimisiz? Bu amalni qaytarib bo'lmaydi.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "O'chirilmoqda..." : "Ha, o'chirish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
