import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, Trash2, ChevronLeft, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "../components/AppShell";
import { useTestStore } from "../stores/testStore";
import { apiGetTest, type TestDetail } from "../api/tests";
import {
  apiGetSubmissions,
  apiDeleteSubmission,
  type Submission,
  type SubmissionSortDir,
  type SubmissionSortField,
} from "../api/submissions";
import { formatDateTime, formatElapsedDuration } from "../utils/date";
import { exportSubmissionsToPdf } from "../utils/submissionsPdf";
import { TestStatsModal } from "../components/TestStatsModal";
import { DataLoadingState } from "../components/DataLoadingState";

const PAGE_SIZE = 20;

function elapsedLabel(sub: Submission): string {
  if (!sub.submittedAt) return "—";
  return formatElapsedDuration(sub.startedAt, sub.submittedAt);
}

interface SortButtonProps {
  field: SubmissionSortField;
  label: string;
  sort: SubmissionSortField;
  dir: SubmissionSortDir;
  onChange: (field: SubmissionSortField) => void;
  align?: "left" | "right";
}

function SortButton({ field, label, sort, dir, onChange, align = "left" }: SortButtonProps) {
  const active = sort === field;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onChange(field)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-gray-900 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {label}
      <Icon size={13} className={active ? "opacity-100" : "opacity-40"} />
    </button>
  );
}

export function SubmissionsPage() {
  const { id: testId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tests } = useTestStore();
  const [fetchedTest, setFetchedTest] = useState<TestDetail | null>(null);
  const storeTest = tests.find((t) => t.id === testId);
  const test = storeTest ?? fetchedTest;

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Submission | null>(null);
  const [sort, setSort] = useState<SubmissionSortField>("submittedAt");
  const [dir, setDir] = useState<SubmissionSortDir>("desc");
  const [exporting, setExporting] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  async function handleExportPdf() {
    if (!testId) return;
    setExporting(true);
    try {
      const all: Submission[] = [];
      let offset = 0;
      for (; ;) {
        const rows = await apiGetSubmissions(testId, 200, offset, sort, dir);
        all.push(...rows);
        if (rows.length < 200) break;
        offset += rows.length;
      }
      if (all.length === 0) {
        toast.error("Yuklab olish uchun natija topilmadi");
        return;
      }
      exportSubmissionsToPdf(test?.name ?? "Test", all);
    } catch {
      toast.error("PDF yaratib bo'lmadi");
    } finally {
      setExporting(false);
    }
  }

  async function loadMore(reset = false) {
    if (!testId) return;
    if (reset) {
      offsetRef.current = 0;
      setSubmissions([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiGetSubmissions(testId, PAGE_SIZE, offsetRef.current, sort, dir);
      setSubmissions((prev) => (reset ? rows : [...prev, ...rows]));
      offsetRef.current += rows.length;
      if (rows.length < PAGE_SIZE) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!testId) return;
    loadMore(true);
    if (!storeTest)
      apiGetTest(testId)
        .then(setFetchedTest)
        .catch(() => { });
  }, [testId, sort, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSortChange(field: SubmissionSortField) {
    if (field === sort) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir("desc");
    }
  }

  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        loadMore(false);
      }
    },
    [hasMore, loadingMore, loading],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, {
      threshold: 0.1,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  async function handleDelete() {
    if (!confirmDelete) return;
    await apiDeleteSubmission(confirmDelete.id);
    setSubmissions((prev) => prev.filter((s) => s.id !== confirmDelete.id));
    setConfirmDelete(null);
  }

  return (
    <AppShell>
      <div className="min-h-screen p-4 sm:p-6 text-[var(--text-primary)]">
        <div className="flex min-h-full flex-col gap-4">
          {/* Top Header */}
          <div className="mb-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-2.5 transition-colors cursor-pointer"
            >
              <ChevronLeft size={15} /> Orqaga
            </button>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{test?.name ?? "Test"} — Natijalar</h1>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">O'quvchilar test topshirish natijalari va statistikasi</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatsOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--card-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--card-hover)] cursor-pointer"
                >
                  <BarChart3 size={15} />
                  <span>Statistika</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={exporting || submissions.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>{exporting ? "Tayyorlanmoqda..." : "Yuklab olish"}</span>
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <DataLoadingState label="Natijalar yuklanmoqda..." className="min-h-80" />
          ) : submissions.length === 0 ? (
            <div className="rounded-2xl bg-[var(--surface-bg)] py-16 text-center text-[var(--text-muted)] shadow-xs">
              <Inbox size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs font-medium">Hali natijalar yo'q.</p>
            </div>
          ) : (
            <div>
              {/* Mobile sort controls */}
              <div className="md:hidden flex items-center gap-2 mb-3 text-xs">
                <SortButton field="submittedAt" label="Vaqt" sort={sort} dir={dir} onChange={handleSortChange} />
                <SortButton field="score" label="Ball" sort={sort} dir={dir} onChange={handleSortChange} />
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden flex flex-col gap-2">
                {submissions.map((sub) => {
                  const pct = sub.total
                    ? Math.round(((sub.score ?? 0) / sub.total) * 100)
                    : 0;
                  const isGood = pct >= 70;
                  const isMid = pct >= 40 && pct < 70;
                  const isViolation = sub.mode === "violation";
                  return (
                    <div
                      key={sub.id}
                      onClick={() => navigate(`/submissions/${sub.id}`)}
                      className="rounded-2xl bg-[var(--surface-bg)] px-4 py-3 shadow-xs flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-[var(--card-hover)]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {sub.studentName}
                          </p>
                          {isViolation && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0">
                              <AlertTriangle size={11} />
                              Taqiqlangan
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                          {sub.submittedAt
                            ? formatDateTime(sub.submittedAt)
                            : "Topshirilmagan"}
                        </p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                          Ishlash vaqti: {elapsedLabel(sub)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-xs font-bold ${isGood ? "text-emerald-500" : isMid ? "text-amber-500" : "text-red-400"}`}
                        >
                          {pct}%
                        </p>
                        <p className="text-[11px] font-medium text-[var(--text-muted)]">
                          {sub.score ?? 0}/{sub.total ?? 0}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(sub);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer"
                        aria-label="Natijani o'chirish"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl bg-[var(--surface-bg)] shadow-xs">
                <table className="w-full min-w-[820px] text-left border-collapse">
                  <thead className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-3.5">O'quvchi</th>
                      <th className="px-4 py-3.5">
                        <SortButton field="submittedAt" label="Topshirgan vaqti" sort={sort} dir={dir} onChange={handleSortChange} />
                      </th>
                      <th className="px-4 py-3.5">Ishlash vaqti</th>
                      <th className="px-4 py-3.5 text-right">Foiz</th>
                      <th className="px-4 py-3.5 text-right">
                        <SortButton field="score" label="Ball" sort={sort} dir={dir} onChange={handleSortChange} align="right" />
                      </th>
                      <th className="w-16 px-4 py-3.5 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub) => {
                      const pct = sub.total
                        ? Math.round(((sub.score ?? 0) / sub.total) * 100)
                        : 0;
                      const isGood = pct >= 70;
                      const isMid = pct >= 40 && pct < 70;
                      const isViolation = sub.mode === "violation";
                      return (
                        <tr
                          key={sub.id}
                          onClick={() => navigate(`/submissions/${sub.id}`)}
                          className="cursor-pointer transition-colors hover:bg-[var(--card-hover)]"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-[var(--text-primary)]">
                                {sub.studentName}
                              </p>
                              {isViolation && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                                  <AlertTriangle size={11} />
                                  Taqiqlangan harakat
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-muted)]">
                            {sub.submittedAt
                              ? formatDateTime(sub.submittedAt)
                              : "Topshirilmagan"}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
                            {elapsedLabel(sub)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span
                              className={`text-xs font-bold ${isGood ? "text-emerald-500" : isMid ? "text-amber-500" : "text-red-400"}`}
                            >
                              {pct}%
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right text-xs font-medium text-[var(--text-muted)]">
                            {sub.score ?? 0}/{sub.total ?? 0}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(sub);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 cursor-pointer ml-auto"
                              aria-label="Natijani o'chirish"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sentinel for infinite scroll */}
              <div ref={sentinelRef} className="py-2 flex justify-center">
                {loadingMore && (
                  <div className="w-6 h-6 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
                )}
                {!hasMore && submissions.length > 0 && (
                  <p className="text-xs text-gray-300">Hammasi yuklandi</p>
                )}
              </div>
            </div>
          )}
        </div>

        {statsOpen && testId && (
          <TestStatsModal testId={testId} testName={test?.name ?? "Test"} onClose={() => setStatsOpen(false)} />
        )}

        {confirmDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          >
            <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5">
              <p className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                Natijani o'chirish
              </p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                <span className="font-bold text-[var(--text-primary)]">"{confirmDelete.studentName}"</span> natijasi o'chiriladimi?
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors cursor-pointer"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
