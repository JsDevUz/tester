import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Radio, Plus, ChevronRight, Users2, User, Inbox } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { NewLiveSessionModal } from "../components/NewLiveSessionModal";
import { apiListLiveSessions, type LiveSessionHistoryItem } from "../api/live";
import { formatDateTime } from "../utils/date";
import { PageSizeSelect } from "../components/PaginationControls";

export function LiveCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<LiveSessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [showModal, setShowModal] = useState(!!searchParams.get("testId"));
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
      const rows = await apiListLiveSessions(pageSize, offsetRef.current);
      setSessions((prev) => (reset ? rows : [...prev, ...rows]));
      offsetRef.current += rows.length;
      if (rows.length < pageSize) setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    loadMore(true);
  }, [pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRowClick(s: LiveSessionHistoryItem) {
    if (s.status === "active") navigate(`/live/host/${s.pin}`);
    else navigate(`/tests/${s.testId}/submissions`);
  }

  return (
    <AppShell>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 w-full px-6 py-6">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2 min-w-0">
              <Radio size={20} className="text-gray-700 shrink-0" />
              <h2 className="text-lg font-bold text-gray-800 truncate">
                Jonli musobaqalar
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
              <button
                onClick={() => setShowModal(true)}
                title="Yangi jonli musobaqa yaratish"
                className="flex items-center gap-1.5 text-sm bg-indigo-500 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-xl font-semibold hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-100 shrink-0"
              >
                <Plus size={16} />{" "}
                <span className="hidden sm:inline">Yangi jonli musobaqa</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Inbox size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Hali live sessiya yaratilmagan.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleRowClick(s)}
                  className="w-full bg-white rounded-2xl px-4 py-3.5 flex items-center gap-2 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.mode === "team" ? "bg-purple-50" : "bg-blue-50"
                      }`}
                  >
                    {s.mode === "team" ? (
                      <Users2 size={16} className="text-purple-500" />
                    ) : (
                      <User size={16} className="text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {s.testName}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg shrink-0 ${s.status === "active"
                        ? "bg-green-50 text-green-600"
                        : "bg-gray-100 text-gray-500"
                      }`}
                  >
                    {s.status === "active" ? "Faol" : "Tugagan"}
                  </span>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              ))}

              {hasMore && (
                <button
                  onClick={() => loadMore(false)}
                  disabled={loadingMore}
                  className="mt-2 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Yuklanmoqda..." : "Ko'proq yuklash"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <NewLiveSessionModal
          initialTestId={searchParams.get("testId")}
          onClose={() => setShowModal(false)}
        />
      )}
    </AppShell>
  );
}
