import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Calendar,
  ChevronRight,
  Lock,
  FileText,
  LogIn,
  Moon,
  ShieldCheck,
  Sun,
  UserRoundCheck,
} from "lucide-react";
import {
  apiGetPublicTest,
  apiStartSubmission,
  apiGetSubmission,
  type PublicTest,
} from "../api/delivery";
import { apiGetMe } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { formatDateTime } from "../utils/date";

function getApiErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  const response = error.response;
  if (
    typeof response !== "object" ||
    response === null ||
    !("data" in response)
  ) {
    return undefined;
  }

  const data = response.data;
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return undefined;
  }

  return typeof data.message === "string" ? data.message : undefined;
}

export function TakeTestEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isPractice = searchParams.get("practice") === "1";
  const [test, setTest] = useState<PublicTest | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminName = useAuthStore((s) => s.admin?.name ?? null);
  const token = useAuthStore((s) => s.token);
  const { theme, toggleTheme } = useThemeStore();
  const [loggedInName, setLoggedInName] = useState<string | null>(null);

  function handlePublicTestError(error: unknown) {
    const code = getApiErrorCode(error);
    if (code === "AUTH_REQUIRED") {
      navigate(
        `/login?redirect=${encodeURIComponent(`/t/${slug}${isPractice ? "?practice=1" : ""}`)}`,
      );
    } else if (code === "NOT_ASSIGNED") {
      setError("Bu test sizga tayinlanmagan.");
    } else {
      setError("Test topilmadi.");
    }
  }

  useEffect(() => {
    if (adminName) {
      setLoggedInName(adminName);
      setName(adminName);
      return;
    }
    if (token) {
      apiGetMe()
        .then((me) => {
          setLoggedInName(me.name);
          setName(me.name);
        })
        .catch(() => { });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return;
    const sid = searchParams.get("sid");
    const practiceSuffix = isPractice ? "&practice=1" : "";
    if (sid) {
      apiGetSubmission(sid, isPractice)
        .then((sub) => {
          if (sub.status === "submitted") {
            navigate(`/t/${slug}/result?sid=${sid}${practiceSuffix}`, {
              replace: true,
            });
          } else {
            navigate(`/t/${slug}/take?sid=${sid}${practiceSuffix}`, {
              replace: true,
            });
          }
        })
        .catch(() => {
          apiGetPublicTest(slug, isPractice)
            .then(setTest)
            .catch(handlePublicTestError)
            .finally(() => setLoading(false));
        });
      return;
    }
    apiGetPublicTest(slug, isPractice)
      .then(setTest)
      .catch(handlePublicTestError)
      .finally(() => setLoading(false));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setStarting(true);
    try {
      const { submissionId } = await apiStartSubmission(
        slug,
        name.trim(),
        isPractice,
      );
      navigate(
        `/t/${slug}/take?sid=${submissionId}${isPractice ? "&practice=1" : ""}`,
      );
    } catch (err: unknown) {
      const msg = getApiErrorCode(err);
      if (msg === "AUTH_REQUIRED") {
        navigate(
          `/login?redirect=${encodeURIComponent(`/t/${slug}${isPractice ? "?practice=1" : ""}`)}`,
        );
      } else if (msg === "ALREADY_SUBMITTED") {
        setError("Siz bu testni allaqachon ishlagansiz.");
      } else if (msg === "NOT_ASSIGNED") {
        setError("Bu test sizga tayinlanmagan.");
      } else {
        setError("Xato yuz berdi. Qayta urinib ko'ring.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <div className="w-10 h-10 rounded-full border-3 border-indigo-500/20 border-t-indigo-600 animate-spin" />
      </div>
    );

  if (error || !test)
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--app-bg)] p-6 text-[var(--text-primary)]">
        <div className="glass-card max-w-md w-full rounded-3xl p-8 text-center border border-black/5 dark:border-white/10 shadow-lg">
          <p className="text-red-500 font-bold mb-4">{error ?? "Test topilmadi."}</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-6 py-3 rounded-2xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Bosh sahifaga qaytish
          </button>
        </div>
      </div>
    );

  if (test.previousSubmission)
    return (
      <div
        className="flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="glass-card max-w-md w-full rounded-3xl p-8 flex flex-col items-center border border-black/5 dark:border-white/10 shadow-lg">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-5">
              <ShieldCheck size={32} />
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Siz bu testni allaqachon ishlagansiz
            </p>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-6">
              Bu test har bir foydalanuvchiga faqat bir marta ishlash imkonini beradi.
            </p>
            <div className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-8 py-4 mb-6">
              <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {test.previousSubmission.score ?? 0}/{test.previousSubmission.total ?? 0}
              </p>
              <p className="text-xs font-semibold text-[var(--text-muted)] mt-1">Sizning natijangiz</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-md cursor-pointer"
            >
              Bosh sahifaga qaytish
            </button>
          </div>
        </div>
      </div>
    );

  if ((test as any).requireAuth && !token)
    return (
      <div
        className="flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="glass-card max-w-md w-full rounded-3xl p-8 flex flex-col items-center border border-black/5 dark:border-white/10 shadow-lg">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-5">
              <Lock size={30} />
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)] mb-2">
              Kirish talab etiladi
            </p>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-8">
              Bu test faqat tizimga kirgan foydalanuvchilar uchun.
            </p>
            <button
              onClick={() => navigate(`/login?redirect=/t/${slug}`)}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-md cursor-pointer"
            >
              Kirish
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div
      className="flex flex-col bg-[var(--app-bg)] text-[var(--text-primary)] notranslate"
      translate="no"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex-1 overflow-y-auto lg:flex lg:items-center lg:justify-center p-4 sm:p-6">
        <div className="glass-card lg:w-full lg:max-w-xl rounded-3xl shadow-xl border border-black/5 dark:border-white/10 overflow-hidden text-[var(--text-primary)]">
          {/* Top accent bar */}
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

          {/* Card content */}
          <div className="px-6 lg:px-10 pt-8 pb-4 lg:py-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <button
                type="button"
                onClick={() => navigate("/")}
                aria-label="Bosh sahifaga qaytish"
                title="Bosh sahifaga qaytish"
                className="h-10 px-3.5 rounded-2xl bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Bosh sahifa</span>
              </button>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}
                title={theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}
                className="h-10 px-3.5 rounded-2xl bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/10 flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                <span className="hidden sm:inline">
                  {theme === "dark" ? "Yorug'" : "Tungi"}
                </span>
              </button>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-5">
              <FileText size={26} />
            </div>

            {/* Title & description */}
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] leading-tight mb-2">
              {test.name}
            </h1>
            {test.description && (
              <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">
                {test.description}
              </p>
            )}

            {/* Meta chips */}
            {(test.timeLimit || test.deadline) && (
              <div className="flex gap-2 flex-wrap mb-6">
                {test.timeLimit && (
                  <span className="flex items-center gap-1.5 text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl font-bold">
                    <Clock size={13} /> {test.timeLimit} daqiqa
                  </span>
                )}
                {test.deadline && (
                  <span className="flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-xl font-bold">
                    <Calendar size={13} /> {formatDateTime(test.deadline)}
                  </span>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-black/5 dark:bg-white/5 mb-6" />

            {/* Name field */}
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Ismingiz</p>
            <input
              autoFocus={!loggedInName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleStart(e as any);
              }}
              placeholder="Ismingizni kiriting"
              className="w-full bg-black/5 dark:bg-black/25 border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all mb-2"
            />

            {error && <p className="text-xs font-semibold text-red-500 mt-1">{error}</p>}
          </div>

          {/* Bottom button */}
          <div className="shrink-0 px-6 lg:px-10 pb-8">
            <button
              onClick={handleStart}
              disabled={!name.trim() || starting}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-colors shadow-md cursor-pointer"
            >
              {starting ? (
                "Boshlanmoqda..."
              ) : (
                <>
                  <span>Testni boshlash</span>
                  <ChevronRight size={18} />
                </>
              )}
            </button>

            {!token && (
              <div className="mt-5 rounded-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <UserRoundCheck size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      Natijalaringizni saqlab boring
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                      Tizimga kirib so'ng test ishlasangiz, natijalaringizni
                      keyinchalik ham ko‘rishingiz va tahlil qilishingiz mumkin.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/login?redirect=${encodeURIComponent(`/t/${slug}${isPractice ? "?practice=1" : ""}`)}`,
                    )
                  }
                  className="mt-3 w-full py-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-primary)] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogIn size={14} />
                  Tizimga kirish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
