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

  // Warm the hls.js chunk while the pointer is on its way to the button, so tapping play does
  // not also wait on a 157KB download. Harmless if it never fires -- the import is cached
  // either way, and a student who never hovers simply pays for it on click as before.
  const prefetchPlayer = () => {
    void import('hls.js').catch(() => {});
  };

  // autoPlay: the press that mounted the player was already the "play" press. Without it the
  // viewer has to press twice -- once on the poster, once on the player -- which is slower
  // than before the poster existed.
  if (activated) return <HlsVideoPlayer blockId={blockId} watermark={watermark} autoPlay />;

  return (
    <button
      type="button"
      onClick={() => setActivated(true)}
      onMouseEnter={prefetchPlayer}
      onTouchStart={prefetchPlayer}
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
      ) : (
        // Videos transcoded before posters existed have none. A flat black rectangle reads as
        // something broken, so it gets a subtle gradient instead of nothing.
        <span className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-transform group-hover:scale-110">
          <Play size={28} className="ml-1 fill-white text-white" />
        </span>
      </span>
    </button>
  );
}
