import { useEffect, useState } from "react";
import { PenTool, X } from "lucide-react";
import { apiClassHistory, type ClassHistoryItem } from "../../api/classroom";

interface LiveClassPickerModalProps {
  courseId: string;
  onSelect: (classSessionId: string) => void;
  onClose: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return `${mins} daqiqa`;
}

export function LiveClassPickerModal({ courseId, onSelect, onClose }: LiveClassPickerModalProps) {
  const [sessions, setSessions] = useState<ClassHistoryItem[] | null>(null);

  useEffect(() => {
    apiClassHistory(courseId)
      .then((rows) => setSessions(rows.filter((r) => r.status === "ended")))
      .catch(() => setSessions([]));
  }, [courseId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-2 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="font-semibold text-gray-800">Jonli darsni tanlang</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions === null ? (
            <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
          ) : sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Bu kursda yakunlangan jonli darslar yo'q.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {sessions.map((s) => (
                <div key={s.id} className="flex flex-col py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="flex items-center justify-between rounded-xl p-2.5 text-left hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {s.title ?? s.pdfName ?? "Jonli dars"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {fmtDate(s.startedAt)} {s.endedAt ? `· ${fmtDuration(s.startedAt, s.endedAt)}` : ''}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 hover:bg-indigo-100 shrink-0">
                      Tanlash
                    </span>
                  </button>
                  {s.recordings && s.recordings.length > 1 && (
                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l-2 border-indigo-100 pl-3">
                      {s.recordings.map((rec) => (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => onSelect(`${s.id}?recordingId=${rec.id}`)}
                          className="flex items-center justify-between rounded-lg p-2 text-left hover:bg-gray-100 transition-colors"
                        >
                          <div>
                            <span className="block text-xs font-medium text-gray-800">
                              {rec.title ? rec.title : `${rec.partNumber}-qism`}
                            </span>
                            <span className="block text-[10px] text-gray-400">
                              {rec.title ? `${rec.partNumber}-qism • ` : ''}{fmtDate(rec.createdAt)}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-600">
                            <PenTool size={12} /> Qismni tanlash
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
