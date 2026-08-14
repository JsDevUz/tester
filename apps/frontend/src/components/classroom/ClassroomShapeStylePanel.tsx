import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Circle,
  MoreVertical,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import type {
  CsEdges,
  CsFillStyle,
  CsFontFamily,
  CsStrokeStyle,
  CsTool,
} from "../../api/classroom";
import {
  FONT_FAMILY_OPTIONS,
  LAYER_OPTIONS,
  SHAPE_STROKE_COLORS,
} from "./ClassroomTextStylePanel";

export const SHAPE_BACKGROUND_COLORS = [
  "transparent",
  "#ffc9c9",
  "#b2f2bb",
  "#a5d8ff",
  "#ffec99",
];

export const FILL_STYLE_OPTIONS: Array<{ value: CsFillStyle; label: string }> = [
  { value: "hachure", label: "Shtrix" },
  { value: "cross-hatch", label: "Katak" },
  { value: "solid", label: "To'liq" },
];

export function FillStyleIcon({ style }: { style: CsFillStyle }) {
  if (style === "solid")
    return (
      <span aria-hidden="true" className="h-4 w-4 rounded-sm bg-current" />
    );
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      {style === "hachure" ? (
        <path d="M2 14 14 2M5 17 17 5M1 9 9 1" />
      ) : (
        <>
          <path d="M2 6h14M2 12h14M6 2v14M12 2v14" />
        </>
      )}
    </svg>
  );
}
export const STROKE_STYLE_OPTIONS: Array<{ value: CsStrokeStyle; label: string }> = [
  { value: "none", label: "Kontursiz" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dash" },
];

export function StrokeStyleIcon({ style }: { style: CsStrokeStyle }) {
  if (style === "none") {
    return (
      <span aria-hidden="true" className="text-base leading-none">
        ∅
      </span>
    );
  }
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="14"
      viewBox="0 0 24 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      {style === "dashed" ? (
        <path d="M2 7h4M10 7h4M18 7h4" />
      ) : (
        <path d="M2 7h20" />
      )}
    </svg>
  );
}
export const EDGES_OPTIONS: Array<{ value: CsEdges; label: string }> = [
  { value: "sharp", label: "Keskin" },
  { value: "round", label: "Yumaloq" },
];

export function EdgeIcon({ rounded }: { rounded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      {rounded ? (
        <rect x="4" y="4" width="16" height="16" rx="4" />
      ) : (
        <rect x="4" y="4" width="16" height="16" />
      )}
    </svg>
  );
}

export const SINGLE_ARROW_HEAD_OPTIONS = [
  {
    id: "none",
    title: "None",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ),
  },
  {
    id: "arrow",
    title: "O'q (Arrow)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h14M13 7l5 5-5 5" />
      </svg>
    ),
  },
  {
    id: "both-arrow",
    title: "Ikki tomonlama o'q (Two-sided)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 7l-5 5 5 5M2 12h20M17 7l5 5-5 5" />
      </svg>
    ),
  },
  {
    id: "arrow-filled",
    title: "To'ldirilgan o'q (Triangle)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="14" y2="12" />
        <polygon points="13,7 20,12 13,17" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "circle",
    title: "Doira (Circle)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="14" y2="12" />
        <circle cx="17" cy="12" r="3.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "diamond",
    title: "Romb (Diamond)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="14" y2="12" />
        <polygon points="14,12 17,8 20,12 17,16" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "bar",
    title: "Chiziqcha (Bar)",
    svg: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="18" y2="12" />
        <line x1="18" y1="6" x2="18" y2="18" />
      </svg>
    ),
  },
];

export interface ShapeStylePanelProps {
  color?: string;
  textColor?: string;
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeWidth: number;
  strokeStyle: CsStrokeStyle;
  lineShape?: "straight" | "curved" | "elbow";
  startArrowHead?: string;
  endArrowHead?: string;
  edges: CsEdges;
  opacity: number;
  rotation?: number;
  strokeTool?: CsTool;
  style?: React.CSSProperties;

  // Text props
  text?: string;
  fontFamily?: CsFontFamily;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";

  onColorChange?: (color: string, strokeStyle?: CsStrokeStyle) => void;
  onTextColorChange?: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onFillStyleChange: (fillStyle: CsFillStyle) => void;
  onStrokeWidthChange: (width: number) => void;
  onStrokeStyleChange: (strokeStyle: CsStrokeStyle) => void;
  onLineShapeChange?: (shape: "straight" | "curved" | "elbow") => void;
  onArrowHeadChange?: (endHead: string, startHead: string) => void;
  onSwapDirection?: () => void;
  onEdgesChange: (edges: CsEdges) => void;
  onOpacityChange: (opacity: number) => void;
  onToolChange?: (tool: CsTool) => void;
  onReorder: (op: "front" | "back" | "forward" | "backward") => void;
  onDelete?: () => void;

  onFontFamilyChange?: (fontFamily: CsFontFamily) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onFontWeightChange?: (fontWeight: 400 | 500 | 600 | 700) => void;
  onTextAlignChange?: (textAlign: "left" | "center" | "right") => void;
  onVerticalAlignChange?: (verticalAlign: "top" | "middle" | "bottom") => void;
}

export function ShapeStylePanel({
  color = "#000000",
  textColor,
  backgroundColor = "transparent",
  fillStyle = "solid",
  strokeWidth = 2,
  strokeStyle = "solid",
  lineShape = "straight",
  startArrowHead = "none",
  endArrowHead = "arrow",
  edges = "round",
  opacity = 100,
  rotation: _rotation = 0,
  strokeTool = "rectangle",
  style: customStyle,

  // Text props
  text: _text = "",
  fontFamily = "Inter",
  fontSize = 24,
  fontWeight = 600,
  textAlign = "center",
  verticalAlign = "middle",

  onColorChange,
  onTextColorChange,
  onBackgroundColorChange,
  onFillStyleChange,
  onStrokeWidthChange,
  onStrokeStyleChange,
  onLineShapeChange,
  onArrowHeadChange,
  onSwapDirection,
  onEdgesChange,
  onOpacityChange,
  onToolChange,
  onReorder,
  onDelete,

  onFontFamilyChange,
  onFontSizeChange,
  onFontWeightChange,
  onTextAlignChange,
  onVerticalAlignChange,
}: ShapeStylePanelProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleMenu = (menu: string) => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  const startArrowOpen = activeMenu === "startArrow";
  const endArrowOpen = activeMenu === "endArrow";
  const lineTypeOpen = activeMenu === "lineType";
  const arrowColorOpen = activeMenu === "arrowColor";
  const shapeToolOpen = activeMenu === "shapeTool";
  const fontFamilyOpen = activeMenu === "fontFamily";
  const fontSizeOpen = activeMenu === "fontSize";
  const textAlignOpen = activeMenu === "textAlign";
  const textColorOpen = activeMenu === "textColor";
  const borderStyleOpen = activeMenu === "borderStyle";
  const fillColorOpen = activeMenu === "fillColor";
  const opacityOpen = activeMenu === "opacity";
  const moreOpen = activeMenu === "more";

  const isLineOrArrow = strokeTool === "line" || strokeTool === "arrow";
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

  const renderHeadPreview = (head: string | undefined, isStart = false) => {
    const isBoth = startArrowHead === "arrow" && (endArrowHead === "arrow" || (!endArrowHead && strokeTool === "arrow"));
    if (isBoth) {
      const opt = SINGLE_ARROW_HEAD_OPTIONS.find((o) => o.id === "both-arrow");
      if (opt) {
        return (
          <div className={`flex items-center justify-center ${isStart ? "scale-x-[-1]" : ""}`}>
            {opt.svg}
          </div>
        );
      }
    }
    if (!head || head === "none") {
      return <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300 px-1">None</span>;
    }
    const opt = SINGLE_ARROW_HEAD_OPTIONS.find((o) => o.id === head);
    if (!opt) return <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300 px-1">None</span>;
    return (
      <div className={`flex items-center justify-center ${isStart ? "scale-x-[-1]" : ""}`}>
        {opt.svg}
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute z-40 flex items-center gap-0.5 rounded-xl border border-gray-200/90 bg-white/95 dark:bg-zinc-800/95 dark:border-zinc-700/90 px-1.5 py-1 text-gray-900 dark:text-white shadow-xl select-none backdrop-blur-xs"
      style={{ ...customStyle }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {isLineOrArrow ? (
        /* Miro-style Arrow/Line Toolbar */
        <>
          {/* 1. Start Arrowhead Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("startArrow")}
              className={`flex h-7 min-w-7 items-center justify-center px-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                startArrowOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Boshlanish o'q uchi (Line start)"
            >
              {renderHeadPreview(startArrowHead, true)}
            </button>

            {startArrowOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-48 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                  Line start
                </div>
                {SINGLE_ARROW_HEAD_OPTIONS.map((opt) => {
                  const isBoth = startArrowHead === "arrow" && (endArrowHead === "arrow" || (!endArrowHead && strokeTool === "arrow"));
                  const isSelected = opt.id === "both-arrow"
                    ? isBoth
                    : !isBoth && (startArrowHead || "none") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (opt.id === "both-arrow") {
                          onArrowHeadChange?.("arrow", "arrow");
                        } else {
                          onArrowHeadChange?.(endArrowHead ?? (strokeTool === "line" ? "none" : "arrow"), opt.id);
                        }
                        setActiveMenu(null);
                      }}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        isSelected ? "bg-indigo-50 text-indigo-600 font-bold" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex h-5 w-5 items-center justify-center scale-x-[-1]">
                        {opt.svg}
                      </div>
                      <span>{opt.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Swap Direction Button */}
          <button
            type="button"
            onClick={() => {
              if (onSwapDirection) {
                onSwapDirection();
              } else {
                const nextStart = endArrowHead ?? (strokeTool === "line" ? "none" : "arrow");
                const nextEnd = startArrowHead ?? "none";
                onArrowHeadChange?.(nextEnd, nextStart);
              }
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer"
            title="Yo'nalishni almashtirish (Swap direction)"
          >
            <RotateCw size={13} />
          </button>

          {/* 3. End Arrowhead Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("endArrow")}
              className={`flex h-7 min-w-7 items-center justify-center px-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                endArrowOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Tugash o'q uchi (Line end)"
            >
              {renderHeadPreview(endArrowHead, false)}
            </button>

            {endArrowOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-2xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase text-gray-400 dark:text-zinc-400 tracking-wider">
                  Line end
                </div>
                {SINGLE_ARROW_HEAD_OPTIONS.map((opt) => {
                  const isBoth = startArrowHead === "arrow" && (endArrowHead === "arrow" || (!endArrowHead && strokeTool === "arrow"));
                  const isSelected = opt.id === "both-arrow"
                    ? isBoth
                    : !isBoth && (endArrowHead ?? (strokeTool === "line" ? "none" : "arrow")) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (opt.id === "both-arrow") {
                          onArrowHeadChange?.("arrow", "arrow");
                        } else {
                          onArrowHeadChange?.(opt.id, startArrowHead ?? "none");
                        }
                        setActiveMenu(null);
                      }}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isSelected ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
                      }`}
                    >
                      <div className="flex h-5 w-5 items-center justify-center">
                        {opt.svg}
                      </div>
                      <span>{opt.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-gray-200 dark:bg-zinc-700 mx-0.5" />

          {/* 4. Type Button (Line Shape, Thickness, Style Popover) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("lineType")}
              className={`flex items-center gap-1 h-7 px-2 rounded-lg text-xs transition-all cursor-pointer ${
                lineTypeOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Chiziq turi va qalinligi (Type)"
            >
              <div className="h-3.5 flex items-center">
                {lineShape === "elbow" ? (
                  <svg width="14" height="10" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,4 3,14 21,14" />
                  </svg>
                ) : lineShape === "curved" ? (
                  <svg width="14" height="10" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M3 14 Q 12 3, 21 14" />
                  </svg>
                ) : (
                  <svg width="14" height="10" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="3" y1="14" x2="21" y2="4" />
                  </svg>
                )}
              </div>
              <span className="text-xs font-medium">Type</span>
            </button>

            {lineTypeOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl z-50 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Thickness Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span>Qalinlik</span>
                    <span className="font-bold text-indigo-600">{strokeWidth}px</span>
                  </div>
                  <div className="relative flex items-center py-1">
                    <div className="absolute inset-x-0 h-1 bg-indigo-100 rounded-full" />
                    <div className="absolute inset-x-0 flex justify-between px-1 pointer-events-none">
                      {[1, 2, 4, 6, 8, 12, 16].map((step) => (
                        <div
                          key={step}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            strokeWidth >= step ? "bg-indigo-600" : "bg-indigo-200"
                          }`}
                        />
                      ))}
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      step={1}
                      value={strokeWidth}
                      onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                      className="relative z-10 w-full appearance-none bg-transparent cursor-pointer accent-indigo-600 h-4"
                    />
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Line Shape Row */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onLineShapeChange?.("straight")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      lineShape === "straight"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="To'g'ri chiziq"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="4" y1="19" x2="20" y2="5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLineShapeChange?.("elbow")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      lineShape === "elbow"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Burchakli chiziq (Stepped)"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4,6 4,18 20,18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLineShapeChange?.("curved")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      lineShape === "curved"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Egri chiziq (Curved)"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M4 18 Q 12 4, 20 18" />
                    </svg>
                  </button>
                </div>

                {/* Stroke Style Row */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("solid")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "solid"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Solid"
                  >
                    <svg width="28" height="12" viewBox="0 0 28 12" stroke="currentColor" strokeWidth="2.5">
                      <line x1="2" y1="6" x2="26" y2="6" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("dashed")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "dashed"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Dashed"
                  >
                    <svg width="28" height="12" viewBox="0 0 28 12" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5,4">
                      <line x1="2" y1="6" x2="26" y2="6" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("dotted")}
                    className={`flex h-10 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "dotted"
                        ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Dotted"
                  >
                    <svg width="28" height="12" viewBox="0 0 28 12" stroke="currentColor" strokeWidth="3" strokeDasharray="1,4">
                      <line x1="2" y1="6" x2="26" y2="6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* 5. Color Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("arrowColor")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700/60 transition-colors p-0.5 cursor-pointer ${
                arrowColorOpen ? "bg-gray-100 dark:bg-zinc-700/80" : ""
              }`}
              title="Rang"
            >
              <div
                className="h-4 w-4 rounded-full border border-gray-300 dark:border-zinc-600 shadow-xs transition-transform hover:scale-110"
                style={{ backgroundColor: color || "#ef4444" }}
              />
            </button>

            {arrowColorOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 shadow-2xl z-50 flex flex-wrap gap-1.5 animate-in fade-in zoom-in-95 duration-100"
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
                    className={`h-5 w-5 rounded-full border border-gray-300 dark:border-zinc-600 transition-transform hover:scale-110 cursor-pointer ${
                      color === c ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 6. Opacity */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("opacity")}
              className={`flex h-7 items-center gap-1 px-1.5 rounded-lg transition-all cursor-pointer ${
                opacityOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Shaffoflik (Opacity)"
            >
              <span className="text-xs font-semibold text-gray-700 dark:text-zinc-200">{opacity}%</span>
            </button>

            {opacityOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-2xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-gray-700 dark:text-zinc-200 font-bold text-xs mb-1">
                  <span>Opacity</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">{opacity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={opacity}
                  onChange={(e) => onOpacityChange(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-lg appearance-none"
                />
              </div>
            )}
          </div>
        </>
      ) : (
        /* Miro-style Unified Shape Toolbar (Shape + Text inside shape) */
        <>
          {/* 1. Shape Switcher */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("shapeTool")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
                shapeToolOpen ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Shakl turini almashtirish"
            >
              {strokeTool === "ellipse" ? (
                <Circle size={15} />
              ) : (
                <Square size={15} className={edges === "round" ? "rounded-xs" : ""} />
              )}
            </button>
            {shapeToolOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-34 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5 shadow-2xl z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.("rectangle");
                    setActiveMenu(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    strokeTool === "rectangle" ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
                  }`}
                >
                  <Square size={14} />
                  <span>To'rtburchak</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.("ellipse");
                    setActiveMenu(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    strokeTool === "ellipse" ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
                  }`}
                >
                  <Circle size={14} />
                  <span>Doira</span>
                </button>
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-gray-200 dark:bg-zinc-700 mx-0.5" />

          {/* 2. Font Family */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("fontFamily")}
              className={`flex h-7 items-center gap-1 px-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                fontFamilyOpen ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Shrift"
            >
              <span className="truncate max-w-[65px]">{fontFamily}</span>
              <ChevronDown size={11} className="text-gray-400 dark:text-zinc-400" />
            </button>
            {fontFamilyOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-36 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {FONT_FAMILY_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      onFontFamilyChange?.(f);
                      setActiveMenu(null);
                    }}
                    className={`flex items-center px-2 py-1 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                      fontFamily === f ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
                    }`}
                    style={{ fontFamily: f }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Font Size */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("fontSize")}
              className={`flex h-7 items-center gap-0.5 px-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                fontSizeOpen ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-700 dark:text-zinc-200"
              }`}
              title="Shrift o'lchami"
            >
              <span>{fontSize}</span>
              <ChevronsUpDown size={11} className="text-gray-400 dark:text-zinc-400" />
            </button>
            {fontSizeOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-24 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5 shadow-2xl z-50 flex flex-col gap-0.5 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {[12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 64].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      onFontSizeChange?.(sz);
                      setActiveMenu(null);
                    }}
                    className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                      fontSize === sz ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
                    }`}
                  >
                    <span>{sz}px</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 4. Bold Button */}
          <button
            type="button"
            onClick={() => onFontWeightChange?.(fontWeight >= 600 ? 400 : 700)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
              fontWeight >= 600 ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
            }`}
            title="Qalin (Bold)"
          >
            <Bold size={13} />
          </button>

          {/* 5. Text Align & Vertical Align Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("textAlign")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
                textAlignOpen ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
              }`}
              title="Matnni tekislash (Alignment)"
            >
              {textAlign === "left" ? (
                <AlignLeft size={14} />
              ) : textAlign === "right" ? (
                <AlignRight size={14} />
              ) : (
                <AlignCenter size={14} />
              )}
            </button>
            {textAlignOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-44 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-2xl z-50 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Horizontal align row */}
                <div className="flex items-center justify-between gap-1 p-0.5 bg-gray-50 dark:bg-zinc-700/50 rounded-lg border border-gray-200/80 dark:border-zinc-600">
                  <button
                    type="button"
                    onClick={() => onTextAlignChange?.("left")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      textAlign === "left" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="Chapga"
                  >
                    <AlignLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onTextAlignChange?.("center")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      textAlign === "center" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="O'rtaga"
                  >
                    <AlignCenter size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onTextAlignChange?.("right")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      textAlign === "right" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="O'ngga"
                  >
                    <AlignRight size={13} />
                  </button>
                </div>

                {/* Vertical align row */}
                <div className="flex items-center justify-between gap-1 p-0.5 bg-gray-50 dark:bg-zinc-700/50 rounded-lg border border-gray-200/80 dark:border-zinc-600">
                  <button
                    type="button"
                    onClick={() => onVerticalAlignChange?.("top")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      verticalAlign === "top" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="Tepaga"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="4" y1="4" x2="20" y2="4" />
                      <path d="M12 20V8M8 12l4-4 4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerticalAlignChange?.("middle")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      verticalAlign === "middle" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="Markazga"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <path d="M12 4v4M12 16v4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerticalAlignChange?.("bottom")}
                    className={`flex h-6 flex-1 items-center justify-center rounded-md transition-all cursor-pointer ${
                      verticalAlign === "bottom" ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"
                    }`}
                    title="Pastga"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="4" y1="20" x2="20" y2="20" />
                      <path d="M12 4v12M8 12l4 4 4-4" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 6. Text Color Button (`A` with color bar) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("textColor")}
              className={`flex flex-col items-center justify-center h-7 w-7 rounded-lg transition-all cursor-pointer ${
                textColorOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60"
              }`}
              title="Matn rangi"
            >
              <span className="text-[11px] font-bold leading-none text-gray-800 dark:text-zinc-100">A</span>
              <div
                className="h-0.5 w-3.5 rounded-full mt-0.5"
                style={{ backgroundColor: textColor || color || "#000000" }}
              />
            </button>
            {textColorOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 shadow-2xl z-50 flex flex-wrap gap-1.5 animate-in fade-in zoom-in-95 duration-100"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {SHAPE_STROKE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onTextColorChange?.(c);
                      setActiveMenu(null);
                    }}
                    className={`h-5 w-5 rounded-full border border-gray-300 dark:border-zinc-600 transition-transform hover:scale-110 cursor-pointer ${
                      (textColor || color) === c ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-gray-200 dark:bg-zinc-700 mx-0.5" />

          {/* 7. Border / Stroke Style Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("borderStyle")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
                borderStyleOpen ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800" : "text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60"
              }`}
              title="Chegara (Border/Stroke) sozlamalari"
            >
              {strokeStyle === "none" ? (
                <div className="h-4 w-4 rounded-full border border-gray-300 dark:border-zinc-600 relative flex items-center justify-center">
                  <div className="h-3 w-0.5 bg-red-500 rotate-45" />
                </div>
              ) : (
                <div
                  className="h-4 w-4 rounded-full border-2 transition-transform hover:scale-105"
                  style={{
                    borderColor: color || "#000000",
                    borderStyle: strokeStyle === "dashed" ? "dashed" : strokeStyle === "dotted" ? "dotted" : "solid",
                  }}
                />
              )}
            </button>

            {borderStyleOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl z-50 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-100 select-none"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Stroke Style (Solid, Dashed, Dotted) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("solid")}
                    className={`flex h-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "solid" ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm" : "border-gray-200 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Solid"
                  >
                    <svg width="24" height="8" viewBox="0 0 24 8" stroke="currentColor" strokeWidth="2.5">
                      <line x1="2" y1="4" x2="22" y2="4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("dashed")}
                    className={`flex h-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "dashed" ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm" : "border-gray-200 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Dashed"
                  >
                    <svg width="24" height="8" viewBox="0 0 24 8" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4,3">
                      <line x1="2" y1="4" x2="22" y2="4" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStrokeStyleChange("dotted")}
                    className={`flex h-8 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                      strokeStyle === "dotted" ? "border-indigo-600 bg-indigo-50/60 text-indigo-600 shadow-sm" : "border-gray-200 hover:bg-gray-50 text-gray-700"
                    }`}
                    title="Dotted"
                  >
                    <svg width="24" height="8" viewBox="0 0 24 8" stroke="currentColor" strokeWidth="3" strokeDasharray="1,4">
                      <line x1="2" y1="4" x2="22" y2="4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Thickness */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span>Thickness</span>
                    <span className="font-bold text-indigo-600">{strokeWidth}px</span>
                  </div>
                  <div className="relative flex items-center py-1">
                    <div className="absolute inset-x-0 h-1 bg-indigo-100 rounded-full" />
                    <div className="absolute inset-x-0 flex justify-between px-1 pointer-events-none">
                      {[1, 2, 4, 6, 8, 12, 16].map((step) => (
                        <div
                          key={step}
                          className={`h-2 w-2 rounded-full transition-colors ${
                            strokeWidth >= step ? "bg-indigo-600" : "bg-indigo-200"
                          }`}
                        />
                      ))}
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      step={1}
                      value={strokeWidth}
                      onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                      className="relative z-10 w-full appearance-none bg-transparent cursor-pointer accent-indigo-600 h-4"
                    />
                  </div>
                </div>

                {/* Rounded corners */}
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                  <span>Rounded corners</span>
                  <button
                    type="button"
                    onClick={() => onEdgesChange(edges === "round" ? "sharp" : "round")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                      edges === "round" ? "border-indigo-600 bg-indigo-50 text-indigo-600 font-bold" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <EdgeIcon rounded={edges === "round"} />
                    <span>{edges === "round" ? "Round" : "Sharp"}</span>
                  </button>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Border color palette */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-gray-700">Border colors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {/* None / transparent border */}
                    <button
                      type="button"
                      onClick={() => onStrokeStyleChange("none")}
                      className={`h-6 w-6 rounded-full border border-gray-300 flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                        strokeStyle === "none" ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                      }`}
                      title="Chegarasiz (None)"
                    >
                      <div className="h-4 w-0.5 bg-red-500 rotate-45" />
                    </button>
                    {SHAPE_STROKE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          const nextStrokeStyle = strokeStyle === "none" ? "solid" : strokeStyle;
                          onColorChange?.(c, nextStrokeStyle);
                          if (strokeStyle === "none") {
                            onStrokeStyleChange("solid");
                          }
                        }}
                        className={`h-6 w-6 rounded-full border border-gray-300 transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                          color === c && strokeStyle !== "none" ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                        }`}
                        style={{ backgroundColor: c }}
                      >
                        {color === c && strokeStyle !== "none" && (
                          <Check size={12} className={c === "#ffffff" || c === "#eab308" ? "text-gray-900" : "text-white"} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 8. Fill / Background Color Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu("fillColor")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
                fillColorOpen ? "bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800" : "hover:bg-gray-100 dark:hover:bg-zinc-700/60"
              }`}
              title="Fon rangi (Fill)"
            >
              <div
                className="h-4 w-4 rounded-full border border-gray-300 dark:border-zinc-600 shadow-xs transition-transform hover:scale-105"
                style={
                  backgroundColor === "transparent"
                    ? {
                        backgroundImage:
                          "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
                        backgroundSize: "6px 6px",
                      }
                    : { backgroundColor }
                }
              />
            </button>

            {fillColorOpen && (
              <div
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-2xl z-50 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100 select-none"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-zinc-200">
                  <span>Fon rangi</span>
                  {/* Fill Style toggle (solid vs hachure) */}
                  {backgroundColor !== "transparent" && (
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-700/50 p-0.5 rounded-md">
                      {FILL_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onFillStyleChange(opt.value)}
                          className={`p-1 rounded cursor-pointer ${fillStyle === opt.value ? "bg-white dark:bg-zinc-800 shadow-xs text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-zinc-300 hover:text-gray-900"}`}
                          title={opt.label}
                        >
                          <FillStyleIcon style={opt.value} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SHAPE_BACKGROUND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onBackgroundColorChange(c)}
                      className={`h-5 w-5 rounded-full border border-gray-300 dark:border-zinc-600 transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                        backgroundColor === c ? "ring-2 ring-indigo-500 ring-offset-1 scale-105" : ""
                      }`}
                      style={
                        c === "transparent"
                          ? {
                              backgroundImage:
                                "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
                              backgroundSize: "6px 6px",
                            }
                          : { backgroundColor: c }
                      }
                    >
                      {backgroundColor === c && (
                        <Check size={11} className={c === "#ffffff" || c === "transparent" || c === "#eab308" ? "text-gray-900" : "text-white"} />
                      )}
                    </button>
                  ))}
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-700" />

                {/* Opacity slider inside Fill popover */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-zinc-200">
                    <span>Opacity</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={1}
                    value={opacity}
                    onChange={(e) => onOpacityChange(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-3.5 w-px bg-gray-200 dark:bg-zinc-700 mx-0.5" />

      {/* 9. Qatlamlar (Order) & More Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleMenu("more")}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer ${
            moreOpen ? "bg-gray-100 dark:bg-zinc-700 text-gray-900 dark:text-zinc-100" : "text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700/60 hover:text-gray-900"
          }`}
          title="Qatlamlar va amallar"
        >
          <MoreVertical size={14} />
        </button>

        {moreOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-2xl text-xs z-50 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400 dark:text-zinc-400 tracking-wider">
              Qatlamlar (Order)
            </div>
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-gray-50 dark:bg-zinc-700/50 rounded-lg border border-gray-200/80 dark:border-zinc-600">
              {LAYER_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => {
                    onReorder(value);
                    setActiveMenu(null);
                  }}
                  className="flex h-7 items-center justify-center rounded-md text-gray-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-xs transition-all cursor-pointer"
                >
                  <Icon size={13} />
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

interface ShapeStyleOnlyPanelProps {
  backgroundColor: string;
  fillStyle: CsFillStyle;
  strokeStyle: CsStrokeStyle;
  edges: CsEdges;
  opacity: number;
  onBackgroundColorChange: (color: string) => void;
  onFillStyleChange: (fillStyle: CsFillStyle) => void;
  onStrokeStyleChange: (strokeStyle: CsStrokeStyle) => void;
  onEdgesChange: (edges: CsEdges) => void;
  onOpacityChange: (opacity: number) => void;
}

// ShapeStylePanel'ning Stroke rang/qalinliksiz varianti — asbob hali
// hech narsa chizilmasdan oldin tanlanganda ko'rinadi. Stroke rang/qalinlik
// asosiy toolbar orqali (pen/highlighter bilan bir xil) boshqariladi,
// shuning uchun bu yerda takrorlanmaydi.
export function ShapeStyleOnlyPanel({
  backgroundColor,
  fillStyle,
  strokeStyle,
  edges,
  opacity,
  onBackgroundColorChange,
  onFillStyleChange,
  onStrokeStyleChange,
  onEdgesChange,
  onOpacityChange,
}: ShapeStyleOnlyPanelProps) {
  const hasBackground = backgroundColor !== "transparent";
  return (
    <div
      className="pointer-events-auto fixed left-3 top-1/2 z-40 flex max-h-[calc(100vh-24px)] w-44 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 text-gray-700 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold text-gray-700">Fon</p>
        <div className="flex items-center gap-1.5">
          {SHAPE_BACKGROUND_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Fon rangi ${c}`}
              onClick={() => onBackgroundColorChange(c)}
              className={`h-6 w-6 rounded-full border-2 ${backgroundColor === c ? "border-indigo-600 ring-1 ring-indigo-500" : "border-gray-200"}`}
              style={
                c === "transparent"
                  ? {
                    backgroundImage:
                      "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
                    backgroundSize: "6px 6px",
                    backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0",
                  }
                  : { backgroundColor: c }
              }
            />
          ))}
        </div>
      </div>

      {hasBackground && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-gray-700">To‘ldirish</p>
          <div className="grid grid-cols-3 gap-1">
            {FILL_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFillStyleChange(option.value)}
                aria-label={option.label}
                title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-[11px] font-bold transition-colors ${fillStyle === option.value
                  ? "bg-indigo-600 text-white "
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                <FillStyleIcon style={option.value} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold text-gray-700">Kontur uslubi</p>
        <div className="grid grid-cols-3 gap-1">
          {STROKE_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStrokeStyleChange(option.value)}
              aria-label={option.label}
              title={option.label}
              className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-bold transition-colors ${strokeStyle === option.value
                ? "bg-indigo-600 text-white "
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
              <StrokeStyleIcon style={option.value} />
            </button>
          ))}
        </div>
      </div>

      {
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-gray-700">Burchaklar</p>
          <div className="grid grid-cols-2 gap-1">
            {EDGES_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onEdgesChange(option.value)}
                aria-label={option.label}
                title={option.label}
                className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-bold transition-colors ${edges === option.value
                  ? "bg-indigo-600 text-white "
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                <EdgeIcon rounded={option.value === "round"} />
              </button>
            ))}
          </div>
        </div>
      }

      {hasBackground && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-gray-700">Shaffoflik</p>
          <input
            aria-label="Shaffoflik"
            type="range"
            min={0}
            max={100}
            step={10}
            value={opacity}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            className="classroom-opacity-slider w-full accent-indigo-600"
          />
        </div>
      )}
    </div>
  );
}

