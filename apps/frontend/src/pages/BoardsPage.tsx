import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Presentation, Plus, Trash2, Link2, MoreVertical, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "../components/AppShell";
import { apiListBoards, apiCreateBoard, apiDeleteBoard, type BoardItem } from "../api/boards";
import { useAuthStore } from "../stores/authStore";

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
  const ownerName = useAuthStore((s) => s.admin?.name?.trim() || "O'qituvchi");
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
      <div className="p-3 sm:p-6 max-w-[1400px] mx-auto min-h-screen text-[var(--text-primary)]">
        {/* Header Section */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 py-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">Mening doskalarim</h1>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Chizmalar va doskalaringiz ro'yxati
            </p>
          </div>

          <button
            type="button"
            onClick={() => { setNewTitle(""); setShowCreateModal(true); }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer w-fit"
          >
            <Plus size={15} />
            <span>Yangi doska</span>
          </button>
        </div>

        {/* Content - Pure List View */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-[var(--surface-bg)] h-16 w-full shadow-xs" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center rounded-2xl bg-[var(--surface-bg)] shadow-xs">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
              <Presentation size={30} />
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">Hali doskalar yo'q</h2>
            <p className="text-xs text-[var(--text-muted)] mb-5 max-w-xs">
              Yangi doska yarating — PDF, daftar va chizma vositalari bilan ishlang
            </p>
            <button
              type="button"
              onClick={() => { setNewTitle(""); setShowCreateModal(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <Plus size={15} />
              Birinchi doskani yarating
            </button>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <div className="flex flex-col gap-2">
              {boards.slice(0, displayCount).map((board) => {
                const modifiedStr = fmtShortMonthDay(board.startedAt);
                const createdStr = fmtShortDate(board.startedAt);

                return (
                  <div
                    key={board.id}
                    onClick={() => navigate(`/boards/${board.id}`)}
                    className="group flex items-center justify-between py-3 px-4 rounded-2xl bg-[var(--surface-bg)] shadow-xs hover:bg-[var(--card-hover)] transition-colors cursor-pointer select-none"
                  >
                    {/* Left: Icon + Title + Subtitle */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                        <Presentation size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)] text-xs truncate group-hover:text-indigo-500 transition-colors">
                            {board.title ?? "Untitled"}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-[var(--text-muted)] truncate mt-0.5">
                          O'zgartirildi: {ownerName}, {modifiedStr}
                        </span>
                      </div>
                    </div>

                    {/* Right Columns: Dates, Author, Actions */}
                    <div className="flex items-center gap-6 sm:gap-10 shrink-0">
                      {/* Last Modified Date */}
                      <span className="text-xs font-medium text-[var(--text-muted)] w-16 text-right hidden md:inline-block">
                        {modifiedStr}
                      </span>

                      {/* Created Date */}
                      <span className="text-xs font-medium text-[var(--text-muted)] w-24 text-right hidden lg:inline-block">
                        {createdStr}
                      </span>

                      {/* Owner / Author */}
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider w-16 text-right hidden sm:inline-block truncate">
                        {ownerName}
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
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--card-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
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
              <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs font-semibold text-indigo-500 gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span>Ko'proq doskalar yuklanmoqda...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Board context menu */}
      {menuOpenBoardId && menuAnchor && (() => {
        const board = boards.find((b) => b.id === menuOpenBoardId);
        if (!board) return null;
        return (
          <div
            className="fixed z-50 w-44 overflow-hidden rounded-2xl p-1.5 bg-[var(--surface-bg)] shadow-2xl border border-black/10 dark:border-white/10 text-[var(--text-primary)] animate-in fade-in zoom-in-95 duration-150"
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
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
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
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
          onPointerDown={(e) => { if (e.target === e.currentTarget && !creating) setShowCreateModal(false); }}
        >
          <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                <Presentation size={18} />
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Yangi doska yaratish</h2>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">
                Doska nomi (ixtiyoriy)
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !creating) void handleCreate(); }}
                placeholder="Masalan: AI Playground"
                autoFocus
                className="w-full rounded-xl bg-[var(--card-bg)] py-2 px-3 text-xs font-medium text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] disabled:opacity-50 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {creating ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <Plus size={14} />
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 animate-in fade-in duration-150"
          onPointerDown={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div className="glass-card w-full max-w-sm rounded-3xl p-6 shadow-2xl text-[var(--text-primary)] flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 text-red-500">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <Trash2 size={18} />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Doskani o'chirish</h3>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-[var(--text-primary)]">"{deleteTarget.title ?? "Nomsiz doska"}"</span> ni
              va uning barcha chizmalarini o'chirib tashlamoqchimisiz? Bu amalni qaytarib bo'lmaydi.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-xl px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] disabled:opacity-50 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 cursor-pointer"
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
