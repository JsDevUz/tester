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
    <div className="flex min-h-[520px] flex-col overflow-hidden bg-white notranslate lg:rounded-2xl" translate="no">
      <div className="shrink-0 h-1 bg-linear-to-r from-gray-400 via-purple-400 to-pink-400" />
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => navigate('/challenges')}
          className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={14} /> Orqaga
        </button>
      </div>
      <form
        onSubmit={handleJoin}
        className="flex-1 flex flex-col items-center justify-center px-6"
      >
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-6">
          <Radio size={28} className="text-gray-500" />
        </div>
        <p className="text-xl font-bold text-gray-900 mb-2">
          Jonli musobaqaga kirish
        </p>
        <p className="text-sm text-gray-400 mb-8">
          Ustoz bergan 6 xonali PIN kodni kiriting
        </p>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="w-full max-w-xs text-center text-4xl font-black tracking-[0.3em] bg-gray-50 rounded-2xl border border-border px-4 py-4 outline-none focus:border-gray-400 focus:bg-white transition-colors mb-6"
        />
        <button
          type="submit"
          disabled={pin.length !== 6}
          className="w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg"
        >
          <span>Kirish</span>
          <ChevronRight size={18} />
        </button>
      </form>
    </div>
    </StudentShell>
  );
}
