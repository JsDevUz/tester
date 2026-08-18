import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  FileText,
  Focus,
  Languages,
  Mic,
  Radio,
} from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";

export function ChallengesHubPage() {
  const navigate = useNavigate();

  return (
    <StudentShell>
      <div className="w-full overflow-hidden text-[var(--text-primary)]">
        <div className="px-4 py-5 lg:px-6 lg:py-6">
          <h1 className="mb-1 text-2xl font-extrabold text-[var(--text-primary)]">
            Jamm
          </h1>
          <p className="text-xs font-semibold text-[var(--text-muted)]">
            Bilim va musobaqalar markazi
          </p>
        </div>

        <div className="px-4 lg:px-6 pb-4">
          <StudentActiveBanners />
        </div>

        <div className="px-4 lg:px-6 pb-8">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {/* Jonli Musobaqalar */}
            <button
              type="button"
              onClick={() => navigate("/live/join")}
              className="glass-card flex min-h-[92px] items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 shadow-sm hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-500/10 text-red-500">
                <Radio size={22} className="motion-safe:animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Jonli Musobaqalar
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  Real vaqtda musobaqa
                </p>
              </div>
            </button>

            {/* Mening lug'atlarim */}
            <button
              type="button"
              onClick={() => navigate("/my-dictionaries")}
              className="glass-card flex min-h-[92px] items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 shadow-sm hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
                <Languages size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Mening lug'atlarim
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  O'z lug'atlaringizni tuzing
                </p>
              </div>
            </button>

            {/* Mening testlarim */}
            <div className="glass-card flex min-h-[92px] cursor-not-allowed items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 opacity-50">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]">
                <FileText size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Mening testlarim
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  O'z testlaringizni tuzing
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                Tez orada
              </span>
            </div>

            {/* ODAT */}
            <div className="glass-card flex min-h-[92px] cursor-not-allowed items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 opacity-50">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]">
                <CheckCircle2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  ODAT
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  Kun tartibingizni rejalashtiring
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                Tez orada
              </span>
            </div>

            {/* Ovozli suhbat */}
            <div className="glass-card flex min-h-[92px] cursor-not-allowed items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 opacity-50">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]">
                <Mic size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Ovozli suhbat
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  Tez orada ishga tushadi
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                Tez orada
              </span>
            </div>

            {/* Diqqat */}
            <div className="glass-card flex min-h-[92px] cursor-not-allowed items-center gap-4 rounded-3xl p-4.5 text-left border border-black/5 dark:border-white/10 opacity-50">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/5 dark:bg-white/10 text-[var(--text-secondary)]">
                <Focus size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Diqqat
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  Chalg'imasdan dars qiling
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">
                Tez orada
              </span>
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
