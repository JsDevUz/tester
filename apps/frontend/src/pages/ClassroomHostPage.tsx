import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, Download, Link2, Maximize2, Minimize2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { useClassroomTheme } from "../hooks/useClassroomTheme";
import { useFullscreen } from "../hooks/useFullscreen";
import {
  ClassroomPdfViewer,
  DEFAULT_SHAPE_STYLE,
  type DrawTool,
  type ShapeStyle,
} from "../components/classroom/ClassroomPdfViewer";
import { ClassroomToolbar } from "../components/classroom/ClassroomToolbar";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { ClassroomThemeToggle } from "../components/classroom/ClassroomThemeToggle";
import { ClassroomCallBar } from "../components/classroom/ClassroomCallBar";
import { ClassroomCallBarMenu } from "../components/classroom/ClassroomCallBarMenu";
import { ClassroomPdfLibraryModal } from "../components/classroom/ClassroomPdfLibraryModal";
import { PdfPageSelectModal } from "../components/classroom/PdfPageSelectModal";
import { DownloadBoardModal } from "../components/classroom/DownloadBoardModal";
import { RecordSessionModal } from "../components/classroom/RecordSessionModal";
import { exportBoardToPdf } from "../components/classroom/classroomExport";
import {
  apiAttachClassPdf,
  apiInsertClassPdfPages,
  apiMuteParticipant,
  apiStartClassRecording,
  type ClassRecordingMode,
  type PdfLibraryAsset,
} from "../api/classroom";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const ERROR_TEXT: Record<string, string> = {
  SESSION_NOT_FOUND: "Jonli dars topilmadi yoki allaqachon tugagan",
  FORBIDDEN: "Bu darsni boshqarish huquqingiz yo'q",
  UNAUTHORIZED: "Avtorizatsiya xatosi — qayta kiring",
};

export function ClassroomHostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const admin = useAuthStore((s) => s.admin);
  const { state, hostActions } = useClassroomSession(id, "host");
  useClassroomTheme(state.classroomTheme);
  const voice = useClassroomVoice(state.joined ? id : undefined, true);
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(pageRef);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE_STYLE);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pdfLibraryOpen, setPdfLibraryOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordingMode, setRecordingMode] = useState<ClassRecordingMode | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (recordingStartedAt === null) return;
    const tick = () => setElapsedMs(Date.now() - recordingStartedAt);
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [recordingStartedAt]);
  // Split rejimda foydalanuvchi oxirgi marta qaysi panelda (chap/o'ng)
  // faol bo'lganini kuzatadi — Undo/Clear tugmalari shu panelga
  // qo'llanishi kerak, aks holda "sahifani tozalash" har doim chap
  // (birinchi) panelga tegib, o'ng panelni tozalab bo'lmasdi.
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [pageSelectAsset, setPageSelectAsset] =
    useState<PdfLibraryAsset | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [insertAfterPageIndex, setInsertAfterPageIndex] = useState<number | null>(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Classroom toolbar shortcuts. `mod` maps to Ctrl on Windows/Linux and
  // Command on macOS. Form fields are intentionally excluded by the hook.
  useHotkeys("1", () => setTool("select"), { preventDefault: true });
  useHotkeys("2", () => setTool("pen"), { preventDefault: true });
  useHotkeys("3", () => setTool("text"), { preventDefault: true });
  useHotkeys("4", () => setTool("highlighter"), { preventDefault: true });
  useHotkeys("5", () => setTool("arrow"), { preventDefault: true });
  useHotkeys("6", () => setTool("rectangle"), { preventDefault: true });
  useHotkeys("7", () => setTool("ellipse"), { preventDefault: true });
  useHotkeys("8", () => setTool("eraser-pixel"), { preventDefault: true });
  useHotkeys("9", () => setTool("eraser-stroke"), { preventDefault: true });
  useHotkeys("0", () => setTool("lasso"), { preventDefault: true });
  useHotkeys("s", () => setStrokeWidth(2), { preventDefault: true });
  useHotkeys("m", () => setStrokeWidth(4), { preventDefault: true });
  useHotkeys("l", () => setStrokeWidth(7), { preventDefault: true });
  useHotkeys("mod+z", () => hostActions.undo(), {
    preventDefault: true,
  });
  useHotkeys("mod+shift+z", () => hostActions.redo(), {
    preventDefault: true,
  });

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

  // "+" tugmasi bosilganda: kutubxona tanlash oqimini INSERT rejimida ochadi
  // (attachPdfFromLibrary'dagi "butun sessiyani almashtirish" rejimidan farqli).
  const handleInsertPdfPage = (afterPageIndex: number) => {
    setInsertAfterPageIndex(afterPageIndex);
    setPdfLibraryOpen(true);
  };

  const handleMute = async (userId: string) => {
    if (!id) return;
    try {
      await apiMuteParticipant(id, userId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Mute qilib bo'lmadi");
    }
  };

  const handleEnd = () => {
    // Dars fullscreen rejimida yakunlansa, brauzer avtomatik chiqmaydi —
    // foydalanuvchi navigatsiyadan keyin ham fullscreen holatida qolib
    // ketmasin deb aniq chiqariladi.
    if (fullscreen.isFullscreen) void fullscreen.toggle();
    hostActions.endLesson();
    navigate(-1);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/classroom/free/${id}`;
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Havola nusxalandi"),
      () => toast.error("Havolani nusxalab bo'lmadi"),
    );
  };

  const handleStartRecording = async (mode: ClassRecordingMode) => {
    if (!id) return;
    try {
      await apiStartClassRecording(id, mode);
      setRecordingMode(mode);
      setRecordingStartedAt(Date.now());
      setRecordModalOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Yozib olishni boshlab bo'lmadi");
    }
  };

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
        theme: state.classroomTheme,
        pageUrls,
        strokesByPage: strokesByPage ?? {},
        pageCount,
        fileName: `${mode === "notebook" ? "daftar" : "pdf"}-${Date.now()}.pdf`,
      });
      setDownloadModalOpen(false);
    } catch {
      toast.error("Yuklab bo'lmadi, qayta urinib ko'ring");
    } finally {
      setDownloading(false);
    }
  };

  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-gray-600">
          {ERROR_TEXT[state.error] ?? "Xatolik yuz berdi"}
        </p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
        >
          Orqaga
        </button>
      </div>
    );
  }

  return (
    <div ref={pageRef} className="relative h-dvh bg-gray-50 flex flex-col overflow-hidden">
      {voice.needsAudioUnlock && (
        <button
          type="button"
          onClick={voice.unlockAudio}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-sm px-4 py-2 rounded-full shadow-md flex items-center gap-2 font-medium hover:bg-indigo-700"
        >
          <Volume2 size={16} />
          Ovozni yoqish uchun bosing
        </button>
      )}

      <div className="relative flex-1 min-h-0 flex flex-col p-2 sm:p-1">
        <ClassroomPdfViewer
          pageUrls={state.pages}
          currentPage={state.currentPage}
          strokesByPage={state.strokesByPage}
          rightStrokesByPage={state.rightStrokesByPage}
          pointer={state.pointer}
          editable={state.pages.length > 0 || state.boardMode === "notebook"}
          isHost
          hostZoom={state.zoom}
          rightHostZoom={state.rightZoom}
          hostSplitRatio={state.splitRatio}
          notebookPageCount={state.notebookPageCount}
          notebookPageStyles={state.notebookPageStyles}
          onInsertPdfPage={(afterPageIndex) => handleInsertPdfPage(afterPageIndex)}
          onInsertNotebookPage={(afterPageIndex, style, pane) => hostActions.insertNotebookPage(afterPageIndex, style, pane)}
          onSetNotebookPageStyle={(page, style, pane) => hostActions.setNotebookPageStyle(page, style, pane)}
          onRemovePage={(mode, pageIndex, pane) => hostActions.removePage(mode, pageIndex, pane)}
          onSetSplitRatio={hostActions.setSplitRatio}
          onZoomChange={(zoom) => hostActions.setZoom(zoom)}
          hostScroll={state.scroll}
          onScrollChange={(page, yRatio, xRatio) => hostActions.setScroll(page, yRatio, "left", xRatio)}
          onPaneScrollChange={(pane, page, yRatio, xRatio) => hostActions.setScroll(page, yRatio, pane, xRatio)}
          onPaneZoomChange={(pane, zoom) => hostActions.setZoom(zoom, pane)}
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          strokeWidth={tool === "highlighter" ? strokeWidth * 7 : strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
          shapeStyle={shapeStyle}
          onShapeStyleChange={setShapeStyle}
          onUpdateShapeStroke={(page, stroke) => hostActions.updateShapeStroke(page, stroke, "left", state.boardMode)}
          onPaneUpdateShapeStroke={(pane, mode, page, stroke) => hostActions.updateShapeStroke(page, stroke, pane, mode)}
          onReorderStroke={(page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, "left", state.boardMode)}
          onPaneReorderStroke={(pane, mode, page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, pane, mode)}
          onStrokeComplete={(page, s) => hostActions.sendStroke(page, s)}
          onPaneStrokeComplete={(pane, mode, page, s) => hostActions.sendStroke(page, s, pane, mode)}
          onMoveStroke={(page, strokeId, x, y) => hostActions.moveStroke(page, strokeId, x, y, "left", state.boardMode)}
          onPaneMoveStroke={(pane, mode, page, strokeId, x, y) => hostActions.moveStroke(page, strokeId, x, y, pane, mode)}
          onUpdateTextStroke={(page, stroke) => hostActions.updateTextStroke(page, stroke, "left", state.boardMode)}
          onPaneUpdateTextStroke={(pane, mode, page, stroke) => hostActions.updateTextStroke(page, stroke, pane, mode)}
          onPointerMove={(page, x, y, active, pane) =>
            hostActions.pointer(page, x, y, active, pane)
          }
          onEraseStroke={(page, strokeId) =>
            hostActions.eraseStroke(page, strokeId, "left", state.boardMode)
          }
          onPaneEraseStroke={(pane, mode, page, strokeId) => hostActions.eraseStroke(page, strokeId, pane, mode)}
          onSplitStroke={(page, strokeId, replacements) =>
            hostActions.splitStroke(page, strokeId, replacements, "left", state.boardMode)
          }
          onPaneSplitStroke={(pane, mode, page, strokeId, replacements) => hostActions.splitStroke(page, strokeId, replacements, pane, mode)}
          boardMode={state.boardMode}
          onBoardModeChange={(mode) => hostActions.setBoardMode(mode)}
          boardLayout={state.boardLayout}
          leftBoardMode={state.leftBoardMode}
          rightBoardMode={state.rightBoardMode}
          onBoardViewChange={(layout, left, right) => hostActions.setBoardView(layout, left, right)}
          onPageChange={(page) => hostActions.setPage(page)}
          onActivePaneChange={setActivePane}
          toolbar={
            <ClassroomToolbar
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              onToolChange={setTool}
              onColorChange={setColor}
              onStrokeWidthChange={setStrokeWidth}
              onUndo={() => hostActions.undo()}
              onRedo={() => hostActions.redo()}
              onClear={() => hostActions.clearPage(state.currentPage, activePane, activePane === "right" ? state.rightBoardMode : state.leftBoardMode)}
              onOpenPdfLibrary={() => setPdfLibraryOpen(true)}
            />
          }
          toolbarActions={
            <div className="flex items-center gap-1.5">
              {recordingMode && (
                <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md">
                  <Circle size={8} className="animate-pulse fill-white" />
                  <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
                </div>
              )}
              {fullscreen.supported && (
                <button
                  type="button"
                  onClick={() => void fullscreen.toggle()}
                  title={fullscreen.isFullscreen ? "To'liq ekrandan chiqish" : "To'liq ekran"}
                  className="flex items-center justify-center rounded-full border border-gray-100 bg-white px-2 py-1.5 text-gray-500 shadow-md transition-colors hover:bg-gray-100"
                >
                  {fullscreen.isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              )}
              <ClassroomThemeToggle
                theme={state.classroomTheme}
                onToggle={() => hostActions.setTheme(state.classroomTheme === "dark" ? "light" : "dark")}
              />
              <ParticipantsPanelToggle
                participants={state.participants}
                speakingUserIds={voice.speakingUserIds}
                isHost
                myUserId={admin?.id ?? null}
                onMute={(uid) => void handleMute(uid)}
                compact
              />
            </div>
          }
        />

        <ClassroomCallBar
          micEnabled={voice.micEnabled}
          onToggleMic={() => void voice.toggleMic()}
          audioInputs={voice.audioInputs}
          activeAudioInputId={voice.activeAudioInputId}
          onSwitchAudioInput={(deviceId) =>
            void voice.switchAudioInput(deviceId)
          }
          micDisabled={!voice.voiceAvailable}
          onEndCall={() => setConfirmEnd(true)}
          endCallTitle="Darsni yakunlash"
          menu={
            <ClassroomCallBarMenu
              items={[
                ...(!recordingMode ? [{
                  key: "record",
                  label: "Yozib olish",
                  icon: <Circle size={16} className="fill-red-500 text-red-500" />,
                  onSelect: () => setRecordModalOpen(true),
                }] : []),
                ...(state.isFree ? [{
                  key: "link",
                  label: "Havola",
                  icon: <Link2 size={16} />,
                  onSelect: handleCopyLink,
                }] : []),
                {
                  key: "download",
                  label: "Yuklab olish",
                  icon: <Download size={16} />,
                  onSelect: () => setDownloadModalOpen(true),
                },
              ]}
            />
          }
        />
      </div>

      {recordModalOpen && (
        <RecordSessionModal
          onSelect={(mode) => void handleStartRecording(mode)}
          onClose={() => setRecordModalOpen(false)}
        />
      )}

      {downloadModalOpen && (
        <DownloadBoardModal
          submitting={downloading}
          onSelect={(mode) => void handleDownloadBoard(mode)}
          onClose={() => setDownloadModalOpen(false)}
        />
      )}

      {pdfLibraryOpen && (
        <ClassroomPdfLibraryModal
          onClose={() => { setPdfLibraryOpen(false); setInsertAfterPageIndex(null); }}
          onSelect={(asset) => {
            setPdfLibraryOpen(false);
            setPageSelectAsset(asset);
          }}
        />
      )}

      {pageSelectAsset && (
        <PdfPageSelectModal
          asset={pageSelectAsset}
          submitting={attaching}
          onConfirm={(pageNumbers) => void handleAttachPages(pageNumbers)}
          onBack={() => {
            setPageSelectAsset(null);
            setPdfLibraryOpen(true);
          }}
          onClose={() => { setPageSelectAsset(null); setInsertAfterPageIndex(null); }}
        />
      )}

      {confirmEnd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">
              Darsni yakunlaysizmi?
            </h2>
            <p className="text-sm text-gray-500">
              {state.isFree
                ? "Barcha ishtirokchilar darsdan chiqariladi."
                : "Barcha o'quvchilar darsdan chiqariladi va davomat yakunlanadi."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleEnd}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              >
                Yakunlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
