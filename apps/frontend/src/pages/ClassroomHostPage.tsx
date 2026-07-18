import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import {
  ClassroomPdfViewer,
  type DrawTool,
} from "../components/classroom/ClassroomPdfViewer";
import { ClassroomToolbar } from "../components/classroom/ClassroomToolbar";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { ClassroomCallBar } from "../components/classroom/ClassroomCallBar";
import { ClassroomPdfLibraryModal } from "../components/classroom/ClassroomPdfLibraryModal";
import { PdfPageSelectModal } from "../components/classroom/PdfPageSelectModal";
import {
  apiAttachClassPdf,
  apiMuteParticipant,
  type PdfLibraryAsset,
} from "../api/classroom";

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
  const voice = useClassroomVoice(state.joined ? id : undefined, true);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pdfLibraryOpen, setPdfLibraryOpen] = useState(false);
  const [pageSelectAsset, setPageSelectAsset] =
    useState<PdfLibraryAsset | null>(null);
  const [attaching, setAttaching] = useState(false);

  const handleAttachPages = async (pageNumbers: number[]) => {
    if (!id || !pageSelectAsset) return;
    setAttaching(true);
    try {
      await apiAttachClassPdf(id, pageSelectAsset.id, pageNumbers);
      toast.success("PDF qo'shildi");
      setPageSelectAsset(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "PDF qo'shishda xatolik");
    } finally {
      setAttaching(false);
    }
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
    hostActions.endLesson();
    navigate(-1);
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
    <div className="relative h-dvh bg-gray-50 flex flex-col overflow-hidden">
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
          pointer={state.pointer}
          editable={state.pages.length > 0}
          isHost
          hostZoom={state.zoom}
          onZoomChange={(zoom) => hostActions.setZoom(zoom)}
          hostScroll={state.scroll}
          onScrollChange={(page, yRatio) =>
            hostActions.setScroll(page, yRatio)
          }
          tool={tool}
          color={color}
          strokeWidth={tool === "highlighter" ? strokeWidth * 7 : strokeWidth}
          onStrokeComplete={(page, s) => hostActions.sendStroke(page, s)}
          onPointerMove={(page, x, y, active) =>
            hostActions.pointer(page, x, y, active)
          }
          onEraseStroke={(page, strokeId) =>
            hostActions.eraseStroke(page, strokeId)
          }
          onSplitStroke={(page, strokeId, replacements) =>
            hostActions.splitStroke(page, strokeId, replacements)
          }
          onPageChange={(page) => hostActions.setPage(page)}
          toolbar={
            <ClassroomToolbar
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              onToolChange={setTool}
              onColorChange={setColor}
              onStrokeWidthChange={setStrokeWidth}
              onUndo={() => hostActions.undo(state.currentPage)}
              onClear={() => hostActions.clearPage(state.currentPage)}
              onOpenPdfLibrary={() => setPdfLibraryOpen(true)}
            />
          }
          toolbarActions={
            <ParticipantsPanelToggle
              participants={state.participants}
              speakingUserIds={voice.speakingUserIds}
              isHost
              myUserId={admin?.id ?? null}
              onMute={(uid) => void handleMute(uid)}
              compact
            />
          }
        />

        <ClassroomCallBar
          micEnabled={voice.micEnabled}
          onToggleMic={() => void voice.toggleMic()}
          audioInputs={voice.audioInputs}
          activeAudioInputId={voice.activeAudioInputId}
          onSwitchAudioInput={(deviceId) => void voice.switchAudioInput(deviceId)}
          micDisabled={!voice.voiceAvailable}
          onEndCall={() => setConfirmEnd(true)}
          endCallTitle="Darsni yakunlash"
        />
      </div>

      {pdfLibraryOpen && (
        <ClassroomPdfLibraryModal
          onClose={() => setPdfLibraryOpen(false)}
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
          onClose={() => setPageSelectAsset(null)}
        />
      )}

      {confirmEnd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">
              Darsni yakunlaysizmi?
            </h2>
            <p className="text-sm text-gray-500">
              Barcha o'quvchilar darsdan chiqariladi va davomat yakunlanadi.
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
