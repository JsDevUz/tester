import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Circle,
  CircleDashed,
  Copy,
  Eraser,
  History,
  Info,
  Lasso,
  Maximize2,
  Minus,
  Pen,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  MousePointer2,
  Undo2,
  Upload,
  X,
  type LucideIcon,
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

type ShortcutItem = { key: string; label: string; icon?: never } | { icon: LucideIcon; label: string; key?: never };

const SHORTCUT_GROUPS: { title: string; items: ShortcutItem[] }[] = [
  {
    title: "Vositalar",
    items: [
      { key: "1", label: "Sichqoncha — tanlash" },
      { key: "2", label: "Qalam" },
      { key: "3", label: "Matn" },
      { key: "4", label: "Marker" },
      { key: "5", label: "Strelka" },
      { key: "-", label: "Chiziq" },
      { key: "6", label: "To'rtburchak" },
      { key: "7", label: "Doira" },
      { key: "8", label: "Nuqtaviy o'chirg'ich" },
      { key: "9", label: "Chizma o'chirg'ich" },
      { key: "0", label: "Lasso — guruh tanlash" },
    ],
  },
  {
    title: "Chiziq qalinligi",
    items: [
      { key: "S", label: "Ingichka" },
      { key: "M", label: "O'rta" },
      { key: "L", label: "Qalin" },
    ],
  },
  {
    title: "Chizish paytida",
    items: [
      { key: "Shift", label: "Chiziq vositasida bosib turilsa, chiziq 45° karrali burchaklarga (0/45/90/135/180/225/270/315) qulflanadi" },
    ],
  },
  {
    title: "Lasso bilan tanlangan guruh",
    items: [
      { icon: Maximize2, label: "Burchakdagi tugmalar — guruh o'lchamini o'zgartirish" },
      { icon: RotateCw, label: "Pastdagi doira tugma — guruhni markazi atrofida aylantirish" },
      { icon: Copy, label: "Nusxalash — tanlangan guruhni bir oz siljigan holda klonlaydi" },
      { icon: Trash2, label: "O'chirish — tanlangan guruhni butunlay o'chiradi" },
    ],
  },
];

interface Props {
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClear: () => void;
  onOpenPdfLibrary: () => void;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
}

export function ClassroomToolbar({
  tool,
  color,
  strokeWidth,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  onOpenPdfLibrary,
  onToggleHistory,
  historyOpen,
}: Props) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (!confirmClearOpen && !infoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConfirmClearOpen(false);
      setInfoOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmClearOpen, infoOpen]);

  // "-" — chiziq vositasiga o'tish. Matn kiritish maydonlari (masalan
  // tахтадаги matn bloki tahrirlanayotganda) uchun ishlamasin — aks holda
  // foydalanuvchi "-" belgisini matn sifatida yoza olmay qoladi.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "-") return;
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTypingTarget) return;
      event.preventDefault();
      onToolChange("line");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToolChange]);

  const iconBtn = (active: boolean, disabled: boolean = false) =>
    `relative p-1.5 rounded-xl transition-all duration-150 ${
      disabled
        ? "text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-40 pointer-events-none"
        : active
        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 scale-[1.05]"
        : "text-[var(--text-primary)] hover:bg-black/10 dark:hover:bg-white/15"
    }`;

  const shortcut = (key: string, active: boolean = false) => (
    <kbd
      className={`pointer-events-none absolute bottom-0.5 right-1 text-[8px] font-bold leading-none ${
        active ? "text-indigo-100" : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {key}
    </kbd>
  );

  return (
    <div className="glass inline-flex max-w-full items-center gap-1 overflow-x-auto overscroll-contain rounded-full px-2 py-1 shadow-lg scrollbar-none [-ms-overflow-style:none]">
      <button
        type="button"
        className={iconBtn(tool === "select")}
        title="Sichqoncha — tanlash (1)"
        onClick={() => onToolChange("select")}
      >
        <MousePointer2 size={15} />
        {shortcut("1", tool === "select")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "pen")}
        title="Qalam (2)"
        onClick={() => onToolChange("pen")}
      >
        <Pen size={15} />
        {shortcut("2", tool === "pen")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "text")}
        title="Matn (3)"
        onClick={() => onToolChange("text")}
      >
        <Type size={15} />
        {shortcut("3", tool === "text")}
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
        {shortcut("4", tool === "highlighter")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "laser")}
        title="Lazer (Z)"
        onClick={() => onToolChange("laser")}
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
          <path d="M4 17c2-3 4-8 7-8s4 5 7 5 3-4 4-6" />
          <circle cx="21" cy="7" r="1.5" fill="currentColor" />
        </svg>
        {shortcut("Z", tool === "laser")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "arrow")}
        title="Strelka (5)"
        onClick={() => onToolChange("arrow")}
      >
        <ArrowUpRight size={15} />
        {shortcut("5", tool === "arrow")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "line")}
        title="Chiziq (-)"
        onClick={() => onToolChange("line")}
      >
        <Minus size={15} />
        {shortcut("-", tool === "line")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "rectangle")}
        title="To'rtburchak (6)"
        onClick={() => onToolChange("rectangle")}
      >
        <Square size={15} />
        {shortcut("6", tool === "rectangle")}
      </button>
      <button
        type="button"
        className={iconBtn(tool === "ellipse")}
        title="Doira (7)"
        onClick={() => onToolChange("ellipse")}
      >
        <Circle size={15} />
        {shortcut("7", tool === "ellipse")}
      </button>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={iconBtn(tool === "eraser-pixel")}
          title="Nuqtaviy o'chirg'ich (8)"
          onClick={() => onToolChange("eraser-pixel")}
        >
          <Eraser size={15} />
          {shortcut("8", tool === "eraser-pixel")}
        </button>
        <button
          type="button"
          className={iconBtn(tool === "eraser-stroke")}
          title="Chizma o'chirg'ich (9)"
          onClick={() => onToolChange("eraser-stroke")}
        >
          <CircleDashed size={15} />
          {shortcut("9", tool === "eraser-stroke")}
        </button>
      </div>

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <button
        type="button"
        className={iconBtn(tool === "lasso")}
        title="Lasso — guruh tanlash (0)"
        onClick={() => onToolChange("lasso")}
      >
        <Lasso size={15} />
        {shortcut("0", tool === "lasso")}
      </button>

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <div className="flex items-center gap-1.5 px-0.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`h-4 w-4 rounded-full border transition-transform ${color.toLowerCase() === c.toLowerCase()
                ? "scale-125 border-gray-900 dark:border-white ring-2 ring-indigo-500/40"
                : "border-black/20 dark:border-white/20 hover:scale-110"
              }`}
            style={{ backgroundColor: c }}
            title={`Rang: ${c}`}
          />
        ))}
        <label
          className={`relative flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-black/20 dark:border-white/20 transition-transform hover:scale-110 overflow-hidden ${!COLORS.map((c) => c.toLowerCase()).includes(color.toLowerCase())
              ? "ring-2 ring-indigo-500/40 scale-125"
              : ""
            }`}
          style={{
            background:
              "conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)",
          }}
          title="Maxsus rang tanlash"
        >
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
          />
        </label>
      </div>

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <div className="flex items-center gap-1.5 px-0.5">
        {WIDTHS.map((w, index) => {
          const isActive = strokeWidth === w;
          return (
            <button
              key={w}
              type="button"
              onClick={() => onStrokeWidthChange(w)}
              className={`relative flex h-7 w-7 items-center justify-center rounded-xl transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-indigo-600 shadow-md shadow-indigo-500/20 scale-[1.05]"
                  : "hover:bg-black/10 dark:hover:bg-white/15"
              }`}
              title={`Chiziq qalinligi (${["S", "M", "L"][index]})`}
            >
              <span
                className={`block rounded-full transition-colors ${
                  isActive ? "bg-white" : "bg-gray-900 dark:bg-white"
                }`}
                style={{
                  width: 4 + w,
                  height: 4 + w,
                  opacity: isActive ? 1 : 0.85,
                }}
              />
              {shortcut(["S", "M", "L"][index], isActive)}
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <button
        type="button"
        className={iconBtn(false, canUndo === false)}
        disabled={canUndo === false}
        title={canUndo === false ? "Bekor qilish mavjud emas" : "Bekor qilish (Ctrl+Z)"}
        onClick={onUndo}
      >
        <Undo2 size={15} />
      </button>
      <button
        type="button"
        className={iconBtn(false, canRedo === false)}
        disabled={canRedo === false}
        title={canRedo === false ? "Qaytarish mavjud emas" : "Qaytarish (Ctrl+Shift+Z)"}
        onClick={onRedo}
      >
        <Redo2 size={15} />
      </button>
      <button
        type="button"
        className={iconBtn(confirmClearOpen)}
        title="Butun doskani tozalash"
        onClick={() => setConfirmClearOpen(true)}
      >
        <Trash2 size={15} />
      </button>
      {confirmClearOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 transition-opacity animate-in fade-in duration-150"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setConfirmClearOpen(false);
          }}
        >
          <div className="classroom-panel-in glass-card flex w-full max-w-sm flex-col gap-3 rounded-3xl p-6 shadow-2xl text-[var(--text-primary)]" role="dialog" aria-modal="true" aria-label="Butun doskani tozalash">
            <h3 className="text-base font-bold tracking-tight">Butun doskani tozalash</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">Daftardagi va PDFdagi barcha sahifalar chizmalari to'liq o'chiriladi. Davom etilsinmi?</p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setConfirmClearOpen(false);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-xs transition-colors cursor-pointer"
              >
                Barchasini tozalash
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <button
        type="button"
        className={iconBtn(false)}
        title="PDF yuklash"
        onClick={onOpenPdfLibrary}
      >
        <Upload size={15} />
      </button>

      <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />

      <button
        type="button"
        className={iconBtn(infoOpen)}
        title="Yordam va shortcutlar"
        onClick={() => setInfoOpen(true)}
      >
        <Info size={15} />
      </button>

      {onToggleHistory && (
        <>
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-0.5" />
          <button
            type="button"
            className={iconBtn(!!historyOpen)}
            title="Whiteboard tarixi va faoliyati"
            onClick={onToggleHistory}
          >
            <History size={15} />
          </button>
        </>
      )}
      {infoOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 dark:bg-black/30 p-4 transition-opacity animate-in fade-in duration-150"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setInfoOpen(false);
          }}
        >
          <div
            className="classroom-panel-in glass-card flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl p-6 shadow-2xl text-[var(--text-primary)]"
            role="dialog"
            aria-modal="true"
            aria-label="Yordam va shortcutlar"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <h2 className="text-base font-bold tracking-tight">Yordam va shortcutlar</h2>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="rounded-xl p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--card-hover)] transition-colors cursor-pointer"
                aria-label="Yopish"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{group.title}</p>
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <div key={item.label} className="flex items-start gap-2.5 text-xs">
                        {item.icon ? (
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10 shadow-xs">
                            <item.icon size={12} />
                          </span>
                        ) : (
                          <kbd className="mt-0.5 shrink-0 min-w-[20px] text-center rounded-lg bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--text-primary)] shadow-xs">
                            {item.key}
                          </kbd>
                        )}
                        <span className="min-w-0 leading-relaxed text-[var(--text-secondary)]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
