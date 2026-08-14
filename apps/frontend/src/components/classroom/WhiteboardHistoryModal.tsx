import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronDown, Clock, RotateCcw, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  apiGetBoardActivity, apiGetBoardVersions, apiRestoreBoardVersion, apiCreateBoardVersionCheckpoint,
  type BoardActivityItem, type BoardVersionItem,
} from "../../api/boards";

interface Props {
  boardId: string;
  onClose: () => void;
  onSelectActivity?: (item: BoardActivityItem) => void;
  onRestored?: () => void;
}

function fmtDateGroup(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtTimeAmPm(tsMs: number): string {
  const d = new Date(tsMs);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-emerald-600 text-white", "bg-blue-600 text-white", "bg-purple-600 text-white", "bg-amber-600 text-white",
    "bg-rose-600 text-white", "bg-cyan-600 text-white", "bg-indigo-600 text-white",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

export function WhiteboardHistoryModal({ boardId, onClose, onSelectActivity, onRestored }: Props) {
  const [activeTab, setActiveTab] = useState<"activity" | "versions">("activity");
  const [activities, setActivities] = useState<BoardActivityItem[]>([]);
  const [versions, setVersions] = useState<BoardVersionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);

  // Initial Load & Tab Change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (activeTab === "activity") {
      setPage(1);
      apiGetBoardActivity(boardId, 1, 15)
        .then((res) => {
          if (!cancelled) {
            setActivities(res.items);
            setHasMore(res.hasMore);
          }
        })
        .catch(() => { if (!cancelled) toast.error("Faoliyat tarixini yuklab bo'lmadi"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      apiGetBoardVersions(boardId)
        .then((res) => { if (!cancelled) setVersions(res); })
        .catch(() => { if (!cancelled) toast.error("Versiyalarni yuklab bo'lmadi"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [boardId, activeTab]);

  // Real-time polling for new activities every 2 seconds
  useEffect(() => {
    if (activeTab !== "activity") return;
    const interval = setInterval(() => {
      apiGetBoardActivity(boardId, 1, 10)
        .then((res) => {
          if (res.items && res.items.length > 0) {
            setActivities((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newItems = res.items.filter((a) => !existingIds.has(a.id));
              if (newItems.length === 0) return prev;
              return [...newItems, ...prev];
            });
          }
        })
        .catch(() => { });
    }, 2000);
    return () => clearInterval(interval);
  }, [boardId, activeTab]);

  // Real-time polling for versions list every 1.2 seconds
  useEffect(() => {
    if (activeTab !== "versions") return;
    const interval = setInterval(() => {
      apiGetBoardVersions(boardId)
        .then((res) => setVersions(res))
        .catch(() => { });
    }, 1200);
    return () => clearInterval(interval);
  }, [boardId, activeTab]);

  // Load More for Infinite Scroll
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || activeTab !== "activity") return;
    setLoadingMore(true);
    const nextPage = page + 1;
    apiGetBoardActivity(boardId, nextPage, 15)
      .then((res) => {
        setActivities((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newItems = res.items.filter((a) => !existingIds.has(a.id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
        setHasMore(res.hasMore);
      })
      .catch(() => { })
      .finally(() => setLoadingMore(false));
  }, [boardId, page, hasMore, loadingMore, activeTab]);

  // Intersection Observer Sentinel Callback
  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading || loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [loading, loadingMore, hasMore, loadMore]
  );

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      await apiRestoreBoardVersion(boardId, versionId);
      toast.success("Doska tanlangan versiyaga qaytarildi!");
      const updated = await apiGetBoardVersions(boardId);
      setVersions(updated);
      if (onRestored) onRestored();
    } catch {
      toast.error("Versiyani tiklab bo'lmadi");
    } finally {
      setRestoringId(null);
    }
  };

  const handleSaveCheckpoint = async () => {
    setSavingCheckpoint(true);
    try {
      await apiCreateBoardVersionCheckpoint(boardId);
      toast.success("Joriy holat versiya sifatida saqlandi!");
      const res = await apiGetBoardVersions(boardId);
      setVersions(res);
    } catch {
      toast.error("Versiyani saqlab bo'lmadi");
    } finally {
      setSavingCheckpoint(false);
    }
  };

  // Group activities by date
  const groupedActivities: Record<string, BoardActivityItem[]> = {};
  for (const act of activities) {
    const group = fmtDateGroup(act.timestampMs);
    if (!groupedActivities[group]) groupedActivities[group] = [];
    groupedActivities[group].push(act);
  }

  return (
    <div
      className="fixed top-14 right-4 z-[100] w-84 sm:w-96 overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900 tracking-tight">Whiteboard history</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Segmented Control Tabs */}
      <div className="px-5 pt-3 pb-3">
        <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200/80">
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${activeTab === "activity"
              ? "bg-white text-gray-900 "
              : "text-gray-500 hover:text-gray-900"
              }`}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("versions")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${activeTab === "versions"
              ? "bg-white text-gray-900 "
              : "text-gray-500 hover:text-gray-900"
              }`}
          >
            Versions
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="max-h-[65vh] overflow-y-auto px-5 pb-5">
        {loading ? (
          <div className="flex flex-col gap-2.5 py-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : activeTab === "activity" ? (
          Object.keys(groupedActivities).length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock size={28} className="mx-auto mb-2 opacity-50 text-gray-400" />
              <p className="text-xs font-medium">Hali faoliyatlar mavjud emas</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pt-1">
              {Object.entries(groupedActivities).map(([dateLabel, items]) => (
                <div key={dateLabel} className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                    <ChevronDown size={13} />
                    <span>{dateLabel}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {items.map((item) => {
                      const isSelected = selectedActivityId === item.id;
                      const initial = (item.userName || "U").charAt(0).toUpperCase();
                      const avatarBg = getAvatarColor(item.userName || "U");

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedActivityId(item.id);
                            if (onSelectActivity) onSelectActivity(item);
                          }}
                          className={`flex items-center justify-between gap-2 rounded-xl p-2.5 cursor-pointer transition-all border ${isSelected
                            ? "bg-indigo-50 border-indigo-300 text-indigo-950 "
                            : "bg-gray-50 border-gray-200/80 hover:bg-gray-100/80 hover:border-gray-300 text-gray-800"
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold  ${avatarBg}`}>
                              {initial}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-gray-900 leading-tight">
                                {item.userName}
                              </p>
                              <p className="truncate text-[11px] text-gray-600 mt-0.5">
                                {item.description}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] text-gray-400 font-medium">
                            {fmtTimeAmPm(item.timestampMs)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Infinite Scroll Sentinel */}
              <div ref={lastElementRef} className="py-2 text-center">
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500 font-medium">
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    <span>Yana yuklanmoqda...</span>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          /* Versions Tab */
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSaveCheckpoint()}
              disabled={savingCheckpoint}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white  hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {savingCheckpoint ? (
                <Loader2 size={14} className="animate-spin text-white" />
              ) : (
                <Plus size={15} />
              )}
              <span>{savingCheckpoint ? "Saqlanmoqda..." : "Joriy holatni versiya sifatida saqlash"}</span>
            </button>

            {versions.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Clock size={28} className="mx-auto mb-2 opacity-50 text-gray-400" />
                <p className="text-xs font-medium">Versiyalar tarixi topilmadi</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {versions.map((ver) => {
                  const isRestoring = restoringId === ver.id;
                  const isCurrent = !!ver.isCurrent;
                  return (
                    <div
                      key={ver.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-200/80 bg-gray-50 p-3 transition-all hover:bg-gray-100/80"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-gray-900">{ver.label}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                              Joriy
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {fmtDateGroup(ver.timestampMs)} · {fmtTimeAmPm(ver.timestampMs)}
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400 font-medium">
                          {ver.pageCount} sahifa · {ver.strokeCount} chizma
                        </p>
                      </div>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => void handleRestore(ver.id)}
                          disabled={restoringId !== null}
                          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 shrink-0 transition-all active:scale-95"
                        >
                          {isRestoring ? (
                            <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          <span>{isRestoring ? "..." : "Tiklash"}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
