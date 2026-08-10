import { useNavigate } from "react-router-dom";
import { BookOpen, FileText, Focus, Languages, Mic, Radio } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";

export function ChallengesHubPage() {
  const navigate = useNavigate();

  return (
    <StudentShell>
      <div className="student-responsive-panel w-full overflow-hidden">
        <div className="student-responsive-panel-section bg-white dark:bg-[#30313a] px-4 py-5 lg:p-6 border-b border-gray-100 dark:border-zinc-800/60 lg:border-b-0">
          <h1 className="mb-1 text-2xl font-extrabold text-gray-900 dark:text-zinc-100">Jamm</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-400">
            Bilim va musobaqalar markazi
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <StudentActiveBanners />
        </div>

        <div className="student-responsive-panel-section px-4 pb-6 pt-4 lg:pt-0">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate("/challanges")}
              className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-all"
            >
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <BookOpen size={22} className="text-indigo-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">Challenge-lar</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Turli topshiriqlar</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/live/join")}
              className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-all"
            >
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <Radio size={22} className="text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">
                  Jonli Musobaqalar
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Real vaqtda musobaqa</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/my-tests")}
              className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-all"
            >
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <FileText size={22} className="text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">Mening testlarim</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">O'z testlaringizni tuzing</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/my-dictionaries")}
              className="student-course-card flex min-h-[88px] items-center gap-4 rounded-3xl px-4 py-4 text-left transition-all"
            >
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <Languages size={22} className="text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">Mening lug'atlarim</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">O'z lug'atlaringizni tuzing</p>
              </div>
            </button>

            <div className="student-course-card flex min-h-[88px] cursor-not-allowed items-center gap-4 rounded-3xl px-4 py-4 text-left opacity-60">
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <Mic size={22} className="text-gray-700 dark:text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">Ovozli suhbat</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  Tez orada ishga tushadi
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-zinc-400">
                Tez orada
              </span>
            </div>

            <div className="student-course-card flex min-h-[88px] cursor-not-allowed items-center gap-4 rounded-3xl px-4 py-4 text-left opacity-60">
              <div className="student-course-card-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
                <Focus size={22} className="text-gray-700 dark:text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-950 dark:text-zinc-100">Diqqat</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  Chalg'imasdan dars qiling
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-zinc-400">
                Tez orada
              </span>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
