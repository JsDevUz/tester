import { useState } from "react";
import { Play } from "lucide-react";
import { HlsVideoPlayer } from "./HlsVideoPlayer";

/**
 * Shows a poster until the student actually wants to watch, then mounts the real player.
 *
 * A lesson can hold several video blocks, and each mounted player immediately opens a playback
 * session and starts pulling segments. Four videos on a page meant four sessions competing for
 * the same bandwidth before the student had watched anything -- which made the first video
 * slower to start, not faster.
 *
 * Once mounted the player stays mounted, so pausing does not throw away the buffer.
 */
export function LazyVideoPlayer({
  blockId,
  posterUrl,
  watermark,
}: {
  blockId: string;
  posterUrl?: string | null;
  watermark?: boolean;
}) {
  const [activated, setActivated] = useState(false);

  if (activated) return <HlsVideoPlayer blockId={blockId} watermark={watermark} />;

  return (
    <button
      type="button"
      onClick={() => setActivated(true)}
      aria-label="Videoni ijro etish"
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-black"
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-transform group-hover:scale-110">
          <Play size={28} className="ml-1 fill-white text-white" />
        </span>
      </span>
    </button>
  );
}
