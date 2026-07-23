import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Pause, Users, X } from "lucide-react";
import { apiClassReplay, type ClassReplayData } from "../api/classroom";
import { useClassroomReplay } from "../hooks/useClassroomReplay";
import { useClassroomTheme } from "../hooks/useClassroomTheme";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";
import { useAutoHideOverlay } from "../hooks/useAutoHideOverlay";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function ClassroomReplayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ClassReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  // listenGlobally=false: PDF'ni scroll/pan/zoom qilish bu panellarni qayta
  // ko'rsatmasin — faqat panellarning o'ziga yoki video ustiga bosilganda
  // (haqiqiy "controls" niyati bilan) qayta ko'rinsin, aks holda haqiqiy
  // 3s harakatsizlikdan keyin yashirilsin.
  const { visible: controlsVisible, reveal: revealControls } = useAutoHideOverlay(false);

  useEffect(() => {
    if (!sessionId) return;
    apiClassReplay(sessionId)
      .then(setData)
      .catch(() => setError("Dars topilmadi yoki kirish huquqi yo'q"));
  }, [sessionId]);

  // boardAudio'da chizmalar yakuniy holatda turadi, lekin audio va
  // pointer/scroll/zoom timeline qayta ijro etiladi. boardSilent esa
  // butunlay statik qoladi.
  const isBoardOnly = data?.recordingMode === "boardAudio" || data?.recordingMode === "boardSilent";
  const isBoardAudio = data?.recordingMode === "boardAudio";
  const showTimeline = !isBoardOnly || isBoardAudio;
  const hasRecording = data?.recordingStatus === "ready" && !!data?.recordingUrl && data?.recordingMode !== "boardSilent";
  // Audio yozib olish sessiya boshlanishidan (t=0, chizma tarixi shu ondan
  // hisoblanadi) bir necha soniya keyin boshlanadi — LiveKit ulanish/token
  // bosqichlari tugagach. recordingStartedAtMs shu siljishni bildiradi;
  // uni bilmasdan audio va chizma tarixi replay'da mos kelmaydi.
  const recordingOffsetMs = data?.recordingStartedAtMs ?? 0;
  const replay = useClassroomReplay(
    showTimeline ? (data?.historyEvents ?? []) : [], data?.pdfName ?? null, data?.pdfPages ?? [],
    hasRecording ? recordingOffsetMs + audioDurationMs : 0,
  );
  const boardSnapshot = data?.boardSnapshot ?? null;
  // "Faqat chizma" rejimida board o'zgarmas — boardSnapshot'dagi statik
  // holat ko'rsatiladi, replay hook (bo'sh events bilan) ishlatilmaydi.
  const viewState = isBoardOnly && boardSnapshot
    ? {
        pages: boardSnapshot.pages,
        currentPage: isBoardAudio ? replay.state.currentPage : 1,
        strokesByPage: boardSnapshot.strokesByPage,
        rightStrokesByPage: boardSnapshot.rightStrokesByPage,
        zoom: isBoardAudio ? replay.state.zoom : 1,
        rightZoom: isBoardAudio ? replay.state.rightZoom : 1,
        scroll: isBoardAudio ? replay.state.scroll : null,
        rightScroll: isBoardAudio ? replay.state.rightScroll : null,
        pointer: isBoardAudio ? replay.state.pointer : null,
        boardMode: boardSnapshot.boardMode,
        boardLayout: boardSnapshot.boardLayout,
        leftBoardMode: boardSnapshot.leftBoardMode,
        rightBoardMode: boardSnapshot.rightBoardMode,
        notebookStyle: boardSnapshot.notebookStyle,
        classroomTheme: replay.state.classroomTheme,
      }
    : replay.state;
  useClassroomTheme(viewState.classroomTheme);
  // Scrub joriy vaqti audio boshlanishidan oldin bo'lsa (masalan o'qituvchi
  // ovoz ulanishidan oldin chiza boshlagan bo'lsa), audio hali "mavjud
  // emas" — uni ijro etib bo'lmaydi, pauzada qoldiramiz.
  const beforeRecordingStarted = replay.currentTimeMs < recordingOffsetMs;

  useEffect(() => {
    if (!hasRecording) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (replay.isPlaying && !beforeRecordingStarted) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // replay.currentTimeMs ni deps'ga qo'shmaymiz — play() ni har RAF
    // freym'ida qayta chaqirmaslik uchun faqat isPlaying/beforeRecordingStarted
    // O'ZGARGANDA reaksiya beramiz (masalan scrub vaqti recordingOffsetMs'ni
    // kesib o'tganda). Aniq pozitsiyalash handleSeek orqali bajariladi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.isPlaying, beforeRecordingStarted, hasRecording]);

  const handleSeek = (ms: number) => {
    replay.seek(ms);
    if (hasRecording && audioRef.current) {
      const audioTimeMs = Math.max(0, ms - recordingOffsetMs);
      audioRef.current.currentTime = audioTimeMs / 1000;
    }
  };

  const handlePlayPause = () => {
    if (replay.isPlaying) {
      replay.pause();
      return;
    }
    // Play bosilganda audio elementining currentTime'ini scrubber bilan
    // qayta sinxronlaymiz — aks holda audio o'zining oldingi (masalan
    // pauzadan oldingi) pozitsiyasidan davom etib, chizma tarixidan
    // uzilib qolishi mumkin edi.
    if (hasRecording && audioRef.current) {
      const audioTimeMs = Math.max(0, replay.currentTimeMs - recordingOffsetMs);
      audioRef.current.currentTime = audioTimeMs / 1000;
    }
    replay.play();
  };

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-8 h-8 rounded-full border border-gray-200 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-100">
      <div className="relative flex flex-1 min-h-0" onClick={revealControls}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 top-3 z-30 flex items-start gap-1.5 transition-transform duration-300 ease-in-out"
          style={{ transform: controlsVisible ? "translateY(0)" : "translateY(-150%)" }}
        >
          <button type="button" onClick={() => setAttendanceOpen((open) => !open)} className={`flex h-[29px] items-center gap-1 rounded-full border px-2 text-[11px] font-medium shadow-md backdrop-blur transition-colors ${attendanceOpen ? "border-indigo-200 bg-indigo-100 text-indigo-700" : "border-gray-100 bg-white/95 text-gray-600 hover:bg-white"}`} aria-label="Davomatni ochish" aria-expanded={attendanceOpen}>
            <Users size={14} /> <span className="hidden sm:inline">Davomat</span>
          </button>
          <button type="button" onClick={() => navigate(-1)} className="flex h-[29px] w-[29px] items-center justify-center rounded-full border border-gray-100 bg-white/95 text-gray-600 shadow-md backdrop-blur hover:bg-white" aria-label="Replay'dan chiqish" title="Chiqish">
            <X size={15} />
          </button>
        </div>
        <div className="classroom-replay-viewer relative flex-1 min-h-0 flex flex-col">
          <ClassroomPdfViewer
            pageUrls={viewState.pages}
            currentPage={viewState.currentPage}
            strokesByPage={viewState.strokesByPage}
            rightStrokesByPage={viewState.rightStrokesByPage}
            pointer={viewState.pointer}
            editable={false}
            isHost={false}
            hostZoom={viewState.zoom}
            rightHostZoom={viewState.rightZoom}
            hostScroll={viewState.scroll}
            rightHostScroll={viewState.rightScroll}
            tool="pen"
            color="#000000"
            strokeWidth={2}
            boardMode={viewState.boardMode}
            boardLayout={viewState.boardLayout}
            leftBoardMode={viewState.leftBoardMode}
            rightBoardMode={viewState.rightBoardMode}
            notebookStyle={viewState.notebookStyle}
          />
        </div>
      </div>

      {showTimeline && (
        <div onPointerMove={revealControls} onTouchStart={revealControls} className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-center px-3 pb-3 transition-transform duration-300 ${controlsVisible ? "translate-y-0" : "translate-y-full"}`}>
          <div className="flex w-[min(86vw,56rem)] items-center gap-1.5 rounded-xl border border-indigo-300/20 bg-indigo-950/90 px-2.5 py-1.5 text-white shadow-2xl backdrop-blur-md sm:gap-3 sm:px-3">
          <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold tracking-wide sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-white" /> REPLAY</span>
          <button
            type="button"
            onClick={handlePlayPause}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white hover:bg-indigo-800/70 sm:h-9 sm:w-9"
          >
            {replay.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="hidden w-10 shrink-0 text-right text-xs tabular-nums text-white/80 sm:block">{formatMs(replay.currentTimeMs)}</span>
          <input
            type="range"
            min={0}
            max={replay.durationMs}
            value={replay.currentTimeMs}
            onChange={(e) => handleSeek(Number(e.target.value))}
            onClick={revealControls}
            className="h-1 flex-1 cursor-pointer accent-indigo-400"
          />
          <span className="w-10 shrink-0 text-xs tabular-nums text-white/80">{formatMs(replay.durationMs)}</span>
          {data.recordingStatus === "pending" && (
            <span className="shrink-0 text-xs text-gray-500">Audio yozuvi tayyor emas</span>
          )}
          {data.recordingStatus === "failed" && (
            <span className="shrink-0 text-xs text-gray-500">Audio yozuvi mavjud emas</span>
          )}
          {hasRecording && (
            <audio
              ref={audioRef}
              src={data.recordingUrl ?? undefined}
              onLoadedMetadata={(event) => setAudioDurationMs(event.currentTarget.duration * 1000)}
              className="h-0 w-0 opacity-0"
            />
          )}
          </div>
        </div>
      )}

      {attendanceOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAttendanceOpen(false);
          }}
        >
          <div role="dialog" aria-label="Davomat" className="max-h-[80dvh] w-full overflow-hidden rounded-t-3xl bg-white text-left shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">Davomat</h3>
              <button type="button" onClick={() => setAttendanceOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Yopish"><X size={16} /></button>
            </div>
            <div className="max-h-[calc(80dvh-52px)] overflow-y-auto p-3">
              <div className="flex flex-col gap-1.5">
                {data.attendance.map((a) => (
                  <div key={a.userId} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-gray-700">{a.name}</span>
                    <span className={`text-xs font-medium ${a.status === "present" ? "text-green-600" : a.status === "late" ? "text-amber-600" : "text-gray-400"}`}>
                      {a.status === "present" ? "Keldi" : a.status === "late" ? "Kech qoldi" : "Kelmadi"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
