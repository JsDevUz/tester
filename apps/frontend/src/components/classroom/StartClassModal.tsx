import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCourseStore } from "../../stores/courseStore";
import { apiListGroups, type ApiGroup } from "../../api/groups";
import { apiActiveClassSessions, apiCreateClassSession } from "../../api/classroom";

interface Props {
  onClose: () => void;
}

// Kurslar sahifasi tepasidagi "Jonli dars" tugmasidan ochiladi: jonli dars
// har doim aniq bitta guruhga bog'lanadi (davomat/kirish huquqi shu orqali
// aniqlanadi), shuning uchun boshlashdan oldin kurs va guruh tanlanadi.
export function StartClassModal({ onClose }: Props) {
  const navigate = useNavigate();
  const courses = useCourseStore((s) => s.courses);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setGroups([]);
      return;
    }
    setLoadingGroups(true);
    apiListGroups(courseId)
      .then(setGroups)
      .catch(() => toast.error("Guruhlarni yuklab bo'lmadi"))
      .finally(() => setLoadingGroups(false));
  }, [courseId]);

  async function handleStart(group: ApiGroup) {
    setStarting(group.id);
    try {
      const active = await apiActiveClassSessions();
      const existing = active.find((s) => s.groupId === group.id);
      if (existing) {
        navigate(`/classroom/host/${existing.id}`);
        return;
      }
      const { id } = await apiCreateClassSession(group.id);
      navigate(`/classroom/host/${id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni boshlab bo'lmadi");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Jonli dars boshlash</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {!courseId ? (
          <div className="flex-1 overflow-y-auto">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Kursni tanlang</p>
            {courses.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Hali kurs yaratilmagan</p>
            ) : (
              <div className="flex flex-col gap-1">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCourseId(c.id)}
                    className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <button type="button" onClick={() => setCourseId(null)} className="mb-2 text-xs font-semibold text-gray-400 hover:text-gray-600">
              ← Kursni o'zgartirish
            </button>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Guruhni tanlang</p>
            {loadingGroups ? (
              <p className="py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
            ) : groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Bu kursda guruh yo'q</p>
            ) : (
              <div className="flex flex-col gap-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={starting !== null}
                    onClick={() => void handleStart(g)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {g.name}
                    {starting === g.id && <span className="text-xs text-gray-400">Ochilmoqda...</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
