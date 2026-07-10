import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Maximize2, Minimize2 } from 'lucide-react';
import { apiStartVideoPlayback, apiSaveWatchProgress, apiGetWatchProgress, type WatchSegment } from '../../api/contentBlocks';
import { getApiBaseUrl } from '../../api/baseUrl';
import { useAuthStore } from '../../stores/authStore';

interface HlsVideoPlayerProps {
  blockId: string;
  watermark?: boolean;
}

function extractWatermarkPhone(phone?: string | null, email?: string | null) {
  const fromPhone = phone?.replace(/\D/g, '') ?? '';
  const rawPhone = fromPhone.length >= 7 ? fromPhone : (email?.match(/\d{7,}/)?.[0] ?? '');
  if (!rawPhone) return '';

  const withoutCountryCode = rawPhone.startsWith('998') ? rawPhone.slice(3) : rawPhone;
  return btoa(withoutCountryCode);
}

function quietWatermarkPosition() {
  const leftZones = [14 + Math.random() * 14, 72 + Math.random() * 14];
  const topZones = [18 + Math.random() * 12, 68 + Math.random() * 14];

  return {
    left: Math.round(leftZones[Math.floor(Math.random() * leftZones.length)]),
    top: Math.round(topZones[Math.floor(Math.random() * topZones.length)]),
  };
}

export function HlsVideoPlayer({ blockId, watermark = false }: HlsVideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const admin = useAuthStore((s) => s.admin);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const watermarkText = extractWatermarkPhone(admin?.phone, admin?.email);

  useEffect(() => {
    const syncFullscreen = () => {
      const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const fullscreenElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement;
      setIsFullscreen(fullscreenElement === wrapperRef.current);
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

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
    let cancelled = false;
    apiGetWatchProgress(blockId).then((data) => {
      if (cancelled) return;
      setWatchedSegments(data.segments);
      setWatchedPercent(data.watchedPercent);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    function closeCurrentRange() {
      const range = currentRangeRef.current;
      if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
        void apiSaveWatchProgress(blockId, Math.floor(range.start), Math.floor(range.end)).then((data) => {
          setWatchedPercent(data.watchedPercent);
        });
        lastSavedEndRef.current = range.end;
      }
    }

    function handleTimeUpdate() {
      if (!video) return;
      const current = video.currentTime;
      const jumped = Math.abs(current - lastTimeRef.current) > 2;
      lastTimeRef.current = current;

      if (jumped || !currentRangeRef.current) {
        closeCurrentRange();
        currentRangeRef.current = { start: current, end: current };
        lastSavedEndRef.current = 0;
      } else {
        currentRangeRef.current.end = current;
      }
    }

    function handleLoadedMetadata() {
      if (video && !isNaN(video.duration) && isFinite(video.duration)) {
        setVideoDuration(video.duration);
      }
    }

    const saveInterval = setInterval(() => {
      if (!video.paused) closeCurrentRange();
    }, 7000);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('pause', closeCurrentRange);
    video.addEventListener('ended', closeCurrentRange);

    return () => {
      clearInterval(saveInterval);
      closeCurrentRange();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('pause', closeCurrentRange);
      video.removeEventListener('ended', closeCurrentRange);
    };
  }, [blockId]);

  useEffect(() => {
    if (!watermark || !watermarkText) return undefined;

    let visibleTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;

    const show = () => {
      setMarkVisible(true);
      visibleTimer = setTimeout(() => {
        setMarkVisible(false);
        moveTimer = setTimeout(() => {
          setMarkPosition(quietWatermarkPosition());
          hiddenTimer = setTimeout(show, 9000 + Math.random() * 4000);
        }, 800);
      }, 3000);
    };

    hiddenTimer = setTimeout(show, 2500);

    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (moveTimer) clearTimeout(moveTimer);
    };
  }, [watermark, watermarkText]);

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const fullscreenDocument = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (fullscreenDocument.webkitExitFullscreen && fullscreenDocument.fullscreenElement) {
        await fullscreenDocument.webkitExitFullscreen();
        return;
      }

      if (wrapper?.requestFullscreen) {
        await wrapper.requestFullscreen();
        return;
      }

      await wrapper?.webkitRequestFullscreen?.();
    } catch {
      setError('Fullscreen ochilmadi');
    }
  };

  return (
    <>
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden bg-black ${
        isFullscreen
          ? 'flex h-[100dvh] w-[100dvw] items-center justify-center rounded-none'
          : 'rounded-2xl'
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <video
        ref={videoRef}
        controls
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        playsInline
        className={isFullscreen ? 'h-[100dvh] w-[100dvw] object-contain' : 'aspect-video w-full'}
      />
      {watermark && watermarkText && (
        <div
          className={`pointer-events-none absolute z-10 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-white/55 transition-opacity duration-700 ${
            markVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: `${markPosition.left}%`,
            top: `${markPosition.top}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span className="block truncate">{watermarkText}</span>
        </div>
      )}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white"
        aria-label={isFullscreen ? 'Fullscreenni yopish' : 'Fullscreen ochish'}
      >
        {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
      {error && <div className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-500">{error}</div>}
    </div>
    {videoDuration !== null && videoDuration > 0 && !isFullscreen && (
      <div className="mt-2">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          {watchedSegments.map((seg, i) => (
            <div
              key={i}
              className="absolute h-full rounded-full bg-indigo-400"
              style={{
                left: `${(seg.startSec / videoDuration) * 100}%`,
                width: `${((seg.endSec - seg.startSec) / videoDuration) * 100}%`,
              }}
            />
          ))}
        </div>
        {watchedPercent !== null && (
          <p className="mt-1 text-xs text-gray-400">{watchedPercent}% ko'rilgan</p>
        )}
      </div>
    )}
    </>
  );
}
