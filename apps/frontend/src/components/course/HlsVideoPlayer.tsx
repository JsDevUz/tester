import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { apiStartVideoPlayback } from '../../api/contentBlocks';
import { getApiBaseUrl } from '../../api/baseUrl';

interface HlsVideoPlayerProps {
  blockId: string;
}

export function HlsVideoPlayer({ blockId }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let hls: Hls | null = null;
    let cancelled = false;

    async function boot() {
      try {
        setError(null);
        const playback = await apiStartVideoPlayback(blockId);
        if (cancelled || !videoRef.current) return;

        const manifestUrl = `${getApiBaseUrl()}${playback.manifestUrl}`;
        const token = localStorage.getItem('token');

        if (Hls.isSupported()) {
          hls = new Hls({
            xhrSetup: (xhr) => {
              if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setError('Videoni yuklashda xatolik yuz berdi');
          });
          hls.loadSource(manifestUrl);
          hls.attachMedia(videoRef.current);
          return;
        }

        setError('Bu brauzer HLS videoni qo‘llab-quvvatlamaydi');
      } catch {
        if (!cancelled) setError('Video hozircha ochilmadi');
      }
    }

    void boot();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [blockId]);

  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} controls playsInline className="aspect-video w-full" />
      {error && <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}
    </div>
  );
}
