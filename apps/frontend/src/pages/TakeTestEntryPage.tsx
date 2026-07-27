import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
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
        .catch(() => {});
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
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 rounded-full border-3 border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );

  if (error || !test)
    return (
      <div className="flex items-center justify-center min-h-screen bg-white p-6">
        <p className="text-red-400 text-center">{error ?? "Test topilmadi."}</p>
      </div>
    );

  if (test.previousSubmission)
    return (
      <div
        className="flex flex-col bg-white"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
            <ShieldCheck size={28} className="text-gray-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mb-2">
            Siz bu testni allaqachon ishlagansiz
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Bu test har bir foydalanuvchiga faqat bir marta ishlash imkonini beradi.
          </p>
          <div className="rounded-2xl bg-gray-50 border border-border px-8 py-4">
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {test.previousSubmission.score ?? 0}/{test.previousSubmission.total ?? 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">Sizning natijangiz</p>
          </div>
        </div>
      </div>
    );

  if ((test as any).requireAuth && !token)
    return (
      <div
        className="flex flex-col bg-white"
        style={{
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
            <Lock size={28} className="text-gray-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mb-2">
            Kirish talab etiladi
          </p>
          <p className="text-sm text-gray-400 mb-8">
            Bu test faqat tizimga kirgan foydalanuvchilar uchun.
          </p>
          <button
            onClick={() => navigate(`/login?redirect=/t/${slug}`)}
            className="w-full max-w-xs py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100"
          >
            Kirish
          </button>
        </div>
      </div>
    );

  return (
    <div
      className="flex flex-col bg-white lg:bg-gray-50 notranslate"
      translate="no"
      style={{
        height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Top accent bar — mobile only, desktop card has its own */}
      <div className="shrink-0 h-1 bg-gradient-to-r from-gray-800 via-gray-500 to-gray-300 lg:hidden" />

      <div className="flex-1 overflow-y-auto lg:flex lg:items-center lg:justify-center">
        <div className="test-entry-card lg:w-full lg:max-w-xl lg:bg-white lg:rounded-3xl lg:shadow-xl lg:border lg:border-border lg:overflow-hidden">
          <div className="hidden lg:block h-1.5 bg-gradient-to-r from-gray-800 via-gray-500 to-gray-300" />

          {/* Scrollable content */}
          <div className="px-6 lg:px-10 pt-10 pb-4 lg:py-10">
            <div className="flex items-start justify-between gap-4 mb-6">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileText size={28} className="text-gray-500" />
              </div>

              {/* Test boshlanishidan oldingi rang rejimi */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}
                title={theme === "dark" ? "Yorug' rejim" : "Tungi rejim"}
                className="h-11 px-3.5 rounded-2xl bg-gray-100 text-gray-600 flex items-center gap-2 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                <span className="hidden sm:inline">
                  {theme === "dark" ? "Yorug'" : "Tungi"}
                </span>
              </button>
            </div>

            {/* Title & description */}
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">
              {test.name}
            </h1>
            {test.description && (
              <p className="text-base text-gray-500 mb-5 leading-relaxed">
                {test.description}
              </p>
            )}

            {/* Meta chips */}
            {(test.timeLimit || test.deadline) && (
              <div className="flex gap-2 flex-wrap mb-6">
                {test.timeLimit && (
                  <span className="flex items-center gap-1.5 text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl font-medium">
                    <Clock size={13} /> {test.timeLimit} daqiqa
                  </span>
                )}
                {test.deadline && (
                  <span className="flex items-center gap-1.5 text-sm bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl font-medium">
                    <Calendar size={13} /> {formatDateTime(test.deadline)}
                  </span>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-gray-100 mb-6" />

            {/* Name field */}
            <p className="text-sm font-semibold text-gray-700 mb-2">Ismingiz</p>
            <input
              autoFocus={!loggedInName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleStart(e as any);
              }}
              placeholder="Ismingizni kiriting"
              className="w-full bg-gray-50 rounded-2xl border border-border px-4 py-3.5 text-base outline-none focus:border-gray-400 focus:bg-white transition-colors mb-2"
            />

            {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
          </div>

          {/* Bottom button */}
          <div className="shrink-0 px-6 lg:px-10 pt-3 pb-6 lg:pb-10">
            <button
              onClick={handleStart}
              disabled={!name.trim() || starting}
              className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-lg shadow-indigo-100"
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
              <div className="mt-5 rounded-2xl border border-border bg-gray-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-xl bg-white border border-border flex items-center justify-center text-gray-500">
                    <UserRoundCheck size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">
                      Natijalaringizni saqlab boring
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
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
                  className="mt-3 w-full py-3 rounded-xl bg-white border border-border text-gray-700 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
                >
                  <LogIn size={16} />
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
