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
          className="flex items-center justify-center rounded-full bg-white/90 p-1 text-gray-400 shadow-md backdrop-blur-sm transition-colors hover:bg-indigo-50 hover:text-indigo-500"
        >
          <MoreVertical size={13} />
        </button>
        {showPageMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowPageMenu(false)}
            />
            <div className="absolute bottom-8 right-0 z-20 flex min-w-36 flex-col gap-1 rounded-xl bg-white p-1.5 shadow-xl">
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
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
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
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
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
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
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
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
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
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="absolute bottom-8 right-0 z-20 flex min-w-44 flex-col gap-1 rounded-xl bg-white p-1.5 shadow-xl">
            {stylePopupMode === "insert" && (
              <div className="mb-1 grid grid-cols-2 gap-1 border-b border-gray-100 pb-1">
                {(["portrait", "landscape"] as const).map((orientation) => (
                  <button
                    key={orientation}
                    type="button"
                    onClick={() => setInsertOrientation(orientation)}
                    title={orientation === "portrait" ? "Portrait" : "Landscape"}
                    aria-label={orientation === "portrait" ? "Portrait" : "Landscape"}
                    className={`flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors ${
                      insertOrientation === orientation
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span
                      className={`block rounded-sm border-2 ${
                        orientation === "portrait" ? "h-5 w-3.5" : "h-3.5 w-5"
                      } ${
                        insertOrientation === orientation
                          ? "border-indigo-500"
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
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setConfirmRemove(false)}
          />
          <div className="fixed z-50 inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 pointer-events-auto">
              <p className="text-sm text-gray-700 mb-1 font-medium">
                Sahifani o'chirish
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {pageNumber}-sahifani darsdan o'chirasizmi? Bu amalni qaytarib
                bo'lmaydi.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-sm px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemove(false);
                    onRemovePage?.(pageNumber);
                  }}
                  className="text-sm px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
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
