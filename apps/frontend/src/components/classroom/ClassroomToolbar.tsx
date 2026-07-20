import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Circle,
  CircleDashed,
  Eraser,
  Lasso,
  Pen,
  Redo2,
  Square,
  Trash2,
  Type,
  MousePointer2,
  Upload,
} from "lucide-react";
import { type DrawTool } from "./ClassroomPdfViewer";

const COLORS = [
  "#ffffff",
  "#000000",
  "#6b7280",
  "#14b8a6",
  "#38bdf8",
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ef4444",
  "#ec4899",
];

const WIDTHS = [2, 4, 7];

interface Props {
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onOpenPdfLibrary: () => void;
}

export function ClassroomToolbar({
  tool,
  color,
  strokeWidth,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onUndo,
  onClear,
  onOpenPdfLibrary,
}: Props) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const colorPopupRef = useRef<HTMLDivElement>(null);
  const [colorPopupPos, setColorPopupPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!colorMenuRef.current?.contains(target) && !colorPopupRef.current?.contains(target)) setColorMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [colorMenuOpen]);

  useEffect(() => {
    if (!colorMenuOpen) { setColorPopupPos(null); return; }
    const rect = colorButtonRef.current?.getBoundingClientRect();
    if (rect) setColorPopupPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
  }, [colorMenuOpen]);

  useEffect(() => {
    if (!confirmClearOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmClearOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmClearOpen]);

  const iconBtn = (active: boolean) =>
    `relative p-1.5 rounded-xl transition-colors ${active ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`;

  const shortcut = (key: string) => (
    <kbd className="pointer-events-none absolute bottom-0.6 right-1 text-[8px] font-bold leading-none text-gray-500">
      {key}
    </kbd>
  );

  return (
    <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-contain rounded-full border border-gray-100 bg-white px-0.5 py-0.5 shadow-md scrollbar-none [-ms-overflow-style:none]">
      <button
        type="button"
        className={iconBtn(tool === "select")}
        title="Sichqoncha — tanlash (1)"
        onClick={() => onToolChange("select")}
      >
        <MousePointer2 size={15} />
        {shortcut("1")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "pen")}
        title="Qalam (2)"
        onClick={() => onToolChange("pen")}
      >
        <Pen size={15} />
        {shortcut("2")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "text")}
        title="Matn (3)"
        onClick={() => onToolChange("text")}
      >
        <Type size={15} />
        {shortcut("3")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "highlighter")}
        title="Marker (4)"
        onClick={() => onToolChange("highlighter")}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
        {shortcut("4")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "arrow")}
        title="Strelka (5)"
        onClick={() => onToolChange("arrow")}
      >
        <ArrowUpRight size={15} />
        {shortcut("5")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "rectangle")}
        title="To'rtburchak (6)"
        onClick={() => onToolChange("rectangle")}
      >
        <Square size={15} />
        {shortcut("6")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "ellipse")}
        title="Doira (7)"
        onClick={() => onToolChange("ellipse")}
      >
        <Circle size={15} />
        {shortcut("7")}
      </button>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={iconBtn(tool === "eraser-pixel")}
          title="Nuqtaviy o'chirg'ich (8)"
          onClick={() => onToolChange("eraser-pixel")}
        >
          <Eraser size={15} />
          {shortcut("8")}
        </button>
        <button type="button" className={iconBtn(tool === "eraser-stroke")} title="Chizma o'chirg'ich (9)" onClick={() => onToolChange("eraser-stroke")}>
          <CircleDashed size={15} />
          {shortcut("9")}
        </button>
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <button
        type="button"
        className={iconBtn(tool === "lasso")}
        title="Lasso — guruh tanlash (0)"
        onClick={() => onToolChange("lasso")}
      >
        <Lasso size={15} />
        {shortcut("0")}
      </button>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <div ref={colorMenuRef} className="relative px-0.5">
        <button
          ref={colorButtonRef}
          type="button"
          onClick={() => setColorMenuOpen((open) => !open)}
          className={`block h-4 w-4 rounded-full border transition-transform ${colorMenuOpen ? "scale-125 border-gray-800" : "border-gray-300"}`}
          style={{ backgroundColor: color }}
          title="Ranglar palitrasini ochish"
          aria-label="Ranglar palitrasini ochish"
        />
        {colorMenuOpen && colorPopupPos && createPortal(
          <div ref={colorPopupRef} className="fixed z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-gray-100 bg-white px-1.5 py-1 shadow-xl whitespace-nowrap" style={{ top: colorPopupPos.top, left: colorPopupPos.left }}>
          {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              onColorChange(c);
              setColorMenuOpen(false);
            }}
            className={`w-4 h-4 rounded-full border transition-transform ${
              color === c ? "border-gray-800 scale-125" : "border-gray-200"
            }`}
            style={{ backgroundColor: c }}
            title="Rang"
          />
          ))}
          </div>
        , document.body)}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <div className="flex items-center gap-1.5 px-0.5">
        {WIDTHS.map((w, index) => (
          <button
            key={w}
            type="button"
            onClick={() => onStrokeWidthChange(w)}
            className="relative p-1 rounded-full hover:bg-gray-100"
            title={`Chiziq qalinligi (${["S", "M", "L"][index]})`}
          >
            <span
              className={`block rounded-full ${strokeWidth === w ? "bg-gray-900" : "bg-gray-300"}`}
              style={{ width: 5 + w, height: 5 + w }}
            />
            {shortcut(["S", "M", "L"][index])}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <button
        type="button"
        className={iconBtn(false)}
        title="Bekor qilish (undo)"
        onClick={onUndo}
      >
        <Redo2 size={15} className="scale-x-[-1]" />
      </button>
      <button
        type="button"
        className={iconBtn(confirmClearOpen)}
        title="Sahifani tozalash"
        onClick={() => setConfirmClearOpen(true)}
      >
        <Trash2 size={15} />
      </button>
      {confirmClearOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setConfirmClearOpen(false);
          }}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Sahifani tozalash">
            <p className="text-sm text-gray-600">Sahifadagi barcha chizmalar o'chiriladi. Davom etilsinmi?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setConfirmClearOpen(false);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Tozalash
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <button
        type="button"
        className={iconBtn(false)}
        title="PDF yuklash"
        onClick={onOpenPdfLibrary}
      >
        <Upload size={15} />
      </button>
    </div>
  );
}
