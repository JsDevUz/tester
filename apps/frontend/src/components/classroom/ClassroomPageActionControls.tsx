import { useState } from "react";
import {
  AlignJustify,
  Copy,
  Eraser,
  Grid3x3,
  Grip,
  MoreVertical,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import type {
  CsNotebookOrientation,
  CsNotebookStyle,
} from "../../api/classroom";

interface ClassroomPageActionControlsProps {
  pageNumber: number;
  notebook: boolean;
  isHost: boolean;
  allowPageCopy?: boolean;
  canRemove?: boolean;
  onInsertPage?: (
    pageNumber: number,
    style?: CsNotebookStyle,
    orientation?: CsNotebookOrientation,
  ) => void;
  onSetNotebookStyle?: (pageNumber: number, style: CsNotebookStyle) => void;
  onRemovePage?: (pageNumber: number) => void;
  onClearPage?: (pageNumber: number) => void;
  onCopyPage: () => void;
}

export function ClassroomPageActionControls({
  pageNumber,
  notebook,
  isHost,
  allowPageCopy = false,
  canRemove = false,
  onInsertPage,
  onSetNotebookStyle,
  onRemovePage,
  onClearPage,
  onCopyPage,
}: ClassroomPageActionControlsProps) {
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [showStylePopup, setShowStylePopup] = useState(false);
  const [stylePopupMode, setStylePopupMode] = useState<"insert" | "set">("insert");
  const [insertOrientation, setInsertOrientation] =
    useState<CsNotebookOrientation>("portrait");
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!isHost && (!allowPageCopy || !notebook)) return null;

  return (
    <>
      <div className="absolute bottom-1 right-1 z-20">
        <button
          type="button"
          onClick={() => {
            setShowStylePopup(false);
            setShowPageMenu((visible) => !visible);
          }}
          title="Sahifa amallari"
          aria-label="Sahifa amallari"
          className="glass flex items-center justify-center rounded-full p-1.5 text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
        >
          <MoreVertical size={13} />
        </button>
        {showPageMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowPageMenu(false)}
            />
            <div className="glass-card absolute bottom-8 right-0 z-20 flex min-w-36 flex-col gap-1 p-1.5 shadow-2xl text-[var(--text-primary)]">
            {isHost && (
              <button
                type="button"
                onClick={() => {
                  setShowPageMenu(false);
                  if (notebook) {
                    setStylePopupMode("insert");
                    setInsertOrientation("portrait");
                    setShowStylePopup(true);
                  } else onInsertPage?.(pageNumber);
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Plus size={14} /> Qo'shish
              </button>
            )}
            {isHost && notebook && (
              <button
                type="button"
                onClick={() => {
                  setShowPageMenu(false);
                  setStylePopupMode("set");
                  setShowStylePopup(true);
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Grid3x3 size={14} /> Naqshlar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowPageMenu(false);
                onCopyPage();
              }}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
            >
              <Copy size={14} /> Nusxalash
            </button>
            {isHost && onClearPage && (
              <button
                type="button"
                onClick={() => {
                  setShowPageMenu(false);
                  onClearPage(pageNumber);
                }}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Eraser size={14} /> Tozalash
              </button>
            )}
            {isHost && (
              <button
                type="button"
                disabled={!canRemove}
                onClick={() => {
                  setShowPageMenu(false);
                  setConfirmRemove(true);
                }}
                title={
                  canRemove
                    ? "O'chirish"
                    : "Kamida bitta sahifa qolishi kerak"
                }
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Trash2 size={14} /> O'chirish
              </button>
            )}
            </div>
          </>
        )}
        {showStylePopup && notebook && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowStylePopup(false)}
            />
            <div className="glass-card absolute bottom-8 right-0 z-20 flex min-w-44 flex-col gap-1 p-2 shadow-2xl text-[var(--text-primary)]">
            {stylePopupMode === "insert" && (
              <div className="mb-1 grid grid-cols-2 gap-1 pb-1">
                {(["portrait", "landscape"] as const).map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    onClick={() => setInsertOrientation(orientation)}
                    title={orientation === "portrait" ? "Portrait" : "Landscape"}
                    aria-label={orientation === "portrait" ? "Portrait" : "Landscape"}
                    className={`flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
                      insertOrientation === orientation
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`block rounded-sm border-2 ${
                        orientation === "portrait" ? "h-5 w-3.5" : "h-3.5 w-5"
                      } ${
                        insertOrientation === orientation
                          ? "border-white"
                          : "border-gray-400"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setShowStylePopup(false);
                if (stylePopupMode === "insert")
                  onInsertPage?.(pageNumber, "grid", insertOrientation);
                else onSetNotebookStyle?.(pageNumber, "grid");
              }}
              title="Katakli"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              <Grid3x3 size={14} /> Katakli
            </button>
            <button
              type="button"
              onClick={() => {
                setShowStylePopup(false);
                if (stylePopupMode === "insert")
                  onInsertPage?.(pageNumber, "lined", insertOrientation);
                else onSetNotebookStyle?.(pageNumber, "lined");
              }}
              title="Yo'l-yo'l"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              <AlignJustify size={14} /> Yo'l-yo'l
            </button>
            <button
              type="button"
              onClick={() => {
                setShowStylePopup(false);
                if (stylePopupMode === "insert")
                  onInsertPage?.(pageNumber, "dot", insertOrientation);
                else onSetNotebookStyle?.(pageNumber, "dot");
              }}
              title="Nuqtali"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              <Grip size={14} /> Nuqtali
            </button>
            <button
              type="button"
              onClick={() => {
                setShowStylePopup(false);
                if (stylePopupMode === "insert")
                  onInsertPage?.(pageNumber, "plain", insertOrientation);
                else onSetNotebookStyle?.(pageNumber, "plain");
              }}
              title="Naqshsiz"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              <Square size={14} /> Naqshsiz
            </button>
            </div>
          </>
        )}
      </div>

      {confirmRemove && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10 dark:bg-black/30 transition-opacity animate-in fade-in duration-150"
            onClick={() => setConfirmRemove(false)}
          />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none p-4">
            <div className="glass-card rounded-3xl shadow-2xl p-6 w-84 pointer-events-auto flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)]">
              <p className="text-base font-bold text-[var(--text-primary)]">
                Sahifani o'chirish
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {pageNumber}-sahifani darsdan o'chirasizmi? Bu amalni qaytarib
                bo'lmaydi.
              </p>
              <div className="flex gap-2 justify-end mt-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemove(false);
                    onRemovePage?.(pageNumber);
                  }}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-xs transition-colors cursor-pointer"
                >
                  O'chirish
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
