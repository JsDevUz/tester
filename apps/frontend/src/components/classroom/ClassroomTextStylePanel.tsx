import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronsUpDown,
  MoreVertical,
  SendToBack,
  Trash2,
} from "lucide-react";
import type { CsFontFamily } from "../../api/classroom";

export const FONT_FAMILY_OPTIONS: CsFontFamily[] = [
  "Inter",
  "Arial",
  "Georgia",
  "Comic Sans MS",
  "Nunito",
];

export const LAYER_OPTIONS: Array<{
  value: "back" | "backward" | "forward" | "front";
  label: string;
  icon: typeof SendToBack;
}> = [
  { value: "back", label: "Eng orqaga", icon: SendToBack },
  { value: "backward", label: "Orqaga", icon: ChevronsDown },
  { value: "forward", label: "Oldinga", icon: ChevronsUp },
  { value: "front", label: "Eng oldinga", icon: BringToFront },
];

export const SHAPE_STROKE_COLORS = [
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#71717a",
  "#ffffff",
];

export function applyRichStyleToSelection(
  styleName: string,
  value: string | number,
): boolean {
  if (typeof window === "undefined") return false;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    if (styleName === "color") span.style.color = String(value);
    else if (styleName === "fontSize")
      span.style.fontSize =
        typeof value === "number" ? `${value}px` : String(value);
    else if (styleName === "fontFamily") span.style.fontFamily = String(value);
    else if (styleName === "fontWeight") span.style.fontWeight = String(value);

    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface TextStylePanelProps {
  color?: string;
  fontFamily: CsFontFamily;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  textAlign: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  rotation?: number;
  style?: React.CSSProperties;
  onColorChange?: (color: string) => void;
  onFontFamilyChange: (fontFamily: CsFontFamily) => void;
  onFontSizeChange: (fontSize: number) => void;
  onFontWeightChange: (fontWeight: 400 | 500 | 600 | 700) => void;
  onTextAlignChange: (textAlign: "left" | "center" | "right") => void;
  onVerticalAlignChange?: (verticalAlign: "top" | "middle" | "bottom") => void;
  onReorder?: (op: "front" | "back" | "forward" | "backward") => void;
  onDelete?: () => void;
}

export function TextStylePanel({
  color = "#000000",
  fontFamily = "Inter",
  fontSize = 24,
  fontWeight = 600,
  textAlign = "left",
  verticalAlign = "middle",
  rotation: _rotation = 0,
  style: customStyle,
  onColorChange,
  onFontFamilyChange,
  onFontSizeChange,
  onFontWeightChange,
  onTextAlignChange,
  onVerticalAlignChange,
  onReorder,
  onDelete,
}: TextStylePanelProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleMenu = (menu: string) => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  const fontFamilyOpen = activeMenu === "fontFamily";
  const fontSizeOpen = activeMenu === "fontSize";
  const textAlignOpen = activeMenu === "textAlign";
  const textColorOpen = activeMenu === "textColor";
  const moreOpen = activeMenu === "more";

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [activeMenu]);

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute z-50 flex items-center gap-1 rounded-2xl border border-gray-200/90 bg-white px-2 py-1.5 text-gray-900 shadow-2xl select-none"
      style={{
        ...customStyle,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {/* 1. Font Family Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("fontFamily")}
          className={`flex h-8 items-center gap-1 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            fontFamilyOpen
              ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
              : "hover:bg-gray-100 text-gray-700"
          }`}
          title="Shrift"
        >
          <span className="truncate max-w-[70px]">{fontFamily}</span>
          <ChevronDown size={12} className="text-gray-400" />
        </button>
        {fontFamilyOpen && (
          <div
            className="absolute left-0 top-full mt-2 w-36 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {FONT_FAMILY_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onFontFamilyChange(f);
                  setActiveMenu(null);
                }}
                className={`flex items-center px-2.5 py-1.5 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                  fontFamily === f
                    ? "bg-indigo-50 text-indigo-600 font-bold"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                style={{ fontFamily: f }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Font Size Dropdown Stepper */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("fontSize")}
          className={`flex h-8 items-center gap-1 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            fontSizeOpen
              ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
              : "hover:bg-gray-100 text-gray-700"
          }`}
          title="Shrift o'lchami"
        >
          <span>{fontSize}</span>
          <ChevronsUpDown size={12} className="text-gray-400" />
        </button>
        {fontSizeOpen && (
          <div
            className="absolute left-0 top-full mt-2 w-24 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {[12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 64].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  onFontSizeChange(sz);
                  setActiveMenu(null);
                }}
                className={`flex items-center justify-between px-2.5 py-1 rounded-xl text-xs transition-colors cursor-pointer ${
                  fontSize === sz
                    ? "bg-indigo-50 text-indigo-600 font-bold"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>{sz}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Bold Button */}
      <button
        type="button"
        onClick={() => onFontWeightChange(fontWeight >= 600 ? 400 : 700)}
        className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
          fontWeight >= 600
            ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
            : "text-gray-700 hover:bg-gray-100"
        }`}
        title="Qalin (Bold)"
      >
        <Bold size={15} />
      </button>

      {/* 4. Text Alignment Popover */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("textAlign")}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
            textAlignOpen
              ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          title="Matnni tekislash (Alignment)"
        >
          {textAlign === "left" ? (
            <AlignLeft size={16} />
          ) : textAlign === "right" ? (
            <AlignRight size={16} />
          ) : (
            <AlignCenter size={16} />
          )}
        </button>
        {textAlignOpen && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-44 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-2xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Horizontal align row */}
            <div className="flex items-center justify-between gap-1 p-1 bg-gray-50 rounded-xl border border-gray-200/80">
              <button
                type="button"
                onClick={() => {
                  onTextAlignChange("left");
                }}
                className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                  textAlign === "left"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                title="Chapga"
              >
                <AlignLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onTextAlignChange("center");
                }}
                className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                  textAlign === "center"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                title="O'rtaga"
              >
                <AlignCenter size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onTextAlignChange("right");
                }}
                className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                  textAlign === "right"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                title="O'ngga"
              >
                <AlignRight size={14} />
              </button>
            </div>

            {/* Vertical align row */}
            {onVerticalAlignChange && (
              <div className="flex items-center justify-between gap-1 p-1 bg-gray-50 rounded-xl border border-gray-200/80">
                <button
                  type="button"
                  onClick={() => onVerticalAlignChange("top")}
                  className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                    verticalAlign === "top"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="Tepaga"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="4" y1="4" x2="20" y2="4" />
                    <path d="M12 20V8M8 12l4-4 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onVerticalAlignChange("middle")}
                  className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                    verticalAlign === "middle"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="Markazga"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <path d="M12 4v4M12 16v4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onVerticalAlignChange("bottom")}
                  className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-all cursor-pointer ${
                    verticalAlign === "bottom"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="Pastga"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <line x1="4" y1="20" x2="20" y2="20" />
                    <path d="M12 4v12M8 12l4 4 4-4" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Text Color Button (`A` with color bar) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("textColor")}
          className={`flex flex-col items-center justify-center h-8 w-8 rounded-xl transition-all cursor-pointer ${
            textColorOpen ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-100"
          }`}
          title="Matn rangi"
        >
          <span className="text-xs font-bold leading-none text-gray-800">A</span>
          <div
            className="h-1 w-4 rounded-full mt-0.5"
            style={{ backgroundColor: color || "#000000" }}
          />
        </button>
        {textColorOpen && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl z-50 flex flex-wrap gap-2 animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {SHAPE_STROKE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onColorChange?.(c);
                  setActiveMenu(null);
                }}
                className={`h-6 w-6 rounded-full border border-gray-300 transition-transform hover:scale-110 cursor-pointer ${
                  color === c ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-gray-200" />

      {/* 6. More (Order & Delete) Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("more")}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all cursor-pointer ${
            moreOpen
              ? "bg-gray-100 text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
          title="Qatlamlar va amallar"
        >
          <MoreVertical size={16} />
        </button>

        {moreOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-gray-200 bg-white p-2.5 shadow-2xl text-xs z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400 tracking-wider">
              Qatlamlar (Order)
            </div>
            <div className="grid grid-cols-4 gap-1 p-1 bg-gray-50 rounded-xl border border-gray-200/80">
              {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => {
                    onReorder?.(value);
                    setActiveMenu(null);
                  }}
                  className="flex h-8 items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all cursor-pointer"
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>

            {onDelete && (
              <>
                <div className="h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setActiveMenu(null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors font-medium text-xs cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>O'chirish</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
