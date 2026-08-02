import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Maximize2, Minimize2, Volume2, WifiOff } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { apiGetMe } from "../api/auth";
import { useClassroomSession } from "../hooks/useClassroomSession";
import { useClassroomVoice } from "../hooks/useClassroomVoice";
import { useClassroomTheme } from "../hooks/useClassroomTheme";
import { useAutoHideOverlay } from "../hooks/useAutoHideOverlay";
import { useFullscreen } from "../hooks/useFullscreen";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";
import { StickerReactionsOverlay } from "../components/classroom/StickerReactionsOverlay";
import { RaisedHandsControl } from "../components/classroom/RaisedHandsControl";
import { ParticipantsPanelToggle } from "../components/classroom/ParticipantsPanelToggle";
import { ClassroomCallBar } from "../components/classroom/ClassroomCallBar";

const ERROR_TEXT: Record<string, string> = {
  SESSION_NOT_FOUND: "Jonli dars topilmadi yoki allaqachon tugagan",
  NOT_ENROLLED: "Siz bu guruhning o'quvchisi emassiz",
  UNAUTHORIZED: "Avtorizatsiya xatosi — qayta kiring",
  GUEST_NAME_REQUIRED: "Ismingizni kiriting",
};

// isFreeRoute=true bo'lsa (/classroom/free/:id) login shart emas — login
// qilmagan mehmon avval ismini kiritadi. Login qilgan foydalanuvchi uchun
// esa haqiqiy ismi ishlatiladi (forma ko'rsatilmaydi). Ovoz (LiveKit) faqat
// login qilganlar uchun ishlaydi, chunki voice-token endpoint auth talab qiladi.
export function ClassroomStudentPage({ isFreeRoute = false }: { isFreeRoute?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const admin = useAuthStore((s) => s.admin);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameSubmitted, setGuestNameSubmitted] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(isFreeRoute && Boolean(token) && !admin);

  // Erkin (guruhsiz) dars marshruti PrivateRoute bilan o'ralmaydi (mehmon
  // ham kira olishi kerak), shuning uchun localStorage'dagi token bo'lsa-da
  // admin hech qachon hidratsiya qilinmasdi — login qilgan foydalanuvchiga
  // ham mehmon-ism formasi ko'rsatilib qolardi. Shu yerda alohida so'raladi.
  useEffect(() => {
    if (!isFreeRoute || !token || admin) {
      setMeLoading(false);
      return;
    }
    apiGetMe()
      .then((me) => useAuthStore.setState({ admin: me }))
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setMeLoading(false));
  }, [isFreeRoute, token, admin]);

  const needsGuestForm = isFreeRoute && !meLoading && !admin && guestNameSubmitted === null;
  const { state, sendReaction, toggleHandRaise } = useClassroomSession(id, "student", guestNameSubmitted ?? undefined);
  // Guest uchun admin.id yo'q — server socket ID yoki guestName asosida saqlaydi.
  // raisedHands da userId bor, shuning uchun admin.id ham, guestName ham bo'lishi mumkin.
  // Eng ishonchli yo'l: guestNameSubmitted yoki admin.name bo'yicha qidirish.
  const myName = admin?.name ?? guestNameSubmitted ?? "";
  const isHandRaised = (state.raisedHands ?? []).some(
    (h) => h.userId === (admin?.id ?? "") || h.userName === myName
  );
  useClassroomTheme(state.classroomTheme);
  // Login qilgan foydalanuvchilar ham, ismi kiritilgan mehmonlar ham (guestNameSubmitted) ovoz (LiveKit) xonasiga ulanadi.
  const isGuestUser = !admin && Boolean(guestNameSubmitted);
  const voice = useClassroomVoice(
    !needsGuestForm && (admin || isGuestUser) && state.joined && !state.ended ? id : undefined,
    true,
    isGuestUser ? guestNameSubmitted! : undefined,
  );
  const { visible: overlayVisible } = useAutoHideOverlay();
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(pageRef);

  if (isFreeRoute && meLoading) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (needsGuestForm) {
    const isDark = state.classroomTheme === "dark";
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-4 p-6 transition-colors ${
        isDark ? "bg-[#18191c] text-white" : "bg-gray-50 text-gray-800"
      }`}>
        <form
          className={`flex w-full max-w-sm flex-col gap-3 rounded-2xl p-6 shadow-xl border ${
            isDark ? "bg-[#202124] border-white/10" : "bg-white border-gray-100"
          }`}
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = guestNameInput.trim();
            if (trimmed) setGuestNameSubmitted(trimmed);
          }}
        >
          <h2 className={`font-semibold ${isDark ? "text-white" : "text-gray-800"}`}>Jonli darsga qo'shilish</h2>
          <p className={`text-sm ${isDark ? "text-white/60" : "text-gray-500"}`}>Davom etish uchun ismingizni kiriting.</p>
          <input
            type="text"
            autoFocus
            value={guestNameInput}
            onChange={(e) => setGuestNameInput(e.target.value)}
            placeholder="Ismingiz"
            maxLength={60}
            className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
              isDark
                ? "bg-[#2d2e31] border-white/10 text-white placeholder-white/40 focus:border-indigo-500"
                : "border-gray-200 bg-white text-gray-900 focus:border-indigo-400"
            }`}
          />
          <button
            type="submit"
            disabled={!guestNameInput.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Kirish
          </button>
        </form>
      </div>
    );
  }

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

  const isDarkTheme = state.classroomTheme === "dark";

  return (
    <div ref={pageRef} className={`relative h-dvh flex flex-col overflow-hidden transition-colors ${
      isDarkTheme ? "bg-[#121316] text-white" : "bg-gray-50 text-gray-800"
    }`}>
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
          rightStrokesByPage={state.rightStrokesByPage}
          pointer={state.pointer}
          editable={false}
          isHost={false}
          hostZoom={state.zoom}
          rightHostZoom={state.rightZoom}
          hostSplitRatio={state.splitRatio}
          notebookPageCount={state.notebookPageCount}
          notebookPageStyles={state.notebookPageStyles}
          notebookPageOrientations={state.notebookPageOrientations}
          hostScroll={state.scroll}
          rightHostScroll={state.rightScroll}
          boardMode={state.boardMode}
          boardLayout={state.boardLayout}
          leftBoardMode={state.leftBoardMode}
          rightBoardMode={state.rightBoardMode}
          tool="pen"
          color="#ef4444"
          strokeWidth={3}
          toolbarActions={
            <div className="flex items-center gap-1.5">
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
              {/* O'quvchilar qo'l ko'targanlar ro'yxatini ko'rishi uchun — faqat read-only, lower qilolmaydi */}
              <RaisedHandsControl
                raisedHands={state.raisedHands ?? []}
                onLowerAll={() => {}}
                onLowerUser={() => {}}
                readOnly
                theme={state.classroomTheme}
              />
              <ParticipantsPanelToggle
                participants={state.participants}
                speakingUserIds={voice.speakingUserIds}
                isHost={false}
                myUserId={admin?.id ?? null}
                userReactions={state.userReactions}
                compact
                theme={state.classroomTheme}
              />
            </div>
          }
        />

        <StickerReactionsOverlay reactions={state.reactions ?? []} />

        <ClassroomCallBar
          micEnabled={voice.micEnabled}
          onToggleMic={() => void voice.toggleMic()}
          audioInputs={voice.audioInputs}
          activeAudioInputId={voice.activeAudioInputId}
          onSwitchAudioInput={(deviceId) => void voice.switchAudioInput(deviceId)}
          micDisabled={(!admin && !isGuestUser) || !voice.voiceAvailable}
          onEndCall={() => navigate("/")}
          endCallTitle="Darsdan chiqish"
          hidden={!overlayVisible}
          theme={state.classroomTheme}
          onSendReaction={sendReaction}
          handRaised={isHandRaised}
          onToggleHandRaise={admin || guestNameSubmitted ? toggleHandRaise : undefined}
        />
      </div>
    </div>
  );
}
