import type { RefObject } from "react";
import type {
  CsFontFamily,
  CsStroke,
} from "../../api/classroom";
import {
  REF_WIDTH,
  getFontFamilyString,
} from "./classroomCanvasText";
import {
  TextStylePanel,
  applyRichStyleToSelection,
} from "./ClassroomTextStylePanel";

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
  return (
    <>
      <div
        className="absolute z-30 flex flex-col pointer-events-auto"
        style={{
          left: `${textEditor.x * 100}%`,
          top: `${textEditor.y * 100}%`,
          width: editorWidth,
          height: editorHeight,
          padding: editingShapeForPanel
            ? `${Math.max(6, 12 * (size.w / REF_WIDTH))}px`
            : 0,
          boxSizing: "border-box",
          justifyContent:
            textEditor.verticalAlign === "top"
              ? "flex-start"
              : textEditor.verticalAlign === "bottom"
                ? "flex-end"
                : "center",
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
        <TextStylePanel
          color={textEditor.color}
          fontFamily={textEditor.fontFamily}
          fontSize={textEditor.fontSize}
          fontWeight={textEditor.fontWeight}
          textAlign={textEditor.textAlign}
          verticalAlign={textEditor.verticalAlign ?? "middle"}
          rotation={0}
          style={(() => {
            const PANEL_H = 52;
            const GAP = 8;
            const textTopPx = textEditor.y * size.h;
            const panelTop = Math.max(GAP, textTopPx - PANEL_H - GAP);
            return {
              left: `${textEditor.x * 100}%`,
              top: `${panelTop}px`,
              transform: "none",
            };
          })()}
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
    </>
  );
}
