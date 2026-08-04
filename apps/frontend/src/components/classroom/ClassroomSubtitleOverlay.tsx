import React, { useState, useEffect } from "react";
import { Subtitles, X } from "lucide-react";

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
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-[76px] sm:bottom-[84px] left-1/2 z-30 -translate-x-1/2 w-full max-w-lg px-4 transition-all duration-300">
      <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl bg-slate-950/90 border border-white/10 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Subtitles size={16} className="text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-white tracking-wide leading-snug line-clamp-2 text-left select-none">
            {displayText}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className="text-white/40 hover:text-white transition-colors shrink-0 p-1 rounded-full hover:bg-white/10"
          title="Yashirish"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
