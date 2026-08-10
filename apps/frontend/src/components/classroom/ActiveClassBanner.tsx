import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { apiActiveClassSessions, type ActiveClassSession } from "../../api/classroom";

// Ustoz panelida (kurslar, guruh ichi va h.k.) yuqorida ko'rsatiladi — aktiv
// jonli darslarga bir bosishda o'tish uchun. Guruh sahifasidagi "Darslar"
// tabidan farqli o'laroq bu yerda hech qanday guruh tanlanmagan bo'lishi mumkin.
export function ActiveClassBanner() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ActiveClassSession[]>([]);

  useEffect(() => {
    const load = () => {
      apiActiveClassSessions()
        .then(setSessions)
        .catch(() => { });
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {sessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => navigate(`/classroom/host/${s.id}`)}
          className="flex w-full items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-left transition-colors hover:bg-red-100"
        >
          <Radio size={20} className="shrink-0 animate-pulse text-red-500" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">Jonli dars ketmoqda — {s.courseName}</span>
            <span className="block text-xs text-gray-500">Darsni boshqarish uchun bosing</span>
          </span>
          <span className="shrink-0 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white">Kirish</span>
        </button>
      ))}
    </div>
  );
}
