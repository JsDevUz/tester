import { useEffect, useState } from "react";
import { Activity, Clock, User, X } from "lucide-react";
import { toast } from "sonner";
import { apiGetBoardActivity, type BoardActivityItem } from "../../api/boards";

interface Props {
  boardId: string;
  onClose: () => void;
}

function fmtTime(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) +
    ` · ${d.toLocaleDateString("uz-UZ", { day: "numeric", month: "short" })}`;
}

export function BoardActivityModal({ boardId, onClose }: Props) {
  const [activities, setActivities] = useState<BoardActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGetBoardActivity(boardId)
      .then((data) => {
        if (!cancelled) setActivities(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => {
        if (!cancelled) toast.error("Faoliyat tarixini yuklab bo'lmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [boardId]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Faoliyat tarixi</h2>
              <p className="text-xs text-gray-500">Doska ustida bajarilgan barcha harakatlar lomi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col gap-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-gray-700">Hali harakatlar mavjud emas</p>
            </div>
          ) : (
            <div className="relative pl-4 border-l-2 border-indigo-100 space-y-4">
              {activities.map((act) => (
                <div key={act.id} className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 ring-4 ring-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                  <div className="flex-1 rounded-xl bg-gray-50 p-3 border border-gray-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-900">{act.description}</span>
                      <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(act.timestampMs)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-indigo-600">
                      <User size={11} />
                      <span>{act.userName}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
