import { Eraser, Highlighter, Pen, RotateCcw, Upload, Wand2 } from "lucide-react";
import { type DrawTool } from "./ClassroomPdfViewer";

const PEN_COLORS = ["#ef4444", "#2563eb", "#16a34a"];

interface Props {
  tool: DrawTool;
  color: string;
  page: number;
  pageCount: number;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onOpenPdfLibrary: () => void;
}

export function ClassroomToolbar({
  tool, color, page, pageCount,
  onToolChange, onColorChange, onUndo, onClear, onOpenPdfLibrary,
}: Props) {
  const btn = (active: boolean) =>
    `p-2 rounded-xl transition-colors ${active ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`;

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl shadow-sm px-3 py-2">
      <button type="button" className={btn(tool === "pen")} title="Qalam" onClick={() => onToolChange("pen")}>
        <Pen size={18} />
      </button>
      <button type="button" className={btn(tool === "highlighter")} title="Marker" onClick={() => onToolChange("highlighter")}>
        <Highlighter size={18} />
      </button>
      <button type="button" className={btn(tool === "laser")} title="Lazer ko'rsatkich" onClick={() => onToolChange("laser")}>
        <Wand2 size={18} />
      </button>

      <div className="flex items-center gap-1.5 px-1">
        {PEN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            title="Rang"
          />
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      <button type="button" className={btn(false)} title="Bekor qilish (undo)" onClick={onUndo}>
        <RotateCcw size={18} />
      </button>
      <button type="button" className={btn(false)} title="Sahifani tozalash" onClick={onClear}>
        <Eraser size={18} />
      </button>

      <div className="w-px h-6 bg-gray-200" />

      <span className="text-sm font-medium text-gray-600 min-w-14 text-center">
        {pageCount > 0 ? `${page} / ${pageCount}` : "—"}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenPdfLibrary}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
      >
        <Upload size={16} />
        {pageCount > 0 ? "Boshqa PDF" : "PDF yuklash"}
      </button>
    </div>
  );
}
