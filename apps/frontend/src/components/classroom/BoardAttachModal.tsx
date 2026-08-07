import { useEffect, useRef, useState } from "react";
import {
  Presentation, X, Check, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { apiListBoards, type BoardItem } from "../../api/boards";

interface Props {
  onAttachExisting: (boardId: string) => Promise<void>;
  onClose: () => void;
}

function fmtShortMonthDay(iso: string | null | undefined): string {
  if (!iso) return "May 1";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "May 1, 2026";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PAGE_SIZE = 12;

export function BoardAttachModal({ onAttachExisting, onClose }: Props) {
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiListBoards()
      .then((res) => {
        if (!cancelled) setBoards(res);
      })
      .catch(() => {
        if (!cancelled) toast.error("Doskalar ro'yxatini yuklab bo'lmadi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Infinite Scroll Observer
  useEffect(() => {
    if (loading || displayCount >= boards.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, boards.length));
        }
      },
      { root: bodyRef.current, threshold: 0.1 }
    );
    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);
    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [loading, displayCount, boards.length]);

  const handleConfirmExisting = async () => {
    if (!selectedBoardId) return;
    setSubmitting(true);
    try {
      await onAttachExisting(selectedBoardId);
      onClose();
    } catch {
      toast.error("Doskani biriktirib bo'lmadi");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleBoards = boards.slice(0, displayCount);
  const hasMore = displayCount < boards.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onPointerDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white text-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 ">
              <Presentation size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Mavjud doska tanlash</h2>
              <p className="text-xs text-gray-500">Ilgari yaratilgan doskalardan birini tanlang ({boards.length} ta)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — Pure List layout */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 border border-gray-200/80" />
              ))}
            </div>
          ) : boards.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Presentation size={36} className="mx-auto mb-3 text-gray-400 opacity-60" />
              <p className="text-sm font-semibold text-gray-700">Mavjud doskalar topilmadi</p>
              <p className="mt-1 text-xs text-gray-400">Avval "Yangi doska" orqali doska yarating</p>
            </div>
          ) : (
            <div className="w-full space-y-1.5 divide-y divide-gray-100">
              {visibleBoards.map((b) => {
                const isSelected = selectedBoardId === b.id;
                const modifiedStr = fmtShortMonthDay(b.startedAt);
                const createdStr = fmtShortDate(b.startedAt);

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBoardId(b.id)}
                    className={`group flex items-center justify-between py-3 px-3 rounded-xl transition-all duration-150 cursor-pointer select-none border ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/70 ring-1 ring-indigo-400/50 shadow-sm"
                        : "border-transparent hover:bg-gray-100/70 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    {/* Left: Presentation Icon + Title + Subtitle */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20"
                        }`}
                      >
                        <Presentation size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-sm truncate transition-colors ${
                            isSelected
                              ? "font-bold text-indigo-950 dark:text-indigo-200"
                              : "font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                          }`}
                        >
                          {b.title ?? "Untitled"}
                        </span>
                        <span
                          className={`text-xs truncate ${
                            isSelected ? "text-indigo-700 dark:text-indigo-300/80 font-medium" : "text-gray-500 dark:text-zinc-400"
                          }`}
                        >
                          Modified by JSDEV, {modifiedStr}
                        </span>
                      </div>
                    </div>

                    {/* Right: Date, Owner, Selection Check */}
                    <div className="flex items-center gap-6 shrink-0">
                      <span
                        className={`text-xs w-16 text-right hidden sm:inline-block ${
                          isSelected ? "text-indigo-800 dark:text-indigo-300 font-semibold" : "text-gray-500 dark:text-zinc-400 font-normal"
                        }`}
                      >
                        {modifiedStr}
                      </span>

                      <span
                        className={`text-xs w-24 text-right hidden md:inline-block ${
                          isSelected ? "text-indigo-800/90 dark:text-indigo-300/80 font-medium" : "text-gray-400 dark:text-zinc-500 font-normal"
                        }`}
                      >
                        {createdStr}
                      </span>

                      <span
                        className={`text-xs uppercase tracking-wider w-14 text-right hidden sm:inline-block ${
                          isSelected ? "text-indigo-900 dark:text-indigo-200 font-bold" : "text-gray-500 dark:text-zinc-400 font-medium"
                        }`}
                      >
                        JSDEV
                      </span>

                      {/* Selection Check Circle */}
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                            : "border-gray-300 dark:border-zinc-700 bg-gray-100 dark:bg-zinc-800/60 text-transparent group-hover:border-gray-400 dark:group-hover:border-zinc-500"
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Infinite Scroll Sentinel */}
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4 text-xs text-indigo-600 gap-2 font-semibold">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Ko'proq doskalar yuklanmoqda...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200/70 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmExisting()}
            disabled={!selectedBoardId || submitting}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {submitting ? (
              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <Check size={15} />
            )}
            <span>{submitting ? "Biriktirilmoqda..." : "Doskani biriktirish"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
