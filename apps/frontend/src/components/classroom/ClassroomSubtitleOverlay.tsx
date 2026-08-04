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
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        setDisplayText("");
      }
    }
  }, [isReplay, liveSubtitle, subtitles]);

  if (!enabled || !displayText) {
    return (
      <button
        type="button"
        onClick={() => setEnabled((prev) => !prev)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur hover:bg-slate-900"
        title="Subtitrlarni yoqish/o'chirish"
      >
        <Subtitles size={14} className={enabled ? "text-yellow-400" : "text-gray-400"} />
        <span>CC</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-slate-950/85 px-6 py-3 text-white shadow-2xl backdrop-blur-md transition-all duration-300">
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="text-yellow-400 hover:opacity-80 transition-opacity shrink-0"
          title="Subtitrni yashirish"
        >
          <Subtitles size={18} />
        </button>
        <span className="text-sm font-semibold tracking-wide text-gray-100 max-w-xl text-center leading-relaxed">
          {displayText}
        </span>
      </div>
    </div>
  );
};
