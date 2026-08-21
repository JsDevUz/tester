import { useCallback, useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import {
  Captions,
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import {
  apiStartVideoPlayback,
  apiSaveWatchProgress,
  apiGetWatchProgress,
  type WatchSegment,
} from '../../api/contentBlocks';
import { getApiBaseUrl } from '../../api/baseUrl';
import { useAuthStore } from '../../stores/authStore';

interface HlsVideoPlayerProps {
  blockId: string;
  watermark?: boolean;
  /**
   * Start playing as soon as the stream is ready.
   *
   * Set when the player was mounted BY a play press (see LazyVideoPlayer): the viewer has
   * already said they want to watch, so asking them to press play a second time -- once for
   * the poster, once for the player -- is a step that should not exist.
   */
  autoPlay?: boolean;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function extractWatermarkPhone(phone?: string | null) {
  const rawPhone = phone?.replace(/\D/g, '') ?? '';
  if (!rawPhone) return '';

  const withoutCountryCode = rawPhone.startsWith('998') ? rawPhone.slice(3) : rawPhone;
  return btoa(withoutCountryCode);
}

function computeTotalWatchedSeconds(segments: WatchSegment[], live: WatchSegment | null): number {
  const all: WatchSegment[] = segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
  if (live && live.endSec > live.startSec) {
    all.push({ startSec: live.startSec, endSec: live.endSec });
  }
  if (all.length === 0) return 0;

  all.sort((a, b) => a.startSec - b.startSec);

  const merged: WatchSegment[] = [{ startSec: all[0].startSec, endSec: all[0].endSec }];
  for (let i = 1; i < all.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = all[i];
    if (curr.startSec <= prev.endSec) {
      prev.endSec = Math.max(prev.endSec, curr.endSec);
    } else {
      merged.push({ startSec: curr.startSec, endSec: curr.endSec });
    }
  }

  return merged.reduce((sum, s) => sum + Math.max(0, s.endSec - s.startSec), 0);
}

function quietWatermarkPosition() {
  const leftZones = [14 + Math.random() * 14, 70 + Math.random() * 14];
  const topZones = [16 + Math.random() * 14, 66 + Math.random() * 14];

  return {
    left: Math.round(leftZones[Math.floor(Math.random() * leftZones.length)]),
    top: Math.round(topZones[Math.floor(Math.random() * topZones.length)]),
  };
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function parseTime(timeStr: string): number {
  const cleanStr = timeStr.trim().replace(',', '.');
  const parts = cleanStr.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(cleanStr) || 0;
}

function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endPart] = line.split('-->');
      const start = parseTime(startStr);
      const end = parseTime(endPart.trim().split(/\s+/)[0]);
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const cleanText = lines[i].replace(/<[^>]*>/g, '').trim();
        if (cleanText) textLines.push(cleanText);
        i++;
      }
      if (textLines.length > 0 && !isNaN(start) && !isNaN(end) && end > start) {
        cues.push({
          start,
          end,
          text: textLines.join('\n'),
        });
      }
    }
    i++;
  }
  return cues;
}

export function HlsVideoPlayer({ blockId, watermark = false, autoPlay = false }: HlsVideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const admin = useAuthStore((s) => s.admin);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverScrubTime, setHoverScrubTime] = useState<number | null>(null);
  const [hoverScrubX, setHoverScrubX] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [doubleTapAnimation, setDoubleTapAnimation] = useState<'left' | 'right' | null>(null);

  // Subtitles
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Watermark
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
  const [videoContentBox, setVideoContentBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Progress Tracking
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [liveRange, setLiveRange] = useState<WatchSegment | null>(null);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [progressOpen, setProgressOpen] = useState(true);

  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);
  const isPlayingRef = useRef(false);

  const watermarkText = extractWatermarkPhone(admin?.phone);

  // Controls Visibility Timer
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlayingRef.current) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        setSpeedMenuOpen(false);
      }, 3500);
    }
  }, []);

  const hideControlsNow = useCallback(() => {
    if (isPlayingRef.current && !speedMenuOpen) {
      setControlsVisible(false);
    }
  }, [speedMenuOpen]);

  // Sync isPlayingRef
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      showControls();
    } else {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isPlaying, showControls]);

  // Video box resize observer for watermark positioning
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    if (!wrapper || !video) return;

    const updateContentBox = () => {
      const wrapperWidth = wrapper.clientWidth;
      const wrapperHeight = wrapper.clientHeight;
      if (!wrapperWidth || !wrapperHeight || !video.videoWidth || !video.videoHeight) {
        setVideoContentBox(null);
        return;
      }
      const scale = Math.min(wrapperWidth / video.videoWidth, wrapperHeight / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      setVideoContentBox({
        left: (wrapperWidth - width) / 2,
        top: (wrapperHeight - height) / 2,
        width,
        height,
      });
    };

    video.addEventListener('loadedmetadata', updateContentBox);
    const observer = new ResizeObserver(updateContentBox);
    observer.observe(wrapper);
    updateContentBox();

    return () => {
      video.removeEventListener('loadedmetadata', updateContentBox);
      observer.disconnect();
    };
  }, [blockId, isFullscreen]);

  // Prevent iOS native fullscreen takeover
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;

    if (!video) return;

    video.playsInline = true;

    const preventNativeFullscreen = (e: Event) => {
      e.preventDefault();
      if (video.webkitDisplayingFullscreen) {
        video.webkitExitFullscreen?.();
      }
      setIsFullscreen(true);
    };

    video.addEventListener('webkitbeginfullscreen', preventNativeFullscreen);

    return () => {
      video.removeEventListener('webkitbeginfullscreen', preventNativeFullscreen);
    };
  }, []);

  // Sync fullscreen change with document Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
      );
      if (!isDocFs && isFullscreen && !isIOS()) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  // Fullscreen body overflow locking
  useEffect(() => {
    if (!isFullscreen) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isFullscreen]);

  // Fetch and parse Subtitles directly without CORS preflight failures
  useEffect(() => {
    if (!subtitleUrl) {
      setSubtitleCues([]);
      return;
    }

    let cancelled = false;
    const fullUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `${getApiBaseUrl()}${subtitleUrl}`;

    fetch(fullUrl)
      .then((res) => {
        if (res.ok) return res.text();
        const token = localStorage.getItem('token');
        if (token) {
          return fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
            r.ok ? r.text() : Promise.reject(new Error('Subtitle fetch error')),
          );
        }
        return Promise.reject(new Error('Subtitle fetch failed'));
      })
      .then((text) => {
        if (cancelled) return;
        const cues = parseSubtitles(text);
        setSubtitleCues(cues);
      })
      .catch((err) => {
        console.warn('Failed to load subtitle file:', err);
        if (!cancelled) setSubtitleCues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl]);

  // HLS Loader Setup
  useEffect(() => {
    let hls: HlsType | null = null;
    let cancelled = false;

    async function boot() {
      try {
        setError(null);
        setIsBuffering(true);
        const playback = await apiStartVideoPlayback(blockId);
        if (cancelled || !videoRef.current) return;

        setSubtitleUrl(playback.subtitleUrl);
        const manifestUrl = `${getApiBaseUrl()}${playback.manifestUrl}`;

        // Loaded on demand rather than with the course page: hls.js is ~130KB gzipped and
        // most page views never open a video.
        const { default: Hls } = await import('hls.js');
        if (cancelled || !videoRef.current) return;

        if (Hls.isSupported()) {
          hls = new Hls({
            capLevelToPlayerSize: true,
            autoStartLoad: true,
            // Defaults buffer far more than a lesson needs, which delays the first frame and
            // wastes the student's data if they move on. These keep enough ahead to ride out
            // a wobble without hoarding.
            maxBufferLength: 15,
            maxMaxBufferLength: 30,
            backBufferLength: 30,
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls?.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls?.recoverMediaError();
                  break;
                default:
                  setError('Videoni yuklashda xatolik yuz berdi');
                  break;
              }
            }
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsBuffering(false);
            // A blocked autoplay is not an error here: the poster press counts as a gesture in
            // every current browser, and if one refuses the viewer just presses play.
            if (autoPlay) void videoRef.current?.play().catch(() => {});
          });

          hls.loadSource(manifestUrl);
          hls.attachMedia(videoRef.current);
          return;
        }

        // Native Safari HLS playback fallback (iOS Safari)
        if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = manifestUrl;
          videoRef.current.load();
          setIsBuffering(false);
          if (autoPlay) void videoRef.current.play().catch(() => {});
          return;
        }

        setIsBuffering(false);
        setError('Bu brauzer HLS videoni qo‘llab-quvvatlamaydi');
      } catch {
        if (!cancelled) {
          setIsBuffering(false);
          setError('Video hozircha ochilmadi');
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [blockId]);

  // Watch progress loader
  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId)
      .then((data) => {
        if (cancelled) return;
        setWatchedSegments(data.segments);
        setWatchedPercent(data.watchedPercent);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    watchedSegmentsRef.current = watchedSegments;
  }, [watchedSegments]);

  // Video playback time & progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function closeCurrentRange() {
      const range = currentRangeRef.current;
      if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
        const dur = video && video.duration && isFinite(video.duration) ? Math.round(video.duration) : undefined;
        void apiSaveWatchProgress(blockId, Math.floor(range.start), Math.floor(range.end), dur).then((data) => {
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
      setCurrentTime(current);

      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= current && current <= video.buffered.end(i)) {
            setBufferedEnd(video.buffered.end(i));
            break;
          }
        }
      }

      const jumped = Math.abs(current - lastTimeRef.current) > 2;
      lastTimeRef.current = current;

      if (jumped || !currentRangeRef.current) {
        closeCurrentRange();
        currentRangeRef.current = { start: current, end: current };
        lastSavedEndRef.current = 0;
      } else {
        currentRangeRef.current.end = current;
      }

      const inProgress = currentRangeRef.current;
      const liveSegment = { startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end) };
      setLiveRange(liveSegment);
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        const totalCovered = computeTotalWatchedSeconds(watchedSegmentsRef.current, liveSegment);
        setWatchedPercent(Math.min(100, Math.round((totalCovered / video.duration) * 100)));
      }
    }

    function handleDurationChange() {
      if (video && !isNaN(video.duration) && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    }

    function handlePlay() {
      setIsPlaying(true);
      setIsBuffering(false);
    }

    function handlePause() {
      setIsPlaying(false);
      closeCurrentRange();
    }

    function handleWaiting() {
      setIsBuffering(true);
    }

    function handlePlaying() {
      setIsPlaying(true);
      setIsBuffering(false);
    }

    function handleCanPlay() {
      setIsBuffering(false);
    }

    const saveInterval = setInterval(() => {
      if (!video.paused) closeCurrentRange();
    }, 7000);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('loadedmetadata', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleCanPlay);
    video.addEventListener('ended', closeCurrentRange);

    return () => {
      clearInterval(saveInterval);
      closeCurrentRange();
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('loadedmetadata', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleCanPlay);
      video.removeEventListener('ended', closeCurrentRange);
    };
  }, [blockId]);

  // Watermark timer
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
          hiddenTimer = setTimeout(show, 5000 + Math.random() * 3000);
        }, 800);
      }, 6000);
    };

    show();

    return () => {
      if (visibleTimer) clearTimeout(visibleTimer);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (moveTimer) clearTimeout(moveTimer);
    };
  }, [watermark, watermarkText]);

  // Direct Play/Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
          })
          .catch((err) => {
            console.warn('Video play error:', err);
          });
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
    video.currentTime = target;
    setCurrentTime(target);
    showControls();
  }, [showControls]);

  const handleSeek = useCallback((targetTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    const validTime = Math.max(0, Math.min(video.duration || 0, targetTime));
    video.currentTime = validTime;
    setCurrentTime(validTime);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 1;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleVolumeChange = useCallback((newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    video.volume = clamped;
    setVolume(clamped);
    if (clamped === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  }, [isMuted]);

  const handleSpeedSelect = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setSpeedMenuOpen(false);
    showControls();
  }, [showControls]);

  // Custom Fullscreen Toggle
  const toggleFullscreen = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    try {
      if (isFullscreen) {
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      } else {
        if (wrapper.requestFullscreen && !isIOS()) {
          try {
            await wrapper.requestFullscreen();
          } catch {
            // Fallback to CSS fullscreen
          }
        }
        setIsFullscreen(true);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  }, [isFullscreen]);

  // Scrubber Pointer Handlers
  const handleScrubberPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;

    setHoverScrubX(pos * 100);
    setHoverScrubTime(target);

    if (isScrubbing || e.type === 'pointerdown') {
      handleSeek(target);
    }
  }, [duration, handleSeek, isScrubbing]);

  const handleScrubberDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsScrubbing(true);
    handleScrubberPointer(e);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const bar = progressBarRef.current;
      if (!bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const target = pos * duration;
      setHoverScrubX(pos * 100);
      setHoverScrubTime(target);
      handleSeek(target);
    };

    const onPointerUp = () => {
      setIsScrubbing(false);
      setHoverScrubTime(null);
      setHoverScrubX(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [duration, handleScrubberPointer, handleSeek]);

  // Screen tap handling
  const handleScreenTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const widthRatio = clickX / rect.width;
    const now = Date.now();

    if (now - lastTapRef.current.time < 300 && Math.abs(clickX - lastTapRef.current.x) < 80) {
      lastTapRef.current.time = 0;
      if (widthRatio < 0.35) {
        seekRelative(-10);
        setDoubleTapAnimation('left');
        setTimeout(() => setDoubleTapAnimation(null), 600);
        return;
      }
      if (widthRatio > 0.65) {
        seekRelative(10);
        setDoubleTapAnimation('right');
        setTimeout(() => setDoubleTapAnimation(null), 600);
        return;
      }
    }

    lastTapRef.current = { time: now, x: clickX };

    if (!isPlaying) {
      togglePlay();
    } else {
      setControlsVisible((v) => !v);
    }
  }, [isPlaying, seekRelative, togglePlay]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      // Shortcuts are fullscreen-only. Inline, the player is one element among many on a
      // lesson page -- Space would scroll, arrows would move the page -- and a lesson can hold
      // several video blocks, each with this same listener, so one keypress would drive all of
      // them at once. Fullscreen makes the intended target unambiguous.
      if (!isFullscreen) return;

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleVolumeChange(volume + 0.1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleVolumeChange(volume - 0.1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if (subtitleUrl) setCaptionsOn((v) => !v);
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleVolumeChange, isFullscreen, seekRelative, subtitleUrl, toggleFullscreen, toggleMute, togglePlay, volume]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const renderedMarkPosition = isFullscreen
    ? { left: Math.max(18, Math.min(82, markPosition.left)), top: 58 + (markPosition.top / 100) * 22 }
    : markPosition;

  const activeCue = captionsOn
    ? subtitleCues.find((cue) => currentTime >= cue.start && currentTime <= cue.end)
    : null;

  return (
    <>
      <div
        ref={wrapperRef}
        className={`group/player bg-black select-none overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? '!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 z-[9999999] flex h-screen h-[100dvh] w-screen max-h-[100dvh] items-center justify-center rounded-none m-0'
            : 'relative aspect-video w-full rounded-2xl'
        }`}
        data-yandex-video-player="false"
        data-yandex-ignore="true"
        data-yandex-subtitle="disabled"
        onMouseMove={showControls}
        onMouseLeave={hideControlsNow}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Core Video Element */}
        <video
          ref={videoRef}
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          disablePictureInPicture
          disableRemotePlayback
          preload="auto"
          controlsList="nodownload nofullscreen noremoteplayback"
          data-yandex-video-player="false"
          data-yandex-ignore="true"
          data-yandex-subtitles-disable="true"
          data-disable-pip="true"
          className={`pointer-events-none h-full w-full object-contain ${isFullscreen ? 'h-full w-full' : 'rounded-2xl'}`}
        />

        {/* Double-tap Ripple Feedback on Mobile */}
        {doubleTapAnimation === 'left' && (
          <div className="pointer-events-none absolute left-8 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/80 px-4 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur animate-ping">
            <RotateCcw size={16} /> -10s
          </div>
        )}
        {doubleTapAnimation === 'right' && (
          <div className="pointer-events-none absolute right-8 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/80 px-4 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur animate-ping">
            +10s <RotateCw size={16} />
          </div>
        )}

        {/* Tap/Click Gestures Overlay */}
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={handleScreenTap}
        />

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 z-25 flex items-center justify-center bg-black/30">
            <Loader2 size={44} className="animate-spin text-white drop-shadow-md" />
          </div>
        )}

        {/* Custom Native-Style Subtitle Overlay */}
        {captionsOn && activeCue && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-35 flex justify-center px-4 transition-all duration-200 ${
              controlsVisible ? 'bottom-12 sm:bottom-14' : 'bottom-2 sm:bottom-3'
            }`}
          >
            <span
              className="inline-block max-w-[92%] rounded-md bg-black/80 px-2.5 py-0.5 text-[11px] sm:text-[13px] font-medium leading-snug text-white shadow-md backdrop-blur-sm whitespace-pre-line text-center"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >
              {activeCue.text}
            </span>
          </div>
        )}

        {/* Floating Anti-Piracy Watermark */}
        {watermark && watermarkText && (
          <div
            className={`pointer-events-none absolute z-20 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white/55 transition-opacity duration-700 select-none ${
              markVisible ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              left: videoContentBox
                ? `${videoContentBox.left + (videoContentBox.width * renderedMarkPosition.left) / 100}px`
                : `${renderedMarkPosition.left}%`,
              top: videoContentBox
                ? `${videoContentBox.top + (videoContentBox.height * renderedMarkPosition.top) / 100}px`
                : `${renderedMarkPosition.top}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="block truncate">{watermarkText}</span>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4 text-center">
            <div className="max-w-sm rounded-xl bg-red-950/80 p-4 text-sm font-medium text-red-200 border border-red-800/50">
              {error}
            </div>
          </div>
        )}

        {/* Center Play/Pause & Skip Overlay (White Icons) */}
        <div
          className={`pointer-events-none absolute inset-0 z-25 flex items-center justify-center gap-6 transition-opacity duration-200 ${
            controlsVisible || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              seekRelative(-10);
            }}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/80 active:scale-95 sm:h-12 sm:w-12 border border-white/10"
            aria-label="10 soniya orqaga"
          >
            <RotateCcw size={20} className="text-white" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/65 text-white shadow-2xl backdrop-blur transition hover:scale-110 hover:bg-black/85 active:scale-95 sm:h-16 sm:w-16 border border-white/25"
            aria-label={isPlaying ? 'Pauza' : 'Ijro etish'}
          >
            {isPlaying ? (
              <Pause size={28} className="fill-white text-white" />
            ) : (
              <Play size={28} className="ml-1 fill-white text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              seekRelative(10);
            }}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/80 active:scale-95 sm:h-12 sm:w-12 border border-white/10"
            aria-label="10 soniya oldinga"
          >
            <RotateCw size={20} className="text-white" />
          </button>
        </div>

        {/* Top Header Controls */}
        <div
          className={`absolute left-0 right-0 top-0 z-30 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-200 ${
            controlsVisible || !isPlaying ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {isFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-95"
              aria-label="To'liq ekrandan chiqish"
            >
              <X size={18} />
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {subtitleUrl && (
              <button
                type="button"
                onClick={() => setCaptionsOn((v) => !v)}
                className={`flex h-8 px-2.5 items-center gap-1.5 rounded-lg text-xs font-semibold backdrop-blur transition text-white ${
                  captionsOn
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md border border-indigo-400/40'
                    : 'bg-black/60 hover:bg-black/80'
                }`}
                aria-label="Subtitr"
              >
                <Captions size={15} className="text-white" />
                <span className="text-white">Subtitr</span>
              </button>
            )}

            {/* Playback Speed Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSpeedMenuOpen((v) => !v)}
                className="flex h-8 px-2.5 items-center rounded-lg bg-black/60 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80"
                aria-label="Tezlik"
              >
                {playbackSpeed}x
              </button>

              {speedMenuOpen && (
                <div className="absolute right-0 top-10 z-50 flex flex-col rounded-xl bg-gray-900/95 p-1 text-xs font-medium text-white shadow-2xl backdrop-blur border border-white/10">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => handleSpeedSelect(speed)}
                      className={`flex items-center justify-between rounded-lg px-3 py-1.5 transition ${
                        playbackSpeed === speed ? 'bg-indigo-600 font-bold text-white' : 'hover:bg-white/10 text-gray-300'
                      }`}
                    >
                      <span>{speed}x</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition hover:bg-black/80 active:scale-95"
              aria-label={isFullscreen ? 'Kichik ekran' : 'To‘liq ekran'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Compact Bottom Control Bar */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-30 flex flex-col gap-1.5 px-4 pb-3 pt-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-200 ${
            controlsVisible || !isPlaying ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Time Info above Progress Bar on the Right */}
          <div className="flex justify-end pr-0.5">
            <div className="text-[11px] font-semibold tabular-nums text-white/90 drop-shadow-sm">
              {formatTime(currentTime)} <span className="text-white/50">/</span> {formatTime(duration)}
            </div>
          </div>

          {/* Custom Interactive Scrubber / Progress Bar */}
          <div
            ref={progressBarRef}
            className="group/track relative flex h-4 w-full cursor-pointer touch-none items-center"
            onPointerDown={handleScrubberDown}
            onPointerMove={handleScrubberPointer}
            onPointerLeave={() => {
              if (!isScrubbing) {
                setHoverScrubTime(null);
                setHoverScrubX(null);
              }
            }}
          >
            {/* Scrubber Base Track */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/track:h-2">
              {/* Buffered Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-white/35 rounded-full transition-[width]"
                style={{ width: `${bufferPercent}%` }}
              />
              {/* Played Fill */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-indigo-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Thumb Handle (White Dot) */}
            <div
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-md transition-transform group-hover/track:scale-125 border border-black/20"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Scrubber Tooltip */}
            {hoverScrubTime !== null && hoverScrubX !== null && (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-gray-900/90 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur"
                style={{ left: `${hoverScrubX}%` }}
              >
                {formatTime(hoverScrubTime)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress tracking summary below the player */}
      {duration > 0 && !isFullscreen && (
        <div className="mt-2.5">
          {(() => {
            const dynamicPercent =
              duration > 0 && isFinite(duration)
                ? Math.min(100, Math.round((computeTotalWatchedSeconds(watchedSegments, liveRange) / duration) * 100))
                : watchedPercent;

            return (
              <>
                <button
                  type="button"
                  onClick={() => setProgressOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-gray-500 hover:text-gray-700 transition"
                >
                  <span className="inline-flex items-center gap-1.5">
                    Mening video ko'rishim
                    {progressOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                  {dynamicPercent !== null && (
                    <span className="text-indigo-600 font-bold">{dynamicPercent}% ko'rilgan</span>
                  )}
                </button>
                {progressOpen && (
                  <div className="video-watch-progress-track relative mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    {watchedSegments.map((seg) => (
                      <div
                        key={`${seg.startSec}-${seg.endSec}`}
                        className="video-watch-progress-fill absolute h-full rounded-full transition-[left,width] duration-200 ease-out bg-indigo-600"
                        style={{
                          left: `${Math.min(100, Math.max(0, (seg.startSec / duration) * 100))}%`,
                          width: `${Math.min(100, Math.max(0.5, ((seg.endSec - seg.startSec) / duration) * 100))}%`,
                        }}
                      />
                    ))}
                    {liveRange && liveRange.endSec > liveRange.startSec && (
                      <div
                        key="live"
                        className="video-watch-progress-fill absolute h-full rounded-full transition-[left,width] duration-200 ease-out bg-indigo-500"
                        style={{
                          left: `${Math.min(100, Math.max(0, (liveRange.startSec / duration) * 100))}%`,
                          width: `${Math.min(100, Math.max(0.5, ((liveRange.endSec - liveRange.startSec) / duration) * 100))}%`,
                        }}
                      />
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
