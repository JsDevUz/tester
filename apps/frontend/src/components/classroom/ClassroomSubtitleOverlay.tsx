import React, { useState, useEffect } from "react";
import { Subtitles } from "lucide-react";

export interface ClassroomSubtitleCue {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface ClassroomSubtitleOverlayProps {
  isReplay?: boolean;
  replayTimeMs?: number;
  subtitles?: ClassroomSubtitleCue[];
  liveSubtitle?: string;
}

export const ClassroomSubtitleOverlay: React.FC<ClassroomSubtitleOverlayProps> = ({
  isReplay = false,
  replayTimeMs = 0,
  subtitles = [],
  liveSubtitle = "",
}) => {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [displayText, setDisplayText] = useState<string>("");

  useEffect(() => {
    if (isReplay && subtitles.length > 0) {
      const cue = subtitles.find(
        (c) => replayTimeMs >= c.startMs && replayTimeMs <= c.endMs,
      );
      setDisplayText(cue ? cue.text : "");
    }
  }, [isReplay, replayTimeMs, subtitles]);

  useEffect(() => {
    if (!isReplay) {
      if (liveSubtitle) {
        setDisplayText(liveSubtitle);
      } else if (subtitles && subtitles.length > 0) {
        const lastCue = subtitles[subtitles.length - 1];
        setDisplayText(lastCue ? lastCue.text : "");
        const timer = setTimeout(() => {
          setDisplayText("");
        }, 7000);
        return () => clearTimeout(timer);
      } else {
        setDisplayText("");
      }
    }
  }, [isReplay, liveSubtitle, subtitles]);

  if (!enabled) return null;

  return (
    <>
      {displayText ? (
        <div className="pointer-events-none fixed bottom-[84px] sm:bottom-[92px] left-1/2 z-30 -translate-x-1/2 w-auto max-w-xl px-4 text-center">
          <span
            className="inline bg-black/90 text-white font-medium text-base sm:text-lg leading-relaxed px-3.5 py-1.5 rounded-lg shadow-xl tracking-wide select-none transition-all duration-200"
            style={{
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {displayText}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur hover:bg-slate-900"
          title="Subtitr rejimida"
        >
          <Subtitles size={14} className="text-yellow-400" />
          <span>CC</span>
        </button>
      )}
    </>
  );
};
