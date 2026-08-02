import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, X } from "lucide-react";
import { toast } from "sonner";
import { useCourseStore } from "../../stores/courseStore";
import {
  apiActiveClassSessions,
  apiCreateClassSession,
  apiCreateFreeClassSession,
} from "../../api/classroom";

interface Props {
  onClose: () => void;
}

// Kurslar sahifasi tepasidagi "Jonli dars" tugmasidan ochiladi: sessiya
// kursning o'ziga bog'lanadi (kursdagi barcha guruhlar birga qatnashadi),
// shuning uchun faqat kurs tanlanadi — guruh tanlash shart emas.
// "Erkin dars" esa kursdan butunlay mustaqil — guruhga, davomatga bog'liq
// emas, havolasi orqali login qilmagan mehmon ham kira oladi.
export function StartClassModal({ onClose }: Props) {
  const navigate = useNavigate();
  const courses = useCourseStore((s) => s.courses);
  const [starting, setStarting] = useState<string | null>(null);
  const [startingFree, setStartingFree] = useState(false);
  const [title, setTitle] = useState("");

  async function handleStart(courseId: string) {
    setStarting(courseId);
    try {
      const active = await apiActiveClassSessions();
      const existing = active.find((s) => s.courseId === courseId);
      if (existing) {
        navigate(`/classroom/host/${existing.id}`);
        return;
      }
      const { id } = await apiCreateClassSession(courseId, title);
      navigate(`/classroom/host/${id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni boshlab bo'lmadi");
    } finally {
      setStarting(null);
    }
  }

  async function handleStartFree() {
    setStartingFree(true);
    try {
      const { id } = await apiCreateFreeClassSession(title);
      navigate(`/classroom/host/${id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Darsni boshlab bo'lmadi");
    } finally {
      setStartingFree(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Jonli dars boshlash</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Dars nomi (ixtiyoriy)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan: 5-dars. Trigonometriya"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
        </div>

        <button
          type="button"
          disabled={startingFree || starting !== null}
          onClick={() => void handleStartFree()}
          className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 text-left hover:bg-indigo-100 disabled:opacity-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Link2 size={16} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-gray-900">
              Erkin dars
            </span>
            <span className="block text-xs text-gray-600">
              Guruhdan tashqari, havola orqali — login shart emas, davomat
              yozilmaydi
            </span>
          </span>
          {startingFree && (
            <span className="text-xs text-indigo-500">Ochilmoqda...</span>
          )}
        </button>

        <div className="flex-1 overflow-y-auto">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Yoki kursni tanlang
          </p>
          {courses.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Hali kurs yaratilmagan
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {courses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={starting !== null || startingFree}
                  onClick={() => void handleStart(c.id)}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {c.title}
                  {starting === c.id && (
                    <span className="text-xs text-gray-400">Ochilmoqda...</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
