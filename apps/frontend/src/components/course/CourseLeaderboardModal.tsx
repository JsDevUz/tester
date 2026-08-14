import { useEffect, useState } from "react";
import { Star, Trophy, X } from "lucide-react";
import {
  apiGetMyCourseLeaderboard,
  type ApiMyCourse,
  type ApiMyCourseLeaderboard,
} from "../../api/groups";
import { UserAvatar } from "../UserAvatar";

interface CourseLeaderboardModalProps {
  course: ApiMyCourse;
  onClose: () => void;
}

export function CourseLeaderboardModal({
  course,
  onClose,
}: CourseLeaderboardModalProps) {
  const [leaderboard, setLeaderboard] = useState<ApiMyCourseLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGetMyCourseLeaderboard(course.courseId)
      .then((data) => {
        if (active) setLeaderboard(data);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError?.response?.data?.message ?? "Reytingni yuklab bo‘lmadi.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [course.courseId]);

  const topThree = leaderboard?.entries.slice(0, 3) ?? [];
  const remaining = leaderboard?.entries.slice(3) ?? [];
  const rankStyle: Record<number, { podium: string; avatar: string }> = {
    1: { podium: "order-2 h-32 bg-amber-400", avatar: "bg-amber-400" },
    2: { podium: "order-1 h-24 bg-slate-300", avatar: "bg-slate-400" },
    3: { podium: "order-3 h-20 bg-orange-300", avatar: "bg-orange-400" },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-gradient-to-br from-cyan-600 via-sky-600 to-indigo-600 p-4 text-white shadow-2xl sm:rounded-3xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label="Kurs peshqadamlari"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-white/70">
              {course.courseTitle}
            </p>
            <h2 className="mt-0.5 flex items-center gap-2 text-xl font-bold">
              <Trophy size={20} className="text-amber-300" /> Peshqadamlar
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20"
            aria-label="Yopish"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-white/75">
            Reyting yuklanmoqda...
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-red-100">{error}</p>
        ) : leaderboard?.entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/75">
            Hali reyting uchun o‘quvchilar yo‘q.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-end justify-center gap-2 sm:gap-4">
              {[topThree[1], topThree[0], topThree[2]]
                .filter(Boolean)
                .map((entry) => {
                  const style = rankStyle[entry.rank];
                  return (
                    <div
                      key={entry.studentId}
                      className="flex w-[30%] max-w-40 flex-col items-center mb-0"
                    >
                      <div className="relative mb-2">
                        <UserAvatar
                          name={entry.studentName}
                          avatarUrl={entry.studentAvatarUrl}
                          className={`h-11 w-12 rounded-full border-2 border-white/70 text-sm font-bold text-white shadow-lg ${style.avatar}`}
                        />
                        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-gray-800">
                          {entry.rank}
                        </span>
                      </div>
                      <p className="w-full truncate text-center text-xs font-semibold">
                        {entry.studentName}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-amber-100">
                        <Star size={11} fill="currentColor" /> {entry.starsEarned}
                      </p>
                      <div
                        className={`mt-2 flex w-full items-center justify-center rounded-t-xl text-3xl font-black text-white/90 ${style.podium}`}
                      >
                        {entry.rank}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="mt-4 space-y-2">
              {remaining.map((entry) => (
                <div
                  key={entry.studentId}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${
                    entry.isCurrentStudent
                      ? "bg-white/25 ring-1 ring-white/50"
                      : "bg-white/15"
                  }`}
                >
                  <span className="w-6 text-center text-sm font-bold text-white/80">
                    {entry.rank}
                  </span>
                  <UserAvatar
                    name={entry.studentName}
                    avatarUrl={entry.studentAvatarUrl}
                    className="h-8 w-8 rounded-full bg-white/20 text-xs font-bold"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {entry.studentName}
                      {entry.isCurrentStudent ? " (Siz)" : ""}
                    </p>
                    <p className="text-[11px] text-white/70">
                      {entry.lessonsCompleted}/{entry.lessonsTotal} dars
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-1 text-xs font-bold text-amber-950">
                    <Star size={12} fill="currentColor" /> {entry.starsEarned}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
