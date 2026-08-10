import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import {
  apiListMyChallenges,
  apiJoinChallenge,
  type ApiStudentChallenge,
} from "../api/challenges";

export function ChallengesListPage() {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState<ApiStudentChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    void apiListMyChallenges()
      .then(setChallenges)
      .finally(() => setLoading(false));
  }, []);

  async function handleJoin(challengeId: string) {
    setJoiningId(challengeId);
    try {
      await apiJoinChallenge(challengeId);
      setChallenges((prev) =>
        prev.map((c) => (c.id === challengeId ? { ...c, joined: true } : c)),
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "Qo'shilib bo'lmadi");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-5">
        <button
          type="button"
          onClick={() => navigate("/jamm")}
          className="mb-4 flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={14} /> Orqaga
        </button>
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">
          Challenge-lar
        </h1>
        <p className="mb-6 text-sm text-gray-400">
          Kurslaringizdagi challenge-lari
        </p>

        <StudentActiveBanners className="mb-6" />

        {loading ? (
          <p className="text-sm text-gray-400">Yuklanmoqda...</p>
        ) : challenges.length === 0 ? (
          <div className="student-course-card rounded-3xl py-16 text-center text-gray-300">
            <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Hozircha challenge yo'q</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {challenges.map((c) => (
              <div
                key={c.id}
                onClick={() => c.joined && navigate(`/challanges/${c.id}`)}
                className={`student-course-card rounded-3xl p-4 ${c.joined ? "cursor-pointer" : ""}`}
              >
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="mb-3 h-32 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-32 w-full items-center justify-center rounded-xl bg-gray-100">
                    <BookOpen size={28} className="text-gray-300" />
                  </div>
                )}
                <p className="mb-0.5 text-xs font-medium text-gray-400">
                  {c.courseTitle}
                </p>
                <p className="mb-3 text-base font-bold text-gray-800">
                  {c.name}
                </p>
                {c.joined ? (
                  <span className="inline-block rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">
                    Qo'shilgansiz
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={joiningId === c.id}
                    onClick={() => void handleJoin(c.id)}
                    className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Qo'shilish
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
