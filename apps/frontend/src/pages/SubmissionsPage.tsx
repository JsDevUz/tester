import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, Check, Trash2, ChevronRight, ChevronLeft, Inbox } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useTestStore } from '../stores/testStore';
import { apiGetTest, type TestDetail } from '../api/tests';
import { apiGetSubmissions, apiDeleteSubmission, type Submission } from '../api/submissions';
import { formatDateTime } from '../utils/date';

const LIMIT = 10;

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
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Submission | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

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
      const rows = await apiGetSubmissions(testId, LIMIT, offsetRef.current);
      setSubmissions((prev) => reset ? rows : [...prev, ...rows]);
      offsetRef.current += rows.length;
      if (rows.length < LIMIT) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!testId) return;
    loadMore(true);
    if (!storeTest) apiGetTest(testId).then(setFetchedTest).catch(() => {});
  }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps

  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
      loadMore(false);
    }
  }, [hasMore, loadingMore, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  const shareLink = test?.slug ? `${window.location.origin}/t/${test.slug}` : '';

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await apiDeleteSubmission(confirmDelete.id);
    setSubmissions((prev) => prev.filter((s) => s.id !== confirmDelete.id));
    setConfirmDelete(null);
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">
        {/* Header */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors">
          <ChevronLeft size={16} /> Orqaga
        </button>
        <h2 className="text-lg font-bold text-gray-800 mb-4">{test?.name ?? 'Test'} — Natijalar</h2>

        {shareLink && (
          <div className="bg-white rounded-2xl border-2 border-gray-100 px-4 py-3 flex items-center gap-3 mb-4">
            <span className="text-xs text-gray-400 flex-1 truncate">{shareLink}</span>
            <button onClick={copyLink} className="flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-700 shrink-0 transition-colors">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Nusxalandi' : 'Nusxalash'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Inbox size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Hali natijalar yo'q.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map((sub) => {
              const pct = sub.total ? Math.round(((sub.score ?? 0) / sub.total) * 100) : 0;
              const isGood = pct >= 70;
              const isMid = pct >= 40 && pct < 70;
              return (
                <div key={sub.id}
                  onClick={() => navigate(`/submissions/${sub.id}`)}
                  className="group bg-white rounded-2xl border-2 border-gray-100 px-4 py-4 flex items-center gap-3 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/30 transition-all active:scale-[0.99]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{sub.studentName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sub.submittedAt ? formatDateTime(sub.submittedAt) : 'Topshirilmagan'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'}`}>
                      {pct}%
                    </p>
                    <p className="text-xs text-gray-400">{sub.score ?? 0}/{sub.total ?? 0}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(sub); }}
                    className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 shrink-0 p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </div>
              );
            })}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="py-2 flex justify-center">
              {loadingMore && (
                <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
              )}
              {!hasMore && submissions.length > 0 && (
                <p className="text-xs text-gray-300">Hammasi yuklandi</p>
              )}
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDelete(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm font-semibold text-gray-800 mb-1">Natijani o'chirish</p>
              <p className="text-sm text-gray-400 mb-5">"{confirmDelete.studentName}" natijasi o'chiriladimi?</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)} className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700">Bekor qilish</button>
                <button onClick={handleDelete}
                  className="text-sm px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600">
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </AppShell>
  );
}
