import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CsFontFamily, CsStroke } from "../../api/classroom";
import { REF_WIDTH, measureTextBox } from "./classroomCanvasText";
import type { ActiveTextEditorState } from "./ClassroomPageTextEditor";

interface UseClassroomPageTextEditorParams {
  strokes: CsStroke[];
  pageNumber: number;
  size: { w: number; h: number };
  tool: string;
  strokeWidth: number;
  notebook: boolean;
  color: string;
  colorNonce?: number;
  selectedText: CsStroke | null;
  selectedShape: CsStroke | null;
  selectedGroupIds: Set<string>;
  onToolChange?: (tool: any) => void;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  setSelectedTextId: (id: string | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  claimSelection: (key: string) => void;
  commitGroupStroke: (stroke: CsStroke, groupId?: string) => void;
}

export function useClassroomPageTextEditor({
  strokes,
  pageNumber,
  size,
  tool,
  strokeWidth,
  notebook,
  color,
  colorNonce,
  selectedText,
  selectedShape,
  selectedGroupIds,
  onToolChange,
  onStrokeComplete,
  onUpdateTextStroke,
  onUpdateShapeStroke,
  setSelectedTextId,
  setSelectedShapeId,
  claimSelection,
  commitGroupStroke,
}: UseClassroomPageTextEditorParams) {
  const [textEditor, setTextEditor] = useState<ActiveTextEditorState | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTextStyleRef = useRef<{
    fontFamily: CsFontFamily;
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700;
    textAlign: "left" | "center" | "right";
  }>({
    fontFamily: "Inter",
    fontSize: 24,
    fontWeight: 600,
    textAlign: "left",
  });

  useEffect(() => {
    if (!textEditor) return;
    window.requestAnimationFrame(() => {
      const el = textInputRef.current;
      if (!el) return;
      el.focus();
      el.scrollTop = 0;
    });
  }, [textEditor]);

  useEffect(() => {
    if (!textEditor) return;
    const isEditingShape = editingTextId
      ? strokes.some(
          (stroke) =>
            stroke.id === editingTextId &&
            (stroke.tool === "rectangle" || stroke.tool === "ellipse"),
        )
      : false;
    const input = textInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const nextHeight = Math.max(1, Math.min(2000, input.scrollHeight));
    input.style.height = `${nextHeight}px`;
    if (!isEditingShape && size.w > 0) {
      const normalizedHeight = Math.max(
        1,
        Math.min(2000, (nextHeight / size.w) * REF_WIDTH),
      );
      const measured = measureTextBox(
        textEditor.text,
        textEditor.fontFamily,
        textEditor.fontSize,
        textEditor.fontWeight,
      );
      const neededWidth = Math.max(
        (textEditor as any).textBoxWidth ?? 320,
        measured.width + 24,
      );
      setTextEditor((current) => {
        if (!current) return null;
        const heightDiff = Math.abs(
          normalizedHeight - ((current as any).textBoxHeight ?? 120),
        );
        const widthDiff =
          neededWidth - ((current as any).textBoxWidth ?? 320);
        if (heightDiff > 0.5 || widthDiff > 0.5) {
          return {
            ...current,
            textBoxHeight: normalizedHeight,
            textBoxWidth: neededWidth,
          };
        }
        return current;
      });
    }
  }, [
    textEditor?.text,
    textEditor?.fontFamily,
    textEditor?.fontSize,
    textEditor?.fontWeight,
    size.w,
    editingTextId,
    strokes,
  ]);

  const commitText = () => {
    if (!textEditor?.text.trim()) {
      const editedShape = editingTextId
        ? strokes.find(
            (stroke) =>
              stroke.id === editingTextId &&
              (stroke.tool === "rectangle" || stroke.tool === "ellipse"),
          )
        : null;
      if (editedShape)
        onUpdateShapeStroke?.(pageNumber, { ...editedShape, text: "" });
      setEditingTextId(null);
      setTextEditor(null);
      return;
    }
    const anchorX = textEditor.x;
    const anchorY = textEditor.y;
    const measured = measureTextBox(
      textEditor.text.trim(),
      textEditor.fontFamily,
      textEditor.fontSize,
      textEditor.fontWeight,
    );
    const textBoxWidth = Math.max(4, Math.min(1000, measured.width + 8));
    const textBoxHeight = Math.max(1, Math.min(2000, measured.height));
    const style = {
      fontFamily: textEditor.fontFamily,
      fontSize: textEditor.fontSize,
      fontWeight: textEditor.fontWeight,
      textAlign: textEditor.textAlign,
      verticalAlign: textEditor.verticalAlign,
      textBoxWidth,
      textBoxHeight,
    };
    lastTextStyleRef.current = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      textAlign: style.textAlign,
    };
    const edited = editingTextId
      ? strokes.find((stroke) => stroke.id === editingTextId)
      : null;
    const savedId = edited ? edited.id : crypto.randomUUID();
    if (edited?.tool === "rectangle" || edited?.tool === "ellipse") {
      onUpdateShapeStroke?.(pageNumber, {
        ...edited,
        text: textEditor.text.trim(),
        color: textEditor.color,
        fontFamily: textEditor.fontFamily,
        fontSize: textEditor.fontSize,
        fontWeight: textEditor.fontWeight,
        textAlign: textEditor.textAlign,
        verticalAlign: textEditor.verticalAlign,
      });
    } else if (edited) {
      onUpdateTextStroke?.(pageNumber, {
        ...edited,
        color: textEditor.color,
        points: [anchorX, anchorY],
        text: textEditor.text.trim(),
        ...style,
      });
    } else {
      onStrokeComplete?.(pageNumber, {
        id: savedId,
        tool: "text",
        color: textEditor.color,
        width: strokeWidth,
        points: [anchorX, anchorY],
        text: textEditor.text.trim(),
        ...style,
      });
    }
    setEditingTextId(null);
    setTextEditor(null);
    if (tool === "text") onToolChange?.("select");
    setSelectedTextId(savedId);
    setSelectedShapeId(null);
    claimSelection(
      `${notebook ? "nb" : "pdf"}-${pageNumber}-text-${savedId}`,
    );
  };

  const updateSelectedText = useCallback((changes: Partial<CsStroke>) => {
    if (!selectedText) return;
    const next = { ...selectedText, ...changes };
    const affectsLayout =
      "fontFamily" in changes ||
      "fontSize" in changes ||
      "fontWeight" in changes ||
      "text" in changes;
    if (affectsLayout && next.text) {
      const measured = measureTextBox(
        next.text,
        next.fontFamily ?? "Inter",
        next.fontSize ?? 24,
        next.fontWeight ?? 600,
      );
      next.textBoxWidth = Math.max(4, Math.min(1000, measured.width + 8));
      next.textBoxHeight = Math.max(1, Math.min(2000, measured.height));
    }
    onUpdateTextStroke?.(pageNumber, next);
  }, [selectedText, pageNumber, onUpdateTextStroke]);

  const applyColorToSelection = useCallback(
    (nextColor: string) => {
      if (textEditor) {
        setTextEditor((current) =>
          current ? { ...current, color: nextColor } : current,
        );
      }
      if (selectedText) {
        updateSelectedText({ color: nextColor });
      }
      if (selectedShape) {
        onUpdateShapeStroke?.(pageNumber, {
          ...selectedShape,
          color: nextColor,
        });
      }
      if (selectedGroupIds.size > 0) {
        for (const id of selectedGroupIds) {
          const stroke = strokes.find((s) => s.id === id);
          if (stroke) {
            commitGroupStroke({ ...stroke, color: nextColor });
          }
        }
      }
    },
    [
      textEditor,
      selectedText,
      updateSelectedText,
      selectedShape,
      selectedGroupIds,
      strokes,
      commitGroupStroke,
      pageNumber,
      onUpdateShapeStroke,
    ],
  );

  const lastProcessedNonceRef = useRef(0);
  useEffect(() => {
    if (
      colorNonce &&
      colorNonce > 0 &&
      colorNonce !== lastProcessedNonceRef.current
    ) {
      lastProcessedNonceRef.current = colorNonce;
      applyColorToSelection(color);
    }
  }, [colorNonce, color, applyColorToSelection]);

  return {
    textEditor,
    setTextEditor,
    editingTextId,
    setEditingTextId,
    textInputRef,
    lastTextStyleRef,
    commitText,
    updateSelectedText,
    applyColorToSelection,
  };
}
