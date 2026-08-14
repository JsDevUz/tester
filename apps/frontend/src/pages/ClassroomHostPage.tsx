import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, Download, Link2, Maximize2, Minimize2, Volume2, Presentation, Sun, Moon, FolderOpen, Plus, X } from "lucide-react";
import { ClassroomParticipantsGrid } from "../components/classroom/ClassroomParticipantsGrid";
import { ClassroomTopParticipantBar } from "../components/classroom/ClassroomTopParticipantBar";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
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
import { StickerReactionsOverlay } from "../components/classroom/StickerReactionsOverlay";
import { RaisedHandsControl } from "../components/classroom/RaisedHandsControl";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { ClassroomCallBar } from "../components/classroom/ClassroomCallBar";
import { ClassroomCallBarMenu } from "../components/classroom/ClassroomCallBarMenu";
import { ClassroomPdfLibraryModal } from "../components/classroom/ClassroomPdfLibraryModal";
import { PdfPageSelectModal } from "../components/classroom/PdfPageSelectModal";
import { WhiteboardHistoryModal } from "../components/classroom/WhiteboardHistoryModal";
import { DownloadBoardModal } from "../components/classroom/DownloadBoardModal";
import { RecordSessionModal } from "../components/classroom/RecordSessionModal";
import { BoardAttachModal } from "../components/classroom/BoardAttachModal";
import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { type BoardActivityItem } from "../api/boards";
import { exportBoardToPdf } from "../components/classroom/classroomExport";
import {
  apiAttachBoardToClassroom,
  apiAttachClassPdf,
  apiClassSession,
  apiEndClassSession,
  apiInsertClassPdfPages,
  apiMuteParticipant,
  apiStartClassRecording,
  type ClassRecordingMode,
  type PdfLibraryAsset,
} from "../api/classroom";
import { apiCreateBoard } from "../api/boards";

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
  CONNECTION_TIMEOUT: "Server bilan ulanish vaqti tugadi — sahifani yangilang",
};

export function ClassroomHostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const admin = useAuthStore((s) => s.admin);
  const { state, hostActions, canUndo, canRedo, sendReaction, toggleHandRaise, lowerAllHands, lowerUserHand } = useClassroomSession(id, "host");
  const isHandRaised = (state.raisedHands ?? []).some((h) => h.userId === (admin?.id ?? "host"));
  useClassroomTheme(state.classroomTheme);
  const voice = useClassroomVoice(state.joined ? id : undefined, true);
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(pageRef);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [colorNonce, setColorNonce] = useState(0);

  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
    setColorNonce(Date.now());
  }, []);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>(DEFAULT_SHAPE_STYLE);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pdfLibraryOpen, setPdfLibraryOpen] = useState(false);
  const [boardAttachOpen, setBoardAttachOpen] = useState(false);
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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [focusedStrokeId, setFocusedStrokeId] = useState<string | null>(null);

  const handleSelectActivity = (item: BoardActivityItem) => {
    if (item.page && item.page !== state.currentPage) {
      hostActions.setPage(item.page);
    }
    if (item.strokeId) {
      setFocusedStrokeId(item.strokeId);
      setTimeout(() => setFocusedStrokeId(null), 3500);
    }
  };
  const [lessonTitle, setLessonTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClassSession(id)
      .then((detail) => {
        if (detail.title) setLessonTitle(detail.title);
      })
      .catch(() => {});
  }, [id]);

  // Classroom toolbar shortcuts. `mod` maps to Ctrl on Windows/Linux and
  // Command on macOS. Form fields are intentionally excluded by the hook.
  useHotkeys("1", () => handleToolChange("select"), { preventDefault: true });
  useHotkeys("2", () => handleToolChange("pen"), { preventDefault: true });
  useHotkeys("3", () => handleToolChange("text"), { preventDefault: true });
  useHotkeys("4", () => handleToolChange("highlighter"), { preventDefault: true });
  useHotkeys("z", () => handleToolChange("laser"), { preventDefault: true });
  useHotkeys("5", () => handleToolChange("arrow"), { preventDefault: true });
  useHotkeys("-", () => handleToolChange("line"), { preventDefault: true });
  useHotkeys("6", () => handleToolChange("rectangle"), { preventDefault: true });
  useHotkeys("7", () => handleToolChange("ellipse"), { preventDefault: true });
  useHotkeys("8", () => handleToolChange("eraser-pixel"), { preventDefault: true });
  useHotkeys("9", () => handleToolChange("eraser-stroke"), { preventDefault: true });
  useHotkeys("0", () => handleToolChange("lasso"), { preventDefault: true });
  useHotkeys("s", () => setStrokeWidth(2), { preventDefault: true });
  useHotkeys("m", () => setStrokeWidth(4), { preventDefault: true });
  useHotkeys("l", () => setStrokeWidth(7), { preventDefault: true });
  useHotkeys("mod+z", () => {
    if (canUndo) hostActions.undo();
  }, { preventDefault: true }, [canUndo]);
  useHotkeys("mod+shift+z", () => {
    if (canRedo) hostActions.redo();
  }, { preventDefault: true }, [canRedo]);
  useHotkeys("mod+y", () => {
    if (canRedo) hostActions.redo();
  }, { preventDefault: true }, [canRedo]);

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

  const handleAttachBoard = async (boardId: string) => {
    if (!id) return;
    try {
      await apiAttachBoardToClassroom(id, boardId);
      hostActions.setBoardOpen(true);
      toast.success("Doska biriktirildi");
      setBoardAttachOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Doskani biriktirib bo'lmadi");
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

  const [endingLesson, setEndingLesson] = useState(false);

  const handleEnd = async () => {
    if (fullscreen.isFullscreen) void fullscreen.toggle();
    if (!id || endingLesson) return;
    setEndingLesson(true);
    try {
      hostActions.endLesson();
      await apiEndClassSession(id);
      toast.success("Dars muvaffaqiyatli yakunlandi");
    } catch (e: any) {
      console.error("Failed to end class session via API:", e);
    } finally {
      setEndingLesson(false);
      setConfirmEnd(false);
      navigate(-1);
    }
  };

  const handleCopyLink = () => {
    const url = state.isFree
      ? `${window.location.origin}/classroom/free/${id}`
      : `${window.location.origin}/classroom/${id}`;
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

  if (!state.joined) return <RouteLoadingScreen />;

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

      {!state.isBoardOpen ? (
        <ClassroomParticipantsGrid
          participants={state.participants}
          speakingUserIds={voice.speakingUserIds}
          unmutedUserIds={voice.unmutedUserIds}
          myUserId={admin?.id ?? null}
          myUserName={admin?.name || "Ustoz"}
          theme={state.classroomTheme}
          isHost={true}
          hostOnline={true}
          hostName={admin?.name || "Ustoz"}
        />
      ) : (
        <div className="relative flex-1 min-h-0 flex flex-col">
          {!fullscreen.isFullscreen && (
            <ClassroomTopParticipantBar
              participants={state.participants}
              speakingUserIds={voice.speakingUserIds}
              unmutedUserIds={voice.unmutedUserIds}
              myUserId={admin?.id ?? null}
              myUserName={admin?.name || "Ustoz"}
              theme={state.classroomTheme}
              isHost={true}
              hostOnline={true}
              hostName={admin?.name || "Ustoz"}
            />
          )}

          <div className="relative flex-1 min-h-0 px-2 pb-2 pt-2 sm:px-2 sm:pb-2 flex flex-col">
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
              notebookPageOrientations={state.notebookPageOrientations}
              onInsertPdfPage={(afterPageIndex) => handleInsertPdfPage(afterPageIndex)}
              onInsertNotebookPage={(afterPageIndex, style, orientation, pane) => hostActions.insertNotebookPage(afterPageIndex, style, orientation, pane)}
              onSetNotebookPageStyle={(page, style, pane) => hostActions.setNotebookPageStyle(page, style, pane)}
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
              onUpdateShapeStroke={(page, stroke, groupId) => hostActions.updateShapeStroke(page, stroke, "left", state.boardMode, groupId)}
              onPaneUpdateShapeStroke={(pane, mode, page, stroke, groupId) => hostActions.updateShapeStroke(page, stroke, pane, mode, groupId)}
              onReorderStroke={(page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, "left", state.boardMode)}
              onPaneReorderStroke={(pane, mode, page, strokeIds, op) => hostActions.reorderStroke(page, strokeIds, op, pane, mode)}
              onStrokeComplete={(page, s, groupId) => hostActions.sendStroke(page, s, "left", state.boardMode, groupId)}
              onPaneStrokeComplete={(pane, mode, page, s, groupId) => hostActions.sendStroke(page, s, pane, mode, groupId)}
              onMoveStroke={(page, strokeId, x, y, groupId) => hostActions.moveStroke(page, strokeId, x, y, "left", state.boardMode, groupId)}
              onPaneMoveStroke={(pane, mode, page, strokeId, x, y, groupId) => hostActions.moveStroke(page, strokeId, x, y, pane, mode, groupId)}
              onUpdateTextStroke={(page, stroke, groupId) => hostActions.updateTextStroke(page, stroke, "left", state.boardMode, groupId)}
              onPaneUpdateTextStroke={(pane, mode, page, stroke, groupId) => hostActions.updateTextStroke(page, stroke, pane, mode, groupId)}
              onPointerMove={(page, x, y, active, pane) =>
                hostActions.pointer(page, x, y, active, pane)
              }
              onEraseStroke={(page, strokeId, groupId) =>
                hostActions.eraseStroke(page, strokeId, "left", state.boardMode, groupId)
              }
              onPaneEraseStroke={(pane, mode, page, strokeId, groupId) => hostActions.eraseStroke(page, strokeId, pane, mode, groupId)}
              onSplitStroke={(page, strokeId, replacements, groupId) =>
                hostActions.splitStroke(page, strokeId, replacements, "left", state.boardMode, groupId)
              }
              onPaneSplitStroke={(pane, mode, page, strokeId, replacements, groupId) => hostActions.splitStroke(page, strokeId, replacements, pane, mode, groupId)}
              boardMode={state.boardMode}
              onBoardModeChange={(mode) => hostActions.setBoardMode(mode)}
              boardLayout={state.boardLayout}
              leftBoardMode={state.leftBoardMode}
              rightBoardMode={state.rightBoardMode}
              onBoardViewChange={(layout, left, right) => hostActions.setBoardView(layout, left, right)}
              onPageChange={(page) => hostActions.setPage(page)}
              onActivePaneChange={setActivePane}
              focusedStrokeId={focusedStrokeId}
              toolbar={
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
              }
              toolbarActions={
                <div className="flex items-center gap-1.5">
                  {recordingMode && (
                    <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md">
                      <Circle size={8} className="animate-pulse fill-white" />
                      <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>
                    </div>
                  )}
                  {fullscreen.isFullscreen ? (
                    <>
                      <RaisedHandsControl
                        raisedHands={state.raisedHands ?? []}
                        onLowerAll={lowerAllHands}
                        onLowerUser={lowerUserHand}
                        theme={state.classroomTheme}
                      />
                      <ParticipantsPanelToggle
                        participants={state.participants}
                        speakingUserIds={voice.speakingUserIds}
                        unmutedUserIds={voice.unmutedUserIds}
                        isHost
                        myUserId={admin?.id ?? null}
                        onMute={(uid) => void handleMute(uid)}
                        userReactions={state.userReactions}
                        compact
                        theme={state.classroomTheme}
                        hostOnline={true}
                        hostName={admin?.name || "Ustoz"}
                      />
                    </>
                  ) : (
                    <>
                      {(state.raisedHands?.length ?? 0) > 0 && (
                        <RaisedHandsControl
                          raisedHands={state.raisedHands ?? []}
                          onLowerAll={lowerAllHands}
                          onLowerUser={lowerUserHand}
                          theme={state.classroomTheme}
                        />
                      )}
                      <ParticipantsPanelToggle
                        participants={state.participants}
                        speakingUserIds={voice.speakingUserIds}
                        unmutedUserIds={voice.unmutedUserIds}
                        isHost
                        myUserId={admin?.id ?? null}
                        onMute={(uid) => void handleMute(uid)}
                        userReactions={state.userReactions}
                        compact
                        theme={state.classroomTheme}
                        hostOnline={true}
                        hostName={admin?.name || "Ustoz"}
                      />
                    </>
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
                  <button
                    type="button"
                    onClick={() => {
                      if (fullscreen.isFullscreen) {
                        void fullscreen.toggle();
                      }
                      hostActions.setBoardOpen(false);
                    }}
                    title="Doskani yopish"
                    className="flex items-center justify-center rounded-full border border-gray-100 bg-white p-1.5 text-gray-500 shadow-md transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Floating Top Right Actions */}
      {!fullscreen.isFullscreen && (
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-1.5 pointer-events-auto">
          <RaisedHandsControl
            raisedHands={state.raisedHands ?? []}
            onLowerAll={lowerAllHands}
            onLowerUser={lowerUserHand}
            theme={state.classroomTheme}
          />
          <ParticipantsPanelToggle
            participants={state.participants}
            speakingUserIds={voice.speakingUserIds}
            unmutedUserIds={voice.unmutedUserIds}
            isHost
            myUserId={admin?.id ?? null}
            onMute={(uid) => void handleMute(uid)}
            userReactions={state.userReactions}
            compact
            theme={state.classroomTheme}
            hostOnline={true}
            hostName={admin?.name || "Ustoz"}
            hidden={true}
          />
        </div>
      )}

      <StickerReactionsOverlay reactions={state.reactions ?? []} />

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
        hidden={fullscreen.isFullscreen}
        theme={state.classroomTheme}
        onSendReaction={sendReaction}
        handRaised={isHandRaised}
        onToggleHandRaise={toggleHandRaise}
        menu={
          <ClassroomCallBarMenu
            theme={state.classroomTheme}
            items={[
              ...(!recordingMode && state.isBoardOpen ? [{
                key: "record",
                label: "Yozib olish",
                icon: <Circle size={16} className="fill-red-500 text-red-500" />,
                onSelect: () => setRecordModalOpen(true),
              }] : []),
              {
                key: "add_board",
                label: "Doska qo'shish",
                icon: <Presentation size={16} />,
                subMenu: [
                  {
                    key: "existing_board",
                    label: "Mavjud doskalar",
                    icon: <FolderOpen size={16} />,
                    onSelect: () => {
                      setBoardAttachOpen(true);
                    },
                  },
                  {
                    key: "new_board",
                    label: "Yangi doska",
                    icon: <Plus size={16} />,
                    onSelect: () => {
                      const boardTitle = lessonTitle ?? state.pdfName ?? "Dars doskasi";
                      void (async () => {
                        try {
                          const { id: newBoardId } = await apiCreateBoard(boardTitle);
                          await handleAttachBoard(newBoardId);
                          hostActions.setBoardOpen(true);
                          toast.success(`Yangi doska yaratildi: "${boardTitle}"`);
                        } catch {
                          toast.error("Yangi doskani yaratib bo'lmadi");
                        }
                      })();
                    },
                  },
                ],
              },
              {
                key: "toggle_theme",
                label: state.classroomTheme === "dark" ? "Yorug'lik rejimi" : "Tungi rejim",
                icon: state.classroomTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />,
                onSelect: () => hostActions.setTheme(state.classroomTheme === "dark" ? "light" : "dark"),
              },
              ...(state.isFree ? [{
                key: "link",
                label: "Havola",
                icon: <Link2 size={16} />,
                onSelect: handleCopyLink,
              }] : []),
              ...(state.isBoardOpen ? [{
                key: "download",
                label: "Yuklab olish",
                icon: <Download size={16} />,
                onSelect: () => setDownloadModalOpen(true),
              }] : []),
            ]}
          />
        }
      />

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

      {boardAttachOpen && (
        <BoardAttachModal
          onAttachExisting={(boardId) => handleAttachBoard(boardId)}
          onClose={() => setBoardAttachOpen(false)}
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
                disabled={endingLesson}
                onClick={() => setConfirmEnd(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={endingLesson}
                onClick={handleEnd}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {endingLesson ? "Yakunlanmoqda..." : "Yakunlash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && id && (
        <WhiteboardHistoryModal
          boardId={id}
          onClose={() => setShowHistoryModal(false)}
          onSelectActivity={handleSelectActivity}
        />
      )}
    </div>
  );
}
