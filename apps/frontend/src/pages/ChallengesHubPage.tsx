import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Focus, Mic, Radio } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { ChallengesListPage } from "./ChallengesListPage";

type HubView = "hub" | "challenges";

export function ChallengesHubPage() {
  const [view, setView] = useState<HubView>("hub");
  const navigate = useNavigate();

  if (view === "challenges") {
    return <ChallengesListPage onBack={() => setView("hub")} />;
  }

  return (
    <StudentShell>
      <div className="bg-white px-4 py-5 lg:rounded-2xl lg:p-5">
        <h1 className="mb-1 text-2xl font-extrabold text-gray-900">Jamm</h1>
        <p className="mb-6 text-sm text-gray-400">Kurs ichidagi faolliklar</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => setView("challenges")}
            className="student-course-card rounded-3xl p-5 text-left transition-colors"
          >
            <div className="student-course-card-icon mb-3 grid h-12 w-12 place-items-center rounded-2xl">
              <BookOpen size={22} className="text-gray-700" />
            </div>
            <p className="text-sm font-bold text-gray-950">Challenge-lar</p>
            <p className="mt-1 text-xs text-gray-500">
              Kitobxonlik challenge-lari
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/live/join")}
            className="student-course-card rounded-3xl p-5 text-left transition-colors"
          >
            <div className="student-course-card-icon mb-3 grid h-12 w-12 place-items-center rounded-2xl">
              <Radio size={22} className="text-gray-700" />
            </div>
            <p className="text-sm font-bold text-gray-950">Jonli Musobaqalar</p>
            <p className="mt-1 text-xs text-gray-500">Real vaqtda musobaqa</p>
          </button>

          <div className="student-course-card cursor-not-allowed rounded-3xl p-5 text-left opacity-60">
            <div className="mb-3 flex items-center justify-between">
              <div className="student-course-card-icon grid h-12 w-12 place-items-center rounded-2xl">
                <Mic size={22} className="text-gray-700" />
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Tez orada
              </span>
            </div>
            <p className="text-sm font-bold text-gray-950">Ovozli suhbat</p>
            <p className="mt-1 text-xs text-gray-500">
              Tez orada ishga tushadi
            </p>
          </div>

          <div className="student-course-card cursor-not-allowed rounded-3xl p-5 text-left opacity-60">
            <div className="mb-3 flex items-center justify-between">
              <div className="student-course-card-icon grid h-12 w-12 place-items-center rounded-2xl">
                <Focus size={22} className="text-gray-700" />
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Tez orada
              </span>
            </div>
            <p className="text-sm font-bold text-gray-950">Diqqat</p>
            <p className="mt-1 text-xs text-gray-500">
              Chalg'imasdan dars qiling
            </p>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
