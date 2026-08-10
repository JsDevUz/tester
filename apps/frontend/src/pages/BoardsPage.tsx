import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Presentation, Plus, Trash2, Link2, MoreVertical, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "../components/AppShell";
import { apiListBoards, apiCreateBoard, apiDeleteBoard, type BoardItem } from "../api/boards";

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "May 1, 2026";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShortMonthDay(iso: string | null | undefined): string {
  if (!iso) return "May 1";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PAGE_SIZE = 15;

export function BoardsPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BoardItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuOpenBoardId, setMenuOpenBoardId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const data = await apiListBoards();
      setBoards(data);
    } catch {
      toast.error("Doskalar ro'yxatini yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (loading || displayCount >= boards.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, boards.length));
        }
      },
      { threshold: 0.1 }
    );
    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [loading, displayCount, boards.length]);

  useEffect(() => {
    if (!menuOpenBoardId) return;
    const handlePointerDown = () => {
      setMenuOpenBoardId(null);
      setMenuAnchor(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpenBoardId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await apiCreateBoard(newTitle.trim() || "Nomsiz doska");
      toast.success("Doska yaratildi");
      setShowCreateModal(false);
      setNewTitle("");
      navigate(`/boards/${created.id}`);
    } catch {
      toast.error("Doska yaratib bo'lmadi");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDeleteBoard(deleteTarget.id);
      toast.success("Doska o'chirildi");
      setBoards((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Doskani o'chirib bo'lmadi");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-8 max-w-[1400px] mx-auto min-h-screen">
        {/* Header Section */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mening doskalarim</h1>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Chizmalar va doskalaringiz ro'yxati
            </p>
          </div>

          <button
            type="button"
            onClick={() => { setNewTitle(""); setShowCreateModal(true); }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white  hover:bg-indigo-700 active:scale-95 transition-all w-fit"
          >
            <Plus size={16} />
            <span>Yangi doska</span>
          </button>
        </div>

        {/* Content - Pure List View */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-gray-100 h-16 w-full" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50">
              <Presentation size={36} className="text-indigo-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Hali doskalar yo'q</h2>
            <p className="text-sm text-gray-400 mb-6 max-w-xs">
              Yangi doska yarating — PDF, daftar va chizma vositalari bilan ishlang
            </p>
            <button
              type="button"
              onClick={() => { setNewTitle(""); setShowCreateModal(true); }}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white  hover:bg-indigo-700 transition-all"
            >
              <Plus size={16} />
              Birinchi doskani yarating
            </button>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <div className="divide-y divide-gray-100/80">
              {boards.slice(0, displayCount).map((board) => {
                const modifiedStr = fmtShortMonthDay(board.startedAt);
                const createdStr = fmtShortDate(board.startedAt);

                return (
                  <div
                    key={board.id}
                    onClick={() => navigate(`/boards/${board.id}`)}
                    className="group flex items-center justify-between py-3.5 px-3 rounded-xl hover:bg-gray-50/90 transition-all duration-150 cursor-pointer select-none"
                  >
                    {/* Left: Icon + Title + Subtitle */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100/80">
                        <Presentation size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                            {board.title ?? "Untitled"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 truncate">
                          Modified by JSDEV, {modifiedStr}
                        </span>
                      </div>
                    </div>

                    {/* Right Columns: Dates, Author, Star, Actions */}
                    <div className="flex items-center gap-8 sm:gap-12 shrink-0">
                      {/* Last Modified Date */}
                      <span className="text-xs font-normal text-gray-400 w-16 text-right hidden md:inline-block">
                        {modifiedStr}
                      </span>

                      {/* Created Date */}
                      <span className="text-xs font-normal text-gray-400 w-24 text-right hidden lg:inline-block">
                        {createdStr}
                      </span>

                      {/* Owner / Author */}
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider w-14 text-right hidden sm:inline-block">
                        JSDEV
                      </span>

                      {/* Menu Actions */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (menuOpenBoardId === board.id) {
                              setMenuOpenBoardId(null);
                              setMenuAnchor(null);
                              return;
                            }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const spaceBelow = window.innerHeight - rect.bottom;
                            const above = spaceBelow < 120;
                            setMenuAnchor({
                              x: rect.right,
                              y: above ? rect.top : rect.bottom,
                              above,
                            });
                            setMenuOpenBoardId(board.id);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sentinel for Infinite Scroll */}
            {displayCount < boards.length && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs font-semibold text-indigo-600 gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span>Ko'proq doskalar yuklanmoqda...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Board context menu — fixed positioning, never overflows viewport */}
      {menuOpenBoardId && menuAnchor && (() => {
        const board = boards.find((b) => b.id === menuOpenBoardId);
        if (!board) return null;
        return (
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl"
            style={{
              right: window.innerWidth - menuAnchor.x,
              ...(menuAnchor.above
                ? { bottom: window.innerHeight - menuAnchor.y + 4 }
                : { top: menuAnchor.y + 4 }),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpenBoardId(null);
                setMenuAnchor(null);
                const shareUrl = `${window.location.origin}/boards/${board.id}?view=1`;
                void navigator.clipboard.writeText(shareUrl);
                toast.success("Ko'rish havolasi nusxalandi");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Link2 size={14} />
              <span>Havolani nusxalash</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpenBoardId(null);
                setMenuAnchor(null);
                setDeleteTarget(board);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              <span>O'chirish</span>
            </button>
          </div>
        );
      })()}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget && !creating) setShowCreateModal(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Presentation size={20} />
              </div>
              <h2 className="font-semibold text-gray-900">Yangi doska yaratish</h2>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Doska nomi (ixtiyoriy)
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !creating) void handleCreate(); }}
                placeholder="Masalan: AI Playground"
                autoFocus
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? (
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                {creating ? "Yaratilmoqda..." : "Yaratish va ochish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onPointerDown={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-red-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 size={20} />
              </div>
              <h3 className="font-semibold text-gray-900">Doskani o'chirish</h3>
            </div>
            <p className="text-sm text-gray-600">
              <span className="font-semibold">"{deleteTarget.title ?? "Nomsiz doska"}"</span> ni
              va uning barcha chizmalarini o'chirib tashlamoqchimisiz? Bu amalni qaytarib bo'lmaydi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "O'chirilmoqda..." : "O'chirish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
