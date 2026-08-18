import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import {
  apiActiveClassSessions,
  type ActiveClassSession,
} from "../../api/classroom";
import { apiActiveTestPins, type ActiveTestPin } from "../../api/submissions";

export function StudentActiveBanners({
  className = "",
}: {
  className?: string;
}) {
  const navigate = useNavigate();
  const [liveClassSessions, setLiveClassSessions] = useState<
    ActiveClassSession[]
  >([]);
  const [activeTestPins, setActiveTestPins] = useState<ActiveTestPin[]>([]);

  useEffect(() => {
    const loadSessions = () => {
      apiActiveClassSessions()
        .then(setLiveClassSessions)
        .catch(() => {});
    };
    const loadPins = () => {
      apiActiveTestPins()
        .then(setActiveTestPins)
        .catch(() => setActiveTestPins([]));
    };

    loadSessions();
    loadPins();
    const timer = window.setInterval(() => {
      loadSessions();
      loadPins();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (liveClassSessions.length === 0 && activeTestPins.length === 0) return null;

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {liveClassSessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => navigate(`/classroom/${s.id}`)}
          className="glass-card flex w-full items-center gap-3 rounded-2xl bg-red-500/10 border border-red-500/25 px-4 py-3.5 text-left transition-all hover:bg-red-500/15 cursor-pointer shadow-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
            <Radio
              size={20}
              className="text-red-500 motion-safe:animate-pulse"
            />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
              Jonli dars ketmoqda — {s.courseName}
            </span>
            <span className="block text-xs font-semibold text-[var(--text-muted)]">
              Darsga kirish uchun bosing
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-red-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-600 transition-colors">
            Kirish
          </span>
        </button>
      ))}
      {activeTestPins.map((pin) => (
        <button
          key={pin.testId}
          type="button"
          onClick={() => navigate(`/t/${pin.slug}`)}
          className="glass-card flex w-full items-center gap-3 rounded-2xl bg-red-500/10 border border-red-500/25 px-4 py-3.5 text-left transition-all hover:bg-red-500/15 cursor-pointer shadow-sm"
        >
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
            <Radio
              size={20}
              className="text-red-500 motion-safe:animate-pulse"
            />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
              Imtihon boshlandi — {pin.testName}
            </span>
            <span className="block text-xs font-semibold text-[var(--text-muted)]">
              Kirish uchun bosing
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-red-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-600 transition-colors">
            Kirish
          </span>
        </button>
      ))}
    </div>
  );
}
