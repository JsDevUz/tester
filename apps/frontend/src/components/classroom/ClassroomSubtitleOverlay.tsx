import React, { useState, useEffect } from "react";

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
  const [enabled] = useState<boolean>(true);
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
  );
};
