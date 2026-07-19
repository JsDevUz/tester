import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Pause, ArrowLeft } from "lucide-react";
import { apiClassReplay, type ClassReplayData } from "../api/classroom";
import { useClassroomReplay } from "../hooks/useClassroomReplay";
import { ClassroomPdfViewer } from "../components/classroom/ClassroomPdfViewer";

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

  useEffect(() => {
    if (!sessionId) return;
    apiClassReplay(sessionId)
      .then(setData)
      .catch(() => setError("Dars topilmadi yoki kirish huquqi yo'q"));
  }, [sessionId]);

  const replay = useClassroomReplay(data?.historyEvents ?? [], data?.pdfName ?? null, data?.pdfPages ?? []);

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
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-gray-100">
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-gray-800">Dars tarixi</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-h-0">
          <ClassroomPdfViewer
            pageUrls={data.pdfPages}
            currentPage={replay.state.currentPage}
            strokesByPage={replay.state.strokesByPage}
            rightStrokesByPage={replay.state.rightStrokesByPage}
            pointer={null}
            editable={false}
            isHost={false}
            hostZoom={replay.state.zoom}
            rightHostZoom={replay.state.rightZoom}
            hostScroll={replay.state.scroll}
            rightHostScroll={replay.state.rightScroll}
            tool="pen"
            color="#000000"
            strokeWidth={2}
            boardMode={replay.state.boardMode}
            boardLayout={replay.state.boardLayout}
            leftBoardMode={replay.state.leftBoardMode}
            rightBoardMode={replay.state.rightBoardMode}
            notebookStyle={replay.state.notebookStyle}
          />
        </div>
        <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 lg:block">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Davomat</h3>
          <div className="flex flex-col gap-2">
            {data.attendance.map((a) => (
              <div key={a.userId} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{a.name}</span>
                <span className={`text-xs font-medium ${a.status === "present" ? "text-green-600" : a.status === "late" ? "text-amber-600" : "text-gray-400"}`}>
                  {a.status === "present" ? "Keldi" : a.status === "late" ? "Kech qoldi" : "Kelmadi"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => (replay.isPlaying ? replay.pause() : replay.play())}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {replay.isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="w-10 shrink-0 text-xs tabular-nums text-gray-500">{formatMs(replay.currentTimeMs)}</span>
        <input
          type="range"
          min={0}
          max={replay.durationMs}
          value={replay.currentTimeMs}
          onChange={(e) => replay.seek(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-10 shrink-0 text-xs tabular-nums text-gray-500">{formatMs(replay.durationMs)}</span>
        {data.recordingStatus === "ready" && data.recordingUrl && (
          <audio src={data.recordingUrl} className="hidden" />
        )}
      </div>
    </div>
  );
}
