import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { apiStartVideoPlayback, apiSaveWatchProgress, apiGetWatchProgress, type WatchSegment } from '../../api/contentBlocks';
import { getApiBaseUrl } from '../../api/baseUrl';
import { useAuthStore } from '../../stores/authStore';

interface HlsVideoPlayerProps {
  blockId: string;
  watermark?: boolean;
}

function extractWatermarkPhone(phone?: string | null) {
  const rawPhone = phone?.replace(/\D/g, '') ?? '';
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
  const [liveRange, setLiveRange] = useState<WatchSegment | null>(null);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [progressOpen, setProgressOpen] = useState(true);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);

  const watermarkText = extractWatermarkPhone(admin?.phone);

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
    watchedSegmentsRef.current = watchedSegments;
  }, [watchedSegments]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    function closeCurrentRange() {
      const range = currentRangeRef.current;
      if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
        void apiSaveWatchProgress(blockId, Math.floor(range.start), Math.floor(range.end)).then((data) => {
          setWatchedPercent(data.watchedPercent);
          setWatchedSegments(data.segments);
          setLiveRange(null);
        });
        lastSavedEndRef.current = range.end;
      } else {
        setLiveRange(null);
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

      // Show live progress immediately (not just after the periodic save),
      // by extending a single "in-progress" segment with a stable key
      // instead of rebuilding the whole segments array on every tick — this
      // is what keeps the strip animating smoothly instead of flickering.
      const inProgress = currentRangeRef.current;
      const liveSegment = { startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end) };
      setLiveRange(liveSegment);
      if (video.duration && isFinite(video.duration)) {
        const nonOverlapping = watchedSegmentsRef.current.filter(
          (s) => s.endSec < liveSegment.startSec - 2 || s.startSec > liveSegment.endSec + 2,
        );
        const totalCovered =
          nonOverlapping.reduce((sum, s) => sum + (s.endSec - s.startSec), 0) +
          (liveSegment.endSec - liveSegment.startSec);
        setWatchedPercent(Math.min(100, Math.round((totalCovered / video.duration) * 100)));
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
        <button
          type="button"
          onClick={() => setProgressOpen((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-medium text-gray-500"
        >
          <span className="inline-flex items-center gap-1">
            Mening video ko'rishim
            {progressOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
          {watchedPercent !== null && <span>{watchedPercent}% ko'rilgan</span>}
        </button>
        {progressOpen && (
          <div className="video-watch-progress-track relative mt-2 h-2.5 w-full overflow-hidden rounded-full">
            {watchedSegments
              .filter(
                (s) => !liveRange || s.endSec < liveRange.startSec - 2 || s.startSec > liveRange.endSec + 2,
              )
              .map((seg) => (
                <div
                  key={`${seg.startSec}-${seg.endSec}`}
                  className="video-watch-progress-fill absolute h-full rounded-full transition-[left,width] duration-300 ease-out"
                  style={{
                    left: `${(seg.startSec / videoDuration) * 100}%`,
                    width: `${((seg.endSec - seg.startSec) / videoDuration) * 100}%`,
                  }}
                />
              ))}
            {liveRange && (
              <div
                key="live"
                className="video-watch-progress-fill absolute h-full rounded-full transition-[left,width] duration-300 ease-out"
                style={{
                  left: `${(liveRange.startSec / videoDuration) * 100}%`,
                  width: `${((liveRange.endSec - liveRange.startSec) / videoDuration) * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>
    )}
    </>
  );
}
