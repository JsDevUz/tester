import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Trophy, BookOpen, ThumbsUp, Search } from "lucide-react";
import { StudentShell } from "../components/student/StudentShell";
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
      <div className="student-responsive-panel w-full overflow-hidden">
        <div className="student-responsive-panel-section bg-white px-4 py-5 lg:p-5">
          <h1 className="text-2xl font-extrabold text-gray-900">Amaliyotlar</h1>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openTestByCode();
              }}
              placeholder="Test kodini kiriting"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-12 flex-1 rounded-xl bg-gray-100 px-4 text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={openTestByCode}
              disabled={!extractTestCode(codeInput)}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
            >
              <Search size={19} />
            </button>
          </div>
        </div>

        <div className="student-responsive-panel-section px-4 pb-5 pt-4 lg:px-5">
          <div className="mb-3 lg:mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">
              Amaliyotlar tarixi
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border border-gray-200 border-t-gray-900" />
            </div>
          ) : error && submissions.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="mx-auto max-w-xs text-sm leading-6">{error}</p>
              <p className="mt-3 text-xs text-gray-300">
                Yangilash uchun yuqoridan pastga torting
              </p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hali ishlangan testlar yo'q.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
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
                    className="student-responsive-card flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left transition-all hover:bg-gray-50 active:scale-[0.99]"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isGood
                          ? "bg-green-50"
                          : isMid
                            ? "bg-amber-50"
                            : "bg-red-50"
                      }`}
                    >
                      {isGood ? (
                        <Trophy size={18} className="text-green-400" />
                      ) : isMid ? (
                        <ThumbsUp size={18} className="text-amber-400" />
                      ) : (
                        <BookOpen size={18} className="text-red-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[15px] font-bold text-gray-900">
                        {s.testName ?? "Test"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {s.submittedAt
                          ? formatDateTime(s.submittedAt)
                          : "Topshirilmagan"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-base font-bold lg:text-sm ${isGood ? "text-green-500" : isMid ? "text-amber-500" : "text-red-400"}`}
                        >
                          {pct}%
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.score ?? 0}/{s.total ?? 0}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </div>
                  </button>
                );
              })}

              <div ref={sentinelRef} className="flex justify-center py-2">
                {loadingMore && (
                  <div className="h-6 w-6 animate-spin rounded-full border border-gray-200 border-t-gray-900" />
                )}
                {!hasMore && submissions.length > 0 && (
                  <p className="text-xs text-gray-300">Hammasi yuklandi</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
