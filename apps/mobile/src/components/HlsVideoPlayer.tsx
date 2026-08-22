import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type VideoRef,
} from 'react-native-video';
import {
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  DownloadCloud,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { apiGetWatchProgress, apiSaveWatchProgress, apiStartVideoPlayback, type WatchSegment } from '../api/videos';
import { API_URL } from '../config/env';
import { disableSecureScreen, enableSecureScreen } from '../lib/secureScreen';
import { useNetwork } from '../providers/NetworkProvider';
import { useAuthStore } from '../store/authStore';
import { useOfflineVideoStore } from '../store/offlineVideoStore';
import { getOfflineVideoMeta, isOfflineVideoComplete } from '../lib/offlineVideoService';
import { useActiveVideoStore, type PlaceholderRect } from '../store/activeVideoStore';

const API_BASE = API_URL.replace(/\/$/, '');

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Speeds the rate button cycles through, in order. */
const PLAYBACK_RATES: number[] = [1, 1.25, 1.5, 1.75, 2];

/** iOS cannot play the files the downloader writes (AVFoundation refuses both the rewritten
 *  playlist and a merged .ts -- see offlineVideoService), so downloading there only burns
 *  storage for a badge that can never deliver offline playback. */
const DOWNLOADS_SUPPORTED = Platform.OS === 'android';

/** "7,2 MB" -- comma decimal separator, matching the rest of the Uzbek UI. */
function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function base64Encode(input: string): string {
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    const triplet = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    output += BASE64_CHARS[(triplet >> 18) & 0x3f];
    output += BASE64_CHARS[(triplet >> 12) & 0x3f];
    output += isNaN(b) ? '=' : BASE64_CHARS[(triplet >> 6) & 0x3f];
    output += isNaN(c) ? '=' : BASE64_CHARS[triplet & 0x3f];
  }
  return output;
}

function extractWatermarkPhone(phone?: string | null): string {
  const rawPhone = phone?.replace(/\D/g, '') ?? '';
  if (!rawPhone) return '';
  const withoutCountryCode = rawPhone.startsWith('998') ? rawPhone.slice(3) : rawPhone;
  return base64Encode(withoutCountryCode);
}

function computeTotalWatchedSeconds(segments: WatchSegment[], live: WatchSegment | null): number {
  const all: WatchSegment[] = segments.map(s => ({ startSec: s.startSec, endSec: s.endSec }));
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
  const leftZones = [14 + Math.random() * 14, 72 + Math.random() * 14];
  const topZones = [18 + Math.random() * 12, 68 + Math.random() * 14];
  return {
    left: leftZones[Math.floor(Math.random() * leftZones.length)],
    top: topZones[Math.floor(Math.random() * topZones.length)],
  };
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

export function HlsVideoPlayer({
  blockId,
  watermark = true,
  title,
  lessonId,
  lessonTitle,
  courseId,
  courseTitle,
  schoolId,
  autoPlay = false,
  rect,
}: {
  blockId: string;
  watermark?: boolean;
  title?: string;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  courseTitle?: string;
  schoolId?: string;
  /**
   * Start playing immediately. Set when the player was mounted by a play press (see
   * LazyVideoPlayer) -- the viewer already asked to watch, so a second press is a step that
   * should not exist.
   */
  autoPlay?: boolean;
  /**
   * The on-screen rect (from the lesson's placeholder) this player should sit on top of
   * when not fullscreen. Null for one frame before the placeholder's first layout lands.
   */
  rect: PlaceholderRect | null;
}) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [error, setError] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [markVisible, setMarkVisible] = useState(false);
  const [markPosition, setMarkPosition] = useState(() => quietWatermarkPosition());
  const [watchedSegments, setWatchedSegments] = useState<WatchSegment[]>([]);
  const [watchedPercent, setWatchedPercent] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(!autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  // How far the player has buffered ahead, drawn as the lighter track behind the played
  // portion so the bar shows what is ready to watch, Telegram-style.
  const [playableDuration, setPlayableDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationRef = useRef<number | null>(null);
  const barWidthRef = useRef(0);
  const currentTimeRef = useRef(0);
  const resumeTimeRef = useRef(0);
  /** Target of a seek still settling, and when it was issued; see seekTo and handleProgress. */
  const pendingSeekRef = useRef<number | null>(null);
  const seekStartedAtRef = useRef(0);
  const [progressOpen, setProgressOpen] = useState(false);
  const isFullscreen = useActiveVideoStore(s => s.isFullscreen);
  const setIsFullscreen = useActiveVideoStore(s => s.setIsFullscreen);
  const setActiveBlockId = useActiveVideoStore(s => s.setActiveBlockId);
  const wrapperRef = useRef<View>(null);

  const [isBuffering, setIsBuffering] = useState(false);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const {
    registry,
    activeDownloads,
    startDownload,
    removeDownload,
    loadRegistry,
  } = useOfflineVideoStore();

  // A registry entry exists from the FIRST segment onwards -- it is written progressively so
  // an interrupted download stays playable. Treating its mere presence as "downloaded" showed
  // a completed badge over a partial copy, which is how a 76-minute lesson could sit there
  // claiming to be saved with only 52 minutes on disk.
  const isDownloaded = isOfflineVideoComplete(registry[blockId]);
  const activeDownload = activeDownloads[blockId];
  const isDownloading = activeDownload?.status === 'downloading';
  const downloadProgress = activeDownload?.progress ?? 0;
  const downloadedBytes = activeDownload?.downloadedBytes ?? 0;
  const estimatedBytes = activeDownload?.totalBytes ?? 0;
  const downloadedSizeLabel = registry[blockId]?.totalBytes
    ? formatMegabytes(registry[blockId].totalBytes)
    : null;

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const renderedMarkPosition = isFullscreen
    ? isLandscape
      ? {
        left: Math.max(12, Math.min(80, markPosition.left)),
        top: Math.max(12, Math.min(80, markPosition.top)),
      }
      : {
        left: Math.max(15, Math.min(75, markPosition.left)),
        top: 38 + (markPosition.top / 100) * 22,
      }
    : {
      left: Math.max(10, Math.min(75, markPosition.left)),
      top: Math.max(15, Math.min(70, markPosition.top)),
    };
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const token = useAuthStore(s => s.token);
  const userPhone = useAuthStore(s => s.user?.phone);
  const watermarkText = watermark ? extractWatermarkPhone(userPhone) : '';

  const videoRef = useRef<VideoRef>(null);
  const currentRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastSavedEndRef = useRef(0);
  const lastTimeRef = useRef(0);
  const watchedSegmentsRef = useRef<WatchSegment[]>([]);
  /** When the watched-percent was last recomputed; see handleProgress. */
  const lastPercentCalcRef = useRef(0);

  useEffect(() => {
    enableSecureScreen();
    return () => disableSecureScreen();
  }, []);

  useEffect(() => {
    StatusBar.setHidden(isFullscreen, 'fade');
    return () => StatusBar.setHidden(false, 'fade');
  }, [isFullscreen]);

  // Connectivity comes from the provider rather than a probe of our own: opening a video
  // while already known-offline should go straight to the local copy instead of burning a
  // request timeout first. The resolver stays stable (blockId only) so a connectivity flap
  // can never remount the <Video> mid-playback -- reads go through a ref, and recovery is
  // handled by the dedicated effect below.
  const {online} = useNetwork();
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const loadPlayback = useCallback(async () => {
    setManifestUrl(null);
    setError(false);
    setIsOfflineMode(false);

    const isOnline = onlineRef.current;

    // 1. Prefer a fully downloaded local copy -- it plays the whole video with no network.
    //    A partial cache is deliberately skipped while online: it only covers what was
    //    fetched before the download stopped, so preferring it would pin a 30-minute lesson
    //    to however far it got. Offline it beats an error screen, so it plays there -- and
    //    in the catch below it is also the fallback for a failed session call.
    const localMeta = await getOfflineVideoMeta(blockId);
    if (localMeta && localMeta.localManifestPath) {
      const hasCompleteCopy = isOfflineVideoComplete(localMeta);
      if (hasCompleteCopy || !isOnline) {
        const cleanPath = localMeta.localManifestPath.replace('file://', '');
        const exists = await ReactNativeBlobUtil.fs.exists(cleanPath).catch(() => false);
        if (exists) {
          setManifestUrl(`file://${cleanPath}`);
          if (hasCompleteCopy && localMeta.localSubtitlePath) {
            const cleanSub = localMeta.localSubtitlePath.replace('file://', '');
            const subExists = await ReactNativeBlobUtil.fs.exists(cleanSub).catch(() => false);
            if (subExists) {
              setSubtitleUrl(`file://${cleanSub}`);
            }
          }
          // Only a partial file needs the recorded length -- what's on disk is shorter than
          // the lesson, so the player's own reading of it is wrong by definition. A complete
          // file is the lesson itself: trust whatever it reports over a stored durationSec,
          // which can be stale (e.g. saved from an earlier, still-downloading state) and
          // would otherwise permanently undercut a fully downloaded video's timeline.
          cachedDurationRef.current = hasCompleteCopy ? null : localMeta.durationSec ?? null;
          setIsOfflineMode(true);
          return;
        }
      }
    }

    // Known-offline with nothing usable on disk: fail fast instead of waiting out a
    // request that cannot succeed.
    if (!isOnline) {
      setError(true);
      return;
    }

    // A partial local copy playing while the session request is still in flight beats
    // making the viewer stare at a spinner for the request's full timeout (axios: 15s) --
    // that request only mattered here to prove the app *isn't* actually offline, and a
    // stale NetworkProvider reading (e.g. right after launch, before its first probe lands)
    // was exactly what sent a truly offline viewer down this branch in the first place.
    // Playing the partial copy immediately does not skip the online attempt: it still runs
    // and, on success, replaces this with the full stream via setManifestUrl below.
    let playingPartialFallback = false;
    if (localMeta && localMeta.localManifestPath) {
      const cleanPath = localMeta.localManifestPath.replace('file://', '');
      const exists = await ReactNativeBlobUtil.fs.exists(cleanPath).catch(() => false);
      if (exists) {
        setManifestUrl(`file://${cleanPath}`);
        cachedDurationRef.current = isOfflineVideoComplete(localMeta)
          ? null
          : localMeta.durationSec ?? null;
        setIsOfflineMode(true);
        playingPartialFallback = true;
      }
    }

    try {
      // 2. Otherwise start online playback stream & background progressive caching
      //
      // Caching is kicked off by pressing play (see the play button), not on open. Running it
      // here too would download in the background while the badge still read "Yuklab olish",
      // since startAutoCacheVideo bypasses the store the badge renders from.
      const playback = await apiStartVideoPlayback(blockId);
      setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
      setSubtitleUrl(playback.subtitleUrl);
      setIsOfflineMode(false);
    } catch {
      // The session call failed outright (server hiccup, captive portal, or truly no
      // network). The partial copy set above is already playing if there was one; only a
      // video with nothing at all on disk needs the error screen.
      if (!playingPartialFallback) {
        setError(true);
      }
    }
  }, [blockId]);

  useEffect(() => {
    void loadPlayback();
  }, [loadPlayback]);

  // A video that failed to resolve while offline should come back on its own once
  // connectivity returns, not sit on its retry button until the user notices. A video
  // playing from a partial local copy does not need this: loadPlayback already attempts
  // the online session every time it runs (see the partial-fallback branch above), so once
  // connectivity actually returns the *next* mount or retry picks it up on its own --
  // and NetInfo below fires promptly enough that this effect's job is really just the
  // error case, where nothing is playing yet.
  const wasOfflineRef = useRef(online);
  useEffect(() => {
    const cameBackOnline = online && !wasOfflineRef.current;
    wasOfflineRef.current = online;
    if (cameBackOnline && (error || isOfflineMode)) {
      void loadPlayback();
    }
  }, [online, error, isOfflineMode, loadPlayback]);

  // Robust Subtitle Fetching and Parsing (supports both local file:// and remote URLs)
  useEffect(() => {
    if (!subtitleUrl) {
      setSubtitleCues([]);
      return;
    }

    let cancelled = false;

    if (subtitleUrl.startsWith('file://')) {
      const rawPath = subtitleUrl.replace('file://', '');
      ReactNativeBlobUtil.fs
        .readFile(rawPath, 'utf8')
        .then(text => {
          if (!cancelled) {
            setSubtitleCues(parseSubtitles(text));
          }
        })
        .catch(err => {
          console.warn('Failed to read local subtitle:', err);
          if (!cancelled) setSubtitleCues([]);
        });
      return () => {
        cancelled = true;
      };
    }

    const fullUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `${API_BASE}${subtitleUrl}`;
    const curToken = useAuthStore.getState().token;

    fetch(fullUrl)
      .then(res => {
        if (res.ok) return res.text();
        if (curToken) {
          return fetch(fullUrl, { headers: { Authorization: `Bearer ${curToken}` } }).then(r =>
            r.ok ? r.text() : Promise.reject(new Error('Subtitle error')),
          );
        }
        return Promise.reject(new Error('Subtitle fetch failed'));
      })
      .then(text => {
        if (cancelled) return;
        const cues = parseSubtitles(text);
        setSubtitleCues(cues);
      })
      .catch(err => {
        console.warn('Failed to load subtitles:', err);
        if (!cancelled) setSubtitleCues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [subtitleUrl]);

  /**
   * Begins caching the lesson unless it is already cached or in flight. Reads the store
   * directly rather than the rendered flags so it stays correct when called from inside a
   * state updater, where those flags may be a render behind.
   */
  const cachedDurationRef = useRef<number | null>(null);

  const startDownloadIfNeeded = useCallback(() => {
    // iOS cannot play what the downloader writes (see DOWNLOADS_SUPPORTED), and a download
    // started while known-offline only fails a moment later with a "no network" alert.
    if (!DOWNLOADS_SUPPORTED || !onlineRef.current) {
      return;
    }
    const state = useOfflineVideoStore.getState();
    // A registry entry alone does not mean the video is cached -- a download interrupted at
    // segment 17 of 396 leaves one behind. Skipping on its mere presence stranded those
    // videos: the download never resumed and the badge sat frozen on its progress ring.
    if (
      isOfflineVideoComplete(state.registry[blockId]) ||
      state.activeDownloads[blockId]?.status === 'downloading'
    ) {
      return;
    }

    void startDownload(blockId, {
      title,
      lessonId,
      lessonTitle,
      courseId,
      courseTitle,
      schoolId,
      durationSec: durationRef.current,
    }).then(result => {
      // Success needs no dialog -- the badge switches to its "downloaded" state. Only a
      // failure is worth interrupting for, and a cancellation is not a failure.
      if (!result) {
        const lastErr = useOfflineVideoStore.getState().activeDownloads[blockId]?.errorMessage;
        if (lastErr) {
          Alert.alert('Yuklab bo‘lmadi', lastErr);
        }
      }
    });
  }, [blockId, title, lessonId, lessonTitle, courseId, courseTitle, schoolId, startDownload]);

  // Caching follows PLAYBACK, not the play button. With autoPlay the button is never pressed --
  // the poster tap starts the video directly -- so hanging the download off the button meant a
  // lesson could be watched with nothing saved, and going offline afterwards showed "not
  // cached" despite minutes of viewing.
  const cachingStartedRef = useRef(false);
  useEffect(() => {
    if (paused || cachingStartedRef.current) return;
    cachingStartedRef.current = true;
    startDownloadIfNeeded();
  }, [paused, startDownloadIfNeeded]);

  const handleDownloadPress = useCallback(() => {
    if (!DOWNLOADS_SUPPORTED) return;

    // Tapping a download in flight stops it immediately, the way the badge's stop-square
    // implies. Nothing is lost: the segments already written stay on disk and a later tap
    // resumes from there.
    if (isDownloading) {
      useOfflineVideoStore.getState().cancelDownload(blockId);
      return;
    }

    if (isDownloaded) {
      Alert.alert(
        'Yuklangan video',
        'Ushbu video internetsiz ko‘rish uchun xotirada saqlangan. Xotiradan o‘chirmoqchimisiz?',
        [
          { text: 'Yo‘q', style: 'cancel' },
          {
            text: 'O‘chirish',
            style: 'destructive',
            onPress: () => {
              void removeDownload(blockId);
            },
          },
        ],
      );
      return;
    }

    startDownloadIfNeeded();
  }, [
    isDownloading,
    isDownloaded,
    blockId,
    startDownloadIfNeeded,
    removeDownload,
  ]);

  useEffect(() => {
    let cancelled = false;
    apiGetWatchProgress(blockId)
      .then(data => {
        if (cancelled) return;
        setWatchedSegments(data.segments);
        setWatchedPercent(data.watchedPercent);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [blockId]);

  useEffect(() => {
    watchedSegmentsRef.current = watchedSegments;
  }, [watchedSegments]);

  useEffect(() => {
    if (!watermarkText) return undefined;
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
  }, [watermarkText]);

  const closeCurrentRange = useCallback(() => {
    const range = currentRangeRef.current;
    if (range && range.end > range.start && range.end > lastSavedEndRef.current) {
      const startSec = Math.floor(range.start);
      const endSec = Math.ceil(range.end);
      if (endSec > startSec) {
        // A partially cached copy is only as long as what was downloaded, so its duration
        // says nothing about the real lesson. Reporting it would tell the server a 57-minute
        // video is one minute long.
        const dur =
          !isOfflineMode && durationRef.current && durationRef.current > 0
            ? Math.round(durationRef.current)
            : undefined;
        apiSaveWatchProgress(blockId, startSec, endSec, dur)
          .then(data => {
            setWatchedPercent(data.watchedPercent);
            setWatchedSegments(data.segments);
          })
          .catch(() => { });
        lastSavedEndRef.current = range.end;
      }
    }
  }, [blockId]);

  useEffect(() => {
    durationRef.current = videoDuration;
  }, [videoDuration]);
  useEffect(() => {
    barWidthRef.current = barWidth;
  }, [barWidth]);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (paused) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      return;
    }
    bumpControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [paused, bumpControls]);

  function seekTo(seconds: number) {
    const duration = durationRef.current ?? 0;
    const target = Math.max(0, Math.min(duration || seconds, seconds));
    videoRef.current?.seek(target);
    setCurrentTime(target);
    currentTimeRef.current = target;
    // The player keeps emitting the pre-seek position for a few ticks before it lands on the
    // new one. Without this the bar snaps back to where it was and only jumps forward again
    // seconds later, so progress reports are ignored until one arrives near the target.
    pendingSeekRef.current = target;
    seekStartedAtRef.current = Date.now();
  }

  // The scrub position tracks the finger 1:1 across the bar: tapping anywhere jumps there and
  // dragging follows directly, which is what a touch timeline is expected to do. The grant
  // position is kept so a drag stays anchored to where the finger landed.
  const grantScrubRef = useRef(0);
  const scrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        const at = Math.max(0, Math.min(duration, (e.nativeEvent.locationX / width) * duration));
        grantScrubRef.current = at;
        setIsScrubbing(true);
        setScrubTime(at);
      },
      onPanResponderMove: (_e, gesture) => {
        const duration = durationRef.current ?? 0;
        const width = barWidthRef.current;
        if (!duration || !width) return;
        const delta = (gesture.dx / width) * duration;
        setScrubTime(Math.max(0, Math.min(duration, grantScrubRef.current + delta)));
      },
      onPanResponderRelease: () => {
        setIsScrubbing(false);
        setScrubTime(current => {
          if (current !== null) seekTo(current);
          return null;
        });
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
        setScrubTime(null);
      },
    }),
  ).current;

  function skipBy(deltaSeconds: number) {
    seekTo(currentTimeRef.current + deltaSeconds);
    bumpControls();
  }

  function formatClock(seconds: number) {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function handleLoad(data: OnLoadData) {
    // A partially downloaded video is only as long as the segments on disk -- a 57-minute
    // lesson cached up to 1:04 opens as a 1:04 file. The duration recorded when caching
    // started is the lesson's real length, so it is what the timeline should show.
    const cached = cachedDurationRef.current;
    if (cached && cached > 0) {
      setVideoDuration(cached);
    } else if (!isNaN(data.duration) && isFinite(data.duration)) {
      setVideoDuration(data.duration);
    }
    const resumeAt = resumeTimeRef.current;
    if (resumeAt > 0) {
      videoRef.current?.seek(resumeAt);
      setCurrentTime(resumeAt);
      resumeTimeRef.current = 0;
    }
  }

  function handleProgress(data: OnProgressData) {
    const current = data.currentTime;

    // Drop the stale positions a seek leaves in its wake: the player reports where it still
    // is for a few ticks before it arrives, and honouring those rewinds the bar to the old
    // spot. Once a report lands near the target the seek is considered settled.
    const pendingSeek = pendingSeekRef.current;
    if (pendingSeek !== null) {
      const settled = Math.abs(current - pendingSeek) <= 1.5;
      // Give up waiting after a while so a seek the player silently refused (into an
      // unbuffered stretch, say) cannot freeze the bar for good.
      const timedOut = Date.now() - seekStartedAtRef.current > 4000;
      if (!settled && !timedOut) return;
      pendingSeekRef.current = null;
      lastTimeRef.current = current;
    }

    setCurrentTime(current);
    currentTimeRef.current = current;
    if (typeof data.playableDuration === 'number' && isFinite(data.playableDuration)) {
      setPlayableDuration(data.playableDuration);
    }
    // A gap only means the user seeked if it is bigger than normal playback could produce
    // between two progress ticks. At 2x each tick advances twice as far, so a fixed threshold
    // would read fast playback as a seek and chop the watched range into pieces.
    const jumpThreshold = Math.max(2, playbackRate * 2);
    const jumped = Math.abs(current - lastTimeRef.current) > jumpThreshold;
    lastTimeRef.current = current;

    if (jumped || !currentRangeRef.current) {
      closeCurrentRange();
      currentRangeRef.current = { start: current, end: current };
      lastSavedEndRef.current = 0;
    } else {
      currentRangeRef.current.end = current;
    }

    // The percentage is advisory UI (the progress modal recomputes its own from the
    // segments), and merging the ranges is a sort on every call -- running it on each
    // 500ms tick is pure waste on a low-end phone. Every 2s is plenty for a percent label.
    const inProgress = currentRangeRef.current;
    const liveSegment = { startSec: Math.floor(inProgress.start), endSec: Math.ceil(inProgress.end) };
    if (videoDuration && videoDuration > 0 && Date.now() - lastPercentCalcRef.current >= 2000) {
      lastPercentCalcRef.current = Date.now();
      const totalCovered = computeTotalWatchedSeconds(watchedSegmentsRef.current, liveSegment);
      setWatchedPercent(Math.min(100, Math.round((totalCovered / videoDuration) * 100)));
    }
  }

  useEffect(() => {
    return () => closeCurrentRange();
  }, [closeCurrentRange]);

  // Backgrounding the app does not unmount the player, so a watched range could otherwise
  // sit open for the whole background session before it is ever reported. Close (and thus
  // save) it as the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        closeCurrentRange();
      }
    });
    return () => sub.remove();
  }, [closeCurrentRange]);

  // Active Subtitle Cue
  const activeCue = captionsOn
    ? subtitleCues.find(cue => currentTime >= cue.start && currentTime <= cue.end)
    : null;

  const dynamicPercent =
    videoDuration !== null && videoDuration > 0
      ? Math.min(100, Math.round((computeTotalWatchedSeconds(watchedSegments, null) / videoDuration) * 100))
      : watchedPercent;

  const mediaSurface = (
    <>
      {error ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center p-6 bg-black z-30">
          <Text className="text-xs font-semibold text-white/90 mb-1 text-center">
            Internetga ulanmagansiz
          </Text>
          <Text className="text-[11px] text-white/50 mb-4 text-center">
            Ushbu video hali xotiraga keshlanmagan. Ko‘rish uchun internetni yoqing.
          </Text>
          <Pressable
            onPress={() => void loadPlayback()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 active:opacity-80">
            <Text className="text-xs font-bold text-white">Qayta urinish</Text>
          </Pressable>
        </View>
      ) : !manifestUrl ? (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator color="white" />
        </View>
      ) : (
        <Video
          ref={videoRef}
          source={
            manifestUrl.startsWith('file://')
              ? { uri: manifestUrl }
              : { uri: manifestUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }
          }
          style={StyleSheet.absoluteFill}
          paused={paused}
          rate={playbackRate}
          resizeMode="contain"
          // 250ms re-rendered this (large) component four times a second throughout playback,
          // which costs real smoothness on a low-end phone. 500ms still updates the clock
          // often enough to look continuous, since it only displays whole seconds.
          progressUpdateInterval={500}
          preventsDisplaySleepDuringVideoPlayback
          ignoreSilentSwitch="ignore"
          // Keep audio running when the screen locks or the user switches apps, so a lesson
          // can be listened to like a podcast instead of stopping dead.
          playInBackground
          playWhenInactive
          // Required for playInBackground to survive on iOS, and drives the lock-screen
          // controls Android shows for background audio.
          showNotificationControls
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            // How much must buffer before playback STARTS. 2.5s was tuned for stability, but
            // it is time the student spends staring at a still frame every single time. 1s is
            // enough to begin; minBufferMs still governs how far ahead it keeps reading.
            bufferForPlaybackMs: 1000,
            // After a stall, buffering a little more before resuming avoids stuttering
            // straight back into the same gap.
            bufferForPlaybackAfterRebufferMs: 2500,
          }}
          onBuffer={({ isBuffering: buffering }) => setIsBuffering(buffering)}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onError={() => {
            if (isOfflineMode) {
              // Try online fallback if network allows
              setIsOfflineMode(false);
              apiStartVideoPlayback(blockId)
                .then(playback => {
                  setManifestUrl(`${API_BASE}${playback.manifestUrl}`);
                  setSubtitleUrl(playback.subtitleUrl);
                })
                .catch(() => setError(true));
            } else {
              setError(true);
            }
          }}
          onEnd={() => {
            closeCurrentRange();
            setPaused(true);
          }}
        />
      )}

      {/* Smooth buffering spinner */}
      {isBuffering && !paused ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
          <ActivityIndicator color="white" size="small" />
        </View>
      ) : null}

      {/* Watermark, always rendered above every other layer (zIndex 30 beats the controls'
          25): one that vanishes whenever controls appear is trivially dodged by keeping a
          thumb on the screen. Its position zones sit clear of the button rows, so it reads
          as deliberate rather than as a glitch. */}
      {watermarkText ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${renderedMarkPosition.left}%`,
            top: `${renderedMarkPosition.top}%`,
            opacity: markVisible ? 1 : 0,
            zIndex: 30,
          }}>
          <Text className="text-[10px] font-bold tracking-wide text-white/70 shadow-sm">{watermarkText}</Text>
        </View>
      ) : null}

      {/* Custom Native-Style Subtitle Overlay */}
      {captionsOn && activeCue ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: controlsVisible
              ? (isFullscreen ? Math.max(75, insets.bottom + 65) : 44)
              : (isFullscreen ? Math.max(25, insets.bottom + 12) : 6),
            left: isFullscreen ? Math.max(24, insets.left + 16) : 12,
            right: isFullscreen ? Math.max(24, insets.right + 16) : 12,
            alignItems: 'center',
            zIndex: 25,
          }}>
          <View className="rounded-md bg-black/80 px-2.5 py-1 shadow-md border border-white/10">
            <Text className="text-center text-[11px] sm:text-[13px] font-medium text-white leading-4">
              {activeCue.text}
            </Text>
          </View>
        </View>
      ) : null}

      {manifestUrl && !error ? (
        <>
          {/* Tap anywhere to reveal the controls (or hide them again). */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (controlsVisible ? setControlsVisible(false) : bumpControls())}
          />

          {/* Offline-download badge, top left. Deliberately outside the controlsVisible
              block: a download runs for minutes and its progress should stay readable while
              the video plays, not vanish with the controls. Android only -- iOS cannot play
              what the downloader writes, so a badge there would just sell dead storage. */}
          {DOWNLOADS_SUPPORTED ? (
          <View
            style={{
              position: 'absolute',
              top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
              left: isFullscreen ? Math.max(20, insets.left + 12) : 12,
              zIndex: 25,
            }}>
            <Pressable
              onPress={handleDownloadPress}
              className="flex-row items-center gap-2 rounded-2xl bg-black/60 px-2.5 py-2 active:opacity-80">
              {isDownloading ? (
                <View className="h-7 w-7 items-center justify-center">
                  {/* Ring of progress with a stop square inside, so one tap-target both
                      reports state and cancels. */}
                  <Svg width={28} height={28} style={{position: 'absolute'}}>
                    <Circle
                      cx={14}
                      cy={14}
                      r={12}
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth={2}
                      fill="none"
                    />
                    <Circle
                      cx={14}
                      cy={14}
                      r={12}
                      stroke="#fff"
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 12}
                      strokeDashoffset={2 * Math.PI * 12 * (1 - downloadProgress / 100)}
                      transform="rotate(-90 14 14)"
                    />
                  </Svg>
                  <View className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                </View>
              ) : isDownloaded ? (
                <Check size={20} color="#fff" />
              ) : (
                <DownloadCloud size={20} color="#fff" />
              )}

              <Text className="text-xs font-semibold text-white">
                {isDownloading
                  ? estimatedBytes > 0
                    ? `${formatMegabytes(downloadedBytes)} / ${formatMegabytes(estimatedBytes)}`
                    : `${downloadProgress}%`
                  : isDownloaded
                    ? (downloadedSizeLabel ?? 'Yuklangan')
                    : 'Yuklab olish'}
              </Text>
            </Pressable>
          </View>
          ) : null}

          {/* Buffering (e.g. right after a play press, before the first frame lands) shows only
              the spinner above -- surfacing play/pause/the timeline over a still-black video
              reads as broken controls for a video that isn't there yet. */}
          {controlsVisible && !(isBuffering && !paused) ? (
            <>
              {/* Scrim behind the controls: white text and a white thumb disappear over bright
                  footage (a scanned page, a slide). A smooth SVG gradient does this without the
                  banding that stacked opaque views produce. */}
              <Svg
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, zIndex: 5 }}
                width="100%"
                height="100%">
                <Defs>
                  <SvgLinearGradient id="playerScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000" stopOpacity="0.45" />
                    <Stop offset="0.28" stopColor="#000" stopOpacity="0.18" />
                    <Stop offset="0.62" stopColor="#000" stopOpacity="0.22" />
                    <Stop offset="1" stopColor="#000" stopOpacity="0.72" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#playerScrim)" />
              </Svg>

              {/* Top Right Action Bar */}
              <View
                style={{
                  position: 'absolute',
                  top: isFullscreen ? Math.max(16, insets.top + 8) : 12,
                  right: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  zIndex: 20,
                }}>
                {/* Fullscreen Button */}
                <Pressable
                  onPress={() => {
                    resumeTimeRef.current = currentTimeRef.current;
                    // Only the fullscreen flag flips here -- activeBlockId stays set, since
                    // clearing it would unmount this very player (CourseScreen only renders
                    // HlsVideoPlayer while its block is active) and stop playback dead.
                    setIsFullscreen(!isFullscreen);
                  }}
                  className="h-8 w-8 items-center justify-center rounded-lg bg-black/75">
                  {isFullscreen ? <Minimize2 size={16} color="white" /> : <Maximize2 size={16} color="white" />}
                </Pressable>
              </View>

              <View className="absolute inset-0 z-10 flex-row items-center justify-center gap-8">
                <Pressable
                  onPress={() => skipBy(-10)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/75">
                  <RotateCcw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">10</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const wasPaused = paused;
                    setPaused(!wasPaused);
                    bumpControls();
                  }}
                  className="h-14 w-14 items-center justify-center rounded-full bg-black/80">
                  {paused ? (
                    <Play size={26} color="white" fill="white" />
                  ) : (
                    <Pause size={26} color="white" fill="white" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => skipBy(10)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/75">
                  <RotateCw size={20} color="white" />
                  <Text className="absolute text-[8px] font-bold text-white">10</Text>
                </Pressable>
              </View>

              {/* Compact Bottom Timeline Bar */}
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingLeft: isFullscreen ? Math.max(20, insets.left + 12) : 12,
                  paddingRight: isFullscreen ? Math.max(20, insets.right + 12) : 12,
                  paddingBottom: isFullscreen ? Math.max(16, insets.bottom + 8) : 12,
                  paddingTop: 8,
                  zIndex: 20,
                }}>
                {/* Buttons sit on their own row above the clock so they cannot collide with
                    the timestamps in a short player, where everything is cramped vertically.
                    Not font-mono for the clock: the monospace face renders thin and washed
                    out on Android and barely responds to a bold weight. */}
                <View className="mb-1 flex-row items-center justify-end gap-2 pr-0.5">
                  {/* Playback speed: cycles through the usual lesson-watching rates. */}
                  <Pressable
                    onPress={() => {
                      setPlaybackRate(current => {
                        const next = PLAYBACK_RATES[
                          (PLAYBACK_RATES.indexOf(current) + 1) % PLAYBACK_RATES.length
                        ];
                        return next;
                      });
                      bumpControls();
                    }}
                    className={`h-7 items-center justify-center rounded-md px-2 ${playbackRate === 1 ? 'bg-black/70' : 'bg-indigo-600'
                      }`}>
                    <Text className="text-[11px] font-bold text-white">{playbackRate}x</Text>
                  </Pressable>

                  {/* Subtitle Icon Button */}
                  {subtitleUrl ? (
                    <Pressable
                      onPress={() => setCaptionsOn(v => !v)}
                      className={`h-7 w-7 items-center justify-center rounded-md ${captionsOn ? 'bg-indigo-600' : 'bg-black/70'
                        }`}>
                      <Captions size={14} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>

                <View className="flex-row items-center justify-between pr-0.5">
                  <Text
                    className="text-sm font-bold text-white"
                    style={{ fontVariant: ['tabular-nums'] }}>
                    {formatClock(scrubTime ?? currentTime)}
                  </Text>
                  <Text
                    className="text-sm font-bold text-white/85"
                    style={{ fontVariant: ['tabular-nums'] }}>
                    {formatClock(videoDuration ?? 0)}
                  </Text>
                </View>

                {/* Timeline: a thick, easy-to-hit bar with three stacked layers -- the dim
                    track, the lighter buffered-ahead portion, and the played portion. The
                    touch target is taller than the bar itself so the thumb stays grabbable. */}
                <View
                  className="justify-center"
                  style={{ height: 28 }}
                  onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
                  {...scrubResponder.panHandlers}>
                  {/* The unplayed track is darkened rather than lightened so the bar reads as
                      a groove over bright footage instead of vanishing into it. */}
                  <View
                    className="w-full overflow-hidden rounded-full"
                    style={{ height: isScrubbing ? 8 : 6, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                    <View
                      className="absolute left-0 top-0 h-full rounded-full bg-white/50"
                      style={{
                        width: videoDuration
                          ? `${Math.min(100, (playableDuration / videoDuration) * 100)}%`
                          : '0%',
                      }}
                    />
                    <View
                      className="absolute left-0 top-0 h-full rounded-full bg-white"
                      style={{
                        width: videoDuration
                          ? `${Math.min(100, ((scrubTime ?? currentTime) / videoDuration) * 100)}%`
                          : '0%',
                      }}
                    />
                  </View>
                  <View
                    pointerEvents="none"
                    className="absolute rounded-full bg-white"
                    style={{
                      height: isScrubbing ? 18 : 14,
                      width: isScrubbing ? 18 : 14,
                      // A dark ring keeps the white thumb visible against white footage,
                      // where a shadow alone washes out.
                      borderWidth: 1.5,
                      borderColor: 'rgba(0,0,0,0.45)',
                      shadowColor: '#000',
                      shadowOpacity: 0.45,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 4,
                      left: videoDuration
                        ? Math.max(
                          0,
                          Math.min(
                            barWidth - (isScrubbing ? 18 : 14),
                            ((scrubTime ?? currentTime) / videoDuration) * barWidth -
                            (isScrubbing ? 9 : 7),
                          ),
                        )
                        : 0,
                    }}
                  />
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  // Drives the container's position/size across three states: sitting on the placeholder,
  // animating to/from fullscreen, and the one frame before the placeholder's first layout
  // lands (opacity 0 avoids a flash at (0,0) instead of guessing a position).
  const rectX = useSharedValue(rect?.x ?? 0);
  const rectY = useSharedValue(rect?.y ?? 0);
  const rectWidth = useSharedValue(rect?.width ?? 0);
  const rectHeight = useSharedValue(rect?.height ?? 0);
  const mountOpacity = useSharedValue(rect ? 1 : 0);
  const progressTop = useSharedValue((rect?.y ?? 0) + (rect?.height ?? 0));

  useEffect(() => {
    if (isFullscreen) {
      rectX.value = withTiming(0, { duration: 220 });
      rectY.value = withTiming(0, { duration: 220 });
      rectWidth.value = withTiming(windowWidth, { duration: 220 });
      rectHeight.value = withTiming(windowHeight, { duration: 220 });
      mountOpacity.value = withTiming(1, { duration: 120 });
      return;
    }
    if (!rect) return;
    rectX.value = withTiming(rect.x, { duration: 220 });
    rectY.value = withTiming(rect.y, { duration: 220 });
    rectWidth.value = withTiming(rect.width, { duration: 220 });
    rectHeight.value = withTiming(rect.height, { duration: 220 });
    mountOpacity.value = withTiming(1, { duration: 120 });
    progressTop.value = withTiming(rect.y + rect.height, { duration: 220 });
  }, [isFullscreen, rect, windowWidth, windowHeight, rectX, rectY, rectWidth, rectHeight, mountOpacity, progressTop]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: rectX.value,
    top: rectY.value,
    width: rectWidth.value,
    height: rectHeight.value,
    opacity: mountOpacity.value,
    backgroundColor: 'black',
    borderRadius: isFullscreen ? 0 : 16,
    overflow: 'hidden',
    zIndex: 50,
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: rect?.x ?? 0,
    top: progressTop.value,
    width: rect?.width ?? 0,
    opacity: isFullscreen || !rect ? 0 : 1,
  }));

  return (
    <>
      <Animated.View ref={wrapperRef} style={animatedContainerStyle}>
        {mediaSurface}
        {(error || !manifestUrl) && isFullscreen && (
          <Pressable
            onPress={() => {
              setIsFullscreen(false);
              setActiveBlockId(null);
            }}
            style={{
              position: 'absolute',
              top: Math.max(16, insets.top + 8),
              right: Math.max(20, insets.right + 12),
              zIndex: 60,
            }}
            className="h-9 w-9 items-center justify-center rounded-full bg-black/70 border border-white/20">
            <Minimize2 size={18} color="white" />
          </Pressable>
        )}
      </Animated.View>
      {!isFullscreen && rect && videoDuration !== null && videoDuration > 0 && (
        <Animated.View style={[animatedProgressStyle, { marginTop: 8 }]} pointerEvents="box-none">
          <Pressable onPress={() => setProgressOpen(v => !v)} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                Mening video ko'rishim
              </Text>
              {progressOpen ? (
                <ChevronUp size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              ) : (
                <ChevronDown size={14} color={isDark ? '#a4a7b2' : '#64748b'} />
              )}
            </View>
            {dynamicPercent !== null && (
              <Text className="text-xs font-medium text-slate-500 dark:text-dark-muted">
                {dynamicPercent}% ko'rilgan
              </Text>
            )}
          </Pressable>
          {progressOpen && (
            <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-dark-surface-2">
              {watchedSegments.map(seg => (
                <View
                  key={`${seg.startSec}-${seg.endSec}`}
                  className="absolute h-full rounded-full bg-brand"
                  style={{
                    left: `${Math.min(100, Math.max(0, (seg.startSec / videoDuration) * 100))}%`,
                    width: `${Math.min(100, Math.max(1, ((seg.endSec - seg.startSec) / videoDuration) * 100))}%`,
                  }}
                />
              ))}
            </View>
          )}
        </Animated.View>
      )}
    </>
  );
}
