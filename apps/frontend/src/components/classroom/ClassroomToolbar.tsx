import { useState } from "react";
import { ArrowUpRight, CircleDashed, Eraser, Pen, Redo2, Trash2, Type, Upload } from "lucide-react";
import { type DrawTool } from "./ClassroomPdfViewer";

const COLORS = [
  "#ffffff", "#000000", "#6b7280", "#14b8a6", "#38bdf8",
  "#3b82f6", "#22c55e", "#f97316", "#ef4444", "#ec4899",
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
  tool, color, strokeWidth,
  onToolChange, onColorChange, onStrokeWidthChange, onUndo, onClear, onOpenPdfLibrary,
}: Props) {
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false);

  const iconBtn = (active: boolean) =>
    `p-1.5 rounded-xl transition-colors ${active ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`;

  return (
    <div className="flex items-center gap-1 bg-white rounded-full shadow-md border border-gray-100 px-0.5 py-0.5">
      <button type="button" className={iconBtn(tool === "pen")} title="Qalam" onClick={() => onToolChange("pen")}>
        <Pen size={15} />
      </button>
      <button type="button" className={iconBtn(false)} title="Matn (tez orada)" disabled>
        <Type size={15} className="opacity-40" />
      </button>
      <button type="button" className={iconBtn(tool === "highlighter")} title="Marker" onClick={() => onToolChange("highlighter")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
      </button>
      <button type="button" className={iconBtn(tool === "arrow")} title="Strelka" onClick={() => onToolChange("arrow")}>
        <ArrowUpRight size={15} />
      </button>

      <div className="relative">
        <button
          type="button"
          className={iconBtn(tool === "eraser-pixel" || tool === "eraser-stroke" || eraserMenuOpen)}
          title="O'chirg'ich"
          onClick={() => setEraserMenuOpen((v) => !v)}
        >
          {tool === "eraser-stroke" ? <CircleDashed size={15} /> : <Eraser size={15} />}
        </button>
        {eraserMenuOpen && (
          <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-full shadow-md border border-gray-100 px-1.5 py-1 whitespace-nowrap">
            <button
              type="button"
              className={iconBtn(tool === "eraser-pixel")}
              title="Nuqtaviy o'chirg'ich (tegilgan qismini o'chiradi)"
              onClick={() => { onToolChange("eraser-pixel"); setEraserMenuOpen(false); }}
            >
              <Eraser size={14} />
            </button>
            <button
              type="button"
              className={iconBtn(tool === "eraser-stroke")}
              title="Chizma o'chirg'ich (butun chizmani o'chiradi)"
              onClick={() => { onToolChange("eraser-stroke"); setEraserMenuOpen(false); }}
            >
              <CircleDashed size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <div className="flex items-center gap-1 px-0.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            className={`w-4 h-4 rounded-full border transition-transform ${
              color === c ? "border-gray-800 scale-125" : "border-gray-200"
            }`}
            style={{ backgroundColor: c }}
            title="Rang"
          />
        ))}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <div className="flex items-center gap-1.5 px-0.5">
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onStrokeWidthChange(w)}
            className="p-1 rounded-full hover:bg-gray-100"
            title="Chiziq qalinligi"
          >
            <span
              className={`block rounded-full ${strokeWidth === w ? "bg-gray-900" : "bg-gray-300"}`}
              style={{ width: 5 + w, height: 5 + w }}
            />
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <button type="button" className={iconBtn(false)} title="Bekor qilish (undo)" onClick={onUndo}>
        <Redo2 size={15} className="scale-x-[-1]" />
      </button>
      <button type="button" className={iconBtn(false)} title="Sahifani tozalash" onClick={onClear}>
        <Trash2 size={15} />
      </button>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      <button type="button" className={iconBtn(false)} title="PDF yuklash" onClick={onOpenPdfLibrary}>
        <Upload size={15} />
      </button>
    </div>
  );
}
