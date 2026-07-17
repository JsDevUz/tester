import { useNavigate, useParams } from "react-router-dom";
import { LogOut, Mic, MicOff, Radio, Volume2, WifiOff } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { AutoHideHeader } from "../components/classroom/AutoHideHeader";

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
    <div className="h-dvh bg-gray-50 flex flex-col overflow-hidden">
      <AutoHideHeader>
        <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Radio size={18} className="text-red-500 animate-pulse shrink-0" />
            <h1 className="font-semibold text-gray-800 truncate">Jonli dars</h1>
          </div>
          <div className="flex-1" />
          {!voice.voiceAvailable && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
              Ovozsiz rejim
            </span>
          )}
        </header>

        {!state.hostOnline && state.joined && (
          <div className="bg-amber-50 text-amber-700 text-sm px-4 py-2 flex items-center gap-2">
            <WifiOff size={14} />
            Ustoz bilan aloqa uzildi — qayta ulanish kutilmoqda...
          </div>
        )}

        {voice.needsAudioUnlock && (
          <button
            type="button"
            onClick={voice.unlockAudio}
            className="w-full bg-indigo-50 text-indigo-700 text-sm px-4 py-2.5 flex items-center justify-center gap-2 font-medium hover:bg-indigo-100"
          >
            <Volume2 size={16} />
            Ovozni yoqish uchun bosing
          </button>
        )}
      </AutoHideHeader>

      <div className="flex-1 min-h-0 flex flex-col p-0 sm:p-1">
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
            <div className="flex items-center gap-1 bg-white rounded-full shadow-md border border-gray-100 px-0.5 py-0.5">
              {voice.voiceAvailable && (
                <button
                  type="button"
                  onClick={() => void voice.toggleMic()}
                  className={`p-1.5 rounded-full ${voice.micEnabled ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-100"}`}
                  title={
                    voice.micEnabled
                      ? "Mikrofonni o'chirish"
                      : "Mikrofonni yoqish"
                  }
                >
                  {voice.micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
              )}
              <ParticipantsPanelToggle
                participants={state.participants}
                speakingUserIds={voice.speakingUserIds}
                isHost={false}
                myUserId={admin?.id ?? null}
                compact
              />
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center gap-1 px-2 py-1.5 rounded-full text-gray-500 hover:bg-gray-100 text-xs font-medium"
                title="Darsdan chiqish"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Chiqish</span>
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
