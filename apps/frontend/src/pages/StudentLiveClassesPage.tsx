import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiMyClassSessions, type StudentClassSessionItem } from "../api/classroom";
import { StudentShell } from "../components/student/StudentShell";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function StudentLiveClassesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<StudentClassSessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiMyClassSessions());
    } catch {
      toast.error("Jonli darslar ro'yxatini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <StudentShell>
      <div className="w-full rounded-2xl bg-white p-4 sm:p-5">
        <h1 className="mb-4 text-lg font-bold text-gray-800">Jonli darslar</h1>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Hozircha jonli darsda qatnashmagansiz</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.hasBoardSnapshot}
                onClick={() => navigate(`/classroom-history/${item.id}/replay?view=board`)}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{item.teacherName}</p>
                  <p className="text-xs text-gray-400">{fmtDate(item.startedAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isFree ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"}`}>
                  {item.isFree ? "Erkin" : "Guruhli"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
