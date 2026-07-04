import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Radio, Plus, ChevronRight, Users2, User, Inbox } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { NewLiveSessionModal } from '../components/NewLiveSessionModal';
import { apiListLiveSessions, type LiveSessionHistoryItem } from '../api/live';
import { formatDateTime } from '../utils/date';

const LIMIT = 20;

export function LiveCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<LiveSessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showModal, setShowModal] = useState(!!searchParams.get('testId'));
  const offsetRef = useRef(0);

  async function loadMore(reset = false) {
    if (reset) {
      offsetRef.current = 0;
      setSessions([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const rows = await apiListLiveSessions(LIMIT, offsetRef.current);
      setSessions((prev) => reset ? rows : [...prev, ...rows]);
      offsetRef.current += rows.length;
      if (rows.length < LIMIT) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => { loadMore(true); }, []);

  function handleRowClick(s: LiveSessionHistoryItem) {
    if (s.status === 'active') navigate(`/live/host/${s.pin}`);
    else navigate(`/tests/${s.testId}/submissions`);
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 w-full px-6 py-6">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 min-w-0">
              <Radio size={20} className="text-indigo-500 shrink-0" />
              <h2 className="text-lg font-bold text-gray-800 truncate">Jonli musobaqalar</h2>
            </div>
            <button onClick={() => setShowModal(true)} title="Yangi jonli musobaqa yaratish"
              className="flex items-center gap-1.5 text-sm bg-indigo-500 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-semibold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100 shrink-0">
              <Plus size={16} /> <span className="hidden sm:inline">Yangi jonli musobaqa</span>
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Inbox size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hali live sessiya yaratilmagan.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <button key={s.id} onClick={() => handleRowClick(s)}
                  className="w-full bg-white rounded-2xl border-2 border-gray-100 px-4 py-3.5 flex items-center gap-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    s.mode === 'team' ? 'bg-purple-50' : 'bg-blue-50'
                  }`}>
                    {s.mode === 'team' ? <Users2 size={16} className="text-purple-500" /> : <User size={16} className="text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.testName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(s.createdAt)}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg shrink-0 ${
                    s.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.status === 'active' ? 'Faol' : 'Tugagan'}
                  </span>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}

              {hasMore && (
                <button onClick={() => loadMore(false)} disabled={loadingMore}
                  className="mt-2 py-3 text-sm font-medium text-indigo-500 hover:text-indigo-600 disabled:opacity-50 transition-colors">
                  {loadingMore ? 'Yuklanmoqda...' : 'Ko\'proq yuklash'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewLiveSessionModal
          initialTestId={searchParams.get('testId')}
          onClose={() => setShowModal(false)}
        />
      )}
    </AppShell>
  );
}
