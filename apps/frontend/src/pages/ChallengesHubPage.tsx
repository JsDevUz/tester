import { useNavigate } from "react-router-dom";
import { BookOpen, Focus, Mic, Radio } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";

export function ChallengesHubPage() {
  const navigate = useNavigate();

  return (
    <StudentShell>
      <div className="student-responsive-panel px-4 py-5 min-[1025px]:p-5">
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Jamm</h1>
        <p className="mb-6 text-sm text-gray-400">
          Bilim va musobaqalar markazi
        </p>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => navigate("/challanges")}
            className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-colors"
          >
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <BookOpen size={22} className="text-indigo-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-950">Challenge-lar</p>
              <p className="mt-1 text-xs text-gray-500">Turli topshiriqlar</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/live/join")}
            className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-colors"
          >
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <Radio size={22} className="text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-950">
                Jonli Musobaqalar
              </p>
              <p className="mt-1 text-xs text-gray-500">Real vaqtda musobaqa</p>
            </div>
          </button>

          <div className="student-course-card flex min-h-[88px] cursor-not-allowed items-center gap-4 rounded-3xl px-4 py-4 text-left opacity-60">
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <Mic size={22} className="text-gray-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-950">Ovozli suhbat</p>
              <p className="mt-1 text-xs text-gray-500">
                Tez orada ishga tushadi
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              Tez orada
            </span>
          </div>

          <div className="student-course-card flex min-h-[88px] cursor-not-allowed items-center gap-4 rounded-3xl px-4 py-4 text-left opacity-60">
            <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
              <Focus size={22} className="text-gray-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-950">Diqqat</p>
              <p className="mt-1 text-xs text-gray-500">
                Chalg'imasdan dars qiling
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              Tez orada
            </span>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
