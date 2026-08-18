import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Radio, ChevronRight } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { StudentShell } from "../components/student/StudentShell";

export function LiveJoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const [pin, setPin] = useState(searchParams.get("pin") ?? "");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 6) return;
    if (!token) {
      navigate(
        `/login?redirect=${encodeURIComponent(`/live/join?pin=${pin}`)}`,
      );
      return;
    }
    navigate(`/live/play/${pin}`);
  }

  return (
    <StudentShell>
      <div className="w-full p-4 lg:p-6 text-[var(--text-primary)]">
        <div className="glass-card max-w-md mx-auto rounded-3xl border border-black/5 dark:border-white/10 overflow-hidden shadow-lg p-6 lg:p-8 text-[var(--text-primary)]">
          <button
            type="button"
            onClick={() => navigate("/jamm")}
            className="mb-6 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl px-3 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Orqaga
          </button>

          <form
            onSubmit={handleJoin}
            className="flex flex-col items-center justify-center text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mb-5">
              <Radio size={30} className="motion-safe:animate-pulse" />
            </div>
            <h1 className="text-xl font-extrabold text-[var(--text-primary)] mb-1.5">
              Jonli musobaqaga kirish
            </h1>
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-6">
              Ustoz bergan 6 xonali PIN kodni kiriting
            </p>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full text-center text-3xl font-black tracking-[0.25em] bg-black/5 dark:bg-black/25 rounded-2xl border border-black/10 dark:border-white/10 px-4 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all mb-6"
            />
            <button
              type="submit"
              disabled={pin.length !== 6}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-colors shadow-md cursor-pointer"
            >
              <span>Kirish</span>
              <ChevronRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </StudentShell>
  );
}
