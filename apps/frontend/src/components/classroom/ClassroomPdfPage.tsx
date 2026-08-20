import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Copy,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CsNotebookOrientation,
  CsNotebookStyle,
  CsPointer,
  CsStroke,
  CsTool,
} from "../../api/classroom";
import {
  REF_WIDTH,
  DEFAULT_SHAPE_STYLE,
  type ShapeStyle,
} from "./classroomCanvasText";
import {
  getGhostShapeBounds,
  resolveConnector,
  shapeAnchor,
} from "./classroomShapeBindings";
import { ClassroomPageActionControls } from "./ClassroomPageActionControls";
import { ClassroomConnectorShapePicker } from "./ClassroomConnectorShapePicker";
import { ClassroomPageLassoOverlay } from "./ClassroomPageLassoOverlay";
import { ClassroomPageTextEditor } from "./ClassroomPageTextEditor";
import { ClassroomPageSelectionOverlay } from "./ClassroomPageSelectionOverlay";
import {
  CLASSROOM_PAGE_CLIPBOARD_KEY,
  type ClassroomPageClipboard,
  type ClassroomNotebookClipboard,
} from "./classroomPageClipboard";
import { useClassroomPageLasso } from "./useClassroomPageLasso";
import { useClassroomPageTextEditor } from "./useClassroomPageTextEditor";
import { useClassroomPageConnectors } from "./useClassroomPageConnectors";
import { useClassroomShapeTransform } from "./useClassroomShapeTransform";
import { useClassroomPagePointerGestures } from "./useClassroomPagePointerGestures";
import { useClassroomCanvasRenderer } from "./useClassroomCanvasRenderer";

export {
  CLASSROOM_PAGE_CLIPBOARD_KEY,
  type ClassroomPageClipboard,
  type ClassroomNotebookClipboard,
};

export type DrawTool =
  | CsTool
  | "laser"
  | "arrow"
  | "select"
  | "eraser-pixel"
  | "eraser-stroke"
  | "lasso";

export interface PageProps {
  pageNumber: number;
  url?: string;
  notebook?: boolean;
  notebookStyle?: CsNotebookStyle;
  notebookOrientation?: CsNotebookOrientation;
  strokes: CsStroke[];
  pointer: CsPointer | null;
  showPointer: boolean;
  editable: boolean;
  tool: DrawTool;
  showStylePanel: boolean;
  onActivate: () => void;
  onToolChange?: (tool: DrawTool) => void;
  color: string;
  colorNonce?: number;
  onColorChange?: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange?: (width: number) => void;
  shapeStyle?: ShapeStyle;
  onShapeStyleChange?: (style: ShapeStyle) => void;
  onUpdateShapeStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onReorderStroke?: (
    page: number,
    strokeIds: string[],
    op: "front" | "back" | "forward" | "backward",
  ) => void;
  onStrokeComplete?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onMoveStroke?: (page: number, strokeId: string, x: number, y: number, groupId?: string) => void;
  onUpdateTextStroke?: (page: number, stroke: CsStroke, groupId?: string) => void;
  onPointerMove?: (page: number, x: number, y: number, active: boolean) => void;
  onEraseStroke?: (page: number, strokeId: string, groupId?: string) => void;
  onSplitStroke?: (
    page: number,
    strokeId: string,
    replacements: CsStroke[],
    groupId?: string,
  ) => void;
  registerEl: (page: number, el: HTMLDivElement | null) => void;
  zoomVersion: number;
  isHost?: boolean;
  canRemove?: boolean;
  onRemovePage?: (pageNumber: number) => void;
  onClearPage?: (pageNumber: number) => void;
  onInsertPage?: (pageNumber: number, style?: CsNotebookStyle, orientation?: CsNotebookOrientation) => void;
  onSetNotebookStyle?: (pageNumber: number, style: CsNotebookStyle) => void;
  isActiveSurface?: boolean;
  lassoClipboard?: { current: CsStroke[] };
  onCopyAllNotebookPages?: () => void;
  allowPageCopy?: boolean;
  activeSelectionKey?: string | null;
  onClaimSelection?: (key: string) => void;
}

export function ClassroomPdfPage({
  pageNumber,
  url,
  notebook = false,
  notebookStyle = "grid",
  notebookOrientation = "portrait",
  strokes,
  pointer,
  showPointer,
  editable,
  tool,
  showStylePanel,
  onActivate,
  onToolChange,
  color,
  colorNonce,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  shapeStyle = DEFAULT_SHAPE_STYLE,
  onShapeStyleChange,
  onUpdateShapeStroke,
  onStrokeComplete,
  onMoveStroke,
  onUpdateTextStroke,
  onPointerMove,
  onEraseStroke,
  onSplitStroke,
  onReorderStroke,
  registerEl,
  zoomVersion,
  isHost = false,
  canRemove = true,
  onRemovePage,
  onClearPage,
  onInsertPage,
  onSetNotebookStyle,
  isActiveSurface = false,
  lassoClipboard,
  onCopyAllNotebookPages,
  allowPageCopy = false,
  activeSelectionKey,
  onClaimSelection,
}: PageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [showNotebookMenu, setShowNotebookMenu] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [, forceRedraw] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastPointerPosRef = useRef<[number, number] | null>(null);
  const draggingGroupRef = useRef<{ ids: Set<string>; startX: number; startY: number } | null>(null);

  const pageSelectionKeyRef = useRef<string | null>(null);
  const claimSelection = useCallback(
    (key: string) => {
      pageSelectionKeyRef.current = key;
      onClaimSelection?.(key);
    },
    [onClaimSelection],
  );

  useEffect(() => {
    if (activeSelectionKey && activeSelectionKey !== pageSelectionKeyRef.current) {
      pageSelectionKeyRef.current = null;
      setSelectedShapeId(null);
      setSelectedTextId(null);
    }
  }, [activeSelectionKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    registerEl(pageNumber, wrapRef.current);
    return () => registerEl(pageNumber, null);
  }, [pageNumber, registerEl]);

  const syncSize = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0)
      setSize({ w: rect.width, h: rect.height });
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(surface);
    return () => ro.disconnect();
  }, [syncSize, visible]);

  useLayoutEffect(() => {
    syncSize();
  }, [zoomVersion, syncSize]);

  const selectedText = selectedTextId
    ? strokes.find(
        (stroke) => stroke.id === selectedTextId && stroke.tool === "text",
      ) ?? null
    : null;

  const selectedShapeRaw = selectedShapeId
    ? strokes.find(
        (stroke) =>
          stroke.id === selectedShapeId &&
          (stroke.tool === "rectangle" ||
            stroke.tool === "ellipse" ||
            stroke.tool === "line" ||
            stroke.tool === "arrow"),
      ) ?? null
    : null;

  const selectedShape = selectedShapeRaw
    ? resolveConnector(selectedShapeRaw, strokes, size.w, size.h)
    : null;

  const deleteStrokeAndAttachedConnectors = useCallback(
    (strokeIdOrIds: string | string[], customGroupId?: string) => {
      const idsToDelete = new Set(
        Array.isArray(strokeIdOrIds) ? strokeIdOrIds : [strokeIdOrIds],
      );
      for (const s of strokes) {
        if (s.tool === "line" || s.tool === "arrow") {
          if (
            (s.startBinding && idsToDelete.has(s.startBinding.strokeId)) ||
            (s.endBinding && idsToDelete.has(s.endBinding.strokeId))
          ) {
            idsToDelete.add(s.id);
          }
        }
      }
      const batchGroupId = customGroupId || crypto.randomUUID();
      for (const id of idsToDelete) {
        onEraseStroke?.(pageNumber, id, batchGroupId);
      }
    },
    [strokes, onEraseStroke, pageNumber],
  );

  const {
    selectedGroupIds,
    setSelectedGroupIds,
    selectedGroupBounds,
    commitGroupStroke,
    deleteSelectedGroup,
    copySelectedGroup,
    beginGroupResize,
    transformGroupResize,
    finishGroupResize,
    beginGroupRotate,
    transformGroupRotate,
    finishGroupRotate,
  } = useClassroomPageLasso({
    strokes,
    pageNumber,
    size,
    editable,
    tool,
    isActiveSurface,
    lassoClipboard,
    lastPointerPosRef,
    onStrokeComplete,
    onUpdateTextStroke,
    onUpdateShapeStroke,
    deleteStrokeAndAttachedConnectors,
    forceRedraw,
    surfaceRef,
  });

  const {
    textEditor,
    setTextEditor,
    editingTextId,
    setEditingTextId,
    textInputRef,
    lastTextStyleRef,
    commitText,
    updateSelectedText,
    applyColorToSelection,
  } = useClassroomPageTextEditor({
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
  });

  const {
    lineEndpointDragRef,
    transformingShapeRef,
    isTransforming,
    beginLineEndpointResize,
    transformLineEndpoint,
    beginShapeResize,
    beginShapeRotate,
    transformShape,
    finishShapeTransform,
    beginTextResize,
    beginTextRotate,
    transformText,
    finishTextTransform,
  } = useClassroomShapeTransform({
    strokes,
    pageNumber,
    size,
    selectedShape,
    selectedShapeRaw,
    selectedText,
    surfaceRef,
    onUpdateShapeStroke,
    onUpdateTextStroke,
    setConnectorTarget: () => {},
    forceRedraw,
  });

  // Delete / Backspace removes whatever is selected. Bound on window rather than the surface
  // because the canvas is not focusable, so key events never reach it.
  useEffect(() => {
    if (!editable) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      // Never while typing -- in a text box, or in any input elsewhere on the page, the key
      // means "delete a character".
      if (editingTextId) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }

      if (selectedGroupIds.size > 0) {
        event.preventDefault();
        deleteSelectedGroup();
        return;
      }
      const singleId = selectedShapeId ?? selectedTextId;
      if (singleId) {
        event.preventDefault();
        deleteStrokeAndAttachedConnectors(singleId);
        setSelectedShapeId(null);
        setSelectedTextId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editable,
    editingTextId,
    selectedGroupIds,
    selectedShapeId,
    selectedTextId,
    deleteSelectedGroup,
    deleteStrokeAndAttachedConnectors,
  ]);

  const {
    connectorDraftRef,
    connectorHover,
    setConnectorHover,
    connectorTarget,
    setConnectorTarget,
    connectorShapePicker,
    setConnectorShapePicker,
    pickConnectorShape,
    beginConnectorFromStroke,
    moveConnectorFromShape,
    finishConnectorFromShape,
  } = useClassroomPageConnectors({
    strokes,
    pageNumber,
    size,
    color,
    strokeWidth,
    shapeStyle,
    notebook,
    surfaceRef,
    draggingShapeRef: { current: null },
    transformingShapeRef,
    onStrokeComplete,
    onUpdateShapeStroke,
    setSelectedTextId,
    setSelectedShapeId,
    setEditingTextId,
    setTextEditor,
    claimSelection,
    forceRedraw,
  });

  const updateSelectedShape = (changes: Partial<CsStroke>) => {
    if (!selectedShape) return;
    onUpdateShapeStroke?.(pageNumber, { ...selectedShape, ...changes });
  };

  const {
    hoveredStrokeId,
    draftRef,
    draftPressuresRef,
    lassoDraftRef,
    eraserCursorRef,
    isEraser,
    handlePointerDown,
    handlePointerMove,
    finishStroke,
    handlePointerLeave,
  } = useClassroomPagePointerGestures({
    editable,
    pageNumber,
    strokes,
    size,
    tool,
    color,
    strokeWidth,
    shapeStyle,
    notebook,
    canvasRef,
    textEditor,
    editingTextId,
    lastTextStyleRef,
    selectedGroupIds,
    selectedGroupBounds,
    draggingGroupRef,
    connectorDraftRef,
    lineEndpointDragRef,
    onActivate,
    onPointerMove,
    onStrokeComplete,
    onMoveStroke,
    onUpdateShapeStroke,
    onSplitStroke,
    onToolChange,
    claimSelection,
    commitText,
    commitGroupStroke,
    deleteStrokeAndAttachedConnectors,
    setSelectedTextId,
    setSelectedShapeId,
    setSelectedGroupIds,
    setEditingTextId,
    setTextEditor,
    setConnectorTarget,
    forceRedraw,
    lastPointerPosRef,
  });

  useClassroomCanvasRenderer({
    canvasRef,
    size,
    strokes,
    editingTextId,
    textEditor,
    hoveredStrokeId,
    strokeWidth,
    draftRef,
    draftPressuresRef,
    tool,
    color,
    shapeStyle,
    connectorDraftRef,
    showPointer,
    pointer,
    lassoDraftRef,
    eraserCursorRef,
    forceRedraw,
  });

  const copyWholePage = () => {
    if (lassoClipboard) lassoClipboard.current = [];
    const clipboard: ClassroomPageClipboard = {
      version: 1,
      type: "classroom-page",
      mode: notebook ? "notebook" : "pdf",
      pageUrl: notebook ? undefined : url,
      notebookStyle,
      notebookOrientation,
      strokes: strokes.map((stroke) => ({
        ...stroke,
        points: [...stroke.points],
      })),
    };
    const serialized = JSON.stringify(clipboard);
    localStorage.setItem(CLASSROOM_PAGE_CLIPBOARD_KEY, serialized);
    void navigator.clipboard?.writeText(serialized).catch(() => {});
    toast.success("Sahifa nusxalandi");
  };

  const copyAllNotebookPages = () => {
    setShowNotebookMenu(false);
    onCopyAllNotebookPages?.();
  };

  const editorFontSize = textEditor
    ? Math.max(1, textEditor.fontSize * (size.w / REF_WIDTH))
    : 16;
  const editingShapeForPanel = editingTextId
    ? strokes.find(
        (stroke) =>
          stroke.id === editingTextId &&
          (stroke.tool === "rectangle" || stroke.tool === "ellipse"),
      )
    : undefined;
  const editorWidth = editingShapeForPanel
    ? Math.abs(editingShapeForPanel.points[2] - editingShapeForPanel.points[0]) *
      size.w
    : textEditor
      ? Math.max(40, ((textEditor as any).textBoxWidth ?? 320) * (size.w / REF_WIDTH))
      : 140;
  const editorHeight = editingShapeForPanel
    ? Math.abs(editingShapeForPanel.points[3] - editingShapeForPanel.points[1]) *
      size.h
    : textEditor
      ? Math.max(24, ((textEditor as any).textBoxHeight ?? 120) * (size.w / REF_WIDTH))
      : 48;

  useLayoutEffect(() => {
    const textarea = textInputRef.current;
    if (!textarea || !textEditor) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [
    editorFontSize,
    editorHeight,
    editorWidth,
    size.w,
    textEditor?.fontFamily,
    textEditor?.fontWeight,
    textEditor?.text,
    textEditor?.verticalAlign,
  ]);

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className="relative shrink-0 w-full flex justify-center"
    >
      {visible ? (
        <div
          ref={(element) => {
            if (notebook) surfaceRef.current = element;
          }}
          className={`relative ${
            notebook
              ? `${notebookOrientation === "landscape" ? "aspect-[297/210]" : "aspect-[210/297]"} w-full bg-white `
              : "w-full"
          }`}
          style={notebook ? { width: "100%" } : undefined}
        >
          {(isHost || allowPageCopy) && notebook && pageNumber === 1 && (
            <div className="absolute left-1 top-1 z-20">
              <button
                type="button"
                onClick={() => setShowNotebookMenu((visible) => !visible)}
                title="Daftar amallari"
                aria-label="Daftar amallari"
                className="glass flex items-center justify-center rounded-full p-1.5 text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
              >
                <MoreHorizontal size={13} />
              </button>
              {showNotebookMenu && (
                <div className="glass-card absolute left-0 top-8 flex min-w-40 flex-col gap-1 p-1.5 shadow-2xl text-[var(--text-primary)]">
                  <button
                    type="button"
                    onClick={copyAllNotebookPages}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--card-hover)] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    <Copy size={14} /> To'liq nusxalash
                  </button>
                </div>
              )}
            </div>
          )}
          {notebook ? (
            <div
              aria-label={`Daftar sahifasi ${pageNumber}`}
              className="absolute inset-0 bg-white"
              style={
                notebookStyle === "plain"
                  ? undefined
                  : notebookStyle === "lined"
                    ? {
                        backgroundImage:
                          "linear-gradient(rgba(148,163,184,.14) 1px, transparent 1px)",
                        backgroundSize: `100% ${size.w > 0 ? size.w / 22 : 32}px`,
                      }
                    : notebookStyle === "dot"
                      ? {
                          // Excalidraw uslubidagi nuqta-naqsh — grid'dan
                          // zichroq oraliqda (size.w / 40, grid'ning size.w/24
                          // katagiga nisbatan sezilarli ko'proq nuqta beradi).
                          // Nuqta kichik va och rangda — sahifa foniga yaqin,
                          // ko'zga tashlanmaydi, faqat mo'ljal sifatida sezilib turadi.
                          backgroundImage:
                            "radial-gradient(circle, rgba(148,163,184,.28) 1px, transparent 1px)",
                          backgroundSize: `${size.w > 0 ? size.w / 40 : 20}px ${size.w > 0 ? size.w / 40 : 20}px`,
                        }
                      : {
                          backgroundImage:
                            "linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)",
                          backgroundSize: `${size.w > 0 ? size.w / 24 : 32}px ${size.w > 0 ? size.w / 24 : 32}px`,
                        }
              }
            />
          ) : (
            <img
              ref={(element) => {
                surfaceRef.current = element;
              }}
              src={url}
              alt={`Sahifa ${pageNumber}`}
              className="block h-auto w-full select-none"
              draggable={false}
              onLoad={syncSize}
            />
          )}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{
              touchAction: editable ? "none" : "auto",
              cursor: editable
                ? isEraser
                  ? "cell"
                  : tool === "select"
                    ? hoveredStrokeId
                      ? "grab"
                      : "pointer"
                    : tool === "text"
                      ? "move"
                      : "crosshair"
                : "default",
              pointerEvents: editable ? "auto" : "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={handlePointerLeave}
          />
          {connectorTarget && (() => {
            const targetShape = strokes.find(
              (stroke) => stroke.id === connectorTarget.shapeId,
            );
            if (!targetShape) return null;
            return (
              <div className="pointer-events-none absolute inset-0 z-40">
                {(["top", "right", "bottom", "left"] as const).map((side) => {
                  const [anchorX, anchorY] = shapeAnchor(
                    targetShape,
                    side,
                    0.5,
                    size.w,
                    size.h,
                  );
                  return (
                    <span
                      key={side}
                      className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500 bg-white shadow-md"
                      style={{
                        left: `${anchorX * 100}%`,
                        top: `${anchorY * 100}%`,
                      }}
                    />
                  );
                })}
                <span
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500 transition-all ${connectorTarget.snapped ? "h-5 w-5 bg-indigo-500/25 ring-4 ring-indigo-400/20" : "h-3.5 w-3.5 bg-white"}`}
                  style={{
                    left: `${connectorTarget.point[0] * 100}%`,
                    top: `${connectorTarget.point[1] * 100}%`,
                  }}
                />
              </div>
            );
          })()}
          {textEditor && (
            <ClassroomPageTextEditor
              textEditor={textEditor}
              size={size}
              editorWidth={editorWidth}
              editorHeight={editorHeight}
              editorFontSize={editorFontSize}
              editingShapeForPanel={editingShapeForPanel}
              selectedShape={selectedShape}
              showStylePanel={showStylePanel}
              pageNumber={pageNumber}
              textInputRef={textInputRef}
              setTextEditor={setTextEditor}
              commitText={commitText}
              onUpdateShapeStroke={onUpdateShapeStroke}
            />
          )}

          <ClassroomPageSelectionOverlay
            tool={tool}
            selectedText={selectedText}
            editingTextId={editingTextId}
            selectedShape={selectedShape}
            selectedShapeRaw={selectedShapeRaw}
            shapeStyle={shapeStyle}
            color={color}
            strokeWidth={strokeWidth}
            showStylePanel={showStylePanel}
            isTransforming={isTransforming}
            size={size}
            pageNumber={pageNumber}
            onToolChange={onToolChange}
            onColorChange={onColorChange}
            onStrokeWidthChange={onStrokeWidthChange}
            onShapeStyleChange={onShapeStyleChange}
            applyColorToSelection={applyColorToSelection}
            updateSelectedText={updateSelectedText}
            updateSelectedShape={updateSelectedShape}
            deleteStrokeAndAttachedConnectors={deleteStrokeAndAttachedConnectors}
            setSelectedTextId={setSelectedTextId}
            setSelectedShapeId={setSelectedShapeId}
            setConnectorTarget={setConnectorTarget}
            setTextEditor={setTextEditor}
            onReorderStroke={onReorderStroke}
            beginTextResize={beginTextResize}
            beginTextRotate={beginTextRotate}
            transformText={transformText}
            finishTextTransform={finishTextTransform}
            beginShapeResize={beginShapeResize}
            beginShapeRotate={beginShapeRotate}
            transformShape={transformShape}
            finishShapeTransform={finishShapeTransform}
            beginLineEndpointResize={beginLineEndpointResize}
            transformLineEndpoint={transformLineEndpoint}
            beginConnectorFromStroke={beginConnectorFromStroke}
            moveConnectorFromShape={moveConnectorFromShape}
            finishConnectorFromShape={finishConnectorFromShape}
            connectorDraftRef={connectorDraftRef}
            setConnectorHover={setConnectorHover}
          />

          {tool === "lasso" && selectedGroupBounds && (
            <ClassroomPageLassoOverlay
              selectedGroupBounds={selectedGroupBounds}
              selectedGroupIds={selectedGroupIds}
              pageNumber={pageNumber}
              onReorderStroke={onReorderStroke}
              onCopySelectedGroup={copySelectedGroup}
              onDeleteSelectedGroup={deleteSelectedGroup}
              onBeginGroupResize={beginGroupResize}
              onTransformGroupResize={transformGroupResize}
              onFinishGroupResize={finishGroupResize}
              onBeginGroupRotate={beginGroupRotate}
              onTransformGroupRotate={transformGroupRotate}
              onFinishGroupRotate={finishGroupRotate}
            />
          )}

          {connectorHover && size.w > 0 && size.h > 0 && (() => {
            const ghost = getGhostShapeBounds(
              connectorHover.stroke,
              connectorHover.side,
              size,
            );
            return (
              <div
                className={`pointer-events-none absolute z-30 border-2 border-dashed border-indigo-400 bg-indigo-500/10 transition-all duration-150 flex items-center justify-center ${ghost.tool === "ellipse" ? "rounded-full" : "rounded-lg"}`}
                style={{
                  left: `${ghost.minX * 100}%`,
                  top: `${ghost.minY * 100}%`,
                  width: `${ghost.width * 100}%`,
                  height: `${ghost.height * 100}%`,
                  transform: `rotate(${ghost.rotation}deg)`,
                  transformOrigin: "center",
                }}
              >
                <Plus className="h-5 w-5 text-indigo-500 opacity-60 animate-pulse" />
              </div>
            );
          })()}

          {connectorShapePicker && (
            <ClassroomConnectorShapePicker
              picker={connectorShapePicker}
              onClose={() => setConnectorShapePicker(null)}
              onPick={pickConnectorShape}
            />
          )}
        </div>
      ) : (
        <div className="w-full aspect-3/4 max-w-3xl bg-gray-200 animate-pulse rounded-xl" />
      )}

      <ClassroomPageActionControls
        pageNumber={pageNumber}
        notebook={notebook}
        isHost={isHost}
        allowPageCopy={allowPageCopy}
        canRemove={canRemove}
        onInsertPage={onInsertPage}
        onSetNotebookStyle={onSetNotebookStyle}
        onRemovePage={onRemovePage}
        onClearPage={onClearPage}
        onCopyPage={copyWholePage}
      />
    </div>
  );
}
