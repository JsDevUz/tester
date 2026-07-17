import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Radio, WifiOff } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";

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
  const voice = useClassroomVoice(state.joined && !state.ended ? id : undefined, true);

  const pageUrl = state.pages[state.currentPage - 1] ?? null;
  const strokes = state.strokesByPage[state.currentPage] ?? [];

  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-gray-600">{ERROR_TEXT[state.error] ?? "Xatolik yuz berdi"}</p>
        <button type="button" onClick={() => navigate("/")} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
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
        <button type="button" onClick={() => navigate("/")} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
          Bosh sahifa
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => navigate("/")} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100" title="Chiqish">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Radio size={18} className="text-red-500 animate-pulse shrink-0" />
          <h1 className="font-semibold text-gray-800 truncate">Jonli dars</h1>
        </div>
        <div className="flex-1" />
        {voice.voiceAvailable ? (
          <button
            type="button"
            onClick={() => void voice.toggleMic()}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
              voice.micEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {voice.micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            <span className="hidden sm:inline">{voice.micEnabled ? "Mikrofon yoniq" : "Gapirish"}</span>
          </button>
        ) : (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">Ovozsiz rejim</span>
        )}
        <ParticipantsPanelToggle
          participants={state.participants}
          speakingUserIds={voice.speakingUserIds}
          isHost={false}
          myUserId={admin?.id ?? null}
        />
      </header>

      {!state.hostOnline && state.joined && (
        <div className="bg-amber-50 text-amber-700 text-sm px-4 py-2 flex items-center gap-2">
          <WifiOff size={14} />
          Ustoz bilan aloqa uzildi — qayta ulanish kutilmoqda...
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 min-h-0">
        <ClassroomPdfViewer
          pageUrl={pageUrl}
          strokes={strokes}
          pointer={state.pointer?.page === state.currentPage ? state.pointer : null}
          editable={false}
          tool="pen"
          color="#ef4444"
          strokeWidth={3}
        />
        {state.pages.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-2">
            Sahifa {state.currentPage} / {state.pages.length}
          </p>
        )}
      </main>
    </div>
  );
}
