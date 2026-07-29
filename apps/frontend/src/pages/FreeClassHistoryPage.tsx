import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, MonitorPlay, PenTool, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { apiCreateFreeClassSessionFromSnapshot, apiMyFreeSessionHistory, type FreeClassHistoryItem } from "../api/classroom";
import { AppShell } from "../components/AppShell";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `${mins} daqiqa`;
}

export function FreeClassHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FreeClassHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumeTarget, setResumeTarget] = useState<FreeClassHistoryItem | null>(null);
  const [resuming, setResuming] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiMyFreeSessionHistory());
    } catch {
      toast.error("Darslar tarixini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleResume = async () => {
    if (!resumeTarget) return;
    setResuming(true);
    try {
      const { id } = await apiCreateFreeClassSessionFromSnapshot(resumeTarget.id);
      navigate(`/classroom/host/${id}`);
    } catch {
      toast.error("Darsni davom ettirib bo'lmadi");
      setResuming(false);
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
              <div className="flex flex-col divide-y divide-gray-100">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                    <span className="text-sm font-medium text-gray-800">{fmtDate(item.startedAt)}</span>
                    {item.status === "active" ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">jonli</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Clock size={12} />{fmtDuration(item.startedAt, item.endedAt)}</span>
                    )}
                    <span className="flex-1" />
                    {item.hasBoardSnapshot && (
                      <button
                        type="button"
                        onClick={() => setResumeTarget(item)}
                        title="Davom ettirish"
                        className="flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                      >
                        <SkipForward size={14} />
                      </button>
                    )}
                    {item.status === "ended" && item.hasBoardSnapshot && (
                      <button
                        type="button"
                        onClick={() => navigate(`/classroom-history/${item.id}/replay?view=board`)}
                        title="Oxirgi chizma holati"
                        className="flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                      >
                        <PenTool size={14} />
                      </button>
                    )}
                    {item.status === "ended" && (item.recordingMode === "full" || item.recordingMode === "boardAudio") && (
                      <button
                        type="button"
                        onClick={() => navigate(`/classroom-history/${item.id}/replay`)}
                        title="To'liq (ovozli) ko'rish"
                        className="flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700"
                      >
                        <MonitorPlay size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {resumeTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget && !resuming) setResumeTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni davom ettirish">
              <p className="text-sm text-gray-600">Shu darsni davom ettirasizmi? Yangi jonli dars ochiladi va bu darsning oxirgi holati (sahifalar, chizmalar) unga ko'chiriladi.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResumeTarget(null)}
                  disabled={resuming}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => void handleResume()}
                  disabled={resuming}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resuming ? "Boshlanmoqda..." : "Davom ettirish"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
