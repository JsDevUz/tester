import { useNavigate, useParams } from "react-router-dom";
import { PhoneOff, Volume2, WifiOff } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { useAutoHideOverlay } from "../hooks/useAutoHideOverlay";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { MicControl } from "../components/classroom/MicControl";

const ERROR_TEXT: Record<string, string> = {
  SESSION_NOT_FOUND: "Jonli dars topilmadi yoki allaqachon tugagan",
  NOT_ENROLLED: "Siz bu guruhning o'quvchisi emassiz",
  UNAUTHORIZED: "Avtorizatsiya xatosi — qayta kiring",
};

export function ClassroomStudentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const admin = useAuthStore((s) => s.admin);
  const { state } = useClassroomSession(id, "student");
  const voice = useClassroomVoice(
    state.joined && !state.ended ? id : undefined,
    true,
  );
  const { visible: overlayVisible } = useAutoHideOverlay();

  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-gray-600">
          {ERROR_TEXT[state.error] ?? "Xatolik yuz berdi"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
        >
          Bosh sahifa
        </button>
      </div>
    );
  }

  if (state.ended) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-lg font-semibold text-gray-800">Dars yakunlandi</p>
        <p className="text-sm text-gray-500">Ishtirokingiz uchun rahmat!</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium"
        >
          Bosh sahifa
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-dvh bg-gray-50 flex flex-col overflow-hidden">
      {!state.hostOnline && state.joined && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-50 text-amber-700 text-sm px-4 py-2 rounded-full shadow-md flex items-center gap-2">
          <WifiOff size={14} />
          Ustoz bilan aloqa uzildi — qayta ulanish kutilmoqda...
        </div>
      )}

      {voice.needsAudioUnlock && (
        <button
          type="button"
          onClick={voice.unlockAudio}
          className={`absolute left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-sm px-4 py-2 rounded-full shadow-md flex items-center gap-2 font-medium hover:bg-indigo-700 ${
            !state.hostOnline && state.joined ? "top-14" : "top-3"
          }`}
        >
          <Volume2 size={16} />
          Ovozni yoqish uchun bosing
        </button>
      )}

      <div className="relative flex-1 min-h-0 flex flex-col p-0 sm:p-1">
        <ClassroomPdfViewer
          pageUrls={state.pages}
          currentPage={state.currentPage}
          strokesByPage={state.strokesByPage}
          pointer={state.pointer}
          editable={false}
          isHost={false}
          hostZoom={state.zoom}
          hostScroll={state.scroll}
          tool="pen"
          color="#ef4444"
          strokeWidth={3}
          toolbarActions={
            <ParticipantsPanelToggle
              participants={state.participants}
              speakingUserIds={voice.speakingUserIds}
              isHost={false}
              myUserId={admin?.id ?? null}
              compact
            />
          }
        />

        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 transition-transform duration-300 ease-in-out"
          style={{ transform: overlayVisible ? "translateY(0)" : "translateY(150%)" }}
        >
          <MicControl
            micEnabled={voice.micEnabled}
            onToggleMic={() => void voice.toggleMic()}
            audioInputs={voice.audioInputs}
            activeAudioInputId={voice.activeAudioInputId}
            onSwitchAudioInput={(deviceId) => void voice.switchAudioInput(deviceId)}
            disabled={!voice.voiceAvailable}
          />
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-3 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
            title="Darsdan chiqish"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
