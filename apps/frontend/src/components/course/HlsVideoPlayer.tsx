import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { apiStartVideoPlayback } from '../../api/contentBlocks';
import { getApiBaseUrl } from '../../api/baseUrl';
import { useAuthStore } from '../../stores/authStore';

interface HlsVideoPlayerProps {
  blockId: string;
  watermark?: boolean;
}

export function HlsVideoPlayer({ blockId, watermark = false }: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const admin = useAuthStore((s) => s.admin);
  const [error, setError] = useState<string | null>(null);
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState({ left: 12, top: 16 });

  const watermarkText = [
    admin?.name ?? "O'quvchi",
    admin?.phone ?? admin?.email ?? admin?.id?.slice(0, 8),
  ].filter(Boolean).join(' • ');

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

  useEffect(() => {
    if (!watermark) return undefined;

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const move = () => {
      setMarkPosition({
        left: Math.round(8 + Math.random() * 68),
        top: Math.round(12 + Math.random() * 66),
      });
      setMarkVisible(true);
      hideTimer = setTimeout(() => setMarkVisible(false), 2200);
    };

    move();
    const interval = setInterval(move, 4200);

    return () => {
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [watermark]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} controls playsInline className="aspect-video w-full" />
      {watermark && (
        <div
          className={`pointer-events-none absolute z-10 max-w-[72%] rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-bold text-white/80 shadow-sm backdrop-blur-sm transition-all duration-500 ${
            markVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
          style={{ left: `${markPosition.left}%`, top: `${markPosition.top}%`, transform: 'translate(-50%, -50%)' }}
        >
          <span className="block truncate">{watermarkText}</span>
        </div>
      )}
      {error && <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}
    </div>
  );
}
