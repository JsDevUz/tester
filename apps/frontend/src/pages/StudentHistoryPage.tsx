import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Trophy, BookOpen, ThumbsUp, Search } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
import { StudentActiveBanners } from "../components/student/StudentActiveBanners";
import { apiGetMySubmissions, type Submission } from "../api/submissions";
import { formatDateTime } from "../utils/date";

const PAGE_SIZE = 10;

// Accepts either a bare test code or a full jamm.uz/t/<code> link (with any
// query string) - a curator naturally shares the deep link, but this input
// is also usable with just the trailing code.
function extractTestCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/t\/([^/?#\s]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

export function StudentHistoryPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  function openTestByCode() {
    const code = extractTestCode(codeInput);
    if (!code) return;
    setCodeInput("");
    navigate(`/t/${code}`);
  }

  async function loadMore(reset = false) {
    if (reset) {
      offsetRef.current = 0;
      setSubmissions([]);
      setHasMore(true);
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiGetMySubmissions(PAGE_SIZE, offsetRef.current);
      setSubmissions((prev) => (reset ? rows : [...prev, ...rows]));
      offsetRef.current += rows.length;
      if (rows.length < PAGE_SIZE) setHasMore(false);
    } catch {
      setError(
        "Ma'lumotlarni yuklab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.",
      );
      if (!reset) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadMore(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        loadMore(false);
      }
    },
    [hasMore, loadingMore, loading],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, {
      threshold: 0.1,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  return (
    <StudentShell>
      <div className="student-responsive-panel w-full overflow-hidden rounded-3xl">
        <div className="student-responsive-panel-section px-4 py-5 lg:p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">Amaliyotlar</h1>
          <div className="mt-4 flex items-center gap-2.5">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openTestByCode();
              }}
              placeholder="Test kodini kiriting"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 flex-1 rounded-xl bg-white dark:bg-black/30 border border-black/10 dark:border-white/10 px-4 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs placeholder:text-[var(--text-muted)] transition-all"
            />
            <button
              type="button"
              onClick={openTestByCode}
              disabled={!extractTestCode(codeInput)}
              className="grid h-11 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Search size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-2 lg:px-6">
          <StudentActiveBanners />
        </div>

        <div className="student-responsive-panel-section px-4 pb-6 pt-4 lg:px-6">
          <div className="mb-3.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Amaliyotlar tarixi
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-black/10 dark:border-white/15 border-t-indigo-600" />
            </div>
          ) : error && submissions.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-muted)]">
              <p className="mx-auto max-w-xs text-xs leading-5">{error}</p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)] opacity-70">
                Yangilash uchun yuqoridan pastga torting
              </p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-muted)]">
              <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-xs font-semibold">Hali ishlangan testlar yo'q.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {submissions.map((s) => {
                const pct = s.total
                  ? Math.round(((s.score ?? 0) / s.total) * 100)
                  : 0;
                const isGood = pct >= 70;
                const isMid = pct >= 40 && pct < 70;
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/history/${s.id}`)}
                    className="student-responsive-card flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-all hover:bg-[var(--card-hover)] active:scale-[0.99] cursor-pointer"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isGood
                        ? "bg-emerald-500/10 text-emerald-500"
                        : isMid
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-red-500/10 text-red-500"
                        }`}
                    >
                      {isGood ? (
                        <Trophy size={18} />
                      ) : isMid ? (
                        <ThumbsUp size={18} />
                      ) : (
                        <BookOpen size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                        {s.testName ?? "Test"}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {s.submittedAt
                          ? formatDateTime(s.submittedAt)
                          : "Topshirilmagan"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-xs font-bold ${isGood ? "text-emerald-500" : isMid ? "text-amber-500" : "text-red-400"}`}
                        >
                          {pct}%
                        </p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)]">
                          {s.score ?? 0}/{s.total ?? 0}
                        </p>
                      </div>
                      <ChevronRight size={15} className="text-[var(--text-muted)] opacity-60" />
                    </div>
                  </button>
                );
              })}

              <div ref={sentinelRef} className="flex justify-center py-2">
                {loadingMore && (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/10 dark:border-white/15 border-t-indigo-600" />
                )}
                {!hasMore && submissions.length > 0 && (
                  <p className="text-[11px] font-semibold text-[var(--text-muted)]">Hammasi yuklandi</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
