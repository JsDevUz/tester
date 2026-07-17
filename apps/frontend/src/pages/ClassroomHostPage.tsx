import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, PhoneOff, Radio, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { ClassroomPdfViewer, type DrawTool } from "../components/classroom/ClassroomPdfViewer";
import { ClassroomToolbar } from "../components/classroom/ClassroomToolbar";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { apiMuteParticipant, apiUploadClassPdf, type CsStroke } from "../api/classroom";

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
  const voice = useClassroomVoice(state.joined ? id : undefined, false);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [uploading, setUploading] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const pageUrl = state.pages[state.currentPage - 1] ?? null;
  const strokes = state.strokesByPage[state.currentPage] ?? [];

  const handleUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      await apiUploadClassPdf(id, file);
      toast.success("PDF yuklandi");
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "PDF yuklashda xatolik");
    } finally {
      setUploading(false);
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
        <p className="text-gray-600">{ERROR_TEXT[state.error] ?? "Xatolik yuz berdi"}</p>
        <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
          Orqaga
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100" title="Orqaga">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Radio size={18} className="text-red-500 animate-pulse shrink-0" />
          <h1 className="font-semibold text-gray-800 truncate">Jonli dars</h1>
          {state.pdfName && <span className="text-sm text-gray-400 truncate hidden sm:inline">— {state.pdfName}</span>}
        </div>
        <div className="flex-1" />
        {!voice.voiceAvailable && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg hidden sm:inline">Ovoz o'chirilgan (server sozlanmagan)</span>
        )}
        {voice.voiceAvailable && (
          <button
            type="button"
            onClick={() => void voice.toggleMic()}
            className={`p-2.5 rounded-xl ${voice.micEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
            title={voice.micEnabled ? "Mikrofonni o'chirish" : "Mikrofonni yoqish"}
          >
            {voice.micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
        )}
        <ParticipantsPanelToggle
          participants={state.participants}
          speakingUserIds={voice.speakingUserIds}
          isHost
          myUserId={admin?.id ?? null}
          onMute={(uid) => void handleMute(uid)}
        />
        <button
          type="button"
          onClick={() => setConfirmEnd(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium"
        >
          <PhoneOff size={16} />
          <span className="hidden sm:inline">Darsni yakunlash</span>
        </button>
      </header>

      {voice.needsAudioUnlock && (
        <button
          type="button"
          onClick={voice.unlockAudio}
          className="bg-indigo-50 text-indigo-700 text-sm px-4 py-2.5 flex items-center justify-center gap-2 font-medium hover:bg-indigo-100"
        >
          <Volume2 size={16} />
          Ovozni yoqish uchun bosing
        </button>
      )}

      <main className="flex-1 flex flex-col gap-3 p-4 min-h-0">
        <ClassroomToolbar
          tool={tool}
          color={color}
          page={state.currentPage}
          pageCount={state.pages.length}
          uploading={uploading}
          onToolChange={setTool}
          onColorChange={setColor}
          onPageChange={(p) => hostActions.setPage(p)}
          onUndo={() => hostActions.undo(state.currentPage)}
          onClear={() => hostActions.clearPage(state.currentPage)}
          onUploadPdf={(f) => void handleUpload(f)}
        />
        <ClassroomPdfViewer
          pageUrl={pageUrl}
          strokes={strokes}
          pointer={state.pointer?.page === state.currentPage ? state.pointer : null}
          editable={state.pages.length > 0}
          tool={tool}
          color={tool === "highlighter" ? "#facc15" : color}
          strokeWidth={tool === "highlighter" ? 8 : 3}
          onStrokeComplete={(s: CsStroke) => hostActions.sendStroke(state.currentPage, s)}
          onPointerMove={(x, y, active) => hostActions.pointer(state.currentPage, x, y, active)}
        />
      </main>

      {confirmEnd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-semibold text-gray-800">Darsni yakunlaysizmi?</h2>
            <p className="text-sm text-gray-500">Barcha o'quvchilar darsdan chiqariladi va davomat yakunlanadi.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setConfirmEnd(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">
                Bekor qilish
              </button>
              <button type="button" onClick={handleEnd} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700">
                Yakunlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
