import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
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
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
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
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex items-center gap-3 px-2 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-800">{fmtDate(s.startedAt)}</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} />{fmtDuration(s.startedAt, s.endedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
