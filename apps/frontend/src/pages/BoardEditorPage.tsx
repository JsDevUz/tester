import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Maximize2, Minimize2, Check, PenLine, Download, Sun, Moon,
} from "lucide-react";
import { toast } from "sonner";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomTheme } from "../hooks/useClassroomTheme";
import { useFullscreen } from "../hooks/useFullscreen";
import {
  ClassroomPdfViewer,
  type DrawTool,
} from "../components/classroom/ClassroomPdfViewer";
import {
  DEFAULT_SHAPE_STYLE,
  type ShapeStyle,
} from "../components/classroom/classroomCanvasText";
import { ClassroomToolbar } from "../components/classroom/ClassroomToolbar";
import { ClassroomPdfLibraryModal } from "../components/classroom/ClassroomPdfLibraryModal";
import { PdfPageSelectModal } from "../components/classroom/PdfPageSelectModal";
import { WhiteboardHistoryModal } from "../components/classroom/WhiteboardHistoryModal";
import { DownloadBoardModal } from "../components/classroom/DownloadBoardModal";
import { exportBoardToPdf } from "../components/classroom/classroomExport";
import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import {
  apiAttachClassPdf,
  apiClassSession,
  apiInsertClassPdfPages,
  type PdfLibraryAsset,
} from "../api/classroom";
import { apiUpdateBoardTitle, type BoardActivityItem } from "../api/boards";

export function BoardEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isViewOnly = searchParams.get("view") === "1" || searchParams.get("mode") === "view";

  const { state, hostActions, canUndo, canRedo } = useClassroomSession(id, isViewOnly ? "student" : "host");
  useClassroomTheme(state.classroomTheme);
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(pageRef);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [colorNonce, setColorNonce] = useState(0);
  const handleColorChange = useCallback((c: string) => {
    setColor(c);
    setColorNonce(Date.now());
  }, []);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE_STYLE);
  const [activePane, setActivePane] = useState<"left" | "right">("left");

  // PDF library
  const [pdfLibraryOpen, setPdfLibraryOpen] = useState(false);
  const [pageSelectAsset, setPageSelectAsset] = useState<PdfLibraryAsset | null>(null);
  const [insertAfterPageIndex, setInsertAfterPageIndex] = useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Board title
  const [boardTitle, setBoardTitle] = useState("Nomsiz doska");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [focusedStrokeId, setFocusedStrokeId] = useState<string | null>(null);

  // Download PDF / Notebook modal
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadBoard = async (mode: "pdf" | "notebook") => {
    const isSplitRight = state.boardLayout === "split" && activePane === "right";
    const pageUrls = mode === "pdf" ? state.pages : [];
    const strokesByPage = isSplitRight ? state.rightStrokesByPage : state.strokesByPage;
    const pageCount = mode === "notebook" ? state.notebookPageCount : state.pages.length;
    if (pageCount === 0) {
      toast.error("Yuklab olish uchun sahifa topilmadi");
      return;
    }
    setDownloading(true);
    try {
      await exportBoardToPdf({
        mode,
        notebookPageStyles: state.notebookPageStyles,
        notebookPageOrientations: state.notebookPageOrientations,
        theme: state.classroomTheme,
        pageUrls,
        strokesByPage: (state.strokesByMode
          ? state.strokesByMode[mode]
          : strokesByPage) ?? {},
        pageCount,
        fileName: `${mode === "notebook" ? "daftar" : "pdf"}-${boardTitle.replace(/\s+/g, "_") || "doska"}-${Date.now()}.pdf`,
      });
      setDownloadModalOpen(false);
    } catch {
      toast.error("Yuklab bo'lmadi, qayta urinib ko'ring");
    } finally {
      setDownloading(false);
    }
  };

  const handleSelectActivity = (item: BoardActivityItem) => {
    if (item.page && item.page !== state.currentPage) {
      hostActions.setPage(item.page);
    }
    if (item.strokeId) {
      setFocusedStrokeId(item.strokeId);
      setTimeout(() => setFocusedStrokeId(null), 3500);
    }
  };

  // Keyboard shortcuts
  const hotkeyOptions = { preventDefault: true, enabled: !isViewOnly };
  useHotkeys("1", () => handleToolChange("select"), hotkeyOptions);
  useHotkeys("2", () => handleToolChange("pen"), hotkeyOptions);
  useHotkeys("3", () => handleToolChange("text"), hotkeyOptions);
  useHotkeys("4", () => handleToolChange("highlighter"), hotkeyOptions);
  useHotkeys("z", () => handleToolChange("laser"), hotkeyOptions);
  useHotkeys("5", () => handleToolChange("arrow"), hotkeyOptions);
  useHotkeys("-", () => handleToolChange("line"), hotkeyOptions);
  useHotkeys("6", () => handleToolChange("rectangle"), hotkeyOptions);
  useHotkeys("7", () => handleToolChange("ellipse"), hotkeyOptions);
  useHotkeys("8", () => handleToolChange("eraser-pixel"), hotkeyOptions);
  useHotkeys("9", () => handleToolChange("eraser-stroke"), hotkeyOptions);
  useHotkeys("0", () => handleToolChange("lasso"), hotkeyOptions);
  useHotkeys("s", () => setStrokeWidth(2), hotkeyOptions);
  useHotkeys("m", () => setStrokeWidth(4), hotkeyOptions);
  useHotkeys("l", () => setStrokeWidth(7), hotkeyOptions);
  useHotkeys("mod+z", () => {
    if (canUndo) hostActions.undo();
  }, hotkeyOptions, [canUndo]);
  useHotkeys("mod+shift+z", () => {
    if (canRedo) hostActions.redo();
  }, hotkeyOptions, [canRedo]);
  useHotkeys("mod+y", () => {
    if (canRedo) hostActions.redo();
  }, hotkeyOptions, [canRedo]);

  useEffect(() => {
    if (state.title) setBoardTitle(state.title);
  }, [state.title]);

  useEffect(() => {
    if (!id) return;
    apiClassSession(id)
      .then((detail) => {
        if (detail.title) setBoardTitle(detail.title);
      })
      .catch(() => { });
  }, [id]);

  const handleAttachPages = async (pageNumbers: number[]) => {
    if (!id || !pageSelectAsset) return;
    setAttaching(true);
    try {
      if (insertAfterPageIndex !== null) {
        await apiInsertClassPdfPages(id, pageSelectAsset.id, pageNumbers, insertAfterPageIndex);
        toast.success("Sahifa qo'shildi");
      } else {
        await apiAttachClassPdf(id, pageSelectAsset.id, pageNumbers);
        toast.success("PDF qo'shildi");
      }
      setPageSelectAsset(null);
      setInsertAfterPageIndex(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "PDF qo'shishda xatolik");
    } finally {
      setAttaching(false);
    }
  };

  const handleInsertPdfPage = (afterPageIndex: number) => {
    setInsertAfterPageIndex(afterPageIndex);
    setPdfLibraryOpen(true);
  };

  const handleTitleSave = async () => {
    if (!id) return;
    const newTitle = titleDraft.trim();
    setSavingTitle(true);
    try {
      await apiUpdateBoardTitle(id, newTitle);
      setBoardTitle(newTitle || "Nomsiz doska");
      setEditingTitle(false);
    } catch {
      toast.error("Nomni saqlab bo'lmadi");
    } finally {
      setSavingTitle(false);
    }
  };

  const handleToolChange = useCallback((nextTool: DrawTool) => {
    const targetTool = nextTool === "line" ? "arrow" : nextTool;
    setTool(targetTool);
    if (nextTool === "line") {
      setShapeStyle((prev) => ({
        ...prev,
        lineShape: "straight",
        endArrowHead: "none",
        startArrowHead: "none",
      }));
    } else if (nextTool === "arrow") {
      setShapeStyle((prev) => ({
        ...prev,
        lineShape: "straight",
        endArrowHead: "arrow",
        startArrowHead: "none",
      }));
    }
  }, []);

  if (state.error) {
    const errorText =
      state.error === "FORBIDDEN"
        ? "Ushbu doskani ko'rish huquqingiz yo'q"
        : state.error === "CONNECTION_TIMEOUT"
        ? "Internet yoki server bilan ulanish vaqti tugadi"
        : "Doska topilmadi yoki ochib bo'lmadi";

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <PenLine size={48} className="text-gray-300" />
        <p className="text-gray-600 text-center font-medium">
          {errorText}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Qayta urinish
          </button>
          <button
            type="button"
            onClick={() => navigate("/boards")}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Doskalar ro'yxatiga qaytish
          </button>
        </div>
      </div>
    );
  }

  if (!state.joined) return <RouteLoadingScreen />;

  return (
    <div
      ref={pageRef}
      className="relative h-dvh bg-[var(--app-bg)] text-[var(--text-primary)] flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      {!fullscreen.isFullscreen && (
        <div className="glass flex items-center gap-2 px-3 py-2 shrink-0 z-10 border-b border-black/5 dark:border-white/10">
          <button
            type="button"
            onClick={() => {
              if (fullscreen.isFullscreen) {
                void fullscreen.toggle();
              }
              navigate("/boards");
            }}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Doskalar</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 shrink-0" />

          {/* Inline title edit */}
          {!isViewOnly && editingTitle ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleTitleSave();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                autoFocus
                className="flex-1 min-w-0 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-gray-900 dark:text-zinc-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleTitleSave()}
                disabled={savingTitle}
                className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!isViewOnly) {
                  setTitleDraft(boardTitle);
                  setEditingTitle(true);
                }
              }}
              className={`flex-1 min-w-0 text-left px-2 py-1 rounded-lg text-xs font-bold text-[var(--text-primary)] truncate ${isViewOnly ? "cursor-default" : "hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"}`}
              title={isViewOnly ? "Faqat ko'rish" : "Nomni tahrirlash"}
            >
              {boardTitle}
            </button>
          )}

          {isViewOnly && (
            <span className="shrink-0 rounded-full bg-black/5 dark:bg-white/10 px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">
              Faqat ko'rish
            </span>
          )}

          <div className="flex-1" />

          {!isViewOnly && (
            <button
              type="button"
              onClick={() =>
                hostActions.setTheme(state.classroomTheme === "dark" ? "light" : "dark")
              }
              className="glass flex items-center justify-center rounded-xl p-2 text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
              title={state.classroomTheme === "dark" ? "Yorug'lik rejimi" : "Tungi rejim"}
            >
              {state.classroomTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setDownloadModalOpen(true)}
            className="glass flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
            title="PDF yoki Daftar yuklab olish"
          >
            <Download size={14} className="text-indigo-600 dark:text-indigo-400" />
            <span className="hidden sm:inline">Yuklab olish</span>
          </button>
        </div>
      )}

      {/* Board Area */}
      <div className="relative flex-1 min-h-0 px-2 pb-2 pt-2 flex flex-col">
        <ClassroomPdfViewer
          pageUrls={state.pages}
          currentPage={state.currentPage}
          strokesByPage={state.strokesByPage}
          rightStrokesByPage={state.rightStrokesByPage}
          strokesByMode={state.strokesByMode}
          pointer={state.pointer}
          editable={!isViewOnly && (state.pages.length > 0 || state.boardMode === "notebook")}
          isHost={!isViewOnly}
          noSync={isViewOnly}
          hostZoom={state.zoom}
          rightHostZoom={state.rightZoom}
          hostSplitRatio={state.splitRatio}
          notebookPageCount={state.notebookPageCount}
          notebookPageStyles={state.notebookPageStyles}
          notebookPageOrientations={state.notebookPageOrientations}
          focusedStrokeId={focusedStrokeId}
          onInsertPdfPage={handleInsertPdfPage}
          onInsertNotebookPage={(afterPageIndex, style, orientation, pane) =>
            hostActions.insertNotebookPage(afterPageIndex, style, orientation, pane)
          }
          onSetNotebookPageStyle={(page, style, pane) =>
            hostActions.setNotebookPageStyle(page, style, pane)
          }
          onPastePage={(mode, afterPageIndex, pageUrl, style, orientation, strokes, pane) =>
            hostActions.pastePage(mode, afterPageIndex, pageUrl, style, orientation, strokes, pane)
          }
          onRemovePage={(mode, pageIndex, pane) => hostActions.removePage(mode, pageIndex, pane)}
          onClearPage={(page, pane, mode) =>
            hostActions.clearPage(
              page,
              pane ?? "left",
              mode ?? (pane === "right" ? state.rightBoardMode : state.leftBoardMode),
            )
          }
          onSetSplitRatio={hostActions.setSplitRatio}
          onZoomChange={(zoom) => hostActions.setZoom(zoom)}
          hostScroll={state.scroll}
          onScrollChange={(page, yRatio, xRatio) => hostActions.setScroll(page, yRatio, "left", xRatio)}
          onPaneScrollChange={(pane, page, yRatio, xRatio) => hostActions.setScroll(page, yRatio, pane, xRatio)}
          onPaneZoomChange={(pane, zoom) => hostActions.setZoom(zoom, pane)}
          tool={tool}
          onToolChange={handleToolChange}
          color={color}
          colorNonce={colorNonce}
          onColorChange={handleColorChange}
          strokeWidth={tool === "highlighter" ? strokeWidth * 7 : strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
          shapeStyle={shapeStyle}
          onShapeStyleChange={setShapeStyle}
          onUpdateShapeStroke={(page, stroke, groupId) =>
            hostActions.updateShapeStroke(page, stroke, "left", state.boardMode, groupId)
          }
          onPaneUpdateShapeStroke={(pane, mode, page, stroke, groupId) =>
            hostActions.updateShapeStroke(page, stroke, pane, mode, groupId)
          }
          onReorderStroke={(page, strokeIds, op) =>
            hostActions.reorderStroke(page, strokeIds, op, "left", state.boardMode)
          }
          onPaneReorderStroke={(pane, mode, page, strokeIds, op) =>
            hostActions.reorderStroke(page, strokeIds, op, pane, mode)
          }
          onStrokeComplete={(page, s, groupId) => hostActions.sendStroke(page, s, "left", state.boardMode, groupId)}
          onPaneStrokeComplete={(pane, mode, page, s, groupId) => hostActions.sendStroke(page, s, pane, mode, groupId)}
          onMoveStroke={(page, strokeId, x, y, groupId) =>
            hostActions.moveStroke(page, strokeId, x, y, "left", state.boardMode, groupId)
          }
          onPaneMoveStroke={(pane, mode, page, strokeId, x, y, groupId) =>
            hostActions.moveStroke(page, strokeId, x, y, pane, mode, groupId)
          }
          onUpdateTextStroke={(page, stroke, groupId) =>
            hostActions.updateTextStroke(page, stroke, "left", state.boardMode, groupId)
          }
          onPaneUpdateTextStroke={(pane, mode, page, stroke, groupId) =>
            hostActions.updateTextStroke(page, stroke, pane, mode, groupId)
          }
          onPointerMove={(page, x, y, active, pane) =>
            hostActions.pointer(page, x, y, active, pane)
          }
          onEraseStroke={(page, strokeId, groupId) =>
            hostActions.eraseStroke(page, strokeId, "left", state.boardMode, groupId)
          }
          onPaneEraseStroke={(pane, mode, page, strokeId, groupId) =>
            hostActions.eraseStroke(page, strokeId, pane, mode, groupId)
          }
          onSplitStroke={(page, strokeId, replacements, groupId) =>
            hostActions.splitStroke(page, strokeId, replacements, "left", state.boardMode, groupId)
          }
          onPaneSplitStroke={(pane, mode, page, strokeId, replacements, groupId) =>
            hostActions.splitStroke(page, strokeId, replacements, pane, mode, groupId)
          }
          boardMode={state.boardMode}
          onBoardModeChange={hostActions.setBoardMode}
          boardLayout={state.boardLayout}
          leftBoardMode={state.leftBoardMode}
          rightBoardMode={state.rightBoardMode}
          onBoardViewChange={(layout, left, right) => hostActions.setBoardView(layout, left, right)}
          onPageChange={(page) => hostActions.setPage(page)}
          onActivePaneChange={setActivePane}
          toolbar={!isViewOnly ? (
            <ClassroomToolbar
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              onToolChange={setTool}
              onColorChange={handleColorChange}
              onStrokeWidthChange={setStrokeWidth}
              onUndo={() => hostActions.undo()}
              onRedo={() => hostActions.redo()}
              canUndo={canUndo}
              canRedo={canRedo}
              onClear={() => hostActions.clearBoard()}
              onOpenPdfLibrary={() => setPdfLibraryOpen(true)}
              onToggleHistory={() => setShowHistoryModal((prev) => !prev)}
              historyOpen={showHistoryModal}
            />
          ) : undefined}
          toolbarActions={
            fullscreen.supported ? (
              <button
                type="button"
                onClick={() => void fullscreen.toggle()}
                title={fullscreen.isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
                className="glass flex items-center justify-center rounded-full px-2.5 py-1.5 text-[var(--text-primary)] shadow-md transition-all active:scale-95 hover:bg-black/10 dark:hover:bg-white/15 cursor-pointer"
              >
                {fullscreen.isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            ) : undefined
          }
        />
      </div>

      {/* PDF Library Modal */}
      {pdfLibraryOpen && (
        <ClassroomPdfLibraryModal
          onSelect={(asset) => {
            setPdfLibraryOpen(false);
            setPageSelectAsset(asset);
          }}
          onClose={() => {
            setPdfLibraryOpen(false);
            setInsertAfterPageIndex(null);
          }}
        />
      )}
      {pageSelectAsset && (
        <PdfPageSelectModal
          asset={pageSelectAsset}
          submitting={attaching}
          onConfirm={handleAttachPages}
          onBack={() => setPageSelectAsset(null)}
          onClose={() => {
            setPageSelectAsset(null);
            setInsertAfterPageIndex(null);
          }}
        />
      )}

      {/* Whiteboard History Modal (Activity & Versions) */}
      {showHistoryModal && id && (
        <WhiteboardHistoryModal
          boardId={id}
          onClose={() => setShowHistoryModal(false)}
          onSelectActivity={handleSelectActivity}
        />
      )}
      {/* Download Board Modal */}
      {downloadModalOpen && (
        <DownloadBoardModal
          submitting={downloading}
          onSelect={handleDownloadBoard}
          onClose={() => setDownloadModalOpen(false)}
        />
      )}
    </div>
  );
}
