import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Trophy, BookOpen, ThumbsUp } from 'lucide-react';
import { Toolbar } from '../components/Toolbar';
import { apiGetMySubmissions, type Submission } from '../api/submissions';
import { formatDateTime } from '../utils/date';

const LIMIT = 10;

export function StudentHistoryPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  async function loadMore(reset = false) {
    if (reset) {
      offsetRef.current = 0;
      setSubmissions([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiGetMySubmissions(LIMIT, offsetRef.current);
      setSubmissions((prev) => reset ? rows : [...prev, ...rows]);
      offsetRef.current += rows.length;
      if (rows.length < LIMIT) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { loadMore(true); }, []);

  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
      loadMore(false);
    }
  }, [hasMore, loadingMore, loading]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(observerCallback, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [observerCallback]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toolbar />
      <div className="flex-1 w-full px-4 py-5 lg:px-8">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Testlar tarixi</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Hali ishlangan testlar yo'q.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map((s) => {
              const pct = s.total ? Math.round(((s.score ?? 0) / s.total) * 100) : 0;
              const isGood = pct >= 70;
              const isMid = pct >= 40 && pct < 70;
              return (
                <button key={s.id} onClick={() => navigate(`/history/${s.id}`)}
                  className="w-full bg-white rounded-2xl border-2 border-gray-100 px-4 py-4 flex items-center gap-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left active:scale-[0.99]">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isGood ? 'bg-green-50' : isMid ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    {isGood
                      ? <Trophy size={18} className="text-green-400" />
                      : isMid
                      ? <ThumbsUp size={18} className="text-amber-400" />
                      : <BookOpen size={18} className="text-red-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.testName ?? 'Test'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.submittedAt ? formatDateTime(s.submittedAt) : 'Topshirilmagan'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isGood ? 'text-green-500' : isMid ? 'text-amber-500' : 'text-red-400'}`}>
                        {pct}%
                      </p>
                      <p className="text-xs text-gray-400">{s.score ?? 0}/{s.total ?? 0}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </button>
              );
            })}

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
    </div>
  );
}
