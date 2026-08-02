import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, MonitorPlay, PenTool, SkipForward, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiReopenFreeSession, apiMyFreeSessionHistory, apiDeleteClassSession, type FreeClassHistoryItem } from "../api/classroom";
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
  const [resumeTarget, setResumeTarget] = useState<FreeClassHistoryItem | null>(null);
  const [resumeTitle, setResumeTitle] = useState("");
  const [recordingsTarget, setRecordingsTarget] = useState<{ item: FreeClassHistoryItem; mode: 'replay' | 'board' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FreeClassHistoryItem | null>(null);
  const [resuming, setResuming] = useState(false);
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

  const handleResume = async () => {
    if (!resumeTarget) return;

    if (resumeTarget.status === "active") {
      navigate(`/classroom/host/${resumeTarget.id}`);
      return;
    }

    setResuming(true);
    try {
      const { id } = await apiReopenFreeSession(resumeTarget.id, resumeTitle);
      navigate(`/classroom/host/${id}`);
    } catch {
      toast.error("Darsni davom ettirib bo'lmadi");
      setResuming(false);
    }
  };

  const handleReplayClick = (item: FreeClassHistoryItem) => {
    const recordings = item.recordings ?? [];
    if (recordings.length > 1) {
      setRecordingsTarget({ item, mode: 'replay' });
    } else if (recordings.length === 1) {
      navigate(`/classroom-history/${item.id}/replay?recordingId=${recordings[0].id}`);
    } else {
      navigate(`/classroom-history/${item.id}/replay`);
    }
  };

  const handleBoardViewClick = (item: FreeClassHistoryItem) => {
    const recordings = item.recordings ?? [];
    if (recordings.length > 1) {
      setRecordingsTarget({ item, mode: 'board' });
    } else if (recordings.length === 1) {
      navigate(`/classroom-history/${item.id}/replay?view=board&recordingId=${recordings[0].id}`);
    } else {
      navigate(`/classroom-history/${item.id}/replay?view=board`);
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
                    {(item.status === "active" || item.hasBoardSnapshot) && (
                      <button
                        type="button"
                        onClick={() => {
                          setResumeTarget(item);
                          setResumeTitle(item.title ?? "");
                        }}
                        title={item.status === "active" ? "Darsga qaytish" : "Davom ettirish"}
                        className="flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                      >
                        <SkipForward size={14} />
                      </button>
                    )}
                    {item.status === "ended" && item.hasBoardSnapshot && (
                      <button
                        type="button"
                        onClick={() => handleBoardViewClick(item)}
                        title="Oxirgi chizma holati"
                        className="flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50"
                      >
                        <PenTool size={14} />
                      </button>
                    )}
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
        {resumeTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget && !resuming) setResumeTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni davom ettirish">
              <h3 className="text-base font-semibold text-gray-900">Darsni davom ettirish</h3>
              <p className="text-xs text-gray-600">
                {resumeTarget.status === "active"
                  ? "Bu dars hali tugallanmagan. O'sha darsga qaytishni xohlaysizmi?"
                  : "Shu darsni davom ettirasizmi? Dars oxirgi saqlangan holati (sahifalar, chizmalar) bilan qayta ochiladi."}
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Dars nomi
                </label>
                <input
                  type="text"
                  value={resumeTitle}
                  onChange={(e) => setResumeTitle(e.target.value)}
                  placeholder="Masalan: 5-dars. Trigonometriya"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
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
                  {resuming ? "Boshlanmoqda..." : resumeTarget.status === "active" ? "Darsga o'tish" : "Davom ettirish"}
                </button>
              </div>
            </div>
          </div>
        )}
        {recordingsTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget) setRecordingsTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Dars qismlari">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-base font-semibold text-gray-800">
                  {recordingsTarget.mode === 'board' ? "Dars chizmalari (qismlari)" : "Dars yozuvlari (qismlari)"}
                </h3>
                <button type="button" onClick={() => setRecordingsTarget(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
              </div>
              <p className="text-xs text-gray-500">
                Bu dars bir necha bor davom ettirilgan. Ko'rmoqchi bo'lgan dars qismini tanlang:
              </p>
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                {(recordingsTarget.item.recordings ?? []).map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => {
                      const targetId = recordingsTarget.item.id;
                      const isBoard = recordingsTarget.mode === 'board';
                      setRecordingsTarget(null);
                      navigate(`/classroom-history/${targetId}/replay?${isBoard ? 'view=board&' : ''}recordingId=${rec.id}`);
                    }}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3 text-left hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    <div>
                      <span className="block text-sm font-semibold text-gray-800">
                        {rec.title ? rec.title : `${rec.partNumber}-qism`}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {rec.title ? `${rec.partNumber}-qism • ` : ""}{fmtDate(rec.createdAt)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium text-indigo-600">
                      {recordingsTarget.mode === 'board' ? (
                        <><PenTool size={14} /> Chizmalar</>
                      ) : (
                        <><MonitorPlay size={14} /> Replay</>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onPointerDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Darsni o'chirish">
              <div className="flex items-center gap-3 text-red-600">
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
