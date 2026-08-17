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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/10 dark:bg-black/30 p-0 sm:items-center sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card flex max-h-[85vh] w-full max-w-md flex-col gap-3.5 overflow-hidden rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-[var(--text-primary)]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Jonli dars boshlash</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-[var(--text-primary)]">
            Dars nomi (ixtiyoriy)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan: 5-dars. Trigonometriya"
            className="w-full rounded-xl bg-[var(--card-bg)] border border-slate-200/60 dark:border-white/5 py-2 px-3 text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <button
          type="button"
          disabled={startingFree || starting !== null}
          onClick={() => void handleStartFree()}
          className="flex items-center gap-3 rounded-2xl bg-[var(--card-bg)] p-3 text-left hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50 group cursor-pointer"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs group-hover:bg-indigo-700 transition-colors">
            <Link2 size={15} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-[var(--text-primary)]">
              Erkin dars
            </span>
            <span className="block text-[11px] font-medium text-[var(--text-muted)] mt-0.5 leading-snug">
              Guruhdan tashqari, havola orqali — login shart emas, davomat yozilmaydi
            </span>
          </span>
          {startingFree && (
            <span className="text-[11px] font-bold text-indigo-500">Ochilmoqda...</span>
          )}
        </button>

        <div className="flex-1 overflow-y-auto min-h-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Yoki kursni tanlang
          </p>
          {courses.length === 0 ? (
            <p className="py-6 text-center text-xs font-medium text-[var(--text-muted)]">
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
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50 cursor-pointer"
                >
                  <span className="truncate">{c.title}</span>
                  {starting === c.id && (
                    <span className="text-[11px] font-medium text-[var(--text-muted)] shrink-0 ml-2">Ochilmoqda...</span>
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
