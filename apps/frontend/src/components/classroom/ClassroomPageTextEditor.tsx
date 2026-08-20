import { useMemo, type RefObject } from "react";
import type {
  CsFontFamily,
  CsStroke,
} from "../../api/classroom";
import {
  REF_WIDTH,
  getFontFamilyString,
  getMeasureCtx,
  wrapTextLines,
} from "./classroomCanvasText";
import {
  TextStylePanel,
  applyRichStyleToSelection,
} from "./ClassroomTextStylePanel";
import { AutoFlipPositioner } from "./AutoFlipPositioner";

export interface ActiveTextEditorState {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: CsFontFamily;
  fontWeight: 400 | 500 | 600 | 700;
  textAlign: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  textBoxWidth?: number;
  textBoxHeight?: number;
  strokeId?: string;
}

interface ClassroomPageTextEditorProps {
  textEditor: ActiveTextEditorState;
  size: { w: number; h: number };
  editorWidth: string | number;
  editorHeight: string | number;
  editorFontSize: string | number;
  editingShapeForPanel?: CsStroke | null;
  selectedShape?: CsStroke | null;
  showStylePanel: boolean;
  pageNumber: number;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  setTextEditor: React.Dispatch<
    React.SetStateAction<ActiveTextEditorState | null>
  >;
  commitText: () => void;
  onUpdateShapeStroke?: (
    page: number,
    stroke: CsStroke,
    groupId?: string,
  ) => void;
}

export function ClassroomPageTextEditor({
  textEditor,
  size,
  editorWidth,
  editorHeight,
  editorFontSize,
  editingShapeForPanel,
  selectedShape,
  showStylePanel,
  pageNumber,
  textInputRef,
  setTextEditor,
  commitText,
  onUpdateShapeStroke,
}: ClassroomPageTextEditorProps) {
  // Mirrors the canvas padding in classroomCanvasDraw so editing and viewing line up: it
  // scales with the font as well as the page, otherwise large text sits against the edge.
  const shapePadding = editingShapeForPanel
    ? Math.max(
        8,
        12 * (size.w / REF_WIDTH),
        (typeof editorFontSize === "number" ? editorFontSize : 16) * 0.45,
      )
    : 0;

  // Oddiy matn (tool: "text") uchun tahrirlash PAYTIDA har doim TEPADAN
  // boshlanadi — box foydalanuvchi bosgan nuqtadan pastga o'sadi, boshlang'ich
  // nuqta qo'zg'almaydi. Agar bu yerda ham verticalAlign (middle/bottom)
  // qo'llansa, box balandligi matn kontentiga qarab o'sganda/qisqarganda
  // matnning MARKAZI bosilgan nuqtada qoladi — bosilgan nuqtaning o'zi esa
  // pastga (yoki yuqoriga) "suriladi", chunki endi u nuqta box tepasi emas,
  // markazi bo'lib qoladi. verticalAlign faqat COMMIT qilingach (statik,
  // tahrirlanmayotgan holatda) mazmunga ega — o'sha payt box o'lchami
  // barqaror, "surilish" xavfi yo'q. Shape (rectangle/ellipse) ichidagi matn
  // bunga kirmaydi: u yerda box o'lchami foydalanuvchi tomonidan qat'iy
  // belgilangan (statik), shuning uchun middle/bottom u yerda xavfsiz.
  const verticalPaddingTop = useMemo(() => {
    if (!editingShapeForPanel) return 0;
    const containerHeightPx =
      typeof editorHeight === "number" ? editorHeight : parseFloat(String(editorHeight)) || 0;
    const containerWidthPx =
      typeof editorWidth === "number" ? editorWidth : parseFloat(String(editorWidth)) || 0;
    const fontSizePx =
      typeof editorFontSize === "number" ? editorFontSize : parseFloat(String(editorFontSize)) || 16;
    if (containerHeightPx <= 0 || containerWidthPx <= 0) return 0;
    const innerWidthPx = Math.max(1, containerWidthPx - shapePadding * 2);
    const innerHeightPx = Math.max(1, containerHeightPx - shapePadding * 2);
    const ctx = getMeasureCtx();
    ctx.font = `${textEditor.fontWeight} ${fontSizePx}px ${getFontFamilyString(textEditor.fontFamily)}`;
    const lines = wrapTextLines(ctx, textEditor.text || "", innerWidthPx);
    const lineHeightPx = fontSizePx * 1.25;
    const textBlockHeightPx = Math.max(lineHeightPx, lines.length * lineHeightPx);
    const verticalAlign = textEditor.verticalAlign ?? "middle";
    const blockTop =
      verticalAlign === "top"
        ? 0
        : verticalAlign === "bottom"
          ? innerHeightPx - textBlockHeightPx
          : (innerHeightPx - textBlockHeightPx) / 2;
    return Math.max(0, blockTop);
  }, [
    editingShapeForPanel,
    editorHeight,
    editorWidth,
    editorFontSize,
    shapePadding,
    textEditor.fontWeight,
    textEditor.fontFamily,
    textEditor.text,
    textEditor.verticalAlign,
  ]);

  return (
    <>
      <div
        className="absolute z-30 flex flex-col pointer-events-auto"
        style={{
          left: `${textEditor.x * 100}%`,
          top: `${textEditor.y * 100}%`,
          width: editorWidth,
          height: editorHeight,
          paddingLeft: shapePadding,
          paddingRight: shapePadding,
          paddingBottom: shapePadding,
          paddingTop: shapePadding + verticalPaddingTop,
          boxSizing: "border-box",
          justifyContent: "flex-start",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
      >
        <textarea
          ref={textInputRef}
          value={textEditor.text}
          onChange={(event) => {
            setTextEditor((current) =>
              current
                ? { ...current, text: event.target.value.slice(0, 500) }
                : current,
            );
            if (textInputRef.current) {
              textInputRef.current.style.height = "auto";
              textInputRef.current.style.height = `${textInputRef.current.scrollHeight}px`;
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setTextEditor(null);
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            )
              commitText();
          }}
          className="classroom-text-editor block w-full shrink-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none ring-0"
          style={{
            margin: 0,
            padding: 0,
            backgroundColor: "transparent",
            appearance: "none",
            color: "transparent",
            caretColor: textEditor.color,
            fontFamily: getFontFamilyString(textEditor.fontFamily),
            fontSize: editorFontSize,
            fontWeight: textEditor.fontWeight,
            textAlign: textEditor.textAlign,
            lineHeight: 1.25,
          }}
        />
      </div>

      {showStylePanel && !selectedShape && (
        <AutoFlipPositioner
          anchorLeft={`${textEditor.x * 100}%`}
          anchorTopPx={textEditor.y * size.h}
          anchorBottomPx={
            textEditor.y * size.h +
            (typeof editorHeight === "number"
              ? editorHeight
              : parseFloat(String(editorHeight)) || 0)
          }
          centered={false}
        >
          {(openBelow) => (
        <TextStylePanel
          color={textEditor.color}
          fontFamily={textEditor.fontFamily}
          fontSize={textEditor.fontSize}
          fontWeight={textEditor.fontWeight}
          textAlign={textEditor.textAlign}
          verticalAlign={textEditor.verticalAlign ?? "middle"}
          rotation={0}
          dropdownDirection={openBelow ? "up" : "down"}
          onColorChange={(nextColor) => {
            applyRichStyleToSelection("color", nextColor);
            setTextEditor((current) =>
              current ? { ...current, color: nextColor } : current,
            );
          }}
          onFontFamilyChange={(fontFamily) => {
            applyRichStyleToSelection(
              "fontFamily",
              getFontFamilyString(fontFamily),
            );
            setTextEditor((current) =>
              current ? { ...current, fontFamily } : current,
            );
          }}
          onFontSizeChange={(fontSize) => {
            applyRichStyleToSelection("fontSize", fontSize);
            setTextEditor((current) =>
              current ? { ...current, fontSize } : current,
            );
          }}
          onFontWeightChange={(fontWeight) => {
            applyRichStyleToSelection("fontWeight", fontWeight);
            setTextEditor((current) =>
              current ? { ...current, fontWeight } : current,
            );
          }}
          onTextAlignChange={(textAlign) =>
            setTextEditor((current) =>
              current ? { ...current, textAlign } : current,
            )
          }
          onVerticalAlignChange={(verticalAlign) => {
            setTextEditor((current) =>
              current ? { ...current, verticalAlign } : current,
            );
            if (editingShapeForPanel) {
              onUpdateShapeStroke?.(pageNumber, {
                ...editingShapeForPanel,
                points: [...editingShapeForPanel.points],
                verticalAlign,
              });
            }
          }}
        />
          )}
        </AutoFlipPositioner>
      )}
    </>
  );
}
